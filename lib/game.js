import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { HttpError } from './http.js';
import { sha256, randomToken } from './auth.js';
import { BANK, GENERIC_WHO, LEVEL_IDS, WHERE, findWhat, renderCard } from './content.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const QUEUE_SIZE = 40;
const REFILL_AT = 10;
const MAX_QUEUE = 200;
const HISTORY_KEEP = 200;

const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const newId = () => crypto.randomBytes(6).toString('hex');

export function validatePlayers(input) {
  if (!Array.isArray(input)) throw new HttpError(400, 'Players are required');
  const names = input
    .map((n) => (typeof n === 'string' ? n.trim().replace(/\s+/g, ' ') : ''))
    .filter(Boolean);
  if (names.length < 2) throw new HttpError(400, 'Add at least 2 player names.');
  if (names.length > 16) throw new HttpError(400, 'Maximum 16 players.');
  const seen = new Set();
  for (const n of names) {
    if (n.length > 20) throw new HttpError(400, 'Names must be 20 characters or less.');
    if (/[<>{}]/.test(n)) throw new HttpError(400, `"${n}" contains invalid characters.`);
    const k = n.toLowerCase();
    if (seen.has(k)) throw new HttpError(400, `"${n}" is entered twice. Make each name unique.`);
    seen.add(k);
  }
  return names;
}

export function validateLevel(l) {
  if (!LEVEL_IDS.includes(l)) throw new HttpError(400, 'Invalid level');
  return l;
}

function randomWho(players) {
  // ~60% a named player, ~40% a generic target
  if (rnd(10) < 6) return { kind: 'player', value: pick(players) };
  return { kind: 'generic', value: pick(GENERIC_WHO).id };
}

export function makeItem(what, players, who, where) {
  return {
    id: newId(),
    who: who || randomWho(players),
    what: { id: what.id, text: what.text },
    where: what.touch ? where || pick(what.where) : null,
  };
}

export function generateQueue(level, type, players, n = QUEUE_SIZE) {
  const out = [];
  while (out.length < n) {
    for (const w of shuffle(BANK[level][type])) {
      if (out.length >= n) break;
      out.push(makeItem(w, players));
    }
  }
  return out;
}

function nextTurn(state, players) {
  if (!state.order || state.order.length === 0) {
    const order = shuffle(players);
    if (order.length > 1 && order[0] === state.current) {
      const s = 1 + rnd(order.length - 1);
      [order[0], order[s]] = [order[s], order[0]];
    }
    state.order = order;
  }
  state.current = state.order.shift();
  state.card = null;
  state.turn = (state.turn || 0) + 1;
}

function whoText(who, players, current) {
  if (who.kind === 'player') {
    if (who.value === current || !players.includes(who.value)) {
      const others = players.filter((p) => p !== current);
      return { text: pick(others), resolved: true };
    }
    return { text: who.value };
  }
  const g = GENERIC_WHO.find((x) => x.id === who.value);
  return { text: g ? g.text : 'anyone you like' };
}

async function uniqueCode(client) {
  for (let i = 0; i < 20; i++) {
    let code = '';
    for (let j = 0; j < 5; j++) code += CODE_CHARS[rnd(CODE_CHARS.length)];
    const r = await client.query('SELECT 1 FROM rooms WHERE code=$1', [code]);
    if (!r.rows.length) return code;
  }
  throw new HttpError(503, 'Could not allocate a room code');
}

export async function createRoom({ game, level, players }) {
  const token = randomToken(24);
  return tx(async (c) => {
    const code = await uniqueCode(c);
    const state = { order: [], current: null, card: null, turn: 0, sips: Object.fromEntries(players.map((p) => [p, 0])), consumed: [] };
    nextTurn(state, players);
    await c.query(
      `INSERT INTO rooms(code, game, player_token_hash, level, players, state, truth_queue, dare_queue, history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]')`,
      [code, game, sha256(token), level, JSON.stringify(players), JSON.stringify(state),
        JSON.stringify(generateQueue(level, 'truth', players)), JSON.stringify(generateQueue(level, 'dare', players))]
    );
    return { code, token };
  });
}

export function normalizeCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4 || c.length > 6) throw new HttpError(400, 'Invalid room code');
  return c;
}

export function publicRoom(r) {
  return {
    code: r.code,
    game: r.game,
    level: r.level,
    players: r.players,
    current: r.state.current,
    card: r.state.card,
    turn: r.state.turn,
    sips: r.state.sips,
    history: r.history.slice(-50).reverse(),
    version: r.version,
    updatedAt: r.updated_at,
  };
}

export async function getRoom(code) {
  const r = await q('SELECT * FROM rooms WHERE code=$1', [normalizeCode(code)]);
  if (!r.rows.length) throw new HttpError(404, 'Room not found');
  return r.rows[0];
}

async function saveRoom(c, room) {
  const r = await c.query(
    `UPDATE rooms SET level=$2, state=$3, truth_queue=$4, dare_queue=$5, history=$6, version=version+1, updated_at=now()
     WHERE code=$1 RETURNING *`,
    [room.code, room.level, JSON.stringify(room.state), JSON.stringify(room.truth_queue),
      JSON.stringify(room.dare_queue), JSON.stringify(room.history.slice(-HISTORY_KEEP))]
  );
  return r.rows[0];
}

