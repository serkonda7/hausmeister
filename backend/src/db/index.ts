import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

const sqlite = new Database('./data.db')
sqlite.exec('PRAGMA journal_mode = WAL;')
sqlite.exec('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite)

// Auto-migrate: create tables if not exist (simple, no drizzle-kit migrate for MVP)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    institution TEXT,
    liquidity_tier TEXT NOT NULL DEFAULT 'instant',
    balance_cents INTEGER NOT NULL DEFAULT 0,
    unlock_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purpose TEXT,
    target_min_cents INTEGER,
    target_max_cents INTEGER,
    target_percent INTEGER,
    expected_return_bps INTEGER,
    risk_level INTEGER,
    volatility_bps INTEGER,
    horizon_months INTEGER,
    color TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS allocations (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    liquidity_override TEXT,
    unlock_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    direction TEXT NOT NULL,
    date TEXT NOT NULL,
    is_recurring INTEGER NOT NULL DEFAULT 0,
    frequency TEXT,
    recurring_until TEXT,
    pool_id TEXT REFERENCES pools(id) ON DELETE SET NULL,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  );
`)

export type DB = typeof db
