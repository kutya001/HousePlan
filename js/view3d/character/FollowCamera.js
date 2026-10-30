/**
 * Камера прогулки: от третьего лица (за плечом) и от первого лица (из глаз манекена).
 * Стены, двери и мебель между камерой и манекеном становятся полупрозрачными,
 * а пол, крыша и лестницы — придвигают камеру ближе.
 * Поворот — мышью или пальцем, колесо — ближе / дальше; вплотную — вид из глаз.
 */
import * as THREE from 'three';

const MIN_DIST = 1.1;
const MAX_DIST = 9;
const SEE_THROUGH = new Set(['wall', 'opening', 'item']);
const fadeCache = new Map();

function faded(material) {
  if (!fadeCache.has(material.uuid)) {
    const m = material.clone();
    m.transparent = true;
    m.opacity = 0.16;
    m.depthWrite = false;
    m.userData.fadedFrom = material;
    fadeCache.set(material.uuid, m);
  }
  return fadeCache.get(material.uuid);
}

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // куда смотрит камера (как yaw персонажа)
    this.pitch = 0.42; // вниз — положительный
    this.dist = 3.8;
    this.curDist = 3.8;
    this.firstPerson = false;
    this.pivot = new THREE.Vector3();
    this.fadedMeshes = new Set();
    this._ray = new THREE.Raycaster();
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._dir2 = new THREE.Vector3();
  }

  rotate(dx, dy) {
    this.yaw -= dx;
    const lo = this.firstPerson ? -1.35 : -0.6;
    this.pitch = Math.max(lo, Math.min(1.35, this.pitch + dy));
  }

  zoom(factor) {
    if (this.firstPerson) {
      if (factor > 1) {
        this.firstPerson = false;
        this.dist = MIN_DIST + 0.3;
        this.pitch = Math.max(this.pitch, 0.1);
      }
      return;
    }
    this.dist = this.dist * factor;
    if (this.dist < MIN_DIST) {
      this.firstPerson = true;
      this.dist = MIN_DIST;
    }
    this.dist = Math.min(MAX_DIST, this.dist);
  }

  /** Направление «вперёд» камеры в плане. */
  get forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  /** Вектор «вправо» от взгляда камеры в плане. */
  get right() {
    return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
  }

  /** Вернуть материалы «прозрачных» стен (после пересборки сцены или выхода). */
  resetFade(restore = true) {
    if (restore) for (const m of this.fadedMeshes) if (m.material?.userData.fadedFrom) m.material = m.material.userData.fadedFrom;
    this.fadedMeshes.clear();
  }

  _fade(next) {
    for (const m of this.fadedMeshes) {
      if (!next.has(m) && m.material?.userData.fadedFrom) m.material = m.material.userData.fadedFrom;
    }
    for (const m of next) if (!m.material.userData.fadedFrom) m.material = faded(m.material);
    this.fadedMeshes = next;
  }

  /**
   * @param head — мировая точка головы манекена; eye — глаз
   * @param obstacles — объект сцены для проверки стен между камерой и манекеном
   */
  update(dt, head, eye, obstacles) {
    const cam = this.camera;
    if (this.firstPerson) {
      if (this.fadedMeshes.size) this._fade(new Set());
      cam.position.copy(eye);
      cam.rotation.set(-this.pitch, this.yaw + Math.PI, 0, 'YXZ');
      return;
    }
    // точка, вокруг которой вращается камера, — чуть выше и правее головы
    this.pivot.lerp(head, this.pivot.lengthSq() ? Math.min(1, dt * 14) : 1);
    const right = this.right;
    const piv = this._tmp.copy(this.pivot).add(new THREE.Vector3(right.x * 0.28, 0.12, right.z * 0.28));
    const cp = Math.cos(this.pitch);
    const dir = this._dir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    let want = this.dist;
    const fade = new Set();
    if (obstacles) {
      this._ray.set(piv, dir);
      this._ray.far = want + 0.2;
      const hits = this._ray.intersectObject(obstacles, true);
      for (const h of hits) {
        const m = h.object;
        if (!m.isMesh || m.userData.character) continue;
        let o = m;
        while (o && !o.userData.ref) o = o.parent;
        const kind = o?.userData.ref?.kind;
        // стены и мебель — сквозь них видно; остальное (пол, крыша, лестница) — придвигает камеру
        if (SEE_THROUGH.has(kind)) {
          if (!m.material?.transparent || m.material.userData.fadedFrom) fade.add(m);
          continue;
        }
        if (m.material?.transparent) continue;
        want = Math.max(0.35, h.distance - 0.22);
        break;
      }
    }
    // приближаемся сразу (чтобы не заглянуть за стену), отдаляемся плавно
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 3);
    cam.position.copy(piv).addScaledVector(dir, this.curDist);
    cam.lookAt(piv);
    // стены, закрывающие туловище и ноги, тоже делаем прозрачными
    if (obstacles) {
      for (const drop of [0.75, 1.3]) {
        const target = this._tmp2.copy(this.pivot).setY(this.pivot.y - drop);
        const d = this._dir2.copy(target).sub(cam.position);
        const len = d.length();
        if (len < 0.2) continue;
        this._ray.set(cam.position, d.multiplyScalar(1 / len));
        this._ray.far = len - 0.15;
        for (const h of this._ray.intersectObject(obstacles, true)) {
          const m = h.object;
          if (!m.isMesh) continue;
          let o = m;
          while (o && !o.userData.ref) o = o.parent;
          if (SEE_THROUGH.has(o?.userData.ref?.kind) && (!m.material?.transparent || m.material.userData.fadedFrom)) fade.add(m);
        }
      }
    }
    this._fade(fade);
  }
}
