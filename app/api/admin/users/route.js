import { route, json, readJson, str, HttpError } from '@/lib/http';
import { requireRole, hashPassword, validatePassword, generatePassword, USERNAME_RE, publicUser, audit } from '@/lib/auth';
import { q } from '@/lib/db';

export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  const r = await q('SELECT id, username, role, enabled, created_at, locked_until FROM users ORDER BY role, username');
  return json({ users: r.rows.map((u) => ({ ...publicUser(u), locked: !!(u.locked_until && new Date(u.locked_until) > new Date()) })) });
});

export const POST = route(async (req) => {
  const admin = await requireRole(req, ['admin']);
  const body = await readJson(req, 4096);
  const username = str(body.username, { min: 3, max: 32, name: 'Username', pattern: USERNAME_RE });
  const generated = !body.password;
  const password = generated ? generatePassword(16) : validatePassword(body.password);
  const hash = await hashPassword(password);
  let row;
  try {
    const r = await q(
      "INSERT INTO users(username, password_hash, role, created_by) VALUES ($1,$2,'advanced',$3) RETURNING *",
      [username, hash, admin.id]
    );
    row = r.rows[0];
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Username already exists');
    throw e;
  }
  await audit(admin, 'user_create', username, { role: 'advanced' }, req);
  // A generated password is returned once so the admin can hand it over; it is never stored in plaintext.
  return json({ user: publicUser(row), ...(generated ? { password } : {}) }, 201);
}, { mutation: true });
