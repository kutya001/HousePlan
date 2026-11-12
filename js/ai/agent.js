/**
 * Ход ИИ-помощника по шагам.
 *
 * Claude может вызвать инструменты несколько раз подряд: большая задача делится на шаги
 * (каркас дома → проёмы → мебель по этажам…), каждый шаг применяется и возвращается
 * Claude вместе с обновлённым JSON — и ни один ответ не упирается в предел длины.
 * Если ответ всё же оборвался или правка не легла, ошибка уходит обратно Claude:
 * он повторяет шаг меньшей порцией или исправляет адрес.
 *
 * Память разговора не растёт от шага к шагу: актуальный JSON проекта хранится в запросе
 * один раз — в ответе на последний шаг, прежние копии заменяются короткой пометкой.
 * id элементов между шагами сохраняются (toExchange({ keep })), поэтому Claude может
 * ссылаться на стены и комнаты, созданные раньше. Модуль без DOM.
 */
import { toExchange } from '../io/exchange.js';
import { streamMessage, ApiError } from './claudeClient.js';
import { TOOLS, EFFORTS, MAX_TOKENS, buildSystem, buildMessages, projectFromTool, replayBlocks } from './assistant.js';
import { checkScope, trimToScope, growScope, retarget } from './scope.js';

/** Сколько шагов (успешных вызовов инструментов) может занять один запрос пользователя. */
export const MAX_STEPS = 16;
/** Сколько ошибок подряд прощаем, прежде чем остановиться. */
const MAX_ERRORS = 3;

const STOP_TEXT = {
  refusal: 'Claude отказался выполнять этот запрос. Переформулируйте его или выберите другую модель в настройках ИИ.',
  model_context_window_exceeded: 'Разговор и проект не помещаются в память модели — начните новый разговор («+» вверху вкладки) или дайте задание по одному этажу: правый клик на плане → «Запрос ИИ…».',
};

const CUT_HINT =
  'Ответ оборвался: вызов инструмента не поместился в предел длины ответа, и шаг НЕ применён. Раздели работу на части и вызови инструмент с меньшей порцией: один этаж или одна группа элементов за раз (сначала стены и комнаты, потом проёмы, потом мебель по комнатам; не больше ~60 правок или ~150 элементов за вызов). Остальное сделаешь следующими вызовами.';

const STALE = (n) => `Шаг ${n} применён. (JSON этого шага убран из разговора: актуальный проект — в ответе на последний шаг.)`;

/** Предел длины ответа, который приняла модель (у прежних он меньше) — чтобы не спрашивать каждый раз. */
const modelLimit = new Map();

function addUsage(total, u = {}) {
  total.input += u.input_tokens || 0;
  total.output += u.output_tokens || 0;
  total.cacheRead += u.cache_read_input_tokens || 0;
  total.cacheWrite += u.cache_creation_input_tokens || 0;
}

/**
 * Точки кэша запроса: всё, что уже не изменится, следующий шаг читает из кэша за десятую часть цены.
 *  — конец последнего ответа модели (он остаётся в разговоре как есть);
 *  — конец последнего сообщения пользователя, если это не JSON шага (тот на следующем шаге будет убран).
 * @param volatile — номер сообщения с актуальным JSON шага (его не кэшируем) или -1
 */
function withCachePoints(messages, volatile) {
  const out = messages.map((m) => ({ ...m, content: m.content.map((b) => (b.cache_control ? (({ cache_control: _c, ...rest }) => rest)(b) : b)) }));
  const mark = (m, pick) => {
    for (let i = m.content.length - 1; i >= 0; i--) {
      if (!pick(m.content[i])) continue;
      m.content[i] = { ...m.content[i], cache_control: { type: 'ephemeral' } };
      return;
    }
  };
  const lastUser = out.length - 1;
  if (out[lastUser]?.role === 'user' && lastUser !== volatile) mark(out[lastUser], () => true);
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role !== 'assistant') continue;
    mark(out[i], (b) => b.type === 'tool_use' || (b.type === 'text' && b.text));
    break;
  }
  return out;
}

/**
 * @param opts {
 *   key, workspace, model, effort, history, text, images,
 *   snapshot — snapshotProject(): { exchange, context, scope? },
 *   onProgress — события потока и хода: { type: 'step', n, summary, tool }, { type: 'retry', attempt, error, cut },
 *   onStep — async ({ project, summary, tool, n, warnings, target }) → false, чтобы остановиться.
 *            Здесь шаг применяется к проекту; target — область задания в новом проекте (или null),
 *   signal, fetchImpl, retryDelays, maxSteps
 * }
 * @returns {{ text, steps: [{ tool, summary, changes, warnings }], project?, target?, usage, requests, stopped? }}
 *          Ошибки несут usage, text и steps — часть шагов могла быть уже применена.
 */
