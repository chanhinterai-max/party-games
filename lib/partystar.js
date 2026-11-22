// v11 PARTY STAR — server side: admin settings (label + default perks), the per-login-session setup and
// resolving the star when an advanced user creates a room. Everything resolved here is PUBLIC (shown to all).
import { q } from './db.js';
import { HttpError } from './http.js';
import { getSetting } from './settings.js';
import { randomInt, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { STAR_DEFAULTS, STAR_LABEL_DEFAULT, WHEEL_DEFAULTS, cleanPerks, cleanLabel, cleanMatch, cleanWheel, matchStar, perkList, wheelSlices, pickSlice } from './partystar-shared.js';
import { sha256 } from './auth.js';

const bad = (fn) => { try { return fn(); } catch (e) { throw new HttpError(400, e.message); } };

// settings key 'party_star' = { label, perks } (admin). Missing/invalid → defaults.
export async function getStarSettings(client) {
  const v = await getSetting('party_star', null, client);
  let label = STAR_LABEL_DEFAULT, perks = { ...STAR_DEFAULTS }, wheel = { ...WHEEL_DEFAULTS };
  try { label = cleanLabel(v?.label); } catch { /* default */ }
  try { perks = cleanPerks(v?.perks || {}); } catch { /* default */ }
  try { wheel = cleanWheel(v?.wheel || {}); } catch { /* default */ }
  return { label, perks, wheel };
}
export async function resetStarSettings() { await q("DELETE FROM settings WHERE key='party_star'"); return getStarSettings(); }
export async function saveStarSettings(body) {
  const label = bad(() => cleanLabel(body?.label));
  const perks = bad(() => cleanPerks(body?.perks || {}));
  const wheel = bad(() => cleanWheel(body?.wheel || {}));
  await q('INSERT INTO settings(key,value,updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()',
    ['party_star', JSON.stringify({ label, perks, wheel })]);
  return { label, perks, wheel };
}

// Per-login-session setup, stored on the session row (deleted at logout → popup again after the next login).
// NULL = the popup was not answered yet; { match: '' } = "no Party Star this session".
export async function setSessionStar(user, body) {
  if (!user?.session_hash) throw new HttpError(401, 'Login required');
  const { perks: base } = await getStarSettings();
  const match = bad(() => cleanMatch(body?.match));
  const perks = bad(() => cleanPerks(body?.perks || {}, base));
  const value = { match, perks, at: new Date().toISOString() };
  await q('UPDATE sessions SET party_star=$2 WHERE token_hash=$1', [user.session_hash, JSON.stringify(value)]);
  return value;
}

// v12: the previous room of the same group (Play again / Again), proven with its host token. Its wheel winner becomes
// the next Party Star. v12b: a room made WITHOUT a login (plain room) needs only its token; a host room also needs
// the creator's OWN login session.
export async function loadPrevRoom(user, prev) {
  if (!prev || typeof prev.code !== 'string' || typeof prev.token !== 'string') return null;
  const r = await q('SELECT code, game, players, genders, state, player_token_hash, creator_id, creator_session, party_star FROM rooms WHERE code=$1', [prev.code.toUpperCase().slice(0, 8)]);
  const row = r.rows[0];
  if (!row || row.player_token_hash !== sha256(prev.token)) return null;
  if (row.creator_id != null && (!user || String(row.creator_id) !== String(user.id) || row.creator_session !== user.session_hash)) return null;
  return row;
}

// ---- v12b signed WHEEL TICKETS: the "room" of stateless games (plain Animal Race, future ranking games) ----
// HMAC-SHA256 with a server-only key (WHEEL_SECRET, else derived from the database URL). Holds no secrets:
// { g: game, p: players, a?: dealt animals, w?: wheel winner, r: star round, t: issued ms }. 24 h lifetime.
const TICKET_MS = 24 * 3600 * 1000;
let KEY = null;
const key = () => (KEY ||= createHash('sha256').update('party-wheel:' + (process.env.WHEEL_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || 'local-dev')).digest());
const mac = (b) => createHmac('sha256', key()).update(b).digest('base64url');
export function signTicket(obj) {
  const b = Buffer.from(JSON.stringify({ ...obj, t: Date.now() })).toString('base64url');
  return `${b}.${mac(b)}`;
}
export function verifyTicket(t, game) {
  if (typeof t !== 'string' || t.length > 6000) return null;
  const [b, m] = t.split('.');
  if (!b || !m) return null;
  const want = Buffer.from(mac(b)), got = Buffer.from(m);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const o = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (!o || o.g !== game || !Array.isArray(o.p) || Date.now() - o.t > TICKET_MS) return null;
    return o;
  } catch { return null; }
}

