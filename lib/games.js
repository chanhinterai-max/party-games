import { q } from './db.js';

// v12b: the slot list lives in lib/gameSlots.js (client-safe: the phones read the 🎡 wheel flag from it)
export { GAME_SLOTS, wheelOn, wheelFrom } from './gameSlots.js';
import { GAME_SLOTS } from './gameSlots.js';

export async function gamesWithStatus() {
  const r = await q('SELECT id, enabled FROM games');
  const m = new Map(r.rows.map((x) => [x.id, x.enabled]));
  return GAME_SLOTS.map((g) => ({ ...g, enabled: m.has(g.id) ? m.get(g.id) : true }));
}

export async function isGameEnabled(id) {
  const r = await q('SELECT enabled FROM games WHERE id=$1', [id]);
  return r.rows.length ? r.rows[0].enabled : true;
}
