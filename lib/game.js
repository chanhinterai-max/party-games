import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { HttpError } from './http.js';
import { sha256, randomToken } from './auth.js';
import { LEVEL_IDS } from './content.js';
import { loadBank } from './bank.js';
import { getDrinks, getOdds, pickDrink, getPetSeconds, validPetted, getSurpriseRate } from './settings.js';
import { enabledSurprises, listDecks } from './surprises.js';
import { ensureStats, emptyStats, pairKey, computeResults } from './results.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const QUESTIONS_PER_PLAYER = 10; // questions per room = players × 10 (also each queue's length)
export const IDLE_MS = 60 * 60 * 1000;   // room closes after 1 h without a Truth/Dare pick
const MAX_QUEUE = 200;
const HISTORY_KEEP = 1000;
export const queueSize = (players) => players.length * QUESTIONS_PER_PLAYER;

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

// Players arrive as [{ name, gender: 'male'|'female' }] (strings are rejected: gender is required).
export function validatePlayers(input) {
  if (!Array.isArray(input)) throw new HttpError(400, 'Players are required');
  const players = input
    .map((p) => ({ name: typeof p?.name === 'string' ? p.name.trim().replace(/\s+/g, ' ') : '', gender: p?.gender }))
    .filter((p) => p.name);
  if (players.length < 2) throw new HttpError(400, 'Add at least 2 player names.');
  if (players.length > 16) throw new HttpError(400, 'Maximum 16 players.');
  const seen = new Set();
  for (const p of players) {
    if (p.name.length > 20) throw new HttpError(400, 'Names must be 20 characters or less.');
    if (/[<>{}]/.test(p.name)) throw new HttpError(400, `"${p.name}" contains invalid characters.`);
    if (!['male', 'female'].includes(p.gender)) throw new HttpError(400, `Pick Male or Female for ${p.name}.`);
    const k = p.name.toLowerCase();
    if (seen.has(k)) throw new HttpError(400, `"${p.name}" is entered twice. Make each name unique.`);
    seen.add(k);
  }
  return { names: players.map((p) => p.name), genders: Object.fromEntries(players.map((p) => [p.name, p.gender])) };
}

export function validateLevel(l) {
  if (!LEVEL_IDS.includes(l)) throw new HttpError(400, 'Invalid level');
  return l;
}

function randomWho(players, bank) {
  if (rnd(10) < 6 || !bank.who.length) return { kind: 'player', value: pick(players) };
  return { kind: 'generic', value: pick(bank.who).id };
}

function makeItem(what, players, bank) {
  return {
    id: newId(),
    who: randomWho(players, bank),
    what: { id: what.id, text: what.text, seconds: what.seconds ?? null },
    where: what.touch ? pick(what.where) : null,
  };
}

