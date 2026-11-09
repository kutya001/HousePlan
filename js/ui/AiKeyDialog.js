/**
 * Подключение Claude: ключ API и модель.
 * Ключ проверяется бесплатным запросом списка моделей и хранится только в этом браузере.
 */
import { h, icon, clear } from './dom.js';
import { openModal } from './feedback.js';
import { listModels, describeError } from '../ai/claudeClient.js';
import { getKey, setKey, clearKey, maskKey, looksLikeKey, getModels, saveModels, getModel, setModel } from '../ai/aiStore.js';

export const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys';

/** @param opts.onDone — вызывается после сохранения или удаления ключа */
export function openAiSettings(app, { onDone } = {}) {
  const had = getKey();
  let models = getModels();
  let model = getModel();

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
  const status = h('p', { class: 'ai-key-status', 'aria-live': 'polite' });
  const modelList = h('div', { class: 'ai-models', role: 'radiogroup', 'aria-label': 'Модель' });
  const renderModels = () => {
    clear(modelList);
    for (const m of models) {
      modelList.append(
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
        ),
      );
    }
  };
  renderModels();

  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = `ai-key-status ${kind}`;
  };

  let modal;
  const save = async ({ force = false } = {}) => {
    const typed = keyInput.value.trim();
    const key = typed || had;
    if (!key) {
      setStatus('Вставьте ключ API', 'bad');
      keyInput.focus();
      return false;
    }
    if (typed && !looksLikeKey(typed) && !force) {
      setStatus('Не похоже на ключ Anthropic: он начинается с sk-ant- и длиннее 30 символов.', 'bad');
      return false;
    }
    if (!force) {
      setStatus('Проверяю ключ…');
      saveBtn.disabled = true;
      try {
        const list = await listModels({ key });
        models = saveModels(list);
        if (!models.some((m) => m.id === model)) model = getModel();
        renderModels();
      } catch (err) {
        saveBtn.disabled = false;
        const net = err instanceof TypeError;
        setStatus(describeError(err), 'bad');
        if (net) status.append(' ', h('button', { class: 'btn btn-small', onclick: () => save({ force: true }) }, 'Сохранить без проверки'));
        return false;
      }
      saveBtn.disabled = false;
    }
    if (typed) setKey(typed);
    setModel(model);
    modal.close();
    app.toast(typed ? 'Claude подключён — пишите запрос во вкладке «ИИ»' : 'Модель сохранена');
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
      h('li', {}, 'Откройте ', h('a', { href: CONSOLE_KEYS_URL, target: '_blank', rel: 'noopener noreferrer' }, 'консоль Anthropic → API keys'), ' и создайте ключ (нужен пополненный баланс).'),
      h('li', {}, 'Вставьте ключ сюда и нажмите «Проверить и сохранить».'),
    ),
    h('label', { class: 'xch-label' }, 'Ключ API'),
    h('div', { class: 'ai-key-row' }, keyInput, showBtn),
    status,
    h('label', { class: 'xch-label' }, 'Модель'),
    modelList,
    h('p', { class: 'muted small' }, 'Не вводите ключ на чужих компьютерах. Если ключ мог утечь — удалите его в консоли Anthropic и создайте новый.'),
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
