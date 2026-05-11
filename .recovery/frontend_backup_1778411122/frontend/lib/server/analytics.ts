import { APP_CONFIG } from "@/lib/server/config";
import type {
  CandlestickPoint,
  Fund,
  ProjectionResult,
  WatchlistItem,
} from "@/lib/server/types";

export function parseProjectionYears(value: unknown) {
  const years = Number(value);
  if (!Number.isFinite(years) || years <= 0) return APP_CONFIG.defaultProjectionYears;
  return Math.min(50, Math.max(1, Math.round(years)));
}

export function parseMonthlyContribution(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
  }

  const text = String(value).trim();
  if (!text) return 0;
  const normalized = text.replace(/[^0-9-]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

export function parseGapToHours(raw: string) {
  const text = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (!text) return 24;

  const number = extractFirstNumber(text, 1);
  if (text.includes("tháng") || text.includes("thang") || text.includes("month")) {
    return Math.max(1, number * 24 * 30);
  }
  if (text.includes("ngày") || text.includes("ngay") || text.includes("day")) {
    return Math.max(1, number * 24);
  }
  if (text.includes("giờ") || text.includes("gio") || text.includes("hour")) {
    return Math.max(1, number);
  }

  const direct = Number(text);
  if (Number.isFinite(direct) && direct > 0) return Math.max(1, direct);
  return 24;
}

export function formatGapLabel(hours: number) {
  const h = Math.max(1, Number(hours || 1));
  if (h <= 1) return "1 giờ";
  if (h <= 3) return "3 giờ";
  if (h <= 6) return "6 giờ";
  if (h <= 12) return "12 giờ";
  if (h <= 24) return "1 ngày";
  if (h <= 72) return "3 ngày";
  if (h <= 168) return "7 ngày";
  if (h <= 336) return "14 ngày";
  return "1 tháng";
}

function extractFirstNumber(input: string, fallback: number) {
  const match = input.match(/\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function seriesSpanDays(series: Array<{ timestamp: string; nav: number }>) {
  if (series.length < 2) return 0;
  const first = new Date(series[0].timestamp).getTime();
  const last = new Date(series[series.length - 1].timestamp).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return 0;
  return (last - first) / (24 * 60 * 60 * 1000);
}

export function autoGapHoursForSeries(series: Array<{ timestamp: string; nav: number }>) {
  if (series.length < 2) return 24;
  const span = seriesSpanDays(series);
  if (span <= 2) return 1;
  if (span <= 7) return 3;
  if (span <= 30) return 6;
  if (span <= 90) return 12;
  if (span <= 180) return 24;
  if (span <= 365) return 72;
  return 168;
}

export function compressSeriesByGap(
  series: Array<{ timestamp: string; nav: number }>,
  gapHours: number,
) {
  const gap = Math.max(1, Number(gapHours || 1));
  if (series.length < 2) return series;

  const bucketMap = new Map<number, { timestamp: string; nav: number }>();
  const bucketMs = gap * 60 * 60 * 1000;

  series.forEach((point) => {
    const ts = new Date(point.timestamp).getTime();
    if (!Number.isFinite(ts) || !Number.isFinite(point.nav) || point.nav <= 0) return;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    bucketMap.set(bucket, {
      timestamp: new Date(bucket).toISOString(),
      nav: point.nav,
    });
  });

  return Array.from(bucketMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);
}

export function buildLineSeriesWithBreaks(
  series: Array<{ timestamp: string; nav: number }>,
  gapHours: number,
  breakFactor = 2.2,
) {
  const output: Array<{ timestamp: string; nav: number | null }> = [];
  if (!series.length) return output;

  const expectedMs = Math.max(1, gapHours) * 60 * 60 * 1000;
  const breakMs = expectedMs * Math.max(1.2, breakFactor);

  series.forEach((point, index) => {
    const ts = new Date(point.timestamp).getTime();
    if (!Number.isFinite(ts) || !Number.isFinite(point.nav)) return;

    if (index > 0) {
      const prevTs = new Date(series[index - 1].timestamp).getTime();
      if (Number.isFinite(prevTs) && ts - prevTs > breakMs) {
        output.push({
          timestamp: new Date(ts - 1000).toISOString(),
          nav: null,
        });
      }
    }

    output.push({
      timestamp: new Date(ts).toISOString(),
      nav: point.nav,
    });
  });

  return output;
}

export function buildCandlestickRows(
  series: Array<{ timestamp: string; nav: number }>,
  bucketHours = 24,
): CandlestickPoint[] {
  if (!series.length) return [];

  const buckets = new Map<
    string,
    {
      time: string;
      open: number;
      high: number;
      low: number;
      close: number;
      count: number;
    }
  >();

  const bucketMs = Math.max(1, bucketHours) * 60 * 60 * 1000;

  series.forEach((point) => {
    const ts = new Date(point.timestamp).getTime();
    if (!Number.isFinite(ts) || !Number.isFinite(point.nav) || point.nav <= 0) return;

    const bucketTs = Math.floor(ts / bucketMs) * bucketMs;
    const key = String(bucketTs);
    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, {
        time: new Date(bucketTs).toISOString(),
        open: point.nav,
        high: point.nav,
        low: point.nav,
        close: point.nav,
        count: 1,
      });
      return;
    }

    if (point.nav > existing.high) existing.high = point.nav;
    if (point.nav < existing.low) existing.low = point.nav;
    existing.close = point.nav;
    existing.count += 1;
  });

  const rows = Array.from(buckets.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([bucketKey, value]) => ({
      ...value,
      bucketTs: Number(bucketKey),
    }));

  const normalizedRows = rows
    .sort((a, b) => a.bucketTs - b.bucketTs)
    .map((row, index, arr) => {
      const prev = index > 0 ? arr[index - 1] : null;
      let open = row.open;
      const close = row.close;

      // Daily NAV often has one value/day; derive direction from previous close
      // only for contiguous buckets to avoid artificial large bodies across long gaps.
      if (prev && row.count <= 1) {
        const gapBuckets = Math.round((row.bucketTs - prev.bucketTs) / bucketMs);
        if (gapBuckets >= 1 && gapBuckets <= 7) {
          open = prev.close;
        } else {
          open = close;
        }
      }

      return {
        time: row.time,
        open,
        close,
        high: Math.max(row.high, open, close),
        low: Math.min(row.low, open, close),
      };
    });

  return normalizedRows;
}

function clampRate(rate: number, min = -0.95, max = 1.2) {
  if (!Number.isFinite(rate)) return 0;
  return Math.max(min, Math.min(max, rate));
}

function quantileAnnualRate(params: {
  annualRate: number;
  annualVol: number;
  years: number;
  zScore: number;
}) {
  const years = Math.max(1 / 12, Number(params.years || 0));
  const annualRate = clampRate(params.annualRate, -0.95, 0.8);
  const annualVol = Math.max(0.03, Math.min(0.65, Number(params.annualVol || 0)));
  const zScore = Number.isFinite(params.zScore) ? params.zScore : 0;

  const safeBase = Math.max(1e-6, 1 + annualRate);
  const muLog = Math.log(safeBase);
  const sigma = annualVol;

  const logGrowth =
    (muLog - 0.5 * sigma * sigma) * years +
    zScore * sigma * Math.sqrt(years);

  const growth = Math.max(1e-6, Math.exp(logGrowth));
  const annualizedRate = Math.pow(growth, 1 / years) - 1;
  return clampRate(annualizedRate, -0.95, 1.2);
}

export function estimateCagr(series: Array<{ timestamp: string; nav: number }>) {
  if (series.length < 2) return Number.NaN;

  const clean = series
    .map((point) => ({
      ts: new Date(point.timestamp).getTime(),
      nav: Number(point.nav || 0),
    }))
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.nav) && point.nav > 0)
    .sort((a, b) => a.ts - b.ts);

  if (clean.length < 2) return Number.NaN;

  const first = clean[0];
  const last = clean[clean.length - 1];
  const spanDays = (last.ts - first.ts) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(spanDays) || spanDays < 30) return Number.NaN;

  function cagrBetween(startNav: number, endNav: number, days: number) {
    if (!Number.isFinite(startNav) || !Number.isFinite(endNav) || startNav <= 0 || endNav <= 0) {
      return Number.NaN;
    }
    if (!Number.isFinite(days) || days < 30) return Number.NaN;
    const value = Math.pow(endNav / startNav, 365 / days) - 1;
    return Number.isFinite(value) ? value : Number.NaN;
  }

  function findStartPoint(targetTs: number) {
    let start = clean[0];
    for (let i = clean.length - 1; i >= 0; i -= 1) {
      if (clean[i].ts <= targetTs) {
        start = clean[i];
        break;
      }
    }
    return start;
  }

  const horizonPlans: Array<{ years: number; weight: number; minDays: number }> = [
    { years: 3, weight: 0.45, minDays: 365 * 2 },
    { years: 5, weight: 0.3, minDays: 365 * 3 },
    { years: 10, weight: 0.15, minDays: 365 * 5 },
  ];

  const candidates: Array<{ value: number; weight: number }> = [];

  horizonPlans.forEach((plan) => {
    const targetTs = last.ts - plan.years * 365 * 24 * 60 * 60 * 1000;
    const start = findStartPoint(targetTs);
    const days = (last.ts - start.ts) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(days) || days < plan.minDays) return;

    const value = cagrBetween(start.nav, last.nav, days);
    if (!Number.isFinite(value)) return;

    candidates.push({ value, weight: plan.weight });
  });

  const fullSpanCagr = cagrBetween(first.nav, last.nav, spanDays);
  if (Number.isFinite(fullSpanCagr)) {
    candidates.push({ value: fullSpanCagr, weight: 0.1 });
  }

  if (!candidates.length) {
    return fullSpanCagr;
  }

  let weightedSum = 0;
  let totalWeight = 0;
  candidates.forEach((item) => {
    weightedSum += item.value * item.weight;
    totalWeight += item.weight;
  });

  if (totalWeight <= 0) return Number.NaN;
  let cagr = weightedSum / totalWeight;

  if (spanDays < APP_CONFIG.minHistoryDaysForStrongCagr) {
    cagr = cagr * 0.75 + APP_CONFIG.defaultFallbackAnnualRate * 0.25;
  }

  return cagr;
}

