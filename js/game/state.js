// Game state: catalogue, economy, missions, badges, save/load.

const SAVE_KEY = 'ecoquest_save_v1';

export const ITEMS = {
  bottle:  { name: 'PET bottle',   cat: 'plastic',  kg: 0.030, note: 'Rinse it — PET bottles are valuable plastic.' },
  sachet:  { name: 'Sachet nylon', cat: 'plastic',  kg: 0.010, note: 'Sachet nylon clogs drains — bundle sachets so they can be recovered.' },
  foodbox: { name: 'Food container', cat: 'plastic', kg: 0.040, note: 'Rinse food containers — leftovers contaminate the batch.' },
  can:     { name: 'Drink can',    cat: 'metal',    kg: 0.020, note: 'Aluminium cans are high-value metal — crush them to save space.' },
  glass:   { name: 'Glass bottle', cat: 'glass',    kg: 0.350, note: 'Glass is endlessly recyclable — keep it whole and separate.' },
  paper:   { name: 'Newspaper',    cat: 'paper',    kg: 0.120, note: 'Keep paper dry and clean — wet or greasy paper can’t be recycled.' },
  carton:  { name: 'Carton',       cat: 'paper',    kg: 0.250, note: 'Flatten cartons so more fit in the bag and on the truck.' },
  ewaste:  { name: 'E-waste',      cat: 'ewaste',   kg: 0.400, note: 'Electronics never go in general waste — bring them to the hub.' },
  textile: { name: 'Old cloth',    cat: 'textile',  kg: 0.150, note: 'Textiles get a second life — bag clothes separately.' }
};

export const CATS = ['plastic', 'paper', 'metal', 'glass', 'ewaste', 'textile'];

// Simulated partner material prices (₦ per kg) — prototype values only.
export const PRICES_PER_KG = { plastic: 120, paper: 60, metal: 320, glass: 45, ewaste: 450, textile: 90 };

export const BADGES = [
  { id: 'rookie',   icon: 'rookie',   name: 'Recycling Rookie',    desc: 'Complete your first verified pickup.',          test: s => s.pickups >= 1 },
  { id: 'plastic',  icon: 'plastic',  name: 'Plastic Protector',   desc: 'Sort 25 plastic items.',                        test: s => (s.sortedByCat.plastic || 0) >= 25 },
  { id: 'expert',   icon: 'expert',   name: 'Waste Sorting Expert', desc: 'Sort 50 items with 90%+ accuracy.',            test: s => s.sortedTotal >= 50 && accuracy(s) >= 90 },
  { id: 'river',    icon: 'river',    name: 'River Guardian',      desc: 'Remove 10 items from the drainage channel.',    test: s => s.gutterRemoved >= 10 },
  { id: 'champion', icon: 'champion', name: 'Community Champion',  desc: 'Complete 5 verified pickups.',                  test: s => s.pickups >= 5 },
  { id: 'storm',    icon: 'river',    name: 'Storm Stopper',       desc: 'Prevent a flood during a rain warning.',        test: s => s.floodsPrevented >= 1 }
];

export const MISSION_POOL = [
  { id: 'litter',  title: 'Litter patrol',   desc: 'Collect 8 pieces of litter',          stat: 'collected',     target: 8,  coins: 40, xp: 50, naira: 0 },
  { id: 'sort',    title: 'Sorting star',    desc: 'Sort 12 items at the hub',            stat: 'sortedTotal',   target: 12, coins: 30, xp: 60, naira: 0 },
  { id: 'pickup',  title: 'Smart recycler',  desc: 'Complete 1 verified pickup',          stat: 'pickups',       target: 1,  coins: 60, xp: 80, naira: 200 },
  { id: 'quiz',    title: 'Quiz whiz',       desc: 'Answer 3 quiz questions correctly',   stat: 'quizCorrect',   target: 3,  coins: 35, xp: 45, naira: 0 },
  { id: 'gutter',  title: 'Gutter guard',    desc: 'Remove 5 items from the drain',       stat: 'gutterRemoved', target: 5,  coins: 45, xp: 55, naira: 0 },
  { id: 'plastic', title: 'Plastic hunter',  desc: 'Collect 6 plastic items',             stat: 'plasticFound',  target: 6,  coins: 40, xp: 50, naira: 0 },
  { id: 'haul',    title: 'Big haul',        desc: 'Stage a smart bag with 12+ items',    stat: 'stagedMaxItems', target: 12, coins: 80, xp: 90, naira: 300 },
  { id: 'double',  title: 'Trusted recycler', desc: 'Complete 2 verified pickups',        stat: 'pickups',       target: 2,  coins: 90, xp: 120, naira: 400 }
];

