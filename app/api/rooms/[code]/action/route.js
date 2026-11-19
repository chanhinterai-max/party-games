import { route, json, readJson } from '@/lib/http';
import { playerAction } from '@/lib/game';

export const POST = route(async (req, { params }) => {
  const { code } = await params;
  const body = await readJson(req);
  const room = await playerAction(code, req.headers.get('x-room-token'), body);
  return json({ room });
}, { mutation: true });
