/**
 * ИИ-помощник: что отправить Claude и как превратить ответ в проект.
 *
 * Каждый запрос несёт актуальный проект (JSON «houseplan-ai» с id элементов),
 * активный этаж, выделение и замечания проверки. Claude отвечает текстом
 * и/или вызывает один из инструментов:
 *   edit_project  — список правок JSON Patch к присланному JSON (точечные правки);
 *   build_project — проект целиком (новый дом или большая переделка).
 * Результат проходит тот же импорт, что и «Импорт ответа ИИ»: починка стыков,
 * проверка проёмов, нормализация. Если правки не применились — ошибка уходит
 * обратно Claude (tool_result), и он исправляется сам (до двух раз).
 * Модуль без DOM — его проверяют юнит-тесты.
 */
import { formatRules, EXAMPLE } from '../io/aiPrompt.js';
import { toExchange, importProject, extractJson, summarize } from '../io/exchange.js';
import { applyPatch } from './jsonPatch.js';
import { streamMessage, ApiError } from './claudeClient.js';
import { SITE_LEVEL, getLevel } from '../model/project.js';

// размышление модели тоже расходует этот лимит — берём с запасом
export const MAX_TOKENS = 64000;
const HISTORY_TURNS = 12;

export const TOOLS = [
  {
    name: 'edit_project',
    description:
      'Изменить ТЕКУЩИЙ проект точечными правками: JSON Patch (RFC 6902) к присланному JSON «houseplan-ai». Для любых правок существующего дома: добавить, сдвинуть, удалить стены, окна, двери, комнаты, мебель, лестницы; поменять размеры, материалы, крышу, этажи, участок. Всё, чего правки не касаются, остаётся как было.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Что сделано — 1–2 коротких предложения для пользователя на его языке' },
        patch: {
          type: 'array',
          description: 'Правки по порядку. path — JSON Pointer; элементы списков — по id (например "/levels/0/furniture/f3/x") или номеру; "-" — в конец списка (только add).',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy'] },
              path: { type: 'string' },
              from: { type: 'string', description: 'Откуда — для move и copy' },
              value: { description: 'Новое значение — для add и replace' },
            },
            required: ['op', 'path'],
          },
        },
      },
      required: ['summary', 'patch'],
    },
  },
  {
    name: 'build_project',
    description:
      'Построить проект ЦЕЛИКОМ в формате «houseplan-ai»: новый дом с нуля (текущий проект пуст или пользователь просит новый дом) или переделка большей части дома. Текущий проект будет заменён (пользователь может отменить).',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Что построено — 1–2 коротких предложения для пользователя на его языке' },
        project: { type: 'object', description: 'Полный проект: { format: "houseplan-ai", version: 1, name, units: "m", foundation, site, levels, outdoor, zones }' },
      },
      required: ['summary', 'project'],
    },
  },
];

