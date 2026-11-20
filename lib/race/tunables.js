// v10: the SMALL set of Animal Race numbers the admin can change (Admin → Game settings → Animal Race).
// Pure + shared: the server validates/stores ONLY overrides in settings key 'race'; /api/race/start sends them to
// the phone, which merges them over lib/race/config.js. Defaults below are IDENTICAL to config.js, so with nothing
// saved (or after "Reset to defaults") every race plays exactly as before.
export const RACE_TUNABLES = [
  { key: 'hunterFirstMs', label: 'First hunter wave after GO', unit: 'ms', min: 500, max: 6000, step: 100, def: 1500 },
  { key: 'hunterEveryMs', label: 'Time between hunter waves (Normal)', unit: 'ms', min: 3000, max: 15000, step: 500, def: 7000 },
  { key: 'adultHunterEveryMs', label: 'Time between hunter waves (Adult)', unit: 'ms', min: 3000, max: 15000, step: 500, def: 6000 },
  { key: 'dmgClose', label: 'Shot damage, close range', unit: 'hp of 100', min: 10, max: 100, step: 1, def: 55 },
  { key: 'dmgFar', label: 'Shot damage, edge of spotlight', unit: 'hp of 100', min: 5, max: 100, step: 1, def: 34 },
  { key: 'penaltyActionMs', label: 'Penalty: knocked-out animation', unit: 'ms', min: 300, max: 2000, step: 50, def: 900 },
  { key: 'penaltyRestMs', label: 'Penalty: rest before going back', unit: 'ms', min: 0, max: 4000, step: 100, def: 1000 },
  { key: 'penaltyReturnMs', label: 'Penalty: slide back to the start', unit: 'ms', min: 300, max: 2000, step: 50, def: 700 },
];
export const RACE_DEFAULTS = Object.fromEntries(RACE_TUNABLES.map((t) => [t.key, t.def]));

// Strict validation for saving (throws a message); returns ONLY the values that differ from the defaults.
export function validateTunables(body) {
  if (!body || typeof body !== 'object') throw new Error('Race settings are required');
  const out = {};
  for (const t of RACE_TUNABLES) {
    const raw = body[t.key] === undefined || body[t.key] === '' ? t.def : body[t.key];
    const n = Number(raw);
    if (!Number.isInteger(n) || n < t.min || n > t.max) throw new Error(`${t.label} must be a whole number ${t.min}-${t.max}`);
    if (n !== t.def) out[t.key] = n;
  }
  const close = out.dmgClose ?? RACE_DEFAULTS.dmgClose, far = out.dmgFar ?? RACE_DEFAULTS.dmgFar;
  if (far > close) throw new Error('Edge-of-spotlight damage cannot be higher than close-range damage');
  return out;
}
// Lenient read (stored value / network): unknown or out-of-range values fall back to the default.
export function cleanTunables(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const t of RACE_TUNABLES) { const n = Number(v[t.key]); if (Number.isInteger(n) && n >= t.min && n <= t.max && n !== t.def) out[t.key] = n; }
  if ((out.dmgFar ?? RACE_DEFAULTS.dmgFar) > (out.dmgClose ?? RACE_DEFAULTS.dmgClose)) { delete out.dmgFar; delete out.dmgClose; }
  return out;
}
// Merge overrides into a RACE config object (before modeCfg).
export function applyTunables(cfg, tune) {
  const t = cleanTunables(tune);
  if (!Object.keys(t).length) return cfg;
  return {
    ...cfg,
    hunterFirstMs: t.hunterFirstMs ?? cfg.hunterFirstMs,
    hunterEveryMs: t.hunterEveryMs ?? cfg.hunterEveryMs,
    dmgClose: t.dmgClose ?? cfg.dmgClose,
    dmgFar: t.dmgFar ?? cfg.dmgFar,
    penalty: { actionMs: t.penaltyActionMs ?? cfg.penalty.actionMs, restMs: t.penaltyRestMs ?? cfg.penalty.restMs, returnMs: t.penaltyReturnMs ?? cfg.penalty.returnMs },
    adult: { ...cfg.adult, hunterEveryMs: t.adultHunterEveryMs ?? cfg.adult.hunterEveryMs },
  };
}
