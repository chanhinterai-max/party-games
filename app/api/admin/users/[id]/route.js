import { route, json, readJson, str, HttpError } from '@/lib/http';
import { requireRole, publicUser, audit, revokeSessions, USERNAME_RE } from '@/lib/auth';
import { q } from '@/lib/db';

export const PATCH = route(async (req, { params }) => {
  const admin = await requireRole(req, ['admin']);
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) throw new HttpError(400, 'Invalid id');
  const body = await readJson(req, 2048);
  // v14: admin renames an ADVANCED user's login username (only the admin can create/change usernames;
  // admins change their own from "My account")
  if (body.username !== undefined) {
    const username = str(body.username, { min: 3, max: 32, name: 'Username', pattern: USERNAME_RE });
    let r;
    try { r = await q("UPDATE users SET username=$2 WHERE id=$1 AND role='advanced' RETURNING *", [id, username]); }
    catch (e) { if (e.code === '23505') throw new HttpError(409, 'That username is already taken'); throw e; }
    if (!r.rows.length) throw new HttpError(404, 'Advanced user not found (admins rename themselves in My account)');
    await audit(admin, 'user_rename', username, { id }, req);
    return json({ user: publicUser(r.rows[0]) });
  }
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');
  if (String(admin.id) === id && !body.enabled) throw new HttpError(400, 'You cannot disable your own account');
  const r = await q('UPDATE users SET enabled=$2, failed_attempts=0, locked_until=NULL WHERE id=$1 RETURNING *', [id, body.enabled]);
  if (!r.rows.length) throw new HttpError(404, 'User not found');
  if (!body.enabled) await revokeSessions(id);
  await audit(admin, body.enabled ? 'user_enable' : 'user_disable', r.rows[0].username, null, req);
  return json({ user: publicUser(r.rows[0]) });
}, { mutation: true });

export const DELETE = route(async (req, { params }) => {
  const admin = await requireRole(req, ['admin']);
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) throw new HttpError(400, 'Invalid id');
  const r = await q("DELETE FROM users WHERE id=$1 AND role='advanced' RETURNING username", [id]);
  if (!r.rows.length) throw new HttpError(404, 'Advanced user not found (admins cannot be deleted)');
  // sessions and categories are removed by ON DELETE CASCADE
  await audit(admin, 'user_delete', r.rows[0].username, null, req);
  return json({ ok: true });
}, { mutation: true });
