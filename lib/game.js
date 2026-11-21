import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { HttpError } from './http.js';
import { sha256, randomToken } from './auth.js';
import { LEVEL_IDS } from './content.js';
import { loadBank } from './bank.js';
import { getDrinks, getOdds, pickDrink, getPetSeconds, validPetted, getSurpriseRate } from './settings.js';
import { enabledSurprises, listPool } from './surprises.js';
import { ensureStats, emptyStats, pairKey, computeResults } from './results.js';
import { assignAnimals, publicAnimals, HUMAN_ANIMAL } from './animals.js';
import { publicStar, hasQuiet, spinWheel, publicWheel } from './partystar.js';
import { starPick } from './partystar-shared.js';

export { assignAnimals, publicAnimals, HUMAN_ANIMAL }; // shared Party Animal code (lib/animals.js)

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
  t = t.replaceAll('{who}', whoTxt).replaceAll('{partner}', item.star ? whoTxt : PARTNER_TEXT); // v11: star pick names the partner
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

// v6 surprise schedule: EXACTLY round(total × rate%) surprises (min 1 when rate > 0), placed after random
// finished turns 1 … total-1 (never before the first question), one per stratum so they spread through the
// game and never come two in a row (a question always sits between two surprises).
export function scheduleSurprises(total, rate) {
  if (!(rate > 0) || total < 2) return [];
  const count = Math.min(total - 1, Math.max(1, Math.round((total * rate) / 100)));
  const span = total - 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const lo = Math.floor((i * span) / count) + 1;
    const hi = Math.floor(((i + 1) * span) / count);
    out.push(lo + rnd(Math.max(1, hi - lo + 1)));
  }
  return out;
}

const rolesById = (animals) => Object.fromEntries(Object.values(publicAnimals(animals)).map((a) => [a.id, a.role]));

export async function createRoom({ game, level, players, genders, creator = null, star = null }) {
  const token = randomToken(24);
  const [bank, rate] = await Promise.all([loadBank(), getSurpriseRate()]);
  return tx(async (c) => {
    const [code, pool] = [await uniqueCode(c), await listPool(c)];
    const animals = assignAnimals(players, pool);
    const total = queueSize(players);
    const state = {
      order: [], current: null, card: null, turn: 0, sips: Object.fromEntries(players.map((p) => [p, 0])), consumed: [],
      total, drawn: 0, stats: emptyStats(players), animals, surprise: null, virus: null,
      surpriseAt: scheduleSurprises(total, rate), turnsDone: 0,
    };
    nextTurn(state, players);
    const r = await c.query(
      `INSERT INTO rooms(code, game, player_token_hash, level, players, genders, state, truth_queue, dare_queue, history, creator_id, creator_session, party_star)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]',$10,$11,$12) RETURNING *`,
      [code, game, sha256(token), level, JSON.stringify(players), JSON.stringify(genders), JSON.stringify(state),
        JSON.stringify(generateQueue(bank, level, 'truth', players)), JSON.stringify(generateQueue(bank, level, 'dare', players)),
        creator?.id ?? null, creator?.session ?? null, star ? JSON.stringify(star) : null]
    );
    return { code, token, row: r.rows[0] };
  });
}

// v11: an Animal Race room an advanced user created from their landing page (creator tag + visible Party Star).
// The race itself still runs entirely on the phone; this row only records the room (ended at the champion).
export async function createRaceRoom({ players, genders, animals, creator, star }) {
  const token = randomToken(24);
  return tx(async (c) => {
    const code = await uniqueCode(c);
    const state = { order: [], current: null, card: null, turn: 0, sips: Object.fromEntries(players.map((p) => [p, 0])), consumed: [],
      total: 0, drawn: 0, stats: emptyStats(players), animals, surprise: null, virus: null, surpriseAt: [], turnsDone: 0 };
    const r = await c.query(
      `INSERT INTO rooms(code, game, player_token_hash, level, players, genders, state, truth_queue, dare_queue, history, creator_id, creator_session, party_star)
       VALUES ($1,'animal-race',$2,'race',$3,$4,$5,'[]','[]','[]',$6,$7,$8) RETURNING code`,
      [code, sha256(token), JSON.stringify(players), JSON.stringify(genders), JSON.stringify(state),
        creator?.id ?? null, creator?.session ?? null, star ? JSON.stringify(star) : null]
    );
    return { code: r.rows[0].code, token };
  });
}

