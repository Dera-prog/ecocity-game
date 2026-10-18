// Realistic rigged characters: load, retarget Mixamo clips, appearance system (wardrobe).

import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/utils/SkeletonUtils.js';
import { LOOK_OPTIONS, defaultLook } from './state.js';

const MODELS = {
  michelle: 'assets/models/michelle.gltf.json',
  soldier: 'assets/models/soldier.gltf.json'
};

/* Body shapes: bone-scale archetypes shared by both Mixamo rigs. The neck
   counter-scale keeps the head at 100% while the torso silhouette changes. */
const BODY_SHAPE = {
  slim: {
    hips: [0.97, 1, 0.97], spine: [0.99, 1, 0.99], spine1: [0.96, 1, 0.96], spine2: [0.98, 1, 0.98],
    leftshoulder: 0.88, rightshoulder: 0.88,
    leftarm: 0.93, rightarm: 0.93, leftforearm: 0.96, rightforearm: 0.96,
    leftupleg: [0.94, 1, 0.94], rightupleg: [0.94, 1, 0.94], leftleg: 0.97, rightleg: 0.97
  },
  athletic: {},
  curvy: {
    hips: [1.04, 1, 1.03], spine: [1.0, 1, 1.0], spine1: [1.04, 1, 1.03], spine2: [1.05, 1, 1.04],
    leftshoulder: 0.97, rightshoulder: 0.97,
    leftupleg: [1.1, 1, 1.07], rightupleg: [1.1, 1, 1.07], leftleg: 1.03, rightleg: 1.03
  },
  strong: {
    hips: [1.02, 1, 1.02], spine: [1.02, 1, 1.02], spine1: [1.03, 1, 1.03], spine2: [1.05, 1, 1.04],
    leftshoulder: 1.12, rightshoulder: 1.12,
    leftarm: 1.1, rightarm: 1.1, leftforearm: 1.06, rightforearm: 1.06,
    leftupleg: 1.05, rightupleg: 1.05, leftleg: 1.03, rightleg: 1.03
  }
};
const BODY_BONE_KEYS = [
  'hips', 'spine', 'spine1', 'spine2', 'neck',
  'leftshoulder', 'rightshoulder', 'leftarm', 'rightarm', 'leftforearm', 'rightforearm',
  'leftupleg', 'rightupleg', 'leftleg', 'rightleg'
];

let assets = null;

export async function loadCharacterAssets(onProgress) {
  const loader = new GLTFLoader();
  const loaded = {};
  const sizes = { michelle: 5291937, soldier: 3646735 }; // known bytes, for progress only
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  let got = 0;

  for (const [key, url] of Object.entries(MODELS)) {
    const gltf = await new Promise((resolve, reject) => {
      loader.load(url, resolve, ev => {
        const base = got + (ev.loaded || 0);
        onProgress && onProgress(Math.min(1, base / total), key);
      }, reject);
    });
    got += sizes[key];
    loaded[key] = gltf;
  }

  const michelle = prepBase(loaded.michelle, 'Ch03_Body');
  const soldier = prepBase(loaded.soldier, 'VanguardBodyMat');
  assets = { michelle, soldier };
  return assets;
}

export function getAssets() { return assets; }

function measureWorldBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse(o => {
    if ((o.isMesh || o.isSkinnedMesh) && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    }
  });
  return box;
}

function measureSkeleton(root) {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  const v = new THREE.Vector3();
  let found = false;
  root.traverse(o => {
    if (o.isBone) { o.getWorldPosition(v); bb.expandByPoint(v); found = true; }
  });
  return found ? bb : null;
}

function prepBase(gltf, bodyMaterialName) {
  const scene = gltf.scene;
  let bodyImage = null;
  scene.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m) return;
        if (m.isMeshStandardMaterial) {
          m.metalness = Math.min(m.metalness, 0.15);
          m.roughness = Math.max(m.roughness || 1, 0.7);
        }
        m.side = THREE.FrontSide;
        if (m.name === bodyMaterialName && m.map && m.map.image) bodyImage = m.map.image;
      });
    }
  });
  // bones are the render truth for skinned rigs; geometry boxes mislead when a baked
  // 0.01 root node exists. Measure the bind skeleton and normalise only if far off.
  const bb = measureSkeleton(scene) || measureWorldBox(scene);
  let height = bb.max.y - bb.min.y;
  if (height > 0 && (height < 0.5 || height > 10)) {
    scene.scale.multiplyScalar(1.72 / height);
    scene.updateMatrixWorld(true);
    height = 1.72;
  }
  return { scene, animations: gltf.animations || [], height, bodyMaterialName, bodyImage };
}

/* ------------------------------------------------------------------ */
/* Clip retargeting: Michelle and the Vanguard share the standard       */
/* Mixamo skeleton (bone names differ only in separators). Only bone    */
/* rotations transfer between rigs — hip translations are authored in   */
/* each export's own rig-local frame and would flip the other rig.      */
/* ------------------------------------------------------------------ */

export const boneKey = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');

function retargetClip(clip, targetRoot) {
  const byKey = new Map();
  targetRoot.traverse(o => { if (o.name) byKey.set(boneKey(o.name), o.name); });
  const tracks = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const prop = track.name.slice(dot + 1);
    if (prop !== 'quaternion') continue;
    const srcKey = boneKey(track.name.slice(0, dot));
    // the hips local frame carries each export's rig-root flip; re-applying it
    // on the other rig inverts the character (they differ by ~180°)
    if (srcKey === 'mixamorighips') continue;
    const actual = byKey.get(srcKey);
    if (!actual) continue;
    const t = track.clone();
    t.name = actual + '.quaternion';
    tracks.push(t);
  }
  const out = clip.clone();
  out.tracks = tracks;
  return out;
}

