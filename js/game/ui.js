// All DOM UI: HUD, panels, modals, quiz, pickup flow, minimap, toasts.

import * as stateMod from './state.js';
import { BADGES, CAP_COLORS, SHOP, BAG_CAPACITY, PRICES_PER_KG, ITEMS, accuracy, missionProgress, missionDone, xpForNext, LOOK_OPTIONS, GARAGE_UNLOCK, LOOK_UNLOCK, TRUCKS, truckDef, defaultLook, BODY_TYPES } from './state.js';
import { sfx, setMuted, isMuted } from './audio.js';
import { LAYOUT } from './world.js';
import { getAssets } from './characters.js';
import { WardrobePreview } from './preview3d.js';

const $ = id => document.getElementById(id);

const QUIZ_BANK = [
  { q: 'Why do blocked gutters cause flooding?', options: ['Rainwater cannot flow away', 'Gutters make water rise', 'Rain falls harder when drains are dirty'], correct: 0, why: 'Drains carry rainwater away. When nylon and bottles block them, water backs up into streets and homes.' },
  { q: 'Where should an old phone charger or radio go?', options: ['General waste bin', 'E-waste bin', 'Drainage channel'], correct: 1, why: 'Electronics contain metals and toxins that must be recovered safely — they belong in e-waste, never in a gutter.' },
  { q: 'You just finished a bottle of water. What is the best next step?', options: ['Rinse it and drop it in plastic recycling', 'Throw it in the nearest gutter', 'Bury it'], correct: 0, why: 'A quick rinse keeps the batch clean, and PET bottles are valuable — they earn you money at collection.' },
  { q: 'Sachet-water nylon is a big cause of what?', options: ['Blocked drains and flooding', 'Cheaper water', 'Better soil'], correct: 0, why: 'Sachets are light and flat — they slip into drains, trap other waste and block the flow. Never toss them in a gutter.' },
  { q: 'Why rinse food containers before recycling?', options: ['Leftover food contaminates the recycling batch', 'To use more water', 'It is not necessary'], correct: 0, why: 'Food and grease can ruin a whole batch of recyclables and attract pests. Rinse and empty them first.' },
  { q: 'Which bin should flattened cartons go in?', options: ['Glass', 'Paper / cardboard', 'Plastic'], correct: 1, why: 'Cartons are clean cardboard — flatten them so more fit in your bag and on the truck.' },
  { q: 'What happens to glass bottles after recycling?', options: ['They are melted and made into new glass', 'They are buried', 'They are burned for power'], correct: 0, why: 'Glass can be recycled endlessly — melted down and reshaped into new bottles and jars.' },
  { q: 'Which material is usually worth the most per kilogram?', options: ['Paper', 'Aluminium cans', 'Glass'], correct: 1, why: 'Metal — especially aluminium — has the highest value per kg, so never mix cans with general waste.' },
  { q: 'Why is burning plastic waste dangerous?', options: ['It releases toxic fumes that harm health', 'It makes good fertiliser', 'It does nothing bad'], correct: 0, why: 'Open burning of plastic releases harmful chemicals into the air you and your neighbours breathe.' },
  { q: 'How does recycling change your community?', options: ['Fewer floods, cleaner streets and extra income', 'Only big companies benefit', 'Nothing changes'], correct: 0, why: 'Cleaner drains mean fewer floods, and every verified pickup pays you for materials that were once thrown away.' }
];

export class UI {
  constructor(opts = {}) {
    this.opts = opts;
    this.lastToast = { text: '', at: 0 };
    this.missionsOpen = false;
    this.trackerEl = null;
    this.bindStatics();
  }

  /* ---------------- screens ---------------- */

  showScreen(name) {
    ['loading', 'menu', 'howto', 'creator'].forEach(s => $(s).classList.toggle('visible', s === name));
  }
  hideScreens() {
    ['loading', 'menu', 'howto', 'creator'].forEach(s => $(s).classList.remove('visible'));
  }

  setLoading(p, msg) {
    $('load-bar').style.width = Math.round(p * 100) + '%';
    if (msg) $('load-msg').textContent = msg;
  }

  showMenu(hasSave) {
    $('btn-continue').classList.toggle('hidden', !hasSave);
    this.showScreen('menu');
  }

  enterGame() {
    this.hideScreens();
    $('hud').classList.remove('hidden');
    syncMuteBtn();
  }

  fade(on) {
    $('fade').classList.toggle('on', on);
  }

  /* ---------------- creator ---------------- */

