import pg from 'pg';
import { BANK, GENERIC_WHO, WHERE, LEVEL_IDS, DEFAULT_DRINKS, DEFAULT_ODDS } from './content.js';

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
