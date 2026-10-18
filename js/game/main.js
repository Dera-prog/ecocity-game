// EcoCity — game controller. Wires world, player, UI, state and the pickup/flood systems.

import * as THREE from 'three';
import { World, LAYOUT } from './world.js';
import { UI } from './ui.js';
import { loadCharacterAssets, createCharacter } from './characters.js';
import { PlayerController } from './player.js';
import * as stateMod from './state.js';
import { ITEMS, CAP_COLORS, collectRadius, truckDef, GARAGE_UNLOCK, LOOK_UNLOCK, BODY_TYPES } from './state.js';
import { openSorting, isSortingOpen } from './sorting.js';
import { TruckSequence, createAmbientNpcs, createTraffic } from './npc.js';
import { NpcChat } from './npc-chat.js';
import * as startng from './startng.js';
import { initAudio, sfx, setMuted, startRain, stopRain } from './audio.js';

const LITTER_CAP = 48;
const LITTER_INITIAL = 11;
const RISK_WARN = 0.82;
const RISK_SAFE = 0.45;

const app = {
  phase: 'boot',            // boot | menu | creator | play
  bag: [],
  pickup: { active: false, status: null, window: '' },
  flood: { phase: 'idle', timer: 0, level: 0, display: 0, bolt: 0, rumble: 0 },
  litterTimer: 0,
  hudTimer: 0,
  minimapTimer: 0,
  current: null,            // current interaction
  creatorSel: { model: 'michelle', cap: 'green', name: 'Amara', body: 'athletic', look: null },
  startng: null             // start.ng profile { signedIn, id, name, account, style, face } | null = local
};

let renderer, scene, camera, world, ui, player, npcs, traffic, truckSeq, clock, chat;
let charAssets = null;
let previewChar = null;
let moveMarker = null;
let chatNpc = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundRay = new THREE.Raycaster();

boot();

async function boot() {
  ui = new UI({
    onSkipPickup: () => truckSeq && truckSeq.skip()
  });

  clock = new THREE.Clock();

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('load-msg').textContent = 'WebGL is not available in this browser — EcoCity needs it to run.';
    return;
  }
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  document.getElementById('scene-wrap').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

  ui.setLoading(0.04, 'Building the neighbourhood…');
  await nextFrame();
  world = new World(scene);

  moveMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.26, 0.4, 26),
    new THREE.MeshBasicMaterial({ color: 0xf6a821, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  moveMarker.rotation.x = -Math.PI / 2;
  moveMarker.position.y = 0.06;
  moveMarker.visible = false;
  scene.add(moveMarker);
  ui.setLoading(0.1, 'Loading EcoHeroes…');

  const assets = await loadCharacterAssets((p, key) => {
    ui.setLoading(0.1 + p * 0.82, key === 'michelle' ? 'Waking up Amara…' : 'Briefing the crew…');
  });
  charAssets = assets;
  ui.setLoading(1, 'Ready.');

  npcs = createAmbientNpcs(scene, assets);
  chat = new NpcChat({
    getContext: () => chatContext(),
    onReply: (npcId, mood) => {
      const npc = npcs.talkable().find(n => n.personaId === npcId);
      if (npc) npc.mood = mood;
    },
    onOpenChange: (open, npcRef) => {
      if (open) return;
      if (npcRef) npcs.setTalking(npcRef, false);
      chatNpc = null;
      if (player && app.phase === 'play') player.setEnabled(true);
    }
  });
  traffic = createTraffic(scene, assets);
  truckSeq = new TruckSequence(scene, world, assets, {
    onStatus: onTruckStatus,
    onVerified: onTruckVerified,
    onDone: onTruckDone
  });

  window.addEventListener('resize', onResize);
  window.addEventListener('pointerdown', () => initAudio(), { once: true });
  window.addEventListener('beforeunload', () => { if (app.phase === 'play') stateMod.save(); });

  stateMod.on('economy', () => ui.refreshHUD());
  stateMod.on('stats', () => { ui.refreshHUD(); ui.refreshMissions(); });
  stateMod.on('missions', () => ui.refreshMissions());
  stateMod.on('stages', () => ui.updateBag());
  stateMod.on('shop', applyShopVisuals);
  stateMod.on('levelup', e => {
    ui.toast(`Level up! You are now level <b>${e.level}</b> — +${e.level * 25} coins`, { icon: '⬆️', type: 'gold' });
    sfx('levelup');
    if (player && player.character && app.phase === 'play') player.character.playDance(3);
    if (npcs && player) npcs.react('levelup', player.character.position);
    if (e.level === GARAGE_UNLOCK) setTimeout(() => ui.toast('🚛 <b>Fleet garage unlocked!</b> Choose your EcoCycle truck from the garage button.', { icon: '🚛', type: 'gold', ms: 6500 }), 1600);
    if (e.level === LOOK_UNLOCK) setTimeout(() => ui.toast('👕 <b>Wardrobe unlocked!</b> Change outfits for you and the collection crew.', { icon: '👕', type: 'gold', ms: 6500 }), 1600);
    syncStartNgScore();
    updateUnlockButtons();
  });
  stateMod.on('look', e => applyLook(e.who));
  stateMod.on('truck', () => {});   // fleet def is read when the next pickup starts
  stateMod.on('badge', b => {
    ui.toast(`Badge unlocked: <b>${b.name}</b> — ${b.desc}`, { icon: '🏅', type: 'gold', ms: 5000 });
    sfx('badge');
  });

  bindMenu();
  startng.onProfile(p => applyStartNgProfile(p));
  startng.whoami();
  const save = stateMod.loadGame();
  if (save) {
    setMuted(!!save.settings.muted);
    app.creatorSel.model = save.player.model;
    app.creatorSel.cap = save.player.cap;
    app.creatorSel.name = save.player.name;
    app.creatorSel.body = save.player.body || 'athletic';
    app.creatorSel.look = save.player.look;
  }

  app.phase = 'menu';
  ui.showMenu(!!save);
  ui.showTouchControls(isTouch);
  rebuildPreview();
  window.__ecoquest = {
    app,
    items: ITEMS,
    layout: LAYOUT,
    world: () => world,
    player: () => player,
    camera: () => camera,
    scene: () => scene,
    truckSeq: () => truckSeq,
    traffic: () => traffic,
    npcs: () => npcs,
    chat: () => chat,
    ui: () => ui,
    preview: () => previewChar,
    marker: () => moveMarker,
    wp: () => ui.activePreview || null,
    state: () => stateMod.getState(),
    startng: () => startng,
    profile: () => app.startng,
    // headless tabs starve rAF; probes drive the same frame logic explicitly
    tick: (dt = 1 / 30, steps = 1) => {
      for (let i = 0; i < steps; i++) step(dt, clock.elapsedTime + (i + 1) * dt);
      renderer.render(scene, camera);
    }
  };
  animate();
}

function nextFrame() {
  // rAF never fires in a parked/hidden tab — fall back to a timer so boot can't hang
  return new Promise(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(fin);
    setTimeout(fin, 150);
  });
}

