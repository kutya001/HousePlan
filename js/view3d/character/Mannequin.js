/**
 * Манекен ростом 170 см — шарнирная модель из простых тел, как деревянный
 * манекен художника. Модель смотрит вдоль +Z, левая сторона — +X,
 * ступни стоят на y = 0. Поза задаётся углами суставов (см. animation.js).
 *
 * Пропорции (м): тазобедренный сустав 0,90, колено 0,48, лодыжка 0,07,
 * плечо 1,39, локоть 1,09, запястье 0,84, глаза ≈1,60, макушка 1,70.
 */
import * as THREE from 'three';

export const HEIGHT = 1.7;
export const PELVIS_Y = 0.93;
export const EYE_Y = 1.6;
const THIGH = 0.42;
const SHIN = 0.41;
const UPPER_ARM = 0.3;
const FOREARM = 0.25;

const bodyMat = new THREE.MeshStandardMaterial({ color: '#dcb88d', roughness: 0.55, metalness: 0 });
const jointMat = new THREE.MeshStandardMaterial({ color: '#b48a5e', roughness: 0.5, metalness: 0 });

function part(geo, material = bodyMat) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function limb(radius, length) {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 6, 12);
  g.translate(0, -length / 2, 0);
  return part(g);
}

function ellipsoid(rx, ry, rz, y = 0, z = 0) {
  const g = new THREE.SphereGeometry(1, 20, 14);
  g.scale(rx, ry, rz);
  g.translate(0, y, z);
  return part(g);
}

function joint(r, y = 0) {
  const g = new THREE.SphereGeometry(r, 12, 10);
  g.translate(0, y, 0);
  return part(g, jointMat);
}

function node(parent, x, y, z) {
  const n = new THREE.Group();
  n.position.set(x, y, z);
  parent.add(n);
  return n;
}

export class Mannequin {
  constructor() {
    const root = new THREE.Group();
    root.name = 'mannequin';
    this.root = root;
    const j = {};
    j.body = node(root, 0, PELVIS_Y, 0);
    j.body.add(ellipsoid(0.16, 0.1, 0.11));

    j.spine = node(j.body, 0, 0.06, 0);
    j.spine.add(ellipsoid(0.13, 0.11, 0.1, 0.08));
    j.chest = node(j.spine, 0, 0.17, 0);
    j.chest.add(ellipsoid(0.175, 0.17, 0.11, 0.14));
    j.neck = node(j.chest, 0, 0.27, 0);
    const neckGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.1, 12);
    neckGeo.translate(0, 0.02, 0);
    this.neckMesh = part(neckGeo);
    j.neck.add(this.neckMesh);
    j.head = node(j.neck, 0, 0.06, 0);
    this.headMesh = ellipsoid(0.085, 0.115, 0.1, 0.095);
    j.head.add(this.headMesh);
    // «нос» — чтобы было видно, куда смотрит манекен
    const nose = new THREE.SphereGeometry(0.018, 8, 6);
    nose.translate(0, 0.08, 0.098);
    this.noseMesh = part(nose, jointMat);
    j.head.add(this.noseMesh);

    for (const [side, sx] of [
      ['l', 1],
      ['r', -1],
    ]) {
      const sh = node(j.chest, 0.19 * sx, 0.23, 0);
      sh.add(joint(0.052));
      sh.add(limb(0.046, UPPER_ARM));
      const el = node(sh, 0, -UPPER_ARM, 0);
      el.add(joint(0.042));
      el.add(limb(0.04, FOREARM));
      const wr = node(el, 0, -FOREARM, 0);
      const hand = new THREE.CapsuleGeometry(0.032, 0.09, 4, 8);
      hand.scale(1, 1, 0.6);
      hand.translate(0, -0.08, 0);
      wr.add(part(hand));
      j[`${side}Sh`] = sh;
      j[`${side}El`] = el;

      const hip = node(j.body, 0.09 * sx, -0.03, 0);
      hip.add(joint(0.068));
      hip.add(limb(0.07, THIGH));
      const kn = node(hip, 0, -THIGH, 0);
      kn.add(joint(0.056));
      kn.add(limb(0.052, SHIN));
      const an = node(kn, 0, -SHIN, 0);
      an.add(joint(0.04));
      const foot = new THREE.BoxGeometry(0.09, 0.06, 0.24);
      foot.translate(0, -0.04, 0.06);
      an.add(part(foot));
      j[`${side}Hip`] = hip;
      j[`${side}Knee`] = kn;
      j[`${side}Ank`] = an;
    }
    this.j = j;
    root.traverse((o) => {
      if (o.isMesh) o.userData.character = true;
    });
  }

  /** Применить позу: углы в радианах, смещения в метрах. */
  apply(p) {
    const j = this.j;
    j.body.position.set(0, PELVIS_Y + p.pelvisY, p.pelvisZ);
    j.body.rotation.set(p.bodyX, 0, p.bodyZ);
    j.spine.rotation.set(p.spineX, p.spineY, 0);
    j.chest.rotation.set(p.chestX, 0, 0);
    j.neck.rotation.set(p.neckX, p.neckY, 0);
    j.head.rotation.set(p.headX, 0, 0);
    j.lSh.rotation.set(p.lShX, 0, p.lShZ);
    j.rSh.rotation.set(p.rShX, 0, p.rShZ);
    j.lEl.rotation.set(p.lElX, 0, 0);
    j.rEl.rotation.set(p.rElX, 0, 0);
    j.lHip.rotation.set(p.lHipX, 0, p.lHipZ);
    j.rHip.rotation.set(p.rHipX, 0, p.rHipZ);
    j.lKnee.rotation.set(p.lKneeX, 0, 0);
    j.rKnee.rotation.set(p.rKneeX, 0, 0);
    j.lAnk.rotation.set(p.lAnkX, 0, 0);
    j.rAnk.rotation.set(p.rAnkX, 0, 0);
  }

  /** Полупрозрачный манекен — когда камера к нему вплотную. */
  setGhost(on) {
    if (on === this._ghost) return;
    this._ghost = on;
    for (const m of [bodyMat, jointMat]) {
      m.transparent = on;
      m.opacity = on ? 0.3 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
  }

  /** Голова и шея не мешают камере от первого лица. */
  setFirstPerson(on) {
    this.headMesh.visible = !on;
    this.neckMesh.visible = !on;
    this.noseMesh.visible = !on;
  }

  /** Мировая точка глаз (с учётом позы). */
  eyeWorld(target = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.j.head.localToWorld(target.set(0, 0.11, 0.06));
  }

  dispose() {
    this.setGhost(false);
    this.root.traverse((o) => o.geometry?.dispose());
  }
}
