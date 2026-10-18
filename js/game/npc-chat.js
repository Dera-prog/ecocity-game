// Live NPC conversation panel. Talks to the site's same-origin Qoder Function,
// which keeps the Cloud Agents credential server-side; this module only sends
// text and renders streamed application events.

import { sfx } from './audio.js';

const ENDPOINT = '/functions/v1/app?action=chat';
const STREAM_TIMEOUT = 65000;

const PERSONA_UI = {
  'mama-ngozi': {
    initials: 'MN',
    role: 'Market vendor · Stall 4',
    tagline: 'Fresh greens, clean gutters, no nylon.',
    empty: 'Mama Ngozi wipes her hands on her wrapper and looks up from the produce.',
    prompts: ['How is market today?', 'Why should I clean the gutters?', 'Give me some Lagos wisdom']
  },
  'dj-ada': {
    initials: 'DA',
    role: 'DJ · Festival hub',
    tagline: 'Afrobeats, good vibes, cleaner streets.',
    empty: 'DJ Ada lifts one headphone off her ear, still swaying to the beat.',
    prompts: ['What are you playing?', 'How do I stay motivated?', 'Tell me about the estate']
  },
  'auntie-bisi': {
    initials: 'AB',
    role: 'Neighbour · Bus stop',
    tagline: 'Eyes on the street, ear on the danfo.',
    empty: 'Auntie Bisi fans herself with a paper and gives you a knowing nod.',
    prompts: ['How is the neighbourhood?', 'Any gist for me?', 'What should I do next?']
  },
  'chidi': {
    initials: 'CH',
    role: 'EcoCycle crew · Bus stop',
    tagline: 'Collects bottles, knows every corner.',
    empty: 'Chidi taps his recycling gloves together and waits for you to speak.',
    prompts: ['How did you join the crew?', 'Where is the best litter?', 'Any tips for sorting?']
  }
};

const STATUS_TEXT = {
  connecting: 'Connecting…',
  initializing: 'Waking up…',
  thinking: 'Thinking…',
  replying: 'Replying…'
};

/** parse a text/event-stream body into { event, data } frames */
async function* readEvents(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal && signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (!frame.trim() || frame.startsWith(':')) continue;
        let event = 'message';
        let data = '';
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5);
        }
        if (data.trim()) yield { event, data: data.trim() };
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* stream already closed */ }
  }
}

const safeMessage = text => typeof text === 'string' && text.length <= 240 ? text : '';