export const SHOP = {
  bag:       { name: 'Bigger smart bag', desc: 'Carry more litter between trips.',   costs: [150, 400], maxLevel: 3 },
  sneakers:  { name: 'Recycler sneakers', desc: '+25% running speed.',                cost: 200 },
  gloves:    { name: 'Recycler gloves',  desc: 'Collect litter from further away.',   cost: 180 },
  solar:     { name: 'Solar panel',      desc: 'Clean energy for your EcoHome.',      cost: 300 },
  paintMint: { name: 'Fresh mint paint', desc: 'Repaint your EcoHome.',               cost: 120 },
  paintSand: { name: 'Sunny sand paint', desc: 'Repaint your EcoHome.',               cost: 120 }
};

export const BAG_CAPACITY = [12, 20, 30]; // by shop.bag level 1..3
export const CAP_COLORS = [
  { id: 'green',  hex: '#2e7d32', name: 'Forest green' },
  { id: 'red',    hex: '#e53935', name: 'Red' },
  { id: 'charcoal', hex: '#263238', name: 'Charcoal' },
  { id: 'gold',   hex: '#ffc107', name: 'Gold', minLevel: 3 }
];

/* ---------------- appearance: wardrobe (L5+) and truck garage (L4+) ---------------- */

export const LOOK_UNLOCK = 5;    // agent wardrobe (player + crew)
export const GARAGE_UNLOCK = 4;  // EcoCycle truck fleet