function buildClipSet(assets, modelKey, targetRoot) {
  const clips = {};
  const isSelf = src => (src === 'soldier') === (modelKey === 'soldier');
  // Mixamo exports carry constant scale tracks (1,1,1) that would stomp the
  // body-type sculpture every frame — body shape is bone scale, so drop them.
  const take = (clip, src) => {
    const c = isSelf(src) ? clip.clone() : retargetClip(clip, targetRoot);
    c.tracks = c.tracks.filter(t => !t.name.endsWith('.scale'));
    return c;
  };

  // Locomotion comes from the Vanguard export, which carries Idle/Walk/Run.
  const loco = assets.soldier.animations || [];
  for (const name of ['Idle', 'Walk', 'Run']) {
    const c = loco.find(a => a.name === name);
    if (c) clips[name.toLowerCase()] = take(c, 'soldier');
  }

  // Dance comes from Michelle's SambaDance (the only dance clip on either rig).
  const dance = (assets.michelle.animations || []).find(a => /Dance/i.test(a.name))
    || loco.find(a => /Dance/i.test(a.name));
  if (dance) {
    const fromMichelle = (assets.michelle.animations || []).includes(dance);
    clips.dance = take(dance, fromMichelle ? 'michelle' : 'soldier');
  }
  return clips;
}

/* ------------------------------------------------------------------ */
/* Appearance engine                                                    */
/*                                                                      */
/* Both models ship with one hand-painted body atlas. The wardrobe      */
/* recolours hue families inside that atlas (skin / outfit / trousers / */
/* shoes) and layers 3D accessories (hair, brows, lips, glasses,        */
/* headwear, vest) on the rig. Everything is derived, nothing hand-     */
/* edited per option, so the options compose.                           */
/* ------------------------------------------------------------------ */

// family reference points measured from the painted atlases
// (michelle: the tank top is the low-sat silver family, the baggy trousers are the yellow family)
const FAMILY_REF = {
  michelle: {
    skin:   { s: 0.45, l: 0.42 },
    top:    { s: 0.08, l: 0.62 },
    bottom: { s: 0.75, l: 0.52 },
    shoes:  { s: 0.85, l: 0.50 }
  },
  soldier: {
    skin:   { s: 0.30, l: 0.68 }, // tan armour plates
    top:    { s: 0.25, l: 0.30 }, // olive fabric
    bottom: { s: 0.12, l: 0.16 }, // dark gear
    shoes:  { s: 0.75, l: 0.45 }  // red painted accents
  }
};

// ordered pixel classifiers: first match wins. 'lip' is reserved so shoe
// recolours never stain the painted mouth.
const MODEL_RULES = {
  michelle: [
    { id: 'lip',    test: (h, s, l) => (h >= 332 || h <= 16) && s >= 0.30 && l >= 0.15 && l <= 0.42 },
    { id: 'shoes',  test: (h, s, l) => (h <= 16 || h >= 338) && s >= 0.45 && l > 0.42 && l <= 0.80 },
    { id: 'skin',   test: (h, s, l) => h > 16 && h <= 40 && s >= 0.18 && s <= 0.75 && l >= 0.26 && l <= 0.84 },
    { id: 'top',    test: (h, s, l) => s < 0.17 && l >= 0.40 && l <= 0.83 },
    { id: 'bottom', test: (h, s, l) => h > 40 && h <= 80 && s >= 0.30 && l >= 0.20 && l <= 0.92 }
  ],
  soldier: [
    { id: 'shoes',  test: (h, s, l) => (h <= 16 || h >= 340) && s >= 0.35 && l >= 0.18 },
    { id: 'top',    test: (h, s, l) => h > 55 && h <= 125 && s >= 0.06 && s <= 0.65 && l >= 0.10 && l <= 0.55 },
    { id: 'skin',   test: (h, s, l) => h > 16 && h <= 55 && s >= 0.10 && s <= 0.65 && l >= 0.42 && l <= 0.94 },
    { id: 'bottom', test: (h, s, l) => s <= 0.35 && l <= 0.30 }
  ]
};

const texCache = new Map();
let baseCanvasCache = null;

function baseCanvasFor(modelKey) {
  if (!baseCanvasCache) baseCanvasCache = new Map();
  if (baseCanvasCache.has(modelKey)) return baseCanvasCache.get(modelKey);
  const img = assets[modelKey].bodyImage;
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  baseCanvasCache.set(modelKey, c);
  return c;
}

function hexToHsl01(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function lookTextureKey(look) { return [look.skin, look.top, look.bottom, look.shoes].join(','); }

/** recoloured body atlas for a look (cached); falls back to the original image */
function lookTexture(modelKey, look) {
  const key = modelKey + '|' + lookTextureKey(look);
  const hit = texCache.get(key);
  if (hit) return hit;

  const base = baseCanvasFor(modelKey);
  if (!base) return null;

  // resolve targets; family 0 (Original) keeps painted pixels
  const targets = {};
  for (const fam of ['skin', 'top', 'bottom', 'shoes']) {
    const opt = LOOK_OPTIONS[fam][look[fam]] || LOOK_OPTIONS[fam][0];
    targets[fam] = opt && opt.hex ? hexToHsl01(opt.hex) : null;
  }

  const c = document.createElement('canvas');
  c.width = base.width; c.height = base.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(base, 0, 0);

  if (targets.skin || targets.top || targets.bottom || targets.shoes) {
    const rules = MODEL_RULES[modelKey] || [];
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l < 0.06 || l > 0.95) continue;
      let h = 0, s = 0;
      if (max !== min) {
        const dd = max - min;
        s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
        if (max === r) h = ((g - b) / dd + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / dd + 2) * 60;
        else h = ((r - g) / dd + 4) * 60;
      } else {
        s = 0;
      }
      let fam = null;
      for (const rule of rules) { if (rule.test(h, s, l)) { fam = rule.id; break; } }
      if (!fam || fam === 'lip') continue;
      const t = targets[fam];
      if (!t) continue;
      const ref = FAMILY_REF[modelKey][fam];
      const nl = Math.max(0.03, Math.min(0.97, l * (t.l / ref.l)));
      const ns = Math.max(0.02, Math.min(1, t.s + (s - ref.s) * 0.5));
      const [nr, ng, nb] = hslToRgb(t.h, ns, nl);
      d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  if (texCache.size > 80) texCache.delete(texCache.keys().next().value);
  return tex;
}

/* Skin tone for 3D eyelids / goggle cover-patches. Uses the chosen wardrobe
   colour, or samples the recoloured atlas so the patch blends with the face. */
const skinCache = new Map();

function sampleSkinHex(modelKey, look, tex) {
  const chosen = LOOK_OPTIONS.skin[look.skin] || LOOK_OPTIONS.skin[0];
  if (chosen && chosen.hex) return chosen.hex;
  const key = modelKey + '|' + lookTextureKey(look);
  if (skinCache.has(key)) return skinCache.get(key);
  let hex = modelKey === 'soldier' ? '#a9744a' : '#8a5630';
  const img = tex && tex.image;
  if (img && img.width && img.height) {
    const w = Math.min(img.width, 320), h = Math.min(img.height, 320);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const rules = MODEL_RULES[modelKey] || [];
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 250) continue;
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const max = Math.max(R, G, B), min = Math.min(R, G, B);
      const l = (max + min) / 2;
      if (l < 0.14 || l > 0.9) continue;
      let hh = 0, ss = 0;
      if (max !== min) {
        const dd = max - min;
        ss = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
        if (max === R) hh = ((G - B) / dd + (G < B ? 6 : 0)) * 60;
        else if (max === G) hh = ((B - R) / dd + 2) * 60;
        else hh = ((R - G) / dd + 4) * 60;
      }
      let fam = null;
      for (const rule of rules) { if (rule.test(hh, ss, l)) { fam = rule.id; break; } }
      if (fam !== 'skin') continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (n > 160) {
      const hex2 = v => Math.round(v / n).toString(16).padStart(2, '0');
      hex = '#' + hex2(r) + hex2(g) + hex2(b);
    }
  }
  skinCache.set(key, hex);
  return hex;
}