/** Системный промпт: роль, порядок работы, правила правок и формата. Кэшируется API. */
export function buildSystem() {
  const guide = `Ты — ИИ-помощник архитектора внутри HousePlan, программы для планировки частных домов (2D-план, 3D-модель, участок). Пользователь пишет запросы обычными словами. Отвечай на языке пользователя (обычно по-русски), коротко и по делу, без Markdown-таблиц.

КАК РАБОТАТЬ
- В каждом сообщении пользователя — ТЕКУЩИЙ ПРОЕКТ в JSON «houseplan-ai» (или пометка, что он пуст), активный этаж, выделенные на плане элементы и замечания автоматической проверки. Это актуальное состояние: между сообщениями пользователь мог править план руками. Прежние версии проекта не используй.
- Чтобы что-то построить или изменить, ОБЯЗАТЕЛЬНО вызови инструмент — сам текст ответа план не меняет:
  • edit_project — правки существующего дома: меняй только то, о чём просят, остальное оставь как есть;
  • build_project — новый дом с нуля (проект пуст или просят «новый дом», «другой вариант с нуля») или переделка большей части дома.
- Перед вызовом инструмента напиши 1–2 коротких предложения, что сделаешь и какие размеры выбрал сам. Вызывай один инструмент за ответ.
- Вопрос о проекте («какая площадь кухни?», «поместится ли бильярд?») — ответь текстом по данным JSON, без инструмента.
- Уточняй, только если без ответа совсем не понять, что строить (1–2 вопроса). Иначе выбирай разумные значения сам.
- «Здесь», «на этом этаже» — активный этаж; «это», «его», «выделенное» — выделенные элементы.
- Фото или эскиз плана: перенеси размеры, расположение комнат, окон, дверей и лестниц; чего не видно — додумай разумно и скажи об этом.
- После применения программа сама проверит проект и покажет замечания. Просят исправить замечания — исправь их через edit_project, не ломая остального.
- Пиши размеры так, как их поймёт человек: «гостиная 5×6 м», а не координатами.

ПРАВКИ (edit_project)
- patch — JSON Patch к присланному JSON: { "op": "add" | "remove" | "replace" | "move" | "copy", "path": "...", "value": … }.
- path — JSON Pointer. Элементы списков адресуй по их id из присланного JSON: стены w1…, проёмы o1…, комнаты r1…, лестницы s1…, мебель f1…, крыши k1…, объекты участка g1…, зоны z1… Этажи — по номеру в levels (0 — самый нижний). Примеры: "/levels/0/rooms/r3/floor", "/levels/1/furniture/f12", "/site/boundary".
- Добавить в конец списка: {"op":"add","path":"/levels/0/furniture/-","value":{"type":"sofa","x":1.2,"y":-2,"rotation":0}}. Новым стенам давай id, не занятые на этом этаже ("w30", "w31"), и ссылайся на них в проёмах (wall). id новых проёмов, комнат и мебели можно не указывать.
- Проём привязан к стене (wall) и offset — расстоянию от её начала (from) до центра проёма. Двигаешь, укорачиваешь или удаляешь стену — поправь её проёмы, комнаты (points) и примыкающие перегородки; проёмы удалённой стены удалятся сами.
- Перенос комнаты или перегородки — это правка координат стен (from/to), проёмов (offset) и многоугольников комнат (points) вместе.
- Новый этаж: add в "/levels/-" (или в нужное место списка) целиком — с наружными стенами, комнатами, проёмами; лестницу на него поставь на этаже ниже.
- Значения — в метрах, как в JSON. Каждая правка должна что-то менять.

${formatRules()}

ПРИМЕР проекта (одноэтажный дом 8×6: гостиная, спальня, санузел, двускатная крыша):
${JSON.stringify(EXAMPLE)}`;
  return [{ type: 'text', text: guide, cache_control: { type: 'ephemeral' } }];
}

const KIND_RU = { wall: 'стена', opening: 'проём', room: 'комната', stair: 'лестница', item: 'предмет', roof: 'крыша', zone: 'зона участка' };

const LEVEL_WORD = { error: 'ошибка', warn: 'замечание' };

/** Замечания проверки — коротким списком для Claude. */
export function issuesText(project, issues, limit = 20) {
  if (!issues?.length) return 'ошибок и замечаний нет';
  const lines = issues.slice(0, limit).map((i) => {
    const lvl = i.levelId === SITE_LEVEL ? 'участок' : getLevel(project, i.levelId)?.name || '';
    return `- [${LEVEL_WORD[i.level] || i.level}]${lvl ? ` ${lvl}:` : ''} ${i.title}${i.text ? ` — ${i.text}` : ''}`;
  });
  if (issues.length > limit) lines.push(`- …и ещё ${issues.length - limit}`);
  return lines.join('\n');
}

/**
 * Снимок проекта для запроса: JSON с id и подписи активного этажа и выделения.
 * @returns {{ exchange, json, context }}
 */
