import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { getRoom, editorView, saveQueues } from '@/lib/game';
import { loadBank } from '@/lib/bank';

export const GET = route(async (req, { params }) => {
  await requireRole(req, ['admin', 'advanced']);
  const { code } = await params;
  const [room, bank] = await Promise.all([getRoom(code), loadBank()]);
  return json(editorView(room, bank));
});

export const PUT = route(async (req, { params }) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const { code } = await params;
  const body = await readJson(req, 256 * 1024);
  const { view, changes } = await saveQueues(code, body);
  await audit(user, 'queue_edit', view.room.code, { ...changes, note: typeof body.note === 'string' ? body.note.slice(0, 80) : undefined }, req);
  return json(view);
}, { mutation: true });