  buildCreator({ models, model = models[0]?.id, name = 'Amara', nameLocked = false, body = 'athletic', bodies = [], onModel, onBody, onCap, onName }) {
    const box = $('char-options');
    const nameInput = $('hero-name');
    nameInput.value = name;
    nameInput.disabled = !!nameLocked;
    if (nameLocked) nameInput.title = 'Your EcoCity hero uses your start.ng character name';
    else nameInput.removeAttribute('title');
    box.innerHTML = '';
    models.forEach(m => {
      const card = document.createElement('button');
      card.className = 'char-card' + (m.id === model ? ' selected' : '');
      card.dataset.model = m.id;
      card.innerHTML = `<b>${m.name}</b><small>${m.desc}</small>`;
      card.addEventListener('click', () => {
        sfx('click');
        box.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        onModel(m.id);
        // default names follow the base character until the player personalises one
        const defs = models.map(x => x.defaultName).filter(Boolean);
        if (!nameInput.value.trim() || defs.includes(nameInput.value.trim())) {
          nameInput.value = m.defaultName || m.name;
          onName(nameInput.value);
        }
      });
      box.appendChild(card);
    });

    const bo = $('body-options');
    const bodyNote = $('body-note');
    const setBodyNote = id => {
      const b = bodies.find(x => x.id === id);
      if (bodyNote && b) bodyNote.textContent = `${b.name} — ${b.desc}`;
    };
    if (bodies.length) {
      bo.innerHTML = '';
      setBodyNote(body);
      bodies.forEach(b => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'body-chip' + (b.id === body ? ' selected' : '');
        chip.dataset.body = b.id;
        chip.title = b.desc;
        chip.textContent = b.name;
        chip.addEventListener('click', () => {
          sfx('click');
          bo.querySelectorAll('.body-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          setBodyNote(b.id);
          onBody && onBody(b.id);
        });
        bo.appendChild(chip);
      });
    }

    const sw = $('cap-swatches');
    sw.innerHTML = '';
    CAP_COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'swatch' + (c.id === 'green' ? ' selected' : '');
      b.dataset.cap = c.id;
      b.style.background = c.hex;
      b.title = c.name + (c.minLevel ? ` (unlocks at level ${c.minLevel})` : '');
      b.addEventListener('click', () => {
        sfx('click');
        sw.querySelectorAll('.swatch').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        onCap(c.hex);
      });
      sw.appendChild(b);
    });

    $('hero-name').addEventListener('input', e => onName(e.target.value.trim() || 'EcoHero'));
  }

  /** studio edits also re-highlight the creator panel behind the modal */
  setCreatorBody(id) {
    const bo = $('body-options');
    if (!bo) return;
    bo.querySelectorAll('.body-chip').forEach(c => c.classList.toggle('selected', c.dataset.body === id));
    const b = BODY_TYPES.find(x => x.id === id);
    const note = $('body-note');
    if (note && b) note.textContent = `${b.name} — ${b.desc}`;
  }

  setCreatorModel(id) {
    document.querySelectorAll('#char-options .char-card').forEach(c => c.classList.toggle('selected', c.dataset.model === id));
  }

  /* ---------------- HUD ---------------- */

  refreshHUD() {
    const st = stateMod.getState();
    $('hud-level').textContent = st.level;
    $('hud-score').textContent = st.score;
    $('hud-coins').textContent = st.coins;
    $('hud-naira').textContent = '₦' + Math.round(st.naira).toLocaleString();
    const need = xpForNext(st.level);
    $('hud-xp-fill').style.width = Math.round((st.xp / need) * 100) + '%';
    $('hud-xp-label').textContent = `${st.xp} / ${need} XP`;
    this.updateBag($('bag-label'));
  }

  updateBag() {
    const st = stateMod.getState();
    const cap = BAG_CAPACITY[Math.min(st.shop.bag, 3) - 1];
    const el = $('bag-label');
    const n = this.bagCount || 0;
    el.textContent = `Bag ${n}/${cap} · ${st.stages.length} bag${st.stages.length === 1 ? '' : 's'} at home`;
    el.parentElement.classList.toggle('full', n >= cap);
  }

  setBagCount(n) { this.bagCount = n; this.updateBag(); }

  setRisk(risk) {
    const pct = Math.round(risk * 100);
    $('risk-fill').style.width = pct + '%';
    $('risk-pct').textContent = pct + '%';
    const fill = $('risk-fill');
    fill.style.background = risk > 0.75 ? 'var(--red)' : risk > 0.45 ? 'var(--gold)' : 'var(--green-500)';
    $('clean-pct').textContent = risk < 0.2 ? 'Clean' : risk < 0.5 ? 'Getting messy' : risk < 0.8 ? 'Littered' : 'Flood risk!';
  }

  setObjective(text) {
    const el = $('objective');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<span class="obj-arrow">➜</span>${text}`;
  }

  setStorm(text, safe = false) {
    const el = $('storm-banner');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('safe', safe);
    el.textContent = text;
  }

  setPrompt(html) {
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = html;
  }

  setActionButton(label) {
    const btn = $('action-btn');
    if (!label) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    btn.textContent = label;
  }

  showTouchControls(isTouch) {
    $('joystick').classList.toggle('hidden', !isTouch);
    $('run-btn').classList.toggle('hidden', !isTouch);
  }

  setRunActive(on) { $('run-btn').classList.toggle('active', on); }

  toast(text, { icon = '', type = '', ms = 3600 } = {}) {
    const now = Date.now();
    if (this.lastToast.text === text && now - this.lastToast.at < 1200) return;
    this.lastToast = { text, at: now };
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `${icon ? `<span class="t-ico">${icon}</span>` : ''}<span>${text}</span>`;
    $('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
    const kids = $('toasts').children;
    if (kids.length > 4) kids[0].remove();
  }

  /* ---------------- missions panel ---------------- */

  refreshMissions() {
    const st = stateMod.getState();
    const list = $('mission-list');
    list.innerHTML = '';
    let anyReady = false;
    st.missions.forEach((m, i) => {
      const done = missionDone(m);
      if (done) anyReady = true;
      const p = missionProgress(m);
      const div = document.createElement('div');
      div.className = 'mission';
      div.innerHTML = `
        <div class="mission-top">
          <span class="mission-title">${m.title}</span>
          <span class="mission-reward">+${m.coins}🪙 +${m.xp}⭐${m.naira ? ` +₦${m.naira}` : ''}</span>
        </div>
        <div class="mission-desc">${m.desc}</div>
        <div class="mission-track"><div class="mission-fill" style="width:${Math.round((p / m.target) * 100)}%"></div></div>
        ${done ? '<button class="mission-claim ready" data-i="' + i + '">Claim reward</button>'
          : `<div class="hud-small" style="color:#a8c9ac">${p} / ${m.target}</div>`}`;
      list.appendChild(div);
    });
    list.querySelectorAll('.mission-claim').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = stateMod.claimMission(parseInt(btn.dataset.i, 10));
        if (m) {
          sfx('coin');
          this.toast(`Mission complete: <b>${m.title}</b> — +${m.coins} coins, +${m.xp} XP${m.naira ? `, +₦${m.naira}` : ''}`, { icon: '🎯', type: 'gold' });
          this.refreshMissions();
        }
      });
    });
    $('missions-badge').classList.toggle('hidden', !anyReady);
  }

  toggleMissions(force) {
    this.missionsOpen = force !== undefined ? force : !this.missionsOpen;
    $('mission-panel').classList.toggle('hidden', !this.missionsOpen);
  }

  /* ---------------- generic modal ---------------- */

  modal({ title, sub = '', body, footer = '', wide = false, wider = false, onClose = null, closeLabel = '✕' }) {
    const root = $('modal-root');
    const el = document.createElement('div');
    el.className = 'modal' + (wide ? ' wide' : '') + (wider ? ' wider' : '');
    el.innerHTML = `
      <div class="modal-head">
        <div>
          <h2 class="modal-title">${title}</h2>
          ${sub ? `<p class="modal-sub">${sub}</p>` : ''}
        </div>
        <button class="modal-close" title="Close">${closeLabel}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
    root.appendChild(el);
    root.classList.add('open');
    const close = () => {
      el.remove();
      if (!root.children.length) root.classList.remove('open');
      onClose && onClose();
    };
    el.querySelector('.modal-close').addEventListener('click', () => { sfx('click'); close(); });
    return { el, close };
  }

  confirm({ title, body, confirmLabel = 'Confirm', onConfirm, onCancel }) {
    const m = this.modal({
      title,
      body: `<p class="dialog-line">${body}</p>`,
      footer: `<button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" data-ok>${confirmLabel}</button>`,
    });
    m.el.querySelector('[data-x]').addEventListener('click', () => { sfx('click'); m.close(); onCancel && onCancel(); });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { sfx('click'); m.close(); onConfirm && onConfirm(); });
  }

  dialog(name, text) {
    const m = this.modal({
      title: `💬 ${name}`,
      body: `<p class="dialog-line"><span class="dialog-name">${name}:</span> “${text}”</p>`,
      footer: `<button class="btn btn-primary" data-ok>Nice</button>`,
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { sfx('click'); m.close(); });
  }

  /* ---------------- quiz ---------------- */

  openQuiz() {
    const picks = shuffle(QUIZ_BANK.slice()).slice(0, 5);
    let idx = 0, score = 0;
    const self = this;

    const m = this.modal({
      title: '📚 EcoLearn quiz',
      sub: 'A quick lesson on waste, drains and recycling — earn XP for every correct answer.',
      body: '<div id="quiz-body"></div>',
      onClose: () => {},
    });

    const body = m.el.querySelector('#quiz-body');

    function render() {
      const q = picks[idx];
      body.innerHTML = `
        <div class="hud-small" style="color:#6d7c72;margin-bottom:.3rem">Question ${idx + 1} of ${picks.length}</div>
        <div class="quiz-q">${q.q}</div>
        <div class="quiz-options">
          ${q.options.map((o, i) => `<button class="quiz-opt" data-i="${i}">${o}</button>`).join('')}
        </div>
        <div class="quiz-explain" id="quiz-explain"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:1rem">
          <button class="btn btn-primary hidden" id="quiz-next">${idx === picks.length - 1 ? 'Finish' : 'Next'}</button>
        </div>`;
      body.querySelectorAll('.quiz-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.i, 10);
          const ok = i === q.correct;
          if (ok) score++;
          stateMod.recordQuiz(ok);
          sfx(ok ? 'correct' : 'wrong');
          body.querySelectorAll('.quiz-opt').forEach(b => {
            b.disabled = true;
            if (parseInt(b.dataset.i, 10) === q.correct) b.classList.add('correct');
            else if (b === btn) b.classList.add('wrong');
          });
          const exp = body.querySelector('#quiz-explain');
          exp.className = 'quiz-explain show';
          exp.innerHTML = `<b>${ok ? 'Correct!' : 'Not quite.'}</b> ${q.why}`;
          body.querySelector('#quiz-next').classList.remove('hidden');
        });
      });
      body.querySelector('#quiz-next').addEventListener('click', () => {
        sfx('click');
        idx++;
        if (idx >= picks.length) {
          sfx('success');
          body.innerHTML = `
            <div style="text-align:center;padding:.8rem 0">
              <div style="font-size:2.6rem">📚</div>
              <h3 style="font-family:var(--font-display);margin:.4rem 0">Quiz complete — ${score}/${picks.length}</h3>
              <p style="color:#5c6b62;font-size:.9rem">Every correct answer earned XP. Knowledge keeps drains clear!</p>
              <button class="btn btn-primary" id="quiz-done" style="margin-top:.8rem">Continue</button>
            </div>`;
          body.querySelector('#quiz-done').addEventListener('click', () => { m.close(); });
        } else render();
      });
    }
    render();
  }

  /* ---------------- pickup: schedule + QR verify ---------------- */

  openSchedule(stages, onConfirm) {
    const totalKg = stages.reduce((s, b) => s + b.totalKg, 0).toFixed(2);
    const value = Math.round(stages.reduce((s, b) => s + b.value, 0));
    const m = this.modal({
      title: '🚛 Schedule a pickup',
      sub: `${stages.length} smart bag${stages.length === 1 ? '' : 's'} staged at your EcoHome · ${totalKg} kg · est. ₦${value.toLocaleString()}`,
      body: `
        <p class="dialog-line" style="margin-bottom:.8rem">Choose a collection window — a nearby verified partner will accept your request.</p>
        <div class="slot-list">
          <button class="slot" data-w="Today, 4–6 PM">Today, 4–6 PM <small>next window</small></button>
          <button class="slot" data-w="Tomorrow, 8–10 AM">Tomorrow, 8–10 AM <small>morning</small></button>
          <button class="slot" data-w="Tomorrow, 4–6 PM">Tomorrow, 4–6 PM <small>afternoon</small></button>
        </div>
        <div class="wallet-note">Prototype note: the truck is dispatched immediately so you can play the whole journey. In production, timing follows this window.</div>`,
    });
    m.el.querySelectorAll('.slot').forEach(s => {
      s.addEventListener('click', () => {
        sfx('click');
        m.close();
        onConfirm(s.dataset.w);
      });
    });
  }

  /** QR scan → verification table → reward. Returns modal handle. */
  openVerifyFlow({ bags, result, onDone }) {
    const labels = [];
    const breakdown = {};
    let totalKg = 0, value = 0;
    bags.forEach(b => {
      labels.push({ id: b.id, count: b.count, kg: b.totalKg });
      for (const [cat, kg] of Object.entries(b.breakdown)) breakdown[cat] = (breakdown[cat] || 0) + kg;
      totalKg += b.totalKg; value += b.value;
    });
    value = Math.round(value);

    const m = this.modal({
      title: '📦 Partner verification',
      sub: 'The collection crew scans your smart bag and records accepted materials.',
      body: `
        <div class="qr-box"><canvas id="qr-canvas" width="128" height="128"></canvas><div class="scanline"></div></div>
        <p class="dialog-line" style="text-align:center;margin-top:.8rem" id="qr-status">Scanning bag ${labels[0] ? labels[0].id : ''}… linking to your account</p>`,
      onClose: () => {},
    });
    drawFakeQR(m.el.querySelector('#qr-canvas'), labels[0] ? labels[0].id : 'ECQ-0000');
    sfx('scan');

    setTimeout(() => {
      const body = m.el.querySelector('.modal-body');
      sfx('coin');
      body.innerHTML = `
        <div class="reward-burst">
          <div class="big">₦${value.toLocaleString()} <small>verified value</small></div>
          <div class="sub">${totalKg.toFixed(2)} kg accepted · ${bags.reduce((s, b) => s + b.count, 0)} items · ${bags.length} bag${bags.length === 1 ? '' : 's'}</div>
        </div>
        <table class="weigh-table">
          <tr><th>Material</th><th>Verified</th><th></th></tr>
          ${Object.entries(breakdown).map(([cat, kg]) =>
        `<tr><td>${catLabel(cat)}</td><td>${kg.toFixed(2)} kg</td><td class="num">₦${Math.round(kg * PRICES_PER_KG[cat]).toLocaleString()}</td></tr>`).join('')}
        </table>
        <div class="reward-pills">
          <span class="pill gold">+₦${value.toLocaleString()} cash</span>
          <span class="pill">+${20 + bags.length * 10} 🪙</span>
          <span class="pill">+${30 + bags.length * 15} ⭐ XP</span>
        </div>
        <div class="wallet-note">Real-world rewards are credited only after partner verification — exactly as this flow shows. Payouts are simulated in this prototype.</div>
        <div style="display:flex;justify-content:flex-end;margin-top:1rem">
          <button class="btn btn-primary" id="verify-done">Collect reward</button>
        </div>`;
      m.el.querySelector('#verify-done').addEventListener('click', () => {
        sfx('success');
        m.close();
        onDone && onDone();
      });
    }, 2600);
    return m;
  }

  /* ---------------- pickup tracker (HUD card) ---------------- */

  trackerShow() {
    if (this.trackerEl) return;
    const el = document.createElement('div');
    el.className = 'meter-card';
    el.style.width = '240px';
    el.style.marginTop = '.2rem';
    el.innerHTML = `
      <div class="meter-row"><span class="meter-label">🚛 Pickup status</span><span class="meter-val" id="tracker-step"></span></div>
      <div class="stepper" id="tracker-steps"></div>`;
    $('hud').querySelector('.hud-top-center').appendChild(el);
    this.trackerEl = el;
  }

  trackerUpdate(statusId) {
    const steps = [
      ['requested', 'Requested'], ['confirmed', 'Confirmed by partner'], ['way', 'Truck on the way'],
      ['arrived', 'Truck arrived'], ['verifying', 'Verifying materials'], ['done', 'Collected & verified']
    ];
    this.trackerShow();
    const order = steps.map(s => s[0]);
    const nowIdx = order.indexOf(statusId);
    const list = this.trackerEl.querySelector('#tracker-steps');
    list.innerHTML = steps.map(([id, label], i) => `
      <div class="step ${i < nowIdx ? 'done' : i === nowIdx ? 'active' : ''}">
        <span class="dot"></span><span class="st-label">${label}</span>
      </div>${i < steps.length - 1 ? `<div class="step-line ${i < nowIdx ? 'done' : ''}"></div>` : ''}`).join('');
    this.trackerEl.querySelector('#tracker-step').textContent = (nowIdx + 1) + '/6';
  }

  trackerHide() {
    if (this.trackerEl) { this.trackerEl.remove(); this.trackerEl = null; }
  }

  /* ---------------- panels: wallet / badges / shop ---------------- */

  openWallet({ onRequestPickup, hasActivePickup }) {
    const st = stateMod.getState();
    const kg = Object.values(st.stats.kgByCat).reduce((a, b) => a + b, 0);
    const staged = st.stages;

    const m = this.modal({
      title: '💰 Rewards wallet',
      sub: 'In-game rewards are separate from real-world value — that principle is written into the PRD.',
      body: `
        <div class="tabs">
          <button class="tab active" data-t="game">In-game</button>
          <button class="tab" data-t="cash">Cash rewards ₦</button>
        </div>
        <div data-pane="game">
          <div class="wallet-grid">
            <div class="stat-card"><div class="s-label">Coins</div><div class="s-value">${st.coins}</div><div class="s-sub">spend in the shop</div></div>
            <div class="stat-card"><div class="s-label">Level</div><div class="s-value">${st.level}</div><div class="s-sub">${st.xp} / ${xpForNext(st.level)} XP</div></div>
            <div class="stat-card"><div class="s-label">Badges</div><div class="s-value">${st.badges.length} / ${BADGES.length}</div><div class="s-sub">earned in the city</div></div>
            <div class="stat-card"><div class="s-label">Sort accuracy</div><div class="s-value">${accuracy(st.stats)}%</div><div class="s-sub">${st.stats.correct} correct of ${st.stats.correct + st.stats.wrong}</div></div>
          </div>
          <div class="wallet-note">Impact so far: <b>${kg.toFixed(2)} kg</b> sorted for recycling, <b>${st.stats.gutterRemoved}</b> items pulled out of drains, <b>${st.stats.pickups}</b> verified pickups.</div>
        </div>
        <div data-pane="cash" class="hidden">
          <div class="reward-burst">
            <div class="big">₦${Math.round(st.naira).toLocaleString()}</div>
            <div class="sub">earned from ${st.stats.pickups} verified pickup${st.stats.pickups === 1 ? '' : 's'} · simulated payout</div>
          </div>
          <div class="payout-row">
            <span class="pill">Bank transfer</span><span class="pill">Airtime / data</span><span class="pill">Voucher</span>
          </div>
          <div class="wallet-note">In production, payout options, limits and licensing follow the PRD’s compliance rules. Reward value comes only from partner-verified weight — never promised before verification.</div>
        </div>
        <div id="wallet-pickup" style="margin-top:1rem"></div>`,
    });

    const pickupArea = m.el.querySelector('#wallet-pickup');

    const renderPickup = () => {
      const fresh = stateMod.getState();
      if (hasActivePickup()) {
        pickupArea.innerHTML = `<div class="wallet-note">🚛 A pickup is in progress — watch the status tracker at the top of the screen.</div>`;
        return;
      }
      if (fresh.stages.length === 0) {
        pickupArea.innerHTML = `<div class="wallet-note">No smart bags staged yet. Collect litter, sort it at the EcoCycle Hub, and your smart bags will wait on your porch for pickup.</div>`;
        return;
      }
      const kgS = fresh.stages.reduce((s, b) => s + b.totalKg, 0).toFixed(2);
      const val = Math.round(fresh.stages.reduce((s, b) => s + b.value, 0));
      pickupArea.innerHTML = `
        <div class="stat-card" style="display:flex;justify-content:space-between;align-items:center;gap:.6rem">
          <div>
            <div class="s-label">Smart bags at home</div>
            <div class="s-value" style="font-size:1rem">${fresh.stages.length} bag${fresh.stages.length === 1 ? '' : 's'} · ${kgS} kg</div>
            <div class="s-sub">est. ₦${val.toLocaleString()} after verification</div>
          </div>
          <button class="btn btn-primary" style="padding:.6rem 1.1rem;font-size:.85rem" id="request-pickup">Request pickup</button>
        </div>`;
      pickupArea.querySelector('#request-pickup').addEventListener('click', () => {
        sfx('click');
        m.close();
        onRequestPickup();
      });
    };
    renderPickup();

    m.el.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        m.el.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        m.el.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== tab.dataset.t));
      });
    });
  }

  openBadges() {
    const st = stateMod.getState();
    this.modal({
      title: '🏅 Badges',
      sub: 'Earned through real habits in the neighbourhood.',
      body: `<div class="badge-grid">
        ${BADGES.map(b => {
        const owned = st.badges.includes(b.id);
        const icon = { rookie: '🌱', plastic: '🧴', expert: '🗂️', river: '💧', champion: '🏘️' }[b.icon] || '🏅';
        return `<div class="badge-card ${owned ? 'earned' : 'locked'}">
            <div class="b-ico">${icon}</div>
            <div class="b-name">${b.name}</div>
            <div class="b-desc">${b.desc}</div>
          </div>`;
      }).join('')}
      </div>`,
    });
  }

  openShop() {
    const self = this;
    const m = this.modal({
      title: '🛒 Eco shop',
      sub: 'Coins only — paid items never give competitive advantages (PRD principle).',
      body: '<div class="shop-grid" id="shop-grid"></div>',
      onClose: () => {},
    });
    const grid = m.el.querySelector('#shop-grid');

    const render = () => {
      const st = stateMod.getState();
      const bagLevel = st.shop.bag;
      const bagMaxed = bagLevel >= 3;
      const bagCost = bagMaxed ? 0 : SHOP.bag.costs[bagLevel - 1];
      grid.innerHTML = `
        <div class="shop-item">
          <div class="si-top"><span class="si-name">🎒 Bigger smart bag</span><span class="si-price">${bagMaxed ? 'MAX' : '🪙 ' + bagCost}</span></div>
          <div class="si-desc">Capacity ${BAG_CAPACITY[bagLevel - 1]} → ${bagMaxed ? BAG_CAPACITY[2] : BAG_CAPACITY[bagLevel]} items per trip.</div>
          <button class="si-buy ${bagMaxed ? 'owned' : ''}" data-k="bag" ${bagMaxed ? 'disabled' : ''}>${bagMaxed ? 'Fully upgraded' : 'Upgrade'}</button>
        </div>
        <div class="shop-item">
          <div class="si-top"><span class="si-name">👟 Recycler sneakers</span><span class="si-price">${st.shop.sneakers ? 'OWNED' : '🪙 ' + SHOP.sneakers.cost}</span></div>
          <div class="si-desc">Run 25% faster between pickups.</div>
          <button class="si-buy ${st.shop.sneakers ? 'owned' : ''}" data-k="sneakers" ${st.shop.sneakers ? 'disabled' : ''}>${st.shop.sneakers ? 'Owned' : 'Buy'}</button>
        </div>
        <div class="shop-item">
          <div class="si-top"><span class="si-name">🧤 Recycler gloves</span><span class="si-price">${st.shop.gloves ? 'OWNED' : '🪙 ' + SHOP.gloves.cost}</span></div>
          <div class="si-desc">Collect litter from further away.</div>
          <button class="si-buy ${st.shop.gloves ? 'owned' : ''}" data-k="gloves" ${st.shop.gloves ? 'disabled' : ''}>${st.shop.gloves ? 'Owned' : 'Buy'}</button>
        </div>
        <div class="shop-item">
          <div class="si-top"><span class="si-name">☀️ Solar panel</span><span class="si-price">${st.shop.solar ? 'OWNED' : '🪙 ' + SHOP.solar.cost}</span></div>
          <div class="si-desc">Clean energy for your EcoHome roof.</div>
          <button class="si-buy ${st.shop.solar ? 'owned' : ''}" data-k="solar" ${st.shop.solar ? 'disabled' : ''}>${st.shop.solar ? 'Owned' : 'Buy'}</button>
        </div>
        <div class="shop-item">
          <div class="si-top"><span class="si-name">🎨 EcoHome paint</span><span class="si-price">🪙 120 each</span></div>
          <div class="si-desc">Fresh mint or sunny sand walls.</div>
          <div class="color-dots">
            <button class="color-dot" data-k="paintMint" title="Fresh mint" style="background:#bfe3c2;${st.shop.paint === 'mint' ? 'border-color:var(--gold)' : ''}"></button>
            <button class="color-dot" data-k="paintSand" title="Sunny sand" style="background:#ead9a8;${st.shop.paint === 'sand' ? 'border-color:var(--gold)' : ''}"></button>
          </div>
        </div>
        <div class="shop-item">
          <div class="si-top"><span class="si-name">🧢 Cap colours</span><span class="si-price">free</span></div>
          <div class="si-desc">Gold unlocks at level 3.</div>
          <div class="color-dots">
            ${CAP_COLORS.map(c => `<button class="color-dot" data-cap="${c.id}" title="${c.name}${c.minLevel ? ` (level ${c.minLevel})` : ''}" style="background:${c.hex};${st.player.cap === c.id ? 'border-color:var(--gold)' : ''}"></button>`).join('')}
          </div>
        </div>`;

      grid.querySelectorAll('.si-buy').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = stateMod.buyShopItem(btn.dataset.k);
          if (res.ok) { sfx('coin'); self.toast('Purchased!', { icon: '🛒', type: 'green' }); render(); }
          else if (res.reason === 'coins') { sfx('wrong'); self.toast('Not enough coins — sort more items!', { icon: '🪙', type: 'red' }); }
        });
      });
      grid.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          if (dot.dataset.cap) {
            const res = stateMod.buyShopItem('cap:' + dot.dataset.cap);
            if (res.ok) { sfx('click'); render(); }
            else if (res.reason === 'level') self.toast('Gold caps unlock at level 3.', { icon: '🧢' });
          } else {
            const res = stateMod.buyShopItem(dot.dataset.k);
            if (res.ok) { sfx('click'); render(); }
            else if (res.reason === 'coins') { sfx('wrong'); self.toast('Not enough coins.', { icon: '🪙', type: 'red' }); }
          }
        });
      });
    };
    render();
  }

  /* ---------------- wardrobe (level 5+) ---------------- */

  openWardrobe({ who: initialWho = 'player', creator = false, look = null, cap = null, model = null, body: initialBody = null, name = null, nameLocked = false, onApply = null, onModel = null, onBody = null, onName = null } = {}) {
    const self = this;
    let who = creator ? 'player' : initialWho;
    let tab = 'body';
    const localLook = { ...defaultLook(), ...(look || {}) };
    let localCap = cap || 'green';
    let localModel = model || 'michelle';
    let localBody = initialBody || 'athletic';
    let localName = name || 'Amara';

    const TABS = [
      { id: 'body', icon: '🧍', label: 'Body' },
      { id: 'face', icon: '🙂', label: 'Face' },
      { id: 'hair', icon: '💇', label: 'Hair & head' },
      { id: 'eyes', icon: '🕶️', label: 'Eyewear' },
      { id: 'vest', icon: '🦺', label: 'Outfit' }
    ];
    const TAB_PARTS = {
      body: ['skin', 'top', 'bottom', 'shoes'],
      face: ['brow', 'browColor', 'lips'],
      hair: ['hair', 'hairColor', 'head'],
      eyes: ['glasses', 'frame', 'lens'],
      vest: ['vest']
    };
    const PART_LABELS = {
      skin: 'Skin tone', top: 'Top', bottom: 'Bottom', shoes: 'Shoes',
      brow: 'Eyebrows', browColor: 'Brow colour', lips: 'Lips',
      hair: 'Hairstyle', hairColor: 'Hair colour', head: 'Headwear',
      glasses: 'Glasses', frame: 'Frame colour', lens: 'Lens tint', vest: 'Vest colour'
    };
    const STYLE_PARTS = new Set(['hair', 'brow', 'head', 'glasses']);

    const capHexOf = id => (CAP_COLORS.find(c => c.id === id) || CAP_COLORS[0]).hex;
    const previewWho = () => {
      const fresh = stateMod.getState();
      if (creator) return { model: localModel, look: localLook, cap: localCap, body: localBody, name: localName };
      if (who === 'crew') return { model: 'soldier', look: fresh.crewLook, cap: fresh.player.cap, body: 'athletic', name: 'Collection crew' };
      return { model: fresh.player.model, look: fresh.player.look, cap: fresh.player.cap, body: fresh.player.body || 'athletic', name: fresh.player.name };
    };

    const partRow = (part, sel) => {
      const opts = LOOK_OPTIONS[part];
      const controls = opts.map((o, i) => {
        const on = i === sel;
        if (part === 'lens') return `<button class="wd-chip ${on ? 'on' : ''}" data-part="${part}" data-i="${i}"><span class="wd-lens-dot" style="background:${o.color};opacity:${Math.min(1, o.opacity + 0.25)}"></span>${o.name}</button>`;
        if (STYLE_PARTS.has(part)) return `<button class="wd-chip ${on ? 'on' : ''}" data-part="${part}" data-i="${i}">${o.name}</button>`;
        if (!o.hex) return `<button class="wd-swatch none ${on ? 'on' : ''}" data-part="${part}" data-i="${i}" title="${o.name}">↩</button>`;
        return `<button class="wd-swatch ${on ? 'on' : ''}" data-part="${part}" data-i="${i}" title="${o.name}" style="background:${o.hex}"></button>`;
      }).join('');
      return `<div class="wd-part"><div class="wd-label">${PART_LABELS[part]}</div><div class="wd-row">${controls}</div></div>`;
    };

    const modelRow = () => `<div class="wd-part"><div class="wd-label">Body model <span class="wd-note">— Amara: everyday look · Tunde: crew gear</span></div><div class="wd-row">${
      [['michelle', 'Amara'], ['soldier', 'Tunde']].map(([id, name]) =>
        `<button class="wd-chip ${localModel === id ? 'on' : ''}" data-model="${id}">${name}</button>`).join('')}</div></div>`;

    const bodyName = id => (BODY_TYPES.find(b => b.id === id) || BODY_TYPES[1]).name;
    const bodyRow = sel => `<div class="wd-part"><div class="wd-label">Body type <span class="wd-note">— sculpted shoulders, waist and hips, live</span></div><div class="wd-row">${
      BODY_TYPES.map(b => `<button class="wd-chip ${sel === b.id ? 'on' : ''}" data-body="${b.id}" title="${b.desc}">${b.name}</button>`).join('')}</div></div>`;

    const escAttr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const nameRow = val => `<div class="wd-part"><div class="wd-label">Name <span class="wd-note">— ${nameLocked ? 'fixed to your start.ng character name' : 'saved with your EcoHero'}</span></div><div class="wd-row"><input id="wd-name" class="wd-name-input" type="text" maxlength="16" autocomplete="off" spellcheck="false" value="${escAttr(val)}" ${nameLocked ? 'disabled title="Your EcoCity hero uses your start.ng character name"' : ''} /></div></div>`;

    const capRow = (selCap, level, free) => `<div class="wd-part"><div class="wd-label">🧢 Cap colour <span class="wd-note">— ${free ? 'pick any colour' : 'premium caps unlock as you level up'}</span></div><div class="wd-row">${
      CAP_COLORS.map(c => {
        const locked = !free && c.minLevel && level < c.minLevel;
        const on = selCap === c.id;
        return `<button class="wd-swatch ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-cap="${c.id}" title="${c.name}${locked ? ` — unlocks at level ${c.minLevel}` : ''}" style="background:${c.hex}">${locked ? '<span class="wd-lock">🔒</span>' : ''}</button>`;
      }).join('')}</div></div>`;

    const m = this.modal({
      title: '👕 Wardrobe',
      sub: creator
        ? 'Design your EcoHero before the shift — body type, name and every look change show in the studio preview instantly. The same wardrobe re-opens in-game from level 5.'
        : `Level ${LOOK_UNLOCK}+ unlocked — dress your EcoHero and the collection crew. The studio preview updates with every tap.`,
      body: `<div class="wd-shell">
        <div id="wd-body"></div>
        <aside class="wd-preview">
          <div class="wd-views">
            <button class="wd-view-btn on" data-view="body">🧍 Full body</button>
            <button class="wd-view-btn" data-view="face">🙂 Face</button>
          </div>
          <canvas id="wd-canvas"></canvas>
          <p class="wd-name-cap" id="wd-name-cap"></p>
          <p class="wd-preview-note" id="wd-preview-note"></p>
        </aside>
      </div>`,
      wider: true,
      onClose: () => { this.activePreview = null; preview.dispose(); }
    });
    const body = m.el.querySelector('#wd-body');

    const preview = new WardrobePreview(m.el.querySelector('#wd-canvas'));
    this.activePreview = preview;
    const syncCaption = () => {
      const cap = m.el.querySelector('#wd-name-cap');
      if (!cap) return;
      const cur = previewWho();
      const nm = String(cur.name || '').trim() || 'EcoHero';
      cap.textContent = `${nm} · ${bodyName(cur.body)} body`;
    };
    {
      const cur = previewWho();
      preview.setCharacter(getAssets(), cur.model, cur.look, capHexOf(cur.cap), cur.body);
      preview.start();
      syncCaption();
    }
    const syncPreview = () => {
      const cur = previewWho();
      preview.setLook(cur.look, capHexOf(cur.cap));
      preview.setBody(cur.body);
    };
    m.el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      sfx('click');
      m.el.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b));
      preview.setView(b.dataset.view);
    }));

    const render = () => {
      const st = stateMod.getState();
      const lookData = creator ? localLook : (who === 'crew' ? st.crewLook : st.player.look);
      body.innerHTML = `
        ${creator ? '' : `<div class="wd-who">
          <button class="wd-who-btn ${who === 'player' ? 'on' : ''}" data-who="player">🧑 ${st.player.name}</button>
          <button class="wd-who-btn ${who === 'crew' ? 'on' : ''}" data-who="crew">🚛 Collection crew</button>
        </div>`}
        <div class="wd-layout">
          <div class="wd-tabs">
            ${TABS.map(t => `<button class="wd-tab ${tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
          </div>
          <div class="wd-panel">
            ${creator && tab === 'body' ? modelRow() : ''}
            ${(creator || who === 'player') && tab === 'body' ? bodyRow(creator ? localBody : (st.player.body || 'athletic')) : ''}
            ${(creator || who === 'player') && tab === 'body' ? nameRow(creator ? localName : st.player.name) : ''}
            ${TAB_PARTS[tab].map(p => partRow(p, lookData[p])).join('')}
            ${(creator || who === 'player') && tab === 'hair' ? capRow(creator ? localCap : st.player.cap, creator ? 99 : st.level, creator) : ''}
            ${!creator && who === 'crew' ? '<p class="wd-hint">Crew looks apply when the EcoCycle truck arrives for your next pickup.</p>' : ''}
          </div>
        </div>`;
      m.el.querySelector('#wd-preview-note').textContent = !creator && who === 'crew'
        ? 'Crew preview — the look applies when the truck arrives.'
        : 'Live studio preview — softbox lighting, reflections and contact shadows follow every change.';
      syncCaption();

      body.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => {
        who = b.dataset.who;
        sfx('click');
        const cur = previewWho();
        preview.setCharacter(getAssets(), cur.model, cur.look, capHexOf(cur.cap), cur.body);
        render();
      }));
      body.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; sfx('click'); render(); }));
      body.querySelectorAll('[data-model]').forEach(el => el.addEventListener('click', () => {
        localModel = el.dataset.model;
        sfx('pickup');
        if (creator && (!localName.trim() || ['Amara', 'Tunde'].includes(localName.trim()))) {
          localName = el.textContent.trim();
          onName && onName(localName);
        }
        onModel && onModel(localModel);
        if (creator) self.setCreatorModel(localModel);
        const cur = previewWho();
        preview.setCharacter(getAssets(), cur.model, cur.look, capHexOf(cur.cap), cur.body);
        render();
      }));
      body.querySelectorAll('[data-body]').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.body;
        if (creator) {
          localBody = id;
          sfx('pickup');
          onBody && onBody(id);
          self.setCreatorBody(id);
          syncPreview();
          render();
          return;
        }
        const res = stateMod.setBody(id);
        if (res.ok) { sfx('pickup'); syncPreview(); render(); }
        else if (res.reason === 'level') self.toast(`Wardrobe unlocks at level ${LOOK_UNLOCK}.`, { icon: '👕' });
      }));
      const nameEl = body.querySelector('#wd-name');
      if (nameEl) {
        nameEl.addEventListener('input', () => {
          const val = nameEl.value;
          if (creator) {
            localName = val;
            onName && onName(val.trim());
          } else {
            const res = stateMod.setName(val);
            if (res.ok) {
              const btn = body.querySelector('[data-who="player"]');
              if (btn) btn.textContent = `🧑 ${stateMod.getState().player.name}`;
            }
          }
          syncCaption();
        });
        nameEl.addEventListener('blur', () => {
          if (nameEl.value.trim()) return;
          const fallback = creator ? 'EcoHero' : stateMod.getState().player.name;
          nameEl.value = fallback;
          if (creator) { localName = fallback; onName && onName(fallback); }
          const btn = body.querySelector('[data-who="player"]');
          if (btn) btn.textContent = `🧑 ${creator ? fallback : stateMod.getState().player.name}`;
          syncCaption();
        });
      }
      body.querySelectorAll('[data-part]').forEach(el => el.addEventListener('click', () => {
        const part = el.dataset.part, i = parseInt(el.dataset.i, 10);
        if (creator) {
          localLook[part] = i;
          sfx('pickup');
          onApply && onApply(localLook, localCap);
          syncPreview();
          render();
          return;
        }
        const res = stateMod.setLook(who, { [part]: i });
        if (res.ok) { sfx('pickup'); syncPreview(); render(); }
        else if (res.reason === 'level') self.toast(`Wardrobe unlocks at level ${LOOK_UNLOCK}.`, { icon: '👕' });
      }));
      body.querySelectorAll('[data-cap]').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.cap;
        if (creator) {
          localCap = id;
          sfx('pickup');
          onApply && onApply(localLook, localCap);
          syncPreview();
          render();
          return;
        }
        const res = stateMod.setCapColor(id);
        if (res.ok) { sfx('pickup'); syncPreview(); render(); }
        else if (res.reason === 'level') {
          const c = CAP_COLORS.find(x => x.id === id);
          self.toast(`${c.name} cap unlocks at level ${c.minLevel}.`, { icon: '🧢' });
        }
      }));
    };
    render();
  }

  /* ---------------- fleet garage (level 4+) ---------------- */

  openGarage() {
    const self = this;
    const m = this.modal({
      title: '🚛 Fleet garage',
      sub: `Level ${GARAGE_UNLOCK}+ unlocked — pick the EcoCycle truck that rolls up for your smart-bag pickups.`,
      body: '<div id="garage-grid" class="garage-grid"></div>',
      wide: true,
      onClose: () => {}
    });
    const grid = m.el.querySelector('#garage-grid');

    const render = () => {
      const st = stateMod.getState();
      grid.innerHTML = TRUCKS.map(t => {
        const locked = st.level < t.minLevel;
        const active = st.truck === t.id;
        return `
          <div class="truck-card ${active ? 'active' : ''} ${locked ? 'locked' : ''}" data-id="${t.id}">
            <canvas width="240" height="110" data-canvas="${t.id}"></canvas>
            <div class="truck-name">${t.name}</div>
            <div class="truck-desc">${locked ? `🔒 Unlocks at level ${t.minLevel}` : t.desc}</div>
            ${active
              ? '<span class="truck-active-tag">✓ In service</span>'
              : `<button class="btn btn-sm ${locked ? 'btn-secondary' : 'btn-primary'}">${locked ? '🔒 Level ' + t.minLevel : 'Put in service'}</button>`}
          </div>`;
      }).join('');
      grid.querySelectorAll('[data-canvas]').forEach(cv => drawTruckPreview(cv, truckDef(cv.dataset.canvas)));
      grid.querySelectorAll('.truck-card').forEach(card => card.addEventListener('click', () => {
        const res = stateMod.setTruck(card.dataset.id);
        if (res.ok) { sfx('horn'); self.toast('Fleet updated — new truck on the next pickup!', { icon: '🚛', type: 'green' }); render(); }
        else if (res.reason === 'level') { sfx('wrong'); self.toast(`Unlocks at level ${truckDef(card.dataset.id).minLevel}. Keep sorting!`, { icon: '🔒' }); }
      }));
    };
    render();
  }

  /* ---------------- pause / settings ---------------- */

  openPause({ onResume, onMenu, onHowTo }) {
    const muted = isMuted();
    const m = this.modal({
      title: '☰ Paused',
      body: `
        <div class="slot-list">
          <button class="slot" data-act="resume">Resume playing</button>
          <button class="slot" data-act="howto">How to play</button>
          <button class="slot" data-act="mute">Sound: ${muted ? 'off' : 'on'}</button>
          <button class="slot" data-act="reset">Reset progress…</button>
          <button class="slot" data-act="menu">Back to main menu</button>
        </div>`,
      onClose: () => onResume && onResume(),
    });
    m.el.querySelectorAll('.slot').forEach(s => {
      s.addEventListener('click', () => {
        const act = s.dataset.act;
        if (act === 'resume') { m.close(); }
        if (act === 'howto') {
          m.close();
          this.showScreen('howto');
          const back = () => { $('btn-howto-close').removeEventListener('click', back); this.hideScreens(); this.enterGame(); onResume && onResume(); };
          $('btn-howto-close').addEventListener('click', back);
          onHowTo && onHowTo();
        }
        if (act === 'mute') {
          setMuted(!isMuted());
          syncMuteBtn();
          const st = stateMod.getState();
          st.settings.muted = isMuted();
          s.textContent = `Sound: ${isMuted() ? 'off' : 'on'}`;
        }
        if (act === 'reset') {
          this.confirm({
            title: 'Reset progress?',
            body: 'This permanently deletes your EcoHero, coins, badges and pickup history on this device.',
            confirmLabel: 'Reset everything',
            onConfirm: () => stateMod.resetProgress(),
          });
        }
        if (act === 'menu') { m.close(); onMenu && onMenu(); }
      });
    });
  }

  /* ---------------- minimap ---------------- */

  drawMinimap({ player, facing, litter, truck, world }) {
    const c = $('minimap');
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const range = 46; // metres shown across
    const s = w / range;
    const cx = player.x, cz = player.z;
    const toMap = (x, z) => ({ x: (x - cx) * s + w / 2, y: (z - cz) * s + h / 2 });

    ctx.fillStyle = '#1d2b21';
    ctx.fillRect(0, 0, w, h);

    // road band
    const r0 = toMap(0, LAYOUT.street.z0), r1 = toMap(0, LAYOUT.street.z1);
    ctx.fillStyle = '#3c3f45';
    ctx.fillRect(0, r0.y, w, r1.y - r0.y);
    // gutter
    const g0 = toMap(0, LAYOUT.gutter.z0), g1 = toMap(0, LAYOUT.gutter.z1);
    ctx.fillStyle = '#4e6b4a';
    ctx.fillRect(0, g0.y, w, g1.y - g0.y);

    // buildings
    world.mapRects.forEach(rect => {
      const p = toMap(rect.x, rect.z);
      ctx.fillStyle = rect.color;
      ctx.fillRect(p.x, p.y, rect.w * s, rect.h * s);
    });
    // hub + home markers
    const hub = toMap(LAYOUT.hub.x0 + 7, LAYOUT.hub.frontZ + 0.6);
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(hub.x - 4, hub.y - 4, 8, 8);
    const home = toMap(LAYOUT.home.porch.x, LAYOUT.home.porch.z);
    ctx.fillStyle = '#ffc107';
    ctx.fillRect(home.x - 3, home.y - 3, 6, 6);

    // litter dots
    ctx.fillStyle = '#e6b800';
    litter.forEach(l => {
      const p = toMap(l.mesh.position.x, l.mesh.position.z);
      if (p.x > 2 && p.x < w - 2 && p.y > 2 && p.y < h - 2) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2); ctx.fill();
      }
    });

    if (truck) {
      const p = toMap(truck.x, truck.z);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(p.x - 4, p.y - 2.5, 8, 5);
    }

    // player arrow
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-facing + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.4, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------------- statics ---------------- */

  bindStatics() {
    $('btn-mute').addEventListener('click', () => {
      setMuted(!isMuted());
      syncMuteBtn();
    });
    $('btn-missions').addEventListener('click', () => { sfx('click'); this.toggleMissions(); });
  }
}

