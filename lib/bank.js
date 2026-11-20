import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './http.js';
import { LEVEL_IDS, hasPrivatePart } from './content.js';

// Question bank (WHO / WHAT / WHERE) lives in Postgres (seeded from lib/seed.js on first run).
// Small per-instance cache (BANK_TTL_MS) so the tap path (draw / next) does not re-read 3 tables;
// any bank write on this instance invalidates it immediately. Room queues are never cached.
const BANK_TTL_MS = 10000;
const cache = globalThis;
export function invalidateBank() { cache.__bankCache = null; }
export async function loadBank(client) {
  if (!client && cache.__bankCache && Date.now() - cache.__bankCache.at < BANK_TTL_MS) return cache.__bankCache.bank;
  const bank = await readBank(client);
  if (!client) cache.__bankCache = { at: Date.now(), bank };
  return bank;
}
export async function readBank(client) {
  const run = client ? (t, p) => client.query(t, p) : q;
  const [who, what, where, human] = await Promise.all([
    run('SELECT id, label, text FROM bank_who ORDER BY sort, id'),
    run('SELECT id, level, type, text, where_list, heat, seconds FROM bank_what ORDER BY level, type, sort, id'),
    run('SELECT name, heat FROM bank_where ORDER BY sort, name'),
    // v6: enabled Human Truth/Dare items ride along in the same cached read (no extra query on the tap path).
    run("SELECT id, kind, level, text, seconds FROM human_items WHERE enabled AND kind IN ('truth','dare') ORDER BY sort, id"),
  ]);
  const whereNames = where.rows.map((r) => r.name);
  const whereHeat = Object.fromEntries(where.rows.map((r) => [r.name, r.heat ?? 2]));
  const byLevel = Object.fromEntries(LEVEL_IDS.map((l) => [l, { truth: [], dare: [] }]));
  const whatById = new Map();
  for (const r of what.rows) {
    const touch = r.text.includes('{where}');
    const allowed = touch ? (Array.isArray(r.where_list) && r.where_list.length ? r.where_list.filter((x) => whereNames.includes(x)) : whereNames) : null;
    const item = {
      id: r.id, level: r.level, type: r.type, text: r.text, touch, where: touch ? (allowed.length ? allowed : whereNames) : null,
      heat: r.heat ?? 2, seconds: r.seconds ?? null,
    };
    if (byLevel[r.level]) byLevel[r.level][r.type].push(item);
    whatById.set(r.id, item);
  }
  const humanBy = Object.fromEntries(LEVEL_IDS.map((l) => [l, { truth: [], dare: [] }]));
  for (const h of human.rows) if (humanBy[h.level]) humanBy[h.level][h.kind].push({ id: h.id, text: h.text, seconds: h.seconds ?? null });
  return { who: who.rows, where: whereNames, whereHeat, what: byLevel, whatById, human: humanBy };
}

