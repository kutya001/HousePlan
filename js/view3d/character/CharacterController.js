/**
 * Управление манекеном: ходьба и бег с ускорением, прыжок и падение,
 * подъём по ступеням, залезание на уступ (до 1,4 м), сидение и лежание.
 * Физика — кинематическая: тело — вертикальная капсула, мир — CollisionWorld.
 * Координаты: x, z — план, y — высота ступней.
 */
import { PELVIS_Y } from './Mannequin.js';

const G = 9.81;
const RADIUS = 0.24;
const HEIGHT = 1.7;
const STEP_UP = 0.36;
const STEP_DOWN = 0.42;
const WALK = 1.45;
const RUN = 4.3;
const JUMP_V = 3.9; // ≈ 0,78 м над полом
const MANTLE_MAX = 1.4;

function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class CharacterController {
  constructor(world) {
    this.world = world;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.yaw = 0;
    this.grounded = true;
    this.mode = 'move'; // move | mantle | transition | sit | lie
    this.pose = 'stand'; // режим анимации
    this.support = null;
    this.visualY = 0;
    this.airTime = 0;
    this.stairTime = 0;
    this.anchor = null; // где сидит / лежит: { x, y, z, yaw, pelvisY, kind, floor }
    this.radius = RADIUS;
    this.height = HEIGHT;
  }

  setWorld(world) {
    this.world = world;
    // после правки плана: если оказались внутри предмета или стены — подвинуться
    if (this.mode === 'move') this._settle();
  }

  /** Поставить манекена в точку плана на самую высокую опору не выше maxY. */
  place(x, z, maxY = 100) {
    const sup = this.world.supportAt(x, z, maxY);
    this.pos = { x, y: sup.y, z };
    this.visualY = sup.y;
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.grounded = true;
    this.mode = 'move';
    this.anchor = null;
    this._settle();
  }

  _settle() {
    const r = this.world.resolve(this.pos.x, this.pos.z, this.radius, this.pos.y + STEP_UP, this.pos.y + this.height - 0.05, 6);
    this.pos.x = r.x;
    this.pos.z = r.z;
  }

  get forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /**
   * @param input { x, z — желаемое направление в мире (длина 0..1), run, jump (нажатие), faceYaw }
   * @returns события шага: { doorBump, landed, mantled }
   */
  update(dt, input) {
    const ev = {};
    if (this.mode === 'transition' || this.mode === 'mantle') this._updateTween(dt);
    else if (this.mode === 'move') {
      const steps = Math.max(1, Math.ceil(dt / 0.016));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this._step(h, input, ev, i === 0);
    } else if ((this.mode === 'sit' || this.mode === 'lie') && (Math.hypot(input.x, input.z) > 0.3 || input.jump)) {
      this.standUp();
    }
    // плавная высота модели: ступени не дёргают картинку
    const dy = this.pos.y - this.visualY;
    this.visualY = Math.abs(dy) > 0.7 || this.mode !== 'move' ? this.pos.y : this.visualY + dy * Math.min(1, dt * 16);
    this._pickPose(dt);
    return ev;
  }

  _step(h, input, ev, first) {
    const mag = Math.min(1, Math.hypot(input.x, input.z));
    const speed = (input.run ? RUN : WALK) * mag;
    const dir = mag > 1e-3 ? { x: input.x / Math.max(mag, 1e-6), z: input.z / Math.max(mag, 1e-6) } : { x: 0, z: 0 };
    const accel = this.grounded ? 12 : 2.5;
    const k = Math.min(1, accel * h);
    this.vel.x += (dir.x * speed - this.vel.x) * k;
    this.vel.z += (dir.z * speed - this.vel.z) * k;
    if (input.faceYaw != null) this.yaw = lerpAngle(this.yaw, input.faceYaw, Math.min(1, h * 14));
    else if (mag > 0.05) this.yaw = lerpAngle(this.yaw, Math.atan2(dir.x, dir.z), Math.min(1, h * 11));

    if (first && input.jump && this.grounded) {
      if (!this.tryMantle()) {
        this.vy = JUMP_V;
        this.grounded = false;
        this.airTime = 0;
      }
      if (this.mode !== 'move') return;
    }

    const p = this.pos;
    let x = p.x + this.vel.x * h;
    let z = p.z + this.vel.z * h;
    const lo = p.y + (this.grounded ? STEP_UP : 0.12);
    const res = this.world.resolve(x, z, this.radius, lo, p.y + this.height - 0.05);
    x = res.x;
    z = res.z;
    // под скатом мансарды, где не выпрямиться, не пройти (но выйти из низкого места можно)
    if (this.grounded) {
      const room = this.world.headroom(x, z, p.y);
      if (room < this.height - 0.08 && room < this.world.headroom(p.x, p.z, p.y) - 1e-3) {
        x = p.x;
        z = p.z;
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }
    for (const c of res.contacts) {
      if (c.kind === 'door' && mag > 0.2) ev.doorBump = c.doorId;
    }
    // упёрлись в препятствие — гасим скорость вдоль нормали
    const mx = x - p.x;
    const mz = z - p.z;
    if (res.contacts.length && h > 0) {
      this.vel.x = mx / h;
      this.vel.z = mz / h;
    }
    p.x = x;
    p.z = z;

    if (this.grounded) {
      const sup = this.world.supportAt(x, z, p.y + STEP_UP);
      if (sup.y >= p.y - STEP_DOWN) {
        if (sup.y > p.y + 0.05 || sup.solid?.kind === 'stair' || sup.solid?.kind === 'porch') this.stairTime = 0.35;
        p.y = sup.y;
        this.support = sup.solid;
        this.vy = 0;
      } else {
        this.grounded = false;
        this.vy = 0;
        this.airTime = 0;
      }
    }
    if (!this.grounded) {
      this.airTime += h;
      this.vy -= G * h;
      let ny = p.y + this.vy * h;
      if (this.vy > 0) {
        const ceil = this.world.ceilingAt(x, z, p.y + this.height - 0.02);
        if (ny + this.height > ceil) {
          ny = ceil - this.height;
          this.vy = 0;
        }
      }
      const sup = this.world.supportAt(x, z, Math.max(p.y, ny) + 0.02);
      if (ny <= sup.y) {
        ny = sup.y;
        this.vy = 0;
        this.grounded = true;
        this.support = sup.solid;
        ev.landed = this.airTime > 0.35;
      }
      p.y = ny;
      // в прыжке ударились о край невысокого уступа — залезть
      if (!this.grounded && mag > 0.4 && res.contacts.some((c) => c.y1 > p.y + STEP_UP * 0.5 && c.y1 <= p.y + 0.8)) {
        if (this.tryMantle()) ev.mantled = true;
      }
    }
  }

  /** Залезть на уступ впереди (стол, кровать, подоконник, высокая ступень). */
  tryMantle() {
    const f = this.forward;
    const p = this.pos;
    for (const d of [0.42, 0.55, 0.7]) {
      const qx = p.x + f.x * d;
      const qz = p.z + f.z * d;
      const sup = this.world.supportAt(qx, qz, p.y + MANTLE_MAX);
      const h = sup.y - p.y;
      if (h <= STEP_UP || h > MANTLE_MAX || !sup.solid) continue;
      if (!this.world.freeAt(qx, qz, this.radius * 0.85, sup.y + 0.05, sup.y + this.height - 0.1)) continue;
      this._tween({ x: qx, y: sup.y, z: qz }, this.yaw, 0.35 + h * 0.35, 'mantle', 'move');
      return true;
    }
    return false;
  }

  _tween(to, yaw, duration, kind, after) {
    this.tween = { from: { ...this.pos }, fromYaw: this.yaw, to, yaw, t: 0, duration, after };
    this.mode = kind;
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
  }

  _updateTween(dt) {
    const tw = this.tween;
    tw.t = Math.min(1, tw.t + dt / tw.duration);
    const k = tw.t * tw.t * (3 - 2 * tw.t);
    const f = tw.from;
    const to = tw.to;
    if (this.mode === 'mantle') {
      // сначала вверх, потом вперёд
      const up = Math.min(1, k * 1.6);
      const fw = Math.max(0, (k - 0.35) / 0.65);
      this.pos.y = f.y + (to.y - f.y) * up;
      this.pos.x = f.x + (to.x - f.x) * fw;
      this.pos.z = f.z + (to.z - f.z) * fw;
    } else {
      this.pos.x = f.x + (to.x - f.x) * k;
      this.pos.y = f.y + (to.y - f.y) * k;
      this.pos.z = f.z + (to.z - f.z) * k;
    }
    this.yaw = lerpAngle(tw.fromYaw, tw.yaw, k);
    if (tw.t >= 1) {
      this.mode = tw.after;
      this.tween = null;
      if (this.mode === 'move') {
        this.grounded = true;
        this.support = this.world.supportAt(this.pos.x, this.pos.z, this.pos.y + 0.05).solid;
      }
    }
  }

  /**
   * Сесть / лечь.
   * @param spot { point:{x,y}, yaw, height, floorY } — из seats.js; null — на пол
   */
  sitDown(spot) {
    this._rest('sit', spot);
  }

  lieDown(spot) {
    this._rest('lie', spot);
  }

  _rest(kind, spot) {
    if (this.mode !== 'move' || !this.grounded) return;
    this.standPos = { ...this.pos };
    const floor = !spot;
    let to;
    let yaw = this.yaw;
    let pelvisY;
    if (floor) {
      to = { ...this.pos };
      pelvisY = kind === 'lie' ? 0.11 - PELVIS_Y : null;
    } else {
      yaw = spot.yaw;
      const base = spot.floorY ?? this.pos.y;
      if (kind === 'sit') {
        to = { x: spot.point.x, y: base, z: spot.point.y };
        pelvisY = spot.height + 0.12 - PELVIS_Y;
      } else {
        to = { x: spot.point.x, y: base + spot.height, z: spot.point.y };
        pelvisY = 0.11 - PELVIS_Y;
      }
    }
    this.anchor = { kind, floor, pelvisY, spot };
    this._tween(to, yaw, floor ? 0.25 : 0.55, 'transition', kind);
  }

  standUp() {
    if (this.mode !== 'sit' && this.mode !== 'lie') return;
    const back = this.standPos || this.pos;
    let to = { ...back };
    if (!this.anchor?.floor) {
      // встать перед сиденьем, если там свободно, иначе — вернуться, откуда сели
      const f = this.forward;
      const qx = this.pos.x + f.x * 0.55;
      const qz = this.pos.z + f.z * 0.55;
      const sup = this.world.supportAt(qx, qz, back.y + STEP_UP);
      if (this.anchor?.kind === 'sit' && Math.abs(sup.y - back.y) < STEP_UP && this.world.freeAt(qx, qz, this.radius, sup.y + STEP_UP, sup.y + this.height)) {
        to = { x: qx, y: sup.y, z: qz };
      }
    }
    this.anchor = null;
    this._tween(to, this.yaw, 0.45, 'transition', 'move');
  }

  _pickPose(dt) {
    this.stairTime = Math.max(0, this.stairTime - dt);
    if (this.mode === 'mantle') return void (this.pose = 'mantle');
    const rest = this.mode === 'sit' || this.mode === 'lie' || (this.mode === 'transition' && this.anchor);
    if (rest) {
      const a = this.anchor;
      this.pose = a.kind === 'sit' ? (a.floor ? 'sitFloor' : 'sit') : a.floor ? 'lieFloor' : 'lie';
      this.pelvisY = a.pelvisY;
      return;
    }
    if (this.mode === 'transition') return void (this.pose = 'stand');
    if (!this.grounded && (this.airTime > 0.12 || this.vy > 0)) return void (this.pose = 'air');
    const v = this.speed;
    if (v < 0.18) this.pose = 'stand';
    else if (v > 2.6) this.pose = 'run';
    else this.pose = this.stairTime > 0 ? 'climb' : 'walk';
  }

  /** Состояние для анимации. */
  animState() {
    return {
      mode: this.pose,
      speed: this.speed,
      vy: this.vy,
      progress: this.tween?.t ?? 0,
      pelvisY: this.pelvisY,
    };
  }
}
