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
export function assignAnimals(players, pool) {
  const order = shuffle(players);
  const out = {};
  if (order.length % 2 === 1) out[order.shift()] = { ...HUMAN_ANIMAL };
  const half = order.length / 2;
  for (const [role, who] of [['predator', order.slice(0, half)], ['prey', order.slice(half)]]) {
    const deck = shuffle(pool.filter((a) => a.role === role));
    who.forEach((p, i) => {
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
