import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS } from "@/lib/server/config";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "fmarket.sqlite");

type GlobalWithDb = typeof globalThis & {
  __fmarketDb?: Database.Database;
};

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nav REAL NOT NULL DEFAULT 0,
      company TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL,
      annualReturnEst REAL NOT NULL DEFAULT 0,
      productId INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      fundCode TEXT NOT NULL,
      amount REAL NOT NULL,
      ccq REAL NOT NULL,
      unitPrice REAL NOT NULL,
      createdAt TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS nav_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      fundCode TEXT NOT NULL,
      nav REAL NOT NULL,
      source TEXT NOT NULL,
      UNIQUE(fundCode, timestamp)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      totalAsset REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      action TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      fundCode TEXT PRIMARY KEY,
      tracked INTEGER NOT NULL DEFAULT 0,
      monthlyContribution REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS monthly_contribution_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monthKey TEXT NOT NULL,
      fundCode TEXT NOT NULL,
      amount REAL NOT NULL,
      transactionId INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(monthKey, fundCode),
      FOREIGN KEY(transactionId) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transaction_sells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyTransactionId INTEGER NOT NULL,
      fundCode TEXT NOT NULL,
      sellDate TEXT NOT NULL,
      sellTime TEXT NOT NULL DEFAULT '14:30',
      sellTimestamp TEXT NOT NULL,
      ccq REAL NOT NULL,
      unitPrice REAL NOT NULL,
      amountGross REAL NOT NULL,
      feePercent REAL NOT NULL DEFAULT 0,
      feeAmount REAL NOT NULL DEFAULT 0,
      amountNet REAL NOT NULL,
      costBasis REAL NOT NULL,
      pnlValue REAL NOT NULL,
      pnlPercent REAL NOT NULL,
      createdAt TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(buyTransactionId) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_fundCode ON transactions (fundCode);
    CREATE INDEX IF NOT EXISTS idx_nav_history_fundCode_timestamp ON nav_history (fundCode, timestamp);
    CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs (timestamp);
    CREATE INDEX IF NOT EXISTS idx_monthly_runs_month_fund ON monthly_contribution_runs (monthKey, fundCode);
    CREATE INDEX IF NOT EXISTS idx_transaction_sells_buy_id ON transaction_sells (buyTransactionId);
    CREATE INDEX IF NOT EXISTS idx_transaction_sells_fund_date ON transaction_sells (fundCode, sellDate);
  `);

  const txColumns = db
    .prepare("PRAGMA table_info(transactions)")
    .all() as Array<{ name: string }>;
  const txColumnSet = new Set(txColumns.map((column) => column.name));

  if (!txColumnSet.has("source")) {
    db.exec("ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }

  if (!txColumnSet.has("note")) {
    db.exec("ALTER TABLE transactions ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }

  const upsertSetting = db.prepare(
    "INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO NOTHING",
  );

  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
    upsertSetting.run(key, value);
  });
}

export function getDb() {
  const g = globalThis as GlobalWithDb;
  if (g.__fmarketDb) {
    // In dev hot-reload, a cached DB connection may survive while schema evolves.
    // Re-running idempotent migrations keeps older databases self-healed.
    runMigrations(g.__fmarketDb);
    return g.__fmarketDb;
  }

  ensureDataDirectory();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  g.__fmarketDb = db;
  return db;
}
