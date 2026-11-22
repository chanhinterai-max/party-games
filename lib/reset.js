// v14 PASSWORD RESET BY EMAIL CODE (advanced users only; admins use their own account panel / setup).
// Needs RESEND_API_KEY + RESET_FROM (Vercel env). Without them the feature reports "not set up" — never fakes success.
// Codes: 6 digits, SHA-256(user id + code) in password_resets, 15 min, one-time, max 5 tries, max 3 per account per
// 15 min; per-IP throttles. Responses never reveal whether an account or email exists.
import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { HttpError } from './http.js';
import { sha256, hashPassword, validatePassword, revokeSessions, audit, throttle } from './auth.js';

const CODE_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;
const MAX_CODES = 3;
export const resetEnabled = () => !!(process.env.RESEND_API_KEY && process.env.RESET_FROM);
const notSetUp = () => new HttpError(503, 'Password reset by email isn’t set up yet. Ask the admin to reset your password.');
const GENERIC = { ok: true, message: 'If an account matches, we sent a 6-digit code to its recovery email. It expires in 15 minutes.' };
const codeHash = (uid, code) => sha256(`reset:${uid}:${code}`);

async function findUser(id) {
  if (typeof id !== 'string') return null;
  const v = id.trim().toLowerCase().slice(0, 254);
  if (!v) return null;
  const r = await q(`SELECT u.id, u.username, p.email FROM users u JOIN user_profiles p ON p.user_id = u.id
    WHERE u.role = 'advanced' AND u.enabled AND p.email IS NOT NULL AND (lower(u.username) = $1 OR lower(p.email) = $1)`, [v]);
  return r.rows[0] || null;
}

async function sendMail(to, code) {
  const url = process.env.RESET_EMAIL_API_URL || 'https://api.resend.com/emails'; // override only for local tests
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESET_FROM, to: [to], subject: `Party Animal password code: ${code}`,
      text: `Your Party Animal password reset code is ${code}\n\nIt expires in 15 minutes and works once. If you didn't ask for it, ignore this email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`email provider ${r.status}`);
}

export async function requestReset(req, body) {
  if (!resetEnabled()) throw notSetUp();
  const t = await throttle(req, 'forgot'); await t.fail(); // every request counts (20 / 15 min / IP)
  const user = await findUser(body?.id);
  if (!user) return GENERIC;
  const recent = await q("SELECT count(*)::int AS n FROM password_resets WHERE user_id=$1 AND created_at > now() - interval '15 minutes'", [user.id]);
  if (recent.rows[0].n >= MAX_CODES) return GENERIC;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await q('INSERT INTO password_resets(user_id, code_hash, expires_at) VALUES ($1,$2,$3)', [user.id, codeHash(user.id, code), new Date(Date.now() + CODE_MS)]);
  try { await sendMail(user.email, code); await audit(null, 'reset_code_sent', user.username, null, req); }
  catch (e) { console.error('reset email failed', e?.message); await audit(null, 'reset_email_failed', user.username, null, req); }
  return GENERIC;
}

export async function confirmReset(req, body) {
  if (!resetEnabled()) throw notSetUp();
  const t = await throttle(req, 'reset');
  const bad = async () => { await t.fail(); return new HttpError(400, 'Invalid or expired code'); };
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const password = validatePassword(body?.password);
  const user = /^\d{6}$/.test(code) ? await findUser(body?.id) : null;
  if (!user) throw await bad();
  const r = await q(`SELECT id, code_hash, attempts FROM password_resets WHERE user_id=$1 AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1`, [user.id]);
  const row = r.rows[0];
  if (!row || row.attempts >= MAX_TRIES) throw await bad();
  const a = Buffer.from(row.code_hash), b = Buffer.from(codeHash(user.id, code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await q('UPDATE password_resets SET attempts = attempts + 1 WHERE id=$1', [row.id]);
    throw await bad();
  }
  const hash = await hashPassword(password);
  await tx(async (c) => {
    await c.query('UPDATE users SET password_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1', [user.id, hash]);
    await c.query('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [user.id]);
    await revokeSessions(user.id, c);
  });
  await audit(null, 'password_reset_by_email', user.username, null, req);
  return { ok: true };
}