/* ---- expressive face layer ---- */

const MOODS = {
  cheerful: { browLift: 0.0014, browWorry: 0, squint: 0.28, tilt: 0.045, lift: 0.02, smile: 0.55 },
  joyful:   { browLift: 0.0018, browWorry: 0, squint: 0.34, tilt: 0.05, lift: 0.03, smile: 0.7 },
  amused:   { browLift: 0.0012, browWorry: 0, squint: 0.42, tilt: 0.075, lift: 0.01, smile: 0.6 },
  excited:  { browLift: 0.0024, browWorry: 0, squint: 0.1, tilt: 0.02, lift: 0.045, smile: 0.7 },
  curious:  { browLift: 0.0012, browWorry: 0.02, squint: 0.04, tilt: 0.11, lift: 0.015, smile: 0.15 },
  proud:    { browLift: 0.0008, browWorry: 0, squint: 0.18, tilt: -0.02, lift: 0.05, smile: 0.5 },
  playful:  { browLift: 0.0016, browWorry: 0.03, squint: 0.36, tilt: 0.08, lift: 0.012, smile: 0.65 },
  concerned:{ browLift: 0.0018, browWorry: 0.15, squint: 0.08, tilt: -0.05, lift: -0.02, smile: -0.25 },
  worried:  { browLift: 0.0022, browWorry: 0.2, squint: 0.04, tilt: -0.06, lift: -0.03, smile: -0.35 },
  tired:    { browLift: -0.0008, browWorry: 0.06, squint: 0.5, tilt: -0.06, lift: -0.04, smile: -0.1 },
  calm:     { browLift: 0, browWorry: 0, squint: 0.1, tilt: 0, lift: 0, smile: 0.12 }
};
const MOOD_ALIASES = {
  happy: 'joyful', sad: 'tired', angry: 'concerned', neutral: 'calm',
  surprised: 'excited', thinking: 'curious', laughing: 'amused'
};

function moodTargets(mood) {
  return MOODS[MOOD_ALIASES[mood] || mood] || MOODS.calm;
}

