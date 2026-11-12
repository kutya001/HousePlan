/**
 * Небо и отражения. Небо — купол с плавным переходом от горизонта к зениту;
 * из него же собирается карта окружения: стекло, металл и глянец отражают небо
 * и землю, а тени получают мягкую подсветку. Цвета задаёт View3D по положению солнца.
 */
import * as THREE from 'three';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform float sunGlow;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  // горизонт светлее, к зениту — глубже; ниже горизонта — земля
  vec3 c = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
  // ореол вокруг солнца
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  c += vec3(1.0, 0.9, 0.7) * (pow(s, 64.0) * 0.6 + pow(s, 8.0) * 0.12) * sunGlow;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.uniforms = {
      zenith: { value: new THREE.Color('#6fa3dc') },
      horizon: { value: new THREE.Color('#dde7ee') },
      ground: { value: new THREE.Color('#b9c2ae') },
      sunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      sunGlow: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.dome.raycast = () => {};
    scene.add(this.dome);
    this.pmrem = null;
    this.envKey = '';
    this.envOn = true;
  }

  /** Купол всегда вокруг камеры. */
  follow(camera) {
    this.dome.position.copy(camera.position);
  }

  /**
   * @param c { zenith, horizon, ground: THREE.Color, sunDir: Vector3, day: 0…1 }
   */
  set(c) {
    this.uniforms.zenith.value.copy(c.zenith);
    this.uniforms.horizon.value.copy(c.horizon);
    this.uniforms.ground.value.copy(c.ground);
    this.uniforms.sunDir.value.copy(c.sunDir);
    this.uniforms.sunGlow.value = c.day;
    this.day = c.day;
    this._env();
  }

  /** Включить или выключить отражения (качество графики). */
  setEnv(on) {
    this.envOn = on;
    this.envKey = '';
    this._env();
  }

  /** Карта окружения из купола: пересобирается, только когда небо заметно изменилось. */
  _env() {
    const scene = this.scene;
    if (!this.envOn) {
      if (scene.environment) {
        scene.environment.dispose?.();
        scene.environment = null;
      }
      return;
    }
    const u = this.uniforms;
    const key = [u.zenith.value.getHexString(), u.horizon.value.getHexString(), u.ground.value.getHexString(), u.sunDir.value.toArray().map((v) => v.toFixed(1)).join(',')].join('|');
    if (key === this.envKey) return;
    this.envKey = key;
    try {
      this.pmrem ||= new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), this.dome.material);
      envScene.add(dome);
      const rt = this.pmrem.fromScene(envScene, 0.04);
      dome.geometry.dispose();
      scene.environment?.dispose?.();
      scene.environment = rt.texture;
      // ночью отражать нечего
      scene.environmentIntensity = 0.15 + 0.4 * (this.day ?? 1);
    } catch (err) {
      console.warn('Карта окружения не собралась', err);
      this.envOn = false;
    }
  }
}