export async function runTurn({ key, workspace = '', model, effort = '', history = [], text, images = [], snapshot, signal, onProgress, onStep, fetchImpl, retryDelays, maxSteps = MAX_STEPS }) {
  const system = buildSystem();
  const scope = snapshot.scope || null;
  const messages = buildMessages({ history, text, images, context: snapshot.context });
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const texts = [];
  const steps = [];
  let work = snapshot.exchange; // JSON, к которому относятся следующие правки
  let project = null;
  let target = null;
  let errors = 0;
  let requests = 0;
  let volatile = -1; // сообщение с актуальным JSON шага
  let maxTokens = modelLimit.get(model) || MAX_TOKENS;
  let useEffort = !!EFFORTS[effort];

  const send = () =>
    streamMessage({
      key,
      workspace,
      body: { model, max_tokens: maxTokens, system, tools: TOOLS, messages: withCachePoints(messages, volatile), ...(useEffort ? { output_config: { effort } } : {}) },
      signal,
      onProgress,
      fetchImpl,
      retryDelays,
    });
  // Запрос, который модель не принимает из-за необязательных параметров, повторяем без них:
  // у прежних моделей меньше предел ответа и нет настройки усилия.
  const request = async () => {
    for (let fix = 0; ; fix++) {
      try {
        requests++;
        return await send();
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 400 || fix >= 2) throw err;
        if (/max_tokens/i.test(err.message) && maxTokens > 8192) {
          // «max_tokens: 128000 > 64000, which is the maximum…» — берём предел модели из текста ошибки
          const limits = (err.message.match(/\d{4,6}/g) || []).map(Number).filter((n) => n < maxTokens);
          maxTokens = Math.max(4096, limits.length ? Math.min(...limits) : 8192);
          modelLimit.set(model, maxTokens);
        } else if (useEffort && /effort|output_config/i.test(err.message)) {
          useEffort = false;
        } else throw err;
      }
    }
  };
  const info = (e) => Object.assign(e, { usage, text: e.text ?? texts.join('\n\n'), steps });
  const fail = (message) => info(new Error(message));
  const done = (extra = {}) => ({ text: texts.join('\n\n'), steps, usage, requests, ...(project ? { project } : {}), ...(target ? { target } : {}), ...extra });

  for (;;) {
    let msg;
    try {
      msg = await request();
    } catch (err) {
      throw info(err);
    }
    addUsage(usage, msg.usage);
    const reply = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (reply) texts.push(reply);
    const tools = msg.content.filter((b) => b.type === 'tool_use');
    const tool = tools[0];
    const cut = msg.stop_reason === 'max_tokens';

    if (!tool) {
      if (STOP_TEXT[msg.stop_reason]) throw fail(STOP_TEXT[msg.stop_reason]);
      if (cut && !reply && !steps.length) throw fail('Ответ не поместился в предел длины — попросите сделать по частям (например, сначала первый этаж).');
      if (cut) texts.push('(ответ оборвался по длине)');
      return done();
    }

    // ── шаг: применить вызов инструмента ──
    let result;
    let isError = false;
    let applied = false;
    try {
      if (tool.inputError) throw new Error(cut ? CUT_HINT : tool.inputError);
      if (scope && tool.name === 'build_project') throw new Error('в режиме области доступен только edit_project: меняй только элементы из области задания');
      const res = projectFromTool(tool, work, scope ? (before, after) => checkScope(before, after, scope) : null);
      if (res.project) {
        errors = 0;
        const idMap = new Map();
        const next = toExchange(res.project, { ids: true, keep: res.sourceIds, idMap });
        if (scope) {
          growScope(scope, work, next);
          target = retarget(scope, res.project, idMap);
        }
        project = res.project;
        work = next;
        applied = true;
        steps.push({ tool: tool.name, summary: res.summary, changes: res.changes, warnings: res.warnings.length });
        onProgress?.({ type: 'step', n: steps.length, summary: res.summary, tool: tool.name });
        const go = await onStep?.({ project, summary: res.summary, tool: tool.name, n: steps.length, warnings: res.warnings, target });
        if (go === false) return done({ stopped: true });
        const json = JSON.stringify(scope ? trimToScope(work, scope) : work);
        const fixes = res.warnings.length ? ` Программа поправила при импорте: ${res.warnings.slice(0, 6).join('; ')}.` : '';
        result = `Шаг ${steps.length} применён.${fixes} Актуальный JSON проекта (id прежних элементов сохранены, новые получили id) — дальнейшие правки относятся к нему:\n${json}\n\nЕсли задача выполнена целиком — ответь пользователю коротким итогом без инструмента. Если остались шаги — вызови инструмент для следующего.`;
      } else {
        if (++errors > MAX_ERRORS) return done(); // пустые вызовы подряд — заканчиваем ход
        result = 'Правок нет — проект не изменился. Если задача выполнена, ответь пользователю текстом без инструмента.';
      }
    } catch (err) {
      if (applied) throw info(err); // сбой при применении шага к проекту — не вина Claude
      isError = true;
      errors++;
      const cutTool = cut && !!tool.inputError;
      if (errors > MAX_ERRORS) throw fail(cutTool ? 'Ответ не помещается в предел длины даже по частям — дайте задание поменьше (один этаж или комнату).' : `Правки не применились: ${err.message}`);
      onProgress?.({ type: 'retry', attempt: errors, error: err.message, cut: cutTool });
      result = cutTool ? err.message : `Не получилось применить: ${err.message}. Исправь и вызови инструмент снова (правки — к последнему присланному JSON; проект не изменился).`;
    }
    if (applied && steps.length >= maxSteps) {
      return done({ stopped: true, text: [...texts, `Остановился после ${steps.length} шагов — напишите «продолжай», если нужно доделать.`].join('\n\n') });
    }

    // прежний JSON шага больше не нужен: остаётся короткая пометка
    if (applied && volatile >= 0) {
      const old = messages[volatile];
      messages[volatile] = { ...old, content: old.content.map((b, i) => (i === 0 ? { type: 'tool_result', tool_use_id: b.tool_use_id, content: STALE(steps.length - 1) } : b)) };
    }
    // продолжение того же хода: ответ модели целиком (с размышлениями) + только tool_result
    messages.push(
      { role: 'assistant', content: replayBlocks(msg.content) },
      {
        role: 'user',
        content: tools.map((t, i) => ({
          type: 'tool_result',
          tool_use_id: t.id,
          ...(i === 0 ? (isError ? { is_error: true } : {}) : { is_error: true }),
          content: i === 0 ? result : 'Пропущено: вызывай один инструмент за ответ.',
        })),
      },
    );
    if (applied) volatile = messages.length - 1;
  }
}
