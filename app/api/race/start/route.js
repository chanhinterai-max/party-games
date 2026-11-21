import { route, json, readJson, HttpError } from '@/lib/http';
import { validatePlayers, createRaceRoom } from '@/lib/game';
import { isGameEnabled } from '@/lib/games';
import { listPool } from '@/lib/surprises';
import { assignAnimals, publicAnimals } from '@/lib/animals';
import { getRaceTune } from '@/lib/settings';
import { getUser, audit, throttle } from '@/lib/auth';
import { resolveRoomStar, publicStar } from '@/lib/partystar';

// ANIMAL RACE start: ONE request before the first race. Validates the players, checks the admin game switch, and
// deals Party Animal roles + unique pool animals (same rules as Truth or Dare). Everything after this runs on the
// phone; races make no server calls. v11: an advanced user starting from their landing page ("host") also gets a
// stored room (creator tag) and, if set for their login session, the VISIBLE Party Star (never the Human).
export const POST = route(async (req) => {
  const body = await readJson(req, 8 * 1024);
  if (!(await isGameEnabled('animal-race'))) throw new HttpError(403, 'This game is currently disabled');
  const { names, genders } = validatePlayers(body.players);
  const [pool, tune] = await Promise.all([listPool(), getRaceTune()]);
  const raw = assignAnimals(names, pool);
  const user = body.host === true ? await getUser(req) : null;
  const { creator, star } = await resolveRoomStar(user, body.host === true, 'animal-race', names, genders);
  if (star?.perks?.raceNoHumanOn && raw[star.player]?.role === 'human') { // swap the Human role with a random other player
    const others = names.filter((n) => n !== star.player);
    const o = others[Math.floor(Math.random() * others.length)];
    [raw[star.player], raw[o]] = [raw[o], raw[star.player]];
  }
  const animals = publicAnimals(raw);
  const speedOf = Object.fromEntries(pool.map((a) => [a.id, a.speed ?? 100]));
  for (const a of Object.values(animals)) a.speed = speedOf[a.id] ?? 100; // v8: per-animal speed (80-120 %)
  let room = null;
  if (creator) {
    const t = await throttle(req, 'room'); await t.fail();
    room = await createRaceRoom({ players: names, genders, animals: raw, creator, star });
    await audit(user, 'room_create', room.code, { game: 'animal-race', star: star ? star.player : null }, req);
  }
  // v9: no wild animals (hunters live on the phone); v10: tune = admin race overrides ({} = defaults)
  return json({ players: names, genders, animals, tune, star: publicStar(star), ...(room ? { room: { code: room.code, token: room.token } } : {}) });
}, { mutation: true });
