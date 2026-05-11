import crypto from "node:crypto";
import { APP_CONFIG, SETTING_KEYS, USAGE_GUIDE } from "@/lib/server/config";
import {
  autoGapHoursForSeries,
  buildCandlestickRows,
  buildLineSeriesWithBreaks,
  compressSeriesByGap,
  computeProjection,
  estimateCagr,
  formatGapLabel,
  parseMonthlyContribution,
  parseProjectionYears,
} from "@/lib/server/analytics";
import {
  fetchAllFunds,
  fetchProductDetailById,
  fetchHistoryByProductId,
} from "@/lib/server/fmarket-client";
import { repository } from "@/lib/server/repository";
import { addDays, formatDateTimeVi, toDateKey } from "@/lib/server/time";
import type {
  DashboardData,
  FundDetailData,
  Fund,
  LogLevel,
  SyncResult,
  TransactionPerformance,
  TransactionSale,
  TransactionsData,
  WatchlistData,
  WatchlistItem,
} from "@/lib/server/types";

const BOARD_TOTAL_SLOTS = 5;
const BOARD_QUICK_SLOTS = 3;

type GlobalWithAutoSync = typeof globalThis & {
  __fmarketAutoSyncPromise?: Promise<void> | null;
};

function log(level: LogLevel, action: string, message: string, detail = "") {
  repository.addSystemLog({
    level,
    action,
    message,
    detail,
  });
}

function todayDateKey() {
  return toDateKey(new Date());
}

function toYyyyMmDd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateInput(raw: string) {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function normalizeSellTime(raw: string | undefined) {
  const text = String(raw || "14:30").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return text;
  return "14:30";
}

function toSellTimestampIso(dateKey: string, time: string) {
  const iso = `${dateKey}T${time}:00+07:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return new Date(`${dateKey}T14:30:00+07:00`).toISOString();
  }
  return date.toISOString();
}

function buildTransactionPerformanceRows(params: {
  transactions: TransactionsData["transactions"];
  sales: TransactionSale[];
  navByCode: Record<string, number>;
}) {
  const salesByBuyId = new Map<number, TransactionSale[]>();
  params.sales.forEach((sale) => {
    const list = salesByBuyId.get(sale.buyTransactionId) ?? [];
    list.push(sale);
    salesByBuyId.set(sale.buyTransactionId, list);
  });

  const out: TransactionPerformance[] = [];

  params.transactions.forEach((tx) => {
    const linkedSales = salesByBuyId.get(tx.id) ?? [];
    const soldCcq = linkedSales.reduce((sum, sale) => sum + Number(sale.ccq || 0), 0);
    const costBasisSold = linkedSales.reduce((sum, sale) => sum + Number(sale.costBasis || 0), 0);
    const realizedPnlValue = linkedSales.reduce((sum, sale) => sum + Number(sale.pnlValue || 0), 0);

    const boughtCcq = Number(tx.ccq || 0);
    const remainingCcq = Math.max(0, boughtCcq - soldCcq);
    const costBasisRemaining = remainingCcq * Number(tx.unitPrice || 0);
    const navNow = Number(params.navByCode[tx.fundCode] || 0);
    const unrealizedValue = remainingCcq * navNow;
    const unrealizedPnlValue = unrealizedValue - costBasisRemaining;

    out.push({
      transactionId: tx.id,
      fundCode: tx.fundCode,
      boughtCcq,
      soldCcq,
      remainingCcq,
      costBasisSold,
      costBasisRemaining,
      realizedPnlValue,
      realizedPnlPercent: costBasisSold > 0 ? realizedPnlValue / costBasisSold : 0,
      unrealizedPnlValue,
      unrealizedPnlPercent: costBasisRemaining > 0 ? unrealizedPnlValue / costBasisRemaining : 0,
    });
  });

  return out;
}

function compareByOperator(value: number, operator: string, target: number) {
  switch ((operator || "").trim()) {
    case ">":
      return value > target;
    case ">=":
      return value >= target;
    case "<":
      return value < target;
    case "<=":
      return value <= target;
    default:
      return value >= target;
  }
}

function resolveSellFeePercent(params: {
  rules: FundDetailData["sellFeeRules"];
  buyDate: string;
  sellDate: string;
  amountGross: number;
  transactionSource: "manual" | "monthly_auto";
}) {
  if (!params.rules.length) return 0;

  const buyTs = new Date(`${params.buyDate}T00:00:00+07:00`).getTime();
  const sellTs = new Date(`${params.sellDate}T00:00:00+07:00`).getTime();
  const holdingDays = Number.isFinite(buyTs) && Number.isFinite(sellTs)
    ? Math.max(0, (sellTs - buyTs) / (24 * 60 * 60 * 1000))
    : 0;
  const holdingMonths = holdingDays / 30;
  const preferredScheme = params.transactionSource === "monthly_auto" ? "SIP" : "NORMAL";

  const preferredRules = params.rules.filter((rule) => {
    if (!rule.schemeCode) return true;
    return rule.schemeCode === preferredScheme;
  });

  const candidateRules = preferredRules.length ? preferredRules : params.rules;

  const matchingRules = candidateRules.filter((rule) => {
    const feeUnitType = (rule.feeUnitType || "").toUpperCase();
    const basisValue = feeUnitType === "MONEY"
      ? params.amountGross
      : rule.isUnitByDay || feeUnitType === "DAY"
        ? holdingDays
        : holdingMonths;

    const beginOk = compareByOperator(basisValue, rule.beginOperator || ">=", Number(rule.beginVolume || 0));
    const endOk =
      rule.endVolume === null || rule.endVolume === undefined
        ? true
        : compareByOperator(basisValue, rule.endOperator || "<=", Number(rule.endVolume || 0));

    return beginOk && endOk;
  });

  if (!matchingRules.length) return 0;

  matchingRules.sort((a, b) => {
    const beginDiff = Number(b.beginVolume || 0) - Number(a.beginVolume || 0);
    if (Math.abs(beginDiff) > 1e-12) return beginDiff;

    const endA = a.endVolume === null ? Number.POSITIVE_INFINITY : Number(a.endVolume || 0);
    const endB = b.endVolume === null ? Number.POSITIVE_INFINITY : Number(b.endVolume || 0);
    const endDiff = endA - endB;
    if (Math.abs(endDiff) > 1e-12) return endDiff;

    return Number(b.feePercent || 0) - Number(a.feePercent || 0);
  });

  const selected = matchingRules[0];
  const feePercent = Number(selected?.feePercent || 0);
  if (!Number.isFinite(feePercent) || feePercent < 0) return 0;
  return feePercent;
}

function getVietnamDateParts(now = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_CONFIG.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_CONFIG.timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_CONFIG.timeZone,
    weekday: "short",
  }).format(now);

  const year = Number(dateParts.find((part) => part.type === "year")?.value || "0");
  const month = Number(dateParts.find((part) => part.type === "month")?.value || "0");
  const day = Number(dateParts.find((part) => part.type === "day")?.value || "0");
  const hour = Number(timeParts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(timeParts.find((part) => part.type === "minute")?.value || "0");
  const second = Number(timeParts.find((part) => part.type === "second")?.value || "0");

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
  };
}

function toDateKeyFromVietnam(parts: {
  year: number;
  month: number;
  day: number;
}) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

function getTradingSession() {
  const parts = getVietnamDateParts();
  const isWeekday = !["Sat", "Sun"].includes(parts.weekday);
  const minuteOfDay = parts.hour * 60 + parts.minute;

  const MORNING_START = 9 * 60;
  const MORNING_END = 11 * 60 + 30;
  const AFTERNOON_START = 13 * 60;
  const AFTERNOON_END = 15 * 60;

  if (!isWeekday) {
    return {
      status: "closed" as const,
      label: "Ngoài phiên (cuối tuần)",
      inSession: false,
      nowVi: formatDateTimeVi(new Date()),
    };
  }

  if (minuteOfDay < MORNING_START) {
    return {
      status: "pre_open" as const,
      label: "Trước giờ vào phiên",
      inSession: false,
      nowVi: formatDateTimeVi(new Date()),
    };
  }

  if (minuteOfDay >= MORNING_START && minuteOfDay < MORNING_END) {
    return {
      status: "open" as const,
      label: "Đang trong phiên sáng",
      inSession: true,
      nowVi: formatDateTimeVi(new Date()),
    };
  }

  if (minuteOfDay >= MORNING_END && minuteOfDay < AFTERNOON_START) {
    return {
      status: "break" as const,
      label: "Nghỉ trưa giữa phiên",
      inSession: false,
      nowVi: formatDateTimeVi(new Date()),
    };
  }

  if (minuteOfDay >= AFTERNOON_START && minuteOfDay < AFTERNOON_END) {
    return {
      status: "open" as const,
      label: "Đang trong phiên chiều",
      inSession: true,
      nowVi: formatDateTimeVi(new Date()),
    };
  }

  return {
    status: "closed" as const,
    label: "Đã chốt phiên",
    inSession: false,
    nowVi: formatDateTimeVi(new Date()),
  };
}

function getHoldings() {
  const funds = repository.getFunds();
  const transactions = repository.getTransactions();
  const sales = repository.getTransactionSales();

  const navByCode: Record<string, number> = {};
  funds.forEach((fund) => {
    navByCode[fund.code] = Number(fund.nav || 0);
  });

  const investedByCode: Record<string, number> = {};
  const ccqByCode: Record<string, number> = {};
  const soldCostByCode: Record<string, number> = {};
  const soldCcqByCode: Record<string, number> = {};

  transactions.forEach((tx) => {
    investedByCode[tx.fundCode] = (investedByCode[tx.fundCode] || 0) + Number(tx.amount || 0);
    ccqByCode[tx.fundCode] = (ccqByCode[tx.fundCode] || 0) + Number(tx.ccq || 0);
  });

  sales.forEach((sale) => {
    soldCostByCode[sale.fundCode] = (soldCostByCode[sale.fundCode] || 0) + Number(sale.costBasis || 0);
    soldCcqByCode[sale.fundCode] = (soldCcqByCode[sale.fundCode] || 0) + Number(sale.ccq || 0);
  });

  Object.keys(investedByCode).forEach((code) => {
    investedByCode[code] = Math.max(0, Number(investedByCode[code] || 0) - Number(soldCostByCode[code] || 0));
  });

  Object.keys(ccqByCode).forEach((code) => {
    ccqByCode[code] = Math.max(0, Number(ccqByCode[code] || 0) - Number(soldCcqByCode[code] || 0));
  });

  return {
    funds,
    transactions,
    sales,
    navByCode,
    investedByCode,
    ccqByCode,
  };
}

async function syncAllFundsAndNav(): Promise<SyncResult> {
  const fundsFromApi = await fetchAllFunds(log);
  if (!fundsFromApi.length) {
    log("WARN", "syncAllFundsAndNav", "Không lấy được dữ liệu quỹ mới", "Sử dụng dữ liệu cũ nếu có");
    return {
      updatedFunds: 0,
      insertedHistoryPoints: 0,
    };
  }

  const nowIso = new Date().toISOString();
  repository.upsertFunds(
    fundsFromApi
      .filter((fund) => fund.code)
      .map((fund) => ({
        code: fund.code,
        name: fund.name,
        nav: Number(fund.nav || 0),
        company: fund.company || "",
        annualReturnEst: Number(fund.annualReturnEst || 0),
        productId: Number(fund.productId || 0),
        updatedAt: nowIso,
      })),
  );

  const historyRows = fundsFromApi
    .filter((fund) => fund.code && Number(fund.nav) > 0)
    .map((fund) => ({
      timestamp: nowIso,
      fundCode: fund.code,
      nav: Number(fund.nav),
      source: fund.source || "fmarket_api",
    }));

  const insertedHistoryPoints = repository.appendNavHistory(historyRows);
  repository.setSetting(SETTING_KEYS.lastAutoSyncAt, nowIso);

  log(
    "INFO",
    "syncAllFundsAndNav",
    "Đồng bộ danh sách quỹ thành công",
    `funds=${fundsFromApi.length}, navPoints=${insertedHistoryPoints}`,
  );

  return {
    updatedFunds: fundsFromApi.length,
    insertedHistoryPoints,
  };
}

async function ensureAutomatedSync(trigger: string) {
  const settings = repository.getSettings();
  const updateInterval = Math.max(
    1,
    Number(settings[SETTING_KEYS.updateIntervalMinutes] || 15),
  );
  const lastAutoSyncAt = settings[SETTING_KEYS.lastAutoSyncAt] || "";
  const hasAnyFund = repository.getFundCodes().length > 0;

  const now = Date.now();
  const last = lastAutoSyncAt ? new Date(lastAutoSyncAt).getTime() : 0;
  const isExpired = !last || Number.isNaN(last) || now - last >= updateInterval * 60 * 1000;
  const shouldSync = !hasAnyFund || isExpired;

  if (!shouldSync) return;

  const g = globalThis as GlobalWithAutoSync;
  if (!g.__fmarketAutoSyncPromise) {
    g.__fmarketAutoSyncPromise = (async () => {
      try {
        await updateRealtimeNav();
        repository.setSetting(SETTING_KEYS.lastAutoSyncAt, new Date().toISOString());
      } catch (error) {
        log(
          "ERROR",
          "ensureAutomatedSync",
          "Tự động cập nhật thất bại",
          `trigger=${trigger}, error=${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        g.__fmarketAutoSyncPromise = null;
      }
    })();
  }

  await g.__fmarketAutoSyncPromise;
}

