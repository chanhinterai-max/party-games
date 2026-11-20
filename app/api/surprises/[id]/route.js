import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { surpriseUpdate, surpriseDelete, deckUpdate, deckDelete } from '@/lib/surprises';

const isDeck = (id) => String(id).startsWith('deck-');

export const PATCH = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { id } = await params;
  const body = await readJson(req, 8 * 1024);
  if (isDeck(id)) {
    const animal = await deckUpdate(id, body);
    await audit(user, 'deck_update', id, { name: animal.name }, req);
    return json({ animal });
  }
  const surprise = await surpriseUpdate(id, body);
  await audit(user, 'surprise_update', id, null, req);
  return json({ surprise });
}, { mutation: true });

export const DELETE = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { id } = await params;
  const r = isDeck(id) ? await deckDelete(id) : await surpriseDelete(id);
  await audit(user, isDeck(id) ? 'deck_delete' : 'surprise_delete', id, null, req);
  return json(r);
}, { mutation: true });
