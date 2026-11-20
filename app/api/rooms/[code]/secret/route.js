import { route, json } from '@/lib/http';
import { roomSecret } from '@/lib/game';

// Host device only (x-room-token): the secret Animal Match animals, for re-showing after a reload.
export const GET = route(async (req, { params }) => {
  const { code } = await params;
  return json(await roomSecret(code, req.headers.get('x-room-token')));
});
