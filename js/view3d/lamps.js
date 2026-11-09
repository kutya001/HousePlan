/**
 * Вечерний свет: светильники из слоя «Электрика» зажигаются, когда солнце
 * садится (View3D.applySun → update(night)), окна светятся тёплым светом.
 * Источников света — небольшой постоянный пул (меняется только их положение),
 * чтобы шейдеры не перекомпилировались: берутся светильники ближе к камере.
 */
import * as THREE from 'three';
import { catalogItem } from '../model/catalog.js';
import { itemElevation, itemVisible } from '../model/layers.js';
import { levelElevation, levelIndex, SITE_LEVEL } from '../model/project.js';
import { setLampGlow } from './materials.js';

const POOL = 8;

export class Lamps {
  constructor(view) {
    this.view = view;
    this.lights = [];
    this.spots = [];
    this.k = 0;
    this._frame = 0;
  }

  /** После пересборки сцены: где стоят светильники. */
  collect() {
    const { project, state } = this.view.app;
    this.spots = [];
    for (const it of project.items) {
      const c = catalogItem(it.type);
      if (!c?.lamp || !itemVisible(state.settings, it)) continue;
      const base = it.levelId === SITE_LEVEL ? 0 : levelElevation(project, it.levelId);
      // потолочный — чуть ниже плафона, бра — перед ним
      const y = base + itemElevation(project, it) + (c.ceiling ? -0.08 : it.h * 0.5);
      const off = c.ceiling ? 0 : 0.25;
      const r = ((it.rotation || 0) * Math.PI) / 180;
      this.spots.push({
        pos: new THREE.Vector3(it.x - Math.sin(r) * off, y, it.y + Math.cos(r) * off),
        level: it.levelId === SITE_LEVEL ? 0 : levelIndex(this.view.app.project, it.levelId),
        power: c.ceiling ? (it.type === 'spot_light' ? 10 : 22) : 9,
      });
    }
    this._assign();
  }

  update(night) {
    this.k = night;
    setLampGlow(night, this.view.app.state.settings.windowGlow !== false);
    this._assign();
  }

  tick() {
    // раз в полсекунды переназначаем ближние к камере светильники
    if (!this.lights.length || this.k < 0.05) return;
    if (++this._frame % 30 === 0) this._assign();
  }

  _assign() {
    if (this.k < 0.05 && !this.lights.length) return;
    if (!this.spots.length && !this.lights.length) return;
    if (!this.lights.length) {
      for (let i = 0; i < POOL; i++) {
        const l = new THREE.PointLight('#ffd49a', 0, 9, 2);
        l.castShadow = false;
        this.view.scene.add(l);
        this.lights.push(l);
      }
    }
    const { app } = this.view;
    const cut = app.state.settings.cutaway || this.view.character?.cutaway ? levelIndex(app.project, app.state.activeLevelId) : Infinity;
    const cam = this.view.camera.position;
    const list = this.spots.filter((s) => s.level <= cut).sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam));
    this.lights.forEach((l, i) => {
      const s = list[i];
      if (s && this.k > 0.05) {
        l.position.copy(s.pos);
        l.intensity = this.k * s.power;
      } else l.intensity = 0;
    });
  }
}
