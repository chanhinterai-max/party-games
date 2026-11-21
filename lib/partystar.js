// v11 PARTY STAR — server side: admin settings (label + default perks), the per-login-session setup and
// resolving the star when an advanced user creates a room. Everything resolved here is PUBLIC (shown to all).
import { q } from './db.js';
import { HttpError } from './http.js';
import { getSetting } from './settings.js';
import { STAR_DEFAULTS, STAR_LABEL_DEFAULT, cleanPerks, cleanLabel, cleanMatch, matchStar, perkList } from './partystar-shared.js';

const bad = (fn) => { try { return fn(); } catch (e) { throw new HttpError(400, e.message); } };

// settings key 'party_star' = { label, perks } (admin). Missing/invalid → defaults.
export async function getStarSettings(client) {
  const v = await getSetting('party_star', null, client);
  let label = STAR_LABEL_DEFAULT, perks = { ...STAR_DEFAULTS };
  try { label = cleanLabel(v?.label); } catch { /* default */ }
  try { perks = cleanPerks(v?.perks || {}); } catch { /* default */ }
  return { label, perks };
}
export async function resetStarSettings() { await q("DELETE FROM settings WHERE key='party_star'"); return getStarSettings(); }
export async function saveStarSettings(body) {
  const label = bad(() => cleanLabel(body?.label));
  const perks = bad(() => cleanPerks(body?.perks || {}));
  await q('INSERT INTO settings(key,value,updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()',
    ['party_star', JSON.stringify({ label, perks })]);
  return { label, perks };
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

// Called when a room is created. Only for an advanced user/admin creating it from their landing page ("host"
// rooms) during a session whose popup set a name. The LIVE session is what getUser just read (logout = gone).
export async function resolveRoomStar(user, host, game, players, genders) {
  if (!host || !user || !['advanced', 'admin'].includes(user.role)) return { creator: null, star: null };
  const creator = { id: user.id, session: user.session_hash };
  const cfg = user.session_star;
  if (!cfg?.match) return { creator, star: null };
  const player = matchStar(players, cfg.match);
  if (!player) return { creator, star: null };
  const { label, perks: base } = await getStarSettings();
  let perks; try { perks = cleanPerks(cfg.perks || {}, base); } catch { perks = base; }
  return { creator, star: { player, gender: genders?.[player] || null, label, perks, list: perkList(perks, game) } };
}
// what the screens get (public; the match text itself is not needed)
export const publicStar = (s) => (s ? { player: s.player, label: s.label, perks: s.perks, list: s.list } : null);