function buildEstimatedHistory(params: {
  code: string;
  navNow: number;
  annualRate: number;
  maxDays: number;
}) {
  const out: Array<{ timestamp: string; fundCode: string; nav: number; source: string }> = [];
  const totalDays = Math.max(120, Number(params.maxDays || APP_CONFIG.historyBackfillDays));
  const stepDays = totalDays > 365 ? 2 : 1;
  const now = new Date();

  for (let day = totalDays; day >= 0; day -= stepDays) {
    const date = addDays(now, -day);
    const yearsBack = day / 365;
    const nav = params.navNow / Math.pow(1 + params.annualRate, yearsBack);
    if (!Number.isFinite(nav) || nav <= 0) continue;

    out.push({
      timestamp: date.toISOString(),
      fundCode: params.code,
      nav: Number(nav.toFixed(6)),
      source: "history_estimated",
    });
  }

  return out;
}

async function ensureWatchlistHistory(input?: {
  force?: boolean;
  maxCodes?: number;
  selectedCodes?: string[];
}) {
  const force = input?.force === true;
  const maxCodes = Math.max(1, Number(input?.maxCodes || 20));
  const settings = repository.getSettings();
  const nowMs = Date.now();

  const selectedFromInput = input?.selectedCodes?.filter(Boolean) ?? [];
  let targetCodes = selectedFromInput.length ? selectedFromInput : repository.getTrackedCodes();

  if (!targetCodes.length) {
    const purchased = getPurchasedFundCodes();
    const planned = repository
      .getWatchlistItems()
      .filter((item) => item.monthlyContribution > 0)
      .map((item) => item.fundCode);

    targetCodes = Array.from(new Set([...purchased, ...planned]));
  }

  if (!targetCodes.length) {
    const firstFund = repository.getFundCodes()[0];
    if (firstFund) targetCodes = [firstFund];
  }

  targetCodes = targetCodes.slice(0, maxCodes);
  const funds = repository.getFunds();
  const fundMap = new Map(funds.map((fund) => [fund.code, fund]));

  for (const code of targetCodes) {
    const existing = repository.getNavSeriesByCode(code, 5000);
    const firstTs = existing[0] ? new Date(existing[0].timestamp).getTime() : 0;
    const lastTs = existing[existing.length - 1]
      ? new Date(existing[existing.length - 1].timestamp).getTime()
      : 0;

    const existingSpanDays =
      firstTs && lastTs && lastTs > firstTs ? (lastTs - firstTs) / (24 * 60 * 60 * 1000) : 0;

    const minSpanDays = Math.max(90, Math.floor(APP_CONFIG.historyBackfillDays * 0.5));
    const recent90Count = existing.filter((row) => {
      const ts = new Date(row.timestamp).getTime();
      return Number.isFinite(ts) && ts >= nowMs - 90 * 24 * 60 * 60 * 1000;
    }).length;
    const daysSinceLast =
      lastTs && Number.isFinite(lastTs)
        ? (nowMs - lastTs) / (24 * 60 * 60 * 1000)
        : Number.POSITIVE_INFINITY;
    const recentRefreshKey = `watchlist_recent_refresh_${code}`;
    const lastRefreshMs = settings[recentRefreshKey]
      ? new Date(settings[recentRefreshKey]).getTime()
      : 0;
    const fullRefreshKey = `watchlist_full_refresh_${code}`;
    const lastFullRefreshMs = settings[fullRefreshKey]
      ? new Date(settings[fullRefreshKey]).getTime()
      : 0;
    const needsRecentRefresh = recent90Count < 12 || daysSinceLast > 2;
    const refreshCooldownMs = needsRecentRefresh ? 30 * 60 * 1000 : 12 * 60 * 60 * 1000;
    const refreshCooldownPassed =
      !lastRefreshMs || !Number.isFinite(lastRefreshMs) || nowMs - lastRefreshMs >= refreshCooldownMs;
    const fullRefreshCooldownMs = 21 * 24 * 60 * 60 * 1000;
    const fullRefreshDue =
      !lastFullRefreshMs ||
      !Number.isFinite(lastFullRefreshMs) ||
      nowMs - lastFullRefreshMs >= fullRefreshCooldownMs;
    const needsFullHistory = existing.length < 480 || existingSpanDays < 365 * 4;
    const shouldTryFullHistory = force || (needsFullHistory && fullRefreshDue);

    if (
      !force &&
      existing.length >= 120 &&
      existingSpanDays >= minSpanDays &&
      (!needsRecentRefresh || !refreshCooldownPassed) &&
      !shouldTryFullHistory
    ) {
      continue;
    }

    const fund = fundMap.get(code);
    if (!fund?.productId) {
      log("WARN", "ensureWatchlistHistory", "Không có Product ID cho mã quỹ", code);
      continue;
    }

    const toDate = new Date();
    const lookbackDays = needsRecentRefresh
      ? Math.max(365, APP_CONFIG.historyBackfillDays)
      : APP_CONFIG.historyBackfillDays;
    const fromDate = addDays(toDate, -lookbackDays);
    const fetchMode = shouldTryFullHistory ? "both" : "recent";

    const fetched = await fetchHistoryByProductId({
      code,
      productId: fund.productId,
      fromDate: toYyyyMmDd(fromDate),
      toDate: toYyyyMmDd(toDate),
      mode: fetchMode,
      logger: log,
    });

    if (shouldTryFullHistory) {
      repository.setSetting(fullRefreshKey, new Date().toISOString());
    }

    let insertedHistory = 0;

    if (fetched.length) {
      insertedHistory += repository.appendNavHistory(
        fetched.map((item) => ({
          timestamp: item.timestamp,
          fundCode: item.fundCode,
          nav: item.nav,
          source: item.source,
        })),
      );
    }

    if (fetched.length || insertedHistory > 0) {
      log(
        "INFO",
        "ensureWatchlistHistory",
        "Backfill lịch sử NAV thành công",
        `${code} | mode=${fetchMode}, fetched=${fetched.length}, inserted=${insertedHistory}`,
      );
      if (needsRecentRefresh) {
        repository.setSetting(recentRefreshKey, new Date().toISOString());
      }
      continue;
    }

    if (!APP_CONFIG.allowEstimatedHistory) {
      log(
        "WARN",
        "ensureWatchlistHistory",
        "Không có lịch sử API, bỏ qua dữ liệu ước tính",
        code,
      );
      continue;
    }

    const annualRate = Number.isFinite(fund.annualReturnEst)
      ? Number(fund.annualReturnEst)
      : APP_CONFIG.defaultFallbackAnnualRate;

    const estimated = buildEstimatedHistory({
      code,
      navNow: fund.nav,
      annualRate: Math.min(0.8, Math.max(-0.5, annualRate)),
      maxDays: APP_CONFIG.historyBackfillDays,
    });

    if (estimated.length) {
      const inserted = repository.appendNavHistory(estimated);
      log(
        "INFO",
        "ensureWatchlistHistory",
        "Đã dùng dữ liệu lịch sử ước tính",
        `${code} | estimated=${estimated.length}, inserted=${inserted}`,
      );
      if (needsRecentRefresh) {
        repository.setSetting(recentRefreshKey, new Date().toISOString());
      }
    } else if (needsRecentRefresh) {
      repository.setSetting(recentRefreshKey, new Date().toISOString());
    }
  }
}

