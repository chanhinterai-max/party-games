import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './http.js';
import { LEVEL_IDS, hasPrivatePart } from './content.js';
import { parseSeconds, invalidateBank } from './bank.js';

// Surprise cards, the v6 predator/prey animal pool and Human items. GLOBAL content: edited by advanced users and admins.
export const SURPRISE_TYPES = ['match', 'virus', 'vote', 'whisper', 'chooser'];

const pubS = (r) => ({ id: r.id, type: r.type, level: r.level, text: r.text, enabled: r.enabled, seconds: r.seconds ?? null });

export async function listSurprises() {
  const r = await q('SELECT * FROM surprise_items ORDER BY type, level, sort, id');
  return r.rows.map(pubS);
}
// Enabled surprises for one level (used inside the action transaction only when a surprise is rolled).
export async function enabledSurprises(client, level) {
  const r = await client.query('SELECT id, type, text, seconds FROM surprise_items WHERE level=$1 AND enabled ORDER BY sort, id', [level]);
  return r.rows;
}

const str = (v, name, max) => {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`);
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t || t.length > max) throw new HttpError(400, `${name} must be 1-${max} characters`);
  if (/[<>]/.test(t)) throw new HttpError(400, `${name} contains invalid characters`);
  return t;
};
function checkSurpriseText(text, type) {
  if (hasPrivatePart(text)) throw new HttpError(400, 'Text mentions a private body part, which is not allowed');
  if (/\{(?!a\}|b\})[^}]*\}/.test(text)) throw new HttpError(400, 'Only {a} (predator) and {b} (prey) placeholders are allowed (Animal Match)');
  if (type === 'match' && !(text.includes('{a}') && text.includes('{b}'))) throw new HttpError(400, 'Animal Match text must include {a} (predator) and {b} (prey)');
  if (type !== 'match' && /\{[ab]\}/.test(text)) throw new HttpError(400, '{a} / {b} are only used in Animal Match');
  return text;
}

export async function surpriseCreate(body) {
  if (!SURPRISE_TYPES.includes(body.type)) throw new HttpError(400, 'Invalid surprise type');
  if (!LEVEL_IDS.includes(body.level)) throw new HttpError(400, 'Invalid level');
  const text = checkSurpriseText(str(body.text, 'Text', 220), body.type);
  const seconds = parseSeconds(body.seconds);
  const enabled = body.enabled === undefined ? true : !!body.enabled;
  const id = `sp-${body.type}-${crypto.randomBytes(4).toString('hex')}`;
  const r = await q(
    `INSERT INTO surprise_items(id,type,level,text,enabled,seconds,sort)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT coalesce(max(sort),0)+1 FROM surprise_items WHERE type=$2 AND level=$3)) RETURNING *`,
    [id, body.type, body.level, text, enabled, seconds]
  );
  return pubS(r.rows[0]);
}
export async function surpriseUpdate(id, body) {
  const cur = await q('SELECT * FROM surprise_items WHERE id=$1', [id]);
  if (!cur.rows.length) throw new HttpError(404, 'Not found');
  const c = cur.rows[0];
  const text = body.text === undefined ? c.text : checkSurpriseText(str(body.text, 'Text', 220), c.type);
  const seconds = body.seconds === undefined ? c.seconds : parseSeconds(body.seconds);
  const enabled = body.enabled === undefined ? c.enabled : !!body.enabled;
  const r = await q('UPDATE surprise_items SET text=$2, seconds=$3, enabled=$4, updated_at=now() WHERE id=$1 RETURNING *', [id, text, seconds, enabled]);
  return pubS(r.rows[0]);
}
export async function surpriseDelete(id) {
  const r = await q('DELETE FROM surprise_items WHERE id=$1 RETURNING id', [id]);
  if (!r.rows.length) throw new HttpError(404, 'Not found');
  return { ok: true };
}

function checkAnimal(body, partial) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = str(body.name, 'Animal name', 24);
    if (/[{}]/.test(out.name)) throw new HttpError(400, 'Animal name contains invalid characters');
  }
  if (!partial || body.emoji !== undefined) {
    out.emoji = str(body.emoji, 'Emoji', 16);
    if (/[A-Za-z0-9{}]/.test(out.emoji)) throw new HttpError(400, 'Emoji must be an emoji');
  }
  return out;
}
const dup = (e) => { if (e.code === '23505') throw new HttpError(409, 'That animal is already in the pool'); throw e; };

// ---------- v6 animal pool: predators + prey (GLOBAL). Each side keeps >= POOL_MIN (16 players = 8 per side).
export const ROLES = ['predator', 'prey'];
export const POOL_MIN = 8;
export const POOL_MAX = 60;
const pubP = (r) => ({ id: r.id, role: r.role, name: r.name, emoji: r.emoji, speed: r.speed_pct ?? 100 });
// v8 Animal Race speed (% of default): clamped server-side to 80-120.
export const SPEED_MIN = 80, SPEED_MAX = 120;
function checkSpeed(v) {
  const n = Number(v);
  if (v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(n)) throw new HttpError(400, 'Speed must be a number (80-120)');
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(n)));
}
export async function listPool(client) {
  const r = await (client || { query: q }).query('SELECT * FROM animal_pool ORDER BY role, sort, id');
  return r.rows.map(pubP);
}
export async function poolCreate(body) {
  if (!ROLES.includes(body.role)) throw new HttpError(400, 'Role must be predator or prey');
  const { name, emoji } = checkAnimal(body, false);
  const n = await q('SELECT count(*) FROM animal_pool WHERE role=$1', [body.role]);
  if (Number(n.rows[0].count) >= POOL_MAX) throw new HttpError(400, `Each side can hold up to ${POOL_MAX} animals`);
  // Deterministic id from the name (so re-adding a deleted animal restores the same id), random if taken.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taken = slug ? (await q('SELECT 1 FROM animal_pool WHERE id=$1', [`an-${slug}`])).rows.length : 1;
  const id = taken ? `an-${crypto.randomBytes(4).toString('hex')}` : `an-${slug}`;
  const r = await q(
    'INSERT INTO animal_pool(id,role,name,emoji,sort) VALUES ($1,$2,$3,$4,(SELECT coalesce(max(sort),0)+1 FROM animal_pool WHERE role=$2)) RETURNING *',
    [id, body.role, name, emoji]
  ).catch(dup);
  return pubP(r.rows[0]);
}
export async function poolUpdate(id, body) {
  const cur = await q('SELECT * FROM animal_pool WHERE id=$1', [id]);
  if (!cur.rows.length) throw new HttpError(404, 'Not found');
  const v = { name: cur.rows[0].name, emoji: cur.rows[0].emoji, speed: cur.rows[0].speed_pct ?? 100, ...checkAnimal(body, true) };
  if (body.speed !== undefined) v.speed = checkSpeed(body.speed);
  const r = await q('UPDATE animal_pool SET name=$2, emoji=$3, speed_pct=$4 WHERE id=$1 RETURNING *', [id, v.name, v.emoji, v.speed]).catch(dup);
  return pubP(r.rows[0]);
}
export async function poolDelete(id) {
  // Atomic minimum check: delete only if the side still has more than POOL_MIN animals.
  const r = await q(
    `DELETE FROM animal_pool p WHERE p.id=$1
       AND (SELECT count(*) FROM animal_pool x WHERE x.role=p.role) > $2 RETURNING id`, [id, POOL_MIN]);
  if (!r.rows.length) {
    const ex = await q('SELECT role FROM animal_pool WHERE id=$1', [id]);
    if (!ex.rows.length) throw new HttpError(404, 'Not found');
    throw new HttpError(400, `Keep at least ${POOL_MIN} ${ex.rows[0].role === 'prey' ? 'prey' : 'predators'} (16 players need 8 per side)`);
  }
  return { ok: true };
}

// ---------- v6 Human items (GLOBAL): surprises shown only when a game has a Human + Human Truth/Dare.
export const HUMAN_KINDS = ['surprise', 'truth', 'dare'];
const pubH = (r) => ({ id: r.id, kind: r.kind, level: r.level, text: r.text, enabled: r.enabled, seconds: r.seconds ?? null });
export async function listHuman() {
  const r = await q('SELECT * FROM human_items ORDER BY kind, level, sort, id');
  return r.rows.map(pubH);
}
function checkHumanText(text, kind) {
  if (hasPrivatePart(text)) throw new HttpError(400, 'Text mentions a private body part, which is not allowed');
  if (/\{(?!who\})[^}]*\}/.test(text)) throw new HttpError(400, 'Only the {who} placeholder is allowed');
  if (kind === 'surprise' && text.includes('{who}')) throw new HttpError(400, '{who} is only used in Human Truth/Dare items');
  return text;
}
export async function humanCreate(body) {
  if (!HUMAN_KINDS.includes(body.kind)) throw new HttpError(400, 'Kind must be surprise, truth or dare');
  if (!LEVEL_IDS.includes(body.level)) throw new HttpError(400, 'Invalid level');
  const text = checkHumanText(str(body.text, 'Text', 220), body.kind);
  const id = `hu-${body.kind}-${crypto.randomBytes(4).toString('hex')}`;
  const r = await q(
    `INSERT INTO human_items(id,kind,level,text,enabled,seconds,sort)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT coalesce(max(sort),0)+1 FROM human_items WHERE kind=$2 AND level=$3)) RETURNING *`,
    [id, body.kind, body.level, text, body.enabled === undefined ? true : !!body.enabled, parseSeconds(body.seconds)]
  );
  invalidateBank();
  return pubH(r.rows[0]);
}
export async function humanUpdate(id, body) {
  const cur = await q('SELECT * FROM human_items WHERE id=$1', [id]);
  if (!cur.rows.length) throw new HttpError(404, 'Not found');
  const c = cur.rows[0];
  const text = body.text === undefined ? c.text : checkHumanText(str(body.text, 'Text', 220), c.kind);
  const seconds = body.seconds === undefined ? c.seconds : parseSeconds(body.seconds);
  const enabled = body.enabled === undefined ? c.enabled : !!body.enabled;
  const r = await q('UPDATE human_items SET text=$2, seconds=$3, enabled=$4, updated_at=now() WHERE id=$1 RETURNING *', [id, text, seconds, enabled]);
  invalidateBank();
  return pubH(r.rows[0]);
}
export async function humanDelete(id) {
  const r = await q('DELETE FROM human_items WHERE id=$1 RETURNING id', [id]);
  if (!r.rows.length) throw new HttpError(404, 'Not found');
  invalidateBank();
  return { ok: true };
}
