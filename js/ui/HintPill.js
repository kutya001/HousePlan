/**
 * Короткая подсказка поверх плана для сенсорных экранов
 * (на ПК подсказка живёт в строке состояния).
 */
export class HintPill {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.seen = new Set();
    root.addEventListener('click', () => this.hide());
    app.bus.on('tool:changed', ({ toolId }) => {
      const tool = app.editor.tools[toolId];
      if (!tool || toolId === 'select') return this.hide();
      // каждую подсказку показываем крупно только первые пару раз
      const text = tool.shortHint || '';
      const count = this._count(toolId);
      if (text && count < 3) this.show(text);
      else this.hide();
    });
    app.bus.on('hint:show', ({ text, sticky, touchOnly }) => {
      if (touchOnly && !app.state.coarse) return;
      if (!text) return this.hide();
      this.show(text, sticky);
    });
    app.bus.on('view:changed', () => this.hide());
  }

  get enabled() {
    return this.app.state.coarse || this.app.state.isPhone;
  }

  _count(id) {
    const key = `houseplan.hint.${id}`;
    let n = 0;
    try {
      n = Number(localStorage.getItem(key) || 0);
      localStorage.setItem(key, String(n + 1));
    } catch {
      /* не критично */
    }
    return n;
  }

  show(text, sticky = false) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.root.textContent = text;
    this.root.hidden = false;
    if (!sticky) this.timer = setTimeout(() => this.hide(), 4500);
  }

  hide() {
    clearTimeout(this.timer);
    this.root.hidden = true;
  }
}