export function snapshotProject(project, { activeLevelId = null, selection = [], issues = [] } = {}) {
  const idMap = new Map();
  const exchange = toExchange(project, { ids: true, idMap });
  const json = JSON.stringify(exchange);
  const empty = !project.walls.length;
  const li = project.levels.findIndex((l) => l.id === activeLevelId);
  const sel = selection
    .map((s) => {
      const ref = idMap.get(s.id);
      if (!ref) return null;
      const where = ref.level === 'site' ? 'участок' : `levels/${ref.level}`;
      return `${ref.id} (${where}, ${KIND_RU[s.kind] || s.kind})`;
    })
    .filter(Boolean);
  const context = [
    empty ? 'ТЕКУЩИЙ ПРОЕКТ: пуст — стен нет. Чтобы построить дом, вызови build_project.' : `ТЕКУЩИЙ ПРОЕКТ (формат houseplan-ai, с id элементов для правок):\n${json}`,
    li >= 0 && !empty ? `АКТИВНЫЙ ЭТАЖ: levels/${li} «${project.levels[li].name}»` : '',
    sel.length ? `ВЫДЕЛЕНО НА ПЛАНЕ: ${sel.join(', ')}` : '',
    empty ? '' : `ПРОВЕРКА ПРОЕКТА:\n${issuesText(project, issues)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { exchange, json, context, empty };
}

/**
 * Сообщения для API: прошлые реплики — только текстом (без старых JSON),
 * последняя — фото, снимок проекта и запрос.
 * @param history [{ role, text, applied?, error? }]
 * @param images [{ mediaType, data }] — base64 без префикса
 */
export function buildMessages({ history = [], text, images = [], context }) {
  const msgs = [];
  const push = (role, t) => {
    if (!t) return;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content[0].text += `\n\n${t}`;
    else msgs.push({ role, content: [{ type: 'text', text: t }] });
  };
  for (const m of history.slice(-HISTORY_TURNS * 2)) {
    if (m.role === 'user') push('user', `${m.text}${m.images ? '\n[было приложено изображение]' : ''}`);
    else push('assistant', [m.text, m.applied ? `[Применено к проекту: ${m.applied}]` : '', m.error ? `[Не применилось: ${m.error}]` : ''].filter(Boolean).join('\n'));
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const content = [
    ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })),
    { type: 'text', text: `${context}\n\nЗАПРОС ПОЛЬЗОВАТЕЛЯ:\n${text}` },
  ];
  const last = msgs[msgs.length - 1];
  if (last && last.role === 'user') last.content.push(...content);
  else msgs.push({ role: 'user', content });
  return msgs;
}

/** JSON-значение, которое модель могла прислать строкой. */
function asJson(v, what) {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    try {
      return extractJson(v);
    } catch {
      throw new Error(`${what} — не JSON`);
    }
  }
}

/**
 * Вызов инструмента → новый проект.
 * @param tool { name, input }
 * @param baseExchange — JSON, который видел Claude (к нему относятся правки)
 * @returns {{ project|null, warnings, summary, changes }} project = null — правок нет
 */
export function projectFromTool(tool, baseExchange) {
  const input = tool.input || {};
  const summary = String(input.summary || '').trim();
  let data;
  let changes = 0;
  if (tool.name === 'edit_project') {
    const patch = asJson(input.patch, 'patch');
    if (!Array.isArray(patch)) throw new Error('patch должен быть списком правок');
    if (!patch.length) return { project: null, warnings: [], summary, changes: 0 };
    data = applyPatch(baseExchange, patch);
    changes = patch.length;
  } else if (tool.name === 'build_project') {
    data = asJson(input.project, 'project');
    if (!data || typeof data !== 'object') throw new Error('project должен быть объектом');
    if (!data.format) data = { format: 'houseplan-ai', version: 1, units: 'm', ...data };
  } else throw new Error(`неизвестный инструмент ${tool.name}`);
  const { project, warnings } = importProject(data);
  const s = summarize(project);
  if (!s.levels.some((l) => l.walls)) throw new Error('в результате нет ни одной стены');
  return { project, warnings, summary, changes };
}

/**
 * Перенести из прежнего проекта то, чего нет в формате для ИИ:
 * место участка для солнца (широта, долгота, пояс, север), отступ, цвет забора, точку появления манекена.
 */
export function carryOver(prev, next) {
  if (!prev?.site || !next?.site) return next;
  for (const k of ['lat', 'lon', 'tz', 'north', 'setback']) if (Number.isFinite(prev.site[k])) next.site[k] = prev.site[k];
  if (prev.site.fence?.color && next.site.fence) next.site.fence.color = prev.site.fence.color;
  const sp = prev.site.spawn;
  if (sp) {
    const i = prev.levels.findIndex((l) => l.id === sp.levelId);
    const lvl = i >= 0 ? next.levels[i] : null;
    if (lvl || sp.levelId === SITE_LEVEL) next.site.spawn = { ...sp, levelId: lvl ? lvl.id : sp.levelId };
  }
  return next;
}

function addUsage(total, u = {}) {
  total.input += u.input_tokens || 0;
  total.output += u.output_tokens || 0;
  total.cacheRead += u.cache_read_input_tokens || 0;
  total.cacheWrite += u.cache_creation_input_tokens || 0;
}

/**
 * Ответ модели — обратно в историю для повторной попытки внутри того же хода.
 * Блоки размышлений (thinking, redacted_thinking) API требует вернуть ровно такими,
 * какими они пришли, вместе с вызовом инструмента; пустой текст API не принимает.
 */
export function replayBlocks(content) {
  return content
    .map((b) => {
      if (b.type === 'text') return b.text ? { type: 'text', text: b.text } : null;
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.inputError ? {} : b.input || {} };
      if (b.type === 'thinking') return { type: 'thinking', thinking: b.thinking || '', signature: b.signature || '' };
      return { ...b }; // redacted_thinking и будущие типы — как есть
    })
    .filter(Boolean);
}

/** Усилие модели: меньше — быстрее и дешевле, больше — тщательнее (output_config.effort). */
export const EFFORTS = { low: 'Быстро', medium: 'Обычно', high: 'Тщательно' };

const STOP_TEXT = {
  refusal: 'Claude отказался выполнять этот запрос. Переформулируйте его или выберите другую модель в настройках ИИ.',
  model_context_window_exceeded: 'Разговор и проект не помещаются в память модели — начните новый разговор («+» вверху вкладки).',
};

/**
 * Один ход разговора: запрос → (инструмент → проект) с автоповтором при ошибке правок.
 * @param opts { key, workspace, model, effort, history, text, images, snapshot, signal, onProgress, fetchImpl, maxRetries, retryDelays }
 * @returns {{ text, project?, warnings?, summary?, tool?, changes?, usage, attempts }}
 */
export async function runTurn({ key, workspace = '', model, effort = '', history = [], text, images = [], snapshot, signal, onProgress, fetchImpl, maxRetries = 2, retryDelays }) {
  const system = buildSystem();
  const messages = buildMessages({ history, text, images, context: snapshot.context });
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const texts = [];
  let maxTokens = MAX_TOKENS;
  let useEffort = !!EFFORTS[effort];
  const send = () =>
    streamMessage({
      key,
      workspace,
      body: { model, max_tokens: maxTokens, system, tools: TOOLS, messages, ...(useEffort ? { output_config: { effort } } : {}) },
      signal,
      onProgress,
      fetchImpl,
      retryDelays,
    });
  // Запрос, который модель не принимает из-за необязательных параметров, повторяем без них:
  // у старых моделей меньше предел ответа и нет настройки усилия.
  const request = async () => {
    for (let fix = 0; ; fix++) {
      try {
        return await send();
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 400 || fix >= 2) throw err;
        if (/max_tokens/i.test(err.message) && maxTokens > 8192) {
          // «max_tokens: 64000 > 16384, which is the maximum…» — берём предел модели из текста ошибки
          const limits = (err.message.match(/\d{4,6}/g) || []).map(Number).filter((n) => n < maxTokens);
          maxTokens = Math.max(4096, limits.length ? Math.min(...limits) : 8192);
        } else if (useEffort && /effort|output_config/i.test(err.message)) {
          useEffort = false;
        } else throw err;
      }
    }
  };
  for (let attempt = 0; ; attempt++) {
    const msg = await request();
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
      const stopped = STOP_TEXT[msg.stop_reason];
      if (stopped || (cut && !reply)) {
        const e = new Error(stopped || 'Ответ не поместился в лимит — попросите сделать по частям (например, сначала первый этаж).');
        e.usage = usage;
        e.text = texts.join('\n\n');
        throw e;
      }
      return { text: texts.join('\n\n'), usage, attempts: attempt + 1 };
    }
    let error;
    try {
      if (tool.inputError) throw new Error(cut ? 'проект не поместился в один ответ — JSON оборван' : tool.inputError);
      const res = projectFromTool(tool, snapshot.exchange);
      return { text: texts.join('\n\n'), usage, attempts: attempt + 1, tool: tool.name, ...res };
    } catch (err) {
      error = err;
    }
    if (attempt >= maxRetries || cut) {
      const e = new Error(cut ? 'Ответ не поместился в лимит — попросите сделать по частям (например, сначала первый этаж) или правками.' : `Правки не применились: ${error.message}`);
      e.usage = usage;
      e.text = texts.join('\n\n');
      throw e;
    }
    onProgress?.({ type: 'retry', attempt: attempt + 1, error: error.message });
    // продолжение того же хода: ответ модели целиком (с размышлениями) + только tool_result
    messages.push(
      { role: 'assistant', content: replayBlocks(msg.content) },
      {
        role: 'user',
        content: tools.map((t, i) => ({
          type: 'tool_result',
          tool_use_id: t.id,
          is_error: true,
          content: i === 0 ? `Не получилось применить: ${error.message}. Исправь и вызови инструмент снова (правки — к тому же JSON, что был прислан).` : 'Пропущено: вызывай один инструмент за ответ.',
        })),
      },
    );
  }
}