function getPurchasedFundCodes() {
  const transactions = repository.getTransactions();
  const ccqByCode: Record<string, number> = {};
  transactions.forEach((tx) => {
    ccqByCode[tx.fundCode] = (ccqByCode[tx.fundCode] || 0) + Number(tx.ccq || 0);
  });
  return Object.keys(ccqByCode).filter((code) => ccqByCode[code] > 0);
}

function getProjectionYears() {
  const settings = repository.getSettings();
  return parseProjectionYears(settings[SETTING_KEYS.projectionYears]);
}

function cleanCode(input: string) {
  return String(input || "")
    .trim()
    .toUpperCase();
}

function uniqueCodes(codes: string[], allowed?: Set<string>) {
  const out: string[] = [];
  const seen = new Set<string>();

  codes.forEach((code) => {
    const clean = cleanCode(code);
    if (!clean) return;
    if (allowed && !allowed.has(clean)) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  });

  return out;
}

function getProjectionTargetCodesFromState(params: {
  ccqByCode: Record<string, number>;
  watchlistItems: WatchlistItem[];
}) {
  const codes: string[] = [];

  Object.entries(params.ccqByCode).forEach(([code, ccq]) => {
    if (Number(ccq || 0) > 0) {
      codes.push(code);
    }
  });

  params.watchlistItems.forEach((item) => {
    if (Number(item.monthlyContribution || 0) > 0) {
      codes.push(item.fundCode);
    }
  });

  return uniqueCodes(codes);
}

function getProjectionTargetCodes() {
  const watchlistItems = repository.getWatchlistItems();
  const { ccqByCode } = getHoldings();
  return getProjectionTargetCodesFromState({
    ccqByCode,
    watchlistItems,
  });
}

async function ensureProjectionHistory(input?: { force?: boolean; maxCodes?: number }) {
  const selectedCodes = getProjectionTargetCodes();
  if (!selectedCodes.length) return;
  await ensureWatchlistHistory({
    force: input?.force,
    maxCodes: input?.maxCodes ?? 24,
    selectedCodes,
  });
}

