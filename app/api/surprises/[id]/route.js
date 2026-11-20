import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { surpriseUpdate, surpriseDelete, poolUpdate, poolDelete, humanUpdate, humanDelete } from '@/lib/surprises';

// id prefix picks the table: 'an-' animal pool, 'hu-' Human items, otherwise surprise items.
const kindOf = (id) => (String(id).startsWith('an-') ? 'pool' : String(id).startsWith('hu-') ? 'human' : 'surprise');

export const PATCH = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { id } = await params;
  const body = await readJson(req, 8 * 1024);
  const k = kindOf(id);
  if (k === 'pool') {
    const animal = await poolUpdate(id, body);
    await audit(user, 'pool_update', id, { name: animal.name }, req);
    return json({ animal });
  }
  if (k === 'human') {
    const human = await humanUpdate(id, body);
    await audit(user, 'human_update', id, null, req);
    return json({ human });
  }
  const surprise = await surpriseUpdate(id, body);
  await audit(user, 'surprise_update', id, null, req);
  return json({ surprise });
}, { mutation: true });

export const DELETE = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { id } = await params;
  const k = kindOf(id);
  const r = k === 'pool' ? await poolDelete(id) : k === 'human' ? await humanDelete(id) : await surpriseDelete(id);
  await audit(user, `${k}_delete`, id, null, req);
  return json(r);
}, { mutation: true });
