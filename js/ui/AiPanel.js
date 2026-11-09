/**
 * Вкладка «ИИ»: разговор с Claude прямо в программе.
 * Пишете запрос («дом 10×12 с котельной», «сделай кухню больше», «добавь террасу»)
 * или прикладываете фото эскиза — Claude строит или правит проект, программа
 * проверяет результат и применяет его одним шагом истории (Ctrl+Z вернёт как было).
 */
import { h, icon, clear } from './dom.js';
import { openAiSettings } from './AiKeyDialog.js';
import { getKey, getModel, getModels, loadChat, saveChat } from '../ai/aiStore.js';
import { describeError } from '../ai/claudeClient.js';
import { runTurn, snapshotProject, carryOver } from '../ai/assistant.js';
import { summarizeIssues, plural } from '../model/validate.js';
import { summarize } from '../io/exchange.js';

const MAX_IMAGES = 3;
const MAX_SIDE = 1568; // больше API всё равно уменьшит

const START_EMPTY = [
  'Одноэтажный дом 10×10: кухня-гостиная 30 м², три спальни, санузел, котельная, терраса на юг',
  'Двухэтажный дом 9×12: внизу кухня-гостиная и гостевая, наверху три спальни и ванная; П-образная лестница, вальмовая крыша',
  'Дом 8×10 с мансардой: внизу гостиная, кухня, санузел; в мансарде две спальни',
  'Баня 6×4: комната отдыха, моечная, парная',
];
const START_EDIT = [
  'Расставь мебель во всех комнатах',
  'Исправь замечания проверки',
  'Добавь террасу 3×6 м с южной стороны',
  'Сделай кухню больше за счёт коридора',
  'Какая площадь у каждой комнаты?',
  'Добавь розетки, выключатели и свет во все комнаты',
];

