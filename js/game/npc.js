// Lagos street life: the pickup sequence (truck + collection crew), danfo
// minibuses with conductors, big city buses with drivers, and pedestrians.

import * as THREE from 'three';
import { LAYOUT, makeTruckLiveryTexture } from './world.js';
import { createCharacter } from './characters.js';
import { sfx } from './audio.js';
import { truckDef } from './state.js';

const rand = (a, b) => a + Math.random() * (b - a);

/* ---------------- fleet truck (variant-aware) ---------------- */

export function buildTruck(def = truckDef('eco')) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: def.cab || '#eef2ee', roughness: 0.6 });
  const shell = new THREE.MeshStandardMaterial({ color: def.body || '#f4f7f3', roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.2, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: def.accent || '#2e7d32', roughness: 0.6 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.35, 1.7), dark);
  chassis.position.y = 0.55;
  g.add(chassis);

  // cab at the -X end (truck drives toward -X)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 1.7), white);
  cab.position.set(-2.0, 1.25, 0);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 1.5), glass);
  windshield.position.set(-2.6, 1.45, 0);
  const roofLights = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.4), new THREE.MeshStandardMaterial({ color: '#ffb300', emissive: '#ff8f00', emissiveIntensity: 0.8 }));
  roofLights.position.set(-2.55, 1.75, 0);
  g.add(cab, windshield, roofLights);

  const livery = makeTruckLiveryTexture(def);
  const sideMat = new THREE.MeshStandardMaterial({ map: livery, roughness: 0.65 });
  // ±z faces are the long sides seen from the street
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.75, 1.85), [
    shell, shell, shell, shell, sideMat, sideMat
  ]);
  cargo.position.set(0.65, 1.62, 0);
  cargo.castShadow = true;
  g.add(cargo);

  // accent skirts so each variant reads from a distance
  for (const dz of [-0.875, 0.875]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 0.06), trim);
    skirt.position.set(0.55, 0.62, dz);
    g.add(skirt);
  }

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#9e9e9e', metalness: 0.5, roughness: 0.4 });
  for (const [wx, wz] of [[-1.95, -0.85], [-1.95, 0.85], [0.4, -0.85], [0.4, 0.85], [1.35, -0.85], [1.35, 0.85]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(wheelGeo, hubMat);
    hub.scale.set(1, 0.5, 1);
    hub.position.set(wx, 0.42, wz);
    wheels.push(wheel);
    g.add(wheel, hub);
  }

  for (const dz of [-0.5, 0.5]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: '#fff8e1', emissive: '#ffee58', emissiveIntensity: 1 }));
    light.position.set(-2.72, 0.85, dz);
    g.add(light);
  }

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, cargo };
}