export function normalizeCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4 || c.length > 6) throw new HttpError(400, 'Invalid room code');
  return c;
}

const totalOf = (r) => r.state.total || queueSize(r.players);

// Public view of a surprise (the Animal Match pair is shown by animal; player names are not needed).
function publicSurprise(sp) {
  if (!sp) return null;
  return {
    id: sp.id, type: sp.type, text: sp.text, seconds: sp.seconds ?? null, a: sp.a || null, b: sp.b || null, player: sp.player || null,
    pair: sp.type === 'match' && Array.isArray(sp.pair) ? sp.pair : null, // v6: animals are public, so the players can be named
    star: sp.star || null, // v11: '⭐ <label>’s pick 💕' when the Party Star perk chose the pairing
  };
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
    results: status === 'active' ? null : { ...computeResults(r), animals: publicAnimals(r.state.animals) },
    code: r.code,
    game: r.game,
    level: r.level,
    players: r.players,
    genders: r.genders || {},
    current: r.state.current,
    card: r.state.card,
    animals: publicAnimals(r.state.animals), // v6: shown openly (same screen for everyone)
    surprise: publicSurprise(r.state.surprise),
    virus: r.state.virus || null,
    drawn: r.state.drawn || 0,
    lastChicken: r.state.lastChicken || null,
    turn: r.state.turn,
    sips: r.state.sips,
    star: publicStar(r.party_star), // Party Star: PUBLIC (⭐ badge + collapsed perk dropdown)
    wheel: publicWheel(r.state.wheel), // v12 🎡 next-star wheel (set when a Party Star game ends)
    hosted: r.creator_id != null,
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
  // v12 🎡: a Party Star room spins the next-star wheel when the game ends (server pick; phones animate to it)
  if (room.party_star && room.game === 'truth-or-dare' && !room.state.wheel) {
    room.state.wheel = spinWheel(room.party_star, room.game, room.players, ensureStats(room.state, room.players).players);
  }
  room.status = 'ended';
  room.closed_reason = reason;
  room.state.card = null;
  room.state.surprise = null;
  room.state.virus = null;
}

const VIRUS_TURNS = 3;
// v6: draw the surprise for a scheduled slot. It is its own turn: it does not consume queue questions or count
// toward players × 10. Types = enabled surprise types for the level, plus 'human' when the game has a Human.
async function drawSurprise(c, room) {
  const st = room.state;
  const animals = st.animals || {};
  const hasHuman = Object.values(animals).some((a) => a.role === 'human');
  const items = await enabledSurprises(c, room.level);
  const humanItems = hasHuman
    ? (await c.query("SELECT id, text, seconds FROM human_items WHERE kind='surprise' AND level=$1 AND enabled ORDER BY sort, id", [room.level])).rows
    : [];
  const types = [...new Set(items.map((x) => x.type))];
  if (humanItems.length) types.push('human');
  if (!types.length) return null;
  const type = pick(types);
  const it = type === 'human' ? pick(humanItems) : pick(items.filter((x) => x.type === type));
  const sp = { id: newId(), itemId: it.id, type, text: it.text, seconds: it.seconds ?? null };
  if (type === 'match') {
    // Always one PREDATOR ({a}) and one PREY ({b}); v5 rooms without roles fall back to any two players.
    const pred = room.players.filter((p) => animals[p]?.role === 'predator');
    const prey = room.players.filter((p) => animals[p]?.role === 'prey');
    let pa, pb;
    if (pred.length && prey.length) { pa = pick(pred); pb = pick(prey); }
    else [pa, pb] = shuffle(room.players).slice(0, 2);
    // v11 Party Star: their surprise partner is opposite-sex (predator ↔ prey kept when possible); labelled
    const star = room.party_star; const sr = star && animals[star.player]?.role;
    if (star?.perks?.surpriseOn && (sr === 'predator' || sr === 'prey') && rnd(100) < star.perks.surprisePct) {
      const opp = oppositeOf(room, star.player);
      const other = opp.filter((p) => animals[p]?.role === (sr === 'predator' ? 'prey' : 'predator'));
      const partner = other.length ? pick(other) : null;
      if (partner) { if (sr === 'predator') { pa = star.player; pb = partner; } else { pa = partner; pb = star.player; } sp.star = `${starPick(star.label)} 💕`; }
    }
    const lab = (p) => (animals[p] ? `${animals[p].emoji} ${animals[p].name}` : '🐾 Mystery');
    sp.a = lab(pa); sp.b = lab(pb);
    sp.pair = [pa, pb];
    sp.text = it.text.replaceAll('{a}', sp.a).replaceAll('{b}', sp.b);
  }
  if (type === 'whisper') sp.player = st.current;
  if (type === 'human') sp.player = Object.keys(animals).find((p) => animals[p].role === 'human') || null;
  return sp;
}

