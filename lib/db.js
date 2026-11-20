import pg from 'pg';
import { LEVEL_IDS, DEFAULT_DRINKS, DEFAULT_ODDS } from './content.js';
import { BANK, GENERIC_WHO, WHERE } from './seed.js';
import {
  ADULT_V5_TRUTHS, ADULT_V5_DARES, PARTNER_DARES, TWO_PLAYER_DARES, TIMED_EXTRA, SURPRISES, DECKS,
  guessHeat, guessSeconds, guessWhereHeat,
} from './seed-v5.js';
import { SURPRISES as SURPRISES_V5 } from './seed-v5.js';
import { POOL, poolId, MATCH_V6, MATCH_V5_REWRITE, HUMAN } from './seed-v6.js';

const globalForDb = globalThis;

function makePool() {
  // Neon via the Vercel Marketplace sets DATABASE_URL; accept the common alternates too.
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error('DATABASE_URL is not configured');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10000,
    ssl: local ? false : { rejectUnauthorized: true },
  });
}

export function pool() {
  if (!globalForDb.__pgPool) globalForDb.__pgPool = makePool();
  return globalForDb.__pgPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','advanced')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_throttle (
  key TEXT PRIMARY KEY,
  count INT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  player_token_hash TEXT NOT NULL,
  level TEXT NOT NULL,
  players JSONB NOT NULL,
  state JSONB NOT NULL,
  truth_queue JSONB NOT NULL,
  dare_queue JSONB NOT NULL,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rooms_updated_idx ON rooms(updated_at DESC);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  username TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

-- v3 migrations (idempotent)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS genders JSONB NOT NULL DEFAULT '{}'::jsonb;
-- v4 migrations (idempotent)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS closed_reason TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS rooms_status_activity_idx ON rooms(status, last_activity DESC);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
ALTER TABLE users ADD COLUMN IF NOT EXISTS categories_seeded BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS bank_who (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_what (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('truth','dare')),
  text TEXT NOT NULL,
  where_list JSONB,
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_what_lt_idx ON bank_what(level, type, sort);
CREATE TABLE IF NOT EXISTS bank_where (
  name TEXT PRIMARY KEY,
  sort INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_categories (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  who_rule JSONB NOT NULL,
  what_ids JSONB NOT NULL,
  where_list JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_categories_user_idx ON user_categories(user_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- v5 migrations (idempotent, additive only)
ALTER TABLE bank_what ADD COLUMN IF NOT EXISTS heat INT NOT NULL DEFAULT 2;
ALTER TABLE bank_what ADD COLUMN IF NOT EXISTS seconds INT;
ALTER TABLE bank_where ADD COLUMN IF NOT EXISTS heat INT NOT NULL DEFAULT 2;
CREATE TABLE IF NOT EXISTS surprise_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('match','virus','vote','whisper','chooser')),
  level TEXT NOT NULL,
  text TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  seconds INT,
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS surprise_items_lt_idx ON surprise_items(level, type, sort);
CREATE TABLE IF NOT EXISTS animal_deck (
  id TEXT PRIMARY KEY,
  deck TEXT NOT NULL CHECK (deck IN ('female','male')),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS animal_deck_name_idx ON animal_deck(deck, lower(name));
-- v6 migrations (idempotent, additive only). animal_deck (v5 female/male) is kept but no longer used.
CREATE TABLE IF NOT EXISTS animal_pool (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('predator','prey')),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS animal_pool_name_idx ON animal_pool(lower(name));
CREATE TABLE IF NOT EXISTS human_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('surprise','truth','dare')),
  level TEXT NOT NULL,
  text TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  seconds INT,
  sort INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS human_items_lk_idx ON human_items(level, kind, sort);
`;

// Seed the question bank and settings from lib/content.js the first time (never overwrites edits).
async function seed(c) {
  const w = await c.query('SELECT (SELECT count(*) FROM bank_who) AS who, (SELECT count(*) FROM bank_what) AS what, (SELECT count(*) FROM bank_where) AS wh');
  const n = w.rows[0];
  if (Number(n.who) === 0) {
    for (const [i, g] of GENERIC_WHO.entries()) {
      await c.query('INSERT INTO bank_who(id,label,text,sort) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [g.id, g.label, g.text, i]);
    }
  }
  if (Number(n.what) === 0) {
    for (const lv of LEVEL_IDS) for (const ty of ['truth', 'dare']) {
      for (const [i, x] of BANK[lv][ty].entries()) {
        const wl = x.touch && x.where && x.where !== WHERE ? JSON.stringify(x.where) : null;
        await c.query('INSERT INTO bank_what(id,level,type,text,where_list,sort) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [x.id, lv, ty, x.text, wl, i]);
      }
    }
  }
  if (Number(n.wh) === 0) {
    for (const [i, name] of WHERE.entries()) {
      await c.query('INSERT INTO bank_where(name,sort) VALUES ($1,$2) ON CONFLICT DO NOTHING', [name, i]);
    }
  }
  await c.query("INSERT INTO settings(key,value) VALUES ('drinks',$1) ON CONFLICT DO NOTHING", [JSON.stringify(DEFAULT_DRINKS)]);
  await c.query("INSERT INTO settings(key,value) VALUES ('odds',$1) ON CONFLICT DO NOTHING", [JSON.stringify(DEFAULT_ODDS)]);
  await seedV5(c);
  await seedV6(c);
}

// v6 "Party Animal": runs ONCE (marker 'seed_v6'). Inserts the predator/prey pool, Human items and new
// predator/prey Animal Match items if missing; rewrites v5 Animal Match seeds ONLY where the text is still
// exactly the v5 seed (user edits are left alone); moves the hidden pet rule from the default 'kitten'
// to 'any-prey' only if it is still the default 'kitten'.
async function seedV6(c) {
  const done = await c.query("SELECT 1 FROM settings WHERE key='seed_v6'");
  if (done.rows.length) return;
  const pool = [];
  for (const role of ['predator', 'prey']) POOL[role].forEach(([name, emoji], i) => pool.push({ id: poolId(name), role, name, emoji, sort: i }));
  await c.query(
    `INSERT INTO animal_pool(id, role, name, emoji, sort)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[]) ON CONFLICT DO NOTHING`,
    [pool.map((x) => x.id), pool.map((x) => x.role), pool.map((x) => x.name), pool.map((x) => x.emoji), pool.map((x) => x.sort)]
  );
  const hu = [];
  for (const [kind, byLevel] of Object.entries(HUMAN)) {
    for (const [level, list] of Object.entries(byLevel)) list.forEach((x, i) => hu.push({ id: `hu-${kind}-${level}-${i + 1}`, kind, level, text: x.t, seconds: x.s ?? null, sort: i }));
  }
  await c.query(
    `INSERT INTO human_items(id, kind, level, text, seconds, sort)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[]) ON CONFLICT (id) DO NOTHING`,
    [hu.map((x) => x.id), hu.map((x) => x.kind), hu.map((x) => x.level), hu.map((x) => x.text), hu.map((x) => x.seconds), hu.map((x) => x.sort)]
  );
  // Rewrite unchanged v5 Animal Match seeds (text still equal to the v5 seed text).
  for (const [level, list] of Object.entries(SURPRISES_V5.match)) {
    for (const [i, x] of list.entries()) {
      const id = `sp-match-${level}-${i + 1}`;
      const next = MATCH_V5_REWRITE[id];
      if (!next) continue;
      const nx = Object.values(MATCH_V6).flat().find((m) => m.t === next);
      await c.query('UPDATE surprise_items SET text=$2, seconds=$4, updated_at=now() WHERE id=$1 AND text=$3', [id, next, x.t, nx?.s ?? null]);
    }
  }
  // New v6 match items, skipping texts that already exist for that level (e.g. from the rewrite).
  const existing = new Set((await c.query("SELECT level || '|' || text AS k FROM surprise_items WHERE type='match'")).rows.map((r) => r.k));
  const sp = [];
  for (const [level, list] of Object.entries(MATCH_V6)) {
    list.forEach((x, i) => { if (!existing.has(`${level}|${x.t}`)) sp.push({ id: `sp-match-${level}-v6-${i + 1}`, level, text: x.t, seconds: x.s ?? null, sort: 100 + i }); });
  }
  if (sp.length) {
    await c.query(
      `INSERT INTO surprise_items(id, type, level, text, seconds, sort)
       SELECT unnest($1::text[]), 'match', unnest($2::text[]), unnest($3::text[]), unnest($4::int[]), unnest($5::int[]) ON CONFLICT (id) DO NOTHING`,
      [sp.map((x) => x.id), sp.map((x) => x.level), sp.map((x) => x.text), sp.map((x) => x.seconds), sp.map((x) => x.sort)]
    );
  }
  const odds = (await c.query("SELECT value FROM settings WHERE key='odds'")).rows[0]?.value;
  if (odds?.rule?.animal === 'kitten') {
    odds.rule.animal = 'any-prey';
    await c.query("UPDATE settings SET value=$1, updated_at=now() WHERE key='odds'", [JSON.stringify(odds)]);
  }
  await c.query("INSERT INTO settings(key,value) VALUES ('seed_v6',$1) ON CONFLICT DO NOTHING", [JSON.stringify({ at: new Date().toISOString() })]);
}

// v5: runs ONCE (marker row 'seed_v5'). Only fills the new columns with sensible guesses and inserts
// missing rows by id; never deletes or rewrites existing text, and deleted seeded items are not resurrected.
async function seedV5(c) {
  const done = await c.query("SELECT 1 FROM settings WHERE key='seed_v5'");
  if (done.rows.length) return;
  // 1) heat / seconds for existing WHAT rows, heat for WHERE rows (new columns only).
  const rows = (await c.query('SELECT id, level, text FROM bank_what')).rows;
  if (rows.length) {
    await c.query(
      `UPDATE bank_what b SET heat=v.h, seconds=COALESCE(b.seconds, v.s)
       FROM (SELECT unnest($1::text[]) AS id, unnest($2::int[]) AS h, unnest($3::int[]) AS s) v WHERE b.id=v.id`,
      [rows.map((r) => r.id), rows.map((r) => guessHeat(r.text, r.level)), rows.map((r) => guessSeconds(r.text))]
    );
  }
  const wh = (await c.query('SELECT name FROM bank_where')).rows;
  if (wh.length) {
    await c.query(
      'UPDATE bank_where b SET heat=v.h FROM (SELECT unnest($1::text[]) AS name, unnest($2::int[]) AS h) v WHERE b.name=v.name',
      [wh.map((r) => r.name), wh.map((r) => guessWhereHeat(r.name))]
    );
  }
  // 2) new WHAT items (40 adult + pick-a-partner + two-player + timed extras), inserted by id if missing.
  const items = [];
  const add = (level, type, prefix, list) => list.forEach((x, i) => items.push({ id: `${level}-${type}-${prefix}${i + 1}`, level, type, text: x.t, heat: x.h, seconds: x.s ?? null }));
  add('adult', 'truth', 'v5-', ADULT_V5_TRUTHS);
  add('adult', 'dare', 'v5-', ADULT_V5_DARES);
  for (const [lv, list] of Object.entries(PARTNER_DARES)) add(lv, 'dare', 'pick-', list);
  for (const [lv, list] of Object.entries(TWO_PLAYER_DARES)) add(lv, 'dare', 'duo-', list);
  for (const [lv, list] of Object.entries(TIMED_EXTRA)) add(lv, 'dare', 'timed-', list);
  const base = Number((await c.query('SELECT coalesce(max(sort),0) AS m FROM bank_what')).rows[0].m) + 1;
  await c.query(
    `INSERT INTO bank_what(id, level, type, text, heat, seconds, sort)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[]) ON CONFLICT (id) DO NOTHING`,
    [items.map((x) => x.id), items.map((x) => x.level), items.map((x) => x.type), items.map((x) => x.text),
      items.map((x) => x.heat), items.map((x) => x.seconds), items.map((_, i) => base + i)]
  );
  // 3) surprise content + animal decks.
  const sp = [];
  for (const [type, byLevel] of Object.entries(SURPRISES)) {
    for (const [level, list] of Object.entries(byLevel)) list.forEach((x, i) => sp.push({ id: `sp-${type}-${level}-${i + 1}`, type, level, text: x.t, seconds: x.s ?? null, sort: i }));
  }
  await c.query(
    `INSERT INTO surprise_items(id, type, level, text, seconds, sort)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[]) ON CONFLICT (id) DO NOTHING`,
    [sp.map((x) => x.id), sp.map((x) => x.type), sp.map((x) => x.level), sp.map((x) => x.text), sp.map((x) => x.seconds), sp.map((x) => x.sort)]
  );
  const dk = [];
  for (const [deck, list] of Object.entries(DECKS)) list.forEach(([name, emoji], i) => dk.push({ id: `deck-${deck}-${name.toLowerCase()}`, deck, name, emoji, sort: i }));
  await c.query(
    `INSERT INTO animal_deck(id, deck, name, emoji, sort)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[]) ON CONFLICT DO NOTHING`,
    [dk.map((x) => x.id), dk.map((x) => x.deck), dk.map((x) => x.name), dk.map((x) => x.emoji), dk.map((x) => x.sort)]
  );
  await c.query("INSERT INTO settings(key,value) VALUES ('surprise',$1) ON CONFLICT DO NOTHING", [JSON.stringify({ rate: 10 })]);
  await c.query("INSERT INTO settings(key,value) VALUES ('seed_v5',$1) ON CONFLICT DO NOTHING", [JSON.stringify({ at: new Date().toISOString() })]);
}

export function ensureSchema() {
  if (!globalForDb.__pgSchema) {
    globalForDb.__pgSchema = (async () => {
      // Transaction-scoped advisory lock: safe behind Neon's transaction-mode connection pooler.
      const c = await pool().connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(424242)');
        await c.query(SCHEMA);
        await seed(c);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    })().catch((e) => {
      globalForDb.__pgSchema = null;
      throw e;
    });
  }
  return globalForDb.__pgSchema;
}

export async function q(text, params = []) {
  await ensureSchema();
  return pool().query(text, params);
}

export async function tx(fn) {
  await ensureSchema();
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
