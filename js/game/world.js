// The neighbourhood: street, drainage gutter, EcoHub, market, EcoHome,
// litter spawning, and the rain / flood system.

import * as THREE from 'three';
import { ITEMS, CATS } from './state.js';
import { BIN_META } from './icons.js';

export const LAYOUT = {
  bounds: { minX: -57, maxX: 57, minZ: -33.5, maxZ: 33.5 },
  street: { z0: -3.5, z1: 3.5, x0: -58, x1: 58 },
  gutter: { z0: -6.0, z1: -3.6, x0: -58, x1: 58, wallH: 0.35 },
  hub: { x0: 16, x1: 30, z0: -14, z1: -7.4, frontZ: -7.4 },
  station: { x: 20.5, z: -6.2 },       // sorting station interact point
  eduKiosk: { x: 27.5, z: -6.4 },
  home: { x0: -28, x1: -20, z0: 10, z1: 16, porch: { x: -24, z: 9.1 }, gate: { x: -24, z: 8.4 } },
  market: [
    { x: -5.5, z: 10.5 }, { x: -1.5, z: 10.5 }, { x: 2.5, z: 10.5 }, { x: 6.5, z: 10.5 }
  ],
  busStop: { x: -10, z: -8.0 },
  truckPathZ: 2.6,
  truckStopX: -25.5,
  spawn: { x: -24, z: 6.8 },
  festival: { x: 26, z: -2.4 },
  // the Lagos landmarks ringing the estate
  malls: [
    { name: 'IKEJA CITY MALL', tag: 'SHOPRITE · SILVERBIRD · FOOD COURT', x0: 40, x1: 57, z0: -30, z1: -16, h: 9, color: '#e8e2d6', accent: '#c8102e' },
    { name: 'KAF MALL', tag: 'FASHION · CINEMA · FOOD COURT', x0: -57, x1: -41, z0: -29, z1: -15.5, h: 8, color: '#dcd3c4', accent: '#f26522' },
    { name: 'THE PALMS', tag: 'LEKKI SHOPPING CENTRE', x0: 41, x1: 57, z0: 16, z1: 29, h: 7.5, color: '#cfd8dc', accent: '#004b8d' },
    { name: 'MARYLAND MALL', tag: 'SHOP · DINE · PLAY', x0: -47, x1: -34, z0: 18, z1: 29, h: 6.5, color: '#e3d9c8', accent: '#2e7d32' }
  ],
  companies: [
    { name: 'MTN', tag: 'EVERYWHERE YOU GO', color: '#ffcb05', fg: '#101010', x: -52, h: 13 },
    { name: 'GTBank', tag: 'GUARANTY TRUST', color: '#f57c00', fg: '#ffffff', x: -44, h: 11 },
    { name: 'DANGOTE', tag: 'GROUP', color: '#1c3f94', fg: '#ffffff', x: -36, h: 14 },
    { name: 'Nestlé', tag: 'GOOD FOOD, GOOD LIFE', color: '#1b4f9c', fg: '#ffffff', x: -28, h: 10 },
    { name: 'Glo', tag: 'RULE YOUR WORLD', color: '#79c142', fg: '#ffffff', x: -20, h: 12 },
    { name: 'ZENITH', tag: 'BANK', color: '#c8102e', fg: '#ffffff', x: -12, h: 11 },
    { name: 'Coca-Cola', tag: 'TASTE THE FEELING', color: '#e61a27', fg: '#ffffff', x: -2, h: 9 },
    { name: 'NIGERIAN BREWERIES', tag: 'STAR · GULDER · HEINEKEN', color: '#0e7a3c', fg: '#ffffff', x: 8, h: 13 },
    { name: 'ACCESS', tag: 'MORE THAN BANKING', color: '#0b3f8f', fg: '#ffffff', x: 18, h: 10 },
    { name: 'CHICKEN REPUBLIC', tag: 'TASTY · CRISPY', color: '#c8102e', fg: '#ffffff', x: 28, h: 8 },
    { name: 'TRACE TV', tag: 'AFROBEATS', color: '#101010', fg: '#f5c400', x: 38, h: 9 },
    { name: 'LAWMA', tag: 'KEEP LAGOS CLEAN', color: '#00695c', fg: '#ffffff', x: 48, h: 7 }
  ],
  streetNames: ['Agege Motor Road', 'Oshodi–Apapa Expressway', 'Herbert Macaulay Way', 'Allen Avenue', 'Adeola Odeku Street', 'Broad Street', 'Marina Road', 'Awolowo Road', 'Bode Thomas Street'],
  pickupPoints: [
    { x: -44, z: -4.7, name: 'Oshodi Agent Point' },
    { x: -6, z: 4.7, name: 'Allen Avenue Agent Point' },
    { x: 34, z: -4.7, name: 'Ikeja Agent Point' },
    { x: 50, z: 4.7, name: 'Marina Agent Point' }
  ]
};

const rand = (a, b) => a + Math.random() * (b - a);

function canvasTex(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function drawRecycleEmblem(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * 2 * Math.PI) / 3 - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r);                       // arrow tip
    ctx.lineTo(r * 0.62, -r * 0.1);
    ctx.lineTo(r * 0.28, -r * 0.1);
    ctx.lineTo(r * 0.28, r * 0.62);
    ctx.lineTo(-r * 0.28, r * 0.62);
    ctx.lineTo(-r * 0.28, -r * 0.1);
    ctx.lineTo(-r * 0.62, -r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function wallTexture(cssColor, windowColor = '#2b3a44') {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 0; i < 90; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    // window grid
    const cols = 4, rows = 4, pad = s * 0.12, w = (s - pad * 2.6) / cols - 8, h = s * 0.12;
    for (let cx = 0; cx < cols; cx++) {
      for (let ry = 0; ry < rows; ry++) {
        const x = pad + cx * (w + 12), y = pad + ry * (h + 22);
        ctx.fillStyle = windowColor;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, y, w, h * 0.3);
      }
    }
  });
}

