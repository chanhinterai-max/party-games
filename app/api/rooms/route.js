import { route, json, readJson, HttpError } from '@/lib/http';
import { createRoom, validatePlayers, validateLevel, publicRoom } from '@/lib/game';
import { isGameEnabled } from '@/lib/games';
import { throttle, getUser, audit } from '@/lib/auth';
import { resolveRoomStar, loadPrev } from '@/lib/partystar';
import { ownerOf, ownerFirst } from '@/lib/profile';

export const POST = route(async (req) => {
  const body = await readJson(req);
  const game = body.game === 'truth-or-dare' ? body.game : null;
  if (!game) throw new HttpError(400, 'Unknown game');
  if (!(await isGameEnabled(game))) throw new HttpError(403, 'This game is currently disabled');
  const { names, genders } = validatePlayers(body.players);
  const level = validateLevel(body.level);
  const t = await throttle(req, 'room'); // max 20 rooms / 15 min per IP
  await t.fail();
  // v11: a room created from an advanced user's landing page ("host") is tagged with its creator and gets the
  // VISIBLE Party Star from that login session (if one was set and a player name matches).
  const user = body.host === true ? await getUser(req) : null;
  // v12/v12b: Play again (ANY room: plain rooms by token, host rooms by token + same login) → the wheel winner is the star
  const prev = body.prev ? await loadPrev(user, body.prev, game) : null;
  // v14: the host's own player (their game name, linked by account id) goes first, keeps their favourite animal and
  // is always blessed (quiet perks). Only for the signed-in creator's own host room — never matched by name elsewhere.
  const owner = ownerOf(user, body.host === true, names);
  const players = ownerFirst(names, owner);
  const { creator, star } = await resolveRoomStar(user, body.host === true, game, players, genders, prev, owner);
  const fixed = owner?.fav && creator ? { name: owner.name, id: owner.fav } : null;
  const { token, row } = await createRoom({ game, level, players, genders, creator, star, fixed });
  if (creator) await audit(user, 'room_create', row.code, { game, star: star ? star.player : null }, req);
  // v6: animals are public (room.animals) and shown openly on the shared screen.
  return json({ token, room: publicRoom(row, { lite: true }) }, 201);
}, { mutation: true });
