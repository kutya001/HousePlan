/**
 * 3D-просмотр: орбитальная камера, прогулка манекеном (от третьего и первого лица),
 * открывание дверей, выбор объектов кликом, подсветка выделения, тени.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CharacterMode } from './character/CharacterMode.js';
import { DoorAnimator } from './doors.js';
import { buildScene, disposeTree } from './SceneBuilder.js';
import { highlighted } from './materials.js';
import { levelElevation, getEntity, SITE_LEVEL, groundLevel } from '../model/project.js';

export class View3D {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.visible = false;
    this.dirty = true;
    this.framedOnce = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    // на телефонах ограничиваем плотность — плавнее и экономнее
    renderer.setPixelRatio(Math.min(app.state.coarse ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = 'view3d-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dde7ee');
    scene.fog = new THREE.Fog('#dde7ee', 120, 420);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(22, 18, 26);

    const hemi = new THREE.HemisphereLight('#f4f8fc', '#8c927f', 1.3);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff6e8', 2.2);
    sun.position.set(30, 45, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 400;
    this.controls.screenSpacePanning = true;

    this.doors = new DoorAnimator();
    this.character = new CharacterMode(this);

    this.root = null;
    this.refMeshes = new Map();
    this.highlightedMeshes = [];
    this._last = performance.now();

    this._bindEvents();
    const bus = app.bus;
    // во время перетаскивания пересобираем реже — план остаётся отзывчивым
    bus.on('project:changed', ({ reason }) => this.invalidate(reason === 'gesture' ? 160 : 30));
    bus.on('level:changed', () => {
      if (app.state.settings.cutaway || this.character.cutaway) this.invalidate();
    });
    bus.on('settings:changed', ({ key }) => {
      if (['cutaway', 'roofs3d', 'edges', 'furniture3d'].includes(key)) this.invalidate();
      if (key === 'shadows') {
        this.renderer.shadowMap.enabled = !!app.state.settings.shadows;
        this.invalidate();
      }
    });
    bus.on('selection:changed', () => this._applyHighlight());

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.renderer.shadowMap.enabled = !!app.state.settings.shadows;
    this._loop = this._loop.bind(this);
  }

  setVisible(v) {
    this.visible = v;
    if (v) {
      this.resize();
      if (this.dirty) this.rebuild();
      if (!this.framedOnce) {
        this.frame();
        this.framedOnce = true;
      }
      this._last = performance.now();
      requestAnimationFrame(this._loop);
    } else if (this.walking) this.character.stop();
  }

  get walking() {
    return this.character.active;
  }

  invalidate(delay = 30) {
    this.dirty = true;
    if (this.visible) {
      clearTimeout(this._rebuildTimer);
      this._rebuildTimer = setTimeout(() => this.rebuild(), delay);
    }
  }

  rebuild() {
    this.dirty = false;
    const { state, project } = this.app;
    if (this.root) {
      this.scene.remove(this.root);
      disposeTree(this.root);
    }
    const s = state.settings;
    this.root = buildScene(project, {
      activeLevelId: state.activeLevelId,
      cutaway: s.cutaway || this.character.cutaway,
      roofs: s.roofs3d,
      furniture: s.furniture3d,
      edges: s.edges,
    });
    this.scene.add(this.root);
    this.refMeshes.clear();
    this.highlightedMeshes = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.userData.ref) {
        const key = `${o.userData.ref.kind}:${o.userData.ref.id}`;
        if (!this.refMeshes.has(key)) this.refMeshes.set(key, []);
        this.refMeshes.get(key).push(o);
        o.userData.baseMaterial = o.material;
      }
    });
    this._fitShadow();
    this._applyHighlight();
    this.doors.attach(this.root);
    this.character.onProjectChanged();
    // первый дом в пустом проекте — показать его крупно
    const hasWalls = project.walls.length > 0;
    if (hasWalls && this._hadWalls === false) this.frame();
    this._hadWalls = hasWalls;
  }

  _fitShadow() {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.min(80, Math.max(size.x, size.z) * 0.6 + 5);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 200;
    cam.updateProjectionMatrix();
    this.sun.position.set(c.x + 30, 50, c.z + 22);
    this.sun.target.position.set(c.x, 0, c.z);
  }

  _applyHighlight() {
    this.character.cam?.resetFade();
    for (const m of this.highlightedMeshes) m.material = m.userData.baseMaterial;
    this.highlightedMeshes = [];
    for (const ref of this.app.state.selection) {
      for (const m of this.refMeshes.get(`${ref.kind}:${ref.id}`) || []) {
        if (ref.kind === 'site') continue;
        m.material = highlighted(m.userData.baseMaterial);
        this.highlightedMeshes.push(m);
      }
    }
  }

  /** Камера на весь дом (без участка, если дом есть). */
  frame() {
    const { project } = this.app;
    const box = new THREE.Box3();
    for (const w of project.walls) {
      box.expandByPoint(new THREE.Vector3(w.x1, 0, w.y1));
      box.expandByPoint(new THREE.Vector3(w.x2, levelElevation(project, w.levelId) + 3, w.y2));
    }
    if (box.isEmpty()) for (const p of project.site.boundary) box.expandByPoint(new THREE.Vector3(p.x, 0, p.y));
    if (box.isEmpty()) box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 3, 10));
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, size.y * 1.5) * 0.5 + 2;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distance = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05;
    const dir = new THREE.Vector3(0.62, 0.55, 0.85).normalize();
    this.controls.target.set(c.x, Math.min(c.y, 2), c.z);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, distance);
    this.controls.update();
  }

  /** Вид сверху. */
  topView() {
    const t = this.controls.target;
    const dist = this.camera.position.distanceTo(t);
    this.camera.position.set(t.x, t.y + dist, t.z + 0.001);
    this.controls.update();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.visible) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    this.doors.update(dt);
    if (this.walking) this.character.update(dt);
    else this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  // ── Прогулка ───────────────────────────────────────────────────────────

  /** Начать прогулку манекеном; at — точка плана на активном этаже. */
  startWalk({ at = null } = {}) {
    if (this.walking) return this.character.teleport(at);
    this.controls.enabled = false;
    this.character.start({ at });
    this.app.bus.emit('walk:changed', { walking: true });
  }

  stopWalk() {
    this.character.stop();
  }

  /** Манекен ушёл: орбитальная камера смотрит туда, где он стоял. */
  onWalkEnd() {
    this.controls.enabled = true;
    const c = this.character.ctrl;
    if (c) this.controls.target.set(c.pos.x, c.pos.y + 1, c.pos.z);
    if (this.camera.position.distanceTo(this.controls.target) < 2) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.camera.position.copy(this.controls.target).addScaledVector(dir, -4);
    }
    this.controls.update();
    this.invalidate(0);
    this.app.bus.emit('walk:changed', { walking: false });
  }

  keyDown(ev) {
    return this.character.keyDown(ev);
  }

  keyUp(ev) {
    this.character.keyUp(ev);
  }

  // ── Выбор кликом ───────────────────────────────────────────────────────

  _bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (ev) => {
      this._down = { x: ev.clientX, y: ev.clientY };
    });
    el.addEventListener('pointerup', (ev) => {
      if (!this._down || this.walking || ev.button !== 0) return;
      const moved = Math.hypot(ev.clientX - this._down.x, ev.clientY - this._down.y);
      this._down = null;
      if (moved < 4) this._pick(ev);
    });
    el.addEventListener('dblclick', () => {
      if (!this.walking) this.frameSelection();
    });
  }

  /** Объект проекта под курсором (без манекена). */
  pickRef(ev) {
    if (!this.root) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    for (const h of ray.intersectObject(this.root, true)) {
      let o = h.object;
      while (o && !o.userData.ref) o = o.parent;
      if (o) return o.userData.ref;
    }
    return null;
  }

  _pick(ev) {
    if (!this.root) return;
    const { state, project } = this.app;
    const ref = this.pickRef(ev);
    if (ref) {
      if (ref.kind === 'site') {
        state.clearSelection();
        return;
      }
      const e = getEntity(project, ref.kind, ref.id);
      let levelId = e?.levelId;
      if (ref.kind === 'opening') levelId = getEntity(project, 'wall', e?.wallId)?.levelId;
      if (ref.kind === 'zone' || levelId === SITE_LEVEL) levelId = groundLevel(project).id;
      // во время прогулки этаж задаёт манекен — не переключаем
      if (levelId && levelId !== state.activeLevelId && !this.walking) state.setLevel(levelId);
      state.select(ref, ev.shiftKey);
      return;
    }
    state.clearSelection();
  }

  /** Приблизить камеру к выделенному объекту. */
  frameSelection() {
    const sel = this.app.state.selection[0];
    if (!sel) return this.frame();
    const meshes = this.refMeshes.get(`${sel.kind}:${sel.id}`);
    if (!meshes?.length) return;
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.5 + 1;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, Math.max(3, r * 2.2));
    this.controls.update();
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
