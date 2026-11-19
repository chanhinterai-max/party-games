import { CARDS, LEVELS } from './cards.js';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;
const STORE_PLAYERS = 'partygames.tod.players';
const STORE_LEVEL = 'partygames.tod.level';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}

export function mount(root, { goHome }) {
  const saved = load(STORE_PLAYERS, []);
  const state = {
    names: Array.isArray(saved) && saved.length >= MIN_PLAYERS ? saved.slice(0, MAX_PLAYERS) : ['', ''],
    level: LEVELS.some((l) => l.id === load(STORE_LEVEL, '')) ? load(STORE_LEVEL, 'mild') : 'mild',
    players: [],
    queue: [],        // fair rotation: everyone goes once per round, in random order
    current: null,
    last: null,
    decks: {},        // `${level}:${kind}` -> remaining cards (no repeats until exhausted)
    sips: {},
    card: null,       // { kind, text }
    error: '',
  };

  // ---------- Turn order ----------
  function nextPlayer() {
    if (state.queue.length === 0) {
      let order = shuffle(state.players);
      // avoid the same player twice in a row across round boundaries
      if (order.length > 1 && order[0] === state.current) {
        const swap = 1 + Math.floor(Math.random() * (order.length - 1));
        [order[0], order[swap]] = [order[swap], order[0]];
      }
      state.queue = order;
    }
    state.last = state.current;
    state.current = state.queue.shift();
    state.card = null;
  }

  // ---------- Cards ----------
  function drawCard(kind) {
    const key = `${state.level}:${kind}`;
    if (!state.decks[key] || state.decks[key].length === 0) {
      state.decks[key] = shuffle(CARDS[state.level][kind === 'truth' ? 'truths' : 'dares']);
    }
    const raw = state.decks[key].pop();
    const others = state.players.filter((p) => p !== state.current);
    const other = others[Math.floor(Math.random() * others.length)] || 'someone';
    const html = esc(raw).replace(/\{other\}/g, `<b>${esc(other)}</b>`);
    const left = state.decks[key].length;
    state.card = { kind, html, left };
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  // ---------- Views ----------
  function levelButtons(cls = '') {
    return LEVELS.map(
      (l) => `<button class="level ${l.id}" data-level="${l.id}" aria-pressed="${state.level === l.id}">
        <span class="e">${l.emoji}</span><span class="t">${l.name}</span></button>`
    ).join('');
  }

  function renderSetup() {
    const lvl = LEVELS.find((l) => l.id === state.level);
    root.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="home" aria-label="Back to games">← Games</button>
        <h2>🍸 Truth or Dare</h2>
        <span style="width:44px"></span>
      </div>

      <div class="section">
        <div class="row" style="align-items:center">
          <div class="label" style="margin:0">Who's playing?</div>
          <div class="count" style="text-align:right">${state.names.length} / ${MAX_PLAYERS}</div>
        </div>
        <div class="players" style="margin-top:10px">
          ${state.names
            .map(
              (n, i) => `<div class="player-row">
                <input type="text" inputmode="text" autocomplete="off" autocapitalize="words" maxlength="20"
                  placeholder="Player ${i + 1}" value="${esc(n)}" data-idx="${i}" aria-label="Player ${i + 1} name" />
                <button class="remove" data-remove="${i}" aria-label="Remove player ${i + 1}" ${state.names.length <= MIN_PLAYERS ? 'disabled style="opacity:.35"' : ''}>✕</button>
              </div>`
            )
            .join('')}
        </div>
        <div class="section">
          <button class="btn btn-ghost" data-act="add" ${state.names.length >= MAX_PLAYERS ? 'disabled' : ''}>＋ Add player</button>
        </div>
      </div>

      <div class="section">
        <div class="label">Spice level</div>
        <div class="levels">${levelButtons()}</div>
        <p class="level-hint">${lvl.hint}</p>
      </div>

      <div class="error" role="alert">${esc(state.error)}</div>
      <div class="section">
        <button class="btn btn-primary" data-act="start">Let's play 🔥</button>
      </div>
      <aside class="note">Skip any card by taking a sip — <strong>water counts</strong>. Ask before any touch; a “no” ends the dare, no penalty.</aside>
    `;

    root.querySelectorAll('input[data-idx]').forEach((inp) => {
      inp.addEventListener('input', () => {
        state.names[+inp.dataset.idx] = inp.value;
        inp.classList.remove('invalid');
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = root.querySelector(`input[data-idx="${+inp.dataset.idx + 1}"]`);
          if (next) next.focus();
          else if (state.names.length < MAX_PLAYERS) addPlayer();
        }
      });
    });
    root.querySelectorAll('[data-remove]').forEach((b) =>
      b.addEventListener('click', () => {
        if (state.names.length <= MIN_PLAYERS) return;
        state.names.splice(+b.dataset.remove, 1);
        state.error = '';
        renderSetup();
      })
    );
    root.querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => {
        state.level = b.dataset.level;
        save(STORE_LEVEL, state.level);
        renderSetup();
      })
    );
    root.querySelector('[data-act="add"]').addEventListener('click', addPlayer);
    root.querySelector('[data-act="home"]').addEventListener('click', goHome);
    root.querySelector('[data-act="start"]').addEventListener('click', start);
  }

  function addPlayer() {
    if (state.names.length >= MAX_PLAYERS) return;
    state.names.push('');
    state.error = '';
    renderSetup();
    const inputs = root.querySelectorAll('input[data-idx]');
    inputs[inputs.length - 1]?.focus();
  }

  function validate() {
    const trimmed = state.names.map((n) => n.trim().replace(/\s+/g, ' '));
    const filled = trimmed.filter(Boolean);
    if (filled.length < MIN_PLAYERS) return { error: `Add at least ${MIN_PLAYERS} player names.` };
    if (filled.length > MAX_PLAYERS) return { error: `Maximum ${MAX_PLAYERS} players.` };
    const seen = new Set();
    for (const n of filled) {
      const k = n.toLowerCase();
      if (seen.has(k)) return { error: `"${n}" is entered twice. Make each name unique.`, dup: k };
      seen.add(k);
    }
    return { players: filled };
  }

  function start() {
    const res = validate();
    if (res.error) {
      state.error = res.error;
      renderSetup();
      root.querySelectorAll('input[data-idx]').forEach((inp) => {
        const v = inp.value.trim().toLowerCase();
        if ((!v && state.names.filter((n) => n.trim()).length < MIN_PLAYERS) || (res.dup && v === res.dup)) inp.classList.add('invalid');
      });
      return;
    }
    state.error = '';
    state.names = res.players.slice();
    state.players = res.players;
    save(STORE_PLAYERS, state.players);
    state.queue = [];
    state.current = null;
    state.sips = Object.fromEntries(state.players.map((p) => [p, 0]));
    nextPlayer();
    renderPlay();
  }

  function renderPlay() {
    const lvl = LEVELS.find((l) => l.id === state.level);
    const card = state.card;
    root.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="home" aria-label="Back to games">← Games</button>
        <span class="badge ${lvl.id}">${lvl.emoji} ${lvl.name}</span>
        <button class="icon-btn" data-act="setup" aria-label="Edit players">👥 Edit</button>
      </div>

      <div class="turn">
        <div class="pass">${card ? 'Your card' : 'Pass the phone to'}</div>
        <div class="who">${esc(state.current)}${card ? '' : '’s turn'}</div>
        ${card ? '' : '<div class="pass">Truth or Dare? 👀</div>'}
      </div>

      ${
        card
          ? `<div class="prompt-card ${card.kind}">
              <div class="kind">${card.kind === 'truth' ? '🤫 Truth' : '🔥 Dare'}</div>
              <div class="text">${card.html}</div>
              <div class="left">${card.left} ${card.kind} cards left in this deck</div>
            </div>
            <div class="stack">
              <button class="btn btn-primary" data-act="next">Done ✓ · Next player</button>
              <button class="btn btn-sip" data-act="skip">Skip = take a sip 🍻</button>
            </div>`
          : `<div class="choice">
              <button class="btn btn-truth" data-act="truth">🤫<span>Truth</span><small>spill a secret</small></button>
              <button class="btn btn-dare" data-act="dare">🔥<span>Dare</span><small>do the thing</small></button>
            </div>
            <div class="section"><button class="btn btn-ghost" data-act="pass">Pass turn (sip) 🍻</button></div>`
      }

      <div class="label" style="text-align:center;margin-top:22px">Change level</div>
      <div class="level-switch">${levelButtons()}</div>

      <div class="scores" aria-label="Sips taken">
        ${state.players.map((p) => `<span>${esc(p)} · ${state.sips[p] || 0} 🍻</span>`).join('')}
      </div>
      <p class="footer">Sips are small, water always counts, and anyone can say no. 💜</p>
    `;

    const on = (act, fn) => root.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
    on('home', goHome);
    on('setup', () => { state.names = state.players.slice(); renderSetup(); });
    on('truth', () => { drawCard('truth'); renderPlay(); });
    on('dare', () => { drawCard('dare'); renderPlay(); });
    on('next', () => { nextPlayer(); renderPlay(); window.scrollTo(0, 0); });
    const sip = () => {
      state.sips[state.current] = (state.sips[state.current] || 0) + 1;
      toast(`🍻 ${state.current} takes a sip (water counts!)`);
      nextPlayer();
      renderPlay();
      window.scrollTo(0, 0);
    };
    on('skip', sip);
    on('pass', sip);
    root.querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => {
        if (state.level === b.dataset.level) return;
        state.level = b.dataset.level;
        save(STORE_LEVEL, state.level);
        state.card = null; // re-pick truth/dare at the new level
        const l = LEVELS.find((x) => x.id === state.level);
        toast(`Level: ${l.emoji} ${l.name}`);
        renderPlay();
      })
    );
  }

  renderSetup();
}
