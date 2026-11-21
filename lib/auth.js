import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { q, tx } from './db.js';
import { HttpError, clientIp } from './http.js';

export const SESSION_COOKIE = 'pg_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_USER_FAILS = 5;
const USER_LOCK_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILS = 20;

// Argon2id (algorithm 2), OWASP-recommended parameters.
const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12 || pw.length > 128) {
    throw new HttpError(400, 'Password must be 12-128 characters');
  }
  return pw;
}

export const hashPassword = (pw) => argonHash(pw, ARGON);
export async function verifyPassword(stored, pw) {
  try { return await argonVerify(stored, pw); } catch { return false; }
}

// Dummy hash so unknown usernames take as long as known ones.
let dummyHash;
async function dummyVerify(pw) {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(dummyHash, pw);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function generatePassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  const out = [];
  while (out.length < len) {
    const b = crypto.randomBytes(1)[0];
    if (b < Math.floor(256 / chars.length) * chars.length) out.push(chars[b % chars.length]);
  }
  return out.join('');
}

export function cookieOptions(maxAgeSec) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_INSECURE !== '1',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec,
  };
}

async function ipThrottleCheck(key) {
  const r = await q('SELECT count, window_start FROM login_throttle WHERE key=$1', [key]);
  const row = r.rows[0];
  if (row && Date.now() - new Date(row.window_start).getTime() < IP_WINDOW_MS && row.count >= IP_MAX_FAILS) {
    throw new HttpError(429, 'Too many attempts. Try again later.');
  }
}
async function ipThrottleFail(key) {
  await q(
    `INSERT INTO login_throttle(key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN login_throttle.window_start < now() - ($2 || ' milliseconds')::interval THEN 1 ELSE login_throttle.count + 1 END,
       window_start = CASE WHEN login_throttle.window_start < now() - ($2 || ' milliseconds')::interval THEN now() ELSE login_throttle.window_start END`,
    [key, String(IP_WINDOW_MS)]
  );
}
export async function throttle(req, scope) {
  const key = `${scope}:${clientIp(req)}`;
  await ipThrottleCheck(key);
  return { fail: () => ipThrottleFail(key) };
}

export async function login(req, username, password) {
  const t = await throttle(req, 'login');
  const r = await q('SELECT * FROM users WHERE lower(username)=lower($1)', [username]);
  const user = r.rows[0];
  const generic = new HttpError(401, 'Invalid username or password');
  if (!user) {
    await dummyVerify(password);
    await t.fail();
    throw generic;
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await t.fail();
    throw new HttpError(429, 'Account temporarily locked. Try again later.');
  }
  const ok = await verifyPassword(user.password_hash, password);
  if (!ok || !user.enabled) {
    await t.fail();
    if (!ok) {
      const fails = user.failed_attempts + 1;
      await q(
        'UPDATE users SET failed_attempts=$2, locked_until=$3 WHERE id=$1',
        [user.id, fails >= MAX_USER_FAILS ? 0 : fails, fails >= MAX_USER_FAILS ? new Date(Date.now() + USER_LOCK_MS) : null]
      );
      await audit(null, 'login_failed', user.username, null, req);
    }
    throw generic;
  }
  await q('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [user.id]);
  const token = randomToken();
  await q('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [
    sha256(token), user.id, new Date(Date.now() + SESSION_TTL_MS),
  ]);
  await q('DELETE FROM sessions WHERE expires_at < now()');
  await audit(user, 'login', user.username, null, req);
  return { token, maxAge: SESSION_TTL_MS / 1000, user: publicUser(user) };
}

export function publicUser(u) {
  return { id: String(u.id), username: u.username, role: u.role, enabled: u.enabled, created_at: u.created_at };
}

export async function getUser(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const r = await q(
    `SELECT u.*, s.token_hash AS session_hash, s.party_star AS session_star FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > now() AND u.enabled = TRUE`,
    [sha256(token)]
  );
  return r.rows[0] || null;
}

export async function requireRole(req, roles) {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, 'Login required');
  if (!roles.includes(u.role)) throw new HttpError(403, 'Not allowed');
  return u;
}

export async function logout(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await q('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
}

export async function revokeSessions(userId, client) {
  await (client || { query: q }).query('DELETE FROM sessions WHERE user_id=$1', [userId]);
}

export async function audit(user, action, target, details, req) {
  try {
    await q('INSERT INTO audit_log(user_id, username, action, target, details, ip) VALUES ($1,$2,$3,$4,$5,$6)', [
      user?.id ?? null, user?.username ?? null, action, target ?? null, details ? JSON.stringify(details) : null,
      req ? clientIp(req) : null,
    ]);
  } catch (e) {
    console.error('audit failed', e?.message);
  }
}

export { tx };
