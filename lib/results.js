// End-of-game stats + results. Pure functions (used server-side; safe to import anywhere).
//
// state.stats = {
//   players: { [name]: { truths, dares, done, chicken, chickenPass, drinks: { alcohol, sparkling, water } } },
//   pairs:   { "A|B": count }   // A < B; +1 each time one player's question named the other as WHO
// }

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function emptyStats(players) {
  return {
    players: Object.fromEntries(players.map((p) => [p, blank()])),
    pairs: {},
  };
}
function blank() {
  return { truths: 0, dares: 0, done: 0, chicken: 0, chickenPass: 0, drinks: { alcohol: 0, sparkling: 0, water: 0 } };
}
export function ensureStats(state, players) {
  if (!state.stats || !state.stats.players) state.stats = emptyStats(players);
  for (const p of players) if (!state.stats.players[p]) state.stats.players[p] = blank();
  if (!state.stats.pairs) state.stats.pairs = {};
  return state.stats;
}

// Leaders for one metric; ties return every tied player. Nobody wins with 0.
function leaders(players, stats, f) {
  let best = 0;
  let names = [];
  for (const p of players) {
    const v = f(stats.players[p] || blank());
    if (v > best) { best = v; names = [p]; } else if (v === best && v > 0) names.push(p);
  }
  return { names, count: best };
}

function bestPair(pairs, filter) {
  let best = 0;
  let list = [];
  for (const [k, n] of Object.entries(pairs)) {
    const [a, b] = k.split('|');
    if (!filter(a, b) || n <= 0) continue;
    if (n > best) { best = n; list = [[a, b]]; } else if (n === best) list.push([a, b]);
  }
  return best > 0 ? { pairs: list.slice(0, 3), count: best } : null;
}

// Light, flirty-bar tone; never mean. Assigned greedily so titles are unique where possible.
const TITLES = [
  { id: 'devil', title: 'Dare Devil', emoji: '😈', line: 'Said yes to everything. Dangerous energy.', score: (s) => s.dares * 2 - s.chicken },
  { id: 'book', title: 'Open Book', emoji: '📖', line: 'No secrets left. We know too much now.', score: (s) => s.truths * 2 - s.chicken },
  { id: 'flirt', title: 'Flirt Magnet', emoji: '😘', line: 'Somehow every question found its way to you.', score: (s, x) => x.mixed * 2 },
  { id: 'butterfly', title: 'Social Butterfly', emoji: '🦋', line: 'Tangled up in everyone’s questions, effortlessly.', score: (s, x) => x.inter },
  { id: 'chicken', title: 'Certified Chicken', emoji: '🐔', line: 'Bawk bawk… but make it fashionable.', score: (s) => s.chicken * 2 - s.done },
  { id: 'party', title: 'Life of the Party', emoji: '🍻', line: 'Clinked the most glasses. Absolute legend.', score: (s) => s.drinks.alcohol * 2 },
  { id: 'hydro', title: 'Hydration Hero', emoji: '💧', line: 'Tomorrow-you sends a thank-you note.', score: (s) => s.drinks.water * 2 },
  { id: 'bubbly', title: 'Bubbly Personality', emoji: '🥂', line: 'Fizzing with charm all night long.', score: (s) => s.drinks.sparkling * 2 },
  { id: 'smooth', title: 'Smooth Operator', emoji: '😎', line: 'Cool, calm, and didn’t flinch once.', score: (s) => (s.chicken === 0 ? s.done : 0) },
];
const FALLBACK = [
  { id: 'mystery', title: 'Mystery Guest', emoji: '🕶️', line: 'Barely played, still the most intriguing person here.' },
  { id: 'gem', title: 'Hidden Gem', emoji: '💎', line: 'Quietly the best vibe at the table.' },
  { id: 'wild', title: 'Wildcard', emoji: '🃏', line: 'Nobody knows what you’ll do next. Including you.' },
  { id: 'curator', title: 'Vibe Curator', emoji: '✨', line: 'Kept the energy just right.' },
  { id: 'charmer', title: 'Certified Charmer', emoji: '💫', line: 'Smiled through every round like a pro.' },
];

export function computeResults(room) {
  const players = room.players || [];
  const genders = room.genders || {};
  const stats = ensureStats(structuredClone(room.state || {}), players);
  const inter = Object.fromEntries(players.map((p) => [p, 0]));
  const mixed = Object.fromEntries(players.map((p) => [p, 0]));
  for (const [k, n] of Object.entries(stats.pairs)) {
    const [a, b] = k.split('|');
    if (a in inter) inter[a] += n;
    if (b in inter) inter[b] += n;
    if (genders[a] && genders[b] && genders[a] !== genders[b]) { if (a in mixed) mixed[a] += n; if (b in mixed) mixed[b] += n; }
  }

  const titles = {};
  const used = new Set();
  // Greedy: strongest claim first across all (title, player) combos.
  const claims = [];
  for (const t of TITLES) {
    const scores = players.map((p) => [p, t.score(stats.players[p], { inter: inter[p], mixed: mixed[p] })]);
    const max = Math.max(0, ...scores.map((x) => x[1]));
    // rel = 1 for the leader of that category, so leaders get "their" title first
    for (const [p, sc] of scores) if (sc > 0) claims.push({ t, p, sc, rel: sc / max });
  }
  claims.sort((x, y) => y.rel - x.rel || y.sc - x.sc || TITLES.indexOf(x.t) - TITLES.indexOf(y.t));
  for (const c of claims) {
    if (titles[c.p] || used.has(c.t.id)) continue;
    titles[c.p] = { title: c.t.title, emoji: c.t.emoji, line: c.t.line };
    used.add(c.t.id);
  }
  let fi = 0;
  for (const p of players) {
    if (titles[p]) continue;
    const f = FALLBACK[fi++ % FALLBACK.length];
    titles[p] = { title: f.title, emoji: f.emoji, line: f.line };
  }

  const males = players.filter((p) => genders[p] === 'male');
  const females = players.filter((p) => genders[p] === 'female');
  const g = (x) => genders[x];
  return {
    awards: {
      truths: leaders(players, stats, (s) => s.truths),
      dares: leaders(players, stats, (s) => s.dares),
      water: leaders(players, stats, (s) => s.drinks.water),
      alcohol: leaders(players, stats, (s) => s.drinks.alcohol),
      sparkling: leaders(players, stats, (s) => s.drinks.sparkling),
      chicken: leaders(players, stats, (s) => s.chicken),
    },
    titles,
    pairs: {
      couple: bestPair(stats.pairs, (a, b) => g(a) && g(b) && g(a) !== g(b)),
      buddies: males.length >= 2 ? bestPair(stats.pairs, (a, b) => g(a) === 'male' && g(b) === 'male') : null,
      sisters: females.length >= 2 ? bestPair(stats.pairs, (a, b) => g(a) === 'female' && g(b) === 'female') : null,
    },
    perPlayer: Object.fromEntries(players.map((p) => [p, { ...stats.players[p], interactions: inter[p] }])),
  };
}
