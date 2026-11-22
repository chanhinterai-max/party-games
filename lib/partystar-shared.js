// v11/v12 PARTY STAR (shared by server + browser).
// v12 split: the BLESSED player = the name match the advanced user set for their login session; they get the quiet
// luck perks (drinks, luck re-roll, race strides, never Human, gentler hunters/weather) for the whole room.
// The PARTY STAR = the visible role (⭐ badge + collapsed perk dropdown) with ALL perks incl. the pairing perks.
// Game 1 of a room/group: star = blessed. At the end of EVERY game (v12b: every room, blessed or not, any game whose
// lib/gameSlots.js slot keeps wheel on) a spinning wheel picks the next star.
export const STAR_LABEL_DEFAULT = 'Party Star';
export const STAR_MATCH_MAX = 20;

// Every perk: a toggle (…On) + its value(s). Defaults = the agreed v11 defaults.
export const STAR_DEFAULTS = {
  drinksOn: true, drinksWater: 80, drinksSparkling: 10, drinksAlcohol: 10, // ToD chicken-out drink odds for the star
  partnerOn: true, partnerPct: 90, partnerMinSec: 15,                    // ToD: star's questions → timed partner card, opposite sex
  surpriseOn: true, surprisePct: 90,                                     // surprise pair cards: opposite-sex partner for the star
  luckOn: true, luckPct: 70,                                             // luckier rolls: re-roll a bad roll away from the star
  raceTapOn: true, raceTapMult: 1.5,                                     // race: distance per tap ×
  raceNoHumanOn: true,                                                   // race: never the Human
  raceCrossOn: true, raceCrossPct: 80,                                   // race: opposite-sex same-role racer on a crossing track
  raceGentleOn: true, raceGentlePct: 15,                                 // race: hunters + weather this much gentler on the star's track
};

// Form fields (admin card + session popup). kind: 'pct' (0-100 int), 'int', 'mult'
export const STAR_FIELDS = [
  { on: 'drinksOn', title: '🐔 Chicken-out drinks', vals: [
    { key: 'drinksWater', label: '💧 Water %', min: 0, max: 100, step: 1 },
    { key: 'drinksSparkling', label: '🥂 Sparkling %', min: 0, max: 100, step: 1 },
    { key: 'drinksAlcohol', label: '🍺 Alcohol %', min: 0, max: 100, step: 1 }] },
  { on: 'partnerOn', title: '💕 Partner questions (Truth or Dare)', vals: [
    { key: 'partnerPct', label: 'Share of the star’s questions %', min: 0, max: 100, step: 1 },
    { key: 'partnerMinSec', label: 'Timer at least (s)', min: 5, max: 120, step: 1 }] },
  { on: 'surpriseOn', title: '✨ Surprise partner', vals: [{ key: 'surprisePct', label: 'Opposite-sex partner %', min: 0, max: 100, step: 1 }] },
  { on: 'luckOn', title: '🍀 Luckier rolls', vals: [{ key: 'luckPct', label: 'Re-roll a bad roll away %', min: 0, max: 100, step: 1 }] },
  { on: 'raceTapOn', title: '🏁 Bigger strides', vals: [{ key: 'raceTapMult', label: 'Distance per tap ×', min: 1, max: 2, step: 0.05 }] },
  { on: 'raceNoHumanOn', title: '🐾 Never the Human', vals: [] },
  { on: 'raceCrossOn', title: '💞 Crossing partner (race)', vals: [{ key: 'raceCrossPct', label: 'Opposite-sex same-role racer on a crossing track %', min: 0, max: 100, step: 1 }] },
  { on: 'raceGentleOn', title: '🌦️ Gentler hunters + weather', vals: [{ key: 'raceGentlePct', label: 'Gentler by %', min: 0, max: 50, step: 1 }] },
];

