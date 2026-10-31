/**
 * Окно «Импорт и экспорт»:
 *  - ИИ-помощник: описание дома → готовый промпт для нейросети (копировать, скачать);
 *  - Импорт: вставить ответ ИИ или JSON, открыть файл → проверка, сводка, загрузка;
 *  - Экспорт: файл проекта, JSON в буфер (родной формат и формат для ИИ).
 */
import { h, icon, clear } from './dom.js';
import { openModal } from './feedback.js';
import { buildAiPrompt } from '../io/aiPrompt.js';
import { importProject, toExchange, summarize } from '../io/exchange.js';
import { checkProject, summarizeIssues } from '../model/validate.js';
import { download, safeName, saveProjectFile } from '../io/fileio.js';
import { LEVEL_KINDS } from '../model/project.js';

const DRAFT_KEY = 'houseplan.ai.wishes.v1';

const EXAMPLES = [
  ['Одноэтажный 10×10', 'Одноэтажный дом 10×10 м: гостиная с кухней 30 м², три спальни, санузел и ванная, прихожая с гардеробом, котельная. Двускатная крыша, терраса на юг, участок 10 соток с дорожкой и местом для машины.'],
  ['Двухэтажный 9×12', 'Двухэтажный дом 9×12 м: на первом этаже кухня-гостиная, гостевая спальня, санузел, котельная; на втором — три спальни, ванная, гардеробная. П-образная лестница, вальмовая крыша.'],
  ['С цоколем и мансардой', 'Дом 8×10 м с цокольным этажом (мастерская, котельная, кладовая), первым этажом (гостиная, кухня, санузел) и мансардой (две спальни). Мансардная крыша 40°.'],
  ['Баня 6×4', 'Баня 6×4 м: комната отдыха, моечная, парная с печью. Крыльцо и дорожка от дома.'],
];

function readDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) || '';
  } catch {
    return '';
  }
}

function saveDraft(v) {
  try {
    localStorage.setItem(DRAFT_KEY, v);
  } catch {
    /* не страшно */
  }
}

