import { APP_CONFIG } from "@/lib/server/config";
import type { FundApiItem, LogLevel } from "@/lib/server/types";

type ApiLogger = (
  level: LogLevel,
  action: string,
  message: string,
  detail?: string,
) => void;

function resolveFmarketAuthToken() {
  const candidates = [
    process.env.FMARKET_AUTH_TOKEN,
    process.env.FMARKET_BEARER_TOKEN,
    process.env.FMARKET_API_BEARER,
  ];

  for (const candidate of candidates) {
    const token = String(candidate || "").trim();
    if (token) return token;
  }

  return "";
}

export interface ProductDetailSnapshot {
  productId: number;
  code: string;
  shortCode: string;
  name: string;
  tradeCode: string;
  sipCode: string;
  company: string;
  status: string;
  price: number;
  nav: number;
  lastYearNav: number;
  lastNavDateIso: string;
  firstIssueAtIso: string;
  approveAtIso: string;
  updatedAtIso: string;
  buyMinValue: number;
  buyMaxValue: number;
  sellMin: number;
  transferSellMin: number;
  holdingMin: number;
  isOnlySellMinNotSellAll: boolean;
  holdingVolume: number;
  avgAnnualReturnPct: number;
  annualizedReturn36MonthsPct: number;
  expectedReturnPct: number;
  managementFeePct: number;
  performanceFeePct: number;
  riskLevel: string;
  fundType: string;
  fundAssetType: string;
  website: string;
  description: string;
  closedOrderBookAt: string;
  closedBankNote: string;
  tradingTimeString: string;
  closedOrderBookTimeString: string;
  closedBankNoteTimeString: string;
  transactionDurationDays: number;
  navToPreviousPct: number;
  navTo1MonthsPct: number;
  navTo3MonthsPct: number;
  navTo6MonthsPct: number;
  navTo12MonthsPct: number;
  navTo24MonthsPct: number;
  navTo36MonthsPct: number;
  navTo60MonthsPct: number;
  navTo7YearsPct: number;
  navTo10YearsPct: number;
  navToBeginningPct: number;
  owner: {
    name: string;
    shortName: string;
    website: string;
    email: string;
    phone: string;
    address: string;
    avatarUrl: string;
  };
  productPrograms: Array<{
    id: number;
    tradeCode: string;
    name: string;
    schemeCode: string;
    buyMinValue: number;
    sellMin: number;
    holdingMin: number;
  }>;
  sellFeeRules: Array<{
    id: number;
    type: string;
    beginOperator: string;
    beginVolume: number;
    endOperator: string;
    endVolume: number | null;
    feePercent: number;
    feeUnitType: string;
    isUnitByDay: boolean;
    programName: string;
    schemeCode: string;
  }>;
  assetHoldings: Array<{
    assetTypeCode: string;
    assetTypeName: string;
    colorCode: string;
    assetPercent: number;
  }>;
  industries: Array<{
    industry: string;
    assetPercent: number;
  }>;
  documents: Array<{
    fileName: string;
    url: string;
    applyAt: string;
    documentType: string;
  }>;
  topHoldings: Array<{
    stockCode: string;
    netAssetPercent: number;
    industry: string;
    price: number;
    changeFromPrevious: number;
    changeFromPreviousPercent: number;
  }>;
  annualReturnEst: number;
}

interface CacheItem {
  expiredAt: number;
  value: unknown;
}

type GlobalWithCache = typeof globalThis & {
  __fmarketApiCache?: Map<string, CacheItem>;
};

function getMemoryCache() {
  const g = globalThis as GlobalWithCache;
  if (!g.__fmarketApiCache) {
    g.__fmarketApiCache = new Map<string, CacheItem>();
  }
  return g.__fmarketApiCache;
}

function cacheGet<T>(key: string): T | null {
  const cache = getMemoryCache();
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiredAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return item.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs: number) {
  const cache = getMemoryCache();
  cache.set(key, {
    expiredAt: Date.now() + ttlMs,
    value,
  });
}

function randomUserAgent() {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  ];

  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function toSafeString(input: unknown) {
  try {
    return typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    return String(input ?? "");
  }
}