export const LOOK_OPTIONS = {
  skin:  [{ name: 'Original', hex: null }, { name: 'Ebony', hex: '#4a2c17' }, { name: 'Cocoa', hex: '#6b3f22' },
          { name: 'Chestnut', hex: '#8a5630' }, { name: 'Caramel', hex: '#a9743f' }, { name: 'Honey', hex: '#c99257' },
          { name: 'Almond', hex: '#dfb287' }, { name: 'Porcelain', hex: '#f0cfae' }],
  top:   [{ name: 'Original', hex: null }, { name: 'Forest', hex: '#2e7d32' }, { name: 'Emerald', hex: '#00a86b' },
          { name: 'Sky', hex: '#4fa3e3' }, { name: 'Royal', hex: '#3556b8' }, { name: 'Coral', hex: '#ff6f61' },
          { name: 'Gold', hex: '#f6a821' }, { name: 'Blush', hex: '#e58fa8' }, { name: 'Lavender', hex: '#9b7ede' },
          { name: 'Charcoal', hex: '#37474f' }, { name: 'Crimson', hex: '#c62828' }, { name: 'Ivory', hex: '#f5f5f0' }],
  bottom:[{ name: 'Original', hex: null }, { name: 'Indigo', hex: '#3a4a7a' }, { name: 'Black denim', hex: '#23272b' },
          { name: 'Khaki', hex: '#b09a6a' }, { name: 'Olive', hex: '#6b7a3f' }, { name: 'Sand', hex: '#cbb48c' },
          { name: 'Wine', hex: '#6d2c3e' }, { name: 'Grey', hex: '#7a828a' }],
  shoes: [{ name: 'Original', hex: null }, { name: 'White', hex: '#f2f2ee' }, { name: 'Black', hex: '#202225' },
          { name: 'Red', hex: '#d32f2f' }, { name: 'Gold', hex: '#e0a800' }, { name: 'Blue', hex: '#2a5db0' },
          { name: 'Green', hex: '#2e7d32' }, { name: 'Pink', hex: '#e38ab8' }],
  hair:  [{ name: 'Her own', hex: null }, { name: 'Top bun', hex: null }, { name: 'Afro', hex: null },
          { name: 'Puffs', hex: null }, { name: 'Braids', hex: null }],
  hairColor: [{ name: 'Natural black', hex: '#1b1512' }, { name: 'Dark brown', hex: '#3a2417' }, { name: 'Brown', hex: '#5a3a22' },
          { name: 'Honey', hex: '#a06a2f' }, { name: 'Blonde', hex: '#d8b05a' }, { name: 'Auburn', hex: '#7a3b1e' },
          { name: 'Silver', hex: '#9e9e9e' }, { name: 'Purple', hex: '#6a3fa0' }, { name: 'Blue black', hex: '#1e2a44' }],
  brow:  [{ name: 'Natural', hex: null }, { name: 'Straight', hex: null }, { name: 'Arched', hex: null },
          { name: 'Bold', hex: null }, { name: 'Thin', hex: null }],
  browColor: [{ name: 'Black', hex: '#1b1512' }, { name: 'Dark brown', hex: '#3a2417' }, { name: 'Brown', hex: '#5a3a22' },
          { name: 'Caramel', hex: '#8a5630' }, { name: 'Silver', hex: '#9e9e9e' }],
  lips:  [{ name: 'Natural', hex: null }, { name: 'Nude', hex: '#b06a5a' }, { name: 'Ruby', hex: '#b3282d' },
          { name: 'Wine', hex: '#6d1f2c' }, { name: 'Pink', hex: '#d8618a' }, { name: 'Coral', hex: '#e0715f' },
          { name: 'Cocoa', hex: '#7a4436' }, { name: 'Plum', hex: '#6a3a5a' }],
  head:  [{ name: 'None', hex: null }, { name: 'Cap', hex: null }, { name: 'Gele wrap', hex: null }, { name: 'Bandana', hex: null }],
  glasses:[{ name: 'None' }, { name: 'Round' }, { name: 'Square' }, { name: 'Aviator' }, { name: 'Cat-eye' }, { name: 'Rect' }],
  frame: [{ name: 'Black', hex: '#1a1a1a' }, { name: 'Gold', hex: '#d4af37' }, { name: 'Silver', hex: '#c0c0c0' },
          { name: 'Red', hex: '#c62828' }, { name: 'Blue', hex: '#1e5aa8' }, { name: 'Green', hex: '#2e7d32' },
          { name: 'Tortoise', hex: '#6b4423' }],
  lens:  [{ name: 'Clear', color: '#dfefff', opacity: 0.16 }, { name: 'Light smoke', color: '#6b6b6b', opacity: 0.34 },
          { name: 'Dark smoke', color: '#26262b', opacity: 0.6 }, { name: 'Brown', color: '#5c3a1e', opacity: 0.42 },
          { name: 'Blue', color: '#1e4f8a', opacity: 0.42 }, { name: 'Gold mirror', color: '#c9a227', opacity: 0.5 }],
  vest:  [{ name: 'None', hex: null }, { name: 'EcoCycle green', hex: '#2e7d32' }, { name: 'Recycler orange', hex: '#ef6c00' },
          { name: 'Reflective gold', hex: '#c9a227' }, { name: 'Contractor blue', hex: '#1e5aa8' }]
};

export const LOOK_PARTS = ['skin', 'top', 'bottom', 'shoes', 'hair', 'hairColor', 'brow', 'browColor', 'lips', 'head', 'glasses', 'frame', 'lens', 'vest'];

export function defaultLook() {
  return { skin: 0, top: 0, bottom: 0, shoes: 0, hair: 0, hairColor: 0, brow: 0, browColor: 1, lips: 0, head: 1, glasses: 0, frame: 0, lens: 2, vest: 0 };
}

export function defaultCrewLook() {
  return { ...defaultLook(), head: 0, vest: 1 };
}

export const BODY_TYPES = [
  { id: 'slim',     name: 'Slim',     desc: 'Lean frame — narrower shoulders, waist and hips.' },
  { id: 'athletic', name: 'Athletic', desc: 'Balanced, sporty build.' },
  { id: 'curvy',    name: 'Curvy',    desc: 'Fuller chest and hips with a defined waist.' },
  { id: 'strong',   name: 'Strong',   desc: 'Broad shoulders and powerful arms.' }
];

export function defaultBody() { return 'athletic'; }
export function bodyDef(id) { return BODY_TYPES.find(b => b.id === id) || BODY_TYPES[1]; }