function ensureMonthlyAutoContributions() {
  const session = getTradingSession();
  if (session.status !== "closed") {
    return {
      createdCount: 0,
      session,
    };
  }

  const dateParts = getVietnamDateParts();
  const monthKey = `${String(dateParts.year).padStart(4, "0")}-${String(dateParts.month).padStart(2, "0")}`;
  const dateKey = toDateKeyFromVietnam(dateParts);
  const watchlistItems = repository.getWatchlistItems();

  let createdCount = 0;

  watchlistItems.forEach((item) => {
    const amount = parseMonthlyContribution(item.monthlyContribution);
    if (amount <= 0) return;

    const fundCode = cleanCode(item.fundCode);
    if (!fundCode) return;

    const fund = repository.getFundByCode(fundCode);
    const nav = Number(fund?.nav || 0);
    if (!Number.isFinite(nav) || nav <= 0) {
      log(
        "WARN",
        "ensureMonthlyAutoContributions",
        "Bỏ qua nạp tự động do chưa có NAV hợp lệ",
        `fundCode=${fundCode}, month=${monthKey}`,
      );
      return;
    }

    const ccq = amount / nav;
    if (!Number.isFinite(ccq) || ccq <= 0) return;

    const created = repository.applyMonthlyContribution({
      monthKey,
      date: dateKey,
      fundCode,
      amount,
      ccq,
      unitPrice: nav,
    });

    if (!created.created) return;

    createdCount += 1;
    log(
      "INFO",
      "ensureMonthlyAutoContributions",
      "Đã nạp tự động hàng tháng",
      `fundCode=${fundCode}, month=${monthKey}, amount=${amount}, ccq=${ccq.toFixed(6)}`,
    );
  });

  return {
    createdCount,
    session,
  };
}

function parseBoardCodesFromSetting(raw: string, allowed: Set<string>) {
  return uniqueCodes(
    String(raw || "")
      .split(",")
      .map((item) => item.trim()),
    allowed,
  );
}

function findLookbackReturn(
  series: Array<{ timestamp: string; nav: number }>,
  lookbackDays: number,
) {
  if (series.length < 2) return Number.NaN;
  const last = series[series.length - 1];
  if (!last || Number(last.nav || 0) <= 0) return Number.NaN;

  const lastTs = new Date(last.timestamp).getTime();
  if (!Number.isFinite(lastTs)) return Number.NaN;
  const targetTs = lastTs - lookbackDays * 24 * 60 * 60 * 1000;

  let base = series[0];
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const ts = new Date(series[i].timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts <= targetTs) {
      base = series[i];
      break;
    }
  }

  if (!base || Number(base.nav || 0) <= 0) return Number.NaN;
  return Number(last.nav) / Number(base.nav) - 1;
}

function buildTrendScoreMap(funds: Fund[]) {
  const out: Record<string, number> = {};

  funds.forEach((fund) => {
    const code = cleanCode(fund.code);
    if (!code) return;

    const series = repository
      .getNavSeriesByCode(code, 900)
      .map((point) => ({ timestamp: point.timestamp, nav: Number(point.nav || 0) }))
      .filter((point) => Number.isFinite(point.nav) && point.nav > 0);

    const r30 = findLookbackReturn(series, 30);
    const r90 = findLookbackReturn(series, 90);
    const r180 = findLookbackReturn(series, 180);

    let score = 0;
    let weight = 0;

    if (Number.isFinite(r30)) {
      score += r30 * 0.55;
      weight += 0.55;
    }
    if (Number.isFinite(r90)) {
      score += r90 * 0.3;
      weight += 0.3;
    }
    if (Number.isFinite(r180)) {
      score += r180 * 0.15;
      weight += 0.15;
    }

    if (weight > 0) {
      out[code] = score / weight;
      return;
    }

    const fallbackAnnual = Number(fund.annualReturnEst || 0);
    out[code] = Number.isFinite(fallbackAnnual) ? fallbackAnnual / 4 : 0;
  });

  return out;
}

function getHoldingCodesRanked(params: {
  funds: Fund[];
  navByCode: Record<string, number>;
  ccqByCode: Record<string, number>;
}) {
  return params.funds
    .map((fund) => {
      const code = cleanCode(fund.code);
      const ccq = Number(params.ccqByCode[code] || 0);
      const nav = Number(params.navByCode[code] || 0);
      const asset = Math.max(0, ccq * nav);
      return {
        code,
        asset,
      };
    })
    .filter((item) => item.code && item.asset > 0)
    .sort((a, b) => b.asset - a.asset)
    .map((item) => item.code);
}

function buildBoardSelection(params: {
  funds: Fund[];
  selectedCodes?: string[];
  mainCode?: string;
  configuredCodes: string[];
  holdingCodes: string[];
  trendScores: Record<string, number>;
}) {
  const availableCodes = uniqueCodes(params.funds.map((fund) => fund.code));
  const availableSet = new Set(availableCodes);

  const trendCodes = [...availableCodes].sort((a, b) => {
    const diff = Number(params.trendScores[b] || 0) - Number(params.trendScores[a] || 0);
    if (Math.abs(diff) > 1e-12) return diff;
    return a.localeCompare(b);
  });

  const requested = uniqueCodes(params.selectedCodes ?? [], availableSet);
  const configured = uniqueCodes(params.configuredCodes, availableSet);
  const holdings = uniqueCodes(params.holdingCodes, availableSet);
  const prioritizedMain = cleanCode(params.mainCode || "");

  const queue = [
    prioritizedMain,
    ...requested,
    ...configured,
    ...holdings,
    ...trendCodes,
    ...availableCodes,
  ];

  const boardCodes = uniqueCodes(queue, availableSet).slice(0, BOARD_TOTAL_SLOTS);
  const mainCode = availableSet.has(prioritizedMain)
    ? prioritizedMain
    : boardCodes[0] || "";

  const quickCodes = boardCodes.filter((code) => code !== mainCode).slice(0, BOARD_QUICK_SLOTS);

  const normalizedBoard = mainCode ? [mainCode, ...quickCodes] : quickCodes;

  return {
    mainCode,
    quickCodes,
    boardCodes: normalizedBoard,
  };
}

function getCagrMap(codes: string[]) {
  const out: Record<string, number> = {};
  uniqueCodes(codes).forEach((code) => {
    const series = repository
      .getNavSeriesByCode(code, 5000)
      .map((point) => ({ timestamp: point.timestamp, nav: point.nav }));
    out[code] = estimateCagr(series);
  });
  return out;
}

function estimateAnnualVolatility(series: Array<{ timestamp: string; nav: number }>) {
  if (series.length < 3) return Number.NaN;

  const clean = series
    .map((point) => ({
      ts: new Date(point.timestamp).getTime(),
      nav: Number(point.nav || 0),
    }))
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.nav) && point.nav > 0)
    .sort((a, b) => a.ts - b.ts);

  if (clean.length < 3) return Number.NaN;

  const returns: number[] = [];
  for (let i = 1; i < clean.length; i += 1) {
    const prev = clean[i - 1].nav;
    const curr = clean[i].nav;
    if (prev <= 0 || curr <= 0) continue;
    const r = Math.log(curr / prev);
    if (Number.isFinite(r)) returns.push(r);
  }

  if (returns.length < 2) return Number.NaN;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, returns.length - 1);

  const std = Math.sqrt(Math.max(0, variance));
  if (!Number.isFinite(std)) return Number.NaN;

  const spanDays = (clean[clean.length - 1].ts - clean[0].ts) / (24 * 60 * 60 * 1000);
  const avgStepDays = spanDays > 0 ? spanDays / Math.max(1, clean.length - 1) : 1;
  const annualFactor = Math.sqrt(365 / Math.max(1 / 24, avgStepDays));
  const annualVol = std * annualFactor;

  if (!Number.isFinite(annualVol) || annualVol <= 0) return Number.NaN;
  return Math.max(0.03, Math.min(1.2, annualVol));
}

function getVolatilityMap(codes: string[]) {
  const out: Record<string, number> = {};
  uniqueCodes(codes).forEach((code) => {
    const series = repository
      .getNavSeriesByCode(code, 5000)
      .map((point) => ({ timestamp: point.timestamp, nav: point.nav }));
    out[code] = estimateAnnualVolatility(series);
  });
  return out;
}

