import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getOdds, saveOdds, getPetSeconds, savePetSeconds } from '@/lib/settings';
import { PET_SECONDS_MIN, PET_SECONDS_MAX } from '@/lib/content';
import { listPool } from '@/lib/surprises';

// Admin-only: chicken-out odds, the hidden petted-animal rule, and the petted duration (= rule window).
export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  const [odds, petSeconds, pool] = await Promise.all([getOdds(), getPetSeconds(), listPool()]);
  // v6 pet-rule targets: groups first, then each pool animal. Legacy ids (e.g. 'kitten') stay valid on save.
  const targets = [
    { id: 'any-prey', label: 'Any prey' }, { id: 'any-predator', label: 'Any predator' }, { id: 'human', label: '🧍 The Human' },
    ...pool.map((a) => ({ id: a.id, label: `${a.emoji} ${a.name} (${a.role})` })),
  ];
  return json({ odds, petSeconds, petRange: [PET_SECONDS_MIN, PET_SECONDS_MAX], targets });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const body = await readJson(req, 8 * 1024);
  const odds = await saveOdds(body);
  const petSeconds = body.petSeconds === undefined ? await getPetSeconds() : await savePetSeconds(body.petSeconds);
  await audit(user, 'chicken_odds_update', 'global', { ...odds, petSeconds }, req);
  return json({ odds, petSeconds });
}, { mutation: true });