const s = (v, name, max) => {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`);
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t || t.length > max) throw new HttpError(400, `${name} must be 1-${max} characters`);
  if (/[<>]/.test(t)) throw new HttpError(400, `${name} contains invalid characters`);
  return t;
};

function checkWhatText(text) {
  if (hasPrivatePart(text)) throw new HttpError(400, 'Text mentions a private body part, which is not allowed');
  if (/\{(?!who\}|where\}|partner\})[^}]*\}/.test(text)) throw new HttpError(400, 'Only {who}, {where} and {partner} placeholders are allowed');
  return text;
}
function checkWhatRules(text, level, type) {
  if (type === 'truth' && text.includes('{where}')) throw new HttpError(400, 'Truth questions cannot use {where}');
  if (type === 'truth' && text.includes('{partner}')) throw new HttpError(400, '{partner} is only used in dares');
  if (text.includes('{where}') && level !== 'adult') throw new HttpError(400, '{where} is only used for Adult dares');
  if (type === 'dare' && !text.includes('{who}') && !text.includes('{partner}')) throw new HttpError(400, 'Dares must include {who} or {partner}');
}
export function parseHeat(v, def = 2) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 3) throw new HttpError(400, 'Heat must be 1, 2 or 3');
  return n;
}
export function parseSeconds(v) {
  if (v === undefined || v === null || v === '' || v === 0 || v === '0') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 3 || n > 300) throw new HttpError(400, 'Timer must be empty or 3-300 seconds');
  return n;
}

export async function bankCreate(kind, body) {
  if (kind === 'where') {
    const name = s(body.name, 'WHERE', 40).toLowerCase();
    if (hasPrivatePart(name)) throw new HttpError(400, 'Private body parts are not allowed in WHERE');
    const r = await q('INSERT INTO bank_where(name, heat, sort) VALUES ($1, $2, (SELECT coalesce(max(sort),0)+1 FROM bank_where)) ON CONFLICT DO NOTHING RETURNING name', [name, parseHeat(body.heat)]);
    if (!r.rows.length) throw new HttpError(409, 'That WHERE already exists');
    invalidateBank();
    return { name };
  }
  if (kind === 'who') {
    const label = s(body.label, 'Label', 40);
    const text = s(body.text, 'Text', 60);
    const id = `who-${crypto.randomBytes(4).toString('hex')}`;
    await q('INSERT INTO bank_who(id,label,text,sort) VALUES ($1,$2,$3,(SELECT coalesce(max(sort),0)+1 FROM bank_who))', [id, label, text]);
    invalidateBank();
    return { id };
  }
  if (kind === 'what') {
    if (!LEVEL_IDS.includes(body.level)) throw new HttpError(400, 'Invalid level');
    if (!['truth', 'dare'].includes(body.type)) throw new HttpError(400, 'Invalid type');
    const text = checkWhatText(s(body.text, 'Text', 220));
    checkWhatRules(text, body.level, body.type);
    const heat = parseHeat(body.heat), seconds = parseSeconds(body.seconds);
    const id = `${body.level}-${body.type}-${crypto.randomBytes(4).toString('hex')}`;
    await q(
      'INSERT INTO bank_what(id,level,type,text,heat,seconds,sort) VALUES ($1,$2,$3,$4,$5,$6,(SELECT coalesce(max(sort),0)+1 FROM bank_what WHERE level=$2 AND type=$3))',
      [id, body.level, body.type, text, heat, seconds]
    );
    invalidateBank();
    return { id };
  }
  throw new HttpError(400, 'Unknown kind');
}

export async function bankUpdate(kind, id, body) {
  if (kind === 'who') {
    const r = await q('UPDATE bank_who SET label=$2, text=$3, updated_at=now() WHERE id=$1 RETURNING id', [id, s(body.label, 'Label', 40), s(body.text, 'Text', 60)]);
    if (!r.rows.length) throw new HttpError(404, 'Not found');
    invalidateBank();
    return { id };
  }
  if (kind === 'what') {
    // Partial update: any of text / heat / seconds (missing fields keep their value).
    const cur = await q('SELECT level, type, text, heat, seconds FROM bank_what WHERE id=$1', [id]);
    if (!cur.rows.length) throw new HttpError(404, 'Not found');
    const { level, type } = cur.rows[0];
    const text = body.text === undefined ? cur.rows[0].text : checkWhatText(s(body.text, 'Text', 220));
    checkWhatRules(text, level, type);
    const heat = body.heat === undefined ? cur.rows[0].heat : parseHeat(body.heat);
    const seconds = body.seconds === undefined ? cur.rows[0].seconds : parseSeconds(body.seconds);
    await q('UPDATE bank_what SET text=$2, heat=$3, seconds=$4, updated_at=now() WHERE id=$1', [id, text, heat, seconds]);
    invalidateBank();
    return { id };
  }
  if (kind === 'where') {
    const name = body.name === undefined ? id : s(body.name, 'WHERE', 40).toLowerCase();
    if (hasPrivatePart(name)) throw new HttpError(400, 'Private body parts are not allowed in WHERE');
    const heatSql = body.heat === undefined ? 'heat' : String(parseHeat(body.heat));
    const r = await q(`UPDATE bank_where SET name=$2, heat=${heatSql} WHERE name=$1 RETURNING name`, [id, name]).catch((e) => {
      if (e.code === '23505') throw new HttpError(409, 'That WHERE already exists');
      throw e;
    });
    if (!r.rows.length) throw new HttpError(404, 'Not found');
    invalidateBank();
    return { name };
  }
  throw new HttpError(400, 'Unknown kind');
}

export async function bankDelete(kind, id) {
  const table = { who: ['bank_who', 'id'], what: ['bank_what', 'id'], where: ['bank_where', 'name'] }[kind];
  if (!table) throw new HttpError(400, 'Unknown kind');
  if (kind === 'what') {
    const cur = await q('SELECT level, type FROM bank_what WHERE id=$1', [id]);
    if (!cur.rows.length) throw new HttpError(404, 'Not found');
    const n = await q('SELECT count(*) FROM bank_what WHERE level=$1 AND type=$2', [cur.rows[0].level, cur.rows[0].type]);
    if (Number(n.rows[0].count) <= 1) throw new HttpError(400, 'Keep at least one question per level and type');
  }
  if (kind === 'where') {
    const n = await q('SELECT count(*) FROM bank_where');
    if (Number(n.rows[0].count) <= 1) throw new HttpError(400, 'Keep at least one WHERE');
  }
  const r = await q(`DELETE FROM ${table[0]} WHERE ${table[1]}=$1 RETURNING 1`, [id]);
  if (!r.rows.length) throw new HttpError(404, 'Not found');
  invalidateBank();
  return { ok: true };
}
