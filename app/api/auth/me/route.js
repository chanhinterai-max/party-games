import { route, json } from '@/lib/http';
import { getUser, publicUser } from '@/lib/auth';

export const GET = route(async (req) => {
  const u = await getUser(req);
  return json({ user: u ? publicUser(u) : null });
});