// ---- v11 Party Star perks (only in rooms with a resolved, PUBLIC party_star; every outcome is labelled) ----
const oppositeOf = (room, p) => { const g = room.genders?.[p]; return g ? room.players.filter((x) => x !== p && room.genders?.[x] && room.genders[x] !== g) : []; };
// ToD partner card: a timed (≥ partnerMinSec) card that names another player, served to the star with an
// opposite-sex partner. Not taken from the queue (like Human items), so the queue order stays intact.
function starPartnerItem(room, bank, type, star) {
  const P = star.perks;
  const partners = oppositeOf(room, star.player);
  if (!partners.length) return null;
  const cands = (bank.what[room.level]?.[type] || []).filter((w) => (w.seconds ?? 0) >= P.partnerMinSec && /\{(who|partner)\}/.test(w.text));
  if (!cands.length) return null;
  const w = pick(cands); const partner = pick(partners);
  return { id: newId(), who: { kind: 'player', value: partner }, what: { id: w.id, text: w.text, seconds: w.seconds ?? null },
    where: w.touch && w.where?.length ? pick(w.where) : null, star: true };
}
// chicken-out drink for the star: the star's own odds; then "luckier rolls" may re-roll an alcohol result once
function starDrink(star, odds, drinks, petted, roles) {
  const P = star.perks; let tag = null;
  const o = P.drinksOn ? { normal: { alcohol: P.drinksAlcohol, sparkling: P.drinksSparkling, water: P.drinksWater }, rule: { enabled: false } } : odds;
  let d = pickDrink(o, drinks, P.drinksOn ? [] : petted, rnd, roles);
  if (P.drinksOn) tag = 'odds';
  if (P.luckOn && d.category === 'alcohol' && rnd(100) < P.luckPct) { d = pickDrink({ normal: { alcohol: 0, sparkling: 50, water: 50 }, rule: { enabled: false } }, drinks, [], rnd, roles); tag = 'luck'; }
  return { ...d, ...(tag ? { star: tag } : {}) };
}

// v6 Human Truth/Dare share: on about 1 in HUMAN_SHARE_DEN of the Human's own Truth/Dare picks a Human item
// is served instead of the queue head. The main queue is NOT consumed or reordered.
export const HUMAN_SHARE_DEN = 3;

