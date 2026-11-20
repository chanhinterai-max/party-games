import { route, json, readJson, HttpError } from '@/lib/http';
import { validatePlayers } from '@/lib/game';
import { isGameEnabled } from '@/lib/games';
import { listPool } from '@/lib/surprises';
import { assignAnimals, publicAnimals } from '@/lib/animals';

// ANIMAL RACE start: ONE request before the first race (no room, nothing stored). Validates the players, checks
// the admin game switch, and deals Party Animal roles + unique pool animals (same rules as Truth or Dare).
// Everything after this runs on the phone; races make no server calls.
export const POST = route(async (req) => {
  const body = await readJson(req, 8 * 1024);
  if (!(await isGameEnabled('animal-race'))) throw new HttpError(403, 'This game is currently disabled');
  const { names, genders } = validatePlayers(body.players);
  const pool = await listPool();
  const animals = publicAnimals(assignAnimals(names, pool));
  const speedOf = Object.fromEntries(pool.map((a) => [a.id, a.speed ?? 100]));
  for (const a of Object.values(animals)) a.speed = speedOf[a.id] ?? 100; // v8: per-animal speed (80-120 %)
  return json({ players: names, genders, animals }); // v9: no wild animals any more (hunters live on the phone)
}, { mutation: true });
