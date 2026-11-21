import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getStarSettings, saveStarSettings, resetStarSettings } from '@/lib/partystar';
import { STAR_FIELDS, STAR_DEFAULTS, STAR_LABEL_DEFAULT } from '@/lib/partystar-shared';

// v11 Admin-only: the visible role name (default "Party Star") + default perks (toggle + value each).
export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  return json({ ...(await getStarSettings()), fields: STAR_FIELDS, defaults: STAR_DEFAULTS, labelDefault: STAR_LABEL_DEFAULT });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const body = await readJson(req, 4096);
  const saved = body?.reset === true ? await resetStarSettings() : await saveStarSettings(body); // reset = back to built-in defaults
  await audit(user, 'party_star_settings', 'global', saved, req);
  return json({ ...saved, fields: STAR_FIELDS, defaults: STAR_DEFAULTS, labelDefault: STAR_LABEL_DEFAULT });
}, { mutation: true });
