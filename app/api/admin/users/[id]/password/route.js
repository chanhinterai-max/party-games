import { route, json, readJson, HttpError } from '@/lib/http';
import { requireRole, hashPassword, validatePassword, generatePassword, audit, revokeSessions } from '@/lib/auth';
import { q } from '@/lib/db';

export const POST = route(async (req, { params }) => {
  const admin = await requireRole(req, ['admin']);
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) throw new HttpError(400, 'Invalid id');
  const body = await readJson(req, 4096);
  const generated = !body.password;
  const password = generated ? generatePassword(16) : validatePassword(body.password);
  const r = await q(
    'UPDATE users SET password_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1 RETURNING username',
    [id, await hashPassword(password)]
  );
  if (!r.rows.length) throw new HttpError(404, 'User not found');
  await revokeSessions(id);
  await audit(admin, 'password_reset', r.rows[0].username, null, req);
  return json({ ok: true, ...(generated ? { password } : {}) });
}, { mutation: true });