function skinPatchTexture(hex) {
  const key = 'patch|' + hex;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 63);
  g.addColorStop(0, shadeHex(hex, 1.02));
  g.addColorStop(0.55, shadeHex(hex, 0.95));
  g.addColorStop(0.84, shadeHex(hex, 0.93));
  g.addColorStop(1, hex + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function lidTexture(hex, lashHex) {
  const key = 'lid|' + hex;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.roundRect(4, 0, 56, 64, 20);
  ctx.fill();
  ctx.fillStyle = lashHex;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.roundRect(8, 56, 48, 6, 3);
  ctx.fill();
  ctx.globalAlpha = 1;
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function shadeHex(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * factor)));
  return '#' + [ch(16), ch(8), ch(0)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** soft painted mouth for the armoured trooper faceplate */
function mouthTexture() {
  const key = 'mouth|soft';
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = 'rgba(142,79,64,0.92)';
  ctx.beginPath();
  ctx.moveTo(16, 32);
  ctx.quadraticCurveTo(64, 8, 112, 32);
  ctx.quadraticCurveTo(64, 56, 16, 32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56,22,18,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 33);
  ctx.quadraticCurveTo(64, 40, 106, 33);
  ctx.stroke();
  ctx.fillStyle = 'rgba(233,168,148,0.35)';
  ctx.beginPath();
  ctx.ellipse(64, 43, 26, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** painted eye: almond sclera, iris, pupil, catch-lights and a lash line */
function eyeTexture(irisHex) {
  const key = 'eye|' + irisHex;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 160);

  ctx.beginPath();
  ctx.moveTo(10, 82);
  ctx.quadraticCurveTo(64, 22, 128, 20);
  ctx.quadraticCurveTo(192, 22, 246, 82);
  ctx.quadraticCurveTo(192, 140, 128, 142);
  ctx.quadraticCurveTo(64, 140, 10, 82);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  const sclera = ctx.createRadialGradient(128, 72, 8, 128, 82, 132);
  sclera.addColorStop(0, '#fdf9f3');
  sclera.addColorStop(0.72, '#efe3d5');
  sclera.addColorStop(1, '#d7c3b0');
  ctx.fillStyle = sclera;
  ctx.fillRect(0, 0, 256, 160);

  const shade = ctx.createLinearGradient(0, 18, 0, 86);
  shade.addColorStop(0, 'rgba(58,34,20,.48)');
  shade.addColorStop(1, 'rgba(58,34,20,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 256, 96);

  const iris = ctx.createRadialGradient(122, 72, 4, 128, 80, 45);
  iris.addColorStop(0, shadeHex(irisHex, 1.55));
  iris.addColorStop(0.45, irisHex);
  iris.addColorStop(1, shadeHex(irisHex, 0.5));
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(128, 80, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18,10,6,.8)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = '#0b0908';
  ctx.beginPath();
  ctx.arc(128, 80, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.beginPath();
  ctx.arc(112, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath();
  ctx.arc(146, 97, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(24,14,9,.78)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(12, 80);
  ctx.quadraticCurveTo(66, 22, 128, 20);
  ctx.quadraticCurveTo(190, 22, 244, 80);
  ctx.stroke();

  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function facePartEuler(bone, x, y, z) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  bone.quaternion.multiply(q);
}

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---- accessory geometry ---- */

// Face anchors: offsets in metres from the head bone, applied along the bone's
// own axes (y = up the skull, x = ear to ear, z = toward the face).
// Measured against marker grids: the whole face surface sits at z ≈ 0.11–0.13
// from the head bone; michelle's painted brows sit at y 0.136, her lens centre
// at y 0.088 / x ±0.031, her mouth at y 0.027. The Vanguard mask bulges to
// z ≈ 0.14 below its dark visor band (y 0.10–0.16, surface z ≈ 0.11).
const FACE = {
  michelle: { eyeX: 0.030, eyeY: 0.088, eyeZ: 0.118, browY: 0.134, browZ: 0.110, lipY: 0.027, lipZ: 0.106, headR: 0.105, glassR: 0.021, armLen: 0.105 },
  soldier:  { eyeX: 0.036, eyeY: 0.105, eyeZ: 0.118, browY: 0.150, browZ: 0.078, lipY: 0.030, lipZ: 0.134, headR: 0.120, glassR: 0.030, armLen: 0.05 }
};

const cloth = (hex, rough = 0.85) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough });

function hairMeshes(style, colorHex, f) {
  const m = cloth(colorHex, 0.78);
  const list = [];
  const sphere = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    list.push(mesh); return mesh;
  };
  switch (style) {
    case 1: // top bun
      sphere(f.headR * 0.88, 0, f.headR * 1.34, -0.028, 1, 0.8, 0.9);
      sphere(f.headR * 0.4, 0, f.headR * 1.62, -0.075);
      break;
    case 2: // afro
      sphere(f.headR * 1.28, 0, f.headR * 1.28, -0.012, 1.12, 0.95, 1.08);
      break;
    case 3: // puffs
      sphere(f.headR * 0.95, 0, f.headR * 1.32, 0, 1, 0.7, 1);
      sphere(f.headR * 0.5, f.headR * 1.05, f.headR * 1.28, -0.01);
      sphere(f.headR * 0.5, -f.headR * 1.05, f.headR * 1.28, -0.01);
      break;
    case 4: // braids
      sphere(f.headR * 0.9, 0, f.headR * 1.3, -0.01, 1, 0.7, 1);
      for (const bx of [-0.45, -0.15, 0.15, 0.45]) {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, f.headR * 2.4, 6), m);
        strand.position.set(bx * f.headR, -f.headR * 0.85, -f.headR * 0.72);
        strand.rotation.x = -0.12;
        list.push(strand);
      }
      break;
    default: return [];
  }
  return list;
}

function browMeshes(style, colorHex, f) {
  if (!style) return [];
  const m = cloth(colorHex, 0.9);
  const dims = {
    1: { w: 0.030, h: 0.006, tilt: 0 },       // straight
    2: { w: 0.030, h: 0.0055, tilt: 0.20 },   // arched
    3: { w: 0.034, h: 0.0105, tilt: 0.06 },   // bold
    4: { w: 0.028, h: 0.0035, tilt: 0.12 }    // thin
  }[style] || { w: 0.03, h: 0.006, tilt: 0 };
  const list = [];
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, 0.008), m);
    b.position.set(side * f.eyeX, f.browY - f.eyeY, f.browZ - f.eyeZ + 0.012);
    b.rotation.z = side * dims.tilt;
    b.userData.side = side;
    b.userData.baseY = b.position.y;
    b.userData.baseRot = b.rotation.z;
    list.push(b);
  }
  return list;
}

function lipMesh(colorHex, f) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.35 });
  const lip = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), m);
  lip.scale.set(0.023, 0.008, 0.011);
  lip.position.set(0, f.lipY - f.eyeY, f.lipZ - f.eyeZ + 0.012);
  return [lip];
}

function glassMeshes(style, frameHex, lensOpt, f) {
  const m = cloth(frameHex, 0.35);
  m.metalness = 0.5;
  const lensMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(lensOpt.color), transparent: true, opacity: lensOpt.opacity,
    roughness: 0.08, metalness: 0.25, side: THREE.DoubleSide, depthWrite: false
  });
  const list = [];
  const R = f.glassR;
  const addRim = (side) => {
    const g = new THREE.Group();
    const x = side * f.eyeX;
    if (style === 1 || style === 3) {
      const seg = style === 1 ? 20 : 14;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.16, 8, seg), m);
      if (style === 3) rim.scale.set(0.92, 1.15, 1);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 20), lensMat);
      g.add(rim, lens);
    } else {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, R * 0.15, 8, 4), m);
      rim.rotation.z = Math.PI / 4;
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.4, R * 1.1), lensMat);
      g.add(rim, lens);
    }
    g.position.set(x, 0, 0);
    if (style === 4) g.rotation.z = side * 0.28;
    if (style === 2) g.scale.set(1.05, 0.85, 1);
    if (style === 5) g.scale.set(1.25, 0.7, 1);
    list.push(g);
  };
  addRim(-1); addRim(1);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(f.eyeX * 1.4, R * 0.17, R * 0.18), m);
  bridge.position.set(0, 0.004, 0);
  list.push(bridge);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(R * 0.18, R * 0.18, f.armLen), m);
    arm.position.set(side * (f.eyeX + R * 1.1), 0.006, -f.armLen * 0.5 + 0.004);
    list.push(arm);
  }
  return list;
}