export class NpcChat {
  constructor(opts = {}) {
    this.root = document.getElementById('chat-root');
    this.nameEl = document.getElementById('chat-name');
    this.roleEl = document.getElementById('chat-role');
    this.tagEl = document.getElementById('chat-tag');
    this.faceEl = document.getElementById('chat-face');
    this.logEl = document.getElementById('chat-log');
    this.bodyEl = document.getElementById('chat-body');
    this.formEl = document.getElementById('chat-form');
    this.inputEl = document.getElementById('chat-input');
    this.sendEl = document.getElementById('chat-send');
    this.suggestEl = document.getElementById('chat-suggest');
    this.liveEl = document.getElementById('chat-live');
    this.noteEl = document.getElementById('chat-note');
    this.closeEl = document.getElementById('chat-close');
    this.scrimEl = document.getElementById('chat-scrim');
    if (!this.root) throw new Error('chat markup is missing');

    this.onOpenChange = opts.onOpenChange || null;
    this.getContext = opts.getContext || (() => ({}));
    this.onReply = opts.onReply || null;

    this.sessions = new Map();
    this.npc = null;
    this.personaId = '';
    this.busy = false;
    this.abort = null;
    this._lastFocus = null;
    this._closing = false;

    this.formEl.addEventListener('submit', e => {
      e.preventDefault();
      this.send();
    });
    this.closeEl.addEventListener('click', () => this.close());
    this.scrimEl.addEventListener('click', () => this.close());
    this.suggestEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-prompt]');
      if (!btn || this.busy) return;
      this.inputEl.value = btn.dataset.prompt;
      this.send();
    });
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation();
      if (e.key !== 'Escape') e.stopPropagation();
    });
    this.root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  isOpen() { return this.root.classList.contains('open'); }

  _session(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { convId: '', messages: [], turns: 0 });
    return this.sessions.get(id);
  }

  open(npc) {
    if (!npc || !npc.personaId) return;
    if (this.isOpen()) this.close();
    this.npc = npc;
    this.personaId = npc.personaId;
    this._closing = false;
    this._lastFocus = document.activeElement;

    const ui = PERSONA_UI[this.personaId] || {};
    const displayName = npc.name || 'Neighbour';
    this.nameEl.textContent = displayName;
    this.roleEl.textContent = ui.role || npc.role || 'Neighbour';
    this.tagEl.textContent = ui.tagline || npc.tagline || 'Oshodi Green Estate';
    this.faceEl.textContent = ui.initials || displayName.slice(0, 2).toUpperCase();
    this.inputEl.placeholder = `Say something to ${displayName}…`;
    this.inputEl.setAttribute('aria-label', `Message ${displayName}`);
    this.noteEl.textContent = 'Live AI character · replies stream in · this conversation lasts for your visit';

    this._renderTranscript();
    this._renderSuggestions(ui.prompts || []);
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.liveEl.classList.remove('off');
    this._setBusy(false);
    document.body.classList.add('chat-open');
    if (this.onOpenChange) this.onOpenChange(true, npc);
    setTimeout(() => { if (this.isOpen()) this.inputEl.focus(); }, 80);
  }

  close() {
    if (!this.isOpen()) return;
    this._closing = true;
    this._abortStream();
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('chat-open');
    const npc = this.npc;
    this.npc = null;
    this.personaId = '';
    if (this._lastFocus && typeof this._lastFocus.focus === 'function') {
      try { this._lastFocus.focus({ preventScroll: true }); } catch { /* element gone */ }
    }
    if (this.onOpenChange) this.onOpenChange(false, npc);
  }

  _renderSuggestions(prompts) {
    this.suggestEl.innerHTML = '';
    const session = this.sessions.get(this.personaId);
    const hasTalked = session && session.messages.length > 0;
    if (hasTalked || !prompts.length) { this.suggestEl.classList.add('hidden'); return; }
    this.suggestEl.classList.remove('hidden');
    for (const prompt of prompts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-chip';
      btn.dataset.prompt = prompt;
      btn.textContent = prompt;
      this.suggestEl.appendChild(btn);
    }
  }

  _renderTranscript() {
    this.logEl.innerHTML = '';
    const session = this._session(this.personaId);
    const ui = PERSONA_UI[this.personaId] || {};
    if (!session.messages.length) {
      const empty = document.createElement('p');
      empty.className = 'chat-empty';
      empty.textContent = ui.empty || 'They turn to face you, waiting.';
      this.logEl.appendChild(empty);
      return;
    }
    for (const msg of session.messages) this._bubble(msg.who, msg.text, { animate: false });
  }

  _bubble(who, text, opts = {}) {
    const empty = this.logEl.querySelector('.chat-empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = `chat-msg ${who}`;
    if (!opts.animate) row.classList.add('instant');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (who === 'note') bubble.classList.add('chat-note-bubble');
    if (opts.error) bubble.classList.add('error');
    bubble.textContent = text;
    row.appendChild(bubble);
    this.logEl.appendChild(row);
    this._scroll();
    return { row, bubble };
  }

  _typingBubble() {
    const { row, bubble } = this._bubble('npc', '', { animate: true });
    bubble.classList.add('typing');
    const dots = document.createElement('span');
    dots.className = 'chat-dots';
    dots.innerHTML = '<i></i><i></i><i></i>';
    const label = document.createElement('span');
    label.className = 'chat-status';
    label.textContent = STATUS_TEXT.connecting;
    bubble.append(dots, label);
    return { row, bubble, label };
  }

  _scroll(force = false) {
    const el = this.bodyEl;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (force || nearBottom) el.scrollTop = el.scrollHeight;
  }

  _setBusy(on) {
    this.busy = on;
    this.sendEl.disabled = on;
    this.root.classList.toggle('is-busy', on);
    this.liveEl.classList.toggle('pulse', on);
    this.sendEl.textContent = on ? '…' : 'Send';
  }

  _abortStream() {
    if (this.abort) {
      try { this.abort.abort(); } catch { /* already aborted */ }
      this.abort = null;
    }
    this._setBusy(false);
  }

  _push(who, text) {
    this._session(this.personaId).messages.push({ who, text });
  }

  async send() {
    if (!this.isOpen() || !this.npc || this.busy) return;
    const text = this.inputEl.value.replace(/\s+/g, ' ').trim();
    if (!text) return;
    this.inputEl.value = '';
    this.suggestEl.classList.add('hidden');
    await this._send(text, true);
  }

  async _send(text, addUser) {
    if (this.busy) return;
    const npcId = this.personaId;
    const session = this._session(npcId);
    const panelNpc = this.npc;
    this._setBusy(true);
    this.logEl.querySelector('.chat-empty')?.remove();

    if (addUser) {
      this._push('player', text);
      this._bubble('player', text);
      this._renderSuggestions([]);
    }
    const typing = this._typingBubble();
    sfx('click');

    const abort = new AbortController();
    this.abort = abort;
    let streamTimer = setTimeout(() => abort.abort('timeout'), STREAM_TIMEOUT);
    let reply = '';
    let gotDone = false;
    let failure = '';

    const fail = message => {
      failure = message || 'Live talk hit a snag. Try again.';
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npcId,
          text,
          conversationId: session.convId || undefined,
          context: this.getContext(npcId)
        }),
        signal: abort.signal,
        credentials: 'same-origin',
        cache: 'no-store'
      });

      if (!res.ok) {
        let message = '';
        try {
          const body = await res.json();
          message = safeMessage(body && body.message);
        } catch { /* non-JSON error body */ }
        fail(message || (res.status === 403 ? 'Live talk is not available for this visitor.' : 'Live talk is unavailable right now. Try again in a moment.'));
        throw new Error('request_failed');
      }
      if (!res.body) { fail('This browser could not open the reply stream.'); throw new Error('no_body'); }

      clearTimeout(streamTimer);
      streamTimer = setTimeout(() => abort.abort('timeout'), STREAM_TIMEOUT);

      for await (const frame of readEvents(res.body, abort.signal)) {
        let payload;
        try { payload = JSON.parse(frame.data); } catch { continue; }
        if (!payload || typeof payload !== 'object') continue;

        if (frame.event === 'status') {
          typing.label.textContent = STATUS_TEXT[payload.state] || 'Replying…';
        } else if (frame.event === 'ready') {
          this.liveEl.classList.remove('off');
          if (typeof payload.conversation === 'string' && /^conv_[0-9a-f-]{36}$/.test(payload.conversation)) {
            if (payload.reset && session.convId && session.convId !== payload.conversation) {
              this._bubble('note', 'A fresh conversation started on the street.');
            }
            session.convId = payload.conversation;
          }
          if (Number.isInteger(payload.turns)) session.turns = payload.turns;
          typing.label.textContent = 'Thinking…';
        } else if (frame.event === 'delta') {
          const piece = payload.text;
          if (typeof piece !== 'string' || !piece) continue;
          if (typing.bubble.classList.contains('typing')) {
            typing.bubble.classList.remove('typing');
            typing.bubble.textContent = '';
          }
          reply += piece;
          typing.bubble.textContent = reply;
          this._scroll();
        } else if (frame.event === 'done') {
          gotDone = true;
          const finalText = typeof payload.text === 'string' && payload.text.trim() ? payload.text.trim() : reply.trim();
          if (!finalText) { fail('The character had nothing to say. Try again.'); break; }
          reply = finalText;
          typing.bubble.classList.remove('typing');
          typing.bubble.textContent = reply;
          this._push('npc', reply);
          if (Number.isInteger(payload.turns)) session.turns = payload.turns;
          const mood = typeof payload.mood === 'string' ? payload.mood : 'calm';
          const emote = typeof payload.emote === 'string' ? payload.emote : '';
          if (this.npc && this.npc.personaId === npcId) {
            this.npc.mood = mood;
            this.npc.char?.setExpression(mood);
            if (emote) setTimeout(() => { if (this.npc && this.npc.personaId === npcId) this.npc.char?.emote(emote); }, 220);
          }
          if (this.onReply) this.onReply(npcId, mood, emote);
          sfx('pop');
          this._scroll();
          break;
        } else if (frame.event === 'error') {
          fail(safeMessage(payload.message));
          break;
        }
      }

      if (!gotDone && !failure) {
        if (reply.trim()) {
          typing.bubble.classList.remove('typing');
          typing.bubble.textContent = reply;
          this._push('npc', reply);
        } else if (!abort.signal.aborted) {
          fail('The connection ended before the reply arrived. Try again.');
        }
      }
    } catch (error) {
      if (this._closing || !this.isOpen() || this.personaId !== npcId) {
        // user left the conversation; drop the half-finished bubble
        if (!gotDone) typing.row.remove();
        clearTimeout(streamTimer);
        this.abort = null;
        return;
      }
      if (abort.signal.aborted && !failure) {
        fail(abort.signal.reason === 'timeout' ? 'That reply took too long. Try again.' : 'The reply was stopped.');
      }
      if (!failure) fail('Live talk is unavailable right now. Try again in a moment.');
    } finally {
      clearTimeout(streamTimer);
      if (this.abort === abort) this.abort = null;
      if (this.isOpen() && this.personaId === npcId) {
        if (failure) {
          typing.bubble.classList.remove('typing');
          typing.bubble.classList.add('error');
          typing.bubble.textContent = failure;
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'chat-retry';
          retry.textContent = 'Try again';
          retry.addEventListener('click', () => {
            typing.row.remove();
            this._send(text, false);
          });
          typing.bubble.appendChild(retry);
          this.liveEl.classList.add('off');
          this._scroll();
        }
        this._setBusy(false);
        this.inputEl.focus();
      } else {
        this._setBusy(false);
      }
    }
  }
}
