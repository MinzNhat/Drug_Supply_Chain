export const APP_CONFIG = {
  primaryApiUrl: "https://api.fmarket.vn/res/products/filter",
  historyApiUrl: "https://api.fmarket.vn/res/product/get-nav-history",
  apiUrls: [
    "https://api.fmarket.vn/res/products/filter",
    "https://api.fmarket.vn/res/products/home/filter",
  ],
  usePrimaryApiOnly: true,
  enableGetFallback: false,
  strictFundPayload: true,
  logFullApiError: true,
  allowEstimatedHistory: false,
  pageSize: 50,
  historyBackfillDays: 365,
  timeZone: "Asia/Ho_Chi_Minh",
  defaultGapLabel: "1 ngày",
  defaultProjectionYears: 10,
  defaultFallbackAnnualRate: 0.08,
  minHistoryDaysForStrongCagr: 120,
  maxSystemLogs: 2000,
  maxWatchlistItems: 40,
};

export const SETTING_KEYS = {
  projectionYears: "projection_years",
  updateIntervalMinutes: "update_interval_minutes",
  snapshotIntervalHours: "snapshot_interval_hours",
  cronSecret: "cron_secret",
  lastAutoSyncAt: "last_auto_sync_at",
  watchlistBoardCodes: "watchlist_board_codes",
};

export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTING_KEYS.projectionYears]: String(APP_CONFIG.defaultProjectionYears),
  [SETTING_KEYS.updateIntervalMinutes]: "15",
  [SETTING_KEYS.snapshotIntervalHours]: "1",
  [SETTING_KEYS.cronSecret]: "",
  [SETTING_KEYS.lastAutoSyncAt]: "",
  [SETTING_KEYS.watchlistBoardCodes]: "",
};

export const USAGE_GUIDE: Array<{ title: string; content: string }> = [
  {
    title: "1) Khởi tạo",
    content:
      "Nhấn 'Khởi tạo / Làm mới' để đồng bộ dữ liệu quỹ ban đầu, chuẩn bị dashboard và dữ liệu lịch sử NAV nền.",
  },
  {
    title: "2) Đồng bộ toàn bộ quỹ + NAV",
    content:
      "Dashboard web sẽ tự đồng bộ theo chu kỳ. Bạn vẫn có thể đồng bộ thủ công khi cần kiểm tra tức thời.",
  },
  {
    title: "3) Cập nhật realtime",
    content:
      "Khi mở trang web, hệ thống tự kiểm tra thời điểm sync gần nhất và tự cập nhật dữ liệu nếu đến hạn.",
  },
  {
    title: "4) Thêm giao dịch",
    content:
      "Nhập mã quỹ, ngày, số tiền. Có thể để trống số CCQ để hệ thống tự tính theo NAV hiện tại.",
  },
  {
    title: "5) Theo dõi và nạp thêm",
    content:
      "Tick mã quỹ cần theo dõi và nhập mức nạp thêm/tháng theo từng mã ngay trong bảng danh mục.",
  },
  {
    title: "6) Dự phóng lãi kép",
    content:
      "Đặt kỳ hạn dự phóng (1-50 năm). Hệ thống ước tính tăng trưởng dựa trên CAGR lịch sử và tỷ suất API.",
  },
  {
    title: "7) Trigger tự động",
    content:
      "Dùng endpoint cron để tự động gọi cập nhật realtime/snapshot theo lịch. Có thể gắn với Vercel Cron hoặc dịch vụ cron ngoài.",
  },
  {
    title: "8) Nhật ký hệ thống",
    content:
      "Mọi lỗi API, fallback, cảnh báo dữ liệu và tác vụ chính đều được ghi vào Nhật ký hệ thống.",
  },
];
