// Animal Race heats: at most `max` racers per heat, balanced sizes, predators and prey mixed where possible.
export function heatSizes(n, max = 4) {
  const h = Math.max(1, Math.ceil(n / max));
  return Array.from({ length: h }, (_, i) => Math.floor(n / h) + (i < n % h ? 1 : 0));
}
function shuffle(a, rng) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
// players: names; animals: { name: { role } }. Deals predators, then prey, then the Human round-robin so each heat
// gets a mix and the sizes come out balanced (5 = 3+2, 7 = 4+3, 16 = 4x4).
export function makeHeats(players, animals, max = 4, rng = Math.random) {
  const sizes = heatSizes(players.length, max);
  const h = sizes.length;
  const by = (r) => shuffle(players.filter((p) => (animals?.[p]?.role || 'animal') === r), rng);
  const others = players.filter((p) => !['predator', 'prey', 'human'].includes(animals?.[p]?.role));
  const order = [...by('predator'), ...by('prey'), ...by('human'), ...shuffle(others, rng)];
  const heats = Array.from({ length: h }, () => []);
  const start = Math.floor(rng() * h);
  order.forEach((p, i) => heats[(start + i) % h].push(p));
  return shuffle(heats.map((x) => shuffle(x, rng)), rng);
}
export const needsFinal = (heats) => heats.length > 1;
