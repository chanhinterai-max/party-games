import { route, json } from '@/lib/http';
import { gamesWithStatus } from '@/lib/games';

export const GET = route(async () => {
  const games = (await gamesWithStatus()).filter((g) => g.enabled);
  return json({ games });
});
