/**
 * Подключение Claude: ключ API, модель, скорость ответа и (если нужно) ID рабочего пространства.
 * Ключ проверяется бесплатным запросом списка моделей и хранится только в этом браузере.
 */
import { h, icon, clear } from './dom.js';
import { openModal } from './feedback.js';
import { listModels, describeError, ApiError } from '../ai/claudeClient.js';
import { EFFORTS } from '../ai/assistant.js';
import { getKey, setKey, clearKey, maskKey, looksLikeKey, getModels, saveModels, getModel, setModel, getEffort, setEffort, getWorkspace, setWorkspace } from '../ai/aiStore.js';

export const CONSOLE_KEYS_URL = 'https://platform.claude.com/settings/keys';
export const CONSOLE_WORKSPACES_URL = 'https://platform.claude.com/settings/workspaces';

const EFFORT_NOTES = {
  low: 'простые правки: быстрее и дешевле',
  medium: 'подходит для большинства запросов',
  high: 'сложные дома и перепланировки: дольше и дороже',
};

/** @param opts.onDone — вызывается после сохранения или удаления ключа */
export function openAiSettings(app, { onDone } = {}) {
  const had = getKey();
  let models = getModels();
  let model = getModel();
  let effort = getEffort();

  const keyInput = h('input', {
    type: 'password',
    class: 'ai-key-input',
    placeholder: had ? `Сохранён: ${maskKey(had)} — вставьте новый, чтобы заменить` : 'sk-ant-api03-…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Ключ API Anthropic',
  });
  const showBtn = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Показать ключ',
      onclick: () => {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      },
    },
    icon('eye', 18),
  );
  const wsInput = h('input', {
    type: 'text',
    class: 'ai-key-input',
    value: getWorkspace(),
    placeholder: 'wrkspc_… — обычно не нужно',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'ID рабочего пространства',
  });
  const wsBox = h(
    'details',
    { class: 'ai-more', open: !!getWorkspace() },
    h('summary', {}, 'Ключ без привязки к рабочему пространству'),
    h(
      'p',
      { class: 'muted small' },
      'Если при создании ключа не выбрано рабочее пространство (Workspace), API требует его ID в каждом запросе. ID — в колонке ID на странице ',
      h('a', { href: CONSOLE_WORKSPACES_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Workspaces'),
      '. Проще — создать ключ сразу с привязкой, тогда поле оставьте пустым.',
    ),
    wsInput,
  );
  const status = h('p', { class: 'ai-key-status', 'aria-live': 'polite' });

  const modelList = h('div', { class: 'ai-models', role: 'radiogroup', 'aria-label': 'Модель' });
  const modelRow = (m) =>
    h(
      'label',
      { class: `ai-model ${m.id === model ? 'active' : ''}` },
      h('input', {
        type: 'radio',
        name: 'ai-model',
        value: m.id,
        checked: m.id === model,
        onchange: () => {
          model = m.id;
          renderModels();
        },
      }),
      h('span', {}, h('strong', {}, m.name), m.note ? h('small', {}, m.note) : null),
    );
  const renderModels = () => {
    clear(modelList);
    const current = models.filter((m) => !m.old);
    const old = models.filter((m) => m.old);
    for (const m of current.length ? current : models) modelList.append(modelRow(m));
    if (current.length && old.length) {
      modelList.append(h('details', { class: 'ai-more', open: old.some((m) => m.id === model) }, h('summary', {}, `Прежние модели (${old.length})`), ...old.map(modelRow)));
    }
  };
  renderModels();

  const effortList = h('div', { class: 'seg ai-effort', role: 'radiogroup', 'aria-label': 'Скорость ответа' });
  const effortNote = h('p', { class: 'muted small' });
  const renderEffort = () => {
    clear(effortList);
    for (const [id, label] of Object.entries(EFFORTS)) {
      effortList.append(
        h(
          'button',
          {
            type: 'button',
            class: `seg-btn ${id === effort ? 'active' : ''}`,
            role: 'radio',
            'aria-checked': String(id === effort),
            onclick: () => {
              effort = id;
              renderEffort();
            },
          },
          label,
        ),
      );
    }
    effortNote.textContent = `${EFFORTS[effort]} — ${EFFORT_NOTES[effort]}. Модель сама решает, сколько обдумывать ответ; это влияет на время и расход токенов.`;
  };
  renderEffort();

  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = `ai-key-status ${kind}`;
  };

  let modal;
  const save = async ({ force = false } = {}) => {
    const typed = keyInput.value.trim();
    const key = typed || had;
    const workspace = wsInput.value.trim();
    if (!key) {
      setStatus('Вставьте ключ API', 'bad');
      keyInput.focus();
      return false;
    }
    if (typed && !looksLikeKey(typed) && !force) {
      setStatus('Не похоже на ключ Anthropic: он начинается с sk-ant- и длиннее 30 символов.', 'bad');
      return false;
    }
    if (workspace && !/^wrkspc_[A-Za-z0-9]+$/.test(workspace)) {
      setStatus('ID рабочего пространства начинается с wrkspc_ — скопируйте его из консоли целиком.', 'bad');
      wsBox.open = true;
      return false;
    }
    if (!force) {
      setStatus('Проверяю ключ…');
      saveBtn.disabled = true;
      try {
        const list = await listModels({ key, workspace });
        models = saveModels(list);
        if (!models.some((m) => m.id === model)) model = getModel();
        renderModels();
      } catch (err) {
        saveBtn.disabled = false;
        setStatus(describeError(err), 'bad');
        if (err instanceof ApiError && err.needsWorkspace) {
          wsBox.open = true;
          wsInput.focus();
        }
        if (err instanceof TypeError) status.append(' ', h('button', { class: 'btn btn-small', onclick: () => save({ force: true }) }, 'Сохранить без проверки'));
        return false;
      }
      saveBtn.disabled = false;
    }
    if (typed) setKey(typed);
    setWorkspace(workspace);
    setModel(model);
    setEffort(effort);
    modal.close();
    app.toast(typed ? 'Claude подключён — пишите запрос во вкладке «ИИ»' : 'Настройки ИИ сохранены');
    onDone?.();
    return true;
  };
  const saveBtn = h('button', { class: 'btn btn-primary', onclick: () => save() }, icon('check', 16), had ? 'Сохранить' : 'Проверить и сохранить');
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
  });

  const content = h(
    'div',
    { class: 'ai-settings' },
    h(
      'p',
      { class: 'muted' },
      'Помощник работает на Claude через ваш личный ключ API. Ключ хранится только в этом браузере и отправляется только в api.anthropic.com — в проект, файлы и варианты он не попадает. Запросы оплачиваются с вашего счёта API по тарифам Anthropic.',
    ),
    h(
      'ol',
      { class: 'xch-steps' },
      h(
        'li',
        {},
        'Откройте ',
        h('a', { href: CONSOLE_KEYS_URL, target: '_blank', rel: 'noopener noreferrer' }, 'консоль Claude → API keys'),
        ' и создайте ключ: в поле Workspace выберите рабочее пространство (например, Default). Нужен пополненный баланс.',
      ),
      h('li', {}, 'Вставьте ключ сюда и нажмите «Проверить и сохранить».'),
    ),
    h('label', { class: 'xch-label' }, 'Ключ API'),
    h('div', { class: 'ai-key-row' }, keyInput, showBtn),
    wsBox,
    status,
    h('label', { class: 'xch-label' }, 'Модель'),
    modelList,
    h('label', { class: 'xch-label' }, 'Скорость и тщательность'),
    effortList,
    effortNote,
    h('p', { class: 'muted small' }, 'Не вводите ключ на чужих компьютерах. Если ключ мог утечь — отключите его в консоли Claude и создайте новый; срок действия ключа лучше ограничить при создании.'),
    h(
      'div',
      { class: 'xch-actions' },
      saveBtn,
      had
        ? h(
            'button',
            {
              class: 'btn btn-ghost',
              onclick: async () => {
                if (!(await app.confirm('Удалить ключ API из этого браузера?', 'Удалить'))) return;
                clearKey();
                modal.close();
                app.toast('Ключ удалён из браузера');
                onDone?.();
              },
            },
            icon('trash', 16),
            'Удалить ключ',
          )
        : null,
    ),
  );
  modal = openModal(app, { title: 'ИИ-помощник: подключение Claude', content });
  setTimeout(() => keyInput.focus(), 40);
  return modal;
}