export async function playerAction(code, token, body) {
  code = normalizeCode(code);
  const { action } = body;
  // Settings/bank are only read for the actions that need them (no extra round trips on the tap path).
  const needsBank = action === 'draw' || action === 'level';
  const [bank, drinks, odds, petSeconds] = await Promise.all([
    needsBank ? loadBank() : null,
    action === 'chicken' ? getDrinks() : null,
    action === 'chicken' ? getOdds() : null,
    action === 'chicken' ? getPetSeconds() : null,
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
      st.turnsDone = (st.turnsDone || 0) + 1;
      const sp = Array.isArray(st.surpriseAt) && st.surpriseAt.includes(st.turnsDone) ? await drawSurprise(c, room) : null;
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
        const meHuman = st.animals?.[st.current]?.role === 'human';
        const hpool = meHuman ? bank.human?.[room.level]?.[type] || [] : [];
        const star = room.party_star;
        const starItem = star && star.player === st.current && star.perks?.partnerOn && rnd(100) < star.perks.partnerPct
          ? starPartnerItem(room, bank, type, star) : null;
        const useHuman = !starItem && hpool.length > 0 && rnd(HUMAN_SHARE_DEN) === 0;
        const item = starItem || (useHuman
          ? { id: newId(), who: { kind: 'player', value: st.current }, what: (({ id, text, seconds }) => ({ id, text, seconds }))(pick(hpool)), where: null, human: true }
          : room[key].shift());
        if (!item) throw new HttpError(409, `No ${type} questions left. Pick the other one!`);
        const who = whoText(item.who, room.players, st.current, bank);
        const target = who.player ? who.text : null; // resolved player name; generic targets are not resolved
        const seconds = bank.whatById.get(item.what.id)?.seconds ?? item.what.seconds ?? null;
        st.card = {
          itemId: item.id, type, who: who.text, whoIsPlayer: who.player, whoRef: item.who, what: item.what, where: item.where,
          target, text: renderCard(item, who.text), seconds: item.star ? item.what.seconds : seconds, human: !!item.human,
          ...(item.star ? { star: `${starPick(room.party_star.label)} 💕` } : {}),
        };
        if (!item.human && !item.star) st.consumed = [...(st.consumed || []), item.id].slice(-2000);
        st.drawn += 1;
        me()[type === 'truth' ? 'truths' : 'dares'] += 1;
        if (target && target !== st.current) stats.pairs[pairKey(st.current, target)] = (stats.pairs[pairKey(st.current, target)] || 0) + 1;
        room.touch = true; // a Truth/Dare pick = activity for the idle timeout
      }
    } else if (action === 'done') {
      room.history.push({ turn: st.turn, player: st.current, type: st.card?.type || null, text: st.card?.text || null, target: st.card?.target || null, result: 'done', at: new Date().toISOString() });
      if (st.card) me().done += 1;
      if (st.card?.type === 'dare') me().daresDone = (me().daresDone || 0) + 1; // v12 wheel: dares actually done
      st.lastChicken = null;
      await finishTurn();
    } else if (action === 'chicken') {
      const petted = validPetted(body.petted, petSeconds);
      const star = room.party_star;
      const drink = hasQuiet(star, st.current) ? starDrink(star, odds, drinks, petted, rolesById(st.animals)) : pickDrink(odds, drinks, petted, rnd, rolesById(st.animals));
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
    } else if (action === 'race_end') {
      // v12: hosted Animal Race room: the champion is crowned → podium (names, winner first) → wheel → room ended
      if (room.game !== 'animal-race') throw new HttpError(400, 'Not a race room');
      const order = Array.isArray(body.order) ? body.order.filter((n) => room.players.includes(n)) : [];
      if (!order.length || new Set(order).size !== order.length) throw new HttpError(400, 'order must list the finishers');
      if (room.party_star && !st.wheel) st.wheel = spinWheel(room.party_star, room.game, room.players, order);
      st.podium = order.slice(0, 3);
      endRoom(room, 'complete');
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
      truth: (bank.what[room.level]?.truth || []).map((w) => ({ id: w.id, text: w.text, touch: w.touch, heat: w.heat, seconds: w.seconds })),
      dare: (bank.what[room.level]?.dare || []).map((w) => ({ id: w.id, text: w.text, touch: w.touch, heat: w.heat, seconds: w.seconds })),
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
