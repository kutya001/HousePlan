/**
 * Процедурная анимация манекена: поза считается из состояния (стоит, идёт,
 * бежит, поднимается по лестнице, в прыжке, залезает, сидит, лежит),
 * а затем плавно смешивается с текущей — переходы получаются сами.
 */
export const POSE_KEYS = [
  'pelvisY', 'pelvisZ', 'bodyX', 'bodyZ',
  'spineX', 'spineY', 'chestX', 'neckX', 'neckY', 'headX',
  'lShX', 'lShZ', 'lElX', 'rShX', 'rShZ', 'rElX',
  'lHipX', 'lHipZ', 'lKneeX', 'lAnkX', 'rHipX', 'rHipZ', 'rKneeX', 'rAnkX',
];

export function zeroPose() {
  const p = {};
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

const GAIT = {
  walk: { stride: 1.35, hip: 0.42, knee: 0.85, arm: 0.34, elbow: -0.3, lean: 0.04, bob: 0.028, lift: 0 },
  run: { stride: 2.5, hip: 0.78, knee: 1.65, arm: 0.85, elbow: -1.45, lean: 0.2, bob: 0.05, lift: 0 },
  climb: { stride: 1.05, hip: 0.5, knee: 1.25, arm: 0.3, elbow: -0.35, lean: 0.14, bob: 0.03, lift: 0.28 },
};

export class Animator {
  constructor() {
    this.cur = zeroPose();
    this.phase = 0;
    this.t = 0;
  }

  /**
   * @param s { mode, speed, vy, progress, pelvisY, lookPitch }
   *   mode: stand | walk | run | climb | air | mantle | sit | sitFloor | lie | lieFloor
   */
  update(dt, s) {
    this.t += dt;
    const p = zeroPose();
    const t = this.t;
    const gait = GAIT[s.mode];
    if (gait) {
      this.phase += (Math.max(0.3, s.speed) / gait.stride) * Math.PI * 2 * dt;
      const ph = this.phase;
      const sn = Math.sin(ph);
      const cs = Math.cos(ph);
      p.lHipX = -gait.hip * sn - gait.lift;
      p.rHipX = gait.hip * sn - gait.lift;
      p.lKneeX = 0.08 + gait.knee * Math.max(0, cs) + gait.lift;
      p.rKneeX = 0.08 + gait.knee * Math.max(0, -cs) + gait.lift;
      p.lAnkX = -0.25 * Math.max(0, -sn) * (s.mode === 'run' ? 1.4 : 1);
      p.rAnkX = -0.25 * Math.max(0, sn) * (s.mode === 'run' ? 1.4 : 1);
      p.lShX = gait.arm * sn;
      p.rShX = -gait.arm * sn;
      p.lShZ = 0.09;
      p.rShZ = -0.09;
      p.lElX = gait.elbow - (s.mode === 'run' ? 0 : 0.15 * Math.max(0, -sn));
      p.rElX = gait.elbow - (s.mode === 'run' ? 0 : 0.15 * Math.max(0, sn));
      p.spineX = gait.lean;
      p.spineY = 0.09 * sn;
      p.pelvisY = s.mode === 'run' ? -0.06 + gait.bob * Math.abs(cs) : -gait.bob * Math.abs(sn);
      p.neckX = -gait.lean * 0.6;
    } else if (s.mode === 'air') {
      const up = s.vy > 0;
      p.lHipX = -0.75;
      p.rHipX = up ? -0.25 : -0.1;
      p.lKneeX = 1.15;
      p.rKneeX = up ? 0.7 : 0.35;
      p.lShX = -0.9;
      p.rShX = -0.7;
      p.lShZ = 0.4;
      p.rShZ = -0.4;
      p.lElX = -0.45;
      p.rElX = -0.45;
      p.spineX = 0.1;
    } else if (s.mode === 'mantle') {
      const k = s.progress ?? 0;
      if (k < 0.45) {
        // тянется руками к краю
        p.lShX = p.rShX = -2.5;
        p.lShZ = 0.15;
        p.rShZ = -0.15;
        p.lElX = p.rElX = -0.25;
        p.lHipX = -0.35;
        p.rHipX = -0.1;
        p.lKneeX = 0.6;
        p.rKneeX = 0.3;
        p.spineX = 0.2;
      } else {
        // закидывает колено и выпрямляется
        p.lShX = p.rShX = -0.5;
        p.lElX = p.rElX = -1.1;
        p.lHipX = -1.7;
        p.lKneeX = 2.1;
        p.rHipX = -0.3;
        p.rKneeX = 0.9;
        p.spineX = 0.55;
        p.pelvisY = -0.18;
      }
    } else if (s.mode === 'sit') {
      p.pelvisY = s.pelvisY ?? -0.36;
      p.pelvisZ = -0.1;
      p.lHipX = p.rHipX = -1.52;
      p.lHipZ = 0.06;
      p.rHipZ = -0.06;
      p.lKneeX = p.rKneeX = 1.5;
      p.spineX = -0.04 + 0.012 * Math.sin(t * 1.5);
      p.lShX = p.rShX = -0.5;
      p.lShZ = 0.12;
      p.rShZ = -0.12;
      p.lElX = p.rElX = -0.85;
    } else if (s.mode === 'sitFloor') {
      p.pelvisY = -0.8;
      p.pelvisZ = -0.15;
      p.lHipX = p.rHipX = -1.42;
      p.lHipZ = 0.12;
      p.rHipZ = -0.12;
      p.lKneeX = p.rKneeX = 0.18;
      p.lAnkX = p.rAnkX = 0.35;
      p.spineX = -0.16 + 0.012 * Math.sin(t * 1.5);
      p.lShX = p.rShX = 0.5;
      p.lShZ = 0.28;
      p.rShZ = -0.28;
      p.neckX = 0.12;
    } else if (s.mode === 'lie' || s.mode === 'lieFloor') {
      p.bodyX = -Math.PI / 2;
      p.pelvisY = s.pelvisY ?? -0.82;
      p.lKneeX = p.rKneeX = 0.06;
      p.lHipZ = 0.05;
      p.rHipZ = -0.05;
      p.lShZ = 0.22;
      p.rShZ = -0.22;
      p.lElX = p.rElX = -0.15;
      p.lAnkX = p.rAnkX = 0.5;
      p.headX = 0.22;
      p.spineX = 0.01 * Math.sin(t * 1.3);
    } else {
      // стоит: дыхание и лёгкое покачивание
      p.spineX = 0.02 + 0.012 * Math.sin(t * 1.6);
      p.lShZ = 0.1;
      p.rShZ = -0.1;
      p.lShX = p.rShX = 0.04;
      p.lElX = p.rElX = -0.16;
      p.lKneeX = p.rKneeX = 0.03;
      p.neckY = 0.12 * Math.sin(t * 0.37) * Math.sin(t * 0.21);
    }
    if (s.lookPitch && !['lie', 'lieFloor'].includes(s.mode)) p.headX += Math.max(-0.5, Math.min(0.5, s.lookPitch * 0.5));

    // плавное смешивание с текущей позой
    const moving = !!gait;
    const k = 1 - Math.exp(-dt * (moving ? 20 : s.mode === 'air' || s.mode === 'mantle' ? 12 : 8));
    const cur = this.cur;
    for (const key of POSE_KEYS) cur[key] += (p[key] - cur[key]) * k;
    return cur;
  }
}