const rand = (a, b) => a + Math.random() * (b - a);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ---------------- menu / creator ---------------- */

function bindMenu() {
  document.getElementById('btn-new').addEventListener('click', () => {
    sfx('click');
    app.phase = 'creator';
    restyleCreatorFromStartNg();
    ui.showScreen('creator');
    ui.buildCreator({
      models: [
        { id: 'michelle', name: 'Amara', defaultName: 'Amara', desc: 'Realistic everyday look — tank top and jeans.' },
        { id: 'soldier', name: 'Tunde', defaultName: 'Tunde', desc: 'Collection-crew gear with visor.' }
      ],
      model: app.creatorSel.model,
      name: app.creatorSel.name,
      nameLocked: !!(app.startng && app.startng.signedIn),
      body: app.creatorSel.body,
      bodies: BODY_TYPES,
      onModel: id => { app.creatorSel.model = id; rebuildPreview(); },
      onBody: id => {
        app.creatorSel.body = id;
        if (previewChar) previewChar.setBody(id);
      },
      onCap: hex => {
        const c = CAP_COLORS.find(x => x.hex === hex);
        app.creatorSel.cap = c ? c.id : 'green';
        rebuildPreview();
      },
      onName: name => { app.creatorSel.name = name; }
    });
  });

  document.getElementById('btn-look-edit').addEventListener('click', () => {
    sfx('click');
    ui.openWardrobe({
      creator: true,
      nameLocked: !!(app.startng && app.startng.signedIn),
      look: app.creatorSel.look,
      cap: app.creatorSel.cap,
      model: app.creatorSel.model,
      body: app.creatorSel.body,
      name: app.creatorSel.name,
      onModel: id => {
        app.creatorSel.model = id;
        rebuildPreview();
      },
      onBody: id => {
        app.creatorSel.body = id;
        if (previewChar) previewChar.setBody(id);
      },
      onName: name => {
        app.creatorSel.name = name;
        const el = document.getElementById('hero-name');
        if (el) el.value = name;
      },
      onApply: (look, capId) => {
        app.creatorSel.look = look;
        app.creatorSel.cap = capId;
        applyCreatorPreview();
      }
    });
  });

  document.getElementById('btn-continue').addEventListener('click', () => {
    sfx('click');
    const st = stateMod.getState();
    startGame(st.player.model, st.player.cap);
  });

  document.getElementById('btn-howto').addEventListener('click', () => { sfx('click'); ui.showScreen('howto'); });
  document.getElementById('btn-howto-close').addEventListener('click', () => {
    sfx('click');
    if (app.phase === 'menu') ui.showScreen('menu');
    else ui.hideScreens();
  });

  document.getElementById('btn-create-start').addEventListener('click', () => {
    sfx('success');
    startGame(app.creatorSel.model, app.creatorSel.cap, { fresh: true });
  });

  document.getElementById('btn-wallet').addEventListener('click', () => {
    sfx('click');
    ui.openWallet({ onRequestPickup: requestPickup, hasActivePickup: () => app.pickup.active });
  });
  document.getElementById('btn-badges').addEventListener('click', () => { sfx('click'); ui.openBadges(); });
  document.getElementById('btn-shop').addEventListener('click', () => { sfx('click'); ui.openShop(); });
  document.getElementById('btn-wardrobe').addEventListener('click', () => {
    const st = stateMod.getState();
    if (!st || st.level < LOOK_UNLOCK) { sfx('wrong'); ui.toast(`Wardrobe unlocks at level ${LOOK_UNLOCK}. Keep sorting to level up!`, { icon: '👕', type: 'gold' }); return; }
    sfx('click');
    ui.openWardrobe({ who: 'player' });
  });
  document.getElementById('btn-garage').addEventListener('click', () => {
    const st = stateMod.getState();
    if (!st || st.level < GARAGE_UNLOCK) { sfx('wrong'); ui.toast(`Fleet garage unlocks at level ${GARAGE_UNLOCK}. Keep recycling!`, { icon: '🚛', type: 'gold' }); return; }
    sfx('click');
    ui.openGarage();
  });
  document.getElementById('btn-menu').addEventListener('click', () => {
    sfx('click');
    ui.openPause({
      onResume: () => {},
      onMenu: () => { app.phase = 'menu'; document.getElementById('hud').classList.add('hidden'); ui.showMenu(true); },
    });
  });

  const runBtn = document.getElementById('run-btn');
  const setRun = on => { if (player) { player.setTouchRun(on); ui.setRunActive(on); } };
  runBtn.addEventListener('pointerdown', e => { e.preventDefault(); setRun(true); });
  runBtn.addEventListener('pointerup', () => setRun(false));
  runBtn.addEventListener('pointerleave', () => setRun(false));

  document.getElementById('action-btn').addEventListener('click', () => doAction());

  document.getElementById('sn-signin').addEventListener('click', () => {
    sfx('click');
    startng.signIn();
  });
}

