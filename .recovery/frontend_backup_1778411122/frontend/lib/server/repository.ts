import { getDb } from "@/lib/server/database";
import { APP_CONFIG, DEFAULT_SETTINGS } from "@/lib/server/config";
import type {
  Fund,
  LogLevel,
  NavHistoryRow,
  Snapshot,
  SystemLog,
  Transaction,
  TransactionSale,
  WatchlistItem,
} from "@/lib/server/types";

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const repository = {
  getSettings(): Record<string, string> {
    const db = getDb();
    const rows = db
      .prepare("SELECT key, value FROM app_settings")
      .all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    return settings;
  },

  setSetting(key: string, value: string) {
    const db = getDb();
    db.prepare(
      "INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(key, value);
  },

  getFunds(): Fund[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT code, name, nav, company, updatedAt, annualReturnEst, productId FROM funds ORDER BY code ASC",
      )
      .all() as Fund[];
  },

  getFundCodes(): string[] {
    const db = getDb();
    const rows = db.prepare("SELECT code FROM funds ORDER BY code ASC").all() as Array<{
      code: string;
    }>;
    return rows.map((row) => row.code);
  },

  getFundByCode(code: string): Fund | null {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT code, name, nav, company, updatedAt, annualReturnEst, productId FROM funds WHERE code = ?",
      )
      .get(code) as Fund | undefined;
    return row ?? null;
  },

  upsertFunds(funds: Array<Omit<Fund, "updatedAt"> & { updatedAt?: string }>) {
    if (!funds.length) return;
    const db = getDb();
    const statement = db.prepare(`
      INSERT INTO funds(code, name, nav, company, updatedAt, annualReturnEst, productId)
      VALUES(@code, @name, @nav, @company, @updatedAt, @annualReturnEst, @productId)
      ON CONFLICT(code) DO UPDATE SET
        name=excluded.name,
        nav=excluded.nav,
        company=excluded.company,
        updatedAt=excluded.updatedAt,
        annualReturnEst=excluded.annualReturnEst,
        productId=excluded.productId
    `);

    const upsertMany = db.transaction(
      (rows: Array<Omit<Fund, "updatedAt"> & { updatedAt?: string }>) => {
        rows.forEach((row) => {
          statement.run({
            code: row.code,
            name: row.name,
            nav: row.nav,
            company: row.company,
            updatedAt: row.updatedAt ?? nowIso(),
            annualReturnEst: row.annualReturnEst,
            productId: row.productId,
          });

          db.prepare(
            "INSERT INTO watchlist_items(fundCode, tracked, monthlyContribution) VALUES(?, 0, 0) ON CONFLICT(fundCode) DO NOTHING",
          ).run(row.code);
        });
      },
    );

    upsertMany(funds);
  },

  appendNavHistory(rows: NavHistoryRow[]) {
    if (!rows.length) return 0;
    const db = getDb();
    const statement = db.prepare(`
      INSERT INTO nav_history(timestamp, fundCode, nav, source)
      VALUES(@timestamp, @fundCode, @nav, @source)
      ON CONFLICT(fundCode, timestamp) DO NOTHING
    `);

    const appendMany = db.transaction((items: NavHistoryRow[]) => {
      let inserted = 0;
      items.forEach((item) => {
        const result = statement.run(item);
        inserted += result.changes;
      });
      return inserted;
    });

    return appendMany(rows);
  },

  getNavSeriesByCode(code: string, limit = 3000) {
    const db = getDb();
    return db
      .prepare(
        "SELECT timestamp, nav, source FROM (SELECT timestamp, nav, source FROM nav_history WHERE fundCode = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC",
      )
      .all(code, Math.max(1, limit)) as Array<{
      timestamp: string;
      nav: number;
      source: string;
    }>;
  },

  getAllNavPointCount() {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM nav_history").get() as {
      count: number;
    };
    return row.count;
  },

  addTransaction(input: {
    date: string;
    fundCode: string;
    amount: number;
    ccq: number;
    unitPrice: number;
    source?: "manual" | "monthly_auto";
    note?: string;
  }) {
    const db = getDb();
    const result = db.prepare(
      "INSERT INTO transactions(date, fundCode, amount, ccq, unitPrice, createdAt, source, note) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.date,
      input.fundCode,
      input.amount,
      input.ccq,
      input.unitPrice,
      nowIso(),
      input.source ?? "manual",
      input.note ?? "",
    );

    return Number(result.lastInsertRowid || 0);
  },

  getTransactionById(id: number): Transaction | null {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT id, date, fundCode, amount, ccq, unitPrice, createdAt, source, note FROM transactions WHERE id = ?",
      )
      .get(id) as Transaction | undefined;

    return row ?? null;
  },

  addTransactionSale(input: {
    buyTransactionId: number;
    fundCode: string;
    sellDate: string;
    sellTime: string;
    sellTimestamp: string;
    ccq: number;
    unitPrice: number;
    amountGross: number;
    feePercent: number;
    feeAmount: number;
    amountNet: number;
    costBasis: number;
    pnlValue: number;
    pnlPercent: number;
    source?: "manual";
    note?: string;
  }) {
    const db = getDb();
    const result = db.prepare(
      `INSERT INTO transaction_sells(
        buyTransactionId,
        fundCode,
        sellDate,
        sellTime,
        sellTimestamp,
        ccq,
        unitPrice,
        amountGross,
        feePercent,
        feeAmount,
        amountNet,
        costBasis,
        pnlValue,
        pnlPercent,
        createdAt,
        source,
        note
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.buyTransactionId,
      input.fundCode,
      input.sellDate,
      input.sellTime,
      input.sellTimestamp,
      input.ccq,
      input.unitPrice,
      input.amountGross,
      input.feePercent,
      input.feeAmount,
      input.amountNet,
      input.costBasis,
      input.pnlValue,
      input.pnlPercent,
      nowIso(),
      input.source ?? "manual",
      input.note ?? "",
    );

    return Number(result.lastInsertRowid || 0);
  },

  getTransactionSales(): TransactionSale[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT
          id,
          buyTransactionId,
          fundCode,
          sellDate,
          sellTime,
          sellTimestamp,
          ccq,
          unitPrice,
          amountGross,
          feePercent,
          feeAmount,
          amountNet,
          costBasis,
          pnlValue,
          pnlPercent,
          createdAt,
          source,
          note
         FROM transaction_sells
         ORDER BY sellDate ASC, sellTime ASC, id ASC`,
      )
      .all() as TransactionSale[];
  },

  getSalesByBuyTransactionId(buyTransactionId: number): TransactionSale[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT
          id,
          buyTransactionId,
          fundCode,
          sellDate,
          sellTime,
          sellTimestamp,
          ccq,
          unitPrice,
          amountGross,
          feePercent,
          feeAmount,
          amountNet,
          costBasis,
          pnlValue,
          pnlPercent,
          createdAt,
          source,
          note
         FROM transaction_sells
         WHERE buyTransactionId = ?
         ORDER BY sellDate ASC, sellTime ASC, id ASC`,
      )
      .all(buyTransactionId) as TransactionSale[];
  },

  getNavAtOrBefore(fundCode: string, timestampIso: string) {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT timestamp, nav, source FROM nav_history WHERE fundCode = ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT 1",
      )
      .get(fundCode, timestampIso) as
      | {
          timestamp: string;
          nav: number;
          source: string;
        }
      | undefined;

    if (row) return row;

    const fallback = db
      .prepare(
        "SELECT timestamp, nav, source FROM nav_history WHERE fundCode = ? ORDER BY timestamp ASC LIMIT 1",
      )
      .get(fundCode) as
      | {
          timestamp: string;
          nav: number;
          source: string;
        }
      | undefined;

    return fallback ?? null;
  },

  deleteTransaction(id: number) {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT id, date, fundCode, amount, ccq, unitPrice, createdAt, source, note FROM transactions WHERE id = ?",
      )
      .get(id) as Transaction | undefined;

    if (!row) return null;

    db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
    return row;
  },

  getTransactions(): Transaction[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, date, fundCode, amount, ccq, unitPrice, createdAt, source, note FROM transactions ORDER BY date ASC, id ASC",
      )
      .all() as Transaction[];
  },

  hasMonthlyContributionRun(monthKey: string, fundCode: string) {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT id FROM monthly_contribution_runs WHERE monthKey = ? AND fundCode = ? LIMIT 1",
      )
      .get(monthKey, fundCode) as { id: number } | undefined;

    return Boolean(row?.id);
  },

  addMonthlyContributionRun(input: {
    monthKey: string;
    fundCode: string;
    amount: number;
    transactionId: number;
  }) {
    const db = getDb();
    db.prepare(
      "INSERT INTO monthly_contribution_runs(monthKey, fundCode, amount, transactionId, createdAt) VALUES(?, ?, ?, ?, ?) ON CONFLICT(monthKey, fundCode) DO NOTHING",
    ).run(input.monthKey, input.fundCode, input.amount, input.transactionId, nowIso());
  },

  applyMonthlyContribution(input: {
    monthKey: string;
    date: string;
    fundCode: string;
    amount: number;
    ccq: number;
    unitPrice: number;
  }) {
    const db = getDb();

    const runAtomic = db.transaction((params: typeof input) => {
      const existing = db
        .prepare(
          "SELECT id FROM monthly_contribution_runs WHERE monthKey = ? AND fundCode = ? LIMIT 1",
        )
        .get(params.monthKey, params.fundCode) as { id: number } | undefined;

      if (existing?.id) {
        return {
          created: false,
          transactionId: 0,
        };
      }

      const txResult = db
        .prepare(
          "INSERT INTO transactions(date, fundCode, amount, ccq, unitPrice, createdAt, source, note) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          params.date,
          params.fundCode,
          params.amount,
          params.ccq,
          params.unitPrice,
          nowIso(),
          "monthly_auto",
          `AUTO_MONTHLY:${params.monthKey}`,
        );

      const transactionId = Number(txResult.lastInsertRowid || 0);

      db.prepare(
        "INSERT INTO monthly_contribution_runs(monthKey, fundCode, amount, transactionId, createdAt) VALUES(?, ?, ?, ?, ?)",
      ).run(params.monthKey, params.fundCode, params.amount, transactionId, nowIso());

      return {
        created: true,
        transactionId,
      };
    });

    return runAtomic(input);
  },

  getSnapshots(): Snapshot[] {
    const db = getDb();
    return db
      .prepare("SELECT id, date, totalAsset FROM snapshots ORDER BY date ASC")
      .all() as Snapshot[];
  },

  upsertSnapshot(date: string, totalAsset: number) {
    const db = getDb();
    db.prepare(
      "INSERT INTO snapshots(date, totalAsset) VALUES(?, ?) ON CONFLICT(date) DO UPDATE SET totalAsset=excluded.totalAsset",
    ).run(date, totalAsset);
  },

  setWatchlistItem(input: {
    fundCode: string;
    tracked?: boolean;
    monthlyContribution?: number;
  }) {
    const db = getDb();
    const current = db
      .prepare(
        "SELECT fundCode, tracked, monthlyContribution FROM watchlist_items WHERE fundCode = ?",
      )
      .get(input.fundCode) as
      | { fundCode: string; tracked: number; monthlyContribution: number }
      | undefined;

    const tracked =
      input.tracked === undefined
        ? Boolean(current?.tracked)
        : Boolean(input.tracked);
    const monthlyContribution =
      input.monthlyContribution === undefined
        ? toNumber(current?.monthlyContribution)
        : Math.max(0, toNumber(input.monthlyContribution));

    db.prepare(
      "INSERT INTO watchlist_items(fundCode, tracked, monthlyContribution) VALUES(?, ?, ?) ON CONFLICT(fundCode) DO UPDATE SET tracked=excluded.tracked, monthlyContribution=excluded.monthlyContribution",
    ).run(input.fundCode, tracked ? 1 : 0, monthlyContribution);
  },

  setWatchlistBulk(items: Array<{ fundCode: string; tracked: boolean }>) {
    const db = getDb();
    const update = db.prepare(
      "UPDATE watchlist_items SET tracked = ? WHERE fundCode = ?",
    );

    const run = db.transaction((rows: Array<{ fundCode: string; tracked: boolean }>) => {
      rows.forEach((row) => update.run(row.tracked ? 1 : 0, row.fundCode));
    });

    run(items);
  },

  getWatchlistItems(): WatchlistItem[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT fundCode, tracked, monthlyContribution FROM watchlist_items ORDER BY fundCode ASC",
      )
      .all() as Array<{ fundCode: string; tracked: number; monthlyContribution: number }>;

    return rows.map((row) => ({
      fundCode: row.fundCode,
      tracked: Boolean(row.tracked),
      monthlyContribution: toNumber(row.monthlyContribution),
    }));
  },

  getTrackedCodes(): string[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT fundCode FROM watchlist_items WHERE tracked = 1 ORDER BY fundCode ASC")
      .all() as Array<{ fundCode: string }>;
    return rows.map((row) => row.fundCode);
  },

  addSystemLog(params: {
    level: LogLevel;
    action: string;
    message: string;
    detail?: string;
  }) {
    const db = getDb();
    db.prepare(
      "INSERT INTO system_logs(timestamp, level, action, message, detail) VALUES(?, ?, ?, ?, ?)",
    ).run(
      nowIso(),
      params.level,
      params.action,
      params.message,
      params.detail ?? "",
    );

    const countRow = db
      .prepare("SELECT COUNT(*) AS count FROM system_logs")
      .get() as { count: number };
    if (countRow.count > APP_CONFIG.maxSystemLogs) {
      const deleteCount = countRow.count - APP_CONFIG.maxSystemLogs;
      db.prepare(
        "DELETE FROM system_logs WHERE id IN (SELECT id FROM system_logs ORDER BY id ASC LIMIT ?)",
      ).run(deleteCount);
    }
  },

  getSystemLogs(limit = 500): SystemLog[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, timestamp, level, action, message, detail FROM system_logs ORDER BY id DESC LIMIT ?",
      )
      .all(Math.max(1, limit)) as SystemLog[];
  },

  clearAllCoreData() {
    const db = getDb();
    const run = db.transaction(() => {
      db.prepare("DELETE FROM transaction_sells").run();
      db.prepare("DELETE FROM transactions").run();
      db.prepare("DELETE FROM funds").run();
      db.prepare("DELETE FROM nav_history").run();
      db.prepare("DELETE FROM snapshots").run();
      db.prepare("DELETE FROM system_logs").run();
      db.prepare("DELETE FROM watchlist_items").run();
      db.prepare("DELETE FROM app_settings").run();
      Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
        db.prepare("INSERT INTO app_settings(key, value) VALUES(?, ?)").run(key, value);
      });
    });

    run();
  },
};
