import { route, json, readJson, HttpError } from '@/lib/http';
import { validatePlayers, createRaceRoom } from '@/lib/game';
import { isGameEnabled } from '@/lib/games';
import { listPool } from '@/lib/surprises';
import { assignAnimals, publicAnimals } from '@/lib/animals';
import { getRaceTune } from '@/lib/settings';
import { getUser, audit, throttle } from '@/lib/auth';
import { resolveRoomStar, publicStar, loadPrev, hasQuiet, signTicket } from '@/lib/partystar';

// ANIMAL RACE start: ONE request before the first race. Validates the players, checks the admin game switch, and
// deals Party Animal roles + unique pool animals (same rules as Truth or Dare). Everything after this runs on the
// phone; races make no server calls. v11: an advanced user starting from their landing page ("host") also gets a
// stored room (creator tag) and, if set for their login session, the VISIBLE Party Star (never the Human).
export const POST = route(async (req) => {
  const body = await readJson(req, 8 * 1024);
  if (!(await isGameEnabled('animal-race'))) throw new HttpError(403, 'This game is currently disabled');
  const { names, genders } = validatePlayers(body.players);
  const [pool, tune] = await Promise.all([listPool(), getRaceTune()]);
  const user = body.host === true ? await getUser(req) : null;
  // v12 "Again": same group → keep the animals, the wheel winner becomes the Party Star. v12b: EVERY race — a hosted
  // room proves it with {code, token}, a plain (stateless) race with the signed {ticket} from /api/wheel.
  const prev = body.prev ? await loadPrev(user, body.prev, 'animal-race') : null;
  const same = prev?.animals && prev.players.length === names.length && names.every((n) => prev.players.includes(n) && prev.animals[n]);
  const raw = same ? structuredClone(prev.animals) : assignAnimals(names, pool);
  const { creator, star } = await resolveRoomStar(user, body.host === true, 'animal-race', names, genders, prev);
  if (star?.perks?.raceNoHumanOn) { // never the Human: star AND blessed (swap the Human role with a random other player)
    const hum = names.find((n) => raw[n]?.role === 'human');
    if (hum && hasQuiet(star, hum)) {
      const others = names.filter((n) => !hasQuiet(star, n));
      if (others.length) { const o = others[Math.floor(Math.random() * others.length)]; [raw[hum], raw[o]] = [raw[o], raw[hum]]; }
    }
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
  // v12: per-racer race perks (star + blessed): strides ×, gentler hunters/weather, hunter looks away
  const P = star?.perks; const boost = {};
  if (P) for (const n of names) if (hasQuiet(star, n)) boost[n] = { tap: P.raceTapOn ? P.raceTapMult : 1, gentle: P.raceGentleOn ? P.raceGentlePct / 100 : 0, luck: P.luckOn ? P.luckPct / 100 : 0 };
  // v12b: a plain race has no room → a signed ticket (players + dealt animals + star round) stands in for it at the
  // end-of-game wheel (/api/wheel) and the next "Again"
  const ticket = room ? null : signTicket({ g: 'animal-race', p: names, a: raw, r: star?.round || 0 });
  return json({ players: names, genders, animals, tune, star: publicStar(star), boost, ...(room ? { room: { code: room.code, token: room.token } } : { ticket }) });
}, { mutation: true });