export class TruckSequence {
  constructor(scene, world, assets, callbacks = {}) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.cb = callbacks;
    this.active = false;
    this.truck = null;
    this.crew = null;
    this.wheelSpin = 0;
    this.scanBeam = null;
  }

  start(bags, def = truckDef('eco'), crewLook = null) {
    this.bags = bags;
    this.active = true;
    this.state = 'drive-in';
    this.timer = 0;
    this.speed = 0;

    const { group, wheels } = buildTruck(def);
    this.truck = { group, wheels };
    group.position.set(40, 0, LAYOUT.truckPathZ);
    this.scene.add(group);

    this.crew = createCharacter(this.assets, { model: 'soldier', look: crewLook || undefined, tint: crewLook ? undefined : 0x9fd6a5 });
    this.crew.visible = false;
    this.crew.root.position.set(-25.5, 0, 1.4);
    this.crew.root.rotation.y = Math.PI;
    this.crew.root.visible = false;
    this.scene.add(this.crew.root);

    this.cb.onStatus && this.cb.onStatus('way');
    sfx('horn');
  }

  /** fast-forward through the remaining animation */
  skip() {
    if (!this.active) return;
    if (this.state === 'waiting' || this.state === 'crew-back' || this.state === 'drive-out') return;
    this.truck.group.position.set(LAYOUT.truckStopX, 0, LAYOUT.truckPathZ);
    this.crew.root.visible = true;
    this.crew.root.position.set(LAYOUT.home.porch.x, 0, LAYOUT.home.porch.z + 0.6);
    this.crew.root.rotation.y = Math.PI;
    this.cb.onStatus && this.cb.onStatus('arrived');
    this.state = 'verify';
    this.timer = 1.85; // fires onVerified on the next update
  }

  continueAfterVerify() {
    if (!this.active) return;
    this.state = 'crew-back';
    this.timer = 0;
    if (this.scanBeam) { this.scene.remove(this.scanBeam); this.scanBeam = null; }
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    const tr = this.truck;

    switch (this.state) {
      case 'drive-in': {
        const from = 40, to = LAYOUT.truckStopX;
        const dur = 7.5;
        const k = Math.min(1, this.timer / dur);
        const ease = k * k * (3 - 2 * k);
        tr.group.position.x = from + (to - from) * ease;
        const speed = (from - to) * 6 * k * (1 - k) / dur; // smoothstep derivative
        this.wheelSpin -= speed * dt * 2.4;
        tr.wheels.forEach(w => w.rotation.z = this.wheelSpin);
        tr.group.position.y = Math.sin(this.timer * 9) * 0.012;
        if (k >= 1) {
          this.state = 'crew-out';
          this.timer = 0;
          this.crew.root.visible = true;
          this.crew.root.position.set(-25.5, 0, 1.4);
          this.cb.onStatus && this.cb.onStatus('arrived');
          sfx('pop');
        }
        break;
      }
      case 'crew-out': {
        // walk from the truck to the porch
        const target = new THREE.Vector3(LAYOUT.home.porch.x, 0, LAYOUT.home.porch.z + 0.6);
        const done = this.walkTo(this.crew, target, dt, 2.0);
        if (done) {
          this.state = 'verify';
          this.timer = 0;
          this.crew.play('idle', 0.25);
          this.crew.root.rotation.y = Math.PI; // face the house
          this.cb.onStatus && this.cb.onStatus('verifying');
          sfx('scan');
          // scan beam
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 2.2, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
          );
          beam.position.set(LAYOUT.home.porch.x, 1.1, LAYOUT.home.porch.z);
          this.scanBeam = beam;
          this.scene.add(beam);
        }
        break;
      }
      case 'verify': {
        this.crew.update(dt);
        if (this.scanBeam) {
          this.scanBeam.rotation.y += dt * 3;
          this.scanBeam.material.opacity = 0.25 + 0.15 * Math.sin(this.timer * 6);
        }
        if (this.timer > 1.8) {
          this.state = 'waiting';
          this.timer = 0;
          this.cb.onVerified && this.cb.onVerified(this.bags);
        }
        break;
      }
      case 'waiting':
        this.crew.update(dt);
        break;
      case 'crew-back': {
        const done = this.walkTo(this.crew, new THREE.Vector3(-25.6, 0, 1.5), dt, 2.2);
        if (this.timer > 1 && done) {
          this.crew.root.visible = false;
          this.state = 'drive-out';
          this.timer = 0;
        }
        break;
      }
      case 'drive-out': {
        const from = LAYOUT.truckStopX, to = 42;
        const dur = 6;
        const k = Math.min(1, this.timer / dur);
        tr.group.position.x = from + (to - from) * (k * k * 0.25 + k * 0.75);
        this.wheelSpin -= 5.5 * dt * 2.4;
        tr.wheels.forEach(w => w.rotation.z = this.wheelSpin);
        tr.group.position.y = Math.sin(this.timer * 9) * 0.012;
        if (k >= 1) {
          this.dispose();
          this.cb.onDone && this.cb.onDone();
        }
        break;
      }
      default: break;
    }
  }

  walkTo(char, target, dt, speed) {
    const pos = char.root.position;
    const dx = target.x - pos.x, dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) {
      char.setLocomotion(0);
      char.update(dt);
      return true;
    }
    const vx = (dx / dist) * speed, vz = (dz / dist) * speed;
    pos.x += vx * dt; pos.z += vz * dt;
    const yaw = Math.atan2(vx, vz);
    char.root.rotation.y = yaw;
    char.setLocomotion(speed);
    char.update(dt);
    return false;
  }

  dispose() {
    this.active = false;
    if (this.truck) { this.scene.remove(this.truck.group); this.truck = null; }
    if (this.crew) { this.scene.remove(this.crew.root); this.crew = null; }
    if (this.scanBeam) { this.scene.remove(this.scanBeam); this.scanBeam = null; }
  }
}

/* ---------------- Lagos buses ---------------- */

const CALLOUTS = [
  'Obalende! Obalende!',
  'Enter with your change!',
  'Ikeja! Ikeja! Ikeja!',
  'Oshodi — enter quick!',
  'CMS! Marina! CMS!',
  'Two more, we move!'
];

function makeCalloutTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.roundRect(6, 8, 500, 96, 22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(226, 104); ctx.lineTo(256, 126); ctx.lineTo(286, 104);
  ctx.fill();
  ctx.fillStyle = '#141414';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripeTexture(bg, stripes) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  for (const [y, h, col] of stripes) {
    ctx.fillStyle = col;
    ctx.fillRect(0, y, 512, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** yellow minibus — the classic Lagos danfo */
export function buildDanfo() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ map: stripeTexture('#f5c400', [[104, 12, '#141414']]), roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1c2a33', roughness: 0.15, metalness: 0.4 });

  // BoxGeometry face order: [+x, -x, +y, -y, +z, -z] — the ±z sides face the sidewalk
  const shell = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1.5, 1.8), [
    body, body, body, dark, body, body
  ]);
  shell.position.set(0, 1.02, 0);
  shell.castShadow = true;
  g.add(shell);

  // window band sits slightly wider so it reads on both sides
  const windows = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 1.86), glass);
  windows.position.set(-0.35, 1.52, 0);
  g.add(windows);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.6), glass);
  windshield.position.set(2.02, 1.5, 0);
  g.add(windshield);

  // roof rack with jerry cans
  const rack = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.5), dark);
  rack.position.set(-0.2, 1.82, 0);
  g.add(rack);
  for (const [jx, jz] of [[-1.2, 0.4], [1.0, -0.4]]) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#d84315', roughness: 0.7 }));
    can.position.set(jx, 1.98, jz);
    can.castShadow = true;
    g.add(can);
  }

  // open side door gap hint: darker recess on the +z side
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.05, 0.04), dark);
  door.position.set(-0.75, 0.95, 0.91);
  g.add(door);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  for (const [wx, wz] of [[1.35, -0.85], [1.35, 0.85], [-1.25, -0.85], [-1.25, 0.85]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.34, wz);
    wheel.castShadow = true;
    wheels.push(wheel);
    g.add(wheel);
  }

  for (const dz of [-0.55, 0.55]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: '#fff8e1', emissive: '#ffee58', emissiveIntensity: 1 }));
    light.position.set(2.08, 0.78, dz);
    g.add(light);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, length: 4.1, seatY: -0.34, driverX: 1.35, doorX: -0.75 };
}

/** big city bus — BRT-style with white/blue livery */
export function buildCityBus() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ map: stripeTexture('#f2f6f8', [[130, 40, '#1565c0'], [180, 10, '#0d47a1']]), roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#182c38', roughness: 0.14, metalness: 0.4 });

  // ±z faces carry the livery stripe; ends stay plain
  const shell = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.5, 2.3), [body, body, body, dark, body, body]);
  shell.position.set(0, 1.65, 0);
  shell.castShadow = true;
  g.add(shell);

  const windows = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.8, 2.36), glass);
  windows.position.set(-0.3, 2.25, 0);
  g.add(windows);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 2.05), glass);
  windshield.position.set(3.78, 2.05, 0);
  g.add(windshield);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.34, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.9 });
  for (const [wx, wz] of [[2.6, -1.1], [2.6, 1.1], [-1.4, -1.1], [-1.4, 1.1], [-2.6, -1.1], [-2.6, 1.1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.44, wz);
    wheel.castShadow = true;
    wheels.push(wheel);
    g.add(wheel);
  }
  for (const dz of [-0.7, 0.7]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.36), new THREE.MeshStandardMaterial({ color: '#fff8e1', emissive: '#ffee58', emissiveIntensity: 1 }));
    light.position.set(3.84, 0.9, dz);
    g.add(light);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, length: 7.6, seatY: -0.5, driverX: 3.1, doorX: -1.2 };
}

const PED_LOOKS = [
  { skin: 1, top: 6, bottom: 2, shoes: 1, hair: 4, hairColor: 1, brow: 2, browColor: 1, lips: 2, head: 0, glasses: 5, frame: 0, lens: 2, vest: 0 },
  { skin: 3, top: 2, bottom: 5, shoes: 0, hair: 2, hairColor: 2, brow: 0, browColor: 2, lips: 0, head: 2, glasses: 0, frame: 0, lens: 2, vest: 1 },
  { skin: 5, top: 8, bottom: 1, shoes: 6, hair: 3, hairColor: 4, brow: 4, browColor: 3, lips: 4, head: 0, glasses: 1, frame: 3, lens: 1, vest: 2 },
  { skin: 2, top: 11, bottom: 7, shoes: 3, hair: 1, hairColor: 5, brow: 1, browColor: 1, lips: 1, head: 0, glasses: 0, frame: 0, lens: 2, vest: 0 },
  { skin: 6, top: 4, bottom: 3, shoes: 5, hair: 0, hairColor: 0, brow: 3, browColor: 0, lips: 5, head: 3, glasses: 4, frame: 4, lens: 4, vest: 3 }
];

// danfo conductors present male on Lagos streets — male rig, short hair or headwear
const CONDUCTOR_LOOKS = [
  { skin: 1, top: 6, bottom: 2, shoes: 1, hair: 0, hairColor: 0, brow: 2, browColor: 1, lips: 0, head: 1, glasses: 0, frame: 0, lens: 2, vest: 0 },
  { skin: 3, top: 4, bottom: 1, shoes: 0, hair: 2, hairColor: 1, brow: 0, browColor: 0, lips: 0, head: 3, glasses: 0, frame: 0, lens: 2, vest: 0 },
  { skin: 2, top: 9, bottom: 2, shoes: 2, hair: 0, hairColor: 0, brow: 3, browColor: 1, lips: 0, head: 0, glasses: 0, frame: 0, lens: 2, vest: 0 }
];

