import { route, json, readJson, HttpError } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { GAME_SLOTS, gamesWithStatus } from '@/lib/games';
import { q } from '@/lib/db';

export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  return json({ games: await gamesWithStatus() });
});

export const PATCH = route(async (req) => {
  const admin = await requireRole(req, ['admin']);
  const body = await readJson(req, 2048);
  if (!GAME_SLOTS.some((g) => g.id === body.id)) throw new HttpError(400, 'Unknown game');
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');
  await q(
    'INSERT INTO games(id, enabled, updated_at) VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET enabled=$2, updated_at=now()',
    [body.id, body.enabled]
  );
  await audit(admin, body.enabled ? 'game_enable' : 'game_disable', body.id, null, req);
  return json({ games: await gamesWithStatus() });
}, { mutation: true });
