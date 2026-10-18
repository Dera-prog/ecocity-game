// Live 3D wardrobe preview: a small second WebGL view with studio lighting,
// softbox reflections and a contact shadow so every edit reads clearly.

import * as THREE from 'three';
import { createCharacter } from './characters.js';

export class WardrobePreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.environment = this._studioEnv();
    this.scene.environmentIntensity = 0.55;

    const hemi = new THREE.HemisphereLight(0xf4faf5, 0x3a5a45, 1.0);
    const key = new THREE.DirectionalLight(0xfff8ee, 1.75);
    key.position.set(1.9, 3.2, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.8;
    key.shadow.camera.far = 7;
    key.shadow.camera.left = -1.3;
    key.shadow.camera.right = 1.3;
    key.shadow.camera.top = 2.0;
    key.shadow.camera.bottom = -0.6;
    key.shadow.bias = -0.0004;
    const rim = new THREE.DirectionalLight(0xc8e6cc, 0.85);
    rim.position.set(-2.2, 1.7, -2.4);
    const fill = new THREE.DirectionalLight(0xfff1e0, 0.55);
    fill.position.set(-1.4, 1.2, 2.8);
    const back = new THREE.DirectionalLight(0xffffff, 0.5);
    back.position.set(0.6, 2.6, -3.2);
    this.scene.add(hemi, key, rim, fill, back);

    // soft contact shadow under the feet — grounds the character like a studio floor
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.78, 48), new THREE.ShadowMaterial({ opacity: 0.26 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.004;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.camera = new THREE.PerspectiveCamera(35, 0.78, 0.05, 30);
    this.view = 'body';
    this.rotSpeed = 1;
    this.char = null;
    this._running = false;
    this._raf = 0;
    this._last = 0;
    this._frame();
  }

  /** neutral studio environment: three softboxes + bounce, baked to a PMREM */
  _studioEnv() {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x1c2a22);
    const target = new THREE.Vector3(0, 1.1, 0);
    const panel = (hex, strength, w, h, pos) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(strength), side: THREE.DoubleSide })
      );
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.lookAt(target);
      env.add(mesh);
    };
    panel(0xffffff, 6, 3.2, 2.2, [2.4, 3.4, 2.6]);
    panel(0xdff4e6, 2.6, 2.4, 3.0, [-2.8, 2.2, 1.6]);
    panel(0xffffff, 3.2, 2.0, 2.4, [-0.6, 2.8, -3.0]);
    panel(0xffe9c8, 1.6, 4.0, 1.2, [0, 0.4, 3.2]);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(env, 0.05);
    pmrem.dispose();
    env.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    return rt.texture;
  }

  setCharacter(assets, model, look, capHex, body = 'athletic') {
    if (this.char) this.scene.remove(this.char.root);
    this.char = createCharacter(assets, { model, capColor: capHex, look, body });
    this.char.root.rotation.y = 0;
    this.scene.add(this.char.root);
  }

  setLook(look, capHex) {
    if (!this.char) return;
    this.char.setCap(capHex);
    this.char.setLook(look);
  }

  setBody(typeId) {
    if (this.char) this.char.setBody(typeId);
  }

  setView(v) {
    this.view = v;
    // face view starts front-on so the face is immediately visible
    if (v === 'face' && this.char) this.char.root.rotation.y = 0;
    this._frame();
  }

  _frame() {
    if (this.view === 'face') {
      this.camera.position.set(0, 1.5, 0.95);
      this.camera.lookAt(0, 1.48, 0);
    } else {
      this.camera.position.set(0, 1.18, 3.3);
      this.camera.lookAt(0, 0.88, 0);
    }
  }

  resize() {
    const w = this.canvas.clientWidth || 240;
    const h = this.canvas.clientHeight || 320;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  renderOnce() { this.renderer.render(this.scene, this.camera); }

  start() {
    if (this._running) return;
    this._running = true;
    this.resize();
    const loop = t => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - (this._last || t)) / 1000);
      this._last = t;
      if (this.char) {
        const speed = (this.view === 'face' ? 0.22 : 0.6) * this.rotSpeed;
        this.char.root.rotation.y += dt * speed;
        this.char.setLocomotion(0);
        this.char.update(dt);
      }
      this.renderOnce();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { this._running = false; cancelAnimationFrame(this._raf); }

  dispose() {
    this.stop();
    if (this.char) this.scene.remove(this.char.root);
    this.char = null;
    this.renderer.dispose();
    if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
  }
}