/* ---------------- traffic system ---------------- */

export function createTraffic(scene, assets) {
  const vehicles = [];
  const calloutTexs = CALLOUTS.map(makeCalloutTexture);
  let hornCooldown = 0;

  const spawnVehicle = (kind, x, dir) => {
    const isBus = kind === 'bus';
    const built = isBus ? buildCityBus() : kind === 'eco' ? buildTruck(truckDef('eco')) : buildDanfo();
    const g = built.group;
    const v = {
      kind, dir,
      speed: isBus ? rand(5.5, 7) : rand(6.5, 9),
      group: g, wheels: built.wheels,
      spin: 0, calloutIdx: Math.floor(Math.random() * CALLOUTS.length), calloutT: rand(0, 3),
      chars: [], mixers: []
    };
    g.position.set(x, 0, dir > 0 ? 1.7 : -1.7);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    scene.add(g);

    if (kind === 'danfo' || isBus) {
      // driver behind the windshield
      const driverLook = PED_LOOKS[Math.floor(Math.random() * PED_LOOKS.length)];
      const driver = createCharacter(assets, { model: Math.random() > 0.5 ? 'michelle' : 'soldier', look: driverLook });
      driver.root.position.set(built.driverX, built.seatY, 0);
      driver.root.rotation.y = Math.PI / 2;
      driver.play('idle', 0);
      driver.update(1.2);           // offset the idle so drivers don't move in lockstep
      g.add(driver.root);
      v.chars.push(driver);
      v.mixers.push({ char: driver, live: true });
    }
    if (kind === 'danfo') {
      // conductor hanging out of the side door — the Lagos signature
      const conductor = createCharacter(assets, {
        model: 'soldier',
        capColor: '#e0a800',
        look: CONDUCTOR_LOOKS[v.calloutIdx % CONDUCTOR_LOOKS.length]
      });
      conductor.root.position.set(built.doorX, -0.18, 1.02);
      conductor.root.rotation.y = 0;
      g.add(conductor.root);
      v.chars.push(conductor);
      v.mixers.push({ char: conductor, live: true });

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: calloutTexs[v.calloutIdx], transparent: true }));
      sprite.scale.set(2.3, 0.575, 1);
      sprite.position.set(0.2, 2.75, 0.6);
      g.add(sprite);
      v.sprite = sprite;
    }
    vehicles.push(v);
    return v;
  };

  // five danfos, two city buses, one EcoCycle truck doing its rounds
  const fleet = [['danfo', -50], ['danfo', -28], ['danfo', -4], ['danfo', 20], ['danfo', 44],
                 ['bus', -38], ['bus', 12], ['eco', 34]];
  fleet.forEach(([kind, x], i) => spawnVehicle(kind, x, i % 2 === 0 ? 1 : -1));

  return {
    vehicles,
    update(dt, t, playerPos) {
      hornCooldown = Math.max(0, hornCooldown - dt);
      for (const v of vehicles) {
        v.group.position.x += v.dir * v.speed * dt;
        const limit = 62;
        if (v.group.position.x > limit && v.dir > 0) v.group.position.x = -limit;
        if (v.group.position.x < -limit && v.dir < 0) v.group.position.x = limit;
        v.group.position.y = Math.sin(t * 11 + v.spin) * 0.01;

        v.spin -= v.speed * dt * 2.6;
        v.wheels.forEach(w => w.rotation.z = v.spin);

        for (const m of v.mixers) {
          if (m.live) m.char.update(dt);
        }

        if (v.sprite) {
          v.calloutT -= dt;
          if (v.calloutT <= 0) {
            v.calloutT = rand(2.6, 4.6);
            v.calloutIdx = (v.calloutIdx + 1) % CALLOUTS.length;
            v.sprite.material.map = calloutTexs[v.calloutIdx];
            v.sprite.material.needsUpdate = true;
          }
          const d = playerPos ? Math.abs(v.group.position.x - playerPos.x) : 999;
          v.sprite.visible = d < 30;
        }

        // occasionally honk near the player
        if (playerPos && hornCooldown <= 0) {
          const d = Math.hypot(v.group.position.x - playerPos.x, v.group.position.z - playerPos.z);
          if (d < 9 && Math.random() < 0.02) {
            hornCooldown = rand(7, 14);
            sfx('horn');
          }
        }
      }
    }
  };
}

/* ---------------- ambient life ---------------- */

