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
  const used = new Set(Object.values(animals).map((a) => a.id));
  const wildOf = (role) => {
    const free = pool.filter((a) => a.role === role && !used.has(a.id)).map((a) => a.emoji);
    return free.length ? free : pool.filter((a) => a.role === role).map((a) => a.emoji);
  };
  return json({ players: names, genders, animals, wild: { predator: wildOf('predator'), prey: wildOf('prey') } });
}, { mutation: true });
