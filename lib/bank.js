import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './http.js';
import { LEVEL_IDS, hasPrivatePart } from './content.js';

// Question bank (WHO / WHAT / WHERE) lives in Postgres (seeded from lib/content.js on first run).
export async function loadBank(client) {
  const run = client ? (t, p) => client.query(t, p) : q;
  const [who, what, where] = await Promise.all([
    run('SELECT id, label, text FROM bank_who ORDER BY sort, id'),
    run('SELECT id, level, type, text, where_list FROM bank_what ORDER BY level, type, sort, id'),
    run('SELECT name FROM bank_where ORDER BY sort, name'),
  ]);
  const whereNames = where.rows.map((r) => r.name);
  const byLevel = Object.fromEntries(LEVEL_IDS.map((l) => [l, { truth: [], dare: [] }]));
  const whatById = new Map();
  for (const r of what.rows) {
    const touch = r.text.includes('{where}');
    const allowed = touch ? (Array.isArray(r.where_list) && r.where_list.length ? r.where_list.filter((x) => whereNames.includes(x)) : whereNames) : null;
    const item = { id: r.id, level: r.level, type: r.type, text: r.text, touch, where: touch ? (allowed.length ? allowed : whereNames) : null };
    if (byLevel[r.level]) byLevel[r.level][r.type].push(item);
    whatById.set(r.id, item);
  }
  return { who: who.rows, where: whereNames, what: byLevel, whatById };
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
  if (/\{(?!who\}|where\})[^}]*\}/.test(text)) throw new HttpError(400, 'Only {who} and {where} placeholders are allowed');
  return text;
}

export async function bankCreate(kind, body) {
  if (kind === 'where') {
    const name = s(body.name, 'WHERE', 40).toLowerCase();
    if (hasPrivatePart(name)) throw new HttpError(400, 'Private body parts are not allowed in WHERE');
    const r = await q('INSERT INTO bank_where(name, sort) VALUES ($1, (SELECT coalesce(max(sort),0)+1 FROM bank_where)) ON CONFLICT DO NOTHING RETURNING name', [name]);
    if (!r.rows.length) throw new HttpError(409, 'That WHERE already exists');
    return { name };
  }
  if (kind === 'who') {
    const label = s(body.label, 'Label', 40);
    const text = s(body.text, 'Text', 60);
    const id = `who-${crypto.randomBytes(4).toString('hex')}`;
    await q('INSERT INTO bank_who(id,label,text,sort) VALUES ($1,$2,$3,(SELECT coalesce(max(sort),0)+1 FROM bank_who))', [id, label, text]);
    return { id };
  }
  if (kind === 'what') {
    if (!LEVEL_IDS.includes(body.level)) throw new HttpError(400, 'Invalid level');
    if (!['truth', 'dare'].includes(body.type)) throw new HttpError(400, 'Invalid type');
    const text = checkWhatText(s(body.text, 'Text', 220));
    if (body.type === 'truth' && text.includes('{where}')) throw new HttpError(400, 'Truth questions cannot use {where}');
    if (text.includes('{where}') && body.level !== 'adult') throw new HttpError(400, '{where} is only used for Adult dares');
    if (body.type === 'dare' && !text.includes('{who}')) throw new HttpError(400, 'Dares must include {who}');
    const id = `${body.level}-${body.type}-${crypto.randomBytes(4).toString('hex')}`;
    await q(
      'INSERT INTO bank_what(id,level,type,text,sort) VALUES ($1,$2,$3,$4,(SELECT coalesce(max(sort),0)+1 FROM bank_what WHERE level=$2 AND type=$3))',
      [id, body.level, body.type, text]
    );
    return { id };
  }
  throw new HttpError(400, 'Unknown kind');
}

export async function bankUpdate(kind, id, body) {
  if (kind === 'who') {
    const r = await q('UPDATE bank_who SET label=$2, text=$3, updated_at=now() WHERE id=$1 RETURNING id', [id, s(body.label, 'Label', 40), s(body.text, 'Text', 60)]);
    if (!r.rows.length) throw new HttpError(404, 'Not found');
    return { id };
  }
  if (kind === 'what') {
    const cur = await q('SELECT level, type FROM bank_what WHERE id=$1', [id]);
    if (!cur.rows.length) throw new HttpError(404, 'Not found');
    const { level, type } = cur.rows[0];
    const text = checkWhatText(s(body.text, 'Text', 220));
    if (type === 'truth' && text.includes('{where}')) throw new HttpError(400, 'Truth questions cannot use {where}');
    if (text.includes('{where}') && level !== 'adult') throw new HttpError(400, '{where} is only used for Adult dares');
    if (type === 'dare' && !text.includes('{who}')) throw new HttpError(400, 'Dares must include {who}');
    await q('UPDATE bank_what SET text=$2, updated_at=now() WHERE id=$1', [id, text]);
    return { id };
  }
  if (kind === 'where') {
    const name = s(body.name, 'WHERE', 40).toLowerCase();
    if (hasPrivatePart(name)) throw new HttpError(400, 'Private body parts are not allowed in WHERE');
    const r = await q('UPDATE bank_where SET name=$2 WHERE name=$1 RETURNING name', [id, name]).catch((e) => {
      if (e.code === '23505') throw new HttpError(409, 'That WHERE already exists');
      throw e;
    });
    if (!r.rows.length) throw new HttpError(404, 'Not found');
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
  return { ok: true };
}