const NAMED_NPCS = [
  {
    id: 'mama-ngozi', name: 'Mama Ngozi', role: 'Market vendor · Stall 4',
    tagline: 'Fresh greens, clean gutters, no nylon.',
    model: 'michelle', tint: 0xf3c98a, x: 1.5, z: 8.9, yaw: -Math.PI / 2,
    speed: 0.62, activity: 'stall',
    zone: { x0: -1.1, x1: 4.4, z0: 8.3, z1: 9.2 },
    workZ: 8.9, shelter: { x: 1.5, z: 9.7 },
    habits: [['work', 5], ['stall', 3], ['social', 2], ['stroll', 1]],
    greet: 'Ah, welcome my dear! The street is looking better already.',
    lines: {
      pickup: ['Sharp! Keep it coming.', 'You see? Clean street, happy market.', 'That one goes to the Hub, not the gutter o.'],
      levelup: ['See this one o — proper EcoHero!', 'The whole market is proud of you!'],
      shelter: ['This rain! Come under the stall, quick.', 'Chai, the gutter is full. Stay dry!'],
      resume: ['Rain don stop. Back to business o.', 'Street is drying. Well done, my dear.']
    }
  },
  {
    id: 'dj-ada', name: 'DJ Ada', role: 'DJ · Festival hub',
    tagline: 'Afrobeats, good vibes, cleaner streets.',
    model: 'michelle', tint: 0xd9a1f0, x: 26, z: -2.4, yaw: Math.PI * 0.7,
    speed: 0.7, activity: 'dance',
    zone: { x0: 22.8, x1: 29.2, z0: -5.2, z1: -0.8 },
    shelter: { x: 24.2, z: -6.3 },
    habits: [['dance', 5], ['stroll', 2], ['social', 2], ['stall', 1]],
    greet: 'Ey! The EcoHero of the estate. Come nearer, let me see you!',
    lines: {
      pickup: ['Yes! That is the rhythm.', 'Clean streets, sweet sound. Keep going!'],
      levelup: ['Big up yourself! We celebrate tonight!', 'That is a hit! Level up, EcoHero!'],
      shelter: ['Rain on the beat? Everybody under the awning!', 'Hold up — storm passing through. Stay close.'],
      resume: ['Sun back out. Let us move!', 'We dry, we clean, we vibe.']
    }
  },
  {
    id: 'auntie-bisi', name: 'Auntie Bisi', role: 'Neighbour · Bus stop',
    tagline: 'Eyes on the street, ear on the danfo.',
    model: 'michelle', tint: 0xbfd6f0, x: -11, z: -7.35, yaw: Math.PI / 2,
    speed: 0.66, activity: 'busstop',
    zone: { x0: -13.4, x1: -7.2, z0: -8.1, z1: -6.9 },
    shelter: { x: -10.2, z: -8.5 },
    habits: [['busstop', 4], ['stall', 2], ['social', 2], ['stroll', 2]],
    greet: 'Ah ah, see this young person working hard! How you dey?',
    lines: {
      pickup: ['Correct! My gutter is breathing again.', 'Thank you, my dear. The whole street is watching.'],
      levelup: ['Chai! You are going far, I can see it.', 'Ehen! Hard work pays, no be lie.'],
      shelter: ['Come under the shelter — this rain is serious.', 'My wrapper is getting wet. Danfo, come now!'],
      resume: ['The sun is out again. Safe now.', 'Storm done pass. Let us keep the street clean.']
    }
  },
  {
    id: 'chidi', name: 'Chidi', role: 'EcoCycle crew · Bus stop',
    tagline: 'Collects bottles, knows every corner.',
    model: 'soldier', tint: 0xc9b28a, x: -9.1, z: -7.8, yaw: -Math.PI / 2,
    speed: 0.78, activity: 'busstop',
    zone: { x0: -13.2, x1: -5.6, z0: -8.4, z1: -7.1 },
    shelter: { x: -9.2, z: -8.5 },
    habits: [['stroll', 3], ['busstop', 3], ['social', 2], ['stall', 1]],
    greet: 'Hey! Good to see another pair of hands on the street.',
    lines: {
      pickup: ['Nice grab. That gutter fills up fast.', 'You are making my job easier today.'],
      levelup: ['Respect! The crew is going to hear about this.', 'Level up! Keep that energy.'],
      shelter: ['Under the shelter, quick. The drains are angry.', 'This rain is trouble. Stay with me.'],
      resume: ['Rain cleared. Let us check the drains.', 'Dry again. Back to work.']
    }
  }
];

const BUBBLE_FONT = '600 34px Poppins, Inter, sans-serif';

