// v11 PARTY STAR — server side: admin settings (label + default perks), the per-login-session setup and
// resolving the star when an advanced user creates a room. Everything resolved here is PUBLIC (shown to all).
import { q } from './db.js';
import { HttpError } from './http.js';
import { getSetting } from './settings.js';
import { randomInt } from 'node:crypto';
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

// v12: the previous room of the same group (Play again / Again): only the creator's OWN room from the SAME login
// session, proven with its host token. Its wheel winner becomes the next Party Star.
export async function loadPrevRoom(user, prev) {
  if (!user || !prev || typeof prev.code !== 'string' || typeof prev.token !== 'string') return null;
  const r = await q('SELECT code, game, players, genders, state, player_token_hash, creator_id, creator_session, party_star FROM rooms WHERE code=$1', [prev.code.toUpperCase().slice(0, 8)]);
  const row = r.rows[0];
  if (!row || row.player_token_hash !== sha256(prev.token) || String(row.creator_id) !== String(user.id) || row.creator_session !== user.session_hash) return null;
  return row;
}

// Called when a room is created. Only for an advanced user/admin creating it from their landing page ("host"
// rooms) during a session whose popup set a name. The LIVE session is what getUser just read (logout = gone).
// v12: blessed = first player matching the session's name; star = the previous game's wheel winner (same group),
// else the blessed player. Weights are snapshotted with the room.
export async function resolveRoomStar(user, host, game, players, genders, prevRow = null) {
  if (!host || !user || !['advanced', 'admin'].includes(user.role)) return { creator: null, star: null };
  const creator = { id: user.id, session: user.session_hash };
  const cfg = user.session_star;
  if (!cfg?.match) return { creator, star: null };
  const blessed = matchStar(players, cfg.match);
  const won = prevRow?.state?.wheel?.winner;
  const player = won && players.includes(won) ? won : blessed;
  if (!player) return { creator, star: null };
  const { label, perks: base, wheel } = await getStarSettings();
  let perks; try { perks = cleanPerks(cfg.perks || {}, base); } catch { perks = base; }
  const round = won && player === won ? (prevRow.party_star?.round || 1) + 1 : 1;
  return { creator, star: { player, gender: genders?.[player] || null, blessed, label, perks, wheel, round, list: perkList(perks, game) } };
}
// what the screens get (public): the visible star only (the blessed player is not part of it)
export const publicStar = (s) => (s ? { player: s.player, label: s.label, perks: s.perks, list: s.list, round: s.round || 1 } : null);
// does this player get the quiet perks (drinks, luck, race strides, never Human, gentler)? star OR blessed
export const hasQuiet = (s, name) => !!s && (s.player === name || s.blessed === name);
// v12 🎡 spin: server-side pick (crypto), the phones only animate to the result
export function spinWheel(star, game, players, input) {
  const slices = wheelSlices(game, players, input, star.blessed, star.wheel || WHEEL_DEFAULTS);
  return { slices, winner: pickSlice(slices, randomInt(1_000_000) / 1_000_000), at: new Date().toISOString() };
}
export const publicWheel = (w) => (w ? { slices: w.slices.map(({ player, pct, tags }) => ({ player, pct, tags })), winner: w.winner } : null);
