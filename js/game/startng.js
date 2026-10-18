/* ------------------------------------------------------------------ */
/* start.ng link                                                       */
/*                                                                      */
/* Every player plays as their own start.ng character. The game talks   */
/* to start.ng through its hidden /connect page (postMessage), re-asks  */
/* when the tab refocuses, and degrades gracefully: off *.start.ng      */
/* every call resolves to null and EcoCity stays a fully local game.    */
/* ------------------------------------------------------------------ */

import { LOOK_OPTIONS } from './state.js';

const START_NG = 'https://start.ng';
let frameP = null;
let pinned = false;   // test hook: simulate() freezes the profile so focus events can't clear it

function isStartNgHost() {
  return location.hostname === 'start.ng' || location.hostname.endsWith('.start.ng');
}

function connectFrame() {
  frameP ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frameP;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
async function askStartNg(message, replyType, timeoutMs = 5000) {
  const el = await connectFrame();
  return new Promise(resolve => {
    const requestId = Math.random().toString(36).slice(2);
    const done = reply => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

/* ---------------- profile ---------------- */

let cached = null;
const listeners = new Set();

export function onProfile(fn) { listeners.add(fn); }
export function profile() { return cached; }
export function isSignedIn() { return !!(cached && cached.signedIn); }

function setProfile(p) {
  cached = p;
  listeners.forEach(fn => { try { fn(p); } catch (e) { console.error(e); } });
  return p;
}

export async function whoami() {
  if (pinned) return cached;
  if (!isStartNgHost()) return setProfile(null);
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return setProfile(null);
  const u = reply.user ?? reply.guest;
  if (!u) return setProfile(null);
  return setProfile({
    signedIn: !!reply.user,
    id: u.id ?? null,
    name: u.name || 'Guest',
    account: u.account || null,
    style: u.style || null,
    face: u.face || null
  });
}

// start.ng may flip sign-in state while the tab sits in the background
addEventListener('visibilitychange', () => { if (!document.hidden) whoami(); });
addEventListener('focus', () => whoami());

export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

/* ---------------- character mapping ---------------- */

// weighted-RGB nearest match into an LOOK_OPTIONS family ('Original' never wins)
function nearest(hex, options) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  let best = 0, bestD = Infinity;
  options.forEach((opt, i) => {
    if (!opt.hex) return;
    const c = parseInt(opt.hex.slice(1), 16);
    const dr = r - ((c >> 16) & 255), dg = g - ((c >> 8) & 255), db = b - (c & 255);
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

const HAIR_MAP = { short: 0, afro: 2, braids: 4, bun: 1, ponytail: 0, dreads: 4, bald: 0 };
const HAT_MAP = { none: 0, cap: 1, beanie: 3, tophat: 0, crown: 2 };

/** start.ng style → EcoCity rig ({ model, body, look }); falls back sensibly on unknown values */
export function styleToCharacter(style) {
  const s = style || {};
  const female = (s.body || 'female') !== 'male';
  const glasses = s.accessory === 'glasses';
  return {
    model: female ? 'michelle' : 'soldier',
    body: female ? 'athletic' : 'strong',
    look: {
      skin: nearest(s.skinColor, LOOK_OPTIONS.skin),
      top: nearest(s.primaryColor, LOOK_OPTIONS.top),
      bottom: nearest(s.secondaryColor, LOOK_OPTIONS.bottom),
      shoes: 0,
      hair: HAIR_MAP[s.hair] ?? 0,
      hairColor: nearest(s.hairColor, LOOK_OPTIONS.hairColor),
      brow: 0, browColor: 1, lips: 0,
      head: HAT_MAP[s.hat] ?? 0,
      glasses: glasses ? 1 : 0,
      frame: 0,
      lens: glasses ? 0 : 2,
      vest: s.accessory === 'backpack' ? 1 : 0
    }
  };
}

/* ---------------- leaderboard ---------------- */

export async function saveScore(stats) {
  if (!isSignedIn()) return null;
  const res = await askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved');
  return res && res.ok ? res.result : null;   // { best, improved, rank }
}

export async function leaderboard(limit = 10) {
  const res = await askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData');
  return res && res.ok ? res.entries : null;
}

// probe hook: freeze a fake signed-in/guest profile (null unpin → back to live behaviour)
export function simulate(p) {
  pinned = !!p;
  return setProfile(p ? {
    signedIn: p.signedIn !== false,
    id: p.id ?? 42,
    name: p.name || 'Runner Tee',
    account: p.account || null,
    style: p.style ?? {
      body: 'female', primaryColor: '#a55eea', secondaryColor: '#0c6e5a',
      skinColor: '#8d5524', hairColor: '#17120f', hair: 'braids',
      hat: 'crown', accessory: 'earrings'
    },
    face: p.face ?? null
  } : null);
}
