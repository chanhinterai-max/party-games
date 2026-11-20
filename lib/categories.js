import { q } from './db.js';
import { HttpError } from './http.js';
import { loadBank } from './bank.js';
import { DEFAULT_CATEGORY } from './seed.js';

const WHO_MODES = ['all', 'female', 'male', 'custom'];

export async function seedCategories(userId) {
  const u = await q('SELECT categories_seeded FROM users WHERE id=$1', [userId]);
  if (!u.rows.length || u.rows[0].categories_seeded) return;
  const bank = await loadBank();
  const ids = [];
  for (const lv of Object.keys(bank.what)) for (const w of bank.what[lv].dare) if (DEFAULT_CATEGORY.whatPattern.test(w.text)) ids.push(w.id);
  const where = DEFAULT_CATEGORY.where.filter((x) => bank.where.includes(x));
  const r = await q('UPDATE users SET categories_seeded=TRUE WHERE id=$1 AND categories_seeded=FALSE RETURNING id', [userId]);
  if (!r.rows.length) return; // another request seeded it
  await q('INSERT INTO user_categories(user_id,name,who_rule,what_ids,where_list) VALUES ($1,$2,$3,$4,$5)', [
    userId, DEFAULT_CATEGORY.name, JSON.stringify(DEFAULT_CATEGORY.who), JSON.stringify(ids), JSON.stringify(where),
  ]);
}

const pub = (r) => ({ id: String(r.id), name: r.name, who: r.who_rule, what: r.what_ids, where: r.where_list });

export async function listCategories(userId) {
  await seedCategories(userId);
  const r = await q('SELECT * FROM user_categories WHERE user_id=$1 ORDER BY id', [userId]);
  return r.rows.map(pub);
}

function validate(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 40 || /[<>]/.test(name)) throw new HttpError(400, 'Category name must be 1-40 characters');
  const who = body.who || {};
  if (!WHO_MODES.includes(who.mode)) throw new HttpError(400, 'Invalid WHO rule');
  let whoRule = { mode: who.mode };
  if (who.mode === 'custom') {
    if (!Array.isArray(who.values) || who.values.length > 60) throw new HttpError(400, 'Invalid WHO list');
    whoRule.values = who.values
      .filter((v) => v && ['player', 'generic', 'gender'].includes(v.kind) && typeof v.value === 'string' && v.value.length <= 40)
      .map((v) => ({ kind: v.kind, value: v.value }));
  }
  const what = Array.isArray(body.what) ? body.what.filter((x) => typeof x === 'string' && x.length <= 60).slice(0, 500) : null;
  const where = Array.isArray(body.where) ? body.where.filter((x) => typeof x === 'string' && x.length <= 40).slice(0, 100) : null;
  if (!what || !where) throw new HttpError(400, 'WHAT and WHERE lists are required');
  return { name, whoRule, what, where };
}

export async function createCategory(userId, body) {
  const v = validate(body);
  const n = await q('SELECT count(*) FROM user_categories WHERE user_id=$1', [userId]);
  if (Number(n.rows[0].count) >= 30) throw new HttpError(400, 'Maximum 30 categories');
  const r = await q('INSERT INTO user_categories(user_id,name,who_rule,what_ids,where_list) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
    userId, v.name, JSON.stringify(v.whoRule), JSON.stringify(v.what), JSON.stringify(v.where),
  ]);
  return pub(r.rows[0]);
}

export async function updateCategory(userId, id, body) {
  const v = validate(body);
  const r = await q(
    'UPDATE user_categories SET name=$3, who_rule=$4, what_ids=$5, where_list=$6, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId, v.name, JSON.stringify(v.whoRule), JSON.stringify(v.what), JSON.stringify(v.where)]
  );
  if (!r.rows.length) throw new HttpError(404, 'Category not found');
  return pub(r.rows[0]);
}

export async function deleteCategory(userId, id) {
  const r = await q('DELETE FROM user_categories WHERE id=$1 AND user_id=$2 RETURNING name', [id, userId]);
  if (!r.rows.length) throw new HttpError(404, 'Category not found');
  return r.rows[0].name;
}