/* ---------------- start.ng ---------------- */

function applyStartNgProfile(p) {
  app.startng = p;
  updateProfileChip();
  // mid-creator updates (player signed in on start.ng while the creator is open) restyle live
  if (p && app.phase === 'creator') {
    restyleCreatorFromStartNg();
    if (previewChar) {
      previewChar.setLook(app.creatorSel.look || {});
      previewChar.setBody(app.creatorSel.body || 'athletic');
    }
  }
}

/** dress the creator hero after the player's start.ng character (signed-in names are fixed) */
function restyleCreatorFromStartNg() {
  const p = app.startng;
  if (!p || !p.style) return;
  const c = startng.styleToCharacter(p.style);
  app.creatorSel.model = c.model;
  app.creatorSel.body = c.body;
  app.creatorSel.look = c.look;
  if (p.signedIn) app.creatorSel.name = (p.name || 'EcoHero').slice(0, 16);
  if (app.phase === 'creator') {
    ui.setCreatorModel(c.model);
    ui.setCreatorBody(c.body);
    const el = document.getElementById('hero-name');
    if (el && !el.disabled) el.value = app.creatorSel.name;
  }
}

function updateProfileChip() {
  const chip = document.getElementById('sn-chip');
  const face = document.getElementById('sn-face');
  const nameEl = document.getElementById('sn-name');
  const accEl = document.getElementById('sn-account');
  const btn = document.getElementById('sn-signin');
  const p = app.startng;
  if (!p) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  if (p.face) { face.src = p.face; face.hidden = false; } else { face.removeAttribute('src'); face.hidden = true; }
  nameEl.textContent = p.name;
  accEl.textContent = p.signedIn ? (p.account ? '@' + p.account : 'start.ng player') : 'Guest — tap to save progress on start.ng';
  btn.classList.toggle('hidden', !!p.signedIn);
}

let lastScoreKey = '';

/** push best-run stats to the start.ng leaderboard; toast on a new personal best */
async function syncStartNgScore() {
  if (!startng.isSignedIn()) return;
  const st = stateMod.getState();
  if (!st || app.phase !== 'play') return;
  const stats = { litter: st.stats.collected || 0, floods: st.stats.floodsPrevented || 0 };
  const key = stats.litter + '/' + stats.floods;
  if (key === lastScoreKey) return;
  lastScoreKey = key;
  const res = await startng.saveScore(stats);
  if (res && res.improved) {
    ui.toast(`Leaderboard: <b>New best!</b> You are #${res.rank} — ${stats.litter} litter · ${stats.floods} floods prevented.`, { icon: '🏆', type: 'gold', ms: 5600 });
    sfx('badge');
  }
}

function rebuildPreview() {
  const old = previewChar;
  const capHex = (CAP_COLORS.find(c => c.id === app.creatorSel.cap) || CAP_COLORS[0]).hex;
  const char = createCharacter(charAssets, { model: app.creatorSel.model, capColor: capHex, look: app.creatorSel.look || {}, body: app.creatorSel.body || 'athletic' });
  char.root.position.set(LAYOUT.spawn.x, 0, LAYOUT.spawn.z);
  scene.add(char.root);
  previewChar = char;
  if (old) scene.remove(old.root);
}