/* ---------------- helpers ---------------- */

function syncMuteBtn() {
  $('mute-icon').textContent = isMuted() ? '🔇' : '🔊';
  $('mute-label').textContent = isMuted() ? 'Muted' : 'Sound';
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function catLabel(cat) {
  return { plastic: 'Plastic', paper: 'Paper / carton', metal: 'Metal', glass: 'Glass', ewaste: 'E-waste', textile: 'Textile' }[cat] || cat;
}

function drawFakeQR(canvas, seedStr) {
  const ctx = canvas.getContext('2d');
  const n = 21;
  const cell = canvas.width / n;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#263238';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
      if (inFinder) continue;
      if (rnd() > 0.55) ctx.fillRect(x * cell, y * cell, cell * 0.92, cell * 0.92);
    }
  }
  const finder = (fx, fy) => {
    ctx.fillStyle = '#263238';
    ctx.fillRect(fx, fy, cell * 7, cell * 7);
    ctx.fillStyle = '#fff';
    ctx.fillRect(fx + cell, fy + cell, cell * 5, cell * 5);
    ctx.fillStyle = '#263238';
    ctx.fillRect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3);
  };
  finder(0, 0);
  finder(canvas.width - cell * 7, 0);
  finder(0, canvas.height - cell * 7);
}

