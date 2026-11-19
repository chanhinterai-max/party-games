import { q } from './db.js';
import { HttpError } from './http.js';
import { ANIMALS, DEFAULT_DRINKS, DEFAULT_ODDS, DRINK_CATEGORIES } from './content.js';

const CATS = DRINK_CATEGORIES.map((c) => c.id);

export async function getSetting(key, fallback, client) {
  const r = await (client || { query: q }).query('SELECT value FROM settings WHERE key=$1', [key]);
  return r.rows[0]?.value ?? fallback;
}
async function setSetting(key, value) {
  await q(
    'INSERT INTO settings(key,value,updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()',
    [key, JSON.stringify(value)]
  );
}

export const getDrinks = (client) => getSetting('drinks', DEFAULT_DRINKS, client);
export const getOdds = (client) => getSetting('odds', DEFAULT_ODDS, client);

export async function saveDrinks(body) {
  const out = {};
  for (const c of CATS) {
    const list = body[c];
    if (!Array.isArray(list)) throw new HttpError(400, `${c} options are required`);
    const clean = list.map((x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '')).filter(Boolean);
    if (clean.length < 1 || clean.length > 20) throw new HttpError(400, `${c} needs 1-20 options`);
    for (const x of clean) {
      if (x.length > 120 || /[<>]/.test(x)) throw new HttpError(400, `Drink options must be 1-120 characters`);
    }
    out[c] = clean;
  }
  await setSetting('drinks', out);
  return out;
}

function checkOdds(o, name) {
  if (!o || typeof o !== 'object') throw new HttpError(400, `${name} odds are required`);
  const v = {};
  for (const c of CATS) {
    const n = Number(o[c]);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new HttpError(400, `${name}: each percentage must be a whole number 0-100`);
    v[c] = n;
  }
  if (CATS.reduce((a, c) => a + v[c], 0) !== 100) throw new HttpError(400, `${name} percentages must add up to 100`);
  return v;
}

export async function saveOdds(body) {
  const normal = checkOdds(body.normal, 'Normal');
  const r = body.rule || {};
  if (typeof r.enabled !== 'boolean') throw new HttpError(400, 'Rule enabled must be true or false');
  if (!ANIMALS.some((a) => a.id === r.animal)) throw new HttpError(400, 'Unknown animal');
  const value = { normal, rule: { enabled: r.enabled, animal: r.animal, odds: checkOdds(r.odds, 'Petted-animal') } };
  await setSetting('odds', value);
  return value;
}

// Server-side pick: never trusts the client for the outcome, only for which animals are petted.
export function pickDrink(odds, drinks, petted, rnd) {
  const useRule = odds.rule?.enabled && Array.isArray(petted) && petted.includes(odds.rule.animal);
  const table = useRule ? odds.rule.odds : odds.normal;
  let roll = rnd(100);
  let cat = CATS[CATS.length - 1];
  for (const c of CATS) {
    if (roll < table[c]) { cat = c; break; }
    roll -= table[c];
  }
  const list = drinks[cat]?.length ? drinks[cat] : DEFAULT_DRINKS[cat];
  return { category: cat, text: list[rnd(list.length)] };
}
