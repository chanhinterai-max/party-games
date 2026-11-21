// v11 PARTY STAR — a VISIBLE special-player role (shared by server + browser; no secrets here).
// A Party Star exists only in a room an advanced user created from their landing page while their login
// session had a Party Star name set. Everyone sees it: a start announcement with the active perks, a ⭐ badge,
// and a "⭐ <label>'s pick" tag on every card, pairing, drink or race event a perk produced.
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
