import { route, json, readJson, HttpError } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { bankUpdate, bankDelete } from '@/lib/bank';

async function args(params) {
  const { kind, id } = await params;
  if (!['who', 'what', 'where'].includes(kind)) throw new HttpError(400, 'Unknown kind');
  const key = decodeURIComponent(id);
  if (!key || key.length > 80) throw new HttpError(400, 'Invalid id');
  return { kind, key };
}

export const PATCH = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin']);
  const { kind, key } = await args(params);
  const r = await bankUpdate(kind, key, await readJson(req, 16 * 1024));
  await audit(user, `bank_${kind}_update`, key, null, req);
  return json(r);
}, { mutation: true });

export const DELETE = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin']);
  const { kind, key } = await args(params);
  const r = await bankDelete(kind, key);
  await audit(user, `bank_${kind}_delete`, key, null, req);
  return json(r);
}, { mutation: true });