/** live-apply creator edits to the orbiting preview without rebuilding the rig */
/** screen point → ground point for tap/click-to-walk, clamped to reachable range */
function resolveGroundClick(clientX, clientY) {
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  groundRay.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!groundRay.ray.intersectPlane(groundPlane, hit)) return null;
  if (player) {
    const p = player.character.position;
    const dx = hit.x - p.x, dz = hit.z - p.z;
    const d = Math.hypot(dx, dz);
    const MAX = 24;
    if (d > MAX) { hit.x = p.x + (dx / d) * MAX; hit.z = p.z + (dz / d) * MAX; }
    world.clampToBounds(hit);
  }
  return hit;
}

const charRay = new THREE.Raycaster();
const charSphere = new THREE.Sphere();
const charCenter = new THREE.Vector3();

/** true when the tap landed on the playable character (small halo for finger error) */
function resolveCharacterClick(clientX, clientY) {
  if (!player || app.phase !== 'play') return false;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  charRay.setFromCamera(ndc, camera);
  if (charRay.intersectObject(player.character.root, true).length) return true;
  charCenter.set(player.character.position.x, player.character.position.y + 0.85, player.character.position.z);
  charSphere.set(charCenter, 0.6);
  return charRay.ray.intersectsSphere(charSphere);
}

/** random reachable point near the player for self-walking */
function autoTarget() {
  if (!player) return null;
  const p = player.character.position;
  const ang = Math.random() * Math.PI * 2;
  const dist = 5 + Math.random() * 9;
  const hit = new THREE.Vector3(p.x + Math.sin(ang) * dist, 0, p.z + Math.cos(ang) * dist);
  world.clampToBounds(hit);
  return hit;
}

/** the named street character under a tap, with a forgiving sphere fallback */
function resolveNpcClick(clientX, clientY) {
  if (app.phase !== 'play' || !npcs) return null;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  charRay.setFromCamera(ndc, camera);
  let best = null, bestT = Infinity;
  for (const npc of npcs.talkable()) {
    const hits = charRay.intersectObject(npc.char.root, true);
    if (hits.length && hits[0].distance < bestT) { bestT = hits[0].distance; best = npc; }
  }
  if (best) return best;
  for (const npc of npcs.talkable()) {
    const p = npc.char.root.position;
    charCenter.set(p.x, p.y + 0.85, p.z);
    charSphere.set(charCenter, 0.9);
    if (charRay.ray.intersectsSphere(charSphere)) {
      const d = charRay.ray.origin.distanceTo(charCenter);
      if (d < bestT) { bestT = d; best = npc; }
    }
  }
  return best;
}

function chatContext() {
  const st = stateMod.getState();
  const weather = currentWeather();
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 20 ? 'evening' : 'night';
  const npc = chatNpc;
  const allowedActivity = ['stall', 'dance', 'busstop', 'stroll', 'shelter', 'talk'];
  const allowedMood = ['cheerful', 'curious', 'tired', 'worried', 'proud', 'playful', 'excited', 'calm'];
  return {
    playerName: (st && st.player && st.player.name) || 'Amara',
    level: (st && Number.isInteger(st.level)) ? st.level : 1,
    collected: (st && st.stats && st.stats.collected) || 0,
    prevented: (st && st.stats && st.stats.floodsPrevented) || 0,
    weather,
    timeOfDay,
    activity: npc && allowedActivity.includes(npc.activity) ? npc.activity : 'stroll',
    mood: npc && allowedMood.includes(npc.mood) ? npc.mood : 'cheerful'
  };
}

function openChat(npc) {
  if (!npc || !chat || app.phase !== 'play') return;
  chatNpc = npc;
  if (player) {
    const p = npc.char.root.position;
    const q = player.character.position;
    player.setEnabled(false);
    npc.char.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    npc.char.lookAt({ x: q.x, y: q.y + 1.35, z: q.z });
  }
  npcs.setTalking(npc, true);
  chat.open(npc);
}

function currentWeather() {
  const phase = app.flood.phase;
  return phase === 'flood' ? 'flood' : phase === 'warning' ? 'storm' : phase === 'recede' ? 'rain' : 'clear';
}

const litterRay = new THREE.Raycaster();

/** the litter item under a tap, with a forgiving fallback for small pieces */
function resolveLitterClick(clientX, clientY) {
  if (app.phase !== 'play') return null;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  litterRay.setFromCamera(ndc, camera);
  const meshes = [];
  for (const l of world.litter) if (!l.removing) meshes.push(l.mesh);
  const hits = litterRay.intersectObjects(meshes, true);
  if (hits.length) {
    let o = hits[0].object;
    while (o.parent && o.parent !== world.group) o = o.parent;
    return world.litter.find(l => l.mesh === o) || null;
  }
  // missed the mesh itself: accept litter sitting within 1.1 units of the tapped ground
  const pt = new THREE.Vector3();
  if (!groundRay.ray.intersectPlane(groundPlane, pt)) return null;
  let best = null, bestD = 1.1;
  for (const l of world.litter) {
    if (l.removing) continue;
    const d = Math.hypot(l.mesh.position.x - pt.x, l.mesh.position.z - pt.z);
    if (d < bestD) { bestD = d; best = l; }
  }
  return best;
}