export async function playerAction(code, token, body) {
  code = normalizeCode(code);
  return tx(async (c) => {
    const r = await c.query('SELECT * FROM rooms WHERE code=$1 FOR UPDATE', [code]);
    const room = r.rows[0];
    if (!room) throw new HttpError(404, 'Room not found');
    if (!token || typeof token !== 'string' || sha256(token) !== room.player_token_hash) {
      throw new HttpError(403, 'This device is not the host of this room');
    }
    const { action } = body;
    const st = room.state;
    if (action === 'draw') {
      const type = body.type === 'truth' ? 'truth' : body.type === 'dare' ? 'dare' : null;
      if (!type) throw new HttpError(400, 'type must be truth or dare');
      if (!st.card) {
        const key = `${type}_queue`;
        if (room[key].length < REFILL_AT) room[key].push(...generateQueue(room.level, type, room.players));
        const item = room[key].shift();
        const who = whoText(item.who, room.players, st.current);
        st.card = {
          itemId: item.id, type, who: who.text, whoRef: item.who, what: item.what, where: item.where,
          text: renderCard(item, who.text),
        };
        st.consumed = [...(st.consumed || []), item.id].slice(-500);
      }
    } else if (action === 'done' || action === 'sip') {
      room.history.push({
        turn: st.turn, player: st.current, type: st.card?.type || null, text: st.card?.text || null,
        result: action === 'sip' ? 'drank' : 'done', at: new Date().toISOString(),
      });
      if (action === 'sip') st.sips[st.current] = (st.sips[st.current] || 0) + 1;
      nextTurn(st, room.players);
    } else if (action === 'level') {
      room.level = validateLevel(body.level);
      st.card = null;
      room.truth_queue = generateQueue(room.level, 'truth', room.players);
      room.dare_queue = generateQueue(room.level, 'dare', room.players);
    } else {
      throw new HttpError(400, 'Unknown action');
    }
    return publicRoom(await saveRoom(c, room));
  });
}

// ---------- Advanced editor ----------
export function palette(room) {
  return {
    who: [
      ...room.players.map((p) => ({ kind: 'player', value: p, label: p })),
      ...GENERIC_WHO.map((g) => ({ kind: 'generic', value: g.id, label: g.label })),
    ],
    what: {
      truth: BANK[room.level].truth.map((w) => ({ id: w.id, text: w.text, touch: w.touch })),
      dare: BANK[room.level].dare.map((w) => ({ id: w.id, text: w.text, touch: w.touch })),
    },
    where: WHERE,
  };
}

export function editorView(room) {
  return { room: publicRoom(room), queues: { truth: room.truth_queue, dare: room.dare_queue }, palette: palette(room) };
}

function validateItem(raw, type, players) {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Invalid question');
  const what = findWhat(raw.what?.id);
  if (!what || what.type !== type) throw new HttpError(400, `Invalid WHAT for a ${type} question`);
  const who = raw.who || {};
  if (who.kind === 'player') {
    if (!players.includes(who.value)) throw new HttpError(400, 'WHO must be a player in this room');
  } else if (who.kind === 'generic') {
    if (!GENERIC_WHO.some((g) => g.id === who.value)) throw new HttpError(400, 'Unknown WHO');
  } else throw new HttpError(400, 'Invalid WHO');
  let where = null;
  if (what.touch) {
    where = raw.where == null ? pick(what.where) : raw.where;
    if (!WHERE.includes(where)) throw new HttpError(400, 'Invalid WHERE');
  }
  const id = typeof raw.id === 'string' && /^[a-f0-9]{12}$/.test(raw.id) ? raw.id : newId();
  return { id, who: { kind: who.kind, value: who.value }, what: { id: what.id, text: what.text }, where };
}

export async function saveQueues(code, body) {
  code = normalizeCode(code);
  return tx(async (c) => {
    const r = await c.query('SELECT * FROM rooms WHERE code=$1 FOR UPDATE', [code]);
    const room = r.rows[0];
    if (!room) throw new HttpError(404, 'Room not found');
    const consumed = new Set(room.state.consumed || []);
    const changes = {};
    for (const type of ['truth', 'dare']) {
      if (body[type] === undefined) continue;
      if (!Array.isArray(body[type]) || body[type].length > MAX_QUEUE) throw new HttpError(400, `${type} queue must be a list of up to ${MAX_QUEUE}`);
      const seen = new Set();
      const items = [];
      for (const raw of body[type]) {
        const it = validateItem(raw, type, room.players);
        if (consumed.has(it.id) || seen.has(it.id)) continue; // already served, or duplicate
        seen.add(it.id);
        items.push(it);
      }
      room[`${type}_queue`] = items;
      changes[type] = items.length;
    }
    const saved = await saveRoom(c, room);
    return { view: editorView(saved), changes };
  });
}

export async function liveRooms() {
  const r = await q(
    `SELECT code, game, level, players, state, version, created_at, updated_at,
            jsonb_array_length(history) AS turns
     FROM rooms WHERE updated_at > now() - interval '12 hours' ORDER BY updated_at DESC LIMIT 100`
  );
  return r.rows.map((x) => ({
    code: x.code, game: x.game, level: x.level, players: x.players, current: x.state.current,
    turns: x.turns, createdAt: x.created_at, updatedAt: x.updated_at,
  }));
}
