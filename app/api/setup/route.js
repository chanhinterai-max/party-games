import crypto from 'node:crypto';
import { route, json, readJson, str, HttpError } from '@/lib/http';
import { throttle, hashPassword, validatePassword, USERNAME_RE, audit, sha256 } from '@/lib/auth';
import { tx } from '@/lib/db';

// One-time first-admin bootstrap. Requires ADMIN_SETUP_SECRET; refuses once any admin exists.
export const POST = route(async (req) => {
  const secret = process.env.ADMIN_SETUP_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(404, 'Setup is disabled');
  const t = await throttle(req, 'setup');
  const body = await readJson(req, 4096);
  const given = typeof body.secret === 'string' ? body.secret : '';
  const ok = crypto.timingSafeEqual(Buffer.from(sha256(given), 'hex'), Buffer.from(sha256(secret), 'hex'));
  if (!ok) {
    await t.fail();
    throw new HttpError(403, 'Invalid setup secret');
  }
  const username = str(body.username, { min: 3, max: 32, name: 'Username', pattern: USERNAME_RE });
  const password = validatePassword(body.password);
  const hash = await hashPassword(password);
  const user = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(777001)');
    const r = await c.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
    if (r.rows.length) throw new HttpError(409, 'An admin already exists. Setup is closed.');
    const ins = await c.query(
      "INSERT INTO users(username, password_hash, role) VALUES ($1,$2,'admin') RETURNING id, username, role",
      [username, hash]
    );
    return ins.rows[0];
  });
  await audit(user, 'admin_bootstrap', user.username, null, req);
  return json({ ok: true, username: user.username }, 201);
}, { mutation: true });