export const TRUCKS = [
  { id: 'eco',       name: 'EcoCycle Hauler',   desc: 'Standard green-and-white fleet livery.',            cab: '#eef2ee', body: '#f4f7f3', accent: '#2e7d32', minLevel: GARAGE_UNLOCK },
  { id: 'danfo',     name: 'Danfo Express',     desc: 'Lagos-yellow with black racing stripes.',           cab: '#ffd600', body: '#ffd600', accent: '#212121', minLevel: GARAGE_UNLOCK },
  { id: 'compactor', name: 'Big Compactor',     desc: 'Heavy-duty blue rear-loader for market days.',      cab: '#1565c0', body: '#1e88e5', accent: '#ffffff', minLevel: GARAGE_UNLOCK + 1 },
  { id: 'gold',      name: 'Golden Recycler',   desc: 'Premium white-and-gold anniversary fleet.',         cab: '#fdfdf6', body: '#ffffff', accent: '#c9a227', minLevel: GARAGE_UNLOCK + 2 }
];

export function truckDef(id) { return TRUCKS.find(t => t.id === id) || TRUCKS[0]; }

export function accuracy(s) {
  const t = s.correct + s.wrong;
  return t === 0 ? 100 : Math.round((s.correct / t) * 100);
}
export function xpForNext(level) { return 80 + (level - 1) * 60; }

function freshStats() {
  return {
    collected: 0, plasticFound: 0, gutterRemoved: 0,
    sortedTotal: 0, correct: 0, wrong: 0, bestStreak: 0,
    sortedByCat: {}, collectedByCat: {}, kgByCat: {},
    pickups: 0, naira: 0, quizCorrect: 0, quizTotal: 0,
    floods: 0, floodsPrevented: 0, stagedMaxItems: 0
  };
}

function rollMission(state, excludeIds = []) {
  const taken = new Set(excludeIds);
  const options = MISSION_POOL.filter(m => !taken.has(m.id));
  const pick = options[Math.floor(Math.random() * options.length)] || MISSION_POOL[0];
  return { ...pick, base: statValue(state, pick.stat), claimed: false };
}

function statValue(state, stat) {
  if (stat === 'stagedMaxItems') return state.stats.stagedMaxItems;
  return state.stats[stat] || 0;
}

function freshState() {
  const state = {
    version: 1,
    player: { name: 'Amara', model: 'michelle', cap: 'green', body: defaultBody(), look: defaultLook() },
    level: 1, xp: 0, coins: 60, naira: 0,
    score: 0,
    seenIntro: false,
    stats: freshStats(),
    badges: [],
    shop: { bag: 1, sneakers: false, gloves: false, solar: false, paint: 'default' },
    stages: [],           // staged smart bags waiting on the porch
    missions: [],
    risk: 0.12,           // drain-clog risk 0..1, drives the flood system
    truck: 'eco',         // fleet truck variant (garage, L4+)
    crewLook: defaultCrewLook(),  // collection agents (wardrobe, L5+)
    settings: { muted: false }
  };
  const ids = [];
  for (let i = 0; i < 3; i++) { const m = rollMission(state, ids); ids.push(m.id); state.missions.push(m); }
  return state;
}

let state = null;
const listeners = new Map();

export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(cb);
}
export function emit(event, payload) {
  (listeners.get(event) || []).forEach(cb => cb(payload));
}

export function getState() { return state; }

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) {
        state = parsed;
        state.stats = { ...freshStats(), ...parsed.stats };
        state.stats.sortedByCat = { ...(parsed.stats.sortedByCat || {}) };
        state.stats.collectedByCat = { ...(parsed.stats.collectedByCat || {}) };
        state.stats.kgByCat = { ...(parsed.stats.kgByCat || {}) };
        // saves from before the wardrobe/garage update
        state.player.look = { ...defaultLook(), ...(state.player.look || {}) };
        state.crewLook = { ...defaultCrewLook(), ...(state.crewLook || {}) };
        if (!BODY_TYPES.some(b => b.id === state.player.body)) state.player.body = defaultBody();
        if (!state.truck) state.truck = 'eco';
        if (typeof state.score !== 'number') state.score = 0;
        return state;
      }
    }
  } catch (e) { /* fall through to a fresh run */ }
  state = null;
  return null;
}

