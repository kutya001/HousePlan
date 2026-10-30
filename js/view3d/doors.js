/**
 * Открывание дверей в 3D. Состояние (открыта / закрыта) живёт здесь,
 * а не в проекте: это действие «жильца», а не правка плана. Сцена
 * пересобирается целиком — после пересборки створки возвращаются в своё положение.
 */
const SPEED = 2.2; // доля полного хода в секунду

export class DoorAnimator {
  constructor() {
    this.state = new Map(); // id → { target: 0|1, amount }
    this.nodes = new Map(); // id → parts[]
  }

  /** Найти двери в новой сцене и поставить створки в текущее положение. */
  attach(root) {
    this.nodes.clear();
    root?.traverse((o) => {
      const d = o.userData.door;
      if (d) this.nodes.set(d.id, d.parts);
    });
    for (const id of this.nodes.keys()) this._apply(id);
  }

  amount(id) {
    return this.state.get(id)?.amount ?? 0;
  }

  isOpen(id) {
    return (this.state.get(id)?.target ?? 0) > 0.5;
  }

  /** Проходима ли дверь сейчас (открыта больше чем наполовину). */
  passable(id) {
    return this.amount(id) > 0.55;
  }

  set(id, open) {
    const s = this.state.get(id) || { target: 0, amount: 0 };
    s.target = open ? 1 : 0;
    this.state.set(id, s);
  }

  toggle(id) {
    this.set(id, !this.isOpen(id));
    return this.isOpen(id);
  }

  closeAll() {
    for (const s of this.state.values()) s.target = 0;
  }

  /** @returns {boolean} что-то двигалось (нужна перерисовка) */
  update(dt) {
    let moved = false;
    for (const [id, s] of this.state) {
      if (Math.abs(s.amount - s.target) < 1e-4) continue;
      const step = SPEED * dt;
      s.amount = s.amount < s.target ? Math.min(s.target, s.amount + step) : Math.max(s.target, s.amount - step);
      this._apply(id);
      moved = true;
    }
    return moved;
  }

  _apply(id) {
    const parts = this.nodes.get(id);
    if (!parts) return;
    const a = this.amount(id);
    // плавный разгон и торможение створки
    const e = a * a * (3 - 2 * a);
    for (const p of parts) {
      const m = p.motion;
      if (m.type === 'swing') p.node.rotation.y = m.angle * e;
      else if (m.type === 'slide') p.node.position.x = p.base.x + m.dx * e;
      else if (m.type === 'lift') p.node.position.y = p.base.y + m.dy * e;
    }
  }
}
