import { route, json, readJson, HttpError } from '@/lib/http';
import { createRoom, validatePlayers, validateLevel, publicRoom } from '@/lib/game';
import { isGameEnabled } from '@/lib/games';
import { throttle } from '@/lib/auth';

export const POST = route(async (req) => {
  const body = await readJson(req);
  const game = body.game === 'truth-or-dare' ? body.game : null;
  if (!game) throw new HttpError(400, 'Unknown game');
  if (!(await isGameEnabled(game))) throw new HttpError(403, 'This game is currently disabled');
  const { names: players, genders } = validatePlayers(body.players);
  const level = validateLevel(body.level);
  const t = await throttle(req, 'room'); // max 20 rooms / 15 min per IP
  await t.fail();
  const { token, row, secret } = await createRoom({ game, level, players, genders });
  // The secret animals go ONLY to the creating (host) device, for the private pass-the-phone reveal.
  return json({ token, room: publicRoom(row, { lite: true }), secret }, 201);
}, { mutation: true });
