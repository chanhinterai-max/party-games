import { route, json, HttpError } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { saveAvatar, deleteAvatar, AVATAR_MAX_BYTES } from '@/lib/profile';

// v14 profile picture: PUT the raw bytes (the phone already cropped it to a ~128 px square WebP/JPEG, target <= 15 KB).
// Server: <= 30 KB, type checked by magic bytes (WebP/JPEG only). DELETE removes it.
export const PUT = route(async (req) => {
  const user = await requireRole(req, ['advanced', 'admin']);
  const len = Number(req.headers.get('content-length') || 0);
  if (len > AVATAR_MAX_BYTES) throw new HttpError(413, `Picture too big (max ${AVATAR_MAX_BYTES / 1024} KB)`);
  const buf = Buffer.from(await req.arrayBuffer());
  const out = await saveAvatar(user, buf);
  await audit(user, 'avatar_update', user.username, { bytes: out.avatarBytes, type: out.type }, req);
  return json(out);
}, { mutation: true });
export const DELETE = route(async (req) => {
  const user = await requireRole(req, ['advanced', 'admin']);
  await deleteAvatar(user);
  await audit(user, 'avatar_delete', user.username, null, req);
  return json({ ok: true });
}, { mutation: true });
