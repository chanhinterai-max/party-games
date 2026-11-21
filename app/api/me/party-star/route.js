import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getStarSettings, setSessionStar } from '@/lib/partystar';
import { STAR_FIELDS } from '@/lib/partystar-shared';

// v11: the advanced user's Party Star for THIS login session (popup once per session; cleared at logout).
export const GET = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { label, perks } = await getStarSettings();
  return json({ label, defaults: perks, fields: STAR_FIELDS, session: user.session_star || null });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const body = await readJson(req, 4096);
  const session = await setSessionStar(user, body);
  await audit(user, 'party_star_session', 'session', { match: session.match ? 'set' : 'none' }, req);
  return json({ session });
}, { mutation: true });