function uniqueByTimestamp(
  series: Array<{ timestamp: string; nav: number; source: string }>,
) {
  const map = new Map<string, { timestamp: string; nav: number; source: string }>();
  series.forEach((point) => {
    if (!point.timestamp) return;
    map.set(point.timestamp, point);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function splitSeriesByGap(
  sorted: Array<{ timestamp: string; nav: number; source: string }>,
) {
  if (sorted.length < 2) return [sorted];

  const diffsMs: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prevTs = new Date(sorted[i - 1].timestamp).getTime();
    const currTs = new Date(sorted[i].timestamp).getTime();
    const diff = currTs - prevTs;
    if (Number.isFinite(diff) && diff > 0) diffsMs.push(diff);
  }

  if (!diffsMs.length) return [sorted];

  const orderedDiffs = [...diffsMs].sort((a, b) => a - b);
  const medianDiff = orderedDiffs[Math.floor(orderedDiffs.length / 2)] || 24 * 60 * 60 * 1000;
  const minGapMs = 3 * 24 * 60 * 60 * 1000;
  const maxGapMs = 21 * 24 * 60 * 60 * 1000;
  const splitGapMs = Math.max(minGapMs, Math.min(maxGapMs, medianDiff * 4));

  const segments: Array<Array<{ timestamp: string; nav: number; source: string }>> = [];
  let start = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const prevTs = new Date(sorted[i - 1].timestamp).getTime();
    const currTs = new Date(sorted[i].timestamp).getTime();
    const diff = currTs - prevTs;
    if (!Number.isFinite(diff) || diff <= splitGapMs) continue;

    segments.push(sorted.slice(start, i));
    start = i;
  }

  segments.push(sorted.slice(start));
  return segments.filter((segment) => segment.length > 0);
}

function segmentDistinctDays(segment: Array<{ timestamp: string; nav: number; source: string }>) {
  return new Set(segment.map((point) => point.timestamp.slice(0, 10))).size;
}

function chooseDisplaySeries(
  series: Array<{ timestamp: string; nav: number; source: string }>,
) {
  const sorted = uniqueByTimestamp(series);
  if (sorted.length < 2) {
    return {
      series: sorted,
      droppedSparseTail: false,
    };
  }

  const segments = splitSeriesByGap(sorted);
  if (segments.length <= 1) {
    return {
      series: sorted,
      droppedSparseTail: false,
    };
  }

  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  const lastDistinct = segmentDistinctDays(last);
  const lastSpanDays =
    (new Date(last[last.length - 1].timestamp).getTime() - new Date(last[0].timestamp).getTime()) /
    (24 * 60 * 60 * 1000);

  const prevLastTs = new Date(prev[prev.length - 1].timestamp).getTime();
  const lastFirstTs = new Date(last[0].timestamp).getTime();
  const interGapDays = (lastFirstTs - prevLastTs) / (24 * 60 * 60 * 1000);

  const shouldPreferLast =
    lastDistinct >= 4 ||
    (lastDistinct >= 2 && lastSpanDays >= 1) ||
    (lastDistinct >= 2 && interGapDays <= 10);

  if (shouldPreferLast) {
    return {
      series: sorted,
      droppedSparseTail: false,
    };
  }

  return {
    series: sorted,
    droppedSparseTail: false,
  };
}

export async function initializeApp() {
  const result = await syncAllFundsAndNav();
  await ensureProjectionHistory({ force: false, maxCodes: 24 });
  takeSnapshot();

  log(
    "INFO",
    "initializeApp",
    "Khởi tạo ứng dụng thành công",
    `updatedFunds=${result.updatedFunds}, historyPoints=${result.insertedHistoryPoints}`,
  );

  return result;
}

export async function syncAll() {
  const result = await syncAllFundsAndNav();
  await ensureProjectionHistory({ force: false, maxCodes: 24 });

  log(
    "INFO",
    "syncAll",
    "Đồng bộ toàn bộ quỹ + NAV thành công",
    `updatedFunds=${result.updatedFunds}, historyPoints=${result.insertedHistoryPoints}`,
  );

  return result;
}

export async function updateRealtimeNav() {
  const result = await syncAllFundsAndNav();
  takeSnapshot();

  log(
    "INFO",
    "updateRealtimeNav",
    "Cập nhật NAV realtime thành công",
    `updatedFunds=${result.updatedFunds}, historyPoints=${result.insertedHistoryPoints}`,
  );

  return result;
}

export function takeSnapshot() {
  const dashboard = getDashboardData();
  const totalAsset = Number(dashboard.summary.totalAsset || 0);
  if (!Number.isFinite(totalAsset) || totalAsset <= 0) return null;

  const dateKey = todayDateKey();
  repository.upsertSnapshot(dateKey, totalAsset);
  log("INFO", "takeSnapshot", "Đã chụp snapshot tài sản", `date=${dateKey}, totalAsset=${totalAsset}`);
  return { date: dateKey, totalAsset };
}

export function installAutoTriggers(input?: { updateIntervalMinutes?: number; snapshotIntervalHours?: number }) {
  const updateInterval = Math.max(1, Number(input?.updateIntervalMinutes || 15));
  const snapshotInterval = Math.max(1, Number(input?.snapshotIntervalHours || 1));
  const secret = crypto.randomBytes(24).toString("hex");

  repository.setSetting(SETTING_KEYS.updateIntervalMinutes, String(updateInterval));
  repository.setSetting(SETTING_KEYS.snapshotIntervalHours, String(snapshotInterval));
  repository.setSetting(SETTING_KEYS.cronSecret, secret);

  log(
    "INFO",
    "installAutoTriggers",
    "Đã tạo thông số trigger tự động",
    `updateMinutes=${updateInterval}, snapshotHours=${snapshotInterval}`,
  );

  return {
    updateIntervalMinutes: updateInterval,
    snapshotIntervalHours: snapshotInterval,
    cronSecret: secret,
  };
}

export function resetAllData() {
  repository.clearAllCoreData();
  log("INFO", "resetAllData", "Đã reset toàn bộ dữ liệu", "Bao gồm giao dịch, quỹ, lịch sử NAV, snapshot, log và cài đặt");
}

export async function resetAndRefetchAllData() {
  resetAllData();

  const sync = await syncAllFundsAndNav();
  const allCodes = repository.getFundCodes();
  const beforeCount = repository.getAllNavPointCount();

  await ensureWatchlistHistory({
    force: true,
    maxCodes: Math.max(1, allCodes.length),
    selectedCodes: allCodes,
  });

  const afterCount = repository.getAllNavPointCount();
  const insertedHistoryPoints = Math.max(0, afterCount - beforeCount);
  const snapshot = takeSnapshot();

  log(
    "INFO",
    "resetAndRefetchAllData",
    "Đã reset DB và fetch lại toàn bộ dữ liệu quỹ",
    `updatedFunds=${sync.updatedFunds}, historyPoints=${insertedHistoryPoints}, funds=${allCodes.length}`,
  );

  return {
    updatedFunds: sync.updatedFunds,
    insertedHistoryPoints,
    totalFunds: allCodes.length,
    snapshot,
  };
}

export function saveTransaction(input: {
  fundCode: string;
  amount: number;
  ccq?: number;
  date?: string;
}) {
  const fundCode = String(input.fundCode || "").trim();
  const amount = Number(input.amount || 0);
  let ccq = Number(input.ccq || 0);

  if (!fundCode || amount <= 0) {
    throw new Error("Dữ liệu giao dịch không hợp lệ.");
  }

  const fund = repository.getFundByCode(fundCode);
  const nav = Number(fund?.nav || 0);

  if (ccq <= 0) {
    if (nav <= 0) {
      throw new Error(
        `Không tìm thấy NAV hiện tại cho mã quỹ ${fundCode}. Vui lòng sync trước hoặc nhập số CCQ.`,
      );
    }
    ccq = amount / nav;
  }

  const unitPrice = amount / ccq;
  if (nav > 0 && unitPrice > nav * 5) {
    throw new Error(
      "Đơn giá giao dịch đang cao bất thường so với NAV hiện tại. Vui lòng kiểm tra số CCQ hoặc để trống để hệ thống tự tính.",
    );
  }

  const date = normalizeDateInput(input.date || "");
  repository.addTransaction({
    date: toDateKey(date),
    fundCode,
    amount,
    ccq,
    unitPrice,
  });

  log(
    "INFO",
    "saveTransaction",
    "Đã thêm giao dịch",
    `fundCode=${fundCode}, amount=${amount}, ccq=${ccq.toFixed(6)}`,
  );

  void ensureProjectionHistory({ force: false, maxCodes: 24 }).catch((error) => {
    log(
      "WARN",
      "saveTransaction",
      "Không thể backfill lịch sử cho dự phóng sau khi thêm giao dịch",
      error instanceof Error ? error.message : String(error),
    );
  });

  return {
    fundCode,
    amount,
    ccq,
    unitPrice,
  };
}

export async function saveTransactionSell(input: {
  buyTransactionId: number;
  sellDate: string;
  sellTime?: string;
  ccq: number;
  unitPrice?: number;
  note?: string;
}) {
  const buyTx = repository.getTransactionById(Number(input.buyTransactionId || 0));
  if (!buyTx) {
    throw new Error("Không tìm thấy giao dịch mua gốc để thực hiện bán.");
  }

  const sellingCcq = Number(input.ccq || 0);
  if (!Number.isFinite(sellingCcq) || sellingCcq <= 0) {
    throw new Error("Số CCQ bán phải lớn hơn 0.");
  }

  const existingSales = repository.getSalesByBuyTransactionId(buyTx.id);
  const soldCcq = existingSales.reduce((sum, sale) => sum + Number(sale.ccq || 0), 0);
  const remainingCcq = Math.max(0, Number(buyTx.ccq || 0) - soldCcq);

  if (remainingCcq <= 0) {
    throw new Error("Giao dịch mua này đã được bán hết trước đó.");
  }

  if (sellingCcq > remainingCcq + 1e-9) {
    throw new Error(`Số CCQ bán vượt quá phần còn lại. Tối đa có thể bán: ${remainingCcq.toFixed(6)} CCQ.`);
  }

  const sellDate = toDateKey(normalizeDateInput(input.sellDate || ""));
  const sellTime = normalizeSellTime(input.sellTime);
  const sellTimestamp = toSellTimestampIso(sellDate, sellTime);

  let sellUnitPrice = Number(input.unitPrice || 0);
  if (!Number.isFinite(sellUnitPrice) || sellUnitPrice <= 0) {
    const navAtSell = repository.getNavAtOrBefore(buyTx.fundCode, sellTimestamp);
    if (navAtSell && Number(navAtSell.nav || 0) > 0) {
      sellUnitPrice = Number(navAtSell.nav);
    } else {
      const latestFund = repository.getFundByCode(buyTx.fundCode);
      sellUnitPrice = Number(latestFund?.nav || 0);
    }
  }

  if (!Number.isFinite(sellUnitPrice) || sellUnitPrice <= 0) {
    throw new Error("Không xác định được NAV tại thời điểm bán. Vui lòng nhập giá bán thủ công.");
  }

  const amountGross = sellingCcq * sellUnitPrice;
  const fund = repository.getFundByCode(buyTx.fundCode);
  let feePercent = 0;

  if (fund?.productId) {
    const detail = await fetchProductDetailById({
      productId: fund.productId,
      logger: log,
    });

    if (detail?.sellFeeRules?.length) {
      feePercent = resolveSellFeePercent({
        rules: detail.sellFeeRules,
        buyDate: buyTx.date,
        sellDate,
        amountGross,
        transactionSource: buyTx.source,
      });
    }
  }

  const feeAmount = amountGross * (feePercent / 100);
  const amountNet = amountGross - feeAmount;
  const costBasis = sellingCcq * Number(buyTx.unitPrice || 0);
  const pnlValue = amountNet - costBasis;
  const pnlPercent = costBasis > 0 ? pnlValue / costBasis : 0;

  const saleId = repository.addTransactionSale({
    buyTransactionId: buyTx.id,
    fundCode: buyTx.fundCode,
    sellDate,
    sellTime,
    sellTimestamp,
    ccq: sellingCcq,
    unitPrice: sellUnitPrice,
    amountGross,
    feePercent,
    feeAmount,
    amountNet,
    costBasis,
    pnlValue,
    pnlPercent,
    note: input.note || "",
  });

  log(
    "INFO",
    "saveTransactionSell",
    "Đã tạo lệnh bán/chốt lời-lỗ",
    `saleId=${saleId}, buyId=${buyTx.id}, fund=${buyTx.fundCode}, ccq=${sellingCcq.toFixed(6)}, unitPrice=${sellUnitPrice.toFixed(4)}, pnl=${pnlValue.toFixed(2)}`,
  );

  return {
    id: saleId,
    buyTransactionId: buyTx.id,
    fundCode: buyTx.fundCode,
    sellDate,
    sellTime,
    ccq: sellingCcq,
    unitPrice: sellUnitPrice,
    amountGross,
    amountNet,
    costBasis,
    pnlValue,
    pnlPercent,
    remainingCcq: Math.max(0, remainingCcq - sellingCcq),
  };
}

export async function getFundDetailByCode(code: string): Promise<FundDetailData> {
  const clean = cleanCode(code);
  if (!clean) {
    throw new Error("Mã quỹ không hợp lệ.");
  }

  const fund = repository.getFundByCode(clean);
  if (!fund) {
    throw new Error(`Không tìm thấy mã quỹ ${clean}.`);
  }

  if (!fund.productId) {
    throw new Error(`Mã quỹ ${clean} chưa có Product ID để lấy thông tin chi tiết.`);
  }

  const detail = await fetchProductDetailById({
    productId: fund.productId,
    logger: log,
  });

  if (!detail) {
    throw new Error(`Không lấy được thông tin chi tiết cho mã quỹ ${clean}.`);
  }

  return {
    productId: detail.productId,
    code: detail.code || clean,
    shortCode: detail.shortCode || "",
    name: detail.name || fund.name,
    tradeCode: detail.tradeCode || "",
    sipCode: detail.sipCode || "",
    company: detail.company || fund.company,
    status: detail.status || "",
    price: Number(detail.price || 0),
    nav: Number(detail.nav || fund.nav || 0),
    lastYearNav: Number(detail.lastYearNav || 0),
    lastNavDateIso: detail.lastNavDateIso || "",
    firstIssueAtIso: detail.firstIssueAtIso || "",
    approveAtIso: detail.approveAtIso || "",
    updatedAtIso: detail.updatedAtIso || "",
    buyMinValue: Number(detail.buyMinValue || 0),
    buyMaxValue: Number(detail.buyMaxValue || 0),
    sellMin: Number(detail.sellMin || 0),
    transferSellMin: Number(detail.transferSellMin || 0),
    holdingMin: Number(detail.holdingMin || 0),
    isOnlySellMinNotSellAll: Boolean(detail.isOnlySellMinNotSellAll),
    holdingVolume: Number(detail.holdingVolume || 0),
    avgAnnualReturnPct: Number(detail.avgAnnualReturnPct || 0),
    annualizedReturn36MonthsPct: Number(detail.annualizedReturn36MonthsPct || 0),
    expectedReturnPct: Number(detail.expectedReturnPct || 0),
    managementFeePct: Number(detail.managementFeePct || 0),
    performanceFeePct: Number(detail.performanceFeePct || 0),
    riskLevel: detail.riskLevel || "",
    fundType: detail.fundType || "",
    fundAssetType: detail.fundAssetType || "",
    website: detail.website || "",
    description: detail.description || "",
    closedOrderBookAt: detail.closedOrderBookAt || "",
    closedBankNote: detail.closedBankNote || "",
    tradingTimeString: detail.tradingTimeString || "",
    closedOrderBookTimeString: detail.closedOrderBookTimeString || "",
    closedBankNoteTimeString: detail.closedBankNoteTimeString || "",
    transactionDurationDays: Number(detail.transactionDurationDays || 0),
    navToPreviousPct: Number(detail.navToPreviousPct || 0),
    navChange: {
      navTo1MonthsPct: Number(detail.navTo1MonthsPct || 0),
      navTo3MonthsPct: Number(detail.navTo3MonthsPct || 0),
      navTo6MonthsPct: Number(detail.navTo6MonthsPct || 0),
      navTo12MonthsPct: Number(detail.navTo12MonthsPct || 0),
      navTo24MonthsPct: Number(detail.navTo24MonthsPct || 0),
      navTo36MonthsPct: Number(detail.navTo36MonthsPct || 0),
      navTo60MonthsPct: Number(detail.navTo60MonthsPct || 0),
      navTo7YearsPct: Number(detail.navTo7YearsPct || 0),
      navTo10YearsPct: Number(detail.navTo10YearsPct || 0),
      navToBeginningPct: Number(detail.navToBeginningPct || 0),
    },
    owner: {
      name: detail.owner?.name || "",
      shortName: detail.owner?.shortName || "",
      website: detail.owner?.website || "",
      email: detail.owner?.email || "",
      phone: detail.owner?.phone || "",
      address: detail.owner?.address || "",
      avatarUrl: detail.owner?.avatarUrl || "",
    },
    productPrograms: detail.productPrograms || [],
    sellFeeRules: detail.sellFeeRules || [],
    assetHoldings: detail.assetHoldings || [],
    industries: detail.industries || [],
    documents: detail.documents || [],
    topHoldings: detail.topHoldings || [],
  };
}

export function saveProjectionYears(value: number) {
  const years = parseProjectionYears(value);
  repository.setSetting(SETTING_KEYS.projectionYears, String(years));
  return years;
}

export function saveWatchlistConfig(input: {
  trackedCodes?: string[];
  monthlyContributionMap?: Record<string, number>;
}) {
  const allCodes = repository.getFundCodes();
  const trackedSet = new Set((input.trackedCodes ?? []).map((code) => String(code || "").trim()));

  repository.setWatchlistBulk(
    allCodes.map((code) => ({
      fundCode: code,
      tracked: trackedSet.has(code),
    })),
  );

  const monthlyMap = input.monthlyContributionMap ?? {};
  Object.entries(monthlyMap).forEach(([code, amount]) => {
    if (!allCodes.includes(code)) return;
    repository.setWatchlistItem({
      fundCode: code,
      monthlyContribution: parseMonthlyContribution(amount),
    });
  });

  log(
    "INFO",
    "saveWatchlistConfig",
    "Đã cập nhật cấu hình theo dõi",
    `tracked=${trackedSet.size}, monthlyConfigured=${Object.keys(monthlyMap).length}`,
  );

  void ensureProjectionHistory({ force: false, maxCodes: 24 }).catch((error) => {
    log(
      "WARN",
      "saveWatchlistConfig",
      "Không thể backfill lịch sử cho dự phóng sau khi cập nhật cấu hình",
      error instanceof Error ? error.message : String(error),
    );
  });
}

export function saveWatchlistBoardConfig(input: {
  mainCode?: string;
  quickCodes?: string[];
}) {
  const availableSet = new Set(uniqueCodes(repository.getFundCodes()));
  const requestedMain = cleanCode(input.mainCode || "");
  const requestedQuick = uniqueCodes(input.quickCodes ?? [], availableSet);

  const queue = [requestedMain, ...requestedQuick];
  const boardCodes = uniqueCodes(queue, availableSet).slice(0, BOARD_TOTAL_SLOTS);
  const mainCode = availableSet.has(requestedMain)
    ? requestedMain
    : boardCodes[0] || "";
  const quickCodes = boardCodes.filter((code) => code !== mainCode).slice(0, BOARD_QUICK_SLOTS);
  const normalizedBoardCodes = mainCode ? [mainCode, ...quickCodes] : quickCodes;

  repository.setSetting(
    SETTING_KEYS.watchlistBoardCodes,
    normalizedBoardCodes.join(","),
  );

  log(
    "INFO",
    "saveWatchlistBoardConfig",
    "Đã lưu bố cục Trading Board",
    `main=${mainCode || ""}, quick=${quickCodes.join("|")}`,
  );

  return {
    mainCode,
    quickCodes,
    boardCodes: normalizedBoardCodes,
  };
}

export function deleteTransactionById(id: number) {
  const deleted = repository.deleteTransaction(id);
  if (!deleted) {
    throw new Error("Không tìm thấy giao dịch cần xóa.");
  }

  log(
    "INFO",
    "deleteTransactionById",
    "Đã xóa giao dịch",
    `id=${deleted.id}, fundCode=${deleted.fundCode}, amount=${deleted.amount}`,
  );

  return {
    id: deleted.id,
    fundCode: deleted.fundCode,
    amount: deleted.amount,
    source: deleted.source,
  };
}

export function getTransactionsData(): TransactionsData {
  const { funds, navByCode, investedByCode, ccqByCode, transactions, sales } = getHoldings();
  const watchlistItems = repository.getWatchlistItems();
  const watchMap = new Map(watchlistItems.map((item) => [item.fundCode, item]));

  const fundRows = funds.map((fund) => {
    const invested = Number(investedByCode[fund.code] || 0);
    const ccq = Number(ccqByCode[fund.code] || 0);
    const nav = Number(navByCode[fund.code] || 0);
    const asset = ccq * nav;
    const pnlPercent = invested > 0 ? (asset - invested) / invested : 0;

    return {
      code: fund.code,
      invested,
      ccq,
      nav,
      asset,
      pnlPercent,
      monthlyContribution: Number(watchMap.get(fund.code)?.monthlyContribution || 0),
      tracked: Boolean(watchMap.get(fund.code)?.tracked),
    };
  });

  const session = getTradingSession();
  const transactionPerformance = buildTransactionPerformanceRows({
    transactions,
    sales,
    navByCode,
  });

  return {
    generatedAt: formatDateTimeVi(new Date()),
    session,
    projectionYears: getProjectionYears(),
    funds: fundRows,
    transactions,
    sales,
    transactionPerformance,
  };
}

export async function getTransactionsDataAuto(): Promise<TransactionsData> {
  await ensureAutomatedSync("transactions");
  ensureMonthlyAutoContributions();
  return getTransactionsData();
}

export async function getFundDetailByCodeAuto(code: string): Promise<FundDetailData> {
  await ensureAutomatedSync("fund_detail");
  return getFundDetailByCode(code);
}

export function getDashboardData(): DashboardData {
  const { funds, navByCode, investedByCode, ccqByCode } = getHoldings();
  const watchlistItems = repository.getWatchlistItems();
  const watchMap = new Map(watchlistItems.map((item) => [item.fundCode, item]));

  const fundRows = funds.map((fund) => {
    const invested = Number(investedByCode[fund.code] || 0);
    const ccq = Number(ccqByCode[fund.code] || 0);
    const nav = Number(navByCode[fund.code] || 0);
    const asset = ccq * nav;
    const pnlPercent = invested > 0 ? (asset - invested) / invested : 0;

    return {
      code: fund.code,
      invested,
      ccq,
      nav,
      asset,
      pnlPercent,
      monthlyContribution: Number(watchMap.get(fund.code)?.monthlyContribution || 0),
      tracked: Boolean(watchMap.get(fund.code)?.tracked),
    };
  });

  const totalInvested = fundRows.reduce((sum, row) => sum + row.invested, 0);
  const totalAsset = fundRows.reduce((sum, row) => sum + row.asset, 0);
  const pnlValue = totalAsset - totalInvested;
  const pnlPercent = totalInvested > 0 ? pnlValue / totalInvested : 0;

  const totalNavPoints = repository.getAllNavPointCount();
  const updatedAt = funds.length
    ? funds
        .map((fund) => fund.updatedAt)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  const projectionYears = getProjectionYears();
  const projectionTargetCodes = getProjectionTargetCodesFromState({
    ccqByCode,
    watchlistItems,
  });
  const cagrByCode = getCagrMap(projectionTargetCodes);
  const volatilityByCode = getVolatilityMap(projectionTargetCodes);

  const projection = computeProjection({
    years: projectionYears,
    funds,
    navByCode,
    ccqByCode,
    watchlistItems,
    cagrByCode,
    volatilityByCode,
  });

  const snapshotMap = new Map<string, number>();
  repository.getSnapshots().forEach((item) => {
    const date = String(item.date || "").trim();
    if (!date) return;
    snapshotMap.set(date, Number(item.totalAsset || 0));
  });

  if (Number.isFinite(totalAsset) && totalAsset > 0) {
    snapshotMap.set(todayDateKey(), totalAsset);
  }

  const snapshots = Array.from(snapshotMap.entries())
    .map(([date, asset]) => ({
      date,
      totalAsset: Number(asset || 0),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    summary: {
      totalInvested,
      totalAsset,
      pnlValue,
      pnlPercent,
      updatedAt,
      totalFunds: funds.length,
      totalNavPoints,
    },
    projection: projection.result,
    projectionSeries: projection.series,
    funds: fundRows,
    snapshots,
    pieAllocation: fundRows
      .filter((item) => item.asset > 0)
      .map((item) => ({ name: item.code, value: item.asset })),
    pnlByFund: fundRows
      .filter((item) => item.ccq > 0 || item.monthlyContribution > 0)
      .map((item) => ({ code: item.code, pnlPercent: item.pnlPercent })),
  };
}

export async function getDashboardDataAuto(): Promise<DashboardData> {
  await ensureAutomatedSync("dashboard");
  ensureMonthlyAutoContributions();
  return getDashboardData();
}

export async function getWatchlistData(input?: {
  selectedCodes?: string[];
  mainCode?: string;
}) {
  const { funds, navByCode, ccqByCode } = getHoldings();
  const settings = repository.getSettings();
  const watchlistItems = repository.getWatchlistItems();
  const watchMap = new Map(watchlistItems.map((item) => [cleanCode(item.fundCode), item]));
  const availableCodes = uniqueCodes(funds.map((fund) => fund.code));
  const availableSet = new Set(availableCodes);

  const configuredCodes = parseBoardCodesFromSetting(
    settings[SETTING_KEYS.watchlistBoardCodes] || "",
    availableSet,
  );

  const trendScores = buildTrendScoreMap(funds);
  const holdingCodes = getHoldingCodesRanked({
    funds,
    navByCode,
    ccqByCode,
  });

  const boardSelection = buildBoardSelection({
    funds,
    selectedCodes: input?.selectedCodes,
    mainCode: input?.mainCode,
    configuredCodes,
    holdingCodes,
    trendScores,
  });

  if (!boardSelection.boardCodes.length && availableCodes.length) {
    boardSelection.boardCodes = [availableCodes[0]];
    boardSelection.mainCode = availableCodes[0];
    boardSelection.quickCodes = [];
  }

  await ensureWatchlistHistory({
    force: false,
    maxCodes: Math.max(BOARD_TOTAL_SLOTS, APP_CONFIG.maxWatchlistItems),
    selectedCodes: boardSelection.boardCodes,
  });

  const items = boardSelection.boardCodes.map((code) => {
    const rawSourceSeries = repository
      .getNavSeriesByCode(code, 12000)
      .map((point) => ({
        timestamp: point.timestamp,
        nav: Number(point.nav || 0),
        source: String(point.source || ""),
      }))
      .filter((point) => Number.isFinite(point.nav) && point.nav > 0);

    const displaySelection = chooseDisplaySeries(uniqueByTimestamp(rawSourceSeries));

    const sourceSeries = displaySelection.series.map((point) => ({
      timestamp: point.timestamp,
      nav: point.nav,
    }));

    const rawGapHours = autoGapHoursForSeries(sourceSeries);
    const lineGapHours = Math.min(24 * 14, Math.max(3, rawGapHours));
    let filteredSeries = compressSeriesByGap(sourceSeries, lineGapHours);
    if (filteredSeries.length < 2 && sourceSeries.length >= 2) {
      filteredSeries = sourceSeries;
    }

    const lineSeries = buildLineSeriesWithBreaks(filteredSeries, lineGapHours, 2.2);
    const candlestickSeries = buildCandlestickRows(sourceSeries, 24);

    const source = filteredSeries.length
      ? displaySelection.droppedSparseTail
        ? "NAV_History + API history (đã loại nhánh đuôi quá thưa)"
        : "NAV_History + API history"
      : "Không đủ dữ liệu lịch sử";

    return {
      code,
      source,
      rawPoints: sourceSeries.length,
      filteredPoints: filteredSeries.length,
      gapLabel: formatGapLabel(lineGapHours),
      lineSeries,
      candlestickSeries,
    };
  });

  const universe = funds
    .map((fund) => {
      const code = cleanCode(fund.code);
      const holdingAsset = Number(ccqByCode[code] || 0) * Number(navByCode[code] || 0);
      return {
        code,
        name: fund.name,
        isHolding: holdingAsset > 0,
        monthlyContribution: Number(watchMap.get(code)?.monthlyContribution || 0),
        trendScore: Number(trendScores[code] || 0),
      };
    })
    .sort((a, b) => {
      if (a.isHolding !== b.isHolding) return a.isHolding ? -1 : 1;
      const trendDiff = b.trendScore - a.trendScore;
      if (Math.abs(trendDiff) > 1e-12) return trendDiff;
      return a.code.localeCompare(b.code);
    });

  const result: WatchlistData = {
    generatedAt: formatDateTimeVi(new Date()),
    session: getTradingSession(),
    mainCode: boardSelection.mainCode,
    quickCodes: boardSelection.quickCodes,
    boardCodes: boardSelection.boardCodes,
    universe,
    items,
  };

  return result;
}

export async function getWatchlistDataAuto(input?: {
  selectedCodes?: string[];
  mainCode?: string;
}): Promise<WatchlistData> {
  await ensureAutomatedSync("watchlist");
  ensureMonthlyAutoContributions();
  return getWatchlistData(input);
}

export function getSystemLogs(limit = 500) {
  return repository.getSystemLogs(limit);
}

export function getUsageGuide() {
  return USAGE_GUIDE;
}

export function getSystemSummary() {
  const settings = repository.getSettings();
  return {
    cronSecret: settings[SETTING_KEYS.cronSecret] ?? "",
    updateIntervalMinutes: Number(settings[SETTING_KEYS.updateIntervalMinutes] ?? 15),
    snapshotIntervalHours: Number(settings[SETTING_KEYS.snapshotIntervalHours] ?? 1),
    lastAutoSyncAt: settings[SETTING_KEYS.lastAutoSyncAt] ?? "",
  };
}

export async function runCron(params: { secret: string; task: "realtime" | "snapshot" }) {
  const settings = repository.getSettings();
  const expected = settings[SETTING_KEYS.cronSecret] || "";
  if (!expected || params.secret !== expected) {
    throw new Error("Cron secret không hợp lệ.");
  }

  if (params.task === "realtime") {
    return updateRealtimeNav();
  }

  if (params.task === "snapshot") {
    return takeSnapshot();
  }

  throw new Error("Task cron không hợp lệ.");
}
