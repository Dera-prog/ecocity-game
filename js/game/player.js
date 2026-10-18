// Player: input (keyboard + touch), movement, collision, third-person camera.

import * as THREE from 'three';
import { speedMultiplier } from './state.js';

const WALK_SPEED = 3.4;
const RUN_SPEED = 6.2;
const ACCEL = 20;
const DECEL = 26;
const RADIUS = 0.38;

export class PlayerController {
  constructor(camera, world, character, opts = {}) {
    this.camera = camera;
    this.world = world;
    this.character = character;
    this.enabled = false;
    this.onAction = null;
    this._modalOpen = opts.modalOpen || null;
    this._resolveGroundClick = opts.resolveGroundClick || null;
    this._resolveCharacterClick = opts.resolveCharacterClick || null;
    this._resolveLitterClick = opts.resolveLitterClick || null;
    this._resolveNpcClick = opts.resolveNpcClick || null;
    this.onNpcTalk = opts.onNpcTalk || null;
    this.onPickup = opts.onPickup || null;
    this.autoTargetFn = opts.autoTarget || null;
    this.onAutoWalkChange = opts.onAutoWalkChange || null;
    this.autoWalk = false;           // click the character → wanders on its own
    this._autoPause = 0;
    this.moveTarget = null;          // tap/click-to-walk destination
    this._tap = null;                // pointer-down record, distinguishes tap from camera drag
    this.speedScale = 1;
    this.velocity = new THREE.Vector3();
    this.facing = Math.PI;
    this.speed = 0;

    // camera rig
    this.camYaw = 0;
    this.camPitch = 0.34;
    this.camDist = 6.2;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this._camInit = false;

    // input state
    this.keys = {};
    this.joy = { x: 0, y: 0, active: false, id: null };
    this.touchRun = false;
    this._camDrag = { id: null, x: 0, y: 0 };
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this.bindInput(opts);
  }

