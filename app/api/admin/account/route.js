import { route, json, readJson, str, HttpError } from '@/lib/http';
import {
  requireRole, audit, verifyPassword, hashPassword, validatePassword, USERNAME_RE, publicUser, throttle, sha256, SESSION_COOKIE,
} from '@/lib/auth';
import { q } from '@/lib/db';

// Admin changes their own login username and/or password. The current password is always required.
// The current session stays valid; a password change signs out all *other* sessions.
export const POST = route(async (req) => {
  const admin = await requireRole(req, ['admin']);
  const t = await throttle(req, 'account');
  const body = await readJson(req, 4096);
  const ok = typeof body.currentPassword === 'string' && (await verifyPassword(admin.password_hash, body.currentPassword.slice(0, 256)));
  if (!ok) {
    await t.fail();
    throw new HttpError(403, 'Current password is incorrect');
  }
  const wantsName = body.newUsername != null && body.newUsername !== '';
  const wantsPw = body.newPassword != null && body.newPassword !== '';
  if (!wantsName && !wantsPw) throw new HttpError(400, 'Nothing to change');
  let row = admin;
  if (wantsName) {
    const newUsername = str(body.newUsername, { min: 3, max: 32, name: 'Username', pattern: USERNAME_RE });
    if (newUsername !== admin.username) {
      try {
        row = (await q('UPDATE users SET username=$2 WHERE id=$1 RETURNING *', [admin.id, newUsername])).rows[0];
      } catch (e) {
        if (e.code === '23505') throw new HttpError(409, 'That username is already taken');
        throw e;
      }
      await audit(row, 'admin_username_change', newUsername, { from: admin.username }, req);
    }
  }
  if (wantsPw) {
    const pw = validatePassword(body.newPassword);
    row = (await q('UPDATE users SET password_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1 RETURNING *', [admin.id, await hashPassword(pw)])).rows[0];
    const current = req.cookies.get(SESSION_COOKIE)?.value || '';
    await q('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [admin.id, sha256(current)]);
    await audit(row, 'admin_password_change', row.username, null, req);
  }
  return json({ user: publicUser(row) });
}, { mutation: true });
