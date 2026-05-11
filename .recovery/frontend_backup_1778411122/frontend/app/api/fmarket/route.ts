import { NextResponse } from "next/server";
import {
  deleteTransactionSchema,
  installTriggerSchema,
  projectionSchema,
  transactionSellSchema,
  transactionSchema,
  watchlistBoardSchema,
  watchlistSchema,
} from "@/lib/server/contracts";
import {
  deleteTransactionById,
  getDashboardDataAuto,
  getFundDetailByCodeAuto,
  getSystemLogs,
  getSystemSummary,
  getTransactionsDataAuto,
  getUsageGuide,
  getWatchlistDataAuto,
  initializeApp,
  installAutoTriggers,
  resetAndRefetchAllData,
  resetAllData,
  saveProjectionYears,
  saveTransactionSell,
  saveTransaction,
  saveWatchlistBoardConfig,
  saveWatchlistConfig,
  syncAll,
  takeSnapshot,
  updateRealtimeNav,
} from "@/lib/server/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: NO_STORE_HEADERS });
}

function fail(error: unknown, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "dashboard";

  try {
    switch (view) {
      case "dashboard": {
        return ok(await getDashboardDataAuto());
      }
      case "watchlist": {
        const codes = (searchParams.get("codes") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        const mainCode = (searchParams.get("main") || "").trim();
        return ok(
          await getWatchlistDataAuto({
            selectedCodes: codes,
            mainCode,
          }),
        );
      }
      case "transactions": {
        return ok(await getTransactionsDataAuto());
      }
      case "fund_detail": {
        const code = (searchParams.get("code") || "").trim();
        return ok(await getFundDetailByCodeAuto(code));
      }
      case "logs": {
        const limit = Number(searchParams.get("limit") || 300);
        return ok(getSystemLogs(limit));
      }
      case "guide": {
        return ok(getUsageGuide());
      }
      case "system": {
        return ok(getSystemSummary());
      }
      default: {
        return fail("Giá trị view không hợp lệ.", 422);
      }
    }
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  let payload: { action?: string; data?: unknown };
  try {
    payload = (await request.json()) as { action?: string; data?: unknown };
  } catch {
    return fail("Body JSON không hợp lệ.", 400);
  }

  const action = payload.action;

  try {
    switch (action) {
      case "init": {
        return ok(await initializeApp());
      }
      case "sync": {
        return ok(await syncAll());
      }
      case "realtime": {
        return ok(await updateRealtimeNav());
      }
      case "snapshot": {
        return ok(takeSnapshot());
      }
      case "reset": {
        resetAllData();
        return ok({ message: "Đã reset toàn bộ dữ liệu." });
      }
      case "reset_refetch_all": {
        const result = await resetAndRefetchAllData();
        return ok({
          message: "Đã xóa DB và fetch full lại toàn bộ quỹ.",
          ...result,
        });
      }
      case "transaction": {
        const data = transactionSchema.parse(payload.data);
        return ok(saveTransaction(data));
      }
      case "transaction_sell": {
        const data = transactionSellSchema.parse(payload.data);
        return ok(await saveTransactionSell(data));
      }
      case "transaction_delete": {
        const data = deleteTransactionSchema.parse(payload.data);
        return ok(deleteTransactionById(data.id));
      }
      case "watchlist": {
        const data = watchlistSchema.parse(payload.data);
        saveWatchlistConfig(data);
        return ok({ message: "Đã lưu cấu hình theo dõi." });
      }
      case "watchlist_board": {
        const data = watchlistBoardSchema.parse(payload.data);
        const saved = saveWatchlistBoardConfig(data);
        return ok({
          message: "Đã lưu cấu hình Trading Board.",
          ...saved,
        });
      }
      case "projection": {
        const data = projectionSchema.parse(payload.data);
        const years = saveProjectionYears(data.years);
        return ok({ years });
      }
      case "trigger": {
        const data = installTriggerSchema.parse(payload.data);
        return ok(installAutoTriggers(data));
      }
      default: {
        return fail("Action không hợp lệ.", 422);
      }
    }
  } catch (error) {
    return fail(error, 500);
  }
}
