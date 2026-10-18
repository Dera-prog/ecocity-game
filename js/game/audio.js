// Tiny WebAudio synth — no audio files needed.

let ctx = null;
let master = null;
let rainNode = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

function now() { return ctx ? ctx.currentTime : 0; }

function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.22, delay = 0, slide = 0 }) {
  if (!ctx) return;
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noiseBurst({ dur = 0.25, gain = 0.2, freq = 1200, q = 0.8, delay = 0, type = 'bandpass' }) {
  if (!ctx) return;
  const t0 = now() + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

export function sfx(name) {
  initAudio();
  if (!ctx || muted) return;
  switch (name) {
    case 'click': tone({ freq: 620, dur: 0.07, type: 'triangle', gain: 0.14 }); break;
    case 'pickup': tone({ freq: 520, dur: 0.09, type: 'sine', gain: 0.2, slide: 260 }); break;
    case 'coin': tone({ freq: 880, dur: 0.09, gain: 0.16, type: 'square' }); tone({ freq: 1320, dur: 0.16, gain: 0.14, delay: 0.07, type: 'square' }); break;
    case 'correct': tone({ freq: 660, dur: 0.1, gain: 0.18, type: 'sine' }); tone({ freq: 990, dur: 0.18, gain: 0.16, delay: 0.09, type: 'sine' }); break;
    case 'wrong': tone({ freq: 220, dur: 0.22, type: 'sawtooth', gain: 0.14, slide: -80 }); break;
    case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.22, gain: 0.15, delay: i * 0.12, type: 'triangle' })); break;
    case 'success': [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, dur: 0.3, gain: 0.13, delay: i * 0.1, type: 'sine' })); break;
    case 'horn': tone({ freq: 330, dur: 0.28, type: 'square', gain: 0.1 }); tone({ freq: 262, dur: 0.34, type: 'square', gain: 0.1, delay: 0.02 }); break;
    case 'scan': tone({ freq: 700, dur: 0.5, type: 'sine', gain: 0.1, slide: 900 }); break;
    case 'splash': noiseBurst({ dur: 0.5, gain: 0.28, freq: 700, q: 0.6 }); break;
    case 'pop': tone({ freq: 300, dur: 0.06, type: 'triangle', gain: 0.12, slide: 200 }); break;
    case 'badge': [659, 784, 988, 1319].forEach((f, i) => tone({ freq: f, dur: 0.26, gain: 0.14, delay: i * 0.14, type: 'triangle' })); break;
    // thunder: sharp crack, then a long rolling rumble
    case 'thunder':
      noiseBurst({ dur: 0.2, gain: 0.42, freq: 2600, q: 0.7 });
      noiseBurst({ dur: 1.7, gain: 0.36, freq: 240, q: 0.5, delay: 0.06 });
      noiseBurst({ dur: 1.2, gain: 0.26, freq: 130, q: 0.4, delay: 0.5 });
      break;
  }
}

export function startRain() {
  initAudio();
  if (!ctx || rainNode) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 950;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(0.17, now() + 1.5);
  src.connect(f).connect(g).connect(master);
  src.start();
  rainNode = { src, g };
}

export function stopRain() {
  if (!ctx || !rainNode) return;
  const { src, g } = rainNode;
  g.gain.exponentialRampToValueAtTime(0.0001, now() + 1.2);
  setTimeout(() => { try { src.stop(); } catch (e) {} }, 1400);
  rainNode = null;
}
