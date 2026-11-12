/**
 * 3D-просмотр: орбитальная камера, прогулка манекеном (от третьего и первого лица),
 * открывание дверей, выбор объектов кликом, подсветка выделения, тени.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CharacterMode } from './character/CharacterMode.js';
import { DoorAnimator } from './doors.js';
import { buildScene, disposeTree, applyCutaway, isShown } from './SceneBuilder.js';
import { siteGeo, solarPosition, azimuthVector } from '../geometry/sun.js';
import { highlighted } from './materials.js';
import { Lamps } from './lamps.js';
import { EditCard } from './EditCard.js';
import { Sky } from './sky.js';
import { setQuality } from './materials.js';
import { onModelLoaded } from './models.js';
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // кинематографичная передача яркости: светлые стены не «выгорают», тени глубже
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = 'view3d-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dde7ee');
    scene.fog = new THREE.Fog('#dde7ee', 120, 420);
    this.scene = scene;

    this.sky = new Sky(renderer, scene);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(22, 18, 26);

    const hemi = new THREE.HemisphereLight('#f4f8fc', '#8c927f', 1.3);
    scene.add(hemi);
    this.hemi = hemi;
    this._sunDir = new THREE.Vector3(30, 50, 22).normalize();
    this.night = 0; // 0 — день, 1 — ночь (для светильников)
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
    this.lamps = new Lamps(this);
    this.edit = new EditCard(app, this);
    // своя модель догрузилась из хранилища — пересобрать сцену
    onModelLoaded(() => this.invalidate(60));

    this.root = null;
    this.refMeshes = new Map();
    this.highlightedMeshes = [];
    this._last = performance.now();

    this._bindEvents();
    const bus = app.bus;
    // во время перетаскивания пересобираем реже — план остаётся отзывчивым
    bus.on('project:changed', ({ reason }) => this.invalidate(reason === 'gesture' ? 160 : 30));
    // разрез по этажу — видимость готовых групп, без пересборки
    bus.on('level:changed', () => this.applyCutaway());
    bus.on('settings:changed', ({ key }) => {
      if (key.startsWith('sun') || key === 'windowGlow') this.applySun();
      if (key === 'cutaway') this.applyCutaway();
      if (['roofs3d', 'edges', 'furniture3d', 'textures'].includes(key) || key.startsWith('layer_')) this.invalidate();
      if (key === 'shadows') {
        this.renderer.shadowMap.enabled = !!app.state.settings.shadows;
        this.invalidate();
      }
      if (key === 'quality') {
        this.applyQuality();
        this.invalidate();
      }
    });
    bus.on('selection:changed', () => this._applyHighlight());

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.renderer.shadowMap.enabled = !!app.state.settings.shadows;
    this.applyQuality();
    this.applySun();
    this._loop = this._loop.bind(this);
  }

  /**
   * Качество графики (Настройки): «быстрое» — для слабых телефонов, «высокое» — чёткие
   * тени и полное разрешение. Среднее — по умолчанию.
   */
  applyQuality() {
    const q = this.app.state.settings.quality || 'medium';
    const coarse = this.app.state.coarse;
    const dpr = window.devicePixelRatio || 1;
    const cap = q === 'low' ? 1 : q === 'high' ? (coarse ? 2 : 2.5) : coarse ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(cap, dpr));
    this.renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const size = q === 'low' ? 1024 : q === 'high' ? 4096 : 2048;
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x !== size) {
      shadow.mapSize.set(size, size);
      shadow.map?.dispose();
      shadow.map = null;
    }
    shadow.radius = q === 'high' ? 2.5 : 1.5;
    this.sky.setEnv(q !== 'low');
    setQuality(q);
    this.renderer.shadowMap.needsUpdate = true;
    if (this.visible) this.resize();
  }

  setVisible(v) {
    this.visible = v;
    this.edit?.render();
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

  /** Показать / скрыть этажи выше активного (кнопка «Разрез» и прогулка). */
  applyCutaway() {
    if (!this.root) return;
    const s = this.app.state;
    applyCutaway(this.root, this.app.project, s.activeLevelId, s.settings.cutaway || this.character.cutaway);
    this.character.cam?.resetFade();
    this.lamps?._assign();
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
      textures: s.textures !== false,
      layers: s,
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
    this.lamps.collect();
    this.applySun(); // и тени подгоняет под дом
    this._applyHighlight();
    this.doors.attach(this.root);
    this.character.onProjectChanged();
    this.edit.onRebuilt();
    // первый дом в пустом проекте — показать его крупно
    const hasWalls = project.walls.length > 0;
    if (hasWalls && this._hadWalls === false) this.frame();
    this._hadWalls = hasWalls;
  }

  /**
   * Точность буфера глубины зависит от отношения far/near: издалека стыки стен и
   * полов начинают «рябить». Ближнюю плоскость отодвигаем вместе с камерой.
   */
  _fitDepth() {
    const cam = this.camera;
    const d = cam.position.distanceTo(this.controls.target);
    const near = Math.min(2, Math.max(0.1, d * 0.02));
    const far = Math.max(400, d * 25);
    if (Math.abs(near - cam.near) / cam.near > 0.15 || Math.abs(far - cam.far) / cam.far > 0.15) {
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
  }

  _fitShadow() {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.min(80, Math.max(size.x, size.z, size.y) * 0.7 + 5);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    // низкое солнце даёт длинные тени — свет ставим по направлению на солнце
    const d = this._sunDir.clone();
    if (d.y < 0.08) d.y = 0.08;
    d.normalize().multiplyScalar(80);
    this.sun.position.set(c.x + d.x, c.y + d.y, c.z + d.z);
    this.sun.target.position.set(c.x, 0, c.z);
  }

  /**
   * Солнце по дате и времени (Настройки → «Солнце»): направление света и теней,
   * сумерки и ночь. Без этого — постоянный удобный свет «днём».
   */
  applySun() {
    const st = this.app.state.settings;
    const sky = new THREE.Color('#dde7ee');
    let sunI = 2.2;
    let hemiI = 1.3;
    const sunC = new THREE.Color('#fff6e8');
    const ground = new THREE.Color('#8c927f');
    this.night = 0;
    if (st.sunReal) {
      const geo = siteGeo(this.app.project.site);
      const p = solarPosition(geo, st.sunMonth || 6, st.sunDay || 21, st.sunHour ?? 14);
      const hv = azimuthVector(p.azimuth, geo.north);
      const el = p.elevation * (Math.PI / 180);
      this._sunDir.set(hv.x * Math.cos(el), Math.sin(el), hv.y * Math.cos(el)).normalize();
      this.sunInfo = p;
      // день (выше 12°) → сумерки → ночь (ниже −5°)
      const day = Math.max(0, Math.min(1, (p.elevation + 5) / 17));
      this.night = 1 - day;
      sunI = 2.4 * Math.max(0, Math.min(1, p.elevation / 12));
      hemiI = 0.22 + 1.08 * day;
      sunC.lerpColors(new THREE.Color('#ff9a5c'), new THREE.Color('#fff6e8'), Math.max(0, Math.min(1, p.elevation / 20)));
      sky.lerpColors(new THREE.Color('#121a27'), new THREE.Color('#dde7ee'), day);
      if (p.elevation > -5 && p.elevation < 8) sky.lerp(new THREE.Color('#e9b08a'), 0.35 * (1 - Math.abs(p.elevation - 1.5) / 6.5));
      ground.lerpColors(new THREE.Color('#2a2e36'), new THREE.Color('#8c927f'), day);
    } else {
      this._sunDir.set(30, 50, 22).normalize();
      this.sunInfo = null;
    }
    this.sun.intensity = sunI;
    this.sun.color.copy(sunC);
    this.sun.castShadow = sunI > 0.05 && !!st.shadows;
    this.hemi.intensity = hemiI;
    this.hemi.groundColor.copy(ground);
    this.hemi.color.lerpColors(new THREE.Color('#8fa6d6'), new THREE.Color('#f4f8fc'), 1 - this.night);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    // купол неба: у горизонта — цвет дымки, к зениту — синева (ночью — почти чёрный)
    const day = 1 - this.night;
    const zenith = new THREE.Color('#070b14').lerp(new THREE.Color('#5b95d6'), day);
    this.sky.set({ zenith, horizon: sky, ground: ground.clone().lerp(sky, 0.35), sunDir: this._sunDir, day });
    if (this.root) this._fitShadow();
    this.lamps?.update(this.night);
    this.app.bus.emit('sun:changed', { info: this.sunInfo, night: this.night });
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
    if (this.walking) {
      // в прогулке камера у самых стен — ближняя плоскость маленькая
      if (this.camera.near !== 0.08) {
        this.camera.near = 0.08;
        this.camera.far = 600;
        this.camera.updateProjectionMatrix();
      }
      this.character.update(dt);
    } else {
      this.controls.update();
      this._fitDepth();
    }
    this.lamps.tick();
    this.edit.tick();
    this.sky.follow(this.camera);
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
    if (ev.code === 'Escape' && this.edit.move) {
      this.edit.cancelMove();
      return true;
    }
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
      if (!isShown(h.object)) continue;
      // стена, которую камера прогулки сделала прозрачной, клик не перехватывает
      if (h.object.material?.userData?.fadedFrom) continue;
      let o = h.object;
      while (o && !o.userData.ref) o = o.parent;
      if (o) return o.userData.ref;
    }
    return null;
  }

  _pick(ev) {
    if (!this.root) return;
    // объект «в руке»: клик ставит его на место
    if (this.edit.move) return this.edit.confirmMove();
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

  /**
   * Снимок 3D-вида. scale > 1 — высокое качество: кадр рендерится крупнее
   * экрана (до 4096 px по длинной стороне) с более чёткими тенями.
   */
  screenshot({ scale = 1 } = {}) {
    const r = this.renderer;
    if (scale <= 1) {
      r.render(this.scene, this.camera);
      return r.domElement.toDataURL('image/png');
    }
    const prevRatio = r.getPixelRatio();
    const size = r.getSize(new THREE.Vector2());
    const k = Math.min(scale, 4096 / Math.max(size.x, size.y));
    const shadow = this.sun.shadow;
    const prevMap = shadow.mapSize.clone();
    try {
      r.setPixelRatio(k);
      r.setSize(size.x, size.y, false);
      shadow.mapSize.set(4096, 4096);
      shadow.map?.dispose();
      shadow.map = null;
      r.render(this.scene, this.camera);
      return r.domElement.toDataURL('image/png');
    } finally {
      r.setPixelRatio(prevRatio);
      r.setSize(size.x, size.y, false);
      shadow.mapSize.copy(prevMap);
      shadow.map?.dispose();
      shadow.map = null;
      r.render(this.scene, this.camera);
    }
  }
}
