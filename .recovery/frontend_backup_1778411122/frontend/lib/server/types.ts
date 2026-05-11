export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface Fund {
  code: string;
  name: string;
  nav: number;
  company: string;
  updatedAt: string;
  annualReturnEst: number;
  productId: number;
}

export interface FundApiItem {
  code: string;
  name: string;
  nav: number;
  company: string;
  annualReturnEst: number;
  productId: number;
  source: string;
}

export interface NavHistoryRow {
  timestamp: string;
  fundCode: string;
  nav: number;
  source: string;
}

export interface Transaction {
  id: number;
  date: string;
  fundCode: string;
  amount: number;
  ccq: number;
  unitPrice: number;
  createdAt: string;
  source: "manual" | "monthly_auto";
  note: string;
}

export interface TransactionSale {
  id: number;
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
  createdAt: string;
  source: "manual";
  note: string;
}

export interface TransactionPerformance {
  transactionId: number;
  fundCode: string;
  boughtCcq: number;
  soldCcq: number;
  remainingCcq: number;
  costBasisSold: number;
  costBasisRemaining: number;
  realizedPnlValue: number;
  realizedPnlPercent: number;
  unrealizedPnlValue: number;
  unrealizedPnlPercent: number;
}

export interface Snapshot {
  id: number;
  date: string;
  totalAsset: number;
}

export interface SystemLog {
  id: number;
  timestamp: string;
  level: LogLevel;
  action: string;
  message: string;
  detail: string;
}

export interface WatchlistItem {
  fundCode: string;
  tracked: boolean;
  monthlyContribution: number;
}

export interface SyncResult {
  updatedFunds: number;
  insertedHistoryPoints: number;
}

export interface ProjectionResult {
  years: number;
  currentTotal: number;
  weightedRate: number;
  annualVolatility: number;
  confidenceLevel: number;
  projectedTotal: number;
  projectedMin: number;
  projectedMax: number;
  totalMonthly: number;
  holdingsCount: number;
}

export interface CandlestickPoint {
  time: string;
  low: number;
  open: number;
  close: number;
  high: number;
}

export interface DashboardFundRow {
  code: string;
  invested: number;
  ccq: number;
  nav: number;
  asset: number;
  pnlPercent: number;
  monthlyContribution: number;
  tracked: boolean;
}

export interface DashboardData {
  summary: {
    totalInvested: number;
    totalAsset: number;
    pnlValue: number;
    pnlPercent: number;
    updatedAt: string | null;
    totalFunds: number;
    totalNavPoints: number;
  };
  projection: ProjectionResult;
  projectionSeries: Array<{ year: number; value: number; min: number; max: number }>;
  funds: DashboardFundRow[];
  snapshots: Array<{ date: string; totalAsset: number }>;
  pieAllocation: Array<{ name: string; value: number }>;
  pnlByFund: Array<{ code: string; pnlPercent: number }>;
}

export interface WatchlistSeries {
  code: string;
  source: string;
  rawPoints: number;
  filteredPoints: number;
  gapLabel: string;
  lineSeries: Array<{ timestamp: string; nav: number | null }>;
  candlestickSeries: CandlestickPoint[];
}

export interface WatchlistData {
  generatedAt: string;
  session: {
    status: "pre_open" | "open" | "break" | "closed";
    label: string;
    inSession: boolean;
    nowVi: string;
  };
  mainCode: string;
  quickCodes: string[];
  boardCodes: string[];
  universe: Array<{
    code: string;
    name: string;
    isHolding: boolean;
    monthlyContribution: number;
    trendScore: number;
  }>;
  items: WatchlistSeries[];
}

export interface TransactionsData {
  generatedAt: string;
  session: {
    status: "pre_open" | "open" | "break" | "closed";
    label: string;
    inSession: boolean;
    nowVi: string;
  };
  projectionYears: number;
  funds: DashboardFundRow[];
  transactions: Transaction[];
  sales: TransactionSale[];
  transactionPerformance: TransactionPerformance[];
}

export interface FundDetailData {
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
  navChange: {
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
  };
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
}
