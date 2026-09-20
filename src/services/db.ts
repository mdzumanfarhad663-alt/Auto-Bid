/**
 * SQLite via Node's built-in node:sqlite. One file, synchronous API, no native dependency.
 * Everything user-scoped lives here: accounts, per-user config, projects, bids, stats.
 * The shared OpenAI key stays in auth.ts's encrypted store, which is global by design.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
export const DB_FILE = process.env.AUTOBID_DB_PATH || path.join(DATA_DIR, 'autobid.db');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      avatar_url TEXT,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      trial_started_at INTEGER NOT NULL,
      trial_extended_until INTEGER,
      extension_token_hash TEXT,
      extension_token_created_at INTEGER,
      extension_token_last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS users_token_idx ON users(extension_token_hash);

    CREATE TABLE IF NOT EXISTS user_config (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      config_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      submit_date INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS projects_user_date_idx ON projects(user_id, submit_date DESC);

    CREATE TABLE IF NOT EXISTS processed_project_ids (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS bids (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bid_key TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (user_id, bid_key)
    );
    CREATE INDEX IF NOT EXISTS bids_user_time_idx ON bids(user_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS bids_user_project_idx ON bids(user_id, project_id);

    CREATE TABLE IF NOT EXISTS stats (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stats_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMeta(key: string, value: string) {
  getDb().prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