export class Character {
  constructor(assetsRef, opts = {}) {
    this.assets = assetsRef;
    const base = assetsRef[opts.model === 'soldier' ? 'soldier' : 'michelle'];
    this.modelKey = opts.model === 'soldier' ? 'soldier' : 'michelle';
    this.root = cloneSkinned(base.scene);
    this.root.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        // per-instance materials so every character can hold its own look
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = mats.map(mm => {
          const c = mm.clone();
          if (c.map && c.map.anisotropy < 8) { c.map.anisotropy = 8; c.map.needsUpdate = true; }
          if ('envMapIntensity' in c) c.envMapIntensity = 0.85;
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      }
    });

    if (opts.tint) {
      this.tint = new THREE.Color(opts.tint);
      this.root.traverse(o => {
        if (o.isMesh || o.isSkinnedMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(mm => { mm.color = this.tint.clone().multiply(mm.color || new THREE.Color(1, 1, 1)); });
        }
      });
    }

    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = buildClipSet(assetsRef, this.modelKey, this.root);

    this.actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      if (name === 'dance') { action.setLoop(THREE.LoopRepeat, 2); }
      this.actions[name] = action;
    }
    this.current = null;
    this.oneShot = null;
    this.play('idle', 0);

    this.bones = { head: null, headTop: null, hips: null, spine2: null };
    this.bodyBones = {};
    this.root.traverse(o => {
      const k = boneKey(o.name);
      if (k === 'mixamorighead') this.bones.head = o;
      if (k === 'mixamorigheadtopend') this.bones.headTop = o;
      if (k === 'mixamorighips') this.bones.hips = o;
      if (k === 'mixamorigspine2') this.bones.spine2 = o;
      for (const name of BODY_BONE_KEYS) {
        if (k === 'mixamorig' + name || k === name) this.bodyBones[name] = o;
      }
    });

    this.accessories = [];        // { parent, obj } for clean disposal
    this.capColor = opts.capColor || '#2e7d32';
    this.face = FACE[this.modelKey];
    this.look = null;
    this.faceDetail = opts.face !== 'none';
    this.faceParts = { lids: [], brows: [], lip: null, eyes: [] };
    this.expression = { mood: 'calm', browLift: 0, browWorry: 0, squint: 0.1, tilt: 0, lift: 0, smile: 0.12 };
    this.emoteState = null;
    this.lookTarget = null;
    this._lookYaw = 0;
    this._lookPitch = 0;
    this._lifeT = Math.random() * 20;
    this._lifeSeed = Math.random() * 10;
    this._blinkIn = 1.2 + Math.random() * 4;
    this._blinkT = -1;
    this._doubleBlink = false;
    this._boneOffsets = [];
    this.setBody(opts.body || 'athletic');
    this.setLook(opts.look || {});
  }

  get position() { return this.root.position; }

  play(name, fade = 0.25, once = false) {
    const next = this.actions[name];
    if (!next) return;
    const prev = this.current ? this.actions[this.current] : null;
    if (once) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.play();
      if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
      this.oneShot = name;
      return;
    }
    if (this.current === name) return;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.current = name;
  }

  /** speed-driven locomotion; cancels one-shots when moving */
  setLocomotion(speed, walkMax = 2.2, runMax = 4.6) {
    if (this.oneShot && speed > 0.4) { this.oneShot = null; this.current = null; }
    if (this.oneShot) return;
    let want = 'idle';
    if (speed > runMax * 0.55) want = 'run';
    else if (speed > 0.25) want = 'walk';
    this.play(want, 0.22);
    const a = this.actions[this.current];
    if (a) a.timeScale = want === 'idle' ? 1 : Math.max(0.65, Math.min(1.6, speed / (want === 'run' ? runMax * 0.75 : walkMax)));
  }

  playDance(duration = 4) {
    this.play('dance', 0.3, true);
    clearTimeout(this._danceTimer);
    this._danceTimer = setTimeout(() => { this.oneShot = null; this.current = null; this.play('idle', 0.3); }, duration * 1000);
  }

  update(dt) {
    this._clearBoneOffsets();
    this.mixer.update(dt);
    this._updateLife(dt);
  }

  /* ---- wardrobe ---- */

  setLook(partial) {
    this.look = { ...defaultLook(), ...(this.look || {}), ...partial };
    this._applyBodyTexture();
    this._rebuildAccessories();
  }

  /** legacy cap colour API (creator + shop paint) */
  setCap(colorHex) {
    this.capColor = colorHex;
    if (this.look.head === 1) this._rebuildAccessories();
  }

  /** body-type archetype: sculpts the rig with bone scale, head kept 1:1 */
  setBody(typeId) {
    this.bodyType = BODY_SHAPE[typeId] ? typeId : 'athletic';
    const cfg = BODY_SHAPE[this.bodyType] || {};
    let chainX = 1, chainZ = 1;
    for (const name of ['hips', 'spine', 'spine1', 'spine2']) {
      const v = cfg[name] || [1, 1, 1];
      chainX *= v[0]; chainZ *= v[2];
    }
    for (const [name, bone] of Object.entries(this.bodyBones)) {
      if (name === 'neck') { bone.scale.set(1 / chainX, 1, 1 / chainZ); continue; }
      const v = cfg[name];
      if (v === undefined) bone.scale.set(1, 1, 1);
      else if (Array.isArray(v)) bone.scale.set(v[0], v[1], v[2]);
      else bone.scale.set(v, 1, v);
    }
  }

  _applyBodyTexture() {
    const tex = lookTexture(this.modelKey, this.look);
    if (!tex) return;
    if (tex.anisotropy < 8) { tex.anisotropy = 8; tex.needsUpdate = true; }
    const bodyName = this.assets[this.modelKey].bodyMaterialName;
    this.root.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (m.name === bodyName && m.map) { m.map = tex; m.needsUpdate = true; }
      });
    });
  }

  _anchor(boneName) {
    const bone = this.bones[boneName];
    if (!bone) return null;
    this.root.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    bone.getWorldPosition(pos);
    const q = bone.getWorldQuaternion(new THREE.Quaternion());
    const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    return { bone, pos, q, inv };
  }

  /** attach meshes to a bone; offsets are metres in `frame` (default: the bone's own axes) */
  _attach(boneName, meshes, off = { x: 0, y: 0, z: 0 }, frame = null, scale = 1) {
    const a = this._anchor(boneName);
    const list = Array.isArray(meshes) ? meshes : [meshes];
    if (!a || !list.length) return;
    const g = new THREE.Group();
    list.forEach(m => { m.castShadow = true; g.add(m); });
    // frame first makes offsets read as "up / toward the face" on any rig
    const q = frame ? frame.clone() : a.q.clone();
    const world = a.pos.clone().add(new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(q));
    const worldM = new THREE.Matrix4().compose(world, q, new THREE.Vector3(1, 1, 1));
    const localM = new THREE.Matrix4().multiplyMatrices(a.inv, worldM);
    localM.decompose(g.position, g.quaternion, g.scale);
    g.scale.multiplyScalar(scale);
    a.bone.add(g);
    this.accessories.push({ parent: a.bone, obj: g });
    return g;
  }

  /** yaw-only world frame: keeps glasses/hair level on both rigs even when the head bone rests pitched */
  _faceFrame() {
    this.root.updateMatrixWorld(true);
    const q = this.root.getWorldQuaternion(new THREE.Quaternion());
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(v.x, v.z));
  }

  _clearAccessories() {
    for (const { parent, obj } of this.accessories) parent.remove(obj);
    this.accessories = [];
  }

  _rebuildAccessories() {
    this._clearAccessories();
    this.faceParts = { lids: [], brows: [], lip: null, eyes: [] };
    if (!this.bones.head) return;
    const look = this.look;
    const f = this.face;
    const frame = this._faceFrame();

    // expressive eyes / lids / goggle covers (rendered even at gameplay distance)
    if (this.faceDetail) this._buildFace(frame);

    // hair (3D shells over the painted hair)
    const hairList = hairMeshes(look.hair, (LOOK_OPTIONS.hairColor[look.hairColor] || LOOK_OPTIONS.hairColor[0]).hex, f);
    if (hairList.length) this._attach('head', hairList, { x: 0, y: 0, z: 0 }, frame);

    // brows + lips anchor at eye level, then offset within their own meshes
    if (look.brow > 0) {
      const hex = (LOOK_OPTIONS.browColor[look.browColor] || LOOK_OPTIONS.browColor[0]).hex;
      this.faceParts.brows = browMeshes(look.brow, hex, f);
      this._attach('head', this.faceParts.brows, { x: 0, y: f.eyeY, z: f.eyeZ }, frame);
    }
    if (look.lips > 0) {
      const opt = LOOK_OPTIONS.lips[look.lips];
      // natural lips stay painted — only overlay a mesh when a colour is chosen
      if (opt && opt.hex) {
        const lips = lipMesh(opt.hex, f);
        this.faceParts.lip = lips[0];
        this._attach('head', lips, { x: 0, y: f.eyeY, z: f.eyeZ }, frame);
      }
    }
    if (look.glasses > 0) {
      const frameHex = (LOOK_OPTIONS.frame[look.frame] || LOOK_OPTIONS.frame[0]).hex;
      const lensOpt = LOOK_OPTIONS.lens[look.lens] || LOOK_OPTIONS.lens[0];
      // keep the frames in front of the 3D eye layer
      const dz = this.faceDetail ? 0.016 : 0;
      this._attach('head', glassMeshes(look.glasses, frameHex, lensOpt, f), { x: 0, y: f.eyeY, z: f.eyeZ + dz }, frame);
    }

    // headwear (scaled up for the Vanguard's bulky helmet)
    const S = this.modelKey === 'soldier' ? 1.45 : 1;
    if (look.head === 1) this._attach('head', [this._buildCap()], { x: 0, y: f.headR * 1.42, z: 0.004 }, frame, S);
    else if (look.head === 2) this._attach('head', this._buildGele(), { x: 0, y: f.headR * 1.28, z: -0.01 }, frame, S * 0.85);
    else if (look.head === 3) this._attach('head', this._buildBandana(), { x: 0, y: f.headR * 1.18, z: 0 }, frame, S * 0.9);

    // hi-vis agent vest (bigger shell to clear the armour)
    if (look.vest > 0) this._attach('spine2', this._buildVest(LOOK_OPTIONS.vest[look.vest].hex), { x: 0, y: 0.02, z: 0 }, frame, this.modelKey === 'soldier' ? 1.32 : 1);
  }

  /* ---- lifelike face: eyes, lids, blinks, moods, glances ---- */

  _buildFace(frame) {
    const f = this.face;
    const look = this.look;
    const tex = lookTexture(this.modelKey, look);
    const skinHex = sampleSkinHex(this.modelKey, look, tex);
    const isSoldier = this.modelKey === 'soldier';
    const eyeR = f.headR * (isSoldier ? 0.122 : 0.13);
    const eyeW = eyeR * 2.5;
    const eyeH = eyeR * 1.72;
    const coverR = isSoldier ? 0 : f.headR * 0.44;   // hides the painted goggle lens
    const irisHex = isSoldier ? '#3a2a1c' : '#4b3120';

    const patchTex = skinPatchTexture(skinHex);
    const patchMat = new THREE.MeshStandardMaterial({
      map: patchTex, transparent: true, depthWrite: false, roughness: 0.72, metalness: 0,
      side: THREE.DoubleSide
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      map: eyeTexture(irisHex), transparent: true, alphaTest: 0.04, roughness: 0.24, metalness: 0,
      side: THREE.DoubleSide
    });
    const lidMat = new THREE.MeshStandardMaterial({
      map: lidTexture(skinHex, '#2a1a12'), transparent: true, alphaTest: 0.08,
      roughness: 0.68, metalness: 0, side: THREE.DoubleSide
    });
    const lidGeo = new THREE.PlaneGeometry(eyeW * 1.2, eyeH * 1.45);
    lidGeo.translate(0, -eyeH * 0.725, 0);          // pivot on the upper lid edge

    const group = new THREE.Group();
    // soldier: a soft skin faceplate covers the painted mouth-slit and gives
    // the armoured helmet a human lower face
    if (isSoldier) {
      const plate = new THREE.Mesh(new THREE.CircleGeometry(1, 32), patchMat);
      plate.scale.set(f.headR * 0.68, f.headR * 1.02, 1);
      plate.position.set(0, -0.054, 0.022);
      plate.renderOrder = -1;                  // keep it behind the eye layers
      group.add(plate);
      // cover the rest of the armour's painted centre slit below the mouth
      const chin = new THREE.Mesh(new THREE.CircleGeometry(1, 24), patchMat);
      chin.scale.set(0.026, 0.056, 1);
      chin.position.set(0, -0.126, 0.0278);
      chin.renderOrder = -1;
      group.add(chin);
      const mouthMat = new THREE.MeshStandardMaterial({
        map: mouthTexture(), transparent: true, alphaTest: 0.05, roughness: 0.5, metalness: 0,
        side: THREE.DoubleSide
      });
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mouthMat);
      mouth.userData.baseSX = 0.05;
      mouth.userData.baseSY = 0.023;
      mouth.scale.set(0.05, 0.023, 1);
      mouth.position.set(0, -0.064, 0.028);
      group.add(mouth);
      this.faceParts.lip = mouth;
    }
    for (const side of [-1, 1]) {
      const x = side * f.eyeX;
      if (coverR > 0) {
        const patch = new THREE.Mesh(new THREE.CircleGeometry(coverR, 24), patchMat);
        patch.position.set(x * 0.8, 0, 0.004);   // inward overlap hides the painted bridge
        group.add(patch);
      }
      const eye = new THREE.Mesh(new THREE.PlaneGeometry(eyeW, eyeH), eyeMat);
      eye.position.set(x, 0, 0.0055);
      group.add(eye);
      this.faceParts.eyes.push(eye);

      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.set(x, eyeH * 0.48, 0.008);
      lid.scale.y = 0.16;
      group.add(lid);
      this.faceParts.lids.push(lid);
    }
    // soft 3D nose so the covered goggles read as a human face
    const noseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(shadeHex(skinHex, 0.94)), roughness: 0.7, metalness: 0
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), noseMat);
    nose.scale.set(0.0095, 0.0125, 0.0085);
    nose.position.set(0, isSoldier ? -0.032 : -0.028, isSoldier ? 0.023 : 0.010);
    group.add(nose);
    const attached = this._attach('head', group, { x: 0, y: f.eyeY, z: f.eyeZ }, frame);
    if (attached) attached.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }

  /** mood name from the AI reply / brain; smoothly interpolated in update() */
  setExpression(mood) {
    this.expression.mood = mood || 'calm';
  }

  /** short procedural gesture: wave | nod | laugh | shrug | cheer */
  emote(kind) {
    const durations = { wave: 2.4, nod: 1.1, laugh: 1.5, shrug: 1.5, cheer: 1.8, point: 1.7 };
    const dur = durations[kind] || 1.2;
    this.emoteState = { kind, t: 0, dur };
    if (kind === 'cheer') this.playDance(dur);
  }

  /** world point to glance at (player); null lets the eyes wander naturally */
  lookAt(target) {
    this.lookTarget = target ? { x: target.x, y: target.y, z: target.z } : null;
  }

  _clearBoneOffsets() {
    if (!this._boneOffsets || !this._boneOffsets.length) return;
    for (let i = this._boneOffsets.length - 1; i >= 0; i--) {
      const o = this._boneOffsets[i];
      if (o.inv) o.bone.quaternion.premultiply(o.inv);
      if (o.pos) o.bone.position.sub(o.pos);
    }
    this._boneOffsets.length = 0;
  }

  _boneRotate(bone, x, y, z) {
    if (!bone) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
    bone.quaternion.multiply(q);
    this._boneOffsets.push({ bone, inv: q.clone().invert() });
  }

  _boneShift(bone, x, y, z) {
    if (!bone) return;
    bone.position.x += x; bone.position.y += y; bone.position.z += z;
    this._boneOffsets.push({ bone, pos: new THREE.Vector3(x, y, z) });
  }

  _updateFace(dt) {
    // blink scheduling: short lid sweep every few seconds, sometimes twice
    this._blinkIn -= dt;
    if (this._blinkIn <= 0 && this._blinkT < 0) {
      this._blinkIn = 2.2 + Math.random() * 3.8;
      this._blinkT = 0;
      this._doubleBlink = Math.random() < 0.22;
    }
    let blink = 0;
    if (this._blinkT >= 0) {
      this._blinkT += dt;
      const k = this._blinkT / 0.15;
      blink = k < 0.5 ? Math.sin(k * Math.PI) : 0;
      if (k >= 1) {
        this._blinkT = -1;
        if (this._doubleBlink) { this._doubleBlink = false; this._blinkIn = 0.22; }
      }
    }
    const want = moodTargets(this.expression.mood);
    const ease = Math.min(1, dt * 3.6);
    for (const key of ['browLift', 'browWorry', 'squint', 'tilt', 'lift', 'smile']) {
      this.expression[key] += ((want[key] || 0) - this.expression[key]) * ease;
    }
    const ex = this.expression;
    const lid = Math.max(0.16, Math.min(1.12, 0.16 + ex.squint * 0.62 + blink * 1.04));
    for (const l of this.faceParts.lids) l.scale.y = lid;
    for (const b of this.faceParts.brows) {
      const side = b.userData.side || 1;
      b.position.y = (b.userData.baseY || 0) + ex.browLift;
      b.rotation.z = (b.userData.baseRot || 0) - side * ex.browWorry;
    }
    if (this.faceParts.lip) {
      const lip = this.faceParts.lip;
      const sx = lip.userData.baseSX || 0.023;
      const sy = lip.userData.baseSY || 0.008;
      lip.scale.x = sx * (1 + Math.max(0, ex.smile) * 0.22);
      lip.scale.y = sy * (1 + Math.min(0, ex.smile) * 0.35);
    }
  }

  _updateLife(dt) {
    this._lifeT += dt;
    this._updateFace(dt);

    // emote timeline (smooth in/out envelope)
    let armR = 0, armL = 0, foreR = 0, headPitch = 0, headRoll = 0;
    if (this.emoteState) {
      const es = this.emoteState;
      es.t += dt;
      const k = Math.min(1, es.t / es.dur);
      const env = Math.sin(k * Math.PI);
      switch (es.kind) {
        case 'wave':
          armR = -1.25 * env;
          foreR = Math.sin(es.t * 9) * 0.42 * env;
          headRoll = this.expression.tilt + 0.08 * env;
          break;
        case 'nod':
          headPitch = Math.sin(es.t * 11) * 0.16 * env;
          break;
        case 'laugh':
          headPitch = -0.14 * env + Math.sin(es.t * 17) * 0.045 * env;
          headRoll = Math.sin(es.t * 9) * 0.07 * env;
          this._boneShift(this.bones.hips, 0, Math.abs(Math.sin(es.t * 11)) * 0.012 * env, 0);
          break;
        case 'shrug':
          armR = -0.32 * env; armL = 0.32 * env;
          headRoll = 0.1 * env;
          break;
        default: break;
      }
      if (k >= 1) this.emoteState = null;
    }

    // idle breathing + weight shift (tiny, additive to the animation)
    const t = this._lifeT;
    this._boneRotate(this.bones.spine2, Math.sin(t * 1.5) * 0.009 + this.expression.lift * 0.14, 0, Math.sin(t * 0.55) * 0.01);
    this._boneRotate(this.bones.hips, 0, 0, Math.sin(t * 0.5) * 0.008);
    this._boneRotate(this.bodyBones.rightarm, 0, 0, armR);
    this._boneRotate(this.bodyBones.leftarm, 0, 0, armL);
    this._boneRotate(this.bodyBones.rightforearm, 0, 0, foreR);
    if (this.bones.head) {
      // glance at the player when close; otherwise small natural eye/head drift
      let wantYaw = Math.sin(t * 0.33 + this._lifeSeed) * 0.16;
      let wantPitch = Math.sin(t * 0.21 + this._lifeSeed * 2) * 0.05;
      if (this.lookTarget) {
        const head = this.bones.head.getWorldPosition(new THREE.Vector3());
        const dx = this.lookTarget.x - head.x, dz = this.lookTarget.z - head.z;
        const rel = wrapAngle(Math.atan2(dx, dz) - this.root.rotation.y);
        const horiz = Math.hypot(dx, dz);
        if (Math.abs(rel) < 1.35 && horiz < 7) {
          wantYaw = clamp(rel, -0.75, 0.75);
          wantPitch = clamp(Math.atan2(this.lookTarget.y - head.y, Math.max(0.5, horiz)), -0.3, 0.35);
        }
      }
      const lookEase = Math.min(1, dt * 3.2);
      this._lookYaw += (wantYaw - this._lookYaw) * lookEase;
      this._lookPitch += (wantPitch - this._lookPitch) * lookEase;
      this._boneRotate(this.bones.head, -this._lookPitch + headPitch, this._lookYaw, this.expression.tilt + headRoll);
    }
  }

  _buildCap() {    const m = cloth(this.capColor);
    const f = this.face;
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(f.headR * 0.82, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), m);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(f.headR * 0.845, f.headR * 0.845, f.headR * 0.34, 20), m);
    band.position.y = -f.headR * 0.05;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(f.headR * 0.72, f.headR * 0.72, f.headR * 0.15, 20, 1, false, 0, Math.PI), m);
    brim.scale.set(1.0, 1, 1.25);
    brim.position.set(0, 0, f.headR * 1.0);
    g.add(dome, band, brim);
    return g;
  }

  _buildGele() {
    const m = cloth(this.capColor, 0.7);
    const f = this.face;
    const g = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.SphereGeometry(f.headR * 1.14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), m);
    crown.scale.set(1, 0.95, 1.08);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(f.headR * 0.4, 12, 10), m);
    knot.position.set(0.02, f.headR * 0.68, 0.02);
    knot.scale.set(1, 0.7, 1);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.024, f.headR * 0.6, 0.014), m);
    tail.position.set(-f.headR * 0.6, f.headR * 0.3, -f.headR * 0.55);
    tail.rotation.z = 0.5;
    g.add(crown, knot, tail);
    return g;
  }

  _buildBandana() {
    const m = cloth(this.capColor, 0.8);
    const f = this.face;
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(f.headR * 1.13, f.headR * 1.15, f.headR * 0.42, 18), m);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.026, f.headR * 0.7, 0.012), m);
    tail.position.set(-f.headR * 0.68, -f.headR * 0.35, -f.headR * 0.6);
    tail.rotation.z = 0.35;
    g.add(band, tail);
    return g;
  }

  _buildVest(hex) {
    const m = cloth(hex, 0.7);
    m.side = THREE.DoubleSide;
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2f7c8, roughness: 0.4, side: THREE.DoubleSide });
    const g = new THREE.Group();
    // open-front shell: leave a gap facing +z so it reads as a vest, not a tube
    const gap = 1.05, arc = Math.PI * 2 - gap;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.17, 0.32, 16, 1, true, gap / 2, arc), m);
    body.scale.set(1, 1, 0.62);
    g.add(body);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.115, 0.02), m);
      strap.position.set(side * 0.068, 0.185, -0.01);
      strap.rotation.x = -0.12;
      g.add(strap);
    }
    for (const dy of [-0.075, 0.075]) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.178, 0.028, 16, 1, true, gap / 2, arc), stripeMat);
      stripe.scale.set(1, 1, 0.63);
      stripe.position.y = dy;
      g.add(stripe);
    }
    // back label
    const c = document.createElement('canvas');
    c.width = 128; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EcoCycle', 64, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
    label.position.set(0, 0.06, -0.11);
    label.rotation.y = Math.PI;
    g.add(label);
    return g;
  }
}

export function createCharacter(assetsRef, opts) {
  return new Character(assetsRef, opts);
}
