import { route, json } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { liveRooms } from '@/lib/game';

export const GET = route(async (req) => {
  await requireRole(req, ['admin']);
  return json({ rooms: await liveRooms() });
});