function applyCreatorPreview() {
  if (!previewChar) return;
  const capHex = (CAP_COLORS.find(c => c.id === app.creatorSel.cap) || CAP_COLORS[0]).hex;
  previewChar.setCap(capHex);
  previewChar.setLook(app.creatorSel.look || {});
  document.getElementById('cap-swatches').querySelectorAll('.swatch').forEach(b => {
    b.classList.toggle('selected', b.dataset.cap === app.creatorSel.cap);
  });
}

function startGame(model, capId, opts = {}) {
  const creatorPlayer = { name: app.creatorSel.name || 'Amara', model, cap: capId, body: app.creatorSel.body || 'athletic', look: app.creatorSel.look || {} };
  const st = opts.fresh
    ? stateMod.newGame(creatorPlayer)
    : (stateMod.getState() || stateMod.newGame(creatorPlayer));
  if (opts.fresh) lastScoreKey = '';

  // (re)create the playable character
  if (previewChar) scene.remove(previewChar.root);
  previewChar = null;
  const capHex = (CAP_COLORS.find(c => c.id === capId) || CAP_COLORS[0]).hex;
  const char = createCharacter(charAssets, { model, capColor: capHex, look: st.player.look || {}, body: st.player.body || 'athletic' });
  char.root.position.set(LAYOUT.spawn.x, 0, LAYOUT.spawn.z);
  char.root.rotation.y = Math.PI;
  scene.add(char.root);

  player = new PlayerController(camera, world, char, {
    canvas: renderer.domElement,
    joystickEl: document.getElementById('joystick'),
    joystickKnob: document.getElementById('joy-knob'),
    modalOpen: () => document.getElementById('modal-root').classList.contains('open') || isSortingOpen() || (chat && chat.isOpen()),
    resolveGroundClick,
    resolveCharacterClick,
    resolveNpcClick,
    resolveLitterClick,
    onNpcTalk: openChat,
    onPickup: item => { if (app.phase === 'play') collectLitter(item); },
    autoTarget,
    onAutoWalkChange: on => {
      if (!on) return;
      sfx('click');
      ui.toast(`<b>${st.player.name}</b> is walking around on their own — click them again or take the controls to stop.`, { icon: '🚶', ms: 5200 });
    }
  });
  player.facing = Math.PI;
  player.camYaw = 0;
  player.onAction = () => doAction();
  player.setEnabled(true);
  ui.showTouchControls(player.isTouch);
  ui.setRunActive(false);

  world.setStorm(0);
  world.setFloodLevel(0);
  world.setRain(false);
  app.flood = { phase: 'idle', timer: 0, level: 0, display: st.risk || 0.1 };
  app.bag = [];
  app.pickup = { active: false, status: null, window: '' };

  // seed litter to roughly match the saved risk
  world.clearLitter();
  world.spawnInitialLitter(Math.round(LITTER_INITIAL + (st.risk || 0) * 16));

  applyShopVisuals();
  updateUnlockButtons();
  ui.enterGame();
  ui.setBagCount(0);
  ui.refreshHUD();
  ui.refreshMissions();
  ui.updateBag();
  ui.toggleMissions(false);
  app.phase = 'play';

  if (!st.seenIntro) {
    st.seenIntro = true;
    stateMod.save();
    setTimeout(() => ui.toast('Welcome to Oshodi Green Estate, <b>' + st.player.name + '</b>! Click the ground or use <b>W A S D</b> to walk — or click your character to let them roam on their own. Grab litter with <b>E</b> or the Collect button.', { icon: '♻️', ms: 7000 }), 900);
    setTimeout(() => ui.toast('When your bag is full, sort it at the <b>EcoCycle Hub</b> bins down the street.', { icon: '🗑️', ms: 6000 }), 7000);
    setTimeout(() => ui.toast('Sorted bags wait at your porch — request a <b>truck pickup</b> from the Rewards panel.', { icon: '🚛', ms: 6000 }), 14000);
    setTimeout(() => ui.toast('The people have their own plans now. Walk up to <b>Mama Ngozi</b>, <b>DJ Ada</b>, <b>Auntie Bisi</b> or <b>Chidi</b> and press <b>E</b> to talk.', { icon: '💬', ms: 7500 }), 21000);
  } else {
    ui.toast('Welcome back, ' + st.player.name + '!', { icon: '💚' });
  }
}

function applyShopVisuals() {
  const st = stateMod.getState();
  if (!st) return;
  world.solarPanel.visible = !!st.shop.solar;
  const paint = { mint: '#bfe3c2', sand: '#ead9a8', default: '#e6d9c3' }[st.shop.paint] || '#e6d9c3';
  world.homeWallMat.color.set(paint);
  if (player && player.character) {
    const capHex = (CAP_COLORS.find(c => c.id === st.player.cap) || CAP_COLORS[0]).hex;
    player.character.setCap(capHex);
  }
}

