import { route, json, readJson, HttpError } from '@/lib/http';
import { isGameEnabled, wheelOn, wheelFrom } from '@/lib/games';
import { spinWheel, publicWheel, verifyTicket, signTicket } from '@/lib/partystar';

// v12b 🎡 END-OF-GAME WHEEL for STATELESS ranking games (plain Animal Race, any future game with no room).
// POST { game, order: [names, winner first], ticket? (from the game's start), players? (names, when no ticket) }
// → { wheel: {slices, winner, label}, ticket } — the server picks (crypto, admin weights; no login → no blessed
// bonus). The returned signed ticket carries the winner to the next start ({ prev: { ticket } }) = next Party Star.
// No DB writes; one settings read.
const cleanNames = (arr) => {
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 16) throw new HttpError(400, 'players must list 2-16 names');
  const names = arr.map((n) => (typeof n === 'string' ? n : n?.name)).map((n) => (typeof n === 'string' ? n.trim() : ''));
  if (names.some((n) => !n || n.length > 20 || /[<>{}]/.test(n)) || new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new HttpError(400, 'Invalid player names');
  return names;
};

export const POST = route(async (req) => {
  const body = await readJson(req, 12 * 1024);
  const game = typeof body.game === 'string' ? body.game : '';
  if (!wheelOn(game)) throw new HttpError(400, 'This game has no wheel');
  if (wheelFrom(game) !== 'ranking') throw new HttpError(400, 'This game spins its wheel in its room');
  if (!(await isGameEnabled(game))) throw new HttpError(403, 'This game is currently disabled');
  const tk = body.ticket ? verifyTicket(body.ticket, game) : null;
  if (body.ticket && !tk) throw new HttpError(400, 'Invalid or expired game ticket');
  const players = tk ? tk.p : cleanNames(body.players);
  const order = Array.isArray(body.order) ? body.order.filter((n) => players.includes(n)) : [];
  if (!order.length || new Set(order).size !== order.length) throw new HttpError(400, 'order must list the finishers');
  const w = await spinWheel(null, game, players, order);
  const ticket = signTicket({ g: game, p: players, ...(tk?.a ? { a: tk.a } : {}), w: w.winner, r: tk?.r || 0 });
  return json({ wheel: publicWheel(w), ticket });
}, { mutation: true });
