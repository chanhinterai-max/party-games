import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getProfile, saveProfile } from '@/lib/profile';

// v14 ADVANCED/ADMIN: my profile (game name, favourite animal, recovery email, picture URL) + the animal pool to pick from.
// The login username is read-only here (only the admin creates/renames usernames).
export const GET = route(async (req) => json(await getProfile(await requireRole(req, ['advanced', 'admin']))));
export const PUT = route(async (req) => {
  const user = await requireRole(req, ['advanced', 'admin']);
  const body = await readJson(req, 4096);
  const p = await saveProfile(user, body);
  await audit(user, 'profile_update', user.username, { gameName: p.gameName, favAnimal: p.favAnimal, email: !!p.email }, req);
  return json(p);
}, { mutation: true });