function applyLook(who) {
  const st = stateMod.getState();
  if (!st || who !== 'player') return;   // crew looks are read when a truck spawns
  const capHex = (CAP_COLORS.find(c => c.id === st.player.cap) || CAP_COLORS[0]).hex;
  const target = (app.phase === 'play' && player) ? player.character : previewChar;
  if (target) {
    target.setCap(capHex);
    target.setLook(st.player.look);
    target.setBody(st.player.body || 'athletic');
  }
}

function updateUnlockButtons() {
  const st = stateMod.getState();
  const lvl = st ? st.level : 1;
  document.getElementById('btn-garage').classList.toggle('locked', lvl < GARAGE_UNLOCK);
  document.getElementById('btn-wardrobe').classList.toggle('locked', lvl < LOOK_UNLOCK);
}

/* ---------------- interactions ---------------- */

function scanInteractions() {
  if (app.phase !== 'play' || !player) return;
  if (chat && chat.isOpen()) {
    app.current = null;
    ui.setPrompt(null);
    ui.setActionButton(null);
    return;
  }
  const p = player.character.position;
  let best = null, bestD = Infinity;

  const consider = (d, obj) => { if (obj && d < (obj.radius || 2.6) && d < bestD) { best = obj; bestD = d; } };
  const dist = (x, z) => Math.hypot(x - p.x, z - p.z);

  const r = collectRadius();
  for (const l of world.litter) {
    if (l.removing) continue;
    const d = dist(l.mesh.position.x, l.mesh.position.z);
    consider(d, { type: 'litter', item: l, radius: r, label: `Collect ${ITEMS[l.type].name}`, action: () => collectLitter(l) });
  }

  const S = LAYOUT.station;
  if (dist(S.x, S.z) < 3.4) {
    const n = app.bag.length;
    consider(dist(S.x, S.z), {
      type: 'station', radius: 3.4,
      label: n > 0 ? `Sort your bag (${n} item${n === 1 ? '' : 's'})` : 'Sorting station — bring litter here',
      action: () => {
        if (app.bag.length === 0) { ui.toast('Collect litter first, then sort it here.', { icon: '🗑️' }); return; }
        openSorting({
          items: app.bag.slice(),
          onFinish: res => {
            app.bag = [];
            ui.setBagCount(0);
            stateMod.stageBag(res.items);
            ui.toast(`Smart bag staged at your EcoHome porch — ${res.items.length} items ready for pickup.`, { icon: '🛍️', type: 'green', ms: 5000 });
            if (player && player.character) player.character.playDance(2.5);
          },
          onQuit: () => {}
        });
      }
    });
  }

  const E = LAYOUT.eduKiosk;
  if (dist(E.x, E.z) < 2.6) {
    consider(2.4, { type: 'quiz', radius: 2.6, label: 'EcoLearn quiz', action: () => ui.openQuiz() });
  }

  for (const npc of npcs.talkable()) {
    const d = dist(npc.x, npc.z);
    if (d < 3.0) {
      consider(d, {
        type: 'talk', radius: 3.0, label: `Talk to ${npc.name}`, npc,
        action: () => openChat(npc)
      });
    }
  }

  const porch = LAYOUT.home.porch;
  if (dist(porch.x, porch.z) < 3 && stateMod.getState().stages.length > 0 && !app.pickup.active) {
    consider(2.6, {
      type: 'porch', radius: 3, label: 'Request a truck pickup',
      action: () => requestPickup()
    });
  }

  app.current = best;

  // prompt + ring highlight
  if (best && best.type === 'litter') {
    ui.setPrompt(`<span class="key">E</span> ${best.label}`);
    ui.setActionButton('Collect');
  } else if (best) {
    ui.setPrompt(`<span class="key">E</span> ${best.label}`);
    ui.setActionButton(best.type === 'quiz' ? 'Learn' : best.type === 'talk' ? 'Talk' : best.type === 'porch' ? 'Pickup' : 'Sort');
  } else {
    ui.setPrompt(null);
    ui.setActionButton(null);
  }

  world.litter.forEach(l => { if (l.ring) l.ring.visible = (best && best.item === l); });
}

function doAction() {
  if (app.phase !== 'play') return;
  if (chat && chat.isOpen()) return;
  if (document.getElementById('modal-root').classList.contains('open')) return;
  if (app.current && app.current.action) app.current.action();
}

function collectLitter(l) {
  if (l.removing) return;
  const cap = stateMod.BAG_CAPACITY[Math.min(stateMod.getState().shop.bag, 3) - 1];
  if (app.bag.length >= cap) {
    ui.toast('Your bag is full — sort it at the EcoCycle Hub.', { icon: '🎒', type: 'gold' });
    sfx('wrong');
    return;
  }
  l.removing = true;
  app.bag.push(l.type);
  stateMod.recordCollect(l.type, l.gutter);
  if (npcs) npcs.react('pickup', player ? player.character.position : null);
  sfx('pickup');
  const start = performance.now();
  const mesh = l.mesh;
  const animateOut = () => {
    const k = (performance.now() - start) / 220;
    if (k >= 1) { world.removeLitter(l); ui.setBagCount(app.bag.length); return; }
    mesh.scale.setScalar(1 - k);
    mesh.position.y += 0.03;
    requestAnimationFrame(animateOut);
  };
  requestAnimationFrame(animateOut);
  ui.setBagCount(app.bag.length);
  ui.refreshMissions();
}

