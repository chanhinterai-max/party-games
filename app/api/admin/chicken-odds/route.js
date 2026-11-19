import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getOdds, saveOdds, getPetSeconds, savePetSeconds } from '@/lib/settings';
import { ANIMALS, PET_SECONDS_MIN, PET_SECONDS_MAX } from '@/lib/content';

// Admin-only: chicken-out odds, the hidden petted-animal rule, and the petted duration (= rule window).
export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  const [odds, petSeconds] = await Promise.all([getOdds(), getPetSeconds()]);
  return json({
    odds, petSeconds, petRange: [PET_SECONDS_MIN, PET_SECONDS_MAX],
    animals: ANIMALS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji })),
  });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const body = await readJson(req, 8 * 1024);
  const odds = await saveOdds(body);
  const petSeconds = body.petSeconds === undefined ? await getPetSeconds() : await savePetSeconds(body.petSeconds);
  await audit(user, 'chicken_odds_update', 'global', { ...odds, petSeconds }, req);
  return json({ odds, petSeconds });
}, { mutation: true });
