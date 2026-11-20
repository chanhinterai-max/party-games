import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getSurpriseRate, saveSurpriseRate, SURPRISE_RATE_MIN, SURPRISE_RATE_MAX } from '@/lib/settings';

// Admin-only: chance (%) of a surprise card after each finished turn. Advanced users cannot change it.
export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  return json({ rate: await getSurpriseRate(), range: [SURPRISE_RATE_MIN, SURPRISE_RATE_MAX] });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const body = await readJson(req, 1024);
  const rate = await saveSurpriseRate(body.rate);
  await audit(user, 'surprise_rate_update', 'global', { rate }, req);
  return json({ rate });
}, { mutation: true });