async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // запасной путь — выделить текст в поле и скопировать
    if (fallbackEl) {
      fallbackEl.focus();
      fallbackEl.select();
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Итог проверки импортируемого дома: предметы друг в друге, в стенах и т. п. */
function checkReport(project) {
  let issues = [];
  try {
    issues = checkProject(project);
  } catch {
    return null;
  }
  if (!issues.length) return h('p', { class: 'xch-ok' }, icon('shield', 16), 'Проверка: предметы и постройки не пересекаются, двери свободны');
  const errors = issues.filter((i) => i.level === 'error');
  const top = (errors.length ? errors : issues).slice(0, 4);
  return h(
    'div',
    { class: errors.length ? 'xch-check bad' : 'xch-check' },
    h('p', {}, icon('warn', 16), `Проверка: ${summarizeIssues(issues)}. После загрузки — вкладка «Проверка»: там можно показать и исправить.`),
    h('ul', {}, top.map((i) => h('li', {}, i.title)), issues.length > top.length ? h('li', { class: 'muted' }, `и ещё ${issues.length - top.length}`) : null),
  );
}

export class ExchangeDialog {
  constructor(app) {
    this.app = app;
  }

  /** @param tab 'ai' | 'import' | 'export'; text — сразу вставить в импорт */
  open(tab = 'ai', { text = '' } = {}) {
    const app = this.app;
    let modal;
    const panes = {};

    // ── ИИ-помощник ──
    const wishes = h('textarea', {
      class: 'xch-wishes',
      rows: 4,
      placeholder: 'Например: двухэтажный дом 10×12, 4 спальни, 2 санузла, кухня-гостиная 35 м², котельная, гараж на одну машину, вальмовая крыша…',
      oninput: () => {
        saveDraft(wishes.value);
        refreshPrompt();
      },
    });
    wishes.value = readDraft();
    const withProject = h('input', { type: 'checkbox', class: 'switch', onchange: () => refreshPrompt() });
    const withExample = h('input', { type: 'checkbox', class: 'switch', checked: true, onchange: () => refreshPrompt() });
    const hasWalls = app.project.walls.length > 0;
    withProject.disabled = !hasWalls;
    const promptOut = h('textarea', { class: 'xch-code', rows: 8, readonly: true, 'aria-label': 'Промпт для ИИ' });
    const promptInfo = h('span', { class: 'muted small' });
    const refreshPrompt = () => {
      promptOut.value = buildAiPrompt({ wishes: wishes.value, project: withProject.checked ? app.project : null, example: withExample.checked });
      promptInfo.textContent = `${promptOut.value.length.toLocaleString('ru-RU')} символов`;
    };
    const chips = h(
      'div',
      { class: 'xch-chips' },
      EXAMPLES.map(([label, ex]) =>
        h(
          'button',
          {
            class: 'chip',
            title: ex,
            onclick: () => {
              wishes.value = ex;
              saveDraft(ex);
              refreshPrompt();
            },
          },
          label,
        ),
      ),
    );
    panes.ai = h(
      'div',
      { class: 'xch-pane' },
      h(
        'ol',
        { class: 'xch-steps' },
        h('li', {}, 'Опишите дом своими словами — или выберите пример ниже.'),
        h('li', {}, 'Скопируйте промпт и отправьте его нейросети (ChatGPT, Claude, Gemini, DeepSeek, GigaChat…).'),
        h('li', {}, 'Ответ ИИ целиком вставьте во вкладке «Импорт» — дом появится на плане и в 3D.'),
      ),
      h('label', { class: 'xch-label' }, 'Каким должен быть дом'),
      wishes,
      chips,
      h(
        'div',
        { class: 'xch-switches' },
        h('label', { class: 'switch-row' }, withProject, h('span', {}, hasWalls ? 'Приложить текущий проект — ИИ доработает его' : 'Приложить текущий проект (сейчас план пуст)')),
        h('label', { class: 'switch-row' }, withExample, h('span', {}, 'Приложить пример правильного ответа')),
      ),
      h('div', { class: 'xch-row' }, h('label', { class: 'xch-label' }, 'Промпт'), promptInfo),
      promptOut,
      h(
        'div',
        { class: 'xch-actions' },
        h(
          'button',
          {
            class: 'btn btn-primary',
            onclick: async () => {
              const ok = await copyText(promptOut.value, promptOut);
              app.toast(ok ? 'Промпт скопирован — вставьте его в чат с ИИ' : 'Не удалось скопировать — выделите текст вручную', ok ? 'info' : 'warn');
            },
          },
          icon('copy', 16),
          'Скопировать промпт',
        ),
        h(
          'button',
          { class: 'btn', onclick: () => download(`Промпт HousePlan — ${safeName(app.project.name)}.txt`, new Blob([promptOut.value], { type: 'text/plain;charset=utf-8' })) },
          icon('download', 16),
          'Скачать .txt',
        ),
        h('button', { class: 'btn btn-ghost', onclick: () => show('import') }, 'К импорту ответа →'),
      ),
    );

    // ── Импорт ──
    const input = h('textarea', {
      class: 'xch-code xch-input',
      rows: 9,
      placeholder: 'Вставьте сюда ответ ИИ целиком (с текстом и блоком ```json) или JSON проекта. Можно перетащить файл .json',
      oninput: () => scheduleParse(),
    });
    const report = h('div', { class: 'xch-report', 'aria-live': 'polite' });
    const importBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => doImport() }, icon('open', 16), 'Загрузить проект');
    let parsed = null;
    let timer = 0;
    const scheduleParse = () => {
      clearTimeout(timer);
      timer = setTimeout(parse, 250);
    };
    const parse = () => {
      clear(report);
      parsed = null;
      importBtn.disabled = true;
      if (!input.value.trim()) return;
      try {
        parsed = importProject(input.value);
      } catch (err) {
        report.append(h('p', { class: 'xch-error' }, icon('close', 16), err.message));
        return;
      }
      const s = summarize(parsed.project);
      const total = s.levels.reduce((a, l) => a + l.walls, 0);
      if (!total) {
        report.append(h('p', { class: 'xch-error' }, icon('close', 16), 'В проекте нет ни одной стены'));
        parsed = null;
        return;
      }
      importBtn.disabled = false;
      const parts = [
        h('p', { class: 'xch-ok' }, icon('check', 16), `«${s.name}» — ${parsed.format === 'ai' ? 'формат для ИИ' : 'файл HousePlan'}, этажей: ${s.levels.length}`),
        h(
          'table',
          { class: 'xch-table' },
          h('thead', {}, h('tr', {}, ['Этаж', 'Стены', 'Комнаты', 'Двери', 'Окна', 'Лестницы', 'Мебель', 'Крыши'].map((t) => h('th', {}, t)))),
          h(
            'tbody',
            {},
            [...s.levels].reverse().map((l) =>
              h(
                'tr',
                {},
                h('td', {}, l.name, l.kind !== 'floor' ? h('span', { class: 'muted' }, ` · ${LEVEL_KINDS[l.kind]?.toLowerCase()}`) : null),
                [l.walls, l.rooms, l.doors, l.windows, l.stairs, l.items, l.roofs].map((v) => h('td', {}, String(v))),
              ),
            ),
          ),
        ),
        s.outdoor || s.zones ? h('p', { class: 'muted small' }, `Участок: объектов ${s.outdoor}, зон ${s.zones}`) : null,
        parsed.warnings.length ? h('ul', { class: 'xch-warn' }, parsed.warnings.map((w) => h('li', {}, w))) : null,
        checkReport(parsed.project),
      ];
      report.append(...parts.filter(Boolean));
    };
    const doImport = async () => {
      if (!parsed) return;
      if (app.project.walls.length) {
        const ok = await app.confirm('Заменить текущий проект загруженным? Вернуть прежний можно через «Отменить» (Ctrl+Z).', 'Заменить');
        if (!ok) return;
      }
      app.commands.loadProject(parsed.project);
      modal.close();
      app.toast(`Загружен «${app.project.name}»${parsed.warnings.length ? ` · исправлений: ${parsed.warnings.length}` : ''}`, 'info', { action: { label: 'Отменить', onClick: () => app.commands.undo() } });
    };
    const fileBtn = h(
      'button',
      {
        class: 'btn',
        onclick: () => {
          const f = h('input', { type: 'file', accept: '.json,.txt,.md,application/json,text/plain' });
          f.addEventListener('change', async () => {
            const file = f.files?.[0];
            if (!file) return;
            input.value = await file.text();
            parse();
          });
          f.click();
        },
      },
      icon('open', 16),
      'Открыть файл…',
    );
    const pasteBtn = h(
      'button',
      {
        class: 'btn',
        onclick: async () => {
          try {
            input.value = await navigator.clipboard.readText();
            parse();
          } catch {
            input.focus();
            app.toast('Браузер не дал прочитать буфер — вставьте сочетанием Ctrl+V', 'warn');
          }
        },
      },
      icon('copy', 16),
      'Вставить из буфера',
    );
    input.addEventListener('dragover', (e) => {
      e.preventDefault();
      input.classList.add('drag');
    });
    input.addEventListener('dragleave', () => input.classList.remove('drag'));
    input.addEventListener('drop', async (e) => {
      e.preventDefault();
      input.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) input.value = await file.text();
      else input.value = e.dataTransfer?.getData('text') || input.value;
      parse();
    });
    panes.import = h(
      'div',
      { class: 'xch-pane' },
      h('p', { class: 'muted' }, 'Понимает ответ ИИ (JSON найдётся сам, даже с текстом вокруг), файл проекта HousePlan, сантиметры и миллиметры. Мелкие неточности — щели в углах стен, проёмы у края — исправляются.'),
      input,
      h('div', { class: 'xch-actions' }, pasteBtn, fileBtn),
      report,
      h('div', { class: 'xch-actions xch-actions-end' }, importBtn),
    );

    // ── Экспорт ──
    const exportOut = h('textarea', { class: 'xch-code', rows: 8, readonly: true, 'aria-label': 'JSON проекта' });
    const fmtNative = h('button', { class: 'seg-btn active', onclick: () => setFmt('native') }, 'Файл HousePlan');
    const fmtAi = h('button', { class: 'seg-btn', onclick: () => setFmt('ai') }, 'Для ИИ (проще)');
    let fmt = 'native';
    const jsonOf = () => (fmt === 'ai' ? JSON.stringify(toExchange(app.project), null, 1) : JSON.stringify(app.project, null, 1));
    const setFmt = (f) => {
      fmt = f;
      fmtNative.classList.toggle('active', f === 'native');
      fmtAi.classList.toggle('active', f === 'ai');
      exportOut.value = jsonOf();
    };
    panes.export = h(
      'div',
      { class: 'xch-pane' },
      h('p', { class: 'muted' }, 'Файл проекта открывается здесь же через «Импорт» или «Файл → Открыть». Формат «для ИИ» короче: стены сгруппированы по этажам, проёмы привязаны к стенам.'),
      h('div', { class: 'seg seg-small' }, fmtNative, fmtAi),
      exportOut,
      h(
        'div',
        { class: 'xch-actions' },
        h(
          'button',
          {
            class: 'btn btn-primary',
            onclick: () => {
              if (fmt === 'native') saveProjectFile(app.project);
              else download(`${safeName(app.project.name)}.houseplan-ai.json`, new Blob([jsonOf()], { type: 'application/json' }));
              app.toast('Файл сохранён');
            },
          },
          icon('download', 16),
          'Скачать файл',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              const ok = await copyText(exportOut.value, exportOut);
              app.toast(ok ? 'JSON проекта скопирован' : 'Не удалось скопировать — выделите текст вручную', ok ? 'info' : 'warn');
            },
          },
          icon('copy', 16),
          'Скопировать JSON',
        ),
      ),
    );

    const tabs = h('div', { class: 'seg modal-tabs', role: 'tablist' });
    const show = (id) => {
      for (const [k, el] of Object.entries(panes)) el.hidden = k !== id;
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.tab === id);
      if (id === 'ai') refreshPrompt();
      if (id === 'export') exportOut.value = jsonOf();
      if (id === 'import' && !app.state.coarse) setTimeout(() => input.focus(), 30);
    };
    for (const [id, label, ic] of [
      ['ai', 'ИИ-помощник', 'spark'],
      ['import', 'Импорт', 'open'],
      ['export', 'Экспорт', 'download'],
    ]) {
      tabs.append(h('button', { class: 'seg-btn', role: 'tab', dataset: { tab: id }, onclick: () => show(id) }, icon(ic, 18), label));
    }
    const content = h('div', { class: 'xch' }, tabs, panes.ai, panes.import, panes.export);
    modal = openModal(app, { title: 'Импорт и экспорт', content, wide: true });
    if (text) {
      input.value = text;
      parse();
    }
    show(tab);
    return modal;
  }
}