function shorten(input: unknown, maxLength = 400) {
  const text = toSafeString(input);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function clampNumber(value: unknown, fallback = 0, min = -100, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toIsoFromUnknown(value: unknown) {
  if (value === null || value === undefined || value === "") return "";

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const ts = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric;
    const date = new Date(ts);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function extractServerMessage(body: string) {
  if (!body) return "";
  try {
    const data = JSON.parse(body) as { message?: string; error?: { message?: string } };
    return data.message ?? data.error?.message ?? "";
  } catch {
    return "";
  }
}

function getNestedValue(obj: unknown, path: string[]) {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined) return null;
    if (typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function extractFundRows(response: unknown): Record<string, unknown>[] {
  if (Array.isArray(response)) {
    return response as Record<string, unknown>[];
  }

  const candidates = [
    getNestedValue(response, ["data", "rows"]),
    getNestedValue(response, ["data", "items"]),
    getNestedValue(response, ["data", "data", "rows"]),
    getNestedValue(response, ["data", "data", "items"]),
    getNestedValue(response, ["rows"]),
    getNestedValue(response, ["items"]),
    getNestedValue(response, ["list"]),
    getNestedValue(response, ["data", "content"]),
    getNestedValue(response, ["result", "rows"]),
    getNestedValue(response, ["result", "items"]),
  ];

  const match = candidates.find((item) => Array.isArray(item));
  return (match as Record<string, unknown>[] | undefined) ?? [];
}

function pickString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickNumber(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(obj[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function normalizeFundItem(item: Record<string, unknown>, source: string): FundApiItem {
  const code = pickString(item, [
    "shortName",
    "short_name",
    "code",
    "productCode",
    "product_code",
    "ticker",
    "symbol",
    "fundCode",
  ]);

  const name =
    pickString(item, ["name", "fullName", "full_name", "productName", "product_name"]) ||
    code;

  const company = pickString(item, [
    "productCompanyName",
    "companyName",
    "issuerName",
    "fundCompanyName",
    "managementCompany",
  ]);

  const nav = pickNumber(item, [
    "nav",
    "latestNav",
    "lastestNAV",
    "latestNAV",
    "navPrice",
    "nav_price",
    "tradingDateNav",
    "lastNav",
  ]);

  const lastYearNav = pickNumber(item, ["lastYearNav", "lastYearNAV", "navLastYear", "nav_1y"]);
  const perf1y = pickNumber(item, ["performance1Y", "performance_1y", "return1Y", "return_1y", "profit1Y"]);

  let annualReturnEst = 0;
  if (nav > 0 && lastYearNav > 0) {
    annualReturnEst = nav / lastYearNav - 1;
  } else if (perf1y > 0 && perf1y < 10) {
    annualReturnEst = perf1y > 1 ? perf1y / 100 : perf1y;
  }

  let productId = pickNumber(item, ["id", "productId"]);
  if (!productId) {
    const nested = (item.productFund as Record<string, unknown> | undefined)?.id;
    productId = Number(nested) || 0;
  }

  return {
    code,
    name,
    nav,
    company,
    annualReturnEst,
    productId,
    source,
  };
}

function apiUrls() {
  const uniqueUrls = APP_CONFIG.apiUrls.map((item) => item.trim()).filter(Boolean);
  if (!uniqueUrls.length) return [APP_CONFIG.primaryApiUrl];
  return APP_CONFIG.usePrimaryApiOnly ? [uniqueUrls[0]] : uniqueUrls;
}

function buildPayloadVariants(page: number, pageSize: number) {
  if (APP_CONFIG.strictFundPayload) {
    return [
      {
        types: ["TRADING_FUND"],
        issuerIds: [],
        page,
        pageSize,
        sortBy: "name",
        sortOrder: "ASC",
        isIpo: false,
        isBuyable: false,
        fundAssetTypes: [],
      },
    ];
  }

  return [
    {
      types: ["TRADING_FUND"],
      issuerIds: [],
      page,
      pageSize,
      sortBy: "name",
      sortOrder: "ASC",
      isIpo: false,
      isBuyable: false,
      fundAssetTypes: [],
    },
    {
      searchField: "",
      pageSize,
      page,
      isFundCertificate: true,
      orderBy: "name",
      orderDirection: "asc",
    },
    {
      search: "",
      page,
      size: pageSize,
      isFundCertificate: true,
      sortField: "name",
      sortDirection: "asc",
    },
  ];
}

async function fetchWithRetry(params: {
  method: "POST" | "GET";
  url: string;
  payload?: unknown;
  cacheKey: string;
  logger: ApiLogger;
  extraHeaders?: Record<string, string>;
}) {
  const attempts = 5;
  let latestError = "";
  let latestStatus = 0;
  let latestResponse = "";

  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(params.url, {
        method: params.method,
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: "https://fmarket.vn",
          Referer: "https://fmarket.vn/",
          "User-Agent": randomUserAgent(),
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          ...(params.method === "POST" ? { "Content-Type": "application/json" } : {}),
          ...(params.extraHeaders ?? {}),
        },
        body: params.method === "POST" ? JSON.stringify(params.payload ?? {}) : undefined,
        cache: "no-store",
      });

      latestStatus = response.status;
      latestResponse = await response.text();
      if (response.ok && latestResponse) {
        const json = JSON.parse(latestResponse) as Record<string, unknown>;
        json.__source = params.url;
        cacheSet(params.cacheKey, json, 180_000);
        return json;
      }

      latestError = `HTTP ${response.status}${extractServerMessage(latestResponse) ? ` - ${extractServerMessage(latestResponse)}` : ""}`;
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 400 * Math.pow(2, i)));
        continue;
      }
      if (response.status === 400) {
        break;
      }
      break;
    } catch (error) {
      latestError = String(error);
      await new Promise((resolve) => setTimeout(resolve, 400 * Math.pow(2, i)));
    }
  }

  const cached = cacheGet<Record<string, unknown>>(params.cacheKey);
  if (cached) {
    params.logger("INFO", "fetchWithRetry", "Dùng dữ liệu cache", `key=${params.cacheKey}`);
    return cached;
  }

  params.logger(
    "ERROR",
    "fetchWithRetry",
    "API request thất bại",
    `method=${params.method}, url=${params.url}, code=${latestStatus}, error=${shorten(latestError, 1200)}, response=${shorten(latestResponse, 1200)}`,
  );
  throw new Error(`Fmarket API failed: ${latestError || "Unknown error"}`);
}

function buildGetUrl(url: string, query: Record<string, string | number | boolean>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === "" || value === null || value === undefined) return;
    params.set(key, String(value));
  });
  const serialized = params.toString();
  if (!serialized) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${serialized}`;
}

async function fetchFundPageWithFallback(page: number, pageSize: number, logger: ApiLogger) {
  const urls = apiUrls();
  const payloads = buildPayloadVariants(page, pageSize);
  let latestError = "";

  for (let u = 0; u < urls.length; u += 1) {
    for (let p = 0; p < payloads.length; p += 1) {
      try {
        const response = await fetchWithRetry({
          method: "POST",
          url: urls[u],
          payload: payloads[p],
          cacheKey: `funds_${u}_${p}_${page}`,
          logger,
        });
        const rows = extractFundRows(response);
        if (rows.length) {
          return {
            rows,
            source: String((response as Record<string, unknown>).__source ?? urls[u]),
          };
        }
      } catch (error) {
        latestError = String(error);
        logger(
          "WARN",
          "fetchFundPageWithFallback",
          "POST payload thất bại",
          `url=${urls[u]}, payload=${shorten(payloads[p], 600)}, error=${shorten(latestError, 600)}`,
        );
      }
    }

    if (!APP_CONFIG.enableGetFallback) {
      continue;
    }

    try {
      const getUrl = buildGetUrl(urls[u], {
        page,
        pageSize,
        size: pageSize,
        limit: pageSize,
        isFundCertificate: true,
        isIpo: false,
      });
      const response = await fetchWithRetry({
        method: "GET",
        url: getUrl,
        cacheKey: `funds_get_${u}_${page}`,
        logger,
      });
      const rows = extractFundRows(response);
      if (rows.length) {
        return {
          rows,
          source: String((response as Record<string, unknown>).__source ?? getUrl),
        };
      }
    } catch (error) {
      latestError = String(error);
      logger(
        "WARN",
        "fetchFundPageWithFallback",
        "GET fallback thất bại",
        `url=${urls[u]}, error=${shorten(latestError, 600)}`,
      );
    }
  }

  if (latestError) {
    logger("ERROR", "fetchFundPageWithFallback", "Không lấy được dữ liệu trang quỹ", latestError);
  }
  return {
    rows: [] as Record<string, unknown>[],
    source: "",
  };
}

export async function fetchAllFunds(logger: ApiLogger): Promise<FundApiItem[]> {
  const fundMap = new Map<string, FundApiItem>();
  let page = 1;
  let guard = 0;

  while (guard < 100) {
    guard += 1;
    const result = await fetchFundPageWithFallback(page, APP_CONFIG.pageSize, logger);
    if (!result.rows.length) break;

    result.rows.forEach((row) => {
      const normalized = normalizeFundItem(row, result.source || APP_CONFIG.primaryApiUrl);
      if (!normalized.code) return;
      fundMap.set(normalized.code, normalized);
    });

    if (result.rows.length < APP_CONFIG.pageSize) break;
    page += 1;
  }

  return Array.from(fundMap.values()).sort((a, b) => a.code.localeCompare(b.code));
}

type HistoryRow = { timestamp: string; fundCode: string; nav: number; source: string };

function normalizeEpochMs(value: number) {
  if (!Number.isFinite(value)) return Number.NaN;
  if (Math.abs(value) < 1e11) return value * 1000;
  return value;
}

function toDateKey(value: unknown) {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const ts = normalizeEpochMs(value);
    if (!Number.isFinite(ts)) return "";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();
  if (!text) return "";

  const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch?.[1]) {
    return dateMatch[1];
  }

  if (/^\d{10,13}$/.test(text)) {
    const ts = normalizeEpochMs(Number(text));
    if (!Number.isFinite(ts)) return "";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toEpochMs(value: unknown) {
  if (value === null || value === undefined) return Number.NaN;
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return normalizeEpochMs(value);
  }
  if (typeof value !== "string") {
    return Number.NaN;
  }

  const text = value.trim();
  if (!text) return Number.NaN;
  if (/^\d{10,13}$/.test(text)) {
    return normalizeEpochMs(Number(text));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return Number.NaN;
  return parsed.getTime();
}

function toHistoryTimestamp(dateKey: string) {
  return `${dateKey}T12:00:00.000Z`;
}

function pickHistoryRows(response: unknown) {
  const candidates = [
    getNestedValue(response, ["data"]),
    getNestedValue(response, ["data", "navHistory"]),
    getNestedValue(response, ["data", "history"]),
    getNestedValue(response, ["data", "rows"]),
    getNestedValue(response, ["data", "items"]),
    getNestedValue(response, ["data", "data"]),
    getNestedValue(response, ["data", "data", "rows"]),
    getNestedValue(response, ["data", "data", "items"]),
    getNestedValue(response, ["navHistory"]),
    getNestedValue(response, ["history"]),
    getNestedValue(response, ["rows"]),
    getNestedValue(response, ["items"]),
  ];

  return candidates.find((item) => Array.isArray(item)) as
    | Array<Record<string, unknown>>
    | undefined;
}

function pickHistoryNav(item: Record<string, unknown>) {
  const navCandidates = [
    item.nav,
    item.latestNav,
    item.navValue,
    item.value,
    item.navPrice,
    item.close,
    item.price,
  ];

  for (const candidate of navCandidates) {
    const nav = Number(candidate);
    if (Number.isFinite(nav) && nav > 0) return nav;
  }

  return Number.NaN;
}

function extractHistoryRows(response: unknown, code: string, sourceTag: string) {
  const rows = pickHistoryRows(response);
  if (!rows?.length) return [];

  const byDateKey = new Map<
    string,
    {
      row: HistoryRow;
      quality: number;
      preciseTs: number;
    }
  >();

  rows.forEach((item) => {
    const nav = pickHistoryNav(item);
    if (!Number.isFinite(nav) || nav <= 0) return;

    const primaryDateRaw =
      item.date ?? item.navDate ?? item.tradingDate ?? item.time ?? item.timestamp;
    const fallbackDateRaw = item.createdAt ?? item.updatedAt;

    const primaryDateKey = toDateKey(primaryDateRaw);
    const fallbackDateKey = toDateKey(fallbackDateRaw);
    const dateKey = primaryDateKey || fallbackDateKey;
    if (!dateKey) return;

    const primaryTs = toEpochMs(primaryDateRaw);
    const fallbackTs = toEpochMs(fallbackDateRaw);
    const preciseTs = Number.isFinite(primaryTs)
      ? primaryTs
      : Number.isFinite(fallbackTs)
        ? fallbackTs
        : new Date(toHistoryTimestamp(dateKey)).getTime();

    const quality =
      (primaryDateKey ? 3 : 0) +
      (Number.isFinite(primaryTs) ? 2 : 0) +
      (Number.isFinite(fallbackTs) ? 1 : 0);

    const row: HistoryRow = {
      timestamp: toHistoryTimestamp(dateKey),
      fundCode: code,
      nav,
      source: sourceTag,
    };

    const existing = byDateKey.get(dateKey);
    if (
      !existing ||
      quality > existing.quality ||
      (quality === existing.quality && preciseTs >= existing.preciseTs)
    ) {
      byDateKey.set(dateKey, {
        row,
        quality,
        preciseTs,
      });
    }
  });

  return Array.from(byDateKey.values())
    .map((item) => item.row)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function filterRowsByDateWindow(
  rows: HistoryRow[],
  fromDate: string,
  toDate: string,
  paddingDays = 45,
) {
  const fromMs = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${toDate}T23:59:59.999Z`).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return rows;

  const safePaddingMs = Math.max(0, paddingDays) * 24 * 60 * 60 * 1000;
  const minTs = fromMs - safePaddingMs;
  const maxTs = toMs + safePaddingMs;

  const filtered = rows.filter((row) => {
    const ts = new Date(row.timestamp).getTime();
    return Number.isFinite(ts) && ts >= minTs && ts <= maxTs;
  });

  return filtered.length ? filtered : rows;
}

