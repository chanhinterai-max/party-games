import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { loadBank, bankCreate } from '@/lib/bank';

export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  const b = await loadBank();
  return json({ who: b.who, what: b.what, where: b.where });
});

export const POST = route(async (req) => {
  const user = await requireRole(req, ['admin']);
  const body = await readJson(req, 16 * 1024);
  const r = await bankCreate(body.kind, body);
  await audit(user, `bank_${body.kind}_create`, r.id || r.name, null, req);
  return json(r, 201);
}, { mutation: true });
