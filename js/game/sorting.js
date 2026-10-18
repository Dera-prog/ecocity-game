// Waste-sorting mini-game: drag (or tap) each item into the right bin.

import { ITEMS, recordSort, accuracy, CATS } from './state.js';
import { ITEM_ICONS, BIN_META } from './icons.js';
import { sfx } from './audio.js';

let activeGame = null;

export function isSortingOpen() { return !!activeGame; }

export function openSorting({ items, onFinish, onQuit }) {
  const modalRoot = document.getElementById('modal-root');

  const queue = shuffle(items.slice());
  const total = queue.length;
  let sorted = 0;
  let correct = 0;
  let wrong = 0;
  let streak = 0;
  let current = null;
  let resolving = false;
  let lastDropAt = 0;

  const modal = document.createElement('div');
  modal.className = 'modal wide';
  modal.innerHTML = `
    <div class="modal-head">
      <div>
        <h2 class="modal-title">♻️ Sort your bag</h2>
        <p class="modal-sub">Drag each item into the right bin — or tap a bin. Not sure? The bin label has the clue.</p>
      </div>
      <button class="modal-close" data-quit title="Leave (items stay in your bag)">✕</button>
    </div>
    <div class="sort-head">
      <span class="sort-stat">Item <b id="sort-count">1</b> / <b>${total}</b></span>
      <span class="sort-stat">Accuracy <b id="sort-acc">100%</b></span>
      <span class="sort-stat">Streak <b id="sort-streak">0</b></span>
    </div>
    <div class="sort-body">
      <div class="sort-stage">
        <div class="sort-item-card" id="sort-item">
          <div class="item-svg" id="sort-item-svg"></div>
          <div class="item-name" id="sort-item-name"></div>
          <div class="item-hint">Drag me to a bin</div>
        </div>
        <div class="sort-feedback" id="sort-feedback"></div>
        <div class="sort-bins" id="sort-bins"></div>
      </div>
    </div>`;

  const binsEl = modal.querySelector('#sort-bins');
  CATS.forEach((cat, i) => {
    const meta = BIN_META[cat];
    const bin = document.createElement('div');
    bin.className = 'bin';
    bin.dataset.cat = cat;
    bin.innerHTML = `
      <span class="bin-flag" style="background:${meta.flag}"></span>
      <div class="bin-svg">${meta.icon}</div>
      <div class="bin-name">${i + 1}. ${meta.name}</div>`;
    bin.addEventListener('click', () => { if (Date.now() - lastDropAt > 280) resolve(cat); });
    binsEl.appendChild(bin);
  });

  modalRoot.appendChild(modal);
  modalRoot.classList.add('open');

  const itemCard = modal.querySelector('#sort-item');
  const feedbackEl = modal.querySelector('#sort-feedback');
  const countEl = modal.querySelector('#sort-count');
  const accEl = modal.querySelector('#sort-acc');
  const streakEl = modal.querySelector('#sort-streak');

  activeGame = { modal };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextItem() {
    resolving = false;
    if (queue.length === 0) { showSummary(); return; }
    current = queue[0];
    const def = ITEMS[current];
    modal.querySelector('#sort-item-svg').innerHTML = ITEM_ICONS[current] || '';
    modal.querySelector('#sort-item-name').textContent = def.name;
    countEl.textContent = Math.min(sorted + 1, total);
    itemCard.classList.remove('correct', 'wrong');
  }

  function resolve(binCat) {
    if (resolving || !current) return;
    const def = ITEMS[current];
    const ok = def.cat === binCat;
    resolving = true;

    const binEl = binsEl.querySelector(`[data-cat="${binCat}"]`);
    const binMeta = BIN_META[binCat];

    if (ok) {
      correct += 1; streak += 1; sorted += 1;
      queue.shift();
      sfx('correct');
      itemCard.classList.add('correct');
      if (binEl) { binEl.classList.add('flash-good'); setTimeout(() => binEl.classList.remove('flash-good'), 350); }
      feedbackEl.className = 'sort-feedback show good';
      feedbackEl.innerHTML = `<b>Correct — ${def.name} → ${binMeta.name}.</b> ${def.note}`;
    } else {
      wrong += 1; streak = 0;
      queue.shift(); queue.push(current);
      sfx('wrong');
      itemCard.classList.add('wrong');
      if (binEl) { binEl.classList.add('flash-bad'); setTimeout(() => binEl.classList.remove('flash-bad'), 450); }
      feedbackEl.className = 'sort-feedback show bad';
      feedbackEl.innerHTML = `<b>Not quite.</b> ${def.name} belongs in <b>${BIN_META[def.cat].name}</b>. ${def.note} <i>It goes back in the bag — try it again.</i>`;
    }

    recordSort(current, ok, streak);
    accEl.textContent = accuracyUser() + '%';
    streakEl.textContent = streak;

    const delay = ok ? 1000 : 2100;
    setTimeout(() => {
      feedbackEl.className = 'sort-feedback';
      nextItem();
    }, delay);
  }

  function accuracyUser() {
    const t = correct + wrong;
    return t === 0 ? 100 : Math.round((correct / t) * 100);
  }

  function showSummary() {
    sfx('success');
    const acc = accuracyUser();
    const kg = items.reduce((s, id) => s + ITEMS[id].kg, 0);
    modal.querySelector('.sort-stage').innerHTML = `
      <div style="text-align:center;padding:1rem 0 .4rem">
        <div style="font-size:3rem">🎉</div>
        <h3 style="font-family:var(--font-display);margin:.4rem 0">Bag sorted!</h3>
        <p style="color:#5c6b62;font-size:.9rem">Your recyclables are packed into a smart bag and staged at your EcoHome porch.</p>
      </div>
      <div class="reward-pills">
        <span class="pill">${items.length} items</span>
        <span class="pill">${kg.toFixed(2)} kg</span>
        <span class="pill">${acc}% accuracy</span>
        <span class="pill gold">+10 🪙 bonus</span>
      </div>
      <button class="btn btn-primary" id="sort-done" style="margin-top:1.1rem">Back to the street</button>`;
    modal.querySelector('#sort-done').addEventListener('click', () => {
      close();
      onFinish && onFinish({ items, correct, wrong, accuracy: acc });
    });
  }

  function close() {
    activeGame = null;
    modalRoot.classList.remove('open');
    modal.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!activeGame) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) resolve(CATS[n - 1]);
  }
  document.addEventListener('keydown', onKey);

  modal.querySelector('[data-quit]').addEventListener('click', () => {
    close();
    onQuit && onQuit();
  });

  /* ------- drag & drop ------- */
  let drag = null;
  itemCard.addEventListener('pointerdown', e => {
    if (resolving) return;
    e.preventDefault();
    const ghost = itemCard.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('correct', 'wrong');
    document.body.appendChild(ghost);
    drag = { ghost, pointerId: e.pointerId };
    moveGhost(e.clientX, e.clientY);
    itemCard.style.opacity = '0.35';
  });

  function moveGhost(x, y) {
    if (!drag) return;
    drag.ghost.style.left = x + 'px';
    drag.ghost.style.top = y + 'px';
    const el = document.elementFromPoint(x, y);
    const bin = el && el.closest ? el.closest('.bin') : null;
    binsEl.querySelectorAll('.bin').forEach(b => b.classList.toggle('hover', b === bin));
  }

  window.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.pointerId) moveGhost(e.clientX, e.clientY); });
  window.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const bin = el && el.closest ? el.closest('.bin') : null;
    drag.ghost.remove();
    itemCard.style.opacity = '';
    binsEl.querySelectorAll('.bin').forEach(b => b.classList.remove('hover'));
    drag = null;
    lastDropAt = Date.now();
    if (bin) resolve(bin.dataset.cat);
  });
  window.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag.ghost.remove();
    itemCard.style.opacity = '';
    drag = null;
  });

  nextItem();
}
