import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getDrinks, saveDrinks } from '@/lib/settings';

// Chicken-out drink options: global, editable by advanced players and admins.
export const GET = route(async (req) => {
  await requireRole(req, ['admin', 'advanced']);
  return json({ drinks: await getDrinks() });
});

export const PUT = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const drinks = await saveDrinks(await readJson(req, 32 * 1024));
  await audit(user, 'drinks_update', 'global', { counts: Object.fromEntries(Object.entries(drinks).map(([k, v]) => [k, v.length])) }, req);
  return json({ drinks });
}, { mutation: true });