export function projectFutureValue(
  presentValue: number,
  annualRate: number,
  years: number,
  monthlyContribution: number,
) {
  const pv = Number(presentValue || 0);
  const rate = Number(annualRate || 0);
  const horizonYears = Math.max(0, Number(years || 0));
  const pmt = Math.max(0, Number(monthlyContribution || 0));

  if (pv <= 0 && pmt <= 0) return 0;

  const months = Math.round(horizonYears * 12);
  if (months <= 0) return pv;

  const monthlyRate = rate / 12;
  const growth = Math.pow(1 + monthlyRate, months);
  const fvPv = pv * growth;

  if (pmt <= 0) return fvPv;
  if (Math.abs(monthlyRate) < 1e-9) return fvPv + pmt * months;

  const fvPmt = pmt * ((growth - 1) / monthlyRate);
  return fvPv + fvPmt;
}

export function computeProjection(params: {
  years: number;
  funds: Fund[];
  navByCode: Record<string, number>;
  ccqByCode: Record<string, number>;
  watchlistItems: WatchlistItem[];
  cagrByCode: Record<string, number>;
  volatilityByCode: Record<string, number>;
}) {
  const years = parseProjectionYears(params.years);
  const watchMap = new Map(params.watchlistItems.map((item) => [item.fundCode, item]));

  const targetCodes = new Set<string>();
  Object.keys(params.ccqByCode).forEach((code) => targetCodes.add(code));
  params.watchlistItems.forEach((item) => {
    if (item.monthlyContribution > 0) {
      targetCodes.add(item.fundCode);
    }
  });

  if (!targetCodes.size) {
    return {
      result: {
        years,
        currentTotal: 0,
        weightedRate: APP_CONFIG.defaultFallbackAnnualRate,
        annualVolatility: 0,
        confidenceLevel: 0.9,
        projectedTotal: 0,
        projectedMin: 0,
        projectedMax: 0,
        totalMonthly: 0,
        holdingsCount: 0,
      } as ProjectionResult,
      series: [] as Array<{ year: number; value: number; min: number; max: number }>,
    };
  }

  const fundMap = new Map(params.funds.map((fund) => [fund.code, fund]));

  let currentTotal = 0;
  let totalMonthly = 0;
  let weightedRateNumerator = 0;
  let weightedRateDenominator = 0;
  let weightedVolNumerator = 0;
  let weightedVolDenominator = 0;
  let projectedTotal = 0;
  let projectedMin = 0;
  let projectedMax = 0;
  let holdingsCount = 0;
  const confidenceLevel = 0.9;
  const zScore = 1.645;

  const modelRows: Array<{
    pv: number;
    monthly: number;
    baseRate: number;
    annualVol: number;
  }> = [];

  targetCodes.forEach((code) => {
    const nav = Number(params.navByCode[code] || 0);
    const ccq = Number(params.ccqByCode[code] || 0);
    const pv = Math.max(0, nav * ccq);

    const monthly = parseMonthlyContribution(watchMap.get(code)?.monthlyContribution ?? 0);
    if (pv <= 0 && monthly <= 0) return;

    const fallbackRate = fundMap.get(code)?.annualReturnEst ?? APP_CONFIG.defaultFallbackAnnualRate;
    const cagr = params.cagrByCode[code];

    let annualRate: number;
    if (Number.isFinite(cagr) && Number.isFinite(fallbackRate)) {
      annualRate = cagr * 0.7 + fallbackRate * 0.3;
    } else if (Number.isFinite(cagr)) {
      annualRate = cagr;
    } else if (Number.isFinite(fallbackRate)) {
      annualRate = fallbackRate;
    } else {
      annualRate = APP_CONFIG.defaultFallbackAnnualRate;
    }

    annualRate = Math.min(0.8, Math.max(-0.5, annualRate));

    let annualVol = Number(params.volatilityByCode[code]);
    if (!Number.isFinite(annualVol) || annualVol <= 0) {
      annualVol = Math.max(0.08, Math.min(0.45, Math.abs(annualRate) * 0.7 + 0.1));
    }
    annualVol = Math.max(0.05, Math.min(0.65, annualVol));

    const minRate = quantileAnnualRate({
      annualRate,
      annualVol,
      years,
      zScore: -zScore,
    });
    const maxRate = quantileAnnualRate({
      annualRate,
      annualVol,
      years,
      zScore,
    });

    currentTotal += pv;
    totalMonthly += monthly;

    const exposure = pv + monthly * 12;
    if (exposure > 0) {
      weightedRateNumerator += exposure * annualRate;
      weightedRateDenominator += exposure;
      weightedVolNumerator += exposure * annualVol;
      weightedVolDenominator += exposure;
    }

    projectedTotal += projectFutureValue(pv, annualRate, years, monthly);
    projectedMin += projectFutureValue(pv, minRate, years, monthly);
    projectedMax += projectFutureValue(pv, maxRate, years, monthly);
    holdingsCount += 1;

    modelRows.push({
      pv,
      monthly,
      baseRate: annualRate,
      annualVol,
    });
  });

  const weightedRate =
    weightedRateDenominator > 0
      ? weightedRateNumerator / weightedRateDenominator
      : APP_CONFIG.defaultFallbackAnnualRate;

  const annualVolatility =
    weightedVolDenominator > 0
      ? weightedVolNumerator / weightedVolDenominator
      : Math.max(0.08, Math.abs(weightedRate) * 0.7 + 0.1);

  const result: ProjectionResult = {
    years,
    currentTotal,
    weightedRate,
    annualVolatility,
    confidenceLevel,
    projectedTotal,
    projectedMin,
    projectedMax,
    totalMonthly,
    holdingsCount,
  };

  const series: Array<{ year: number; value: number; min: number; max: number }> = [];
  if (currentTotal > 0 || totalMonthly > 0) {
    for (let year = 0; year <= years; year += 1) {
      let value = 0;
      let min = 0;
      let max = 0;

      modelRows.forEach((row) => {
        const minRateYear =
          year <= 0
            ? row.baseRate
            : quantileAnnualRate({
                annualRate: row.baseRate,
                annualVol: row.annualVol,
                years: year,
                zScore: -zScore,
              });
        const maxRateYear =
          year <= 0
            ? row.baseRate
            : quantileAnnualRate({
                annualRate: row.baseRate,
                annualVol: row.annualVol,
                years: year,
                zScore,
              });

        value += projectFutureValue(row.pv, row.baseRate, year, row.monthly);
        min += projectFutureValue(row.pv, minRateYear, year, row.monthly);
        max += projectFutureValue(row.pv, maxRateYear, year, row.monthly);
      });

      series.push({
        year,
        value,
        min,
        max,
      });
    }
  }

  if (series.length) {
    const tail = series[series.length - 1];
    projectedTotal = tail.value;
    projectedMin = tail.min;
    projectedMax = tail.max;
    result.projectedTotal = projectedTotal;
    result.projectedMin = projectedMin;
    result.projectedMax = projectedMax;
  }

  return { result, series };
}