  bindInput(opts) {
    window.addEventListener('keydown', e => {
      if (this._modalOpen && this._modalOpen()) return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === 'e' || k === ' ' || k === 'enter') {
        if (this.onAction) this.onAction();
        e.preventDefault();
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    const canvas = opts.canvas;
    canvas.addEventListener('wheel', e => {
      this.camDist = Math.max(3.4, Math.min(11, this.camDist + e.deltaY * 0.0035));
    }, { passive: true });

    // pointer handling: joystick element vs camera drag
    const joyEl = opts.joystickEl;
    const knob = opts.joystickKnob;

    const startJoy = (e, id) => {
      this.joy.active = true; this.joy.id = id;
      joyEl.classList.add('active');
    };
    const moveJoy = (e) => {
      const rect = joyEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const max = rect.width * 0.36;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / max;
      this.joy.y = dy / max;
    };
    const endJoy = () => {
      this.joy.active = false; this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
      knob.style.transform = 'translate(0,0)';
      joyEl.classList.remove('active');
    };

    window.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      if (joyEl && e.target.closest('#joystick')) { startJoy(e, e.pointerId); return; }
      if (e.target.closest('button, .mission-panel, #modal-root, .hud-btn, .action-btn, .run-btn')) return;
      this._tap = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() };
      if (this._camDrag.id === null) {
        this._camDrag.id = e.pointerId;
        this._camDrag.x = e.clientX; this._camDrag.y = e.clientY;
      }
    });
    window.addEventListener('pointermove', e => {
      if (!this.enabled) return;
      if (this.joy.id === e.pointerId) { moveJoy(e); return; }
      if (this._camDrag.id === e.pointerId) {
        const dx = e.clientX - this._camDrag.x, dy = e.clientY - this._camDrag.y;
        this._camDrag.x = e.clientX; this._camDrag.y = e.clientY;
        this.camYaw -= dx * 0.006;
        this.camPitch = Math.max(0.06, Math.min(1.15, this.camPitch + dy * 0.004));
      }
    });
    window.addEventListener('pointerup', e => {
      if (this.joy.id === e.pointerId) endJoy();
      if (this._camDrag.id === e.pointerId) this._camDrag.id = null;
      this._maybeWalk(e);
    });
    window.addEventListener('pointercancel', e => {
      if (this.joy.id === e.pointerId) endJoy();
      if (this._camDrag.id === e.pointerId) this._camDrag.id = null;
      this._tap = null;
    });
  }

  /** a short, still press on the scene walks to that spot — a drag is camera orbit */
  _maybeWalk(e) {
    const t = this._tap;
    this._tap = null;
    if (!t || t.id !== e.pointerId) return;
    if (!this.enabled || (this._modalOpen && this._modalOpen())) return;
    if (performance.now() - t.at > 450) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return;
    if (this._resolveCharacterClick && this._resolveCharacterClick(e.clientX, e.clientY)) {
      this.toggleAutoWalk();
      return;
    }
    if (this._resolveNpcClick) {
      const npc = this._resolveNpcClick(e.clientX, e.clientY);
      if (npc) {
        this.setAutoWalk(false);
        const p = npc.char.root.position;
        const d = Math.hypot(p.x - this.character.position.x, p.z - this.character.position.z);
        if (d <= 3.2) {
          if (this.onNpcTalk) this.onNpcTalk(npc);
        } else {
          this.moveTarget = { x: p.x, z: p.z, stall: 0, npc, arrive: 2.4 };
        }
        return;
      }
    }
    if (this._resolveLitterClick) {
      const item = this._resolveLitterClick(e.clientX, e.clientY);
      if (item) {
        this.setAutoWalk(false);
        this.moveTarget = { x: item.mesh.position.x, z: item.mesh.position.z, stall: 0, item };
        return;
      }
    }
    if (!this._resolveGroundClick) return;
    const pt = this._resolveGroundClick(e.clientX, e.clientY);
    if (pt) {
      this.setAutoWalk(false);
      this.moveTarget = { x: pt.x, z: pt.z, stall: 0 };
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.joy.x = 0; this.joy.y = 0; this.moveTarget = null; this.autoWalk = false; }
  }

  /** click the character: wander on its own; click again or take the controls to stop */
  setAutoWalk(on) {
    if (on === this.autoWalk) return;
    this.autoWalk = on;
    this.moveTarget = null;
    this._autoPause = on ? 0.45 : 0;
    if (this.onAutoWalkChange) this.onAutoWalkChange(on);
  }

  toggleAutoWalk() { this.setAutoWalk(!this.autoWalk); }

  /** external interface so UI buttons can reuse controller state */
  setTouchRun(on) { this.touchRun = on; }

  get moveInput() {
    let x = 0, y = 0;
    if (this.keys['w'] || this.keys['arrowup']) y += 1;
    if (this.keys['s'] || this.keys['arrowdown']) y -= 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, active: len > 0.05 };
  }

  get running() {
    return !!(this.keys['shift'] || this.touchRun);
  }

  update(dt) {
    const char = this.character;
    const pos = char.position;
    const input = this.enabled ? this.moveInput : { x: 0, y: 0, active: false };

    if (input.active) this.moveTarget = null;   // manual steering overrides click-to-walk
    if (input.active && this.autoWalk) this.setAutoWalk(false);

    // self-walking: pick a fresh nearby spot after each arrival pause
    if (this.autoWalk && !this.moveTarget && !input.active && this.autoTargetFn) {
      if (this._autoPause > 0) this._autoPause -= dt;
      else {
        const pt = this.autoTargetFn();
        if (pt) this.moveTarget = { x: pt.x, z: pt.z, stall: 0, auto: true };
      }
    }

    // camera-relative direction
    const f = { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
    const r = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) };
    let dirX = f.x * input.y + r.x * input.x;
    let dirZ = f.z * input.y + r.z * input.x;
    let active = input.active;

    if (this.moveTarget) {
      const dx = this.moveTarget.x - pos.x, dz = this.moveTarget.z - pos.z;
      const d = Math.hypot(dx, dz);
      const arrive = this.moveTarget.arrive || (this.moveTarget.item ? 0.9 : 0.42);
      if (d < arrive) {
        const tgt = this.moveTarget;
        this.moveTarget = null;
        if (tgt.auto && this.autoWalk) this._autoPause = 0.6 + Math.random() * 1.2;
        else if (tgt.item && this.onPickup) this.onPickup(tgt.item);
        else if (tgt.npc && this.onNpcTalk) this.onNpcTalk(tgt.npc);
      } else { dirX = dx / d; dirZ = dz / d; active = true; }
    }

    const base = this.running ? RUN_SPEED : WALK_SPEED;
    const maxSpeed = base * speedMultiplier() * this.speedScale;
    const targetVx = dirX * maxSpeed, targetVz = dirZ * maxSpeed;

    const rate = active ? ACCEL : DECEL;
    this.velocity.x += (targetVx - this.velocity.x) * Math.min(1, rate * dt);
    this.velocity.z += (targetVz - this.velocity.z) * Math.min(1, rate * dt);
    if (!active && Math.hypot(this.velocity.x, this.velocity.z) < 0.05) { this.velocity.x = 0; this.velocity.z = 0; }

    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;

    this.resolveCollisions(pos);
    this.world.clampToBounds(pos);

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    // give up the walk target when something blocks the way for a while
    if (this.moveTarget && active && !input.active) {
      if (this.speed < 0.35) {
        this.moveTarget.stall += dt;
        if (this.moveTarget.stall > 0.9) {
          if (this.moveTarget.auto && this.autoWalk) this._autoPause = 0.4;
          this.moveTarget = null;
        }
      } else this.moveTarget.stall = 0;
    }
    if (this.speed > 0.15) {
      const want = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = want - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, 12 * dt);
    }
    char.root.rotation.y = this.facing;
    char.setLocomotion(this.speed);
    char.update(dt);

    this.updateCamera(dt, pos);
  }

  resolveCollisions(pos) {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.world.colliders) {
        const nx = Math.max(c.minX, Math.min(c.maxX, pos.x));
        const nz = Math.max(c.minZ, Math.min(c.maxZ, pos.z));
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * RADIUS;
            pos.z = nz + (dz / d) * RADIUS;
          } else {
            // inside the box: push out along the smallest axis
            const pushL = pos.x - (c.minX - RADIUS), pushR = (c.maxX + RADIUS) - pos.x;
            const pushU = pos.z - (c.minZ - RADIUS), pushD = (c.maxZ + RADIUS) - pos.z;
            const m = Math.min(pushL, pushR, pushU, pushD);
            if (m === pushL) pos.x = c.minX - RADIUS;
            else if (m === pushR) pos.x = c.maxX + RADIUS;
            else if (m === pushU) pos.z = c.minZ - RADIUS;
            else pos.z = c.maxZ + RADIUS;
          }
        }
      }
    }
  }

  updateCamera(dt, pos) {
    this.camTarget.set(pos.x, pos.y + 1.45, pos.z);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const offset = new THREE.Vector3(Math.sin(this.camYaw) * cp, sp, Math.cos(this.camYaw) * cp);
    let desired = this.camTarget.clone().add(offset.multiplyScalar(this.camDist));

    // pull the camera in when a building blocks the view
    const dir = desired.clone().sub(this.camTarget);
    const maxT = this.raycastColliders(this.camTarget, dir);
    if (maxT < 1) desired = this.camTarget.clone().add(dir.multiplyScalar(Math.max(0.12, maxT)));
    if (desired.y < 0.5) desired.y = 0.5;

    if (!this._camInit) { this.camPos.copy(desired); this._camInit = true; }
    else this.camPos.lerp(desired, Math.min(1, 10 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.15, this.camTarget.z);
  }

  raycastColliders(origin, dir) {
    let best = 1;
    for (const c of this.world.colliders) {
      const t = segmentAABB(origin, dir, c.minX - 0.2, c.maxX + 0.2, c.minZ - 0.2, c.maxZ + 0.2);
      if (t !== null && t < best) best = t;
    }
    return best;
  }
}

function segmentAABB(o, d, minX, maxX, minZ, maxZ) {
  // 2D slab test on the XZ plane (colliders are tall enough that Y doesn't matter)
  let t0 = 0, t1 = 1;
  const axes = [[o.x, d.x, minX, maxX], [o.z, d.z, minZ, maxZ]];
  for (const [oi, di, lo, hi] of axes) {
    if (Math.abs(di) < 1e-8) {
      if (oi < lo || oi > hi) return null;
    } else {
      let a = (lo - oi) / di, b = (hi - oi) / di;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
  }
  return t0 > 0 ? t0 : null;
}