/** Текст ответа: абзацы, списки «- …» и **жирный** — без HTML из ответа. */
function richText(text) {
  const frag = document.createDocumentFragment();
  const inline = (s) => {
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => (i % 2 ? h('strong', {}, p) : p.replace(/`([^`]+)`/g, '$1')));
  };
  for (const block of String(text || '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const bullet = /^\s*(?:[-•*]|\d+[.)])\s+/;
    if (lines.every((l) => bullet.test(l))) {
      const ordered = /^\s*\d/.test(lines[0]);
      frag.append(h(ordered ? 'ol' : 'ul', {}, lines.map((l) => h('li', {}, inline(l.replace(bullet, ''))))));
    } else {
      const p = h('p', {});
      lines.forEach((l, i) => {
        if (i) p.append(h('br'));
        p.append(...inline(l.replace(/^#+\s*/, '')));
      });
      frag.append(p);
    }
  }
  return frag;
}

const kb = (chars) => (chars < 1024 ? `${chars} симв.` : `${(chars / 1024).toFixed(1).replace('.', ',')} КБ`);

function tokens(n) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace('.', ',')} тыс.`;
}

function usageText(u) {
  if (!u) return '';
  const inTotal = u.input + u.cacheRead + u.cacheWrite;
  return `токены: вход ${tokens(inTotal)}${u.cacheRead ? ` (из кэша ${tokens(u.cacheRead)})` : ''} · ответ ${tokens(u.output)}`;
}

function statsText(project) {
  const s = summarize(project);
  const sum = (k) => s.levels.reduce((a, l) => a + l[k], 0);
  const n = s.levels.length;
  return [`${n} ${plural(n, 'этаж', 'этажа', 'этажей')}`, `стен ${sum('walls')}`, `комнат ${sum('rooms')}`, `окон ${sum('windows')}`, `дверей ${sum('doors')}`, `мебели ${sum('items')}`].join(' · ');
}

/** Фото → JPEG не больше MAX_SIDE по длинной стороне, base64. */
async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Не удалось открыть картинку'));
      i.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; // прозрачный PNG — на белом
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.86);
    return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], url: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class AiPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.chat = loadChat();
    this.images = [];
    this.busy = null;
    this.rev = 0;
    this._build();
    this.render();
    app.bus.on('project:changed', ({ reason }) => {
      if (reason === 'gesture') return;
      this.rev++;
      this._syncUndo();
      if (!this.chat.length) this.render(); // подсказки зависят от того, пуст ли план
    });
  }

  // ── Разметка ──

  _build() {
    const app = this.app;
    this.modelBtn = h('button', { class: 'ai-model-btn', 'aria-label': 'Ключ API и модель', 'data-tip': 'Ключ API и модель', onclick: () => this.settings() }, icon('key', 16), h('span', {}));
    this.clearBtn = h('button', { class: 'icon-btn', 'aria-label': 'Новый разговор', 'data-tip': 'Новый разговор', onclick: () => this.newChat() }, icon('plus', 18));
    const head = h('div', { class: 'ai-head' }, this.modelBtn, h('span', { class: 'ai-head-spacer' }), this.clearBtn);
    this.log = h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite' });
    this.thumbs = h('div', { class: 'ai-thumbs', hidden: true });
    this.input = h('textarea', {
      class: 'ai-input',
      rows: 2,
      placeholder: 'Опишите дом или что изменить…',
      'aria-label': 'Запрос к ИИ',
      oninput: () => this._grow(),
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !app.state.coarse && !e.isComposing) {
          e.preventDefault();
          this.send();
        }
      },
      onpaste: (e) => {
        const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) {
          e.preventDefault();
          this.addImages(files);
        }
      },
    });
    this.fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => this.addImages([...this.fileInput.files]) });
    this.attachBtn = h('button', { class: 'icon-btn', 'aria-label': 'Приложить фото или эскиз', 'data-tip': 'Фото или эскиз плана', onclick: () => this.fileInput.click() }, icon('clip', 18));
    this.sendBtn = h('button', { class: 'ai-send', 'aria-label': 'Отправить', onclick: () => (this.busy ? this.stop() : this.send()) }, icon('send', 18));
    const composer = h(
      'div',
      { class: 'ai-composer' },
      this.thumbs,
      this.input,
      h('div', { class: 'ai-composer-row' }, this.attachBtn, this.fileInput, h('span', { class: 'ai-hint muted' }, app.state.coarse ? '' : 'Enter — отправить, Shift+Enter — новая строка'), this.sendBtn),
    );
    this.root.classList.add('ai-body');
    this.root.append(head, this.log, composer);
    // фото можно бросить прямо на вкладку
    this.root.addEventListener('dragover', (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('Files')) {
        e.preventDefault();
        this.root.classList.add('drag');
      }
    });
    this.root.addEventListener('dragleave', (e) => {
      if (!this.root.contains(e.relatedTarget)) this.root.classList.remove('drag');
    });
    this.root.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
      this.root.classList.remove('drag');
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      this.addImages(files);
    });
  }

  _grow() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(160, this.input.scrollHeight + 2)}px`;
  }

  _syncHead() {
    const id = getModel();
    const m = getModels().find((x) => x.id === id);
    const key = getKey();
    this.modelBtn.querySelector('span:last-child').textContent = key ? (m?.name || id).replace(/^Claude\s+/, '') : 'Подключить Claude';
    this.modelBtn.classList.toggle('need', !key);
    this.clearBtn.hidden = !this.chat.length;
  }

  render() {
    this._syncHead();
    const log = clear(this.log);
    this._live = null;
    if (!getKey()) {
      log.append(this._setupCard());
    } else if (!this.chat.length) {
      log.append(this._intro());
    }
    this.chat.forEach((m, i) => log.append(this._bubble(m, i === this.chat.length - 1)));
    this._syncUndo();
    this._syncSend();
    requestAnimationFrame(() => (this.log.scrollTop = this.log.scrollHeight));
  }

  _setupCard() {
    return h(
      'div',
      { class: 'ai-card' },
      h('h3', {}, icon('spark', 18), 'ИИ-помощник'),
      h('p', {}, 'Пишите обычными словами — Claude построит дом или изменит текущий: стены, комнаты, окна, лестницы, крышу, мебель, участок. Можно приложить фото эскиза.'),
      h('p', { class: 'muted small' }, 'Нужен ваш ключ API Anthropic. Он хранится только в этом браузере, запросы идут напрямую в API Claude и оплачиваются с вашего счёта.'),
      h('button', { class: 'btn btn-primary', onclick: () => this.settings() }, icon('key', 16), 'Подключить ключ API'),
      h('p', { class: 'muted small' }, 'Без ключа: ', h('button', { class: 'link-btn', onclick: () => this.app.ui.exchange.open('ai') }, 'промпт для любой нейросети'), ' — скопировать, отправить в чат и вставить ответ.'),
    );
  }

  _intro() {
    const empty = !this.app.project.walls.length;
    return h(
      'div',
      { class: 'ai-card' },
      h('h3', {}, icon('spark', 18), empty ? 'Какой дом построить?' : 'Что изменить в проекте?'),
      h('p', { class: 'muted small' }, empty ? 'Опишите дом: размеры, этажи, комнаты, крышу, участок. Или приложите фото эскиза плана.' : 'Claude видит весь проект, активный этаж, выделенное на плане и замечания проверки. Любой ответ можно отменить — Ctrl+Z.'),
      h(
        'div',
        { class: 'ai-suggest' },
        (empty ? START_EMPTY : START_EDIT).map((t) =>
          h(
            'button',
            {
              class: 'chip',
              onclick: () => {
                this.input.value = t;
                this._grow();
                this.input.focus();
              },
            },
            t,
          ),
        ),
      ),
    );
  }

  _bubble(m, isLast) {
    if (m.role === 'user') {
      return h('div', { class: 'ai-msg user' }, h('div', { class: 'ai-text' }, richText(m.text)), m.images ? h('div', { class: 'ai-meta' }, icon('image', 14), `фото: ${m.images}`) : null);
    }
    const text = h('div', { class: 'ai-text' }, m.text ? richText(m.text) : null);
    const status = h('div', { class: 'ai-status', hidden: !m.pending }, h('span', { class: 'ai-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', {}, m.status || 'Думаю…'));
    const parts = [text, status];
    if (m.applied) {
      parts.push(
        h(
          'div',
          { class: `ai-result ${m.undone ? 'undone' : ''}` },
          h('div', { class: 'ai-result-title' }, icon(m.undone ? 'undo' : 'check', 16), m.undone ? 'Отменено' : m.kind === 'build' ? 'Проект построен' : 'Применено'),
          h('div', {}, m.applied),
          m.stats ? h('div', { class: 'ai-meta' }, m.stats) : null,
          m.issues ? h('div', { class: `ai-meta ${m.issueErrors ? 'bad' : 'meh'}` }, icon('warn', 14), `Проверка: ${m.issues}`) : h('div', { class: 'ai-meta ok' }, icon('shield', 14), 'Проверка: ошибок нет'),
        ),
      );
    }
    if (m.error) parts.push(h('div', { class: 'ai-error' }, icon('warn', 16), h('span', {}, m.error)));
    const actions = h('div', { class: 'ai-actions' });
    if (m.applied && !m.undone && m.rev != null) {
      actions.append(
        h(
          'button',
          {
            class: 'btn btn-small ai-undo',
            dataset: { rev: String(m.rev) },
            onclick: () => {
              this.app.commands.undo();
              m.undone = true;
              this._save();
              this.render();
            },
          },
          icon('undo', 14),
          'Отменить',
        ),
      );
    }
    if (isLast && m.applied && !m.undone && m.issueCount) {
      actions.append(h('button', { class: 'btn btn-small', onclick: () => this.send('Исправь замечания проверки, ничего другого не меняй.') }, icon('wand', 14), 'Исправить замечания'));
    }
    if (isLast && m.fixKey) {
      actions.append(h('button', { class: 'btn btn-small', onclick: () => this.settings() }, icon('key', 14), 'Ключ и модель…'));
    }
    if (isLast && m.retry) {
      actions.append(h('button', { class: 'btn btn-small', onclick: () => this.retry() }, icon('redo', 14), 'Повторить'));
    }
    if (actions.children.length) parts.push(actions);
    if (m.usage) parts.push(h('div', { class: 'ai-usage' }, usageText(m.usage)));
    const el = h('div', { class: `ai-msg bot ${m.pending ? 'pending' : ''}` }, parts);
    if (m.pending) this._live = { text, status, el };
    return el;
  }

  /** «Отменить» — только пока после ответа ИИ в проекте ничего не меняли. */
  _syncUndo() {
    for (const b of this.log.querySelectorAll('.ai-undo')) b.hidden = Number(b.dataset.rev) !== this.rev;
  }

  _syncSend() {
    const busy = !!this.busy;
    clear(this.sendBtn).append(icon(busy ? 'stop' : 'send', 18));
    this.sendBtn.classList.toggle('stop', busy);
    this.sendBtn.setAttribute('aria-label', busy ? 'Остановить' : 'Отправить');
    this.attachBtn.disabled = busy;
  }

  _renderThumbs() {
    clear(this.thumbs);
    this.thumbs.hidden = !this.images.length;
    this.images.forEach((im, i) =>
      this.thumbs.append(
        h(
          'span',
          { class: 'ai-thumb' },
          h('img', { src: im.url, alt: `Фото ${i + 1}` }),
          h(
            'button',
            {
              class: 'ai-thumb-x',
              'aria-label': 'Убрать фото',
              onclick: () => {
                this.images.splice(i, 1);
                this._renderThumbs();
              },
            },
            icon('close', 12),
          ),
        ),
      ),
    );
  }

  _save() {
    saveChat(this.chat.filter((m) => !m.pending));
  }

  // ── Действия ──

  settings() {
    openAiSettings(this.app, { onDone: () => this.render() });
  }

  /** Открыть вкладку и поставить курсор в поле запроса. */
  focus(text = '') {
    this.app.ui.side.open('ai', this.app.state.isPhone ? 'full' : 'half');
    if (text) this.input.value = text;
    this._grow();
    if (!this.app.state.coarse || text) setTimeout(() => this.input.focus(), 320);
  }

  async addImages(files) {
    const room = MAX_IMAGES - this.images.length;
    for (const f of files.slice(0, room)) {
      try {
        this.images.push(await readImage(f));
      } catch (err) {
        this.app.toast(err.message, 'warn');
      }
    }
    if (files.length > room) this.app.toast(`Не больше ${MAX_IMAGES} фото за раз`, 'warn');
    this.fileInput.value = '';
    this._renderThumbs();
  }

  async newChat() {
    if (this.busy) this.stop();
    this.chat = [];
    this._save();
    this.render();
  }

  stop() {
    this.busy?.controller.abort();
  }

  retry() {
    const last = this.chat[this.chat.length - 1];
    if (!last?.retry) return;
    const { text, images } = last.retry;
    this.chat.splice(-2, 2);
    this.images = images || [];
    this.send(text);
  }

  /** Отправить запрос (текст из поля или переданный). */
  async send(textArg) {
    const app = this.app;
    if (this.busy) return;
    const text = (textArg ?? this.input.value).trim() || (this.images.length ? 'Перенеси этот план в проект.' : '');
    if (!text) {
      this.input.focus();
      return;
    }
    const key = getKey();
    if (!key) {
      this.settings();
      return;
    }
    const model = getModel();
    const images = this.images;
    const history = this.chat.filter((m) => !m.pending);
    const user = { role: 'user', text, images: images.length || undefined };
    const bot = { role: 'assistant', text: '', pending: true, status: 'Думаю…' };
    this.chat.push(user, bot);
    if (textArg === undefined) this.input.value = '';
    this.images = [];
    this._renderThumbs();
    this._grow();
    const snapshot = snapshotProject(app.project, { activeLevelId: app.state.activeLevelId, selection: app.state.selection, issues: app.checks.issues });
    const startRev = this.rev;
    this.busy = { controller: new AbortController() };
    this.render();
    const live = (patch) => {
      Object.assign(bot, patch);
      if (!this._live) return;
      if ('text' in patch) clear(this._live.text).append(richText(bot.text));
      if ('status' in patch) this._live.status.lastChild.textContent = bot.status;
      this.log.scrollTop = this.log.scrollHeight;
    };
    try {
      const res = await runTurn({
        key,
        model,
        history,
        text,
        images,
        snapshot,
        signal: this.busy.controller.signal,
        onProgress: (p) => {
          if (p.type === 'text') live({ text: p.text, status: 'Пишу ответ…' });
          else if (p.type === 'tool') live({ status: `${p.name === 'build_project' ? 'Строю проект' : 'Готовлю правки'}… ${kb(p.chars)}` });
          else if (p.type === 'retry') live({ status: `Правки не легли — Claude исправляет (попытка ${p.attempt + 1})…` });
        },
      });
      bot.text = res.text;
      bot.usage = res.usage;
      if (res.project) await this._apply(res, bot, startRev);
      if (!bot.text && !bot.applied && !bot.error) bot.text = res.tool ? 'Изменений не потребовалось.' : '…';
    } catch (err) {
      bot.text = err.text || bot.text;
      bot.usage = err.usage || bot.usage;
      bot.error = describeError(err, model);
      if (err.name !== 'AbortError') bot.retry = { text, images };
      if ([401, 403, 404].includes(err.status)) bot.fixKey = true;
    } finally {
      bot.pending = false;
      delete bot.status;
      this.busy = null;
      this._save();
      this.render();
    }
  }

  async _apply(res, bot, startRev) {
    const app = this.app;
    if (this.rev !== startRev) {
      const ok = await app.confirm('Пока Claude отвечал, проект изменился. Применить ответ? Ваши последние правки заменятся — вернуть их можно кнопкой «Отменить».', 'Применить');
      if (!ok) {
        bot.error = 'Не применено: проект изменился, пока Claude отвечал';
        return;
      }
    }
    const fit = res.tool === 'build_project';
    carryOver(app.project, res.project);
    app.commands.applyAiProject(res.project, { fit });
    const issues = app.checks.run({ quiet: true });
    const errors = issues.filter((i) => i.level === 'error').length;
    bot.applied = res.summary || (fit ? 'Проект построен' : 'Изменения применены');
    bot.kind = fit ? 'build' : 'edit';
    bot.stats = statsText(app.project) + (res.warnings.length ? ` · поправлено при импорте: ${res.warnings.length}` : '');
    bot.issues = issues.length ? summarizeIssues(issues) : '';
    bot.issueCount = issues.length;
    bot.issueErrors = errors;
    bot.rev = this.rev;
    // на телефоне шторка на весь экран закрывает план — опускаем до половины
    if (app.state.isPhone && document.body.classList.contains('sheet-full')) app.ui.side.open('ai', 'half');
  }
}
