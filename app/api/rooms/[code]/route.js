import { route, json } from '@/lib/http';
import { getRoom, publicRoom } from '@/lib/game';

export const GET = route(async (req, { params }) => {
  const { code } = await params;
  return json({ room: publicRoom(await getRoom(code)) });
});