function makeBubbleTexture(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const maxText = 520;
  ctx.font = BUBBLE_FONT;
  const words = String(text).slice(0, maxText).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > 420 && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  const capLines = lines.slice(0, 3);
  c.width = 512;
  c.height = 96 + (capLines.length - 1) * 42;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const boxH = c.height - 28;
  g.fillStyle = 'rgba(13, 28, 19, 0.94)';
  g.strokeStyle = 'rgba(165, 214, 167, 0.45)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(12, 10, c.width - 24, boxH, 24);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(c.width / 2 - 14, 10 + boxH - 1);
  g.lineTo(c.width / 2, 10 + boxH + 20);
  g.lineTo(c.width / 2 + 14, 10 + boxH - 1);
  g.fill();
  g.fillStyle = '#ffc107';
  g.beginPath();
  g.roundRect(30, 10 + 16, 5, boxH - 32, 3);
  g.fill();
  g.font = BUBBLE_FONT;
  g.fillStyle = '#f4f8f1';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  capLines.forEach((l, i) => g.fillText(l, c.width / 2, 10 + boxH / 2 + (i - (capLines.length - 1) / 2) * 42));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createAmbientNpcs(scene, assets) {
  const npcs = [];
  const walkers = [];
  const named = [];
  let weather = 'clear';
  let clock = 0;

  const speak = (npc, text, dur = 3.6) => {
    if (!text) return;
    if (npc.bubble) {
      scene.remove(npc.bubble.sprite);
      npc.bubble.texture.dispose();
      npc.bubble.material.dispose();
      npc.bubble = null;
    }
    const texture = makeBubbleTexture(text);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    const w = 2.35;
    const h = w * (texture.image.height / texture.image.width);
    sprite.scale.set(w, h, 1);
    sprite.renderOrder = 8;
    const p = npc.char.root.position;
    sprite.position.set(p.x, 2.05 + h / 2, p.z);
    scene.add(sprite);
    npc.bubble = { sprite, texture, material, t: dur, dur };
  };

  const disposeBubble = npc => {
    if (!npc.bubble) return;
    scene.remove(npc.bubble.sprite);
    npc.bubble.texture.dispose();
    npc.bubble.material.dispose();
    npc.bubble = null;
  };

  const updateBubble = (npc, dt) => {
    if (!npc.bubble) return;
    const b = npc.bubble;
    b.t -= dt;
    const p = npc.char.root.position;
    b.sprite.position.set(p.x, 2.05 + b.sprite.scale.y / 2, p.z);
    b.material.opacity = Math.min(1, b.t / 0.5);
    if (b.t <= 0) disposeBubble(npc);
  };

  const faceToward = (npc, target) => {
    const p = npc.char.root.position;
    npc.char.root.rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
  };

  const walkToward = (npc, target, dt) => {
    const p = npc.char.root.position;
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.22) { npc.char.setLocomotion(0); return true; }
    const speed = npc.speed || 0.7;
    p.x += (dx / d) * speed * dt;
    p.z += (dz / d) * speed * dt;
    npc.char.root.rotation.y = Math.atan2(dx, dz);
    npc.char.setLocomotion(speed);
    return false;
  };

  const pickWeighted = list => {
    const total = list.reduce((sum, item) => sum + item[1], 0);
    let roll = Math.random() * total;
    for (const [kind, weight] of list) {
      roll -= weight;
      if (roll <= 0) return kind;
    }
    return list[0][0];
  };

  const pick = list => list[Math.floor(Math.random() * list.length)];

  const startDance = (npc, dur) => {
    npc.char.playDance(dur);
    npc.brain.state = 'dance';
    npc.brain.t = dur;
    npc.activity = 'dance';
    npc.char.setExpression('playful');
  };

  const badWeather = () => weather === 'storm' || weather === 'flood' || weather === 'rain';

  const goShelter = npc => {
    if (npc.talk) return;
    npc.brain.state = 'shelter';
    npc.brain.t = 999;
    npc.brain.target = { ...npc.cfg.shelter };
    npc.brain.afterArrive = 'shelter';
    npc.activity = 'shelter';
    npc.char.setExpression('worried');
    npc.mood = 'worried';
    speak(npc, pick(npc.cfg.lines.shelter), 4.2);
  };

  const chooseBehavior = npc => {
    const b = npc.brain;
    const cfg = npc.cfg;
    if (badWeather()) { goShelter(npc); return; }
    const kind = pickWeighted(cfg.habits);
    b.state = 'idle';
    b.afterArrive = '';
    npc.char.lookAt(null);
    switch (kind) {
      case 'work': {
        b.target = { x: rand(cfg.zone.x0, cfg.zone.x1), z: cfg.workZ || cfg.zone.z1 };
        b.afterArrive = 'work';
        npc.activity = 'stall';
        npc.char.setExpression('cheerful');
        break;
      }
      case 'stroll': {
        b.target = { x: rand(cfg.zone.x0, cfg.zone.x1), z: rand(cfg.zone.z0, cfg.zone.z1) };
        b.afterArrive = 'stroll';
        npc.activity = 'stroll';
        break;
      }
      case 'social': {
        let best = null, bestD = 13;
        for (const other of named) {
          if (other === npc) continue;
          const p = other.char.root.position;
          const d = Math.hypot(p.x - npc.char.root.position.x, p.z - npc.char.root.position.z);
          if (d < bestD) { bestD = d; best = other; }
        }
        if (best) {
          const op = best.char.root.position;
          b.target = { x: op.x + (Math.random() < 0.5 ? -0.9 : 0.9), z: op.z + 0.7 };
          b.afterArrive = 'social';
          b.socialWith = best;
          npc.activity = 'talk';
        } else {
          b.t = 2;
          b.state = 'stall';
          npc.activity = cfg.activity;
        }
        break;
      }
      case 'dance': {
        startDance(npc, rand(6, 11));
        break;
      }
      case 'busstop': {
        b.target = { x: rand(cfg.zone.x0 + 1, cfg.zone.x1 - 1), z: cfg.shelter.z + rand(-0.3, 0.5) };
        b.afterArrive = 'busstop';
        npc.activity = 'busstop';
        break;
      }
      default: {
        b.state = 'stall';
        b.t = rand(3, 6);
        npc.activity = cfg.activity;
        if (Math.random() < 0.4) npc.char.emote(pick(['nod', 'wave', 'shrug']));
        break;
      }
    }
    if (b.target) {
      if (b.afterArrive === 'shelter') npc.activity = 'shelter';
      else if (b.afterArrive === 'social') npc.activity = 'talk';
      else if (b.afterArrive === 'work') npc.activity = 'stall';
      else npc.activity = 'stroll';
      if (b.state !== 'shelter') b.state = 'walk';
    }
  };

  const updateNamed = (npc, dt, playerPos) => {
    const b = npc.brain;
    npc.reactCooldown = Math.max(0, npc.reactCooldown - dt);
    if (npc.moodT > 0) {
      npc.moodT -= dt;
      if (npc.moodT <= 0) npc.char.setExpression(badWeather() ? 'worried' : 'cheerful');
    }

    if (npc.talk) {
      npc.char.setLocomotion(0);
      npc.char.lookAt(playerPos ? { x: playerPos.x, y: playerPos.y + 1.35, z: playerPos.z } : null);
      npc.activity = 'talk';
      npc.char.update(dt);
      updateBubble(npc, dt);
      return;
    }

    if (b.target) {
      const arrived = walkToward(npc, b.target, dt);
      if (arrived) {
        const after = b.afterArrive;
        b.target = null;
        b.afterArrive = '';
        npc.char.setLocomotion(0);
        if (after === 'social') {
          if (b.socialWith) faceToward(npc, b.socialWith.char.root.position);
          b.state = 'social';
          b.t = rand(3.5, 6.5);
          npc.activity = 'talk';
          npc.char.setExpression('cheerful');
          if (Math.random() < 0.55) npc.char.emote(pick(['nod', 'laugh']));
        } else if (after === 'shelter') {
          b.state = 'shelter';
          b.t = 999;
          npc.activity = 'shelter';
        } else if (after === 'work') {
          b.state = 'work';
          b.t = rand(2.5, 5);
          npc.activity = 'stall';
          npc.char.setExpression('cheerful');
          if (Math.random() < 0.3) npc.char.emote('nod');
        } else if (after === 'busstop') {
          b.state = 'busstop';
          b.t = rand(4, 8);
          npc.activity = 'busstop';
          npc.char.root.rotation.y = 0.2;   // watch the road
        } else {
          b.state = 'idle';
          b.t = rand(2, 4.5);
        }
      }
    } else {
      if (b.state !== 'dance') npc.char.setLocomotion(0);
      b.t -= dt;
      if (b.t <= 0) {
        if (b.state === 'shelter' && badWeather()) {
          b.t = 3;
        } else if (b.state === 'shelter') {
          b.state = 'idle';
          b.t = rand(2, 4);
          npc.char.setExpression('cheerful');
          npc.activity = npc.cfg.activity;
        } else {
          chooseBehavior(npc);
        }
      } else if (b.state === 'dance' && Math.random() < dt * 0.2) {
        npc.char.emote('cheer');
      }
    }

    // face and greet a nearby player
    const p = npc.char.root.position;
    const dist = playerPos ? Math.hypot(playerPos.x - p.x, playerPos.z - p.z) : 999;
    if (dist < 4.6) {
      npc.char.lookAt({ x: playerPos.x, y: playerPos.y + 1.35, z: playerPos.z });
      if (dist < 2.7 && !npc.talk && !badWeather() && clock > npc.greetAt) {
        npc.greetAt = clock + 24;
        faceToward(npc, playerPos);
        npc.char.emote(pick(['wave', 'nod']));
        npc.char.setExpression('cheerful');
        speak(npc, npc.cfg.greet, 4);
      }
    } else {
      npc.char.lookAt(null);
    }

    npc.char.update(dt);
    updateBubble(npc, dt);
    npc.x = p.x;
    npc.z = p.z;
  };

  for (const cfg of NAMED_NPCS) {
    const char = createCharacter(assets, { model: cfg.model, tint: cfg.tint });
    char.root.position.set(cfg.x, 0, cfg.z);
    char.root.rotation.y = cfg.yaw;
    scene.add(char.root);
    char.setExpression('cheerful');
    const npc = {
      id: cfg.id, personaId: cfg.id, name: cfg.name, role: cfg.role, tagline: cfg.tagline,
      char, cfg, x: cfg.x, z: cfg.z, walker: false, talk: false,
      speed: cfg.speed, activity: cfg.activity, mood: 'cheerful',
      brain: { state: 'idle', t: rand(1.5, 4.5), target: null, afterArrive: '', socialWith: null },
      bubble: null, greetAt: rand(4, 12), reactCooldown: 0, moodT: 0
    };
    npcs.push(npc);
    named.push(npc);
  }

  // pedestrians strolling the sidewalks in wardrobe-fresh outfits
  const paths = [
    { z: 4.3, x0: -52, x1: 52 },
    { z: -6.7, x0: -52, x1: 52 }
  ];
  for (let i = 0; i < 5; i++) {
    const path = paths[i % paths.length];
    const dir = i % 2 === 0 ? 1 : -1;
    const char = createCharacter(assets, { model: i % 2 === 0 ? 'michelle' : 'soldier', look: PED_LOOKS[i % PED_LOOKS.length] });
    char.root.position.set(rand(path.x0 + 6, path.x1 - 6), 0, path.z);
    char.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const mood = pick(['calm', 'cheerful', 'curious']);
    char.setExpression(mood);
    scene.add(char.root);
    walkers.push({ char, path, dir, speed: rand(0.9, 1.35) });
    npcs.push({ char, name: 'Pedestrian', x: char.root.position.x, z: path.z, walker: true, talk: false });
  }

  return {
    npcs,
    named,
    walkers,
    /** NPCs you can start a live conversation with */
    talkable: () => named,
    findByName: name => named.find(n => n.name === name) || null,
    setTalking(npc, on) {
      if (!npc) return;
      npc.talk = !!on;
      if (on) {
        npc.brain.target = null;
        npc.brain.afterArrive = '';
        npc.char.setLocomotion(0);
        npc.char.setExpression('curious');
        npc.activity = 'talk';
      } else {
        npc.char.setExpression(badWeather() ? 'worried' : 'calm');
        npc.char.lookAt(null);
        npc.brain.state = badWeather() ? 'shelter' : 'idle';
        npc.brain.t = rand(1, 3);
        npc.brain.target = badWeather() ? { ...npc.cfg.shelter } : null;
        npc.brain.afterArrive = badWeather() ? 'shelter' : '';
        npc.activity = npc.cfg.activity;
      }
    },
    setWeather(next) {
      if (!next || next === weather) return;
      const wasBad = badWeather();
      weather = next;
      const isBad = badWeather();
      if (isBad && !wasBad) {
        for (const npc of named) goShelter(npc);
      } else if (!isBad && wasBad) {
        for (const npc of named) {
          if (npc.talk) continue;
          npc.char.setExpression('cheerful');
          npc.mood = 'cheerful';
          npc.brain.state = 'idle';
          npc.brain.t = rand(1, 3);
          npc.brain.target = null;
          npc.brain.afterArrive = '';
          npc.activity = npc.cfg.activity;
          if (Math.random() < 0.7) speak(npc, pick(npc.cfg.lines.resume), 3.6);
        }
      }
    },
    react(kind, playerPos) {
      for (const npc of named) {
        if (npc.talk || npc.reactCooldown > 0) continue;
        const p = npc.char.root.position;
        if (playerPos && Math.hypot(playerPos.x - p.x, playerPos.z - p.z) > 16) continue;
        const lines = npc.cfg.lines[kind];
        if (!lines || !lines.length) continue;
        if (kind === 'pickup' && Math.random() > 0.45) { npc.reactCooldown = 2; continue; }
        npc.reactCooldown = kind === 'levelup' ? 7 : 10;
        npc.moodT = 6;
        npc.char.setExpression(kind === 'levelup' ? 'excited' : 'proud');
        npc.char.emote(kind === 'levelup' ? 'cheer' : pick(['wave', 'nod', 'laugh']));
        speak(npc, pick(lines), 3.4);
      }
    },
    update(dt, playerPos) {
      clock += dt;
      for (const npc of named) updateNamed(npc, dt, playerPos);
      for (const w of walkers) {
        const p = w.char.root.position;
        p.x += w.dir * w.speed * dt;
        if (p.x > w.path.x1) { w.dir = -1; w.char.root.rotation.y = -Math.PI / 2; }
        if (p.x < w.path.x0) { w.dir = 1; w.char.root.rotation.y = Math.PI / 2; }
        w.char.setLocomotion(w.speed);
        w.char.update(dt);
      }
      for (const n of npcs) {
        if (!n.walker) continue;
        n.x = n.char.root.position.x;
        n.z = n.char.root.position.z;
      }
    }
  };
}