function signboardTexture(title, tagline, bg, fg, accent = null) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, 0, 512, 16); ctx.fillRect(0, 240, 512, 16); }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  let size = 64;
  ctx.font = `bold ${size}px sans-serif`;
  while (ctx.measureText(title).width > 460 && size > 26) {
    size -= 4;
    ctx.font = `bold ${size}px sans-serif`;
  }
  ctx.fillText(title, 256, 118);
  ctx.font = '600 28px sans-serif';
  ctx.fillText(tagline, 256, 172);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeTruckLiveryTexture(def = {}) {
  const body = def.body || '#f4f7f4';
  const accent = def.accent || '#2e7d32';
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = body; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = accent; ctx.fillRect(0, s * 0.52, s, s * 0.30);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(0, s * 0.50, s, 8);
    drawRecycleEmblem(ctx, s * 0.2, s * 0.28, s * 0.1, accent);
    ctx.fillStyle = '#1b1b1b';
    ctx.font = `bold ${Math.round(s * 0.085)}px sans-serif`;
    ctx.fillText('EcoCycle Hub', s * 0.34, s * 0.31);
    ctx.font = `600 ${Math.round(s * 0.05)}px sans-serif`;
    ctx.fillStyle = '#263238';
    ctx.fillText('RECYCLING PARTNER', s * 0.34, s * 0.68);
  });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.mapRects = [];
    this.litter = [];
    this.litterId = 0;
    this.sharedMats = {};
    this.build();
  }

  /* ---------------- helpers ---------------- */

  addCollider(minX, maxX, minZ, maxZ) {
    const c = { minX, maxX, minZ, maxZ };
    this.colliders.push(c);
    return c;
  }
  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  box(w, h, d, mat, x, y, z, { rot = 0, collide = true, shadow = true, receive = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.castShadow = shadow;
    m.receiveShadow = receive;
    this.group.add(m);
    if (collide) this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return m;
  }

  /* ---------------- build ---------------- */

  build() {
    const L = LAYOUT;

    // sky + fog
    this.skyDay = canvasTex(64, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#4fa3e3'); g.addColorStop(0.62, '#bfe0f7'); g.addColorStop(1, '#ffe9c4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    this.scene.background = this.skyDay;
    this.scene.fog = new THREE.Fog(0xdfeefc, 60, 160);

    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0xa89f83, 0.85);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xfff2d4, 1.5);
    this.dir.position.set(38, 52, 26);
    this.dir.castShadow = true;
    this.dir.shadow.mapSize.set(2048, 2048);
    this.dir.shadow.camera.left = -62; this.dir.shadow.camera.right = 62;
    this.dir.shadow.camera.top = 62; this.dir.shadow.camera.bottom = -62;
    this.dir.shadow.camera.near = 5; this.dir.shadow.camera.far = 170;
    this.dir.shadow.bias = -0.0006;
    this.scene.add(this.dir);

    // ground
    const groundTex = canvasTex(256, (ctx, s) => {
      ctx.fillStyle = '#9d9a72'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = Math.random() > 0.55 ? 'rgba(120,140,80,0.35)' : 'rgba(160,140,100,0.4)';
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
      }
    }, 24, 20);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 100), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // street
    const roadTex = canvasTex(256, (ctx, s) => {
      ctx.fillStyle = '#3c3f45'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(${140 + Math.random() * 60},${140 + Math.random() * 60},${150 + Math.random() * 50},0.06)`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 12, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(116, 7), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    this.group.add(road);
    // dashed centre line
    const dashMat = new THREE.MeshStandardMaterial({ color: '#e8e4d8', roughness: 0.9 });
    for (let x = -56; x <= 56; x += 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, 0);
      this.group.add(dash);
    }

    // sidewalks
    const walkMat = new THREE.MeshStandardMaterial({ color: '#cdc7b8', roughness: 1 });
    for (const [z0, z1] of [[-7.4, -6.0], [3.6, 5.0]]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(116, 0.12, z1 - z0), walkMat);
      w.position.set(0, 0.06, (z0 + z1) / 2);
      w.receiveShadow = true;
      this.group.add(w);
    }

    this.buildGutter();
    this.buildBuildings();
    this.buildHub();
    this.buildHome();
    this.buildMarket();
    this.buildBusStop();
    this.buildMalls();
    this.buildCompanies();
    this.buildStreetSigns();
    this.buildPickupPoints();
    this.buildTreesAndProps();

    // litter palette of shared materials
    this.buildLitterMats();

    // rain + flood water
    this.buildFloodSystem();
  }

  buildGutter() {
    const L = LAYOUT.gutter;
    const concrete = new THREE.MeshStandardMaterial({ color: '#9aa0a3', roughness: 0.95 });
    for (const z of [L.z0, L.z1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(72, L.wallH, 0.28), concrete);
      wall.position.set(0, L.wallH / 2, z);
      wall.castShadow = true; wall.receiveShadow = true;
      this.group.add(wall);
    }
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(72, 0.05, L.z1 - L.z0), new THREE.MeshStandardMaterial({ color: '#7d8487', roughness: 1 }));
    bottom.position.set(0, 0.01, (L.z0 + L.z1) / 2);
    this.group.add(bottom);

    this.waterTex = canvasTex(128, (ctx, s) => {
      ctx.fillStyle = '#4e6b4a'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(150,170,140,0.18)' : 'rgba(60,90,60,0.25)';
        ctx.fillRect(Math.random() * s, Math.random() * s, 6, 2);
      }
    }, 10, 1);
    this.gutterWater = new THREE.Mesh(
      new THREE.PlaneGeometry(72, L.z1 - L.z0 - 0.4),
      new THREE.MeshStandardMaterial({ map: this.waterTex, color: '#aabfa0', transparent: true, opacity: 0.92, roughness: 0.4 })
    );
    this.gutterWater.rotation.x = -Math.PI / 2;
    this.gutterWater.position.set(0, 0.06, (L.z0 + L.z1) / 2);
    this.group.add(this.gutterWater);
    this.gutterWaterBaseY = 0.06;
  }

  buildBuildings() {
    const specs = [
      { x0: -34, x1: -24, z0: -24, z1: -15, h: 6, color: '#2f7f86' },
      { x0: -18, x1: -8, z0: -26, z1: -16, h: 8, color: '#c9a227' },
      { x0: 2, x1: 12, z0: -24, z1: -15, h: 5.5, color: '#b4552d' },
      { x0: 18, x1: 34, z0: -25, z1: -16, h: 7, color: '#b9a58a' },
      { x0: -16, x1: -6, z0: 18, z1: 26, h: 5, color: '#c96a5a' },
      { x0: 12, x1: 22, z0: 18, z1: 26, h: 6.5, color: '#6d8ea0' },
      { x0: 24, x1: 34, z0: 19, z1: 26, h: 4.5, color: '#6f9e63' }
    ];
    specs.forEach((b, i) => {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      const tex = wallTexture(b.color);
      tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(b.h / 6)));
      const mat = [new THREE.MeshStandardMaterial({ color: b.color, roughness: 1 }), new THREE.MeshStandardMaterial({ color: b.color, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: '#8d8578', roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#8d8578', roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })];
      this.box(w, b.h, d, mat, (b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
      // parapet
      this.box(w + 0.3, 0.35, d + 0.3, new THREE.MeshStandardMaterial({ color: '#7a7266', roughness: 1 }), (b.x0 + b.x1) / 2, b.h + 0.15, (b.z0 + b.z1) / 2, { collide: false });
      this.mapRects.push({ x: b.x0, z: b.z0, w, h: d, color: '#9aa39d' });
    });
  }

  buildHub() {
    const H = LAYOUT.hub;
    const w = H.x1 - H.x0, d = H.z1 - H.z0;
    const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    const tex = wallTexture('#3d7a45');
    const body = this.box(w, 5.2, d, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), cx, 2.6, cz);
    this.mapRects.push({ x: H.x0, z: H.z0, w, h: d, color: '#5f9b64' });

    // sign board
    const signTex = canvasTex(512, (ctx, s) => {
      ctx.fillStyle = '#1b5e20'; ctx.fillRect(0, 0, s, s);
      drawRecycleEmblem(ctx, s * 0.18, s * 0.42, s * 0.12, '#ffc107');
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(s * 0.13)}px sans-serif`;
      ctx.fillText('EcoCycle Hub', s * 0.33, s * 0.47);
      ctx.fillStyle = '#a5d6a7';
      ctx.font = `600 ${Math.round(s * 0.062)}px sans-serif`;
      ctx.fillText('RECYCLING & SORTING STATION', s * 0.33, s * 0.62);
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 0.25), [
      new THREE.MeshStandardMaterial({ color: '#123c1a' }), new THREE.MeshStandardMaterial({ color: '#123c1a' }),
      new THREE.MeshStandardMaterial({ color: '#123c1a' }), new THREE.MeshStandardMaterial({ color: '#123c1a' }),
      new THREE.MeshStandardMaterial({ map: signTex }), new THREE.MeshStandardMaterial({ map: signTex })
    ]);
    sign.position.set(cx, 5.9, H.frontZ + 0.2);
    sign.castShadow = true;
    this.group.add(sign);

    // awning over the front
    this.box(w + 2, 0.18, 3.4, new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.9 }), cx, 3.6, H.frontZ + 1.4, { collide: false });

    // the six bins in a row
    this.binMeshes = [];
    CATS.forEach((cat, i) => {
      const meta = BIN_META[cat];
      const bx = H.x0 + 2 + i * 2.1;
      const binMat = new THREE.MeshStandardMaterial({ color: meta.flag, roughness: 0.8 });
      const lidMat = new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.8 });
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.0, 14), binMat);
      bin.position.set(bx, 0.5, H.frontZ + 0.75);
      bin.castShadow = true;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 14), lidMat);
      lid.position.set(bx, 1.05, H.frontZ + 0.75);
      lid.castShadow = true;
      this.group.add(bin, lid);
      this.binMeshes.push(bin);
    });
    this.addCollider(H.x0 + 1.4, H.x1 - 1.2, H.frontZ + 0.3, H.frontZ + 1.2);

    // sorting station counter (interact point)
    const S = LAYOUT.station;
    const counter = this.box(3.2, 1.05, 1.4, new THREE.MeshStandardMaterial({ color: '#e0e6e0', roughness: 0.85 }), S.x, 0.52, S.z);
    const counterTop = this.box(3.4, 0.08, 1.6, new THREE.MeshStandardMaterial({ color: '#2e7d32' }), S.x, 1.08, S.z, { collide: false });
    const canopy = this.box(4.2, 0.12, 2.6, new THREE.MeshStandardMaterial({ color: '#a5d6a7', roughness: 0.8 }), S.x, 2.6, S.z - 0.2, { collide: false });
    for (const px of [S.x - 1.9, S.x + 1.9]) {
      this.box(0.12, 2.6, 0.12, new THREE.MeshStandardMaterial({ color: '#37474f' }), px, 1.3, S.z + 0.9, { collide: false });
    }
    // sign above station
    const sortSignTex = canvasTex(256, (ctx, s) => {
      ctx.fillStyle = '#ffc107'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#263238';
      ctx.font = `bold ${Math.round(s * 0.16)}px sans-serif`;
      ctx.fillText('SORT & EARN', s * 0.1, s * 0.58);
    });
    const sortSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshStandardMaterial({ map: sortSignTex, side: THREE.DoubleSide }));
    sortSign.position.set(S.x, 3.0, S.z + 0.05);
    this.group.add(sortSign);

    // education kiosk
    const E = LAYOUT.eduKiosk;
    this.box(1.8, 2.3, 1.0, new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 0.9 }), E.x, 1.15, E.z);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: '#a5d6a7', emissive: '#2e7d32', emissiveIntensity: 0.6 }));
    screen.position.set(E.x, 1.35, E.z + 0.52);
    this.group.add(screen);

    // festival mat
    const mat = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: '#c96a5a', roughness: 1 }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(LAYOUT.festival.x, 0.03, LAYOUT.festival.z);
    this.group.add(mat);
  }

  buildHome() {
    const H = LAYOUT.home;
    const w = H.x1 - H.x0, d = H.z1 - H.z0;
    const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;

    this.homeWallMat = new THREE.MeshStandardMaterial({ color: '#e6d9c3', roughness: 1 });
    const house = this.box(w, 3.4, d, this.homeWallMat, cx, 1.7, cz);
    // hip roof
    const roofMat = new THREE.MeshStandardMaterial({ color: '#8d3b2f', roughness: 0.95 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.sqrt(w * w + d * d) / 2 + 0.4, 2.2, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(cx, 4.5, cz);
    roof.castShadow = true;
    this.group.add(roof);
    // door + windows
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.1), new THREE.MeshStandardMaterial({ color: '#5d4037' }));
    door.position.set(cx, 1.05, H.z0 - 0.01);
    this.group.add(door);
    for (const wx of [cx - 2.6, cx + 2.6]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), new THREE.MeshStandardMaterial({ color: '#9fc7e0', roughness: 0.3, metalness: 0.1 }));
      win.position.set(wx, 1.9, H.z0 - 0.01);
      this.group.add(win);
    }
    // porch slab + steps
    this.box(4.4, 0.22, 2.0, new THREE.MeshStandardMaterial({ color: '#b9b3a3', roughness: 1 }), cx, 0.11, H.z0 - 1.1, { collide: false });
    // porch stage marker
    this.porchGlow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), new THREE.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0.35 }));
    this.porchGlow.rotation.x = -Math.PI / 2;
    this.porchGlow.position.set(H.porch.x, 0.24, H.porch.z);
    this.group.add(this.porchGlow);

    // fence with a gate gap at x = gate.x
    const fenceMat = new THREE.MeshStandardMaterial({ color: '#b98a4f', roughness: 1 });
    const fx0 = H.x0 - 2, fx1 = H.x1 + 2, fz0 = 8.6, fz1 = 17;
    const gx = H.gate.x;
    const segments = [
      [fx0, gx - 1.2, fz0, fz0], [gx + 1.2, fx1, fz0, fz0],
      [fx0, fx0, fz0, fz1], [fx1, fx1, fz0, fz1],
      [fx0, gx - 1.2, fz1, fz1], [gx + 1.2, fx1, fz1, fz1]
    ];
    for (const [x0, x1, z0, z1] of segments) {
      const wS = Math.max(0.18, x1 - x0), dS = Math.max(0.18, z1 - z0);
      this.box(wS, 1.15, dS, fenceMat, (x0 + x1) / 2, 0.57, (z0 + z1) / 2);
    }
    // gate posts
    for (const px of [gx - 1.2, gx + 1.2]) {
      this.box(0.24, 1.5, 0.24, new THREE.MeshStandardMaterial({ color: '#7a5b33', roughness: 1 }), px, 0.75, fz0);
    }

    // solar panel (hidden until bought)
    this.solarPanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.7), new THREE.MeshStandardMaterial({ color: '#283593', metalness: 0.5, roughness: 0.35 }));
    this.solarPanel.position.set(cx + 1.4, 5.2, cz - 1);
    this.solarPanel.rotation.x = -0.45;
    this.solarPanel.castShadow = true;
    this.solarPanel.visible = false;
    this.group.add(this.solarPanel);

    // garden beds
    for (const gxOff of [-3.2, 3.2]) {
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 1 }));
      bed.position.set(cx + gxOff, 0.15, H.z0 - 1.6);
      this.group.add(bed);
      for (let i = 0; i < 5; i++) {
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? '#e91e63' : '#ffc107' }));
        flower.position.set(cx + gxOff + rand(-0.5, 0.5), 0.42 + rand(0, 0.15), H.z0 - 1.6 + rand(-0.5, 0.5));
        this.group.add(flower);
      }
    }
    this.mapRects.push({ x: H.x0, z: H.z0, w, h: d, color: '#c2b39a' });
  }

  buildMarket() {
    const canopyColors = ['#e57373', '#64b5f6', '#ffb74d', '#81c784'];
    const goodsColors = ['#e53935', '#fdd835', '#8bc34a', '#fb8c00', '#8e24aa'];
    LAYOUT.market.forEach((m, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: canopyColors[i % canopyColors.length], roughness: 0.95 });
      this.box(3.2, 0.14, 2.4, mat, m.x, 2.35, m.z, { collide: false });
      for (const [dx, dz] of [[-1.45, -1.05], [1.45, -1.05], [-1.45, 1.05], [1.45, 1.05]]) {
        this.box(0.1, 2.3, 0.1, new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 1 }), m.x + dx, 1.15, m.z + dz, { collide: false });
      }
      // table with goods
      this.box(2.6, 0.12, 1.6, new THREE.MeshStandardMaterial({ color: '#a1887f', roughness: 1 }), m.x, 0.75, m.z);
      for (let g = 0; g < 6; g++) {
        const good = new THREE.Mesh(new THREE.SphereGeometry(rand(0.1, 0.17), 8, 6), new THREE.MeshStandardMaterial({ color: goodsColors[g % goodsColors.length], roughness: 0.7 }));
        good.position.set(m.x + rand(-1, 1), 0.92, m.z + rand(-0.5, 0.5));
        good.castShadow = true;
        this.group.add(good);
      }
    });
  }

  buildBusStop() {
    const B = LAYOUT.busStop;
    for (const dx of [-1.6, 1.6]) {
      this.box(0.12, 2.4, 0.12, new THREE.MeshStandardMaterial({ color: '#546e7a' }), B.x + dx, 1.2, B.z - 0.7);
    }
    this.box(4.0, 0.1, 1.8, new THREE.MeshStandardMaterial({ color: '#26a69a' }), B.x, 2.5, B.z - 0.4, { collide: false });
    this.box(3.0, 0.08, 0.5, new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 1 }), B.x, 0.5, B.z - 0.55);
    const signTex = canvasTex(256, (ctx, s) => {
      ctx.fillStyle = '#004d40'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.15)}px sans-serif`;
      ctx.fillText('BUS STOP', s * 0.18, s * 0.55);
    });
    const stopSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshStandardMaterial({ map: signTex, side: THREE.DoubleSide }));
    stopSign.position.set(B.x + 1.6, 2.0, B.z - 0.62);
    this.group.add(stopSign);
  }

  /* ---------------- Lagos landmarks ---------------- */

  buildMalls() {
    const glass = new THREE.MeshStandardMaterial({ color: '#7fa8c9', roughness: 0.2, metalness: 0.35 });
    const base = new THREE.MeshStandardMaterial({ color: '#8d8578', roughness: 1 });
    for (const m of LAYOUT.malls) {
      const w = m.x1 - m.x0, d = m.z1 - m.z0;
      const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
      const tex = wallTexture(m.color);
      tex.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(m.h / 8)));
      const wall = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      this.box(w, m.h, d, [wall, wall, base, base, wall, wall], cx, m.h / 2, cz);
      this.box(w + 0.3, 0.4, d + 0.3, new THREE.MeshStandardMaterial({ color: '#6f6a60', roughness: 1 }), cx, m.h + 0.2, cz, { collide: false });

      const faceStreet = cz < 0;                       // malls north of the road face +z
      const frontZ = faceStreet ? m.z1 : m.z0;
      const dir = faceStreet ? 1 : -1;

      // shopfront glazing + entrance canopy
      const glazing = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 3.2, 0.3), glass);
      glazing.position.set(cx, 1.7, frontZ + dir * 0.16);
      this.group.add(glazing);
      this.box(w * 0.42, 0.28, 2.4, new THREE.MeshStandardMaterial({ color: m.accent, roughness: 0.8 }), cx, 3.8, frontZ + dir * 1.3, { collide: false });

      // rooftop sign
      const signTex = signboardTexture(m.name, m.tag, '#15181c', '#ffffff', m.accent);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(18, w * 0.8), 4.4), new THREE.MeshStandardMaterial({ map: signTex, side: THREE.DoubleSide }));
      sign.position.set(cx, m.h + 3.0, faceStreet ? m.z1 - 0.4 : m.z0 + 0.4);
      sign.rotation.y = faceStreet ? 0 : Math.PI;
      this.group.add(sign);
      const postMat = new THREE.MeshStandardMaterial({ color: '#3c3f45', roughness: 0.8 });
      for (const dx of [-w * 0.3, w * 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.22), postMat);
        post.position.set(cx + dx, m.h + 1.35, sign.position.z);
        this.group.add(post);
      }
      this.mapRects.push({ x: m.x0, z: m.z0, w, h: d, color: '#c9b98f' });
    }
  }

  buildCompanies() {
    const towerMat = new THREE.MeshStandardMaterial({ color: '#8b98a3', roughness: 0.85 });
    const comps = LAYOUT.companies;
    const rows = [
      { z: -30.2, front: 1, list: comps },                                        // skyline behind the north row
      { z: 30.2, front: -1, list: comps.filter((_, i) => i % 2 === 0) }           // south skyline
    ];
    for (const row of rows) {
      const step = row.list.length > 6 ? 6.4 : 9;
      const x0 = -(row.list.length / 2) * step + step / 2;
      row.list.forEach((c, i) => {
        const x = x0 + i * step;
        const w = step - 1.4, d = 5.2;
        this.box(w, c.h, d, towerMat, x, c.h / 2, row.z);
        this.box(w + 0.2, 0.3, d + 0.2, new THREE.MeshStandardMaterial({ color: '#6f7a83', roughness: 1 }), x, c.h + 0.15, row.z, { collide: false });
        // brand panel facing the road
        const tex = signboardTexture(c.name, c.tag, c.color, c.fg);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, w * 0.48), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
        panel.position.set(x, c.h - w * 0.3, row.z + row.front * (d / 2 + 0.06));
        panel.rotation.y = row.front > 0 ? 0 : Math.PI;
        this.group.add(panel);
        this.mapRects.push({ x: x - w / 2, z: row.z - d / 2, w, h: d, color: '#8b98a3' });
      });
    }

    // roadside billboards
    const billboards = [
      { x: -14, z: -8.3, name: 'CHIVITA', tag: '100% FRUIT JUICE', color: '#f57c00', fg: '#ffffff' },
      { x: 24, z: 6.1, name: 'INDOMIE', tag: 'TALKAMONGST YOURSELVES', color: '#c8102e', fg: '#ffffff' }
    ];
    for (const b of billboards) {
      const tex = signboardTexture(b.name, b.tag, b.color, b.fg);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      const facing = b.z < 0 ? 1 : -1;
      panel.position.set(b.x, 3.1, b.z);
      panel.rotation.y = facing > 0 ? 0 : Math.PI;
      this.group.add(panel);
      for (const dx of [-2.0, 2.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 8), new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 1 }));
        post.position.set(b.x + dx, 1.7, b.z - facing * 0.1);
        post.castShadow = true;
        this.group.add(post);
        this.addCollider(b.x + dx - 0.2, b.x + dx + 0.2, b.z - 0.3, b.z + 0.3);
      }
    }
  }

  buildStreetSigns() {
    const names = LAYOUT.streetNames;
    const xs = [-52, -38, -24, -10, 4, 18, 32, 46];
    xs.forEach((x, i) => {
      const name = names[i % names.length];
      const north = i % 2 === 0;
      const z = north ? -6.5 : 4.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.1, 8), new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.8 }));
      pole.position.set(x, 1.55, z);
      pole.castShadow = true;
      this.group.add(pole);
      const tex = signboardTexture(name, 'LAGOS STATE', '#1b5e20', '#ffffff');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.75), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(x, 3.0, z);
      sign.rotation.y = north ? 0 : Math.PI;
      this.group.add(sign);
      this.addCollider(x - 0.15, x + 0.15, z - 0.15, z + 0.15);
    });
  }

  buildPickupPoints() {
    this.pickupSigns = [];
    for (const p of LAYOUT.pickupPoints) {
      const north = p.z < 0;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.3, 8), new THREE.MeshStandardMaterial({ color: '#f9a825', roughness: 0.7 }));
      pole.position.set(p.x, 1.65, p.z);
      pole.castShadow = true;
      this.group.add(pole);
      const tex = signboardTexture('EcoCycle Pickup Point', p.name.toUpperCase() + ' · AGENTS COLLECT HERE', '#f9a825', '#1b1b1b');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.05), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(p.x, 3.35, p.z);
      sign.rotation.y = north ? 0 : Math.PI;
      this.group.add(sign);
      // painted collection bay on the road
      const bay = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.3), new THREE.MeshBasicMaterial({ color: '#ffd600', transparent: true, opacity: 0.3 }));
      bay.rotation.x = -Math.PI / 2;
      bay.position.set(p.x, 0.025, north ? -2.4 : 2.4);
      this.group.add(bay);
      this.addCollider(p.x - 0.15, p.x + 0.15, p.z - 0.15, p.z + 0.15);
      this.pickupSigns.push({ x: p.x, z: p.z, name: p.name });
    }
  }

  buildTreesAndProps() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5b3a', roughness: 1 });
    const frondMat = new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.9, side: THREE.DoubleSide });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#43a047', roughness: 0.9 });

    const palm = (x, z) => {
      const g = new THREE.Group();
      const h = rand(3.6, 5.2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, h, 8), trunkMat);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      g.add(trunk);
      for (let i = 0; i < 7; i++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.9, 4), frondMat);
        frond.position.y = h;
        frond.rotation.z = Math.PI / 2.6;
        frond.rotation.y = (i / 7) * Math.PI * 2;
        frond.translateY(0.8);
        g.add(frond);
      }
      g.position.set(x, 0, z);
      this.group.add(g);
      this.addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
    };
    const puffs = [-32, -23, -14, -5, 4, 13, 22, 31];
    puffs.forEach(x => palm(x + rand(-0.4, 0.4), -8.1 + rand(-0.3, 0)));
    [-33, -16, 9.5, 17, 25, 33].forEach(x => palm(x + rand(-0.4, 0.4), 6.0 + rand(0, 0.4)));
    [-13, -3, 30].forEach(x => palm(x, 17.5));

    const roundTree = (x, z) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.4, 8), trunkMat);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(rand(1.0, 1.4), 10, 8), leafMat);
      crown.position.y = 2.1;
      crown.castShadow = true;
      g.add(trunk, crown);
      g.position.set(x, 0, z);
      this.group.add(g);
      this.addCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
    };
    roundTree(-20, -13);
    roundTree(-5, -19);
    roundTree(9, 16);
    roundTree(28, 16);

    // street lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.8 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#ffe082', emissive: '#ffca28', emissiveIntensity: 0.7 });
    for (const [x, z] of [[-30, -6.9], [-10, -6.9], [10, -6.9], [30, -6.9], [-20, 4.8], [0, 4.8], [20, 4.8]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8), lampMat);
      pole.position.set(x, 2.3, z);
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), lampMat);
      arm.position.set(x + (z < 0 ? 0.45 : -0.45), 4.5, z);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), lampHeadMat);
      head.position.set(x + (z < 0 ? 0.85 : -0.85), 4.42, z);
      this.group.add(pole, arm, head);
      this.addCollider(x - 0.18, x + 0.18, z - 0.18, z + 0.18);
    }

    // power poles + sagging wires
    const poleMat = new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 1 });
    const wireMat = new THREE.LineBasicMaterial({ color: '#263238' });
    const poleXs = [-20, 0, 20];
    poleXs.forEach(x => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8), poleMat);
      pole.position.set(x, 3.2, 5.4);
      pole.castShadow = true;
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), poleMat);
      cross.position.set(x, 5.9, 5.4);
      this.group.add(pole, cross);
      this.addCollider(x - 0.2, x + 0.2, 5.2, 5.6);
    });
    for (let i = 0; i < poleXs.length - 1; i++) {
      for (const off of [-0.65, 0.65]) {
        const a = new THREE.Vector3(poleXs[i], 5.9, 5.4 + off * 0);
        const b = new THREE.Vector3(poleXs[i + 1], 5.9, 5.4);
        a.z += off; b.z += off;
        const mid = a.clone().lerp(b, 0.5); mid.y -= 0.9;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const pts = curve.getPoints(16);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        this.group.add(new THREE.Line(geo, wireMat));
      }
    }

    // public bins
    const pubMat = new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.9 });
    for (const [x, z] of [[-12, 4.3], [8, -4.3], [28, 4.3]]) {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.85, 10), pubMat);
      bin.position.set(x, 0.43, z);
      bin.castShadow = true;
      this.group.add(bin);
      this.addCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
    }

    // flood puddle plane (hidden until rain floods the street)
    this.streetFlood = new THREE.Mesh(
      new THREE.PlaneGeometry(118, 12.6),
      new THREE.MeshStandardMaterial({ color: '#5a6b52', transparent: true, opacity: 0, roughness: 0.35 })
    );
    this.streetFlood.rotation.x = -Math.PI / 2;
    this.streetFlood.position.set(0, 0.13, -1.2);
    this.group.add(this.streetFlood);

    // flood water creeping into the market, homes and shopfronts
    const floodMat = () => new THREE.MeshStandardMaterial({ color: '#4f5b47', transparent: true, opacity: 0, roughness: 0.3 });
    this.marketFlood = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 11), floodMat());
    this.marketFlood.rotation.x = -Math.PI / 2;
    this.marketFlood.position.set(0.5, 0.16, 11.6);
    this.marketFlood.visible = false;
    this.group.add(this.marketFlood);
    this.homeFlood = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), floodMat());
    this.homeFlood.rotation.x = -Math.PI / 2;
    this.homeFlood.position.set(-24, 0.16, 7.6);
    this.homeFlood.visible = false;
    this.group.add(this.homeFlood);
    this.shopFlood = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), floodMat());
    this.shopFlood.rotation.x = -Math.PI / 2;
    this.shopFlood.position.set(23, 0.16, -9.6);
    this.shopFlood.visible = false;
    this.group.add(this.shopFlood);
  }

  buildLitterMats() {
    const mats = {
      pet: new THREE.MeshStandardMaterial({ color: '#cfe8f7', roughness: 0.35, transparent: true, opacity: 0.92 }),
      petcap: new THREE.MeshStandardMaterial({ color: '#1e88e5', roughness: 0.6 }),
      ny: new THREE.MeshStandardMaterial({ color: '#e3f2fd', roughness: 0.7, side: THREE.DoubleSide }),
      can: new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.4, metalness: 0.55 }),
      canTop: new THREE.MeshStandardMaterial({ color: '#b0bec5', roughness: 0.35, metalness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.25, transparent: true, opacity: 0.85 }),
      paper: new THREE.MeshStandardMaterial({ color: '#f5f2e8', roughness: 0.9, side: THREE.DoubleSide }),
      carton: new THREE.MeshStandardMaterial({ color: '#c08a4d', roughness: 0.95 }),
      ew: new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.7 }),
      ewBtn: new THREE.MeshStandardMaterial({ color: '#ffc107', roughness: 0.6 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#ef8a3c', roughness: 0.95, side: THREE.DoubleSide }),
      food: new THREE.MeshStandardMaterial({ color: '#f4f6f4', roughness: 0.8 })
    };
    this.sharedMats = mats;
  }

  makeLitterMesh(type) {
    const M = this.sharedMats;
    const g = new THREE.Group();
    const flat = (mesh, y = 0) => { mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; return mesh; };
    switch (type) {
      case 'bottle': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 10), M.pet);
        body.position.y = 0.1;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.05, 8), M.pet);
        neck.position.y = 0.22;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 8), M.petcap);
        cap.position.y = 0.255;
        g.add(body, neck, cap);
        break;
      }
      case 'sachet': {
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), M.ny);
          s.rotation.set(-Math.PI / 2 + rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.2, 0.2));
          s.position.set(rand(-0.05, 0.05), 0.012 + i * 0.008, rand(-0.05, 0.05));
          g.add(s);
        }
        break;
      }
      case 'can': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.115, 12), M.can);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.036;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), M.canTop);
        top.rotation.z = Math.PI / 2;
        top.position.set(0.06, 0.036, 0);
        g.add(body, top);
        break;
      }
      case 'glass': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 10), M.glass);
        body.position.y = 0.12;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.038, 0.08, 8), M.glass);
        neck.position.y = 0.28;
        g.add(body, neck);
        break;
      }
      case 'paper': {
        const p = flat(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), M.paper), 0.01);
        p.rotation.z = rand(0, Math.PI);
        const p2 = flat(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), M.paper), 0.022);
        p2.rotation.z = rand(0, Math.PI);
        g.add(p, p2);
        break;
      }
      case 'carton': {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.16), M.carton);
        c.position.y = 0.09;
        c.rotation.y = rand(0, Math.PI);
        g.add(c);
        break;
      }
      case 'ewaste': {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), M.ew);
        b.position.y = 0.06;
        b.rotation.y = rand(0, Math.PI);
        g.add(b);
        for (let i = 0; i < 3; i++) {
          const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 8), M.ewBtn);
          btn.position.set(-0.08 + i * 0.08, 0.13, 0.05);
          g.add(btn);
        }
        break;
      }
      case 'textile': {
        for (let i = 0; i < 3; i++) {
          const c = flat(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), M.cloth), 0.012 + i * 0.014);
          c.rotation.z = rand(0, Math.PI);
          g.add(c);
        }
        break;
      }
      case 'foodbox': {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.14), M.food);
        b.position.y = 0.045;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), M.food);
        lid.position.set(0.03, 0.1, 0);
        lid.rotation.z = 0.35;
        b.rotation.y = rand(0, Math.PI);
        g.add(b, lid);
        break;
      }
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /* ---------------- litter ---------------- */

  pickLitterType() {
    const table = [
      ['bottle', 0.20], ['sachet', 0.19], ['can', 0.12], ['foodbox', 0.10],
      ['paper', 0.10], ['carton', 0.09], ['glass', 0.08], ['ewaste', 0.06], ['textile', 0.06]
    ];
    let r = Math.random();
    for (const [t, w] of table) { r -= w; if (r <= 0) return t; }
    return 'bottle';
  }

  randomLitterSpot() {
    const r = Math.random();
    if (r < 0.45) return { x: rand(-55, 55), z: rand(-5.6, -4.0), gutter: true };
    if (r < 0.57) return { x: rand(-55, 55), z: rand(-7.1, -6.2), gutter: false };
    if (r < 0.69) return { x: rand(-55, 55), z: rand(3.8, 4.8), gutter: false };
    if (r < 0.80) return { x: rand(-7, 8), z: rand(8.4, 15), gutter: false };
    if (r < 0.90) return { x: rand(-55, 55), z: Math.random() > 0.5 ? rand(-3.4, -2.7) : rand(2.7, 3.4), gutter: false };
    if (r < 0.96) return { x: rand(-29, -19), z: rand(9, 16.4), gutter: false };
    // around the agent pickup points — that litter is the agents' daily haul
    const p = LAYOUT.pickupPoints[Math.floor(Math.random() * LAYOUT.pickupPoints.length)];
    return { x: p.x + rand(-4, 4), z: rand(-5.6, -4.0), gutter: true };
  }

  /** a blocked-drain pile: clump of waste that chokes the gutter until cleared */
  spawnPile(x) {
    const g = new THREE.Group();
    const types = ['sachet', 'sachet', 'bottle', 'foodbox', 'carton', 'sachet', 'bottle'];
    for (let i = 0; i < types.length; i++) {
      const m = this.makeLitterMesh(types[i]);
      const a = (i / types.length) * Math.PI * 2 + rand(0, 0.6);
      m.position.set(Math.cos(a) * rand(0.1, 0.38), 0, Math.sin(a) * rand(0.05, 0.2));
      m.rotation.y = rand(0, Math.PI * 2);
      m.scale.setScalar(rand(0.8, 1.05));
      g.add(m);
    }
    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshStandardMaterial({ color: '#3f4a2e', transparent: true, opacity: 0.5, roughness: 1 }));
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.005;
    g.add(stain);
    g.position.set(x, 0.02, rand(-5.3, -4.3));
    g.rotation.y = rand(0, Math.PI * 2);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 22), new THREE.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    g.add(ring);
    this.group.add(g);
    const item = {
      id: ++this.litterId, type: types[0], cat: ITEMS[types[0]].cat, mesh: g, ring,
      gutter: true, pile: true, weight: 4, phase: rand(0, Math.PI * 2), t: 0, removing: false
    };
    this.litter.push(item);
    return item;
  }

  spawnLitter(type = null, spot = null) {
    type = type || this.pickLitterType();
    spot = spot || this.randomLitterSpot();
    const mesh = this.makeLitterMesh(type);
    mesh.position.set(spot.x, spot.gutter ? 0.02 : 0.03, spot.z);
    mesh.rotation.y = rand(0, Math.PI * 2);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 20), new THREE.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    ring.visible = false;
    mesh.add(ring);
    this.group.add(mesh);
    const item = {
      id: ++this.litterId, type, cat: ITEMS[type].cat, mesh, ring,
      gutter: spot.gutter, phase: rand(0, Math.PI * 2), t: 0, removing: false
    };
    this.litter.push(item);
    return item;
  }

  spawnInitialLitter(n) {
    for (let i = 0; i < n; i++) this.spawnLitter();
    // blocked-drain piles scattered along the gutter — the flood risk starts here
    const pileXs = [-52, -40, -28, -14, -4, 8, 22, 36, 48];
    for (const x of pileXs) this.spawnPile(x + rand(-1.5, 1.5));
  }

  removeLitter(item) {
    const i = this.litter.indexOf(item);
    if (i >= 0) this.litter.splice(i, 1);
    this.group.remove(item.mesh);
  }

  clearLitter() {
    this.litter.slice().forEach(l => this.removeLitter(l));
  }

  gutterLitterCount() {
    // piles choke the drain far worse than loose pieces
    return this.litter.reduce((sum, l) => l.gutter ? sum + (l.weight || 1) : sum, 0);
  }

  /* ---------------- flood system ---------------- */

  buildFloodSystem() {
    this.rainGroup = new THREE.Group();
    const COUNT = 1400;
    const pos = new Float32Array(COUNT * 3);
    const speed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = rand(-28, 28);
      pos[i * 3 + 1] = rand(0, 22);
      pos[i * 3 + 2] = rand(-24, 24);
      speed[i] = rand(14, 20);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainSpeeds = speed;
    this.rainPoints = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd7e7ff, size: 0.07, transparent: true, opacity: 0.65, sizeAttenuation: true }));
    this.rainPoints.visible = false;
    this.rainPoints.frustumCulled = false;
    this.rainGroup.add(this.rainPoints);
    this.group.add(this.rainGroup);
    this.floodLevel = 0;
    this.storm = 0;
    this.flashT = 0;
    this.skyFlash = document.getElementById('lightning');

    // jagged bolt across the sky — path is rebuilt on every strike
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    this.boltGlow = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x9ec8ff, transparent: true, opacity: 0 }));
    this.bolt.frustumCulled = this.boltGlow.frustumCulled = false;
    this.boltT = 0;
    this.group.add(this.bolt, this.boltGlow);
  }

  spawnRandomPile() {
    const xs = [-52, -40, -28, -14, -4, 8, 22, 36, 48];
    const x = Math.random() < 0.6 ? xs[Math.floor(Math.random() * xs.length)] : rand(-55, 55);
    return this.spawnPile(x + rand(-2, 2));
  }

  setRain(on) { this.rainPoints.visible = on; }

  /** one lightning strike: sky flash + a fresh jagged bolt path */
  flash() {
    this.flashT = 1;
    const bx = rand(-46, 46);
    const bz = Math.random() > 0.45 ? rand(-28, -12) : rand(10, 28);
    const pts = [];
    const segs = 11;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      pts.push(new THREE.Vector3(
        bx + rand(-3.4, 3.4) * (1 - k),
        40 * (1 - k) * (1 - k) + 0.4,
        bz + rand(-2.4, 2.4) * (1 - k)
      ));
    }
    this.bolt.geometry.setFromPoints(pts);
    this.boltGlow.geometry.setFromPoints(pts);
    this.boltGlow.position.set(rand(-0.06, 0.06), 0, rand(-0.06, 0.06));
    this.boltT = 1;
  }

  setStorm(k) {
    this.storm = k;
    this.dir.intensity = 1.5 * (1 - k * 0.72);
    this.hemi.intensity = 0.85 * (1 - k * 0.5);
    if (this.scene.fog) {
      this.scene.fog.color.setRGB(0.87 - k * 0.35, 0.93 - k * 0.32, 0.99 - k * 0.28);
      this.scene.fog.near = 60 - k * 34;
      this.scene.fog.far = 160 - k * 78;
    }
    if ('backgroundIntensity' in this.scene) this.scene.backgroundIntensity = 1 - k * 0.45;
  }

  setFloodLevel(k) {
    this.floodLevel = k;
    this.gutterWater.position.y = this.gutterWaterBaseY + k * 0.62;
    this.streetFlood.material.opacity = k * 0.62;
    this.streetFlood.visible = k > 0.01;
    const spill = Math.max(0, (k - 0.35) / 0.65);   // water reaches homes and shops at high levels
    for (const plane of [this.marketFlood, this.homeFlood, this.shopFlood]) {
      plane.material.opacity = spill * 0.62;
      plane.visible = spill > 0.02;
    }
    // blocked drains turn the channel water murky brown
    const blocked = Math.min(1, this.gutterLitterCount() / 55);
    this.gutterWater.material.color.setRGB(
      0.67 - 0.3 * Math.max(blocked, k), 0.75 - 0.33 * Math.max(blocked, k), 0.63 - 0.42 * Math.max(blocked, k)
    );
  }

  /* ---------------- per-frame ---------------- */

  update(dt, t, playerPos) {
    this.waterTex.offset.x = (t * 0.02) % 1;
    this.porchGlow.material.opacity = 0.22 + 0.16 * Math.sin(t * 2.4);

    // lightning: sky + scene flash that fades fast
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 3.2);
      const f = this.flashT * this.flashT;
      this.hemi.intensity = 0.85 * (1 - this.storm * 0.5) + f * 3.6;
      this.dir.intensity = 1.5 * (1 - this.storm * 0.72) + f * 1.4;
      if ('backgroundIntensity' in this.scene) this.scene.backgroundIntensity = (1 - this.storm * 0.45) + f * 2.2;
      if (this.skyFlash) {
        // double-strike feel: bright, dip, bright again
        const o = f > 0.55 ? f : f * 0.55 + 0.25 * Math.abs(Math.sin(this.flashT * 22)) * f;
        this.skyFlash.style.opacity = String(Math.min(1, o * 1.15));
      }
    } else if (this.skyFlash && this.skyFlash.style.opacity !== '0') {
      this.skyFlash.style.opacity = '0';
    }

    // the bolt itself — brief white streak with a soft blue glow
    if (this.boltT > 0) {
      this.boltT = Math.max(0, this.boltT - dt * 4.2);
      const o = this.boltT * this.boltT;
      this.bolt.material.opacity = Math.min(1, o * 1.7);
      this.boltGlow.material.opacity = Math.min(0.75, o * 1.1);
    }

    // litter rides the flood: floats up with the water, rocks gently, settles back when it recedes
    const fl = this.floodLevel || 0;
    for (const l of this.litter) {
      l.t += dt;
      if (l.removing) continue;
      const base = (l.gutter ? 0.02 : 0.03) + fl * (l.gutter ? 0.62 : 0.34);
      l.mesh.position.y = base + Math.sin(t * (1.7 - fl * 0.5) + l.phase) * (0.012 + fl * 0.045);
      l.mesh.rotation.z = Math.sin(t * 1.6 + l.phase) * 0.1 * fl;
      l.mesh.rotation.x = Math.cos(t * 1.3 + l.phase * 1.7) * 0.07 * fl;
    }

    if (this.rainPoints.visible) {
      const arr = this.rainPoints.geometry.attributes.position.array;
      for (let i = 0; i < this.rainSpeeds.length; i++) {
        arr[i * 3 + 1] -= this.rainSpeeds[i] * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 20 + Math.random() * 4;
          arr[i * 3] = playerPos ? playerPos.x + rand(-28, 28) : rand(-28, 28);
          arr[i * 3 + 2] = playerPos ? playerPos.z + rand(-24, 24) : rand(-24, 24);
        }
      }
      this.rainPoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  clampToBounds(v) {
    const b = LAYOUT.bounds;
    v.x = Math.max(b.minX, Math.min(b.maxX, v.x));
    v.z = Math.max(b.minZ, Math.min(b.maxZ, v.z));
  }
}