export function newGame(player) {
  state = freshState();
  if (player) {
    state.player = { ...state.player, ...player };
    state.player.look = { ...defaultLook(), ...(player.look || {}) };
  }
  save();
  return state;
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

/* ---------------- economy ---------------- */

export function addXp(amount) {
  state.xp += amount;
  let leveled = false;
  while (state.xp >= xpForNext(state.level)) {
    state.xp -= xpForNext(state.level);
    state.level += 1;
    state.coins += state.level * 25;
    leveled = true;
  }
  if (leveled) emit('levelup', { level: state.level });
  emit('economy');
  checkBadges();
  save();
  return leveled;
}

export function addCoins(amount) { state.coins += amount; emit('economy'); }
export function spendCoins(amount) {
  if (state.coins < amount) return false;
  state.coins -= amount; emit('economy'); save(); return true;
}
export function addNaira(amount) { state.naira += amount; state.stats.naira += amount; emit('economy'); }

export function bagCapacity() { return BAG_CAPACITY[Math.min(state.shop.bag, 3) - 1]; }
export function speedMultiplier() { return state.shop.sneakers ? 1.25 : 1; }
export function collectRadius() { return state.shop.gloves ? 3.4 : 2.4; }

/* ---------------- stats + missions ---------------- */

export function recordCollect(itemId, fromGutter) {
  const item = ITEMS[itemId];
  state.score += fromGutter ? 15 : 10;
  state.stats.collected += 1;
  state.stats.collectedByCat[item.cat] = (state.stats.collectedByCat[item.cat] || 0) + 1;
  if (item.cat === 'plastic') state.stats.plasticFound += 1;
  if (fromGutter) state.stats.gutterRemoved += 1;
  emit('stats');
  checkMissions();
  save();
}

export function recordSort(itemId, wasCorrect, streak) {
  const item = ITEMS[itemId];
  state.stats.sortedTotal += 1;
  if (wasCorrect) {
    state.stats.correct += 1;
    state.stats.sortedByCat[item.cat] = (state.stats.sortedByCat[item.cat] || 0) + 1;
    state.stats.kgByCat[item.cat] = (state.stats.kgByCat[item.cat] || 0) + item.kg;
    state.coins += 3;
    addXp(4);
  } else {
    state.stats.wrong += 1;
  }
  if (streak > state.stats.bestStreak) state.stats.bestStreak = streak;
  emit('stats'); emit('economy');
  checkMissions();
  save();
}

export function stageBag(items) {
  const breakdown = {};
  let totalKg = 0;
  for (const id of items) {
    const it = ITEMS[id];
    breakdown[it.cat] = (breakdown[it.cat] || 0) + it.kg;
    totalKg += it.kg;
  }
  const value = Object.entries(breakdown).reduce((sum, [cat, kg]) => sum + kg * PRICES_PER_KG[cat], 0);
  const bag = {
    id: 'ECQ-' + Math.floor(1000 + Math.random() * 9000),
    count: items.length,
    breakdown, totalKg, value,
    stagedAt: Date.now()
  };
  state.stages.push(bag);
  if (items.length > state.stats.stagedMaxItems) state.stats.stagedMaxItems = items.length;
  state.coins += 10;
  addXp(15);
  emit('stages');
  checkMissions();
  save();
  return bag;
}

export function removeStages() {
  const bags = state.stages;
  state.stages = [];
  emit('stages');
  return bags;
}

export function recordPickup(bags) {
  const totalValue = bags.reduce((s, b) => s + b.value, 0);
  const totalKg = bags.reduce((s, b) => s + b.totalKg, 0);
  state.stats.pickups += 1;
  state.naira += totalValue;
  state.stats.naira += totalValue;
  state.coins += 20 + bags.length * 10;
  addXp(30 + bags.length * 15);
  emit('economy'); emit('stats');
  checkMissions();
  checkBadges();
  save();
  return { totalValue, totalKg };
}

export function recordQuiz(correct) {
  state.stats.quizTotal += 1;
  if (correct) { state.stats.quizCorrect += 1; addXp(6); }
  emit('stats');
  checkMissions();
  save();
}

export function noteFlood() { state.stats.floods += 1; save(); }
export function noteFloodPrevented() {
  state.stats.floodsPrevented += 1;
  state.coins += 100;
  addXp(60);
  emit('economy');
  checkBadges();
  save();
}

export function setRisk(risk) {
  state.risk = Math.max(0, Math.min(1, risk));
}

/* ---------------- missions ---------------- */

export function missionProgress(m) {
  return Math.max(0, Math.min(m.target, statValue(state, m.stat) - m.base));
}
export function missionDone(m) { return missionProgress(m) >= m.target; }

export function claimMission(index) {
  const m = state.missions[index];
  if (!m || !missionDone(m)) return false;
  state.coins += m.coins;
  if (m.naira) { state.naira += m.naira; state.stats.naira += m.naira; }
  addXp(m.xp);
  const ids = state.missions.map(x => x.id);
  state.missions[index] = rollMission(state, ids);
  emit('missions'); emit('economy');
  save();
  return m;
}

function checkMissions() {
  let any = false;
  state.missions.forEach(m => { if (missionDone(m)) any = true; });
  emit('missions', { anyReady: any });
}

function checkBadges() {
  for (const b of BADGES) {
    if (!state.badges.includes(b.id) && b.test(state.stats)) {
      state.badges.push(b.id);
      emit('badge', b);
    }
  }
}

/* ---------------- shop ---------------- */

export function buyShopItem(key) {
  const s = state.shop;
  if (key === 'bag') {
    if (s.bag >= 3) return { ok: false, reason: 'maxed' };
    const cost = SHOP.bag.costs[s.bag - 1];
    if (!spendCoins(cost)) return { ok: false, reason: 'coins' };
    s.bag += 1;
  } else if (key === 'sneakers' || key === 'gloves' || key === 'solar') {
    if (s[key]) return { ok: false, reason: 'owned' };
    if (!spendCoins(SHOP[key].cost)) return { ok: false, reason: 'coins' };
    s[key] = true;
  } else if (key === 'paintMint' || key === 'paintSand') {
    const paint = key === 'paintMint' ? 'mint' : 'sand';
    if (s.paint === paint) return { ok: false, reason: 'owned' };
    if (!spendCoins(SHOP[key].cost)) return { ok: false, reason: 'coins' };
    s.paint = paint;
  } else if (key.startsWith('cap:')) {
    // cap colours are free to switch; gold unlocks at level 3
    const color = key.slice(4);
    const def = CAP_COLORS.find(c => c.id === color);
    if (def && def.minLevel && state.level < def.minLevel) return { ok: false, reason: 'level' };
    state.player.cap = color;
  }
  emit('shop'); emit('economy');
  save();
  return { ok: true };
}

export function resetProgress() {
  wipeSave();
  location.reload();
}

/* ---------------- wardrobe + garage ---------------- */

/** who: 'player' | 'crew'. Wardrobe is a level-5 perk for agents. */
export function setLook(who, patch) {
  if (state.level < LOOK_UNLOCK) return { ok: false, reason: 'level' };
  const target = who === 'crew' ? state.crewLook : state.player.look;
  if (!target) return { ok: false, reason: 'missing' };
  Object.assign(target, patch);
  emit('look', { who });
  save();
  return { ok: true };
}

export function setTruck(id) {
  if (state.level < GARAGE_UNLOCK) return { ok: false, reason: 'level' };
  const def = TRUCKS.find(t => t.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (state.level < def.minLevel) return { ok: false, reason: 'level' };
  state.truck = id;
  emit('truck', { id });
  save();
  return { ok: true };
}

export function setCapColor(id) {
  const def = CAP_COLORS.find(c => c.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (def.minLevel && state.level < def.minLevel) return { ok: false, reason: 'level' };
  state.player.cap = id;
  emit('look', { who: 'player' });
  save();
  return { ok: true };
}

export function setBody(id) {
  if (state.level < LOOK_UNLOCK) return { ok: false, reason: 'level' };
  if (!BODY_TYPES.some(b => b.id === id)) return { ok: false, reason: 'unknown' };
  state.player.body = id;
  emit('look', { who: 'player' });
  save();
  return { ok: true };
}

/** rename the EcoHero — free, available any time (also mirrored in the creator) */
export function setName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!clean) return { ok: false, reason: 'empty' };
  state.player.name = clean;
  save();
  return { ok: true };
}