function rr(ctx, x0, y0, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
  ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
  ctx.arcTo(x0, y0 + h, x0, y0, r);
  ctx.arcTo(x0, y0, x0 + w, y0, r);
  ctx.closePath();
}
function dot(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawTruckPreview(canvas, def) {
  const x = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  rr(x, 0, 0, W, H, 12); x.fill();
  const gy = 100;

  const wheel = (cx, r) => {
    x.fillStyle = '#1d2226'; dot(x, cx, gy - r, r);
    x.fillStyle = '#9aa3a8'; dot(x, cx, gy - r, r * 0.45);
    x.fillStyle = '#4b545a'; dot(x, cx, gy - r, r * 0.18);
  };
  wheel(62, 13); wheel(168, 13); wheel(202, 13);

  // cargo box + livery
  x.fillStyle = def.body;
  rr(x, 84, 26, 146, 50, 6); x.fill();
  x.fillStyle = def.accent;
  x.fillRect(84, 56, 146, 11);
  rr(x, 96, 19, 122, 7, 3); x.fill();
  x.strokeStyle = def.accent; x.lineWidth = 3;
  x.beginPath(); x.arc(126, 42, 8, 0, Math.PI * 2); x.stroke();
  dot(x, 126, 42, 2.2);

  // cab
  x.fillStyle = def.cab;
  rr(x, 30, 32, 58, 44, 7); x.fill();
  x.fillStyle = '#26333b';
  rr(x, 35, 38, 20, 22, 4); x.fill();
  rr(x, 58, 38, 24, 13, 3); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(56, 36); x.lineTo(56, 74); x.stroke();
  x.fillStyle = def.accent; rr(x, 26, 66, 10, 10, 3); x.fill();
  x.fillStyle = '#ffe082'; rr(x, 31, 56, 6, 8, 2); x.fill();

  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.beginPath(); x.ellipse(120, 101, 100, 5, 0, 0, Math.PI * 2); x.fill();
}