// v12b: the previous game of this group, from either proof → { winner, round, players, animals }
//   prev = { code, token } (a room) or { ticket } (stateless). Anything invalid / another game → null.
export async function loadPrev(user, prev, game) {
  if (!prev) return null;
  if (typeof prev.ticket === 'string') {
    const o = verifyTicket(prev.ticket, game);
    return o ? { winner: o.w || null, round: o.r || 1, players: o.p, animals: o.a || null } : null;
  }
  const row = await loadPrevRoom(user, prev);
  if (!row || row.game !== game) return null;
  return { winner: row.state?.wheel?.winner || null, round: row.party_star?.round || 1, players: row.players, animals: row.state?.animals || null };
}

// Called when a game starts. v12: blessed = the host's session name match (host rooms from an advanced user's landing
// page only); star = the previous game's wheel winner (same group: must be playing), else the blessed player.
// v12b: works for EVERY room — no login → no blessed, but the wheel winner of the last game is still the star
// (admin default perks). Weights are snapshotted with the star.
export async function resolveRoomStar(user, host, game, players, genders, prev = null) {
  const isHost = !!host && !!user && ['advanced', 'admin'].includes(user.role);
  const creator = isHost ? { id: user.id, session: user.session_hash } : null;
  const cfg = isHost ? user.session_star : null;
  const blessed = cfg?.match ? matchStar(players, cfg.match) : null;
  const won = prev?.winner && players.includes(prev.winner) ? prev.winner : null;
  const player = won || blessed;
  if (!player) return { creator, star: null };
  const { label, perks: base, wheel } = await getStarSettings();
  let perks = base; if (cfg) { try { perks = cleanPerks(cfg.perks || {}, base); } catch { perks = base; } }
  const round = won ? (prev.round || 1) + 1 : 1;
  return { creator, star: { player, gender: genders?.[player] || null, blessed, label, perks, wheel, round, list: perkList(perks, game) } };
}
// what the screens get (public): the visible star only (the blessed player is not part of it)
export const publicStar = (s) => (s ? { player: s.player, label: s.label, perks: s.perks, list: s.list, round: s.round || 1 } : null);
// does this player get the quiet perks (drinks, luck, race strides, never Human, gentler)? star OR blessed
export const hasQuiet = (s, name) => !!s && (s.player === name || s.blessed === name);
// v12 🎡 spin: server-side pick (crypto), the phones only animate to the result. v12b: a game WITHOUT a star still
// spins (admin weights, no blessed bonus) → the winner is the next game's Party Star.
export async function spinWheel(star, game, players, input, client) {
  const S = star || await getStarSettings(client);
  const slices = wheelSlices(game, players, input, star?.blessed || null, S.wheel || WHEEL_DEFAULTS);
  return { slices, winner: pickSlice(slices, randomInt(1_000_000) / 1_000_000), label: S.label || STAR_LABEL_DEFAULT, at: new Date().toISOString() };
}
export const publicWheel = (w) => (w ? { slices: w.slices.map(({ player, pct, tags }) => ({ player, pct, tags })), winner: w.winner, label: w.label || STAR_LABEL_DEFAULT } : null);