// Strict validation (throws Error(message)); returns a complete perk object.
export function cleanPerks(input, base = STAR_DEFAULTS) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const f of STAR_FIELDS) {
    out[f.on] = src[f.on] === undefined ? !!base[f.on] : src[f.on] === true;
    for (const v of f.vals) {
      const raw = src[v.key] === undefined || src[v.key] === '' ? base[v.key] : src[v.key];
      const n = Number(raw);
      const okStep = v.step >= 1 ? Number.isInteger(n) : Number.isFinite(n) && Math.abs(Math.round(n / v.step) * v.step - n) < 1e-9;
      if (!okStep || n < v.min || n > v.max) throw new Error(`${f.title}: ${v.label} must be ${v.min}-${v.max}`);
      out[v.key] = v.step >= 1 ? n : Math.round(n * 100) / 100;
    }
  }
  if (out.drinksWater + out.drinksSparkling + out.drinksAlcohol !== 100) throw new Error('Chicken-out drinks: the three shares must add up to 100%');
  return out;
}
export function cleanLabel(label) {
  const t = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : '';
  if (!t) return STAR_LABEL_DEFAULT;
  if (t.length > 24 || /[<>{}]/.test(t)) throw new Error('The role name must be 1-24 characters (no < > { })');
  return t;
}
export function cleanMatch(m) {
  const t = typeof m === 'string' ? m.trim().replace(/\s+/g, ' ') : '';
  if (t.length > STAR_MATCH_MAX || /[<>{}]/.test(t)) throw new Error(`The name match must be up to ${STAR_MATCH_MAX} characters`);
  return t;
}
// case-insensitive "contains"; the FIRST matching player (in the order they were entered) is the star
export function matchStar(players, match) {
  const m = String(match || '').trim().toLowerCase();
  if (!m) return null;
  return players.find((p) => p.toLowerCase().includes(m)) || null;
}
// Plain perk list for the announcement (only active perks for that game)
export function perkList(p, game) {
  const out = [];
  if (game === 'truth-or-dare') {
    if (p.drinksOn) out.push(`Chicken-out drinks: ${p.drinksWater}% water · ${p.drinksSparkling}% sparkling · ${p.drinksAlcohol}% alcohol`);
    if (p.partnerOn && p.partnerPct > 0) out.push(`${p.partnerPct}% of their questions: a ${p.partnerMinSec}+ second partner card with an opposite-sex player`);
    if (p.surpriseOn && p.surprisePct > 0) out.push(`Surprise pair cards: ${p.surprisePct}% chance their partner is opposite-sex`);
    if (p.luckOn && p.luckPct > 0) out.push(`Luckier rolls: ${p.luckPct}% chance an alcohol chicken-out drink is re-rolled to water or sparkling`);
  } else {
    if (p.raceTapOn && p.raceTapMult !== 1) out.push(`Bigger strides: ×${p.raceTapMult} distance per tap`);
    if (p.raceNoHumanOn) out.push('Never the Human');
    if (p.raceCrossOn && p.raceCrossPct > 0) out.push(`${p.raceCrossPct}% chance an opposite-sex racer of the same role is on a crossing track`);
    if (p.raceGentleOn && p.raceGentlePct > 0) out.push(`Hunters + weather ${p.raceGentlePct}% gentler on their track`);
    if (p.luckOn && p.luckPct > 0) out.push(`Luckier rolls: ${p.luckPct}% chance a hunter that spots them looks away`);
  }
  return out;
}
export const starPick = (label) => `⭐ ${label}’s pick`;

// v12: perks that need the visible Party Star (pairings). All other perks also apply to the blessed player.
export const PAIR_PERKS = ['partnerOn', 'surpriseOn', 'raceCrossOn'];

