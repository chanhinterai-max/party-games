import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './http.js';
import { LEVEL_IDS, hasPrivatePart } from './content.js';
import { parseSeconds } from './bank.js';

// Surprise cards + Animal Match decks. GLOBAL content: edited by advanced users and admins.
export const SURPRISE_TYPES = ['match', 'virus', 'vote', 'whisper', 'chooser'];
export const DECK_IDS = ['female', 'male'];

const pubS = (r) => ({ id: r.id, type: r.type, level: r.level, text: r.text, enabled: r.enabled, seconds: r.seconds ?? null });
const pubD = (r) => ({ id: r.id, deck: r.deck, name: r.name, emoji: r.emoji });

export async function listSurprises() {
  const r = await q('SELECT * FROM surprise_items ORDER BY type, level, sort, id');
  return r.rows.map(pubS);
}
// Enabled surprises for one level (used inside the action transaction only when a surprise is rolled).
export async function enabledSurprises(client, level) {
  const r = await client.query('SELECT id, type, text, seconds FROM surprise_items WHERE level=$1 AND enabled ORDER BY sort, id', [level]);
  return r.rows;
}
export async function listDecks(client) {
  const r = await (client || { query: q }).query('SELECT * FROM animal_deck ORDER BY deck, sort, id');
  return r.rows.map(pubD);
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
  if (/\{(?!a\}|b\})[^}]*\}/.test(text)) throw new HttpError(400, 'Only {a} and {b} placeholders are allowed (Animal Match)');
  if (type === 'match' && !(text.includes('{a}') && text.includes('{b}'))) throw new HttpError(400, 'Animal Match text must include {a} and {b}');
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
const dup = (e) => { if (e.code === '23505') throw new HttpError(409, 'That animal is already in this deck'); throw e; };
export async function deckCreate(body) {
  if (!DECK_IDS.includes(body.deck)) throw new HttpError(400, 'Deck must be female or male');
  const { name, emoji } = checkAnimal(body, false);
  const n = await q('SELECT count(*) FROM animal_deck WHERE deck=$1', [body.deck]);
  if (Number(n.rows[0].count) >= 60) throw new HttpError(400, 'A deck can hold up to 60 animals');
  const id = `deck-${body.deck}-${crypto.randomBytes(4).toString('hex')}`;
  const r = await q(
    'INSERT INTO animal_deck(id,deck,name,emoji,sort) VALUES ($1,$2,$3,$4,(SELECT coalesce(max(sort),0)+1 FROM animal_deck WHERE deck=$2)) RETURNING *',
    [id, body.deck, name, emoji]
  ).catch(dup);
  return pubD(r.rows[0]);
}
export async function deckUpdate(id, body) {
  const cur = await q('SELECT * FROM animal_deck WHERE id=$1', [id]);
  if (!cur.rows.length) throw new HttpError(404, 'Not found');
  const v = { name: cur.rows[0].name, emoji: cur.rows[0].emoji, ...checkAnimal(body, true) };
  const r = await q('UPDATE animal_deck SET name=$2, emoji=$3 WHERE id=$1 RETURNING *', [id, v.name, v.emoji]).catch(dup);
  return pubD(r.rows[0]);
}
export async function deckDelete(id) {
  const r = await q('DELETE FROM animal_deck WHERE id=$1 RETURNING id', [id]);
  if (!r.rows.length) throw new HttpError(404, 'Not found');
  return { ok: true };
}
