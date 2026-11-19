import { route, json } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { q } from '@/lib/db';

export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  const r = await q('SELECT id, username, action, target, details, created_at FROM audit_log ORDER BY id DESC LIMIT 100');
  return json({ entries: r.rows });
});
