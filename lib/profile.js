// v14 ADVANCED-USER PROFILE (server): game name, favourite pool animal, recovery email, small profile picture.
// The login username is NOT part of this (only the admin can create/rename usernames).
import { q } from './db.js';
import { HttpError } from './http.js';
import { randomToken } from './auth.js';
import { listPool } from './surprises.js';

export const GAME_NAME_MAX = 24;
export const AVATAR_MAX_BYTES = 30 * 1024; // hard server limit (the phone targets <= 15 KB)
const EMAIL_RE = /^[^\s@<>{}"']{1,64}@[^\s@<>{}"']{1,190}\.[a-z]{2,24}$/i;
export const avatarUrl = (key) => (key ? `/api/avatar/${key}` : null);

export function cleanGameName(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new HttpError(400, 'Game name must be text');
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length < 1 || s.length > GAME_NAME_MAX) throw new HttpError(400, `Game name must be 1-${GAME_NAME_MAX} characters`);
  if (/[<>{}]/.test(s)) throw new HttpError(400, 'Game name contains invalid characters');
  return s;
}
export function cleanEmail(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new HttpError(400, 'Email must be text');
  const s = v.trim().toLowerCase();
  if (s.length > 254 || !EMAIL_RE.test(s)) throw new HttpError(400, 'Enter a valid email address');
  return s;
}

export async function getProfile(user) {
  const r = await q('SELECT game_name, fav_animal, email, avatar_key, octet_length(avatar) AS avatar_bytes FROM user_profiles WHERE user_id=$1', [user.id]);
  const p = r.rows[0] || {};
  const pool = (await listPool()).map(({ id, name, emoji, role }) => ({ id, name, emoji, role }));
  return {
    username: user.username, role: user.role,
    gameName: p.game_name || null, favAnimal: p.fav_animal || null, email: p.email || null,
    avatar: avatarUrl(p.avatar_key), avatarBytes: p.avatar_bytes ? Number(p.avatar_bytes) : 0, pool,
  };
}

export async function saveProfile(user, body) {
  const gameName = cleanGameName(body?.gameName);
  const email = cleanEmail(body?.email);
  let fav = body?.favAnimal == null || body.favAnimal === '' ? null : String(body.favAnimal);
  if (fav && !(await listPool()).some((a) => a.id === fav)) throw new HttpError(400, 'Pick an animal from the pool');
  try {
    await q(`INSERT INTO user_profiles(user_id, game_name, fav_animal, email, updated_at) VALUES ($1,$2,$3,$4,now())
             ON CONFLICT (user_id) DO UPDATE SET game_name=$2, fav_animal=$3, email=$4, updated_at=now()`, [user.id, gameName, fav, email]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'That email is already used by another account');
    throw e;
  }
  return getProfile(user);
}

// Picture: only WebP or JPEG (checked by magic bytes, not the header the phone sent), <= 30 KB.
export function sniffImage(buf) {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}
export async function saveAvatar(user, buf) {
  if (!buf?.length) throw new HttpError(400, 'No picture');
  if (buf.length > AVATAR_MAX_BYTES) throw new HttpError(413, `Picture too big (max ${AVATAR_MAX_BYTES / 1024} KB)`);
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'Only WebP or JPEG pictures');
  const key = randomToken(12); // new key = new URL → caches can keep the old one forever
  await q(`INSERT INTO user_profiles(user_id, avatar, avatar_type, avatar_key, updated_at) VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (user_id) DO UPDATE SET avatar=$2, avatar_type=$3, avatar_key=$4, updated_at=now()`, [user.id, buf, type, key]);
  return { avatar: avatarUrl(key), avatarBytes: buf.length, type };
}
export async function deleteAvatar(user) {
  await q('UPDATE user_profiles SET avatar=NULL, avatar_type=NULL, avatar_key=NULL, updated_at=now() WHERE user_id=$1', [user.id]);
}
export async function avatarByKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(key)) return null;
  const r = await q('SELECT avatar, avatar_type FROM user_profiles WHERE avatar_key=$1 AND avatar IS NOT NULL', [key]);
  return r.rows[0] || null;
}

// v14: the host's OWN player in a room they create: their game name (must be in the list; moved to the front) with
// their favourite animal and picture. Linked by account id server-side, never by name across rooms.
export function ownerOf(user, host, names) {
  if (!host || !user || !['advanced', 'admin'].includes(user.role) || !user.game_name) return null;
  const want = user.game_name.toLowerCase();
  const name = names.find((n) => n.toLowerCase() === want);
  return name ? { name, uid: String(user.id), fav: user.fav_animal || null, pic: avatarUrl(user.avatar_key) } : null;
}
// put the owner first (players + their genders keep their pairing)
export const ownerFirst = (names, owner) => (owner ? [owner.name, ...names.filter((n) => n !== owner.name)] : names);
