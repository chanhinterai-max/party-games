import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getOdds, saveOdds } from '@/lib/settings';
import { ANIMALS } from '@/lib/content';

// Admin-only: chicken-out odds and the hidden petted-animal rule.
export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  return json({ odds: await getOdds(), animals: ANIMALS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji })) });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const odds = await saveOdds(await readJson(req, 8 * 1024));
  await audit(user, 'chicken_odds_update', 'global', odds, req);
  return json({ odds });
}, { mutation: true });
