import crypto from 'node:crypto';

// SHARED Party Animal code (Truth or Dare + Animal Race). Server-side (crypto RNG).
const rnd = (n) => crypto.randomInt(n);
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// v6 "Party Animal": roles are split 1:1 at random (gender ignored). With an odd count one random player
// is the Human. Animals are unique within a game (numbered fallback only if the pool were too small).
export const HUMAN_ANIMAL = { id: 'human', role: 'human', name: 'Human', emoji: '🧍' };
// v14: `fixed` = { name, id } — the host's own player keeps their favourite pool animal (never the Human); the others
// are rebalanced around it so predators and prey stay 1:1.
export function assignAnimals(players, pool, fixed = null) {
  const fav = fixed && players.includes(fixed.name) ? pool.find((a) => a.id === fixed.id && (a.role === 'predator' || a.role === 'prey')) : null;
  const order = shuffle(fav ? players.filter((p) => p !== fixed.name) : players);
  const out = {};
  if (players.length % 2 === 1) out[order.shift()] = { ...HUMAN_ANIMAL };
  const half = (players.length - (players.length % 2)) / 2;
  const groups = { predator: [], prey: [] };
  if (fav) { out[fixed.name] = { id: fav.id, role: fav.role, name: fav.name, emoji: fav.emoji }; groups[fav.role].push(fixed.name); }
  for (const role of ['predator', 'prey']) while (groups[role].length < half) groups[role].push(order.shift());
  for (const role of ['predator', 'prey']) {
    const deck = shuffle(pool.filter((a) => a.role === role && a.id !== fav?.id));
    groups[role].filter((p) => !out[p]).forEach((p, i) => {
      const a = deck[i];
      out[p] = a ? { id: a.id, role, name: a.name, emoji: a.emoji }
        : { id: `${role}-${i + 1}`, role, name: `${role === 'prey' ? 'Bunny' : 'Wolf'} ${i + 1}`, emoji: role === 'prey' ? '🐰' : '🐺' };
    });
  }
  return out;
}

// Public animal map (shown openly on the shared screen). Handles v5 rooms (deck-based, no role/id).
export function publicAnimals(animals) {
  return Object.fromEntries(Object.entries(animals || {}).map(([p, a]) => [p, {
    id: a.id || `v5-${String(a.name).toLowerCase()}`, role: a.role || 'animal', name: a.name, emoji: a.emoji,
  }]));
}
