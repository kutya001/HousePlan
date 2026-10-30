/** Всплывающие уведомления и модальные окна. */
import { h, icon } from './dom.js';

export function createToaster(root) {
  /**
   * @param text
   * @param kind 'info' | 'warn'
   * @param opts { action: { label, onClick }, duration }
   */
  return (text, kind = 'info', opts = {}) => {
    const el = h('div', { class: `toast toast-${kind} ${opts.action ? 'toast-action' : ''}`, role: 'status' }, h('span', {}, text));
    let timer;
    const hide = () => {
      clearTimeout(timer);
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    };
    if (opts.action) {
      el.append(
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              hide();
              opts.action.onClick();
            },
          },
          opts.action.label,
        ),
      );
    }
    root.append(el);
    while (root.children.length > 3) root.firstChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    timer = setTimeout(hide, opts.duration ?? (opts.action ? 5200 : kind === 'warn' ? 3800 : 2600));
  };
}

/**
 * Модальное окно.
 * @param app — для флага modalOpen (горячие клавиши отключаются)
 * @returns {{ close: Function, body: HTMLElement }}
 */
export function openModal(app, { title, content, actions = [], wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const prevFocus = document.activeElement;
  const body = h('div', { class: 'modal-body' });
  if (content) body.append(content);
  const close = () => {
    overlay.remove();
    app.modalOpen = false;
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.();
    onClose?.();
  };
  const footer = actions.length
    ? h(
        'div',
        { class: 'modal-actions' },
        actions.map((a) =>
          h(
            'button',
            {
              class: `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'}`,
              onclick: () => {
                if (a.onClick?.() !== false) close();
              },
            },
            a.label,
          ),
        ),
      )
    : null;
  const dialog = h(
    'div',
    { class: `modal ${wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', onclick: close }, icon('close'))),
    body,
    footer,
  );
  const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => e.target === overlay && close() }, dialog);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  root.append(overlay);
  app.modalOpen = true;
  requestAnimationFrame(() => (dialog.querySelector('[autofocus], .btn-primary, input, button') || dialog).focus());
  return { close, body };
}

export function confirmDialog(app, message, okLabel = 'Да') {
  return new Promise((resolve) => {
    let result = false;
    openModal(app, {
      title: 'Подтверждение',
      content: h('p', { class: 'modal-text' }, message),
      actions: [
        { label: 'Отмена', onClick: () => (result = false) },
        { label: okLabel, primary: true, onClick: () => (result = true) },
      ],
      onClose: () => resolve(result),
    });
  });
}