/* ---------------- pickup sequence ---------------- */

function requestPickup() {
  const st = stateMod.getState();
  if (app.pickup.active) { ui.toast('A pickup is already in progress.', { icon: '🚛' }); return; }
  if (st.stages.length === 0) { ui.toast('No smart bags staged yet — sort a bag of litter at the Hub first.', { icon: '🛍️' }); return; }

  ui.openSchedule(st.stages, slot => {
    app.pickup = { active: true, status: 'requested', window: slot };
    ui.trackerShow();
    ui.trackerUpdate('requested');
    sfx('click');
    ui.toast(`Pickup requested for <b>${slot}</b> — finding a partner…`, { icon: '📨', ms: 4200 });

    setTimeout(() => {
      if (!app.pickup.active) return;
      ui.trackerUpdate('confirmed');
      ui.toast('EcoWorks Recycling accepted your request.', { icon: '✅', type: 'green' });
      sfx('coin');
    }, 2200);

    setTimeout(() => {
      if (!app.pickup.active) return;
      ui.trackerUpdate('way');
      truckSeq.start(st.stages.slice(), truckDef(st.truck), st.crewLook);
    }, 4000);
  });
}

function onTruckStatus(status) {
  if (!app.pickup.active) return;
  ui.trackerUpdate(status === 'way' ? 'way' : status);
  if (status === 'arrived') {
    ui.toast('The collection crew has arrived at your EcoHome 🚛', { icon: '🏠', type: 'green' });
  }
}

function onTruckVerified(bags) {
  ui.trackerUpdate('verifying');
  setTimeout(() => {
    ui.openVerifyFlow({
      bags,
      onDone: () => {
        const res = stateMod.recordPickup(bags);
        stateMod.removeStages();
        syncStartNgScore();
        ui.trackerUpdate('done');
        ui.toast(`Verified: ${res.totalKg.toFixed(2)} kg → ₦${res.totalValue.toLocaleString()} credited to your wallet.`, { icon: '💚', type: 'gold', ms: 5600 });
        if (player && player.character) player.character.playDance(3);
        setTimeout(() => { ui.trackerHide(); app.pickup = { active: false, status: null, window: '' }; }, 4200);
        truckSeq.continueAfterVerify();
      }
    });
  }, 400);
}

function onTruckDone() {
  ui.toast('Pickup complete. New litter is already appearing — keep the estate clean!', { icon: '🌿' });
}

/* ---------------- flood system ---------------- */

function updateFlood(dt) {
  const gutter = world.gutterLitterCount();
  const total = world.litter.length;
  // gutter weight: piles (weight 4) choke the drain much harder than loose litter.
  // /130 puts a fully-blocked city (~42 gutter weight) at ~0.75 — high but not instant-flood.
  const risk = Math.min(1, (gutter * 2.2 + (total - gutter) * 0.7) / 130);
  app.flood.display += (risk - app.flood.display) * Math.min(1, dt * 1.6);
  const disp = app.flood.display;

  stateMod.setRisk(disp);
  ui.setRisk(disp);

  const f = app.flood;
  switch (f.phase) {
    case 'idle':
      if (risk >= RISK_WARN) {
        f.phase = 'warning';
        f.timer = 30;
        f.rumble = rand(4, 9);
        sfx('horn');
        ui.setStorm('⛈️ Heavy rain in 30s — clear the drains!');
        ui.toast('Rain is coming and the drains are blocked. Collect litter from the gutter to prevent a flood!', { icon: '⛈️', type: 'red', ms: 6000 });
      }
      break;
    case 'warning': {
      f.timer -= dt;
      f.rumble -= dt;
      if (f.rumble <= 0) { f.rumble = rand(6, 12); sfx('thunder'); }   // distant thunder
      const secs = Math.max(0, Math.ceil(f.timer));
      ui.setStorm(`⛈️ Heavy rain in ${secs}s — clear the drains!`);
      if (risk < RISK_SAFE) {
        f.phase = 'safe';
        f.timer = 6;
        stateMod.noteFloodPrevented();
        syncStartNgScore();
        sfx('success');
        ui.setStorm('💚 Crisis averted — the drains are clear!', true);
        ui.toast('You stopped a flood. That is exactly the habit this game is about.', { icon: '🌊', ms: 5200 });
      } else if (f.timer <= 0) {
        f.phase = 'flood';
        f.timer = 42;
        f.bolt = rand(1.5, 4);
        stateMod.noteFlood();
        world.setRain(true);
        startRain();
        sfx('splash');
        ui.setStorm('🌧️ Flooding! Blocked drains are overflowing.');
        ui.toast('This is what blocked drains cause. Keep collecting from the gutter — the water recedes as drains clear.', { icon: '🌧️', type: 'red', ms: 6500 });
      }
      break;
    }
    case 'safe':
      f.timer -= dt;
      if (f.timer <= 0) { f.phase = 'idle'; ui.setStorm(null); }
      break;
    case 'flood': {
      f.timer -= dt;
      f.level = Math.min(1, f.level + dt / 8);
      world.setStorm(Math.min(1, f.level));
      world.setFloodLevel(f.level);
      if (player) player.speedScale = 0.62;

      // thunderstorm: strikes at irregular intervals, thunder follows the flash
      f.bolt -= dt;
      if (f.bolt <= 0) {
        f.bolt = rand(2.4, 7);
        world.flash();
        sfx('thunder');
      }

      if (risk < RISK_SAFE * 0.9 || f.timer <= 0) {
        f.phase = 'recede';
        world.setRain(false);
        stopRain();
        ui.setStorm('🌧️ The rain has stopped — water is receding.');
      }
      break;
    }
    case 'recede': {
      f.level = Math.max(0, f.level - dt / 8);
      world.setStorm(f.level * 0.6);
      world.setFloodLevel(f.level);
      if (player) player.speedScale = 0.62 + (1 - f.level) * 0.38;
      if (f.level <= 0) {
        f.phase = 'idle';
        world.setStorm(0);
        ui.setStorm(null);
        if (player) player.speedScale = 1;
        ui.toast('Streets are dry again. Clean drains keep it that way!', { icon: '☀️' });
      }
      break;
    }
  }
}

