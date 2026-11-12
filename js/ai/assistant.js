/**
 * ИИ-помощник: что отправить Claude и как превратить ответ в проект.
 *
 * Каждый запрос несёт актуальный проект (JSON «houseplan-ai» с id элементов),
 * активный этаж, выделение, замечания проверки и — если задана — область задания
 * (этаж, комната или выделенные объекты: менять можно только их, см. scope.js).
 * Claude отвечает текстом и/или вызывает один из инструментов:
 *   edit_project  — список правок JSON Patch к присланному JSON (точечные правки);
 *   build_project — проект целиком (новый дом или большая переделка).
 * Результат проходит тот же импорт, что и «Импорт ответа ИИ»: починка стыков,
 * проверка проёмов, нормализация. Сам разговор — по шагам, с возвратом ошибок
 * Claude на исправление — ведёт agent.js. Модуль без DOM — его проверяют юнит-тесты.
 */
import { formatRules, EXAMPLE } from '../io/aiPrompt.js';
import { toExchange, importProject, extractJson, summarize } from '../io/exchange.js';
import { applyPatch } from './jsonPatch.js';
import { buildScope, scopeText, trimToScope } from './scope.js';
import { SITE_LEVEL, getLevel } from '../model/project.js';

// Предел длины одного ответа. Размышление модели тоже расходует его — берём наибольший;
// если модель принимает меньше, agent.js возьмёт её предел из ответа API.
export const MAX_TOKENS = 128000;
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

РАБОТА ПО ШАГАМ
- Инструменты можно вызывать несколько раз подряд: после каждого вызова программа применяет шаг к проекту и присылает обновлённый JSON — следующие правки относятся к нему. Так большая работа не упирается в предел длины одного ответа.
- Маленькую правку делай одним вызовом, не дроби зря. Большую задачу (новый дом в несколько этажей, дом сразу с мебелью, переделка нескольких этажей, «расставь мебель везде») дели на шаги сам, не спрашивая пользователя:
  1) каркас — build_project (новый дом) или edit_project: участок, этажи, наружные и внутренние стены, комнаты, лестницы, крыша;
  2) окна и двери — edit_project (в большом доме — по этажам);
  3) мебель, сантехника, свет и розетки — edit_project по одному этажу или по несколько комнат за шаг;
  4) участок: дорожки, покрытия, постройки и объекты.
- Один вызов — не больше примерно 60 правок или 150 элементов. Если не уверен, что поместится, — раздели.
- Перед первым шагом большой задачи напиши короткий план (2–5 пунктов). Перед каждым следующим вызовом — одна строка, что делаешь сейчас.
- id элементов между шагами сохраняются; новые элементы без id получают его от программы — смотри в присланном JSON.
- Когда задача выполнена целиком — ответь коротким итогом без инструмента: что построено или изменено и на что обратить внимание. Не повторяй шаги, которые уже применены.
- Если программа сообщила, что ответ оборвался из-за длины, — повтори шаг меньшей порцией.

ОБЛАСТЬ ЗАДАНИЯ
- Если в сообщении есть раздел «ОБЛАСТЬ ЗАДАНИЯ», пользователь выделил этаж, комнату или объекты и просит работать только с ними. Меняй, добавляй и удаляй только то, что разрешено в этом разделе; всё остальное оставь как есть — программа отклонит правку, которая выходит за область.
- «Здесь», «тут», «это», «эту комнату» в таком запросе — про область задания.
- Этажи вне области показаны сокращённо (только стены и лестницы) — этого достаточно, чтобы учитывать, что над и под областью.

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
 * Снимок проекта для запроса: JSON с id и подписи активного этажа, выделения и области задания.
 * @param opts.scope — цель области: { levelId } или { selection } (см. scope.js); без неё — весь проект
 * @returns {{ exchange, json, context, empty, scope }} exchange — полный JSON (к нему относятся правки),
 *          json — то, что отправлено Claude (при области этажи вне её сокращены), scope — область или null
 */
export function snapshotProject(project, { activeLevelId = null, selection = [], issues = [], scope: target = null } = {}) {
  const idMap = new Map();
  const exchange = toExchange(project, { ids: true, idMap });
  const empty = !project.walls.length;
  const scope = target && !empty ? buildScope(project, target, idMap) : null;
  const json = JSON.stringify(scope ? trimToScope(exchange, scope) : exchange);
  const li = project.levels.findIndex((l) => l.id === activeLevelId);
  // замечания проверки — только по этажам области: остальное Claude всё равно не может править
  const inScope = (i) => (i.levelId === SITE_LEVEL ? 'site' : project.levels.findIndex((l) => l.id === i.levelId)) in scope.parts;
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
    scope ? scopeText(scope, exchange) : '',
    li >= 0 && !empty ? `АКТИВНЫЙ ЭТАЖ: levels/${li} «${project.levels[li].name}»` : '',
    sel.length && !scope ? `ВЫДЕЛЕНО НА ПЛАНЕ: ${sel.join(', ')}` : '',
    empty ? '' : `ПРОВЕРКА ПРОЕКТА${scope ? ' (в области задания)' : ''}:\n${issuesText(project, scope ? issues.filter(inScope) : issues)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { exchange, json, context, empty, scope };
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
    if (m.role === 'user') push('user', `${m.text}${m.scope ? `\n[запрос был по области: ${m.scope}]` : ''}${m.images ? '\n[было приложено изображение]' : ''}`);
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
 * @param baseExchange — JSON, к которому относятся правки (последний присланный Claude)
 * @param check — (before, after) → бросает ошибку, если правка недопустима (выход за область задания)
 * @returns {{ project|null, warnings, summary, changes, sourceIds }} project = null — правок нет;
 *          sourceIds — id элементов в JSON (чтобы следующий шаг видел их под теми же id)
 */
export function projectFromTool(tool, baseExchange, check = null) {
  const input = tool.input || {};
  const summary = String(input.summary || '').trim();
  let data;
  let changes = 0;
  if (tool.name === 'edit_project') {
    const patch = asJson(input.patch, 'patch');
    if (!Array.isArray(patch)) throw new Error('patch должен быть списком правок');
    if (!patch.length) return { project: null, warnings: [], summary, changes: 0, sourceIds: null };
    data = applyPatch(baseExchange, patch);
    changes = patch.length;
    check?.(baseExchange, data);
  } else if (tool.name === 'build_project') {
    data = asJson(input.project, 'project');
    if (!data || typeof data !== 'object') throw new Error('project должен быть объектом');
    if (!data.format) data = { format: 'houseplan-ai', version: 1, units: 'm', ...data };
  } else throw new Error(`неизвестный инструмент ${tool.name}`);
  const { project, warnings, sourceIds = null } = importProject(data);
  const s = summarize(project);
  if (!s.levels.some((l) => l.walls)) throw new Error('в результате нет ни одной стены');
  return { project, warnings, summary, changes, sourceIds };
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