// v12 🎡 next-star wheel weights (admin, Star player tab). Slice size = weight / sum.
export const WHEEL_DEFAULTS = {
  todBase: 1, todDare1: 1.5, todDare2: 0.75, todDare3: 0.25, todChicken: 0.5, // ToD: base + most-dares bonus (rank 1-3); most chicken-outs × todChicken (smallest)
  raceBase: 1, race1: 1.5, race2: 0.75, race3: 0.25,                           // Race: base + podium bonus
  blessedPct: 25,                                                                 // blessed player's slice + %
};
export const WHEEL_FIELDS = [
  { key: 'todBase', label: '🎭 Truth or Dare: base slice per player', min: 0.1, max: 5, step: 0.05 },
  { key: 'todDare1', label: '🔥 Most dares: extra', min: 0, max: 5, step: 0.05 },
  { key: 'todDare2', label: '🔥 2nd most dares: extra', min: 0, max: 5, step: 0.05 },
  { key: 'todDare3', label: '🔥 3rd most dares: extra', min: 0, max: 5, step: 0.05 },
  { key: 'todChicken', label: '🐔 Most chicken-outs: slice × (always the smallest)', min: 0.05, max: 1, step: 0.05 },
  { key: 'raceBase', label: '🏁 Animal Race / ranking games: base slice per player', min: 0.1, max: 5, step: 0.05 },
  { key: 'race1', label: '🥇 Winner: extra', min: 0, max: 5, step: 0.05 },
  { key: 'race2', label: '🥈 2nd: extra', min: 0, max: 5, step: 0.05 },
  { key: 'race3', label: '🥉 3rd: extra', min: 0, max: 5, step: 0.05 },
  { key: 'blessedPct', label: '🍀 Blessed player: slice + %', min: 0, max: 100, step: 1 },
];
export function cleanWheel(input, base = WHEEL_DEFAULTS) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const v of WHEEL_FIELDS) {
    const raw = src[v.key] === undefined || src[v.key] === '' ? base[v.key] : src[v.key];
    const n = Number(raw);
    const okStep = v.step >= 1 ? Number.isInteger(n) : Number.isFinite(n) && Math.abs(Math.round(n / v.step) * v.step - n) < 1e-9;
    if (!okStep || n < v.min || n > v.max) throw new Error(`Wheel: ${v.label} must be ${v.min}-${v.max}`);
    out[v.key] = v.step >= 1 ? n : Math.round(n * 100) / 100;
  }
  return out;
}
// dense rank (1 = highest) among values > 0
const rankOf = (vals, x) => (x > 0 ? [...new Set(vals.filter((v) => v > 0))].sort((a, b) => b - a).indexOf(x) + 1 : 0);
// Wheel slices. ToD: input = stats.players {name: {daresDone, chicken}}; Race: input = finishing order (names, 1st first).
// tags (shown): 'dare1'|'dare2'|'dare3', 'chicken', 'place1'|'place2'|'place3'. The blessed bonus is not tagged.
export function wheelSlices(game, players, input, blessed, W = WHEEL_DEFAULTS) {
  const sl = players.map((p) => ({ player: p, weight: 0, tags: [] }));
  if (game === 'truth-or-dare') {
    const dares = players.map((p) => input?.[p]?.daresDone || 0), chick = players.map((p) => input?.[p]?.chicken || 0);
    const maxC = Math.max(0, ...chick);
    sl.forEach((s, i) => {
      s.weight = W.todBase; const r = rankOf(dares, dares[i]);
      if (r >= 1 && r <= 3) { s.weight += W[`todDare${r}`]; s.tags.push(`dare${r}`); }
      if (maxC > 0 && chick[i] === maxC) { s.weight *= W.todChicken; s.tags.push('chicken'); }
    });
  } else {
    const order = Array.isArray(input) ? input : [];
    sl.forEach((s) => { s.weight = W.raceBase; const r = order.indexOf(s.player) + 1; if (r >= 1 && r <= 3) { s.weight += W[`race${r}`]; s.tags.push(`place${r}`); } });
  }
  const b = sl.find((s) => s.player === blessed); if (b) b.weight *= 1 + W.blessedPct / 100;
  if (game === 'truth-or-dare') { // the most chicken-outs always get the smallest slice
    const others = sl.filter((s) => !s.tags.includes('chicken'));
    if (others.length) { const m = Math.min(...others.map((s) => s.weight)); for (const s of sl) if (s.tags.includes('chicken') && s.weight >= m) s.weight = m * 0.9; }
  }
  const sum = sl.reduce((a, s) => a + s.weight, 0) || 1;
  for (const s of sl) { s.weight = Math.round(s.weight * 1000) / 1000; s.pct = Math.round((s.weight / sum) * 1000) / 10; }
  return sl;
}
// u in [0,1) → the slice it lands on
export function pickSlice(slices, u) {
  const sum = slices.reduce((a, s) => a + s.weight, 0); let x = u * sum;
  for (const s of slices) { if (x < s.weight) return s.player; x -= s.weight; }
  return slices[slices.length - 1]?.player ?? null;
}