/* ---------------- objectives ---------------- */

function updateObjective() {
  const st = stateMod.getState();
  const cap = stateMod.BAG_CAPACITY[Math.min(st.shop.bag, 3) - 1];
  let text;
  if (app.pickup.active) text = 'Pickup in progress — watch the status tracker';
  else if (app.bag.length >= cap) text = 'Bag full → sort it at the EcoCycle Hub';
  else if (app.bag.length > 0) text = `${app.bag.length} piece${app.bag.length === 1 ? '' : 's'} in bag — keep collecting or go sort`;
  else if (st.stages.length > 0) text = 'Smart bags ready → request a pickup (Rewards panel or porch)';
  else if (app.flood.phase === 'warning') text = 'Clear the gutter — rain is coming!';
  else text = 'Collect litter around the estate';
  ui.setObjective(text);
}

/* ---------------- loop ---------------- */

let lastObjectiveAt = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  step(dt, clock.elapsedTime);
  renderer.render(scene, camera);
}

function step(dt, t) {
  const modalOpen = document.getElementById('modal-root').classList.contains('open') || (chat && chat.isOpen());

  if (app.phase === 'creator' || app.phase === 'menu') {
    // turntable preview
    if (previewChar) {
      previewChar.root.rotation.y += dt * 0.55;
      previewChar.setLocomotion(0);
      previewChar.update(dt);
      const p = previewChar.root.position;
      camera.position.lerp(new THREE.Vector3(p.x - 2.2, 1.9, p.z + 3.1), Math.min(1, dt * 3));
      camera.lookAt(p.x - 0.7, 1.1, p.z);
    }
    world.update(dt, t, { x: LAYOUT.spawn.x, z: LAYOUT.spawn.z });
    npcs && npcs.update(dt);
    traffic && traffic.update(dt, t, null);
    moveMarker.visible = false;
  } else if (app.phase === 'play') {
    if (player) {
      player.setEnabled(!modalOpen && !isSortingOpen());
      player.update(dt);
      const target = player.moveTarget && !player.moveTarget.auto ? player.moveTarget : null;
      if (target) {
        moveMarker.visible = true;
        moveMarker.position.set(target.x, 0.06, target.z);
        const s = 1 + Math.sin(t * 7) * 0.14;
        moveMarker.scale.set(s, s, 1);
        moveMarker.material.opacity = 0.55 + Math.sin(t * 7) * 0.22;
      } else {
        moveMarker.visible = false;
      }
    }

    // litter + waste-pile respawn pressure
    app.litterTimer += dt;
    if (app.litterTimer > 13 && world.litter.length < LITTER_CAP) {
      app.litterTimer = 0;
      if (Math.random() < 0.3) world.spawnRandomPile();   // blocked-gutter waste piles build back up
      else world.spawnLitter();
    }

    world.update(dt, t, player ? player.character.position : null);
    npcs.setWeather(currentWeather());
    npcs.update(dt, player ? player.character.position : null);
    traffic.update(dt, t, player ? player.character.position : null);
    truckSeq.update(dt);

    updateFlood(dt);
    scanInteractions();

    app.hudTimer += dt;
    if (app.hudTimer > 0.9) {
      app.hudTimer = 0;
      updateObjective();
      ui.refreshHUD();
    }

    app.minimapTimer += dt;
    if (app.minimapTimer > 0.12) {
      app.minimapTimer = 0;
      ui.drawMinimap({
        player: player.character.position,
        facing: player.facing,
        litter: world.litter,
        truck: truckSeq.active && truckSeq.truck ? { x: truckSeq.truck.group.position.x, z: truckSeq.truck.group.position.z } : null,
        world
      });
    }
  }
}
