/**
 * Всплывающее меню: контекстное (ПКМ / долгое нажатие), меню шапки, выбор этажа.
 * На телефоне показывается шторкой снизу — крупные пункты под большой палец.
 *
 * items: [{ label, icon, kbd, onClick, danger, disabled } | { separator: true }]
 */
import { h, icon } from './dom.js';

let current = null;

export function closeMenu() {
  current?.close();
}

/**
 * @param app
 * @param opts { x, y } — точка (клиентские координаты) или anchor — элемент;
 *             title, items, sheet (шторкой), align: 'left' | 'right'
 */
export function openMenu(app, opts) {
  closeMenu();
  const root = document.getElementById('popover-root');
  const prevFocus = document.activeElement;
  const sheet = !!opts.sheet;
  const overlay = h('div', { class: `ctx-overlay ${sheet ? 'sheet' : ''}` });
  const menu = h('div', { class: `ctx-menu ${sheet ? 'sheet' : ''}`, role: 'menu', 'aria-label': opts.title || 'Меню' });
  if (opts.title) menu.append(h('div', { class: 'ctx-title' }, opts.title));
  const buttons = [];
  for (const it of opts.items.filter(Boolean)) {
    if (it.separator) {
      menu.append(h('div', { class: 'ctx-sep', role: 'separator' }));
      continue;
    }
    const b = h(
      'button',
      {
        class: `ctx-item ${it.danger ? 'danger' : ''} ${it.active ? 'active' : ''}`,
        role: 'menuitem',
        disabled: it.disabled,
        onclick: () => {
          close();
          it.onClick?.();
        },
      },
      it.icon ? icon(it.icon, 18) : h('span', { class: 'icon', style: { width: '18px' } }),
      h('span', {}, it.label),
      it.kbd ? h('kbd', {}, it.kbd) : null,
      it.active ? icon('check', 16) : null,
    );
    buttons.push(b);
    menu.append(b);
  }

  const onKey = (e) => {
    const idx = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const enabled = buttons.filter((b) => !b.disabled);
      const i = enabled.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % enabled.length : (i - 1 + enabled.length) % enabled.length;
      enabled[next]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    }
  };

  function close() {
    if (!overlay.isConnected) return;
    overlay.remove();
    menu.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    app.modalOpen = false;
    if (current?.menu === menu) current = null;
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.({ preventScroll: true });
    opts.onClose?.();
  }

  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    close();
  });
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  root.append(overlay, menu);
  app.modalOpen = true;

  if (!sheet) {
    const r = menu.getBoundingClientRect();
    let x;
    let y;
    if (opts.anchor) {
      const a = opts.anchor.getBoundingClientRect();
      x = opts.align === 'right' ? a.right - r.width : a.left;
      y = a.bottom + 6;
      if (y + r.height > window.innerHeight - 8) y = a.top - r.height - 6;
    } else {
      x = opts.x;
      y = opts.y;
      if (x + r.width > window.innerWidth - 8) x = x - r.width;
      if (y + r.height > window.innerHeight - 8) y = Math.max(8, y - r.height);
    }
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x))}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
  requestAnimationFrame(() => (buttons.find((b) => !b.disabled) || menu).focus({ preventScroll: true }));
  current = { close, menu };
  return close;
}
