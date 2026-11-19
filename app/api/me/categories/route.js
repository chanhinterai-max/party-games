import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { listCategories, createCategory } from '@/lib/categories';

export const GET = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  return json({ categories: await listCategories(user.id) });
});

export const POST = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const cat = await createCategory(user.id, await readJson(req, 64 * 1024));
  await audit(user, 'category_create', cat.name, null, req);
  return json({ category: cat }, 201);
}, { mutation: true });
