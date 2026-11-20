import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getRaceTune, saveRaceTune } from '@/lib/settings';
import { RACE_TUNABLES } from '@/lib/race/tunables';

// v10 Admin-only: Animal Race tunables (hunter wave timing, shot damage, penalty). Stored as overrides only.
export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  return json({ tune: await getRaceTune(), fields: RACE_TUNABLES });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const body = await readJson(req, 2048);
  const tune = await saveRaceTune(body.tune ?? body);
  await audit(user, 'race_settings_update', 'global', { tune }, req);
  return json({ tune, fields: RACE_TUNABLES });
}, { mutation: true });
