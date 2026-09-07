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
    opening_date TEXT,
    opening_balance_cents INTEGER,
    iban TEXT,
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
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT,
    color TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    payee TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    direction TEXT NOT NULL,
    transfer_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_account_date
    ON transactions(account_id, date);
  CREATE INDEX IF NOT EXISTS idx_transactions_transfer
    ON transactions(transfer_id);
`)

// Lightweight migration for pre-existing data.db files:
// ensure new account columns exist (legacy DBs have liquidity_tier/unlock_at,
// which are now unused but left in place).
function ensureColumn(table: string, column: string, ddl: string) {
	const cols = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{
		name: string
	}>
	if (!cols.some((c) => c.name === column)) {
		sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
	}
}
ensureColumn('accounts', 'opening_date', 'opening_date TEXT')
ensureColumn('accounts', 'opening_balance_cents', 'opening_balance_cents INTEGER')
ensureColumn('accounts', 'iban', 'iban TEXT')

export type DB = typeof db