function toDateString(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function mergeHistoryRows(
  rows: Array<{ timestamp: string; fundCode: string; nav: number; source: string }>,
) {
  function sourceScore(source: string) {
    const text = String(source || "").toLowerCase();
    if (text.includes("navto6months")) return 120;
    if (text.includes("navto12months")) return 110;
    if (text.includes("navto24months")) return 100;
    if (text.includes("navto36months")) return 90;
    if (text.includes("navto60months")) return 80;
    if (text.includes("recent")) return 60;
    if (text.includes("full") || text.includes("beginning")) return 40;
    return 20;
  }

  const map = new Map<
    string,
    {
      row: HistoryRow;
      score: number;
      ts: number;
    }
  >();

  rows.forEach((row) => {
    const dateKey = toDateKey(row.timestamp);
    if (!dateKey) return;

    const ts = new Date(toHistoryTimestamp(dateKey)).getTime();
    if (!Number.isFinite(ts)) return;

    const score = sourceScore(row.source);
    const existing = map.get(dateKey);

    if (!existing || score > existing.score || (score === existing.score && ts >= existing.ts)) {
      map.set(dateKey, {
        row: {
          timestamp: toHistoryTimestamp(dateKey),
          fundCode: row.fundCode,
          nav: row.nav,
          source: row.source,
        },
        score,
        ts,
      });
    }
  });

  return Array.from(map.values())
    .map((item) => item.row)
    .sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export async function fetchHistoryByProductId(params: {
  code: string;
  productId: number;
  fromDate: string;
  toDate: string;
  mode?: "recent" | "full" | "both";
  logger: ApiLogger;
}) {
  if (!params.productId) {
    params.logger("ERROR", "fetchHistoryByProductId", "Không có Product ID", `code=${params.code}`);
    return [] as Array<{ timestamp: string; fundCode: string; nav: number; source: string }>;
  }

  const requestedFrom = toDateString(params.fromDate) || params.fromDate;
  const requestedTo = toDateString(params.toDate) || params.toDate;
  const mode = params.mode ?? "both";

  try {
    const collected: Array<{ timestamp: string; fundCode: string; nav: number; source: string }> = [];
    const authToken = resolveFmarketAuthToken();
    const historyHeaders: Record<string, string> = {
      "f-language": "vi",
    };
    if (authToken) {
      historyHeaders.Authorization = `Bearer ${authToken}`;
    }

    const requestPlans =
      mode === "recent"
        ? (["recent"] as const)
        : mode === "full"
          ? (["full"] as const)
          : (["recent", "full"] as const);

    for (const plan of requestPlans) {
      const recentPeriods = [
        "navTo6Months",
        "navTo12Months",
        "navTo24Months",
        "navTo36Months",
        "navTo60Months",
      ];

      const requestGroups: Array<{ label: string; payloadVariants: Array<Record<string, unknown>> }> =
        plan === "recent"
          ? [
              ...recentPeriods.map((navPeriod) => ({
                label: navPeriod,
                payloadVariants: [
                  {
                    productId: params.productId,
                    isAllData: 0,
                    navPeriod,
                  },
                  {
                    productId: params.productId,
                    isAllData: "0",
                    navPeriod,
                  },
                ],
              })),
              {
                label: "dateRange",
                payloadVariants: [
                  {
                    productId: params.productId,
                    fromDate: requestedFrom,
                    toDate: requestedTo,
                  },
                ],
              },
            ]
          : [
              {
                label: "navToBeginning",
                payloadVariants: [
                  {
                    productId: params.productId,
                    isAllData: 1,
                    navPeriod: "navToBeginning",
                  },
                  {
                    productId: params.productId,
                    isAllData: "1",
                    navPeriod: "navToBeginning",
                  },
                  {
                    productId: params.productId,
                  },
                ],
              },
            ];

      for (const group of requestGroups) {
        let bestRows: HistoryRow[] = [];

        for (let p = 0; p < group.payloadVariants.length; p += 1) {
          const payload = group.payloadVariants[p];

          try {
            const response = await fetchWithRetry({
              method: "POST",
              url: APP_CONFIG.historyApiUrl,
              payload,
              cacheKey: `history_${params.code}_${params.productId}_${plan}_${group.label}_${requestedTo}_v${p}`,
              logger: params.logger,
              extraHeaders: historyHeaders,
            });

            const rows = extractHistoryRows(
              response,
              params.code,
              `history_api_${plan}_${group.label}`,
            );

            if (rows.length > bestRows.length) {
              bestRows = rows;
            }

            if (rows.length > 0) {
              break;
            }
          } catch (error) {
            params.logger(
              "WARN",
              "fetchHistoryByProductId",
              "Biến thể payload lịch sử NAV thất bại",
              `code=${params.code}, productId=${params.productId}, mode=${plan}, segment=${group.label}, variant=${p}, payload=${shorten(payload, 260)}, error=${shorten(error, 600)}`,
            );
          }
        }

        if (bestRows.length) {
          collected.push(...bestRows);
        }
      }
    }

    const merged = mergeHistoryRows(collected);
    const normalized =
      mode === "recent"
        ? filterRowsByDateWindow(merged, requestedFrom, requestedTo, 60)
        : merged;

    if (normalized.length) {
      const latestTs = new Date(normalized[normalized.length - 1].timestamp).getTime();
      const requestedToTs = new Date(requestedTo).getTime();
      const lagDays =
        Number.isFinite(latestTs) && Number.isFinite(requestedToTs)
          ? Math.floor((requestedToTs - latestTs) / (24 * 60 * 60 * 1000))
          : 0;

      if (!authToken && lagDays > 10) {
        params.logger(
          "WARN",
          "fetchHistoryByProductId",
          "Lịch sử NAV có độ trễ lớn khi chưa có token",
          `code=${params.code}, productId=${params.productId}, lagDays=${lagDays}, hãy cấu hình FMARKET_AUTH_TOKEN để lấy dữ liệu realtime hơn`,
        );
      }
    }

    return normalized;
  } catch (error) {
    params.logger(
      "ERROR",
      "fetchHistoryByProductId",
      "Lấy lịch sử NAV thất bại",
      `code=${params.code}, productId=${params.productId}, error=${shorten(error, 800)}`,
    );
    return [] as Array<{ timestamp: string; fundCode: string; nav: number; source: string }>;
  }
}

export async function fetchProductDetailById(params: {
  productId: number;
  logger: ApiLogger;
}) {
  if (!params.productId) return null;

  try {
    const response = await fetchWithRetry({
      method: "GET",
      url: `https://api.fmarket.vn/res/products/${params.productId}`,
      cacheKey: `product_detail_${params.productId}`,
      logger: params.logger,
    });

    const data = getNestedValue(response, ["data"]);
    if (!data || typeof data !== "object") return null;

    const detail = data as Record<string, unknown>;
    const extra = (detail.extra as Record<string, unknown> | undefined) ?? {};
    const navChange = (detail.productNavChange as Record<string, unknown> | undefined) ?? {};
    const owner = (detail.owner as Record<string, unknown> | undefined) ?? {};
    const riskLevel = (detail.riskLevel as Record<string, unknown> | undefined) ?? {};
    const fundType = (detail.fundType as Record<string, unknown> | undefined) ?? {};
    const fundAssetType = (detail.dataFundAssetType as Record<string, unknown> | undefined) ?? {};
    const tradingSession = (detail.productTradingSession as Record<string, unknown> | undefined) ?? {};
    const topHoldingRaw = (detail.productTopHoldingList as Array<Record<string, unknown>> | undefined) ?? [];
    const assetHoldingRaw = (detail.productAssetHoldingList as Array<Record<string, unknown>> | undefined) ?? [];
    const industriesRaw = (detail.productIndustriesHoldingList as Array<Record<string, unknown>> | undefined) ?? [];
    const documentsRaw = (detail.productDocuments as Array<Record<string, unknown>> | undefined) ?? [];
    const programListRaw = (detail.productProgramList as Array<Record<string, unknown>> | undefined) ?? [];
    const feeListRaw = [
      ...((detail.productFeeList as Array<Record<string, unknown>> | undefined) ?? []),
      ...((detail.productFeeSipList as Array<Record<string, unknown>> | undefined) ?? []),
    ];

    const nav = Number(extra.currentNAV ?? extra.lastNAV ?? detail.nav ?? 0);
    if (!Number.isFinite(nav) || nav <= 0) return null;

    const lastNavDateRaw =
      extra.lastNAVDate ?? detail.updateAt ?? detail.createAt ?? detail.approveAt ?? Date.now();
    const lastNavDate = new Date(Number(lastNavDateRaw) || String(lastNavDateRaw));
    const lastNavDateIso = Number.isNaN(lastNavDate.getTime())
      ? new Date().toISOString()
      : lastNavDate.toISOString();

    const navTo12 = clampNumber(navChange.navTo12Months, 0, -95, 500) / 100;
    const annualized36 = clampNumber(navChange.annualizedReturn36Months, 0, -95, 700) / 100;

    const topHoldings = topHoldingRaw
      .map((item) => ({
        stockCode: String(item.stockCode || "").trim(),
        netAssetPercent: Number(item.netAssetPercent || 0),
        industry: String(item.industry || "").trim(),
        price: Number(item.price || 0),
        changeFromPrevious: Number(item.changeFromPrevious || 0),
        changeFromPreviousPercent: Number(item.changeFromPreviousPercent || 0),
      }))
      .filter((item) => item.stockCode)
      .slice(0, 12);

    const assetHoldings = assetHoldingRaw
      .map((item) => {
        const assetType = (item.assetType as Record<string, unknown> | undefined) ?? {};
        return {
          assetTypeCode: String(assetType.code || "").trim(),
          assetTypeName: String(assetType.name || "").trim(),
          colorCode: String(assetType.colorCode || "").trim(),
          assetPercent: Number(item.assetPercent || 0),
        };
      })
      .filter((item) => item.assetTypeName);

    const industries = industriesRaw
      .map((item) => ({
        industry: String(item.industry || "").trim(),
        assetPercent: Number(item.assetPercent || 0),
      }))
      .filter((item) => item.industry)
      .slice(0, 24);

    const documents = documentsRaw
      .map((item) => {
        const documentType = (item.documentType as Record<string, unknown> | undefined) ?? {};
        return {
          fileName: String(item.fileName || "").trim(),
          url: String(item.url || "").trim(),
          applyAt: String(item.applyAt || "").trim(),
          documentType: String(documentType.name || "").trim(),
        };
      })
      .filter((item) => item.fileName && item.url)
      .slice(0, 12);

    const productPrograms = programListRaw
      .map((item) => {
        const scheme = (item.scheme as Record<string, unknown> | undefined) ?? {};
        return {
          id: Number(item.id || 0),
          tradeCode: String(item.tradeCode || "").trim(),
          name: String(item.name || "").trim(),
          schemeCode: String(scheme.code || "").trim(),
          buyMinValue: Number(item.buyMinValue || 0),
          sellMin: Number(item.sellMin || 0),
          holdingMin: Number(item.holdingMin || 0),
        };
      })
      .filter((item) => item.id > 0 || item.tradeCode || item.name);

    const sellFeeRules = feeListRaw
      .map((item) => {
        const beginOp = (item.beginRelationalOperator as Record<string, unknown> | undefined) ?? {};
        const endOp = (item.endRelationalOperator as Record<string, unknown> | undefined) ?? {};
        const program = (item.productProgram as Record<string, unknown> | undefined) ?? {};
        const scheme = (program.scheme as Record<string, unknown> | undefined) ?? {};

        return {
          id: Number(item.id || 0),
          type: String(item.type || "").trim().toUpperCase(),
          beginOperator: String(beginOp.code || ">=").trim() || ">=",
          beginVolume: Number(item.beginVolume || 0),
          endOperator: String(endOp.code || "<=").trim() || "<=",
          endVolume:
            item.endVolume === null || item.endVolume === undefined || item.endVolume === ""
              ? null
              : Number(item.endVolume || 0),
          feePercent: Number(item.fee || 0),
          feeUnitType: String(item.feeUnitType || "").trim().toUpperCase(),
          isUnitByDay: Boolean(item.isUnitByDay),
          programName: String(program.name || "").trim(),
          schemeCode: String(scheme.code || "").trim().toUpperCase(),
        };
      })
      .filter((item) => item.type === "SELL" && Number.isFinite(item.feePercent));

    const snapshot: ProductDetailSnapshot = {
      productId: Number(detail.id || params.productId),
      code: String(detail.shortName || detail.code || "").trim().toUpperCase(),
      shortCode: String(detail.code || "").trim().toUpperCase(),
      name: String(detail.name || detail.shortName || "").trim(),
      tradeCode: String(detail.tradeCode || "").trim(),
      sipCode: String(detail.sipCode || "").trim(),
      company: String(owner.name || owner.fullName || detail.productCompanyName || "").trim(),
      status: String(detail.status || "").trim(),
      price: Number(detail.price || 0),
      nav,
      lastYearNav: Number(detail.lastYearNav || 0),
      lastNavDateIso,
      firstIssueAtIso: toIsoFromUnknown(detail.firstIssueAt),
      approveAtIso: toIsoFromUnknown(detail.approveAt),
      updatedAtIso: toIsoFromUnknown(detail.updateAt),
      buyMinValue: Number(detail.buyMinValue || 0),
      buyMaxValue: Number(detail.buyMaxValue || 0),
      sellMin: Number(detail.sellMin || 0),
      transferSellMin: Number(detail.transferSellMin || 0),
      holdingMin: Number(detail.holdingMin || 0),
      isOnlySellMinNotSellAll: Boolean(detail.isOnlySellMinNotSellAll),
      holdingVolume: Number(detail.holdingVolume || 0),
      avgAnnualReturnPct: clampNumber(detail.avgAnnualReturn, 0, -95, 1200),
      annualizedReturn36MonthsPct: clampNumber(navChange.annualizedReturn36Months, 0, -95, 1200),
      expectedReturnPct: clampNumber(detail.expectedReturn, 0, -95, 300),
      managementFeePct: clampNumber(detail.managementFee, 0, 0, 50),
      performanceFeePct: clampNumber(detail.performanceFee, 0, 0, 90),
      riskLevel: String(riskLevel.name || "").trim(),
      fundType: String(fundType.name || "").trim(),
      fundAssetType: String(fundAssetType.name || "").trim(),
      website: String(detail.websiteURL || detail.website || "").trim(),
      description: String(detail.description || "").trim(),
      closedOrderBookAt: String(detail.closedOrderBookAt || "").trim(),
      closedBankNote: String(detail.closedBankNote || "").trim(),
      tradingTimeString: String(tradingSession.tradingTimeString || "").trim(),
      closedOrderBookTimeString: String(tradingSession.closedOrderBookTimeString || "").trim(),
      closedBankNoteTimeString: String(tradingSession.closedBankNoteTimeString || "").trim(),
      transactionDurationDays: Math.max(0, Number(detail.completeTransactionDuration || 0)),
      navToPreviousPct: clampNumber(navChange.navToPrevious, 0, -95, 200),
      navTo1MonthsPct: clampNumber(navChange.navTo1Months, 0, -95, 300),
      navTo3MonthsPct: clampNumber(navChange.navTo3Months, 0, -95, 400),
      navTo6MonthsPct: clampNumber(navChange.navTo6Months, 0, -95, 500),
      navTo12MonthsPct: clampNumber(navChange.navTo12Months, 0, -95, 700),
      navTo24MonthsPct: clampNumber(navChange.navTo24Months, 0, -95, 900),
      navTo36MonthsPct: clampNumber(navChange.navTo36Months, 0, -95, 1500),
      navTo60MonthsPct: clampNumber(navChange.navTo60Months, 0, -95, 2400),
      navTo7YearsPct: clampNumber(navChange.navTo7Years, 0, -95, 3500),
      navTo10YearsPct: clampNumber(navChange.navTo10Years, 0, -95, 8000),
      navToBeginningPct: clampNumber(navChange.navToBeginning, 0, -95, 5000),
      owner: {
        name: String(owner.name || "").trim(),
        shortName: String(owner.shortName || "").trim(),
        website: String(owner.website || "").trim(),
        email: String(owner.email || "").trim(),
        phone: String(owner.phone || "").trim(),
        address: String(owner.address1 || owner.address || "").trim(),
        avatarUrl: String(owner.avatarUrl || "").trim(),
      },
      productPrograms,
      sellFeeRules,
      assetHoldings,
      industries,
      documents,
      topHoldings,
      annualReturnEst: Number.isFinite(annualized36)
        ? annualized36
        : Number.isFinite(navTo12)
          ? navTo12
          : 0,
    };

    return snapshot;
  } catch (error) {
    params.logger(
      "WARN",
      "fetchProductDetailById",
      "Không lấy được dữ liệu chi tiết quỹ",
      `productId=${params.productId}, error=${shorten(error, 800)}`,
    );
    return null;
  }
}
