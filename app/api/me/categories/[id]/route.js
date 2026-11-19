import { route, json, readJson, HttpError } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { updateCategory, deleteCategory } from '@/lib/categories';

const checkId = (id) => { if (!/^\d{1,18}$/.test(id)) throw new HttpError(400, 'Invalid id'); return id; };

export const PATCH = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { id } = await params;
  const cat = await updateCategory(user.id, checkId(id), await readJson(req, 64 * 1024));
  await audit(user, 'category_update', cat.name, null, req);
  return json({ category: cat });
}, { mutation: true });

export const DELETE = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { id } = await params;
  const name = await deleteCategory(user.id, checkId(id));
  await audit(user, 'category_delete', name, null, req);
  return json({ ok: true });
}, { mutation: true });