// v5 heat ordering: a NEW queue goes milder -> hotter with some randomness (jitter), so it warms up.
// Only the initial order; advanced users can still reorder freely in the editor.
export const HEAT_JITTER = 1.3;
export function itemHeat(item, bank) {
  const w = bank.whatById.get(item.what.id);
  const base = w?.heat ?? 2;
  const wh = item.where ? (bank.whereHeat?.[item.where] ?? 2) - 2 : 0;
  return base + wh * 0.5;
}
export function generateQueue(bank, level, type, players, n = queueSize(players)) {
  const pool = bank.what[level]?.[type] || [];
  if (!pool.length) return [];
  const out = [];
  while (out.length < n) {
    for (const w of shuffle(pool)) {
      if (out.length >= n) break;
      out.push(makeItem(w, players, bank));
    }
  }
  return out
    .map((it) => ({ it, k: itemHeat(it, bank) + (rnd(1000) / 1000) * HEAT_JITTER }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.it);
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

function whoText(who, players, current, bank) {
  if (who.kind === 'player') {
    if (who.value === current || !players.includes(who.value)) {
      const others = players.filter((p) => p !== current);
      return { text: pick(others), player: true };
    }
    return { text: who.value, player: true };
  }
  const g = bank.who.find((x) => x.id === who.value);
  return { text: g ? g.text : 'anyone you like', player: false };
}

export const PARTNER_TEXT = 'a partner of your choice';
export function renderCard(item, whoTxt) {
  let t = item.what.text;
  const partner = t.includes('{partner}');
  if (!t.includes('{who}') && !partner) t = `Tell {who}: ${t}`;
  t = t.replaceAll('{who}', whoTxt).replaceAll('{partner}', PARTNER_TEXT);
  if (t.includes('{where}')) t = t.replaceAll('{where}', item.where || 'hand');
  return t.charAt(0).toUpperCase() + t.slice(1);
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

// v5 Animal Match: each player gets a SECRET animal (women from the female deck, men from the male deck).
// Distinct within a deck; if a deck is empty/too small a numbered fallback is used. Stored only in
// rooms.state.animals; never part of publicRoom() while the game is active.
export function assignAnimals(players, genders, decks) {
  const out = {};
  for (const deck of ['female', 'male']) {
    const who = players.filter((p) => genders[p] === deck);
    const pool = shuffle(decks.filter((d) => d.deck === deck));
    const fallback = deck === 'female' ? ['Kitty', '🐾'] : ['Cub', '🐾'];
    who.forEach((p, i) => {
      const a = pool[i % Math.max(1, pool.length)];
      const round = pool.length ? Math.floor(i / pool.length) : i;
      const name = a ? a.name : fallback[0];
      out[p] = { deck, name: round > 0 || !a ? `${name} ${round + 1}` : name, emoji: a ? a.emoji : fallback[1] };
    });
  }
  return out;
}

export async function createRoom({ game, level, players, genders }) {
  const token = randomToken(24);
  const bank = await loadBank();
  return tx(async (c) => {
    const [code, decks] = [await uniqueCode(c), await listDecks(c)];
    const animals = assignAnimals(players, genders, decks);
    const state = {
      order: [], current: null, card: null, turn: 0, sips: Object.fromEntries(players.map((p) => [p, 0])), consumed: [],
      total: queueSize(players), drawn: 0, stats: emptyStats(players), animals, surprise: null, virus: null,
    };
    nextTurn(state, players);
    const r = await c.query(
      `INSERT INTO rooms(code, game, player_token_hash, level, players, genders, state, truth_queue, dare_queue, history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]') RETURNING *`,
      [code, game, sha256(token), level, JSON.stringify(players), JSON.stringify(genders), JSON.stringify(state),
        JSON.stringify(generateQueue(bank, level, 'truth', players)), JSON.stringify(generateQueue(bank, level, 'dare', players))]
    );
    return { code, token, row: r.rows[0], secret: secretOf(r.rows[0]) };
  });
}

const secretOf = (row) => ({
  animals: Object.fromEntries(Object.entries(row.state.animals || {}).map(([p, a]) => [p, { name: a.name, emoji: a.emoji }])),
});
export async function roomSecret(code, token) {
  code = normalizeCode(code);
  const r = await q('SELECT player_token_hash, state FROM rooms WHERE code=$1', [code]);
  if (!r.rows.length) throw new HttpError(404, 'Room not found');
  if (!token || typeof token !== 'string' || sha256(token) !== r.rows[0].player_token_hash) throw new HttpError(403, 'This device is not the host of this room');
  return secretOf(r.rows[0]);
}

export function normalizeCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4 || c.length > 6) throw new HttpError(400, 'Invalid room code');
  return c;
}

const totalOf = (r) => r.state.total || queueSize(r.players);

// Public (player-safe) view of a surprise: Animal Match pair names are NEVER included.
function publicSurprise(sp) {
  if (!sp) return null;
  return { id: sp.id, type: sp.type, text: sp.text, seconds: sp.seconds ?? null, a: sp.a || null, b: sp.b || null, player: sp.player || null };
}
export function publicRoom(r, { lite = false } = {}) {
  const status = r.status || 'active';
  return {
    status,
    closedReason: r.closed_reason || null,
    endedAt: r.ended_at || null,
    lastActivity: r.last_activity || null,
    total: totalOf(r),
    questionsLeft: Math.max(0, totalOf(r) - (r.state.drawn || 0)),
    results: status === 'active' ? null : { ...computeResults(r), animals: secretOf(r).animals }, // secret animals revealed at the end
    code: r.code,
    game: r.game,
    level: r.level,
    players: r.players,
    genders: r.genders || {},
    current: r.state.current,
    card: r.state.card,
    surprise: publicSurprise(r.state.surprise),
    virus: r.state.virus || null,
    drawn: r.state.drawn || 0,
    lastChicken: r.state.lastChicken || null,
    turn: r.state.turn,
    sips: r.state.sips,
    // The player screen never shows history: action responses skip it to keep them small.
    history: lite ? undefined : r.history.slice(-50).reverse(),
    version: r.version,
    updatedAt: r.updated_at,
  };
}

// Lazy idle check: run on every room read/action instead of a cron.
export async function closeIfIdle(code) {
  await q(
    `UPDATE rooms SET status='closed', closed_reason='idle', ended_at=now()
     WHERE code=$1 AND status='active' AND last_activity < now() - ($2 || ' milliseconds')::interval`,
    [code, String(IDLE_MS)]
  );
}
export async function closeAllIdle() {
  await q(
    `UPDATE rooms SET status='closed', closed_reason='idle', ended_at=now()
     WHERE status='active' AND last_activity < now() - ($1 || ' milliseconds')::interval`,
    [String(IDLE_MS)]
  );
}

export async function getRoom(code) {
  code = normalizeCode(code);
  await closeIfIdle(code);
  const r = await q('SELECT * FROM rooms WHERE code=$1', [code]);
  if (!r.rows.length) throw new HttpError(404, 'Room not found');
  return r.rows[0];
}

async function saveRoom(c, room) {
  const r = await c.query(
    `UPDATE rooms SET level=$2, state=$3, truth_queue=$4, dare_queue=$5, history=$6, version=version+1, updated_at=now(),
       status=$7, closed_reason=$8, ended_at=CASE WHEN $7 <> 'active' AND ended_at IS NULL THEN now() ELSE ended_at END,
       last_activity=CASE WHEN $9 THEN now() ELSE last_activity END
     WHERE code=$1 RETURNING *`,
    [room.code, room.level, JSON.stringify(room.state), JSON.stringify(room.truth_queue),
      JSON.stringify(room.dare_queue), JSON.stringify(room.history.slice(-HISTORY_KEEP)),
      room.status || 'active', room.closed_reason || null, !!room.touch]
  );
  return r.rows[0];
}

function endRoom(room, reason) {
  room.status = 'ended';
  room.closed_reason = reason;
  room.state.card = null;
  room.state.surprise = null;
  room.state.virus = null;
}

const VIRUS_TURNS = 3;
// Roll a surprise after a finished turn (server-side; rate set by the admin). Its own turn: it does not
// consume queue questions or count toward players × 10.
async function rollSurprise(c, room, rate) {
  if (!(rate > 0) || rnd(100) >= rate) return null;
  const items = await enabledSurprises(c, room.level);
  if (!items.length) return null;
  const types = [...new Set(items.map((x) => x.type))];
  const type = pick(types);
  const it = pick(items.filter((x) => x.type === type));
  const sp = { id: newId(), itemId: it.id, type, text: it.text, seconds: it.seconds ?? null };
  if (type === 'match') {
    const animals = room.state.animals || {};
    const fem = room.players.filter((p) => animals[p]?.deck === 'female');
    const mal = room.players.filter((p) => animals[p]?.deck === 'male');
    let pa, pb;
    if (fem.length && mal.length) { pa = pick(fem); pb = pick(mal); } // one female-deck + one male-deck animal
    else { const two = shuffle(room.players).slice(0, 2); [pa, pb] = two; } // single-gender group: any two
    const lab = (p) => (animals[p] ? `${animals[p].emoji} ${animals[p].name}` : '🐾 Mystery');
    sp.a = lab(pa); sp.b = lab(pb);
    sp.pair = [pa, pb]; // secret: kept server-side for pair awards; never sent to the screen
    sp.text = it.text.replaceAll('{a}', sp.a).replaceAll('{b}', sp.b);
  }
  if (type === 'whisper') sp.player = room.state.current; // the player who peeks and whispers
  return sp;
}

export async function playerAction(code, token, body) {
  code = normalizeCode(code);
  const { action } = body;
  // Settings/bank are only read for the actions that need them (no extra round trips on the tap path).
  const needsBank = action === 'draw' || action === 'level';
  const finishes = action === 'done' || action === 'chicken';
  const [bank, drinks, odds, petSeconds, rate] = await Promise.all([
    needsBank ? loadBank() : null,
    action === 'chicken' ? getDrinks() : null,
    action === 'chicken' ? getOdds() : null,
    action === 'chicken' ? getPetSeconds() : null,
    finishes ? getSurpriseRate() : null,
  ]);
  const out = await tx(async (c) => {
    const r = await c.query('SELECT * FROM rooms WHERE code=$1 FOR UPDATE', [code]);
    const room = r.rows[0];
    if (!room) throw new HttpError(404, 'Room not found');
    if (!token || typeof token !== 'string' || sha256(token) !== room.player_token_hash) {
      throw new HttpError(403, 'This device is not the host of this room');
    }
    const st = room.state;
    // Lazy idle close, folded into this transaction (saves a round trip per tap).
    if ((room.status || 'active') === 'active' && room.last_activity && Date.now() - new Date(room.last_activity).getTime() > IDLE_MS) {
      room.status = 'closed'; room.closed_reason = 'idle';
      await saveRoom(c, room);
      return { idleClosed: true };
    }
    if ((room.status || 'active') !== 'active') {
      if (action === 'end') return publicRoom(room, { lite: true });
      throw new HttpError(409, room.closed_reason === 'idle' ? 'This room closed after 1 hour without play' : 'This game has ended');
    }
    if (st.surprise && !['surprise_done', 'end', 'level'].includes(action)) {
      throw new HttpError(409, 'Finish the surprise card first');
    }
    if (!st.total) st.total = queueSize(room.players);
    st.drawn = st.drawn || 0;
    const stats = ensureStats(st, room.players);
    const me = () => stats.players[st.current];
    const finishTurn = async () => {
      st.lastAction = action;
      if (st.virus) { st.virus.turnsLeft -= 1; if (st.virus.turnsLeft <= 0) st.virus = null; }
      if (st.drawn >= st.total) { endRoom(room, 'complete'); return; }
      nextTurn(st, room.players);
      const sp = await rollSurprise(c, room, rate);
      if (sp) {
        st.surprise = sp;
        if (sp.pair) stats.pairs[pairKey(sp.pair[0], sp.pair[1])] = (stats.pairs[pairKey(sp.pair[0], sp.pair[1])] || 0) + 1;
      }
    };
    if (action === 'draw') {
      const type = body.type === 'truth' ? 'truth' : body.type === 'dare' ? 'dare' : null;
      if (!type) throw new HttpError(400, 'type must be truth or dare');
      if (!st.card) {
        const key = `${type}_queue`;
        const item = room[key].shift();
        if (!item) throw new HttpError(409, `No ${type} questions left. Pick the other one!`);
        const who = whoText(item.who, room.players, st.current, bank);
        const target = who.player ? who.text : null; // resolved player name; generic targets are not resolved
        const seconds = bank.whatById.get(item.what.id)?.seconds ?? item.what.seconds ?? null;
        st.card = {
          itemId: item.id, type, who: who.text, whoIsPlayer: who.player, whoRef: item.who, what: item.what, where: item.where,
          target, text: renderCard(item, who.text), seconds,
        };
        st.consumed = [...(st.consumed || []), item.id].slice(-2000);
        st.drawn += 1;
        me()[type === 'truth' ? 'truths' : 'dares'] += 1;
        if (target && target !== st.current) stats.pairs[pairKey(st.current, target)] = (stats.pairs[pairKey(st.current, target)] || 0) + 1;
        room.touch = true; // a Truth/Dare pick = activity for the idle timeout
      }
    } else if (action === 'done') {
      room.history.push({ turn: st.turn, player: st.current, type: st.card?.type || null, text: st.card?.text || null, target: st.card?.target || null, result: 'done', at: new Date().toISOString() });
      if (st.card) me().done += 1;
      st.lastChicken = null;
      await finishTurn();
    } else if (action === 'chicken') {
      const petted = validPetted(body.petted, petSeconds);
      const drink = pickDrink(odds, drinks, petted, rnd);
      room.history.push({
        turn: st.turn, player: st.current, type: st.card?.type || null, text: st.card?.text || null, target: st.card?.target || null,
        result: 'chicken', drink, at: new Date().toISOString(),
      });
      st.sips[st.current] = (st.sips[st.current] || 0) + 1;
      me().chicken += 1;
      if (!st.card) me().chickenPass += 1;
      if (me().drinks[drink.category] !== undefined) me().drinks[drink.category] += 1;
      st.lastChicken = { turn: st.turn, player: st.current, ...drink };
      await finishTurn();
    } else if (action === 'surprise_done') {
      const sp = st.surprise;
      if (sp) {
        room.history.push({ turn: st.turn, player: null, type: 'surprise', stype: sp.type, text: sp.text, result: 'surprise', at: new Date().toISOString() });
        if (sp.type === 'virus') st.virus = { text: sp.text, turnsLeft: VIRUS_TURNS };
        st.surprise = null;
      }
    } else if (action === 'level') {
      room.level = validateLevel(body.level);
      st.card = null;
      st.surprise = null;
      room.truth_queue = generateQueue(bank, room.level, 'truth', room.players);
      room.dare_queue = generateQueue(bank, room.level, 'dare', room.players);
    } else if (action === 'end') {
      endRoom(room, 'host');
    } else {
      throw new HttpError(400, 'Unknown action');
    }
    return publicRoom(await saveRoom(c, room), { lite: true });
  });
  if (out?.idleClosed) throw new HttpError(409, 'This room closed after 1 hour without play');
  return out;
}

// ---------- Advanced editor ----------
export function palette(room, bank) {
  const g = room.genders || {};
  return {
    who: [
      ...room.players.map((p) => ({ kind: 'player', value: p, label: p, gender: g[p] || null })),
      ...bank.who.map((x) => ({ kind: 'generic', value: x.id, label: x.label })),
    ],
    what: {
      truth: bank.what[room.level].truth.map((w) => ({ id: w.id, text: w.text, touch: w.touch, heat: w.heat, seconds: w.seconds })),
      dare: bank.what[room.level].dare.map((w) => ({ id: w.id, text: w.text, touch: w.touch, heat: w.heat, seconds: w.seconds })),
    },
    where: bank.where,
  };
}

export function editorView(room, bank) {
  return { room: publicRoom(room), queues: { truth: room.truth_queue, dare: room.dare_queue }, palette: palette(room, bank) };
}

function validateItem(raw, type, room, bank, existing) {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Invalid question');
  // Unchanged items stay valid even if the admin later edited/removed their bank entries.
  const prev = typeof raw.id === 'string' ? existing.get(raw.id) : null;
  if (prev && JSON.stringify([prev.who, prev.what?.id, prev.where]) === JSON.stringify([raw.who, raw.what?.id, raw.where ?? null])) return prev;
  const what = bank.whatById.get(raw.what?.id);
  if (!what || what.type !== type) throw new HttpError(400, `Invalid WHAT for a ${type} question`);
  const who = raw.who || {};
  if (who.kind === 'player') {
    if (!room.players.includes(who.value)) throw new HttpError(400, 'WHO must be a player in this room');
  } else if (who.kind === 'generic') {
    if (!bank.who.some((g) => g.id === who.value)) throw new HttpError(400, 'Unknown WHO');
  } else throw new HttpError(400, 'Invalid WHO');
  let where = null;
  if (what.touch) {
    where = raw.where == null ? pick(what.where) : raw.where;
    if (!bank.where.includes(where)) throw new HttpError(400, 'Invalid WHERE');
  }
  const id = typeof raw.id === 'string' && /^[a-f0-9]{12}$/.test(raw.id) ? raw.id : newId();
  return { id, who: { kind: who.kind, value: who.value }, what: { id: what.id, text: what.text, seconds: what.seconds ?? null }, where };
}

export async function saveQueues(code, body) {
  code = normalizeCode(code);
  await closeIfIdle(code);
  const bank = await loadBank();
  return tx(async (c) => {
    const r = await c.query('SELECT * FROM rooms WHERE code=$1 FOR UPDATE', [code]);
    const room = r.rows[0];
    if (!room) throw new HttpError(404, 'Room not found');
    if ((room.status || 'active') !== 'active') throw new HttpError(409, 'This room is closed; the queue can no longer be edited');
    const consumed = new Set(room.state.consumed || []);
    const changes = {};
    for (const type of ['truth', 'dare']) {
      if (body[type] === undefined) continue;
      if (!Array.isArray(body[type]) || body[type].length > MAX_QUEUE) throw new HttpError(400, `${type} queue must be a list of up to ${MAX_QUEUE}`);
      const existing = new Map(room[`${type}_queue`].map((x) => [x.id, x]));
      const seen = new Set();
      const items = [];
      for (const raw of body[type]) {
        const it = validateItem(raw, type, room, bank, existing);
        if (consumed.has(it.id) || seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(it);
      }
      room[`${type}_queue`] = items;
      changes[type] = items.length;
    }
    const saved = await saveRoom(c, room);
    return { view: editorView(saved, bank), changes };
  });
}

export async function liveRooms() {
  await closeAllIdle();
  const r = await q(
    `SELECT code, game, level, players, state, version, created_at, updated_at, last_activity,
            jsonb_array_length(history) AS turns
     FROM rooms WHERE status='active' AND last_activity > now() - interval '1 hour' ORDER BY updated_at DESC LIMIT 100`
  );
  return r.rows.map((x) => ({
    code: x.code, game: x.game, level: x.level, players: x.players, current: x.state.current,
    turns: x.turns, questionsLeft: Math.max(0, (x.state.total || x.players.length * QUESTIONS_PER_PLAYER) - (x.state.drawn || 0)),
    lastActivity: x.last_activity, createdAt: x.created_at, updatedAt: x.updated_at,
  }));
}
