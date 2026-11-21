import { route, json, readJson, HttpError } from '@/lib/http';
import { createRoom, validatePlayers, validateLevel, publicRoom } from '@/lib/game';
import { isGameEnabled } from '@/lib/games';
import { throttle, getUser, audit } from '@/lib/auth';
import { resolveRoomStar, loadPrevRoom } from '@/lib/partystar';

export const POST = route(async (req) => {
  const body = await readJson(req);
  const game = body.game === 'truth-or-dare' ? body.game : null;
  if (!game) throw new HttpError(400, 'Unknown game');
  if (!(await isGameEnabled(game))) throw new HttpError(403, 'This game is currently disabled');
  const { names: players, genders } = validatePlayers(body.players);
  const level = validateLevel(body.level);
  const t = await throttle(req, 'room'); // max 20 rooms / 15 min per IP
  await t.fail();
  // v11: a room created from an advanced user's landing page ("host") is tagged with its creator and gets the
  // VISIBLE Party Star from that login session (if one was set and a player name matches).
  const user = body.host === true ? await getUser(req) : null;
  const prevRow = body.host === true && body.prev ? await loadPrevRoom(user, body.prev) : null; // v12: Play again → wheel winner
  const { creator, star } = await resolveRoomStar(user, body.host === true, game, players, genders, prevRow);
  const { token, row } = await createRoom({ game, level, players, genders, creator, star });
  if (creator) await audit(user, 'room_create', row.code, { game, star: star ? star.player : null }, req);
  // v6: animals are public (room.animals) and shown openly on the shared screen.
  return json({ token, room: publicRoom(row, { lite: true }) }, 201);
}, { mutation: true });
