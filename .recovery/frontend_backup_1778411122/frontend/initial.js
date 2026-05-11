/* eslint-disable */
// ==========================================
// APP QUAN LY QUY - AUTO FULL FUND + REALTIME + FALLBACK API
// ==========================================

var APP_CFG = {
    DB_SHEET: "Database_Quy",
    LOG_SHEET: "Log_Giao_Dich",
    DEBUG_SHEET: "He_Thong_Log",
    DASH_SHEET: "Dashboard",
    CHART_SHEET: "Bieu_Do_Theo_Doi",
    CHART_DB_SHEET: "Bieu_Do_Data",
    GUIDE_SHEET: "Huong_Dan",
    SNAP_SHEET: "Snapshot_Tai_San",
    NAV_HISTORY_SHEET: "NAV_History",
    API_URL: "https://api.fmarket.vn/res/products/filter",
    HISTORY_API_URL: "https://api.fmarket.vn/res/product/get-nav-history",
    API_URLS: [
        "https://api.fmarket.vn/res/products/filter",
        "https://api.fmarket.vn/res/products/home/filter",
    ],
    PRIMARY_API_ONLY: true,
    ENABLE_GET_FALLBACK: false,
    STRICT_FUND_PAYLOAD: true,
    LOG_API_FAIL_FULL: true,
    ALLOW_ESTIMATED_HISTORY: false,
    PAGE_SIZE: 50,
    UPDATE_INTERVAL_MINUTES: 15,
    SNAPSHOT_INTERVAL_HOURS: 1,
    HISTORY_BACKFILL_DAYS: 365,
    TIME_ZONE: "GMT+7",
    DEFAULT_GAP_LABEL: "1 ngay",
    DEFAULT_PROJECTION_YEARS: 10,
    DEFAULT_FALLBACK_ANNUAL_RATE: 0.08,
    MIN_HISTORY_DAYS_FOR_STRONG_CAGR: 120,
};

function onOpen() {
    try {
        var ui = SpreadsheetApp.getUi();
        ui.createMenu("APP QUAN LY")
            .addItem("1. Khoi tao / Lam moi UI", "setupApp")
            .addItem("2. Sync toan bo quy + NAV", "fetchFmarketData")
            .addItem("3. Cap nhat NAV realtime", "updateRealtimeNav")
            .addItem("4. Chup nhanh tai san", "takeSnapshot")
            .addItem("5. Cai trigger tu dong", "installAutoTriggers")
            .addItem("6. Mo huong dan su dung", "showUsageGuide")
            .addItem("7. Mo log he thong", "showSystemLog")
            .addItem("8. Reset toan bo du lieu", "resetAllData")
            .addItem("9. Mo trang bieu do theo doi", "showWatchlistPage")
            .addSeparator()
            .addItem("+. Them Giao Dich", "showForm")
            .addToUi();
    } catch (err) {
        // Expected in non-UI contexts (trigger/editor executions). Skip silently.
        var msg = String(err || "");
        if (
            msg.indexOf(
                "Cannot call SpreadsheetApp.getUi() from this context",
            ) >= 0
        ) {
            return;
        }
        Logger.log("onOpen failed: " + msg);
    }
}

function setupApp() {
    ensureSheetWithHeader_(APP_CFG.LOG_SHEET, [
        "Ngay",
        "Ma Quy",
        "Tien Nap",
        "Luong CCQ",
        "Don Gia",
    ]);
    ensureSheetWithHeader_(APP_CFG.DB_SHEET, [
        "Ma Quy",
        "Ten Quy",
        "Gia NAV Moi Nhat",
        "Nha Quan Ly",
        "Updated At",
        "Annual Return Est",
        "Product ID",
    ]);
    ensureSheetWithHeader_(APP_CFG.NAV_HISTORY_SHEET, [
        "Timestamp",
        "Ma Quy",
        "NAV",
        "Source",
    ]);
    ensureSheetWithHeader_(APP_CFG.SNAP_SHEET, ["Ngay", "Tong Tai San (VND)"]);
    ensureSheetWithHeader_(APP_CFG.DEBUG_SHEET, [
        "Timestamp",
        "Level",
        "Action",
        "Message",
        "Detail",
    ]);
    ensureSheetWithHeader_(APP_CFG.CHART_SHEET, [
        "Ma Quy",
        "So diem du lieu",
        "Lan cap nhat",
        "Nguon",
    ]);
    ensureChartDbSheet_();
    upsertUsageGuideSheet_();
    logSystem_(
        "INFO",
        "setupApp",
        "Khoi tao app va tao cac sheet can thiet",
        "",
    );

    var result = syncAllFundsAndNav_();
    ensureWatchlistHistory_(getHistoryTargetCodes_(), {
        force: false,
        maxCodes: 20,
    });
    buildDashboard_();
    updateWatchlistPage_();
    styleAllSheets_();
    takeSnapshot();

    SpreadsheetApp.getActive().toast(
        "Khoi tao xong. Da dong bo " + result.updated + " quy.",
        "APP QUAN LY",
        4,
    );
}

function showUsageGuide() {
    upsertUsageGuideSheet_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.GUIDE_SHEET);
    if (sh) ss.setActiveSheet(sh);
}

function showSystemLog() {
    ensureSheetWithHeader_(APP_CFG.DEBUG_SHEET, [
        "Timestamp",
        "Level",
        "Action",
        "Message",
        "Detail",
    ]);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.DEBUG_SHEET);
    if (sh) ss.setActiveSheet(sh);
}

function showWatchlistPage() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.CHART_SHEET);
    if (!sh) {
        ensureSheetWithHeader_(APP_CFG.CHART_SHEET, [
            "Ma Quy",
            "So diem du lieu",
            "Lan cap nhat",
            "Nguon",
        ]);
        sh = ss.getSheetByName(APP_CFG.CHART_SHEET);
    }
    ensureChartDbSheet_();
    if (sh) ss.setActiveSheet(sh);
}

function showChartFragment() {
    // Backward-compatible alias: now charts are rendered on a dedicated sheet page.
    showWatchlistPage();
}

function showForm() {
    var funds = getFundCodes_();
    if (!funds.length) {
        syncAllFundsAndNav_();
        funds = getFundCodes_();
    }

    var optionsHtml = "";
    for (var i = 0; i < funds.length; i++) {
        optionsHtml += "<option>" + escapeHtml_(funds[i]) + "</option>";
    }
    if (!optionsHtml) {
        optionsHtml =
            '<option value="">Khong tim thay ma quy (hay chay sync API)</option>';
    }

    var htmlString =
        "<!DOCTYPE html>" +
        "<html><head><style>" +
        "body{font-family:Segoe UI,Roboto,Arial;background:#f8fafc;padding:20px;}" +
        ".card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,.06);}" +
        "h2{margin:0 0 16px;font-size:18px;color:#0f172a;}" +
        ".form-group{margin-bottom:12px;}" +
        "label{display:block;font-size:13px;color:#64748b;margin-bottom:6px;}" +
        "input,select{width:100%;padding:10px;border-radius:6px;border:1px solid #e2e8f0;box-sizing:border-box;}" +
        "button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:6px;background:#0f172a;color:#fff;font-weight:600;cursor:pointer;}" +
        '</style></head><body><div class="card">' +
        "<h2>Nhap giao dich</h2>" +
        '<form onsubmit="event.preventDefault();saveTx(this)">' +
        '<div class="form-group"><label>Ma quy</label><select name="maQuy" required>' +
        optionsHtml +
        "</select></div>" +
        '<div class="form-group"><label>Ngay</label><input type="date" name="ngay" required></div>' +
        '<div class="form-group"><label>So tien (VND)</label><input type="number" min="0" step="1000" name="tien" required></div>' +
        '<div class="form-group"><label>So CCQ (co the de trong)</label><input type="number" min="0" step="0.0001" name="ccq"></div>' +
        '<div style="font-size:12px;color:#64748b">Neu de trong So CCQ, he thong se tu tinh theo NAV hien tai de tranh sai lech.</div>' +
        '<button id="btn">Luu giao dich</button>' +
        "</form></div>" +
        "<script>" +
        'document.querySelector("[name=ngay]").valueAsDate=new Date();' +
        'function saveTx(form){var b=document.getElementById("btn");b.disabled=true;b.textContent="Dang xu ly...";' +
        'google.script.run.withSuccessHandler(function(){google.script.host.close();}).withFailureHandler(function(e){alert(e.message||e);b.disabled=false;b.textContent="Luu giao dich";}).processForm(form);}' +
        "</script></body></html>";

    SpreadsheetApp.getUi().showModalDialog(
        HtmlService.createHtmlOutput(htmlString).setWidth(360).setHeight(420),
        "NHAP GIAO DICH",
    );
}

function processForm(data) {
    var maQuy = String(data.maQuy || "").trim();
    var tien = Number(data.tien || 0);
    var ccq = Number(data.ccq || 0);
    if (!maQuy || tien <= 0) throw new Error("Du lieu giao dich khong hop le.");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName(APP_CFG.LOG_SHEET);
    var dt = parseInputDate_(String(data.ngay || ""));

    var navNow = getCurrentNavByCode_(maQuy);
    if (!ccq || ccq <= 0) {
        if (!navNow || navNow <= 0) {
            throw new Error(
                "Khong tim thay NAV hien tai cho ma quy " +
                    maQuy +
                    ". Vui long Sync truoc hoac nhap So CCQ.",
            );
        }
        ccq = tien / navNow;
    }

    var donGia = tien / ccq;

    if (navNow > 0 && donGia > navNow * 5) {
        throw new Error(
            "Don gia giao dich dang cao bat thuong so voi NAV hien tai. Dieu nay de gay loi Lo 100%. Vui long kiem tra So CCQ hoac de trong de he thong tu tinh.",
        );
    }

    logSheet.appendRow([dt, maQuy, tien, ccq, donGia]);
    updateRealtimeNav();
}

function getCurrentNavByCode_(code) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.DB_SHEET);
    if (!sh || sh.getLastRow() < 2) return 0;
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    var target = String(code || "").trim();

    for (var i = 0; i < values.length; i++) {
        if (String(values[i][0] || "").trim() === target) {
            var nav = Number(values[i][2] || 0);
            return isNaN(nav) ? 0 : nav;
        }
    }
    return 0;
}

function resetAllData() {
    var ui = SpreadsheetApp.getUi();
    var answer = ui.alert(
        "RESET TOAN BO",
        "Ban chac chan muon xoa toan bo giao dich, database, lich su NAV, snapshot va log he thong?",
        ui.ButtonSet.YES_NO,
    );
    if (answer !== ui.Button.YES) return;

    clearSheetData_(APP_CFG.LOG_SHEET);
    clearSheetData_(APP_CFG.DB_SHEET);
    clearSheetData_(APP_CFG.NAV_HISTORY_SHEET);
    clearSheetData_(APP_CFG.SNAP_SHEET);
    clearSheetData_(APP_CFG.DEBUG_SHEET);
    clearSheetData_(APP_CFG.CHART_SHEET);
    clearSheetData_(APP_CFG.CHART_DB_SHEET);
    setStoredMonthlyContributionMap_({});

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    if (dash) {
        var charts = dash.getCharts();
        for (var i = 0; i < charts.length; i++) dash.removeChart(charts[i]);
        dash.clear();
    }

    var watch = ss.getSheetByName(APP_CFG.CHART_SHEET);
    if (watch) {
        var watchCharts = watch.getCharts();
        for (var j = 0; j < watchCharts.length; j++)
            watch.removeChart(watchCharts[j]);
        watch.clear();
    }

    buildDashboard_();
    updateWatchlistPage_();
    styleAllSheets_();
    logSystem_(
        "INFO",
        "resetAllData",
        "Da reset toan bo du lieu",
        "Bao gom log he thong",
    );
    SpreadsheetApp.getActive().toast(
        "Da reset toan bo du lieu.",
        "APP QUAN LY",
        5,
    );
}

function clearSheetData_(sheetName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    if (sh.getLastRow() > 1) {
        sh.getRange(
            2,
            1,
            sh.getLastRow() - 1,
            Math.max(1, sh.getLastColumn()),
        ).clearContent();
    }
}

function styleAllSheets_() {
    styleDataSheet_(APP_CFG.DB_SHEET);
    styleDataSheet_(APP_CFG.LOG_SHEET);
    styleDataSheet_(APP_CFG.NAV_HISTORY_SHEET);
    styleDataSheet_(APP_CFG.SNAP_SHEET);
    styleDataSheet_(APP_CFG.DEBUG_SHEET);
    styleDataSheet_(APP_CFG.CHART_DB_SHEET);
    styleWatchlistSheet_();
    styleGuideSheet_();
}

function ensureChartDbSheet_() {
    ensureSheetWithHeader_(APP_CFG.CHART_DB_SHEET, [
        "meta",
        "v1",
        "v2",
        "v3",
        "v4",
        "v5",
        "v6",
        "v7",
    ]);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.CHART_DB_SHEET);
    if (!sh) return;
    if (!sh.isSheetHidden()) {
        sh.hideSheet();
    }
}

function styleDataSheet_(sheetName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;

    var lastCol = Math.max(1, sh.getLastColumn());
    sh.setFrozenRows(1);
    sh.setHiddenGridlines(false);
    sh.getRange(1, 1, 1, lastCol)
        .setBackground("#0f172a")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");

    if (sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).setVerticalAlignment(
            "middle",
        );
    }
}

function styleGuideSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.GUIDE_SHEET);
    if (!sh) return;
    sh.setFrozenRows(1);
    sh.setHiddenGridlines(true);
}

function styleWatchlistSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.CHART_SHEET);
    if (!sh) return;

    sh.setFrozenRows(6);
    sh.setHiddenGridlines(true);
    sh.setColumnWidths(1, 1, 150);
    sh.setColumnWidths(2, 1, 120);
    sh.setColumnWidths(3, 1, 150);
    sh.setColumnWidths(4, 1, 160);
    sh.setColumnWidths(5, 1, 220);
    sh.setColumnWidths(6, 1, 110);
    sh.setColumnWidths(7, 1, 130);
    sh.setColumnWidths(8, 10, 120);
    var maxRows = Math.max(2000, sh.getMaxRows());
    sh.getRange(1, 1, maxRows, 20).setBackground("#f6f8fc");
    sh.getRange("A1:T1").setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        "#0b1f3a",
        SpreadsheetApp.BorderStyle.SOLID_MEDIUM,
    );
    sh.getRange("A2:T2").setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        "#dbeafe",
        SpreadsheetApp.BorderStyle.SOLID,
    );
    sh.getRange("A3:T4").setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#d9e2f0",
        SpreadsheetApp.BorderStyle.SOLID,
    );
    sh.getRange("A6:G6")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle");
    sh.getRange(7, 1, Math.max(1, maxRows - 6), 7).setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#e2e8f0",
        SpreadsheetApp.BorderStyle.SOLID,
    );
}

function refreshChecklistCharts() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    if (!dash) return;

    var selected = getSelectedTrackedCodes_(dash);
    dash.getRange("O7").setValue(selected.length);
    dash.getRange("N11").setValue("Theo doi bang checkbox cot J");

    // onEdit simple trigger should avoid heavy calls/backfill.
    updateWatchlistPage_(selected, { skipBackfill: true, silent: true });
}

function onEdit(e) {
    try {
        if (!e || !e.range) return;
        var sh = e.range.getSheet();
        if (!sh) return;

        if (sh.getName() === APP_CFG.DASH_SHEET) {
            // Per-fund monthly contribution: column H (8), starting from row 9.
            if (e.range.getColumn() === 8 && e.range.getRow() >= 9) {
                var code = String(
                    sh.getRange(e.range.getRow(), 1).getDisplayValue() || "",
                ).trim();
                if (code) {
                    var amount = parseMonthlyContribution_(
                        e.range.getDisplayValue(),
                    );
                    sh.getRange(e.range.getRow(), 8)
                        .setValue(amount)
                        .setNumberFormat("#,##0");
                    setStoredMonthlyContributionByCode_(code, amount);
                }
                refreshProjectionPanel_(sh);
                renderOverviewCharts_(
                    sh,
                    Math.max(9, 8 + getFundCodes_().length),
                );
                return;
            }

            // Checklist area: column J (10), starting from row 9.
            if (e.range.getColumn() === 10 && e.range.getRow() >= 9) {
                refreshChecklistCharts();
                return;
            }

            // Projection controls on dashboard.
            var a1Dash = e.range.getA1Notation();
            if (a1Dash === "L7" || a1Dash === "S4") {
                setStoredProjectionYears_(e.range.getDisplayValue());
                refreshProjectionPanel_(sh);
                renderOverviewCharts_(
                    sh,
                    Math.max(9, 8 + getFundCodes_().length),
                );
                return;
            }
            return;
        }
    } catch (err) {
        Logger.log("onEdit skipped: " + err);
    }
}

function setStoredGapLabel_(label) {
    var normalized = normalizeGapLabel_(label);
    PropertiesService.getScriptProperties().setProperty(
        "watch_gap_label",
        normalized,
    );
}

function getStoredGapLabel_() {
    var stored =
        PropertiesService.getScriptProperties().getProperty("watch_gap_label");
    return normalizeGapLabel_(stored || APP_CFG.DEFAULT_GAP_LABEL);
}

function setStoredProjectionYears_(value) {
    var years = parseProjectionYears_(value);
    PropertiesService.getScriptProperties().setProperty(
        "projection_years",
        String(years),
    );
}

function getStoredProjectionYears_() {
    var raw =
        PropertiesService.getScriptProperties().getProperty("projection_years");
    return parseProjectionYears_(raw || APP_CFG.DEFAULT_PROJECTION_YEARS);
}

function parseProjectionYears_(value) {
    var years = Number(value);
    if (isNaN(years) || years <= 0) return APP_CFG.DEFAULT_PROJECTION_YEARS;
    years = Math.round(years);
    if (years < 1) years = 1;
    if (years > 50) years = 50;
    return years;
}

function setStoredMonthlyContribution_(value) {
    var amount = parseMonthlyContribution_(value);
    PropertiesService.getScriptProperties().setProperty(
        "projection_monthly_contribution",
        String(amount),
    );
}

function getStoredMonthlyContribution_() {
    var raw = PropertiesService.getScriptProperties().getProperty(
        "projection_monthly_contribution",
    );
    return parseMonthlyContribution_(raw || 0);
}

function parseMonthlyContribution_(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") {
        if (isNaN(value) || value < 0) return 0;
        return Math.round(value);
    }

    var s = String(value).trim();
    if (!s) return 0;
    // Accept common VN/EN formatted currency inputs like 1.000.000 or 1,000,000.
    s = s.replace(/[^0-9\-]/g, "");
    var amount = Number(s);
    if (isNaN(amount) || amount < 0) return 0;
    return Math.round(amount);
}

function getStoredMonthlyContributionMap_() {
    var raw = PropertiesService.getScriptProperties().getProperty(
        "monthly_contribution_by_code",
    );
    if (!raw) return {};
    try {
        var parsed = JSON.parse(raw);
        if (
            !parsed ||
            Object.prototype.toString.call(parsed) !== "[object Object]"
        )
            return {};
        var out = {};
        for (var k in parsed) {
            if (!parsed.hasOwnProperty(k)) continue;
            var code = String(k || "").trim();
            var amount = parseMonthlyContribution_(parsed[k]);
            if (!code || amount <= 0) continue;
            out[code] = amount;
        }
        return out;
    } catch (e) {
        return {};
    }
}

function setStoredMonthlyContributionMap_(map) {
    var clean = {};
    if (map && Object.prototype.toString.call(map) === "[object Object]") {
        for (var k in map) {
            if (!map.hasOwnProperty(k)) continue;
            var code = String(k || "").trim();
            var amount = parseMonthlyContribution_(map[k]);
            if (!code || amount <= 0) continue;
            clean[code] = amount;
        }
    }
    PropertiesService.getScriptProperties().setProperty(
        "monthly_contribution_by_code",
        JSON.stringify(clean),
    );
}

function setStoredMonthlyContributionByCode_(code, amount) {
    var cleanCode = String(code || "").trim();
    if (!cleanCode) return;

    var map = getStoredMonthlyContributionMap_();
    var cleanAmount = parseMonthlyContribution_(amount);
    if (cleanAmount > 0) {
        map[cleanCode] = cleanAmount;
    } else {
        delete map[cleanCode];
    }
    setStoredMonthlyContributionMap_(map);
}

function mergeMonthlyContributionMaps_(a, b) {
    var out = {};
    var srcA =
        a && Object.prototype.toString.call(a) === "[object Object]" ? a : {};
    var srcB =
        b && Object.prototype.toString.call(b) === "[object Object]" ? b : {};

    for (var ka in srcA) {
        if (!srcA.hasOwnProperty(ka)) continue;
        var ca = String(ka || "").trim();
        var va = parseMonthlyContribution_(srcA[ka]);
        if (ca && va > 0) out[ca] = va;
    }
    for (var kb in srcB) {
        if (!srcB.hasOwnProperty(kb)) continue;
        var cb = String(kb || "").trim();
        var vb = parseMonthlyContribution_(srcB[kb]);
        if (cb && vb > 0) out[cb] = vb;
    }
    return out;
}

function fetchFmarketData() {
    try {
        logSystem_(
            "INFO",
            "fetchFmarketData",
            "Bat dau sync full quy + NAV",
            "",
        );
        var result = syncAllFundsAndNav_();
        ensureWatchlistHistory_(getHistoryTargetCodes_(), {
            force: false,
            maxCodes: 20,
        });
        buildDashboard_();
        updateWatchlistPage_();
        logSystem_(
            "INFO",
            "fetchFmarketData",
            "Sync thanh cong",
            "updated=" + result.updated + ", history=" + result.history,
        );
        SpreadsheetApp.getActive().toast(
            "Sync xong: " +
                result.updated +
                " quy, " +
                result.history +
                " diem NAV.",
            "APP QUAN LY",
            5,
        );
    } catch (err) {
        logSystem_("ERROR", "fetchFmarketData", "Sync that bai", String(err));
        SpreadsheetApp.getActive().toast(
            "Sync that bai: " + err,
            "APP QUAN LY",
            8,
        );
        throw err;
    }
}

function updateRealtimeNav() {
    try {
        var result = syncAllFundsAndNav_();
        ensureWatchlistHistory_(getHistoryTargetCodes_(), {
            force: false,
            maxCodes: 20,
        });
        buildDashboard_();
        updateWatchlistPage_();
        takeSnapshot();
        logSystem_(
            "INFO",
            "updateRealtimeNav",
            "Cap nhat NAV thanh cong",
            "updated=" + result.updated + ", history=" + result.history,
        );
        SpreadsheetApp.getActive().toast(
            "Cap nhat NAV xong: " + result.updated + " quy.",
            "APP QUAN LY",
            4,
        );
    } catch (err) {
        logSystem_(
            "ERROR",
            "updateRealtimeNav",
            "Cap nhat NAV that bai",
            String(err),
        );
        Logger.log("updateRealtimeNav failed: " + err);
    }
}

function installAutoTriggers() {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        var name = triggers[i].getHandlerFunction();
        if (name === "updateRealtimeNav" || name === "takeSnapshot") {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }

    ScriptApp.newTrigger("updateRealtimeNav")
        .timeBased()
        .everyMinutes(APP_CFG.UPDATE_INTERVAL_MINUTES)
        .create();
    ScriptApp.newTrigger("takeSnapshot")
        .timeBased()
        .everyHours(APP_CFG.SNAPSHOT_INTERVAL_HOURS)
        .create();
    logSystem_(
        "INFO",
        "installAutoTriggers",
        "Da cai trigger cap nhat dinh ky",
        "updateRealtimeNav moi " +
            APP_CFG.UPDATE_INTERVAL_MINUTES +
            " phut + takeSnapshot moi " +
            APP_CFG.SNAPSHOT_INTERVAL_HOURS +
            " gio",
    );
}

function takeSnapshot() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dashSheet = ss.getSheetByName(APP_CFG.DASH_SHEET);
    var snapSheet = ss.getSheetByName(APP_CFG.SNAP_SHEET);
    if (!dashSheet || !snapSheet) return;

    var totalAsset = Number(dashSheet.getRange("C4").getValue() || 0);
    if (!totalAsset || isNaN(totalAsset)) return;

    var now = new Date();
    var today = Utilities.formatDate(now, APP_CFG.TIME_ZONE, "dd/MM/yyyy");
    var lastRow = Math.max(2, snapSheet.getLastRow());
    var lastDateCell = snapSheet.getRange(lastRow, 1).getValue();
    var lastDate = formatDateCell_(lastDateCell);

    if (lastDate === today) {
        snapSheet.getRange(lastRow, 2).setValue(totalAsset);
    } else {
        snapSheet.appendRow([today, totalAsset]);
    }
}

function syncAllFundsAndNav_() {
    ensureSheetWithHeader_(APP_CFG.DB_SHEET, [
        "Ma Quy",
        "Ten Quy",
        "Gia NAV Moi Nhat",
        "Nha Quan Ly",
        "Updated At",
        "Annual Return Est",
        "Product ID",
    ]);
    ensureSheetWithHeader_(APP_CFG.NAV_HISTORY_SHEET, [
        "Timestamp",
        "Ma Quy",
        "NAV",
        "Source",
    ]);
    ensureSheetWithHeader_(APP_CFG.DEBUG_SHEET, [
        "Timestamp",
        "Level",
        "Action",
        "Message",
        "Detail",
    ]);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dbSheet = ss.getSheetByName(APP_CFG.DB_SHEET);
    var historySheet = ss.getSheetByName(APP_CFG.NAV_HISTORY_SHEET);
    var now = new Date();

    var funds = fetchAllFundsFromApi_();
    if (!funds.length) {
        logSystem_(
            "WARN",
            "syncAllFundsAndNav_",
            "Khong lay duoc du lieu quy moi",
            "Su dung du lieu cu neu co",
        );
        return { updated: 0, history: 0 };
    }

    var rows = [];
    var historyRows = [];

    for (var i = 0; i < funds.length; i++) {
        var f = normalizeFundItem_(
            funds[i],
            funds[i].source || APP_CFG.API_URL,
        );
        if (!f.code) continue;

        rows.push([
            f.code,
            f.name,
            f.nav,
            f.company,
            now,
            f.annualReturnEst,
            f.productId || "",
        ]);
        if (f.nav > 0 && !isNaN(f.nav)) {
            historyRows.push([now, f.code, Number(f.nav), f.source]);
        }
    }

    rows.sort(function (a, b) {
        return String(a[0]).localeCompare(String(b[0]));
    });

    if (dbSheet.getLastRow() > 1 && rows.length) {
        dbSheet.getRange(2, 1, dbSheet.getLastRow() - 1, 7).clearContent();
    }
    if (rows.length) {
        dbSheet.getRange(2, 1, rows.length, 7).setValues(rows);
        dbSheet.getRange(2, 6, rows.length, 1).setNumberFormat("0.00%");
    }

    if (historyRows.length) {
        var start = historySheet.getLastRow() + 1;
        historySheet
            .getRange(start, 1, historyRows.length, 4)
            .setValues(historyRows);
    }

    logSystem_(
        "INFO",
        "syncAllFundsAndNav_",
        "Dong bo DB thanh cong",
        "rows=" + rows.length + ", history=" + historyRows.length,
    );

    return { updated: rows.length, history: historyRows.length };
}

function fetchAllFundsFromApi_() {
    var page = 1;
    var pageSize = APP_CFG.PAGE_SIZE;
    var guard = 0;
    var map = {};
    var sourceLabel = APP_CFG.API_URL;

    while (guard < 100) {
        guard++;

        var result = fetchFundPageWithFallback_(page, pageSize);
        var rows = result.rows;
        if (!rows.length) break;

        sourceLabel = result.source || APP_CFG.API_URL;
        for (var i = 0; i < rows.length; i++) {
            var normalized = normalizeFundItem_(rows[i], sourceLabel);
            if (!normalized.code) continue;
            map[normalized.code] = normalized;
        }

        if (rows.length < pageSize) break;
        page++;
    }

    var out = [];
    for (var k in map) {
        if (map.hasOwnProperty(k)) out.push(map[k]);
    }
    return out;
}

function fetchFundPageWithFallback_(page, pageSize) {
    var urls = getApiUrls_();
    var payloads = buildFundPayloadVariants_(page, pageSize);
    var lastErr = "";

    for (var u = 0; u < urls.length; u++) {
        for (var p = 0; p < payloads.length; p++) {
            try {
                var cacheKey = "funds_" + u + "_" + p + "_page_" + page;
                var json = fetchJsonWithRetryAndCache_(
                    urls[u],
                    payloads[p],
                    cacheKey,
                    { suppressErrorLog: false },
                );
                var rows = extractRowsFromFundResponse_(json);
                if (rows.length) {
                    return {
                        rows: rows,
                        source: json.__source || urls[u],
                    };
                }
            } catch (err) {
                lastErr = String(err);
                logSystem_(
                    "WARN",
                    "fetchFundPageWithFallback_",
                    "POST payload fail",
                    "url=" +
                        urls[u] +
                        ", payload=" +
                        shortText_(safeJson_(payloads[p]), 1200) +
                        ", err=" +
                        shortText_(lastErr, 1200),
                );
            }
        }

        if (!APP_CFG.ENABLE_GET_FALLBACK) {
            continue;
        }

        try {
            var getCacheKey = "funds_get_" + u + "_page_" + page;
            var getUrl = buildGetUrlWithParams_(urls[u], {
                page: page,
                pageSize: pageSize,
                size: pageSize,
                limit: pageSize,
                isFundCertificate: true,
                isIpo: false,
            });
            var getJson = fetchJsonGetWithRetryAndCache_(getUrl, getCacheKey);
            var getRows = extractRowsFromFundResponse_(getJson);
            if (getRows.length) {
                return {
                    rows: getRows,
                    source: getJson.__source || getUrl,
                };
            }
        } catch (errGet) {
            lastErr = String(errGet);
            logSystem_(
                "WARN",
                "fetchFundPageWithFallback_",
                "GET fallback fail",
                "url=" + urls[u] + ", err=" + shortText_(lastErr, 1200),
            );
        }
    }

    if (lastErr) {
        Logger.log("fetchFundPageWithFallback_: " + lastErr);
        if (page === 1) {
            logSystem_(
                "ERROR",
                "fetchFundPageWithFallback_",
                "Khong lay duoc page 1 sau fallback",
                shortText_(lastErr, 500),
            );
        }
    }
    return { rows: [], source: "" };
}

function buildFundPayloadVariants_(page, pageSize) {
    if (APP_CFG.STRICT_FUND_PAYLOAD) {
        return [
            {
                types: ["TRADING_FUND"],
                issuerIds: [],
                page: page,
                pageSize: pageSize,
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
            page: page,
            pageSize: pageSize,
            sortBy: "name",
            sortOrder: "ASC",
            isIpo: false,
            isBuyable: false,
            fundAssetTypes: [],
        },
        {
            searchField: "",
            pageSize: pageSize,
            page: page,
            isFundCertificate: true,
            orderBy: "name",
            orderDirection: "asc",
        },
        {
            search: "",
            page: page,
            size: pageSize,
            isFundCertificate: true,
            sortField: "name",
            sortDirection: "asc",
        },
        {
            keyword: "",
            page: page,
            pageSize: pageSize,
            type: "FUND",
            orderBy: "name",
            orderDirection: "asc",
        },
        {
            types: [
                "NORMAL_FUND",
                "BOND_FUND",
                "BALANCED_FUND",
                "STOCK_FUND",
                "ETF",
            ],
            issuerIds: [],
            page: page,
            pageSize: pageSize,
            sortBy: "name",
            sortOrder: "ASC",
            isIpo: false,
            isBuyable: false,
            fundAssetTypes: [],
        },
    ];
}

function extractRowsFromFundResponse_(json) {
    if (!json) return [];

    if (Object.prototype.toString.call(json) === "[object Array]") {
        return json;
    }

    var candidates = [
        getNested_(json, ["data", "rows"]),
        getNested_(json, ["data", "items"]),
        getNested_(json, ["data", "data", "rows"]),
        getNested_(json, ["data", "data", "items"]),
        getNested_(json, ["rows"]),
        getNested_(json, ["items"]),
        getNested_(json, ["list"]),
        getNested_(json, ["data", "content"]),
        getNested_(json, ["result", "rows"]),
        getNested_(json, ["result", "items"]),
    ];

    for (var i = 0; i < candidates.length; i++) {
        if (
            candidates[i] &&
            Object.prototype.toString.call(candidates[i]) === "[object Array]"
        ) {
            return candidates[i];
        }
    }

    return [];
}

function getNested_(obj, path) {
    var cur = obj;
    for (var i = 0; i < path.length; i++) {
        if (cur === null || cur === undefined) return null;
        cur = cur[path[i]];
    }
    return cur;
}

function getApiUrls_() {
    var out = [];
    if (
        APP_CFG.API_URLS &&
        Object.prototype.toString.call(APP_CFG.API_URLS) === "[object Array]"
    ) {
        for (var i = 0; i < APP_CFG.API_URLS.length; i++) {
            var u = String(APP_CFG.API_URLS[i] || "").trim();
            if (u) out.push(u);
        }
    }

    if (!out.length && APP_CFG.API_URL) {
        out.push(APP_CFG.API_URL);
    }

    if (APP_CFG.PRIMARY_API_ONLY && out.length) {
        return [out[0]];
    }

    return out;
}

function fetchJsonWithRetryAndCache_(url, payload, cacheKey, options) {
    var cache = CacheService.getScriptCache();
    var attempts = 5;
    var lastError = "";
    var lastCode = 0;
    var lastBody = "";
    var suppressErrorLog = options && options.suppressErrorLog;

    for (var i = 0; i < attempts; i++) {
        try {
            var response = UrlFetchApp.fetch(url, {
                method: "post",
                contentType: "application/json",
                payload: JSON.stringify(payload),
                muteHttpExceptions: true,
                followRedirects: true,
                headers: {
                    Accept: "application/json, text/plain, */*",
                    Origin: "https://fmarket.vn",
                    Referer: "https://fmarket.vn/",
                    "User-Agent": randomUa_(),
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache",
                },
            });

            var code = response.getResponseCode();
            var body = response.getContentText() || "";
            lastCode = code;
            lastBody = body;
            if (code >= 200 && code < 300 && body) {
                var json = JSON.parse(body);
                json.__source = url;
                safeCachePut_(
                    cache,
                    cacheKey,
                    body,
                    180,
                    "fetchJsonWithRetryAndCache_",
                );
                return json;
            }

            var serverMessage = parseServerMessage_(body);

            lastError =
                "HTTP " + code + (serverMessage ? " - " + serverMessage : "");
            if (code === 403 || code === 429 || code >= 500) {
                Utilities.sleep(
                    Math.pow(2, i) * 400 + Math.floor(Math.random() * 250),
                );
                continue;
            }

            if (code === 400) {
                // Backend payload schema may change; caller will try alternate payloads.
                break;
            }

            break;
        } catch (err) {
            lastError = String(err);
            Utilities.sleep(
                Math.pow(2, i) * 400 + Math.floor(Math.random() * 250),
            );
        }
    }

    var cached = cache.get(cacheKey);
    if (cached) {
        var cachedJson = JSON.parse(cached);
        cachedJson.__source = "cache:" + url;
        logSystem_(
            "INFO",
            "fetchJsonWithRetryAndCache_",
            "Dung du lieu cache",
            "url=" + url + ", key=" + cacheKey,
        );
        return cachedJson;
    }

    if (!suppressErrorLog) {
        var detailPost =
            "url=" +
            url +
            ", code=" +
            lastCode +
            ", payload=" +
            shortText_(safeJson_(payload), 1800) +
            ", err=" +
            shortText_(lastError, 1800);
        if (APP_CFG.LOG_API_FAIL_FULL && lastBody) {
            detailPost += ", response=" + shortText_(lastBody, 2500);
        }
        logSystem_(
            "ERROR",
            "fetchJsonWithRetryAndCache_",
            "API POST fail",
            detailPost,
        );
    }
    throw new Error("API blocked or failed: " + lastError);
}

function isExpectedFallbackError_(txt) {
    var s = String(txt || "").toLowerCase();
    if (s.indexOf("http 400") >= 0) return true;
    if (s.indexOf("http 404") >= 0) return true;
    if (s.indexOf("doi so qua lon") >= 0) return true;
    if (s.indexOf("hệ thống bảo trì") >= 0) return true;
    if (s.indexOf("he thong bao tri") >= 0) return true;
    if (s.indexOf("loại sản phẩm không hợp lệ") >= 0) return true;
    return false;
}

function fetchJsonGetWithRetryAndCache_(url, cacheKey, options) {
    var cache = CacheService.getScriptCache();
    var attempts = 5;
    var lastError = "";
    var lastCode = 0;
    var lastBody = "";
    var suppressErrorLog = options && options.suppressErrorLog;

    for (var i = 0; i < attempts; i++) {
        try {
            var response = UrlFetchApp.fetch(url, {
                method: "get",
                muteHttpExceptions: true,
                followRedirects: true,
                headers: {
                    Accept: "application/json, text/plain, */*",
                    Origin: "https://fmarket.vn",
                    Referer: "https://fmarket.vn/",
                    "User-Agent": randomUa_(),
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache",
                },
            });

            var code = response.getResponseCode();
            var body = response.getContentText() || "";
            lastCode = code;
            lastBody = body;
            if (code >= 200 && code < 300 && body) {
                var json = JSON.parse(body);
                json.__source = url;
                safeCachePut_(
                    cache,
                    cacheKey,
                    body,
                    180,
                    "fetchJsonGetWithRetryAndCache_",
                );
                return json;
            }

            lastError = "HTTP " + code;
            if (code === 403 || code === 429 || code >= 500) {
                Utilities.sleep(
                    Math.pow(2, i) * 400 + Math.floor(Math.random() * 250),
                );
                continue;
            }
            break;
        } catch (err) {
            lastError = String(err);
            Utilities.sleep(
                Math.pow(2, i) * 400 + Math.floor(Math.random() * 250),
            );
        }
    }

    var cached = cache.get(cacheKey);
    if (cached) {
        var cachedJson = JSON.parse(cached);
        cachedJson.__source = "cache:" + url;
        logSystem_(
            "INFO",
            "fetchJsonGetWithRetryAndCache_",
            "Dung du lieu cache",
            "url=" + url + ", key=" + cacheKey,
        );
        return cachedJson;
    }

    if (!suppressErrorLog) {
        var detailGet =
            "url=" +
            url +
            ", code=" +
            lastCode +
            ", err=" +
            shortText_(lastError, 1800);
        if (APP_CFG.LOG_API_FAIL_FULL && lastBody) {
            detailGet += ", response=" + shortText_(lastBody, 2500);
        }
        logSystem_(
            "ERROR",
            "fetchJsonGetWithRetryAndCache_",
            "API GET fail",
            detailGet,
        );
    }
    throw new Error("API blocked or failed: " + lastError);
}

function buildGetUrlWithParams_(url, params) {
    var q = [];
    for (var k in params) {
        if (!params.hasOwnProperty(k)) continue;
        var v = params[k];
        if (v === null || v === undefined || v === "") continue;
        q.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
    if (!q.length) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
}

function buildDashboard_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    if (!dash) {
        var firstSheet =
            ss.getSheetByName("Trang tinh1") || ss.getSheetByName("Sheet1");
        if (firstSheet) {
            firstSheet.setName(APP_CFG.DASH_SHEET);
            dash = firstSheet;
        } else {
            dash = ss.insertSheet(APP_CFG.DASH_SHEET);
        }
    }

    var funds = getFundCodes_();
    var storedMonthlyByCode = getStoredMonthlyContributionMap_();
    var currentMonthlyByCode = getDashboardMonthlyContributions_();
    var preservedMonthlyByCode = mergeMonthlyContributionMaps_(
        storedMonthlyByCode,
        currentMonthlyByCode,
    );
    var preservedSelectedMap = {};
    if (dash) {
        var preservedSelected = getSelectedTrackedCodes_(dash);
        for (var ps = 0; ps < preservedSelected.length; ps++) {
            preservedSelectedMap[preservedSelected[ps]] = true;
        }
    }
    dash.clear();
    dash.getRange("A1:BD800").clearDataValidations();
    dash.setHiddenGridlines(true);
    dash.setFrozenRows(8);
    dash.setFrozenColumns(0);

    dash.getRange("A1:O1").merge().setValue("DASHBOARD DANH MUC QUY");
    dash.getRange("A1:O1")
        .setBackground("#0b1f3a")
        .setFontColor("white")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setFontSize(15)
        .setFontWeight("bold");

    dash.getRange("A2:O2")
        .setBackground("#f8fafc")
        .setFontColor("#334155")
        .setFontSize(10);

    dash.getRange("A2:O2")
        .merge()
        .setFormula(
            '="Theo doi danh muc quy tu dong | Lan dong bo: "&IFERROR(TEXT(MAX(' +
                APP_CFG.DB_SHEET +
                '!E:E),"dd/MM/yyyy HH:mm"),"chua co")&" | So ma quy: "&COUNTA(' +
                APP_CFG.DB_SHEET +
                "!A2:A)",
        )
        .setHorizontalAlignment("left")
        .setFontWeight("bold");

    dash.getRange("A3:B3")
        .merge()
        .setValue("Tong von nap")
        .setFontWeight("bold")
        .setFontColor("#64748b");
    dash.getRange("A4:B4")
        .merge()
        .setFormula("=SUM(" + APP_CFG.LOG_SHEET + "!C:C)")
        .setNumberFormat("#,##0")
        .setFontSize(14)
        .setFontWeight("bold");

    dash.getRange("C3:D3")
        .merge()
        .setValue("Tong tai san")
        .setFontWeight("bold")
        .setFontColor("#64748b");
    dash.getRange("C4:D4")
        .merge()
        .setFormula("=SUM(E9:E)")
        .setNumberFormat("#,##0")
        .setFontSize(14)
        .setFontWeight("bold")
        .setFontColor("#059669");

    dash.getRange("E3:F3")
        .merge()
        .setValue("Lai / Lo (VND)")
        .setFontWeight("bold")
        .setFontColor("#64748b");
    dash.getRange("E4:F4")
        .merge()
        .setFormula("=C4-A4")
        .setNumberFormat("#,##0")
        .setFontSize(13)
        .setFontWeight("bold");

    dash.getRange("G3:H3")
        .merge()
        .setValue("Lai / Lo (%)")
        .setFontWeight("bold")
        .setFontColor("#64748b");
    dash.getRange("G4:H4")
        .merge()
        .setFormula("=IF(A4=0,0,(C4-A4)/A4)")
        .setNumberFormat("0.00%")
        .setFontWeight("bold");

    dash.getRange("I3:J3")
        .merge()
        .setValue("Lan cap nhat")
        .setFontWeight("bold")
        .setFontColor("#64748b");
    dash.getRange("I4:J4")
        .merge()
        .setFormula("=IFERROR(MAX(" + APP_CFG.DB_SHEET + '!E:E),"")')
        .setNumberFormat("dd/MM/yyyy HH:mm:ss")
        .setFontWeight("bold");

    dash.getRange("K3:O3")
        .merge()
        .setValue("Trang thai dong bo")
        .setFontWeight("bold")
        .setFontColor("#64748b");
    dash.getRange("K4:O4")
        .merge()
        .setFormula(
            '="So quy: "&COUNTA(' +
                APP_CFG.DB_SHEET +
                '!A2:A)&" | NAV points: "&COUNTA(' +
                APP_CFG.NAV_HISTORY_SHEET +
                "!A2:A)",
        )
        .setFontWeight("bold")
        .setFontColor("#334155");

    dash.getRange("A6:O6").setBackground("#ffffff");
    dash.getRange("K6:O6")
        .merge()
        .setValue("DU BAO TANG TRUONG DANH MUC (LAI KEP + NAP THEM HANG THANG)")
        .setFontWeight("bold")
        .setFontColor("#64748b")
        .setHorizontalAlignment("center");
    dash.getRange("K7:O13").clearContent().clearDataValidations();

    var selectedCodes = Object.keys(preservedSelectedMap);
    dash.getRange("K7").setValue("Ky han du phong (nam)").setFontWeight("bold");
    dash.getRange("L7")
        .setValue(getStoredProjectionYears_())
        .setHorizontalAlignment("center")
        .setFontWeight("bold");
    dash.getRange("M7")
        .setValue("1-50")
        .setFontColor("#64748b")
        .setHorizontalAlignment("left");
    dash.getRange("N7")
        .setValue("Ma theo doi")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");
    dash.getRange("O7")
        .setValue(selectedCodes.length)
        .setHorizontalAlignment("center")
        .setFontWeight("bold");

    dash.getRange("K8")
        .setValue("Tong nap them/thang (VND)")
        .setFontWeight("bold");
    dash.getRange("L8")
        .setFormula("=IFERROR(SUM(H9:H),0)")
        .setHorizontalAlignment("center")
        .setFontWeight("bold")
        .setNumberFormat("#,##0");
    dash.getRange("M8")
        .setValue("Tong tu cot H")
        .setFontColor("#64748b")
        .setHorizontalAlignment("left");
    dash.getRange("N8")
        .setValue("Muc tieu")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");
    dash.getRange("O8")
        .setValue("Tai chinh ca nhan")
        .setHorizontalAlignment("center");

    var yearRule = SpreadsheetApp.newDataValidation()
        .requireNumberBetween(1, 50)
        .setAllowInvalid(false)
        .build();
    dash.getRange("L7").setDataValidation(yearRule);

    dash.getRange("K9:O9")
        .setValues([
            ["Chi so", "Gia tri", "Ghi chu", "Gap chart", "Trang bieu do"],
        ])
        .setFontWeight("bold")
        .setBackground("#e2e8f0")
        .setHorizontalAlignment("center");
    dash.getRange("K10").setValue("Tai san hien tai").setFontWeight("bold");
    dash.getRange("L10").setFormula("=C4").setNumberFormat("#,##0");
    dash.getRange("M10").setValue("Tinh tu tong tai san hien tai");
    dash.getRange("N10").setValue("AUTO").setHorizontalAlignment("center");
    dash.getRange("O10").setValue(APP_CFG.CHART_SHEET);
    dash.getRange("K11")
        .setValue("Loi suat uoc tinh / nam")
        .setFontWeight("bold");
    dash.getRange("K12").setValue("Gia tri du phong").setFontWeight("bold");
    dash.getRange("K13").setValue("Tang them du kien").setFontWeight("bold");

    dash.getRange("N11").setValue(
        "Moi " + APP_CFG.UPDATE_INTERVAL_MINUTES + " phut",
    );
    dash.getRange("N12").setValue("Theo doi bang checkbox cot J");
    dash.getRange("N13").setValue("Mo menu 9 de xem chart chi tiet");

    dash.getRange("J8:K8")
        .setValues([["Theo doi", "Ma quy"]])
        .setFontWeight("bold")
        .setBackground("#f1f5f9")
        .setHorizontalAlignment("center");
    var monthlyByCode = preservedMonthlyByCode;
    var trackCount = funds.length;
    if (trackCount > 0) {
        var checkVals = [];
        var codeVals = [];
        var monthlyVals = [];
        for (var t = 0; t < trackCount; t++) {
            checkVals.push([!!preservedSelectedMap[funds[t]]]);
            codeVals.push([funds[t]]);
            monthlyVals.push([Number(monthlyByCode[funds[t]] || 0)]);
        }
        dash.getRange(9, 8, trackCount, 1)
            .setValues(monthlyVals)
            .setNumberFormat("#,##0");
        dash.getRange(9, 10, trackCount, 1).insertCheckboxes();
        dash.getRange(9, 10, trackCount, 1).setValues(checkVals);
        dash.getRange(9, 11, trackCount, 1).setValues(codeVals);
        setStoredMonthlyContributionMap_(preservedMonthlyByCode);
    }

    dash.getRange("A8:H8").setValues([
        [
            "Ma Quy",
            "Tong Von",
            "Tong CCQ",
            "Gia NAV",
            "Tai San",
            "Loi Nhuan",
            "Trend",
            "Nap them/thang",
        ],
    ]);
    dash.getRange("A8:H8")
        .setFontWeight("bold")
        .setBackground("#dbeafe")
        .setHorizontalAlignment("center");
    renderProjectionPanel_(dash);

    var startRow = 9;
    if (funds.length) {
        var codes = [];
        for (var i = 0; i < funds.length; i++) codes.push([funds[i]]);
        dash.getRange(startRow, 1, codes.length, 1)
            .setValues(codes)
            .setFontWeight("bold");

        for (var r = startRow; r < startRow + funds.length; r++) {
            dash.getRange(r, 2)
                .setFormula(
                    "=SUMIFS(" +
                        APP_CFG.LOG_SHEET +
                        "!C:C," +
                        APP_CFG.LOG_SHEET +
                        "!B:B,A" +
                        r +
                        ")",
                )
                .setNumberFormat("#,##0");
            dash.getRange(r, 3)
                .setFormula(
                    "=SUMIFS(" +
                        APP_CFG.LOG_SHEET +
                        "!D:D," +
                        APP_CFG.LOG_SHEET +
                        "!B:B,A" +
                        r +
                        ")",
                )
                .setNumberFormat("#,##0.0000");
            dash.getRange(r, 4)
                .setFormula(
                    "=IFERROR(VLOOKUP(A" +
                        r +
                        "," +
                        APP_CFG.DB_SHEET +
                        "!A:C,3,FALSE),0)",
                )
                .setNumberFormat("#,##0.00");
            dash.getRange(r, 5)
                .setFormula("=C" + r + "*D" + r)
                .setNumberFormat("#,##0")
                .setFontWeight("bold");
            dash.getRange(r, 6)
                .setFormula(
                    "=IF(B" + r + "=0,0,(E" + r + "-B" + r + ")/B" + r + ")",
                )
                .setNumberFormat("0.00%");
            dash.getRange(r, 7).setFormula(
                "=IF(F" +
                    r +
                    '="","",SPARKLINE(F' +
                    r +
                    ',{"charttype","bar";"max",0.5;"color1",IF(F' +
                    r +
                    '>0,"#059669","#dc2626")}))',
            );
            dash.getRange(r, 8).setNumberFormat("#,##0");
        }

        var dataEnd = startRow + funds.length - 1;

        applyDashboardStyle_(dash, dataEnd);
        drawCharts_(dash, dataEnd);
    } else {
        applyDashboardStyle_(dash, 9);
        drawCharts_(dash, 9);
    }
}

function drawCharts_(dash, dataEnd) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dashSheet = dash || ss.getSheetByName(APP_CFG.DASH_SHEET);
    if (!dashSheet) return;

    var selected = getSelectedTrackedCodes_(dashSheet);

    updateWatchlistPage_(selected);
    renderOverviewCharts_(dashSheet, dataEnd);
    ss.toast(
        "Da cap nhat trang bieu do theo danh sach tick.",
        "APP QUAN LY",
        3,
    );
}

function renderOverviewCharts_(dashSheet, dataEnd) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var snapSheet = ss.getSheetByName(APP_CFG.SNAP_SHEET);

    var charts = dashSheet.getCharts();
    for (var i = 0; i < charts.length; i++) {
        dashSheet.removeChart(charts[i]);
    }

    if (dataEnd < 9) return;

    var chartBaseRow = Math.max(dataEnd + 3, 16);
    var chartCol = 1;
    var chartWidth = 1080;
    var chartHeight = 260;

    var pie = dashSheet
        .newChart()
        .setChartType(Charts.ChartType.PIE)
        .addRange(dashSheet.getRange("A8:A" + dataEnd))
        .addRange(dashSheet.getRange("E8:E" + dataEnd))
        .setPosition(chartBaseRow, chartCol, 0, 0)
        .setOption("title", "% phan bo danh muc")
        .setOption("legend", { position: "right" })
        .setOption("pieHole", 0.42)
        .setOption("width", chartWidth)
        .setOption("height", chartHeight)
        .build();
    dashSheet.insertChart(pie);

    var pnl = dashSheet
        .newChart()
        .setChartType(Charts.ChartType.COLUMN)
        .addRange(dashSheet.getRange("A8:A" + dataEnd))
        .addRange(dashSheet.getRange("F8:F" + dataEnd))
        .setPosition(chartBaseRow + 14, chartCol, 0, 0)
        .setOption("title", "Loi / Lo theo ma quy")
        .setOption("legend", { position: "none" })
        .setOption("width", chartWidth)
        .setOption("height", chartHeight)
        .build();
    dashSheet.insertChart(pnl);

    if (snapSheet && snapSheet.getLastRow() >= 2) {
        var growth = dashSheet
            .newChart()
            .setChartType(Charts.ChartType.LINE)
            .addRange(snapSheet.getRange("A1:B" + snapSheet.getLastRow()))
            .setPosition(chartBaseRow + 28, chartCol, 0, 0)
            .setOption("title", "Tang truong tong tai san")
            .setOption("legend", { position: "none" })
            .setOption("width", chartWidth)
            .setOption("height", chartHeight)
            .build();
        dashSheet.insertChart(growth);
    }

    var years = getStoredProjectionYears_();
    var projection = computePortfolioProjection_(years);
    var projectionRows = buildProjectionSeriesRows_(
        projection.currentTotal,
        projection.weightedRate,
        projection.years,
        projection.totalMonthly,
    );
    if (projectionRows.length >= 2) {
        dashSheet.getRange("P9:Q300").clearContent();
        dashSheet.getRange("P9:Q9").setValues([["Nam", "Gia tri du phong"]]);
        dashSheet
            .getRange(10, 16, projectionRows.length, 2)
            .setValues(projectionRows);
        dashSheet
            .getRange(10, 17, projectionRows.length, 1)
            .setNumberFormat("#,##0");

        var projectionChart = dashSheet
            .newChart()
            .setChartType(Charts.ChartType.LINE)
            .addRange(dashSheet.getRange(9, 16, projectionRows.length + 1, 2))
            .setPosition(chartBaseRow + 42, chartCol, 0, 0)
            .setOption("title", "Du phong tang truong danh muc")
            .setOption("legend", { position: "none" })
            .setOption("curveType", "function")
            .setOption("width", chartWidth)
            .setOption("height", chartHeight)
            .build();
        dashSheet.insertChart(projectionChart);
    }
}

function buildProjectionSeriesRows_(
    currentTotal,
    annualRate,
    years,
    monthlyContribution,
) {
    var pv = Number(currentTotal || 0);
    var r = Number(annualRate || 0);
    var n = parseProjectionYears_(years);
    var pmt = parseMonthlyContribution_(monthlyContribution);
    if (!pv || isNaN(pv) || pv <= 0) return [];

    var rows = [];
    for (var y = 0; y <= n; y++) {
        var value = projectFutureValue_(pv, r, y, pmt);
        rows.push([y, value]);
    }
    return rows;
}

function refreshProjectionPanel_(dashSheet) {
    var dash = dashSheet;
    if (!dash) {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    }
    if (!dash) return;
    renderProjectionPanel_(dash);
}

function renderProjectionPanel_(dash) {
    var years = getStoredProjectionYears_();
    var projection = computePortfolioProjection_(years);

    dash.getRange("L7")
        .setValue(projection.years)
        .setHorizontalAlignment("center")
        .setFontWeight("bold");
    dash.getRange("L8")
        .setValue(projection.totalMonthly)
        .setNumberFormat("#,##0")
        .setHorizontalAlignment("center")
        .setFontWeight("bold");
    dash.getRange("L11")
        .setValue(projection.weightedRate)
        .setNumberFormat("0.00%")
        .setFontWeight("bold");
    dash.getRange("L12")
        .setValue(projection.projectedTotal)
        .setNumberFormat("#,##0")
        .setFontWeight("bold")
        .setFontColor("#059669");
    dash.getRange("L13")
        .setValue(projection.projectedTotal - projection.currentTotal)
        .setNumberFormat("#,##0")
        .setFontWeight("bold");
    dash.getRange("M11")
        .setValue("So ma co du lieu: " + projection.holdingsCount)
        .setFontColor("#475569");
    dash.getRange("M12")
        .setValue("FV = PV*(1+r)^n + PMT")
        .setFontColor("#475569");
    dash.getRange("M13")
        .setValue("PMT theo tung ma o cot H")
        .setFontColor("#475569");
}

function computePortfolioProjection_(years) {
    var horizonYears = parseProjectionYears_(years);
    var holdings = getPortfolioHoldings_();
    var monthlyByCode = getDashboardMonthlyContributions_();
    var codeMap = {};
    var i;

    for (i = 0; i < holdings.length; i++) {
        codeMap[holdings[i].code] = true;
    }
    for (var mc in monthlyByCode) {
        if (!monthlyByCode.hasOwnProperty(mc)) continue;
        if (Number(monthlyByCode[mc] || 0) > 0) codeMap[mc] = true;
    }

    var codes = [];
    for (var ck in codeMap) {
        if (codeMap.hasOwnProperty(ck)) codes.push(ck);
    }

    if (!codes.length) {
        return {
            years: horizonYears,
            currentTotal: 0,
            weightedRate: APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE,
            projectedTotal: 0,
            totalMonthly: 0,
            holdingsCount: 0,
        };
    }

    var holdingMap = {};
    for (i = 0; i < holdings.length; i++) {
        holdingMap[holdings[i].code] = holdings[i];
    }

    var total = 0;
    var totalMonthly = 0;
    var weightedRateNum = 0;
    var weightedDen = 0;
    var projectedTotal = 0;
    var used = 0;

    for (i = 0; i < codes.length; i++) {
        var code = codes[i];
        var h = holdingMap[code] || { value: 0 };
        var pv = Number(h.value || 0);
        var pmt = parseMonthlyContribution_(monthlyByCode[code] || 0);
        if (pv <= 0 && pmt <= 0) continue;

        total += Math.max(0, pv);
        totalMonthly += pmt;

        var rate = estimateFundAnnualReturn_(code);
        if (isNaN(rate)) rate = APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE;
        if (rate < -0.95) rate = -0.95;
        if (rate > 1.5) rate = 1.5;

        var exposure = Math.max(0, pv) + pmt * 12;
        if (exposure > 0) {
            weightedRateNum += exposure * rate;
            weightedDen += exposure;
        }

        projectedTotal += projectFutureValue_(
            Math.max(0, pv),
            rate,
            horizonYears,
            pmt,
        );
        used++;
    }

    if (total <= 0 && totalMonthly <= 0) {
        return {
            years: horizonYears,
            currentTotal: 0,
            weightedRate: APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE,
            projectedTotal: 0,
            totalMonthly: 0,
            holdingsCount: used,
        };
    }

    var weightedRate =
        weightedDen > 0
            ? weightedRateNum / weightedDen
            : APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE;
    if (isNaN(weightedRate))
        weightedRate = APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE;

    return {
        years: horizonYears,
        currentTotal: total,
        weightedRate: weightedRate,
        projectedTotal: projectedTotal,
        totalMonthly: totalMonthly,
        holdingsCount: used,
    };
}

function projectFutureValue_(
    presentValue,
    annualRate,
    years,
    monthlyContribution,
) {
    var pv = Number(presentValue || 0);
    var rAnnual = Number(annualRate || 0);
    var nYears = Math.max(0, Number(years || 0));
    var pmt = Math.max(0, Number(monthlyContribution || 0));
    if (pv <= 0) return 0;

    var nMonths = Math.round(nYears * 12);
    if (nMonths <= 0) return pv;

    var rMonthly = rAnnual / 12;
    var growth = Math.pow(1 + rMonthly, nMonths);
    var fvPv = pv * growth;
    if (pmt <= 0) return fvPv;

    if (Math.abs(rMonthly) < 1e-9) {
        return fvPv + pmt * nMonths;
    }
    var fvPmt = pmt * ((growth - 1) / rMonthly);
    return fvPv + fvPmt;
}

function getPortfolioHoldings_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var db = ss.getSheetByName(APP_CFG.DB_SHEET);
    var log = ss.getSheetByName(APP_CFG.LOG_SHEET);
    if (!db || !log || db.getLastRow() < 2) return [];

    var navMap = {};
    var dbRows = db.getRange(2, 1, db.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < dbRows.length; i++) {
        var code = String(dbRows[i][0] || "").trim();
        var nav = Number(dbRows[i][2] || 0);
        if (!code || !nav || isNaN(nav)) continue;
        navMap[code] = nav;
    }

    var ccqMap = {};
    if (log.getLastRow() >= 2) {
        var logRows = log.getRange(2, 1, log.getLastRow() - 1, 4).getValues();
        for (var j = 0; j < logRows.length; j++) {
            var txCode = String(logRows[j][1] || "").trim();
            var ccq = Number(logRows[j][3] || 0);
            if (!txCode || !ccq || isNaN(ccq)) continue;
            ccqMap[txCode] = (ccqMap[txCode] || 0) + ccq;
        }
    }

    var out = [];
    for (var k in ccqMap) {
        if (!ccqMap.hasOwnProperty(k)) continue;
        var navNow = Number(navMap[k] || 0);
        if (!navNow || isNaN(navNow)) continue;
        var value = ccqMap[k] * navNow;
        out.push({ code: k, ccq: ccqMap[k], nav: navNow, value: value });
    }
    return out;
}

function estimateFundAnnualReturn_(code) {
    var series = getNavSeriesByCode_(code, 5000);
    var cagr = estimateCagrFromSeries_(series);
    var apiRate = getApiAnnualReturnFromDb_(code);
    var fallback = APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE;

    var hasCagr = !isNaN(cagr);
    var hasApi = !isNaN(apiRate);
    var annual;

    if (hasCagr && hasApi) {
        annual = cagr * 0.7 + apiRate * 0.3;
    } else if (hasCagr) {
        annual = cagr;
    } else if (hasApi) {
        annual = apiRate;
    } else {
        annual = fallback;
    }

    if (annual < -0.5) annual = -0.5;
    if (annual > 0.8) annual = 0.8;
    return annual;
}

function estimateCagrFromSeries_(series) {
    if (!series || series.length < 2) return NaN;
    var first = series[0];
    var last = series[series.length - 1];
    var firstNav = Number(first[1] || 0);
    var lastNav = Number(last[1] || 0);
    if (firstNav <= 0 || lastNav <= 0) return NaN;

    var days = (Number(last[0]) - Number(first[0])) / (24 * 60 * 60 * 1000);
    if (!days || days < 30) return NaN;

    var cagr = Math.pow(lastNav / firstNav, 365 / days) - 1;
    if (isNaN(cagr)) return NaN;

    if (days < APP_CFG.MIN_HISTORY_DAYS_FOR_STRONG_CAGR) {
        cagr = cagr * 0.6 + APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE * 0.4;
    }

    return cagr;
}

function getApiAnnualReturnFromDb_(code) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var db = ss.getSheetByName(APP_CFG.DB_SHEET);
    if (!db || db.getLastRow() < 2) return NaN;

    var rows = db.getRange(2, 1, db.getLastRow() - 1, 6).getValues();
    var target = String(code || "").trim();
    for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || "").trim() !== target) continue;
        var v = Number(rows[i][5]);
        if (isNaN(v)) return NaN;
        return v;
    }
    return NaN;
}

function getSelectedTrackedCodes_(dashSheet) {
    var dash = dashSheet;
    if (!dash) return [];

    var out = [];
    var funds = getFundCodes_();
    var lastTrackRow = Math.max(9, 8 + funds.length);
    if (lastTrackRow < 9) return out;

    var tracking = dash.getRange(9, 10, lastTrackRow - 8, 2).getValues();
    for (var i = 0; i < tracking.length; i++) {
        if (tracking[i][0] === true && String(tracking[i][1] || "").trim()) {
            out.push(String(tracking[i][1]).trim());
        }
    }
    return uniqueArray_(out);
}

function updateWatchlistPage_(selectedCodes, options) {
    options = options || {};
    var skipBackfill = options.skipBackfill === true;
    ensureSheetWithHeader_(APP_CFG.CHART_SHEET, [
        "Ma Quy",
        "So diem du lieu",
        "Lan cap nhat",
        "Nguon",
    ]);
    ensureChartDbSheet_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var watch = ss.getSheetByName(APP_CFG.CHART_SHEET);
    var chartDb = ss.getSheetByName(APP_CFG.CHART_DB_SHEET);
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    if (!watch || !chartDb) return;

    var selected = [];
    if (
        selectedCodes &&
        Object.prototype.toString.call(selectedCodes) === "[object Array]"
    ) {
        selected = uniqueArray_(selectedCodes);
    } else if (dash) {
        selected = getSelectedTrackedCodes_(dash);
    }

    if (!selected.length) {
        var allCodes = getFundCodes_();
        if (allCodes.length) selected.push(allCodes[0]);
    }

    selected = selected.slice(0, 12);
    if (!skipBackfill) {
        ensureWatchlistHistory_(selected, { force: false, maxCodes: 12 });
    }
    var chartRowsNeeded = 12 + Math.max(1, selected.length) * 70 + 20;
    var paintRows = Math.max(600, chartRowsNeeded);

    var charts = watch.getCharts();
    for (var i = 0; i < charts.length; i++) watch.removeChart(charts[i]);

    watch.clear();
    chartDb.clear();

    // Clean old validation rules from legacy gap selectbox UI.
    watch
        .getRange(1, 1, watch.getMaxRows(), watch.getMaxColumns())
        .clearDataValidations();

    chartDb
        .getRange(1, 1, 1, 8)
        .setValues([
            [
                "Ma",
                "Line_TS",
                "Line_NAV",
                "Candle_Label",
                "Candle_Low",
                "Candle_Open",
                "Candle_Close",
                "Candle_High",
            ],
        ]);
    chartDb
        .getRange("A1:H1")
        .setFontWeight("bold")
        .setBackground("#0f172a")
        .setFontColor("#ffffff");

    watch.setHiddenGridlines(true);
    watch.setFrozenRows(6);
    watch.getRange(1, 1, paintRows, 20).setBackground("#f6f8fc");

    watch.getRange("A1:T1").merge().setValue("TRANG BIEU DO THEO DOI QUY");
    watch
        .getRange("A1:T1")
        .setBackground("#0b1f3a")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setFontSize(14);
    watch
        .getRange("A2:T2")
        .merge()
        .setFormula(
            '="Cap nhat: "&TEXT(NOW(),"dd/MM/yyyy HH:mm:ss")&" | So ma theo doi: "&' +
                selected.length +
                '&" | Gap: AUTO THEO DU LIEU"',
        );
    watch
        .getRange("A2:T2")
        .setBackground("#dbeafe")
        .setHorizontalAlignment("left")
        .setFontWeight("bold")
        .setFontColor("#334155");

    watch
        .getRange("A3")
        .setValue("Che do gap")
        .setFontWeight("bold")
        .setFontColor("#1e293b");
    watch.getRange("F3").clearDataValidations();
    watch
        .getRange("C3")
        .setValue("AUTO")
        .setHorizontalAlignment("center")
        .setFontColor("#0f766e")
        .setFontWeight("bold");
    watch
        .getRange("D3")
        .setValue("Cach tinh")
        .setFontWeight("bold")
        .setFontColor("#1e293b");
    watch
        .getRange("F3")
        .setValue("Tu dong theo do phu lich su")
        .setHorizontalAlignment("left")
        .setFontWeight("bold");
    watch
        .getRange("G3")
        .setValue("Tip")
        .setFontWeight("bold")
        .setFontColor("#1e293b");
    watch
        .getRange("H3:T3")
        .merge()
        .setValue(
            "Khong can chon gap thu cong. He thong tu dong doi theo do dai du lieu moi ma quy.",
        )
        .setFontColor("#475569");

    watch
        .getRange("A6:G6")
        .setValues([
            [
                "Ma Quy",
                "Diem goc",
                "Diem sau gap",
                "Lan cap nhat",
                "Nguon",
                "Gap",
                "Khoang cach",
            ],
        ])
        .setBackground("#dbeafe")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");

    if (!selected.length) {
        watch
            .getRange("A7:G7")
            .merge()
            .setValue("Chua co ma duoc tick trong cot Theo doi o Dashboard.")
            .setBackground("#f8fafc")
            .setFontColor("#64748b");
        styleWatchlistSheet_();
        return;
    }

    var rowStat = [];
    for (var s = 0; s < selected.length; s++) {
        var rawSeries = getNavSeriesByCode_(selected[s], 3000);
        var autoGapHours = getAutoGapHoursForSeries_(rawSeries);
        var gapSeries = compressSeriesByHourGap_(rawSeries, autoGapHours);
        var sourceText = gapSeries.length
            ? "NAV_History + API history"
            : "Khong du du lieu lich su";
        if (gapSeries.length < 2 && rawSeries.length >= 2) {
            sourceText = "Gap qua lon, tam ve theo du lieu goc";
        }
        rowStat.push([
            selected[s],
            rawSeries.length,
            gapSeries.length,
            new Date(),
            sourceText,
            "AUTO",
            formatGapLabel_(autoGapHours),
        ]);
    }
    watch.getRange(7, 1, rowStat.length, 7).setValues(rowStat);
    watch
        .getRange(7, 4, rowStat.length, 1)
        .setNumberFormat("dd/MM/yyyy HH:mm:ss");

    var gapBreakFactor = 2.2;

    var chartDbRow = 2;
    var chartStartRow = 12;
    for (var c = 0; c < selected.length; c++) {
        var code = selected[c];
        var rawNavSeries = getNavSeriesByCode_(code, 1500);
        var gapHours = getAutoGapHoursForSeries_(rawNavSeries);
        var navSeries = compressSeriesByHourGap_(rawNavSeries, gapHours);
        var renderSeries = navSeries;
        if (renderSeries.length < 2 && rawNavSeries.length >= 2) {
            renderSeries = rawNavSeries;
        }

        var navStartRow = chartDbRow;
        var navLen = 0;
        var ohlcStartRow = 0;
        var ohlcLen = 0;

        chartDb.getRange(chartDbRow, 1).setValue(code);
        if (renderSeries.length) {
            var navRows = buildLineChartRowsWithBreaks_(
                code,
                renderSeries,
                gapHours,
                gapBreakFactor,
            );
            chartDb
                .getRange(chartDbRow, 1, navRows.length, 8)
                .setValues(navRows);
            chartDb
                .getRange(chartDbRow, 2, navRows.length, 1)
                .setNumberFormat("dd/MM/yyyy HH:mm");
            navLen = navRows.length;
            chartDbRow += navRows.length;
        }

        var ohlcRows = buildCandlestickRows_(
            code,
            APP_CFG.HISTORY_BACKFILL_DAYS,
            gapHours,
        );
        if (ohlcRows.length) {
            ohlcStartRow = chartDbRow;
            var ohlcWrite = [];
            for (var o = 0; o < ohlcRows.length; o++) {
                ohlcWrite.push([
                    code,
                    "",
                    "",
                    toChartLabel_(ohlcRows[o][0]),
                    Number(ohlcRows[o][1]),
                    Number(ohlcRows[o][2]),
                    Number(ohlcRows[o][3]),
                    Number(ohlcRows[o][4]),
                ]);
            }
            chartDb
                .getRange(chartDbRow, 1, ohlcWrite.length, 8)
                .setValues(ohlcWrite);
            chartDb
                .getRange(chartDbRow, 4, ohlcWrite.length, 1)
                .setNumberFormat("@");
            ohlcLen = ohlcWrite.length;
            chartDbRow += ohlcWrite.length;
        }

        var topRow = chartStartRow + c * 70;
        var leftCol = 1;

        var minNav = 0;
        var maxNav = 0;
        if (renderSeries.length) {
            minNav = Number(renderSeries[0][1] || 0);
            maxNav = minNav;
            for (var vv = 1; vv < renderSeries.length; vv++) {
                var nv = Number(renderSeries[vv][1] || 0);
                if (!nv || isNaN(nv)) continue;
                if (nv < minNav) minNav = nv;
                if (nv > maxNav) maxNav = nv;
            }
        }
        var span = Math.max(1, maxNav - minNav);
        var pad = span * 0.25;
        var vMin = Math.max(0, minNav - pad);
        var vMax = maxNav + pad;

        if (renderSeries.length >= 2 && navLen >= 2) {
            var lineChart = watch
                .newChart()
                .setChartType(Charts.ChartType.LINE)
                .addRange(chartDb.getRange(navStartRow, 2, navLen, 2))
                .setPosition(topRow, leftCol, 0, 0)
                .setOption("title", "NAV realtime - " + code)
                .setOption("legend", { position: "none" })
                .setOption("hAxis", { format: "dd/MM HH:mm" })
                .setOption("pointSize", 4)
                .setOption("lineWidth", 2)
                .setOption("vAxis", { viewWindow: { min: vMin, max: vMax } })
                .setOption("width", 1560)
                .setOption("height", 660)
                .build();
            watch.insertChart(lineChart);
        } else {
            watch
                .getRange(topRow, leftCol, 1, 5)
                .merge()
                .setValue(
                    "Khong du du lieu lich su cho " +
                        code +
                        " de ve line chart",
                )
                .setBackground("#fff7ed")
                .setFontColor("#9a3412")
                .setHorizontalAlignment("center")
                .setFontWeight("bold");
        }

        if (ohlcRows.length >= 2 && ohlcLen >= 2) {
            var stockChart = watch
                .newChart()
                .setChartType(Charts.ChartType.CANDLESTICK)
                .addRange(chartDb.getRange(ohlcStartRow, 4, ohlcLen, 5))
                .setPosition(topRow + 34, leftCol, 0, 0)
                .setOption("title", "Chung khoan NAV (OHLC) - " + code)
                .setOption("legend", { position: "none" })
                .setOption("vAxis", { viewWindow: { min: vMin, max: vMax } })
                .setOption("width", 1560)
                .setOption("height", 660)
                .build();
            watch.insertChart(stockChart);
        } else {
            watch
                .getRange(topRow + 10, leftCol, 1, 5)
                .merge()
                .setValue(
                    "Khong du du lieu lich su cho " +
                        code +
                        " de ve candlestick",
                )
                .setBackground("#fef2f2")
                .setFontColor("#991b1b")
                .setHorizontalAlignment("center")
                .setFontWeight("bold");
        }
    }

    styleWatchlistSheet_();
}

function toChartLabel_(value) {
    var dt = value instanceof Date ? value : new Date(value);
    if (!(dt instanceof Date) || isNaN(dt.getTime())) {
        return String(value || "");
    }
    return "T " + Utilities.formatDate(dt, APP_CFG.TIME_ZONE, "dd/MM HH:mm");
}

function getWatchlistGapConfig_(dashSheet) {
    var enabled = true;
    var label = getStoredGapLabel_();
    var hours = parseGapToHours_(label);
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var watch = ss.getSheetByName(APP_CFG.CHART_SHEET);
        if (watch) {
            var watchRaw = normalizeGapLabel_(
                watch.getRange("F3").getDisplayValue(),
            );
            if (String(watchRaw || "").trim()) {
                hours = parseGapToHours_(watchRaw);
                label = normalizeGapLabel_(watchRaw);
                setStoredGapLabel_(label);
                return { enabled: enabled, hours: hours, label: label };
            }
        }
    } catch (e) {
        // Use defaults when controls are missing.
    }
    label = normalizeGapLabel_(label);
    hours = parseGapToHours_(label);
    return { enabled: enabled, hours: hours, label: label };
}

function parseGapToHours_(raw) {
    var s = String(raw || "")
        .toLowerCase()
        .trim();
    if (!s) return 24;

    var num = extractFirstNumber_(s, 1);
    if (s.indexOf("thang") >= 0 || s.indexOf("month") >= 0 || /\bm\b/.test(s)) {
        return Math.max(1, num * 24 * 30);
    }
    if (s.indexOf("ngay") >= 0 || s.indexOf("day") >= 0 || /\bd\b/.test(s)) {
        return Math.max(1, num * 24);
    }
    if (s.indexOf("gio") >= 0 || s.indexOf("hour") >= 0 || /\bh\b/.test(s)) {
        return Math.max(1, num);
    }

    var direct = Number(s);
    if (!isNaN(direct) && direct > 0) {
        return Math.max(1, direct);
    }
    return 24;
}

function extractFirstNumber_(s, fallback) {
    var m = String(s || "").match(/\d+(?:\.\d+)?/);
    if (!m) return fallback;
    var n = Number(m[0]);
    if (isNaN(n) || n <= 0) return fallback;
    return n;
}

function formatGapLabel_(hours) {
    var h = Math.max(1, Number(hours || 1));
    // Must match exactly the data validation list used in F3/N7.
    if (h <= 1) return "1 gio";
    if (h <= 3) return "3 gio";
    if (h <= 6) return "6 gio";
    if (h <= 12) return "12 gio";
    if (h <= 24) return "1 ngay";
    if (h <= 72) return "3 ngay";
    if (h <= 168) return "7 ngay";
    if (h <= 336) return "14 ngay";
    return "1 thang";
}

function normalizeGapLabel_(raw) {
    var normalized = formatGapLabel_(parseGapToHours_(raw));
    var allowed = {
        "1 gio": true,
        "3 gio": true,
        "6 gio": true,
        "12 gio": true,
        "1 ngay": true,
        "3 ngay": true,
        "7 ngay": true,
        "14 ngay": true,
        "1 thang": true,
    };
    if (!allowed[normalized]) return APP_CFG.DEFAULT_GAP_LABEL;
    return normalized;
}

function compressSeriesByHourGap_(series, hourGap) {
    var gap = Math.max(1, Number(hourGap || 1));
    if (!series || series.length < 2) return series || [];

    var msGap = gap * 60 * 60 * 1000;
    var buckets = {};
    for (var i = 0; i < series.length; i++) {
        var ts = Number(series[i][0] || 0);
        var nav = Number(series[i][1] || 0);
        if (!ts || !nav || isNaN(ts) || isNaN(nav)) continue;
        var key = Math.floor(ts / msGap) * msGap;
        buckets[key] = [key, nav];
    }

    var keys = [];
    for (var k in buckets) {
        if (buckets.hasOwnProperty(k)) keys.push(Number(k));
    }
    keys.sort(function (a, b) {
        return a - b;
    });

    var out = [];
    for (var j = 0; j < keys.length; j++) {
        out.push(buckets[keys[j]]);
    }
    return out;
}

function getAutoGapHoursForSeries_(series) {
    if (!series || series.length < 2) return 24;
    var spanDays = getSeriesSpanDays_(series);
    if (spanDays <= 2) return 1;
    if (spanDays <= 7) return 3;
    if (spanDays <= 30) return 6;
    if (spanDays <= 90) return 12;
    if (spanDays <= 180) return 24;
    if (spanDays <= 365) return 72;
    return 168;
}

function ensureWatchlistHistory_(selectedCodes, options) {
    options = options || {};
    var force = options.force === true;
    var targets = selectedCodes;
    if (!targets || !targets.length) {
        targets = getFundCodes_();
    }
    if (!targets || !targets.length) return;

    var cache = CacheService.getScriptCache();
    var uniqueCodes = uniqueArray_(targets);
    var maxCodes = Number(options.maxCodes || 0);
    if (maxCodes > 0 && uniqueCodes.length > maxCodes) {
        uniqueCodes = uniqueCodes.slice(0, maxCodes);
    }
    var minSpanDays = Math.max(
        90,
        Math.floor(Number(APP_CFG.HISTORY_BACKFILL_DAYS || 365) * 0.5),
    );

    for (var i = 0; i < uniqueCodes.length; i++) {
        var code = uniqueCodes[i];
        var lockKey = "hist_lock_" + code;
        if (!force && cache.get(lockKey)) continue;

        var existing = getNavSeriesByCode_(code, 5000);
        var existingSpanDays = getSeriesSpanDays_(existing);
        if (
            !force &&
            existing.length >= 120 &&
            existingSpanDays >= minSpanDays
        ) {
            continue;
        }

        var fetched = fetchHistoricalNavByCode_(
            code,
            APP_CFG.HISTORY_BACKFILL_DAYS,
        );
        if (fetched.length) {
            appendNavHistoryRowsNoDup_(fetched, "history_api");
            logSystem_(
                "INFO",
                "ensureWatchlistHistory_",
                "Backfill history thanh cong",
                code +
                    " points=" +
                    fetched.length +
                    ", spanDays=" +
                    getSeriesSpanDays_(fetched),
            );
        } else {
            if (!APP_CFG.ALLOW_ESTIMATED_HISTORY) {
                logSystem_(
                    "WARN",
                    "ensureWatchlistHistory_",
                    "Khong co history API, bo qua du lieu uoc tinh",
                    code,
                );
                cache.put(lockKey, "1", 300);
                continue;
            }
            var estimated = buildEstimatedHistoryFromSnapshot_(
                code,
                APP_CFG.HISTORY_BACKFILL_DAYS,
            );
            if (estimated.length) {
                appendNavHistoryRowsNoDup_(estimated, "history_estimated");
                logSystem_(
                    "INFO",
                    "ensureWatchlistHistory_",
                    "Dung du lieu history uoc tinh",
                    code + " points=" + estimated.length,
                );
            }
        }
        cache.put(lockKey, "1", 300);
    }
}

function getSeriesSpanDays_(series) {
    if (!series || series.length < 2) return 0;

    var first = series[0];
    var last = series[series.length - 1];
    var firstTs =
        first[0] instanceof Date ? first[0].getTime() : Number(first[0] || 0);
    var lastTs =
        last[0] instanceof Date ? last[0].getTime() : Number(last[0] || 0);
    if (
        !firstTs ||
        !lastTs ||
        isNaN(firstTs) ||
        isNaN(lastTs) ||
        lastTs <= firstTs
    )
        return 0;
    return (lastTs - firstTs) / (24 * 60 * 60 * 1000);
}

function fetchHistoricalNavByCode_(code, maxDays) {
    var cleanCode = String(code || "").trim();
    if (!cleanCode) return [];

    var snapshot = getDbFundSnapshot_(cleanCode);
    if (!snapshot || !snapshot.productId) {
        logSystem_(
            "ERROR",
            "fetchHistoricalNavByCode_",
            "Khong tim thay Product ID cho ma quy",
            cleanCode,
        );
        return [];
    }

    var dayLimit = Math.max(
        30,
        Number(maxDays || APP_CFG.HISTORY_BACKFILL_DAYS || 365),
    );
    var now = new Date();
    var from = new Date(now.getTime() - dayLimit * 24 * 60 * 60 * 1000);
    var payload = {
        productId: Number(snapshot.productId),
        fromDate: Utilities.formatDate(from, APP_CFG.TIME_ZONE, "yyyy-MM-dd"),
        toDate: Utilities.formatDate(now, APP_CFG.TIME_ZONE, "yyyy-MM-dd"),
    };

    var cacheKey =
        "hist_post_" +
        cleanCode +
        "_" +
        payload.fromDate +
        "_" +
        payload.toDate;
    try {
        var json = fetchJsonWithRetryAndCache_(
            APP_CFG.HISTORY_API_URL,
            payload,
            cacheKey,
            { suppressErrorLog: false },
        );
        return extractHistoryRowsFromAny_(json, cleanCode);
    } catch (err) {
        logSystem_(
            "ERROR",
            "fetchHistoricalNavByCode_",
            "Khong lay duoc history API chuan",
            "code=" +
                cleanCode +
                ", payload=" +
                shortText_(safeJson_(payload), 1200) +
                ", err=" +
                shortText_(String(err), 1200),
        );
        return [];
    }
}

function buildEstimatedHistoryFromSnapshot_(code, maxDays) {
    var snap = getDbFundSnapshot_(code);
    if (!snap) return [];

    var navNow = Number(snap.nav || 0);
    var annualRate = Number(snap.annualRate);
    if (!navNow || isNaN(navNow) || navNow <= 0) return [];
    if (isNaN(annualRate)) annualRate = APP_CFG.DEFAULT_FALLBACK_ANNUAL_RATE;
    if (annualRate < -0.5) annualRate = -0.5;
    if (annualRate > 0.8) annualRate = 0.8;

    var totalDays = Math.max(
        120,
        Number(maxDays || APP_CFG.HISTORY_BACKFILL_DAYS || 365),
    );
    var stepDays = totalDays > 365 ? 2 : 1;
    var now = new Date();
    var out = [];

    for (var d = totalDays; d >= 0; d -= stepDays) {
        var ts = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
        var yearsBack = d / 365;
        var nav = navNow / Math.pow(1 + annualRate, yearsBack);
        if (!nav || isNaN(nav) || nav <= 0) continue;
        out.push([ts, String(code || "").trim(), Number(nav.toFixed(6))]);
    }

    return out;
}

function extractHistoryRowsFromAny_(json, code) {
    var arrays = [
        getNested_(json, ["data"]),
        getNested_(json, ["data", "navHistory"]),
        getNested_(json, ["data", "history"]),
        getNested_(json, ["data", "rows"]),
        getNested_(json, ["data", "items"]),
        getNested_(json, ["navHistory"]),
        getNested_(json, ["history"]),
        getNested_(json, ["rows"]),
        getNested_(json, ["items"]),
    ];

    var target = null;
    for (var i = 0; i < arrays.length; i++) {
        if (
            arrays[i] &&
            Object.prototype.toString.call(arrays[i]) === "[object Array]" &&
            arrays[i].length
        ) {
            target = arrays[i];
            break;
        }
    }
    if (!target) return [];

    var out = [];
    for (var j = 0; j < target.length; j++) {
        var item = target[j] || {};
        var tsRaw =
            item.date ||
            item.tradingDate ||
            item.time ||
            item.timestamp ||
            item.navDate ||
            item.createdAt;
        var navRaw =
            item.nav ||
            item.latestNav ||
            item.value ||
            item.navPrice ||
            item.close ||
            item.price;
        if (tsRaw === null || tsRaw === undefined) continue;

        var ts = tsRaw instanceof Date ? tsRaw : new Date(tsRaw);
        if (!(ts instanceof Date) || isNaN(ts.getTime())) continue;

        var nav = Number(navRaw || 0);
        if (!nav || isNaN(nav)) continue;
        out.push([ts, code, nav]);
    }

    out.sort(function (a, b) {
        return a[0].getTime() - b[0].getTime();
    });
    return out;
}

function appendNavHistoryRowsNoDup_(rows, source) {
    if (!rows || !rows.length) return;
    ensureSheetWithHeader_(APP_CFG.NAV_HISTORY_SHEET, [
        "Timestamp",
        "Ma Quy",
        "NAV",
        "Source",
    ]);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.NAV_HISTORY_SHEET);
    if (!sh) return;

    var existing = {};
    if (sh.getLastRow() > 1) {
        var curr = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
        for (var i = 0; i < curr.length; i++) {
            var ts =
                curr[i][0] instanceof Date
                    ? curr[i][0].getTime()
                    : new Date(curr[i][0]).getTime();
            if (isNaN(ts)) continue;
            var key = String(curr[i][1] || "").trim() + "_" + ts;
            existing[key] = true;
        }
    }

    var toAppend = [];
    for (var j = 0; j < rows.length; j++) {
        var tsObj =
            rows[j][0] instanceof Date ? rows[j][0] : new Date(rows[j][0]);
        var tsNum = tsObj.getTime();
        if (isNaN(tsNum)) continue;
        var code = String(rows[j][1] || "").trim();
        if (!code) continue;
        var key2 = code + "_" + tsNum;
        if (existing[key2]) continue;
        existing[key2] = true;
        toAppend.push([
            tsObj,
            code,
            Number(rows[j][2] || 0),
            source || "history_api",
        ]);
    }

    if (!toAppend.length) return;
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 4).setValues(toAppend);
}

function buildSyntheticSeriesFromNav_(code) {
    var nav = getCurrentNavByCode_(code);
    if (!nav || nav <= 0) return [];
    var now = new Date();
    return [
        [new Date(now.getTime() - 60 * 60 * 1000).getTime(), nav],
        [now.getTime(), nav],
    ];
}

function buildSyntheticOhlcFromSeries_(series) {
    if (!series || series.length < 2) return [];
    var out = [];
    var prev = Number(series[0][1] || 0);
    for (var i = 0; i < series.length; i++) {
        var curr = Number(series[i][1] || 0);
        var ts = new Date(series[i][0]);
        if (!curr || isNaN(curr) || isNaN(ts.getTime())) continue;
        out.push([ts, Math.min(prev, curr), prev, curr, Math.max(prev, curr)]);
        prev = curr;
    }
    return out;
}

function uniqueArray_(arr) {
    var map = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
        var key = String(arr[i] || "").trim();
        if (!key || map[key]) continue;
        map[key] = true;
        out.push(key);
    }
    return out;
}

function getChartFragmentData_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    var selectedMain = "";

    var tracked = [];
    if (dash) {
        var funds = getFundCodes_();
        var lastTrackRow = Math.max(9, 8 + funds.length);
        if (lastTrackRow >= 9) {
            var tracking = dash
                .getRange(9, 10, lastTrackRow - 8, 2)
                .getValues();
            for (var i = 0; i < tracking.length; i++) {
                if (tracking[i][0] === true) {
                    var code = String(tracking[i][1] || "").trim();
                    if (code) tracked.push(code);
                }
            }
        }
    }

    if (!tracked.length) {
        var codes = getFundCodes_();
        if (codes.length) tracked.push(codes[0]);
    }

    selectedMain = tracked.length ? tracked[0] : "";

    var trackedLimited = tracked.slice(0, 12);
    var allSeries = {};
    for (var t = 0; t < trackedLimited.length; t++) {
        allSeries[trackedLimited[t]] = getNavSeriesByCode_(
            trackedLimited[t],
            300,
        );
    }

    var ohlc = buildCandlestickRows_(
        selectedMain || trackedLimited[0] || "",
        180,
    );
    return {
        selectedCode: selectedMain,
        trackedCodes: trackedLimited,
        navSeries: allSeries,
        ohlcRows: ohlc,
        generatedAt: Utilities.formatDate(
            new Date(),
            APP_CFG.TIME_ZONE,
            "dd/MM/yyyy HH:mm:ss",
        ),
    };
}

function getNavSeriesByCode_(code, limit) {
    var selectedCode = String(code || "").trim();
    if (!selectedCode) return [];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var navSheet = ss.getSheetByName(APP_CFG.NAV_HISTORY_SHEET);
    if (!navSheet || navSheet.getLastRow() < 2) return [];

    var values = navSheet
        .getRange(2, 1, navSheet.getLastRow() - 1, 3)
        .getValues();
    var out = [];
    for (var i = 0; i < values.length; i++) {
        var fundCode = String(values[i][1] || "").trim();
        if (fundCode !== selectedCode) continue;
        var ts =
            values[i][0] instanceof Date
                ? values[i][0]
                : new Date(values[i][0]);
        var nav = Number(values[i][2] || 0);
        if (isNaN(nav) || nav <= 0 || isNaN(ts.getTime())) continue;
        out.push([ts.getTime(), nav]);
    }

    out.sort(function (a, b) {
        return a[0] - b[0];
    });
    if (out.length > limit) {
        out = out.slice(out.length - limit);
    }
    return out;
}

function enrichSeriesWithApiAnchor_(code, series) {
    var out = series ? series.slice() : [];
    if (!out.length) return out;

    var firstTs = Number(out[0][0] || 0);
    var lastTs = Number(out[out.length - 1][0] || 0);
    if (!firstTs || !lastTs) return out;

    var spanDays = (lastTs - firstTs) / (24 * 60 * 60 * 1000);
    if (spanDays >= 30) return out;

    var snap = getDbFundSnapshot_(code);
    if (!snap || snap.nav <= 0) return out;
    var r = Number(snap.annualRate);
    if (isNaN(r)) return out;

    var anchorTs = lastTs - 365 * 24 * 60 * 60 * 1000;
    var anchorNav = snap.nav / Math.max(0.01, 1 + r);
    if (!anchorNav || isNaN(anchorNav) || anchorNav <= 0) return out;

    out.unshift([anchorTs, anchorNav]);
    out.sort(function (a, b) {
        return a[0] - b[0];
    });
    return out;
}

function getDbFundSnapshot_(code) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var db = ss.getSheetByName(APP_CFG.DB_SHEET);
    if (!db || db.getLastRow() < 2) return null;

    var rows = db.getRange(2, 1, db.getLastRow() - 1, 7).getValues();
    var target = String(code || "").trim();
    for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || "").trim() !== target) continue;
        return {
            nav: Number(rows[i][2] || 0),
            annualRate: Number(rows[i][5]),
            productId: Number(rows[i][6] || 0),
        };
    }
    return null;
}

function buildChartFragmentHtml_() {
    return [
        "<!doctype html>",
        '<html><head><meta charset="utf-8">',
        '<script src="https://www.gstatic.com/charts/loader.js"></script>',
        "<style>",
        "body{margin:0;font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f1f5f9;color:#0f172a;}",
        ".top{position:sticky;top:0;z-index:10;background:#0b1f3a;color:#fff;padding:10px 12px;font-weight:700;}",
        ".sub{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 12px;background:#e2e8f0;}",
        ".btn{background:#0f172a;color:#fff;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:12px;}",
        ".wrap{height:calc(100vh - 84px);overflow:auto;padding:10px;}",
        ".chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}",
        ".chip{background:#dbeafe;color:#1e3a8a;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:600;}",
        ".grid{display:grid;grid-template-columns:1fr;gap:12px;}",
        ".card{background:#fff;border:1px solid #dbe4ee;border-radius:8px;padding:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);}",
        ".card h4{margin:0 0 6px;font-size:12px;color:#334155;}",
        ".chart{height:220px;}",
        ".two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}",
        "</style></head><body>",
        '<div class="top">KHUNG BIEU DO THEO DOI (FRAGMENT)</div>',
        '<div class="sub"><div id="meta">Dang tai du lieu...</div><button class="btn" onclick="loadData()">Lam moi</button></div>',
        '<div class="wrap">',
        '<div class="chips" id="chips"></div>',
        '<div class="two">',
        '<div class="card"><h4>NAV realtime theo ma quy duoc chon</h4><div id="mainNav" class="chart"></div></div>',
        '<div class="card"><h4>Bieu do chung khoan (OHLC NAV)</h4><div id="stock" class="chart"></div></div>',
        "</div>",
        '<div class="grid" id="trackedGrid"></div>',
        "</div>",
        "<script>",
        'google.charts.load("current", {packages:["corechart"]});',
        "function loadData(){",
        "google.script.run.withSuccessHandler(render).getChartFragmentData_();",
        "}",
        "function render(data){",
        'document.getElementById("meta").textContent="Cap nhat: "+(data.generatedAt||"-")+" | Ma chon: "+(data.selectedCode||"(chua chon)");',
        'var chips=document.getElementById("chips"); chips.innerHTML="";',
        '(data.trackedCodes||[]).forEach(function(c){var el=document.createElement("div");el.className="chip";el.textContent=c;chips.appendChild(el);});',
        "drawMainNav(data); drawStock(data); drawTracked(data);",
        "}",
        "function drawMainNav(data){",
        'var code=data.selectedCode || ((data.trackedCodes||[])[0]||"");',
        "var arr=(data.navSeries&&data.navSeries[code])?data.navSeries[code]:[];",
        'var dt=new google.visualization.DataTable(); dt.addColumn("datetime","Time"); dt.addColumn("number","NAV");',
        "arr.forEach(function(r){dt.addRow([new Date(r[0]), Number(r[1])]);});",
        'var chart=new google.visualization.LineChart(document.getElementById("mainNav"));',
        'chart.draw(dt,{legend:"none",chartArea:{left:50,top:10,right:10,bottom:35},colors:["#1d4ed8"]});',
        "}",
        "function drawStock(data){",
        "var o=(data.ohlcRows||[]);",
        'var dt=new google.visualization.DataTable(); dt.addColumn("datetime","Time"); dt.addColumn("number","Low"); dt.addColumn("number","Open"); dt.addColumn("number","Close"); dt.addColumn("number","High");',
        "o.forEach(function(r){dt.addRow([new Date(r[0]),Number(r[1]),Number(r[2]),Number(r[3]),Number(r[4])]);});",
        'var chart=new google.visualization.CandlestickChart(document.getElementById("stock"));',
        'chart.draw(dt,{legend:"none",chartArea:{left:50,top:10,right:10,bottom:35},bar:{groupWidth:"70%"}});',
        "}",
        "function drawTracked(data){",
        'var root=document.getElementById("trackedGrid"); root.innerHTML="";',
        "(data.trackedCodes||[]).forEach(function(code){",
        'var card=document.createElement("div"); card.className="card";',
        'var h=document.createElement("h4"); h.textContent="Theo doi NAV - "+code; card.appendChild(h);',
        'var box=document.createElement("div"); box.className="chart"; card.appendChild(box); root.appendChild(card);',
        "var arr=(data.navSeries&&data.navSeries[code])?data.navSeries[code]:[];",
        'var dt=new google.visualization.DataTable(); dt.addColumn("datetime","Time"); dt.addColumn("number","NAV");',
        "arr.forEach(function(r){dt.addRow([new Date(r[0]), Number(r[1])]);});",
        'new google.visualization.LineChart(box).draw(dt,{legend:"none",chartArea:{left:50,top:10,right:10,bottom:35},colors:["#059669"]});',
        "});",
        "}",
        "google.charts.setOnLoadCallback(loadData);",
        "</script></body></html>",
    ].join("");
}

function buildCandlestickRows_(code, maxDays, bucketHours) {
    var selectedCode = String(code || "").trim();
    if (!selectedCode) return [];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var navSheet = ss.getSheetByName(APP_CFG.NAV_HISTORY_SHEET);
    if (!navSheet || navSheet.getLastRow() < 2) return [];

    var values = navSheet
        .getRange(2, 1, navSheet.getLastRow() - 1, 3)
        .getValues();
    var points = [];

    for (var i = 0; i < values.length; i++) {
        var ts = values[i][0];
        var fundCode = String(values[i][1] || "").trim();
        var nav = Number(values[i][2] || 0);
        if (fundCode !== selectedCode || !nav || isNaN(nav)) continue;

        var dt = ts instanceof Date ? ts : new Date(ts);
        if (!(dt instanceof Date) || isNaN(dt.getTime())) continue;

        points.push({ ts: dt, nav: nav });
    }

    if (!points.length) return [];

    points.sort(function (a, b) {
        return a.ts.getTime() - b.ts.getTime();
    });

    var firstTs = points[0].ts.getTime();
    var lastTs = points[points.length - 1].ts.getTime();
    var spanDays = (lastTs - firstTs) / (24 * 60 * 60 * 1000);
    var useHourly = spanDays <= 3;
    var customGap = Number(bucketHours || 0);
    if (isNaN(customGap) || customGap < 0) customGap = 0;

    var buckets = {};
    for (var p = 0; p < points.length; p++) {
        var pt = points[p];
        var key;
        if (customGap > 0) {
            var msGap = customGap * 60 * 60 * 1000;
            key = String(Math.floor(pt.ts.getTime() / msGap) * msGap);
        } else {
            key = useHourly
                ? Utilities.formatDate(
                      pt.ts,
                      APP_CFG.TIME_ZONE,
                      "yyyy-MM-dd HH:00",
                  )
                : Utilities.formatDate(pt.ts, APP_CFG.TIME_ZONE, "yyyy-MM-dd");
        }

        if (!buckets[key]) {
            var bucketDate;
            if (customGap > 0) {
                bucketDate = new Date(Number(key));
            } else {
                bucketDate = useHourly
                    ? new Date(
                          pt.ts.getFullYear(),
                          pt.ts.getMonth(),
                          pt.ts.getDate(),
                          pt.ts.getHours(),
                          0,
                          0,
                          0,
                      )
                    : new Date(
                          pt.ts.getFullYear(),
                          pt.ts.getMonth(),
                          pt.ts.getDate(),
                      );
            }
            buckets[key] = {
                date: bucketDate,
                open: pt.nav,
                high: pt.nav,
                low: pt.nav,
                close: pt.nav,
            };
            continue;
        }

        if (pt.nav > buckets[key].high) buckets[key].high = pt.nav;
        if (pt.nav < buckets[key].low) buckets[key].low = pt.nav;
        buckets[key].close = pt.nav;
    }

    var keys = [];
    for (var k in buckets) {
        if (buckets.hasOwnProperty(k)) keys.push(k);
    }
    if (customGap > 0) {
        keys.sort(function (a, b) {
            return Number(a) - Number(b);
        });
    } else {
        keys.sort();
    }

    var start = Math.max(0, keys.length - Math.max(10, Number(maxDays || 120)));
    var out = [];
    for (var j = start; j < keys.length; j++) {
        var d = buckets[keys[j]];
        out.push([d.date, d.low, d.open, d.close, d.high]);
    }

    // Keep gap effect visible: with custom gap, do not expand back to all points.
    if (out.length <= 1 && points.length > 1) {
        if (customGap > 0) {
            var first = points[0];
            var last = points[points.length - 1];
            out = [
                [first.ts, first.nav, first.nav, first.nav, first.nav],
                [
                    last.ts,
                    Math.min(first.nav, last.nav),
                    first.nav,
                    last.nav,
                    Math.max(first.nav, last.nav),
                ],
            ];
        } else {
            out = [];
            var prev = points[0].nav;
            for (var x = 0; x < points.length; x++) {
                var curr = points[x].nav;
                out.push([
                    points[x].ts,
                    Math.min(prev, curr),
                    prev,
                    curr,
                    Math.max(prev, curr),
                ]);
                prev = curr;
            }
        }
    }

    return out;
}

function applyDashboardStyle_(dash, dataEnd) {
    dash.setColumnWidths(1, 1, 120);
    dash.setColumnWidths(2, 1, 130);
    dash.setColumnWidths(3, 1, 120);
    dash.setColumnWidths(4, 1, 120);
    dash.setColumnWidths(5, 1, 130);
    dash.setColumnWidths(6, 1, 110);
    dash.setColumnWidths(7, 1, 120);
    dash.setColumnWidths(8, 1, 130);
    dash.setColumnWidths(9, 1, 60);
    dash.setColumnWidths(10, 1, 80);
    dash.setColumnWidths(11, 1, 110);
    dash.setColumnWidths(12, 1, 165);
    dash.setColumnWidths(13, 1, 165);
    dash.setColumnWidth(14, 140);
    dash.setColumnWidth(15, 140);
    dash.setColumnWidth(16, 140);
    dash.setColumnWidth(17, 160);
    dash.setColumnWidths(18, 5, 120);
    dash.getRange("A1:O2").setVerticalAlignment("middle");
    dash.getRange("A8:Q8").setWrap(true);
    dash.getRange("A1:O1").setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        "#0b1f3a",
        SpreadsheetApp.BorderStyle.SOLID_MEDIUM,
    );
    dash.getRange("A3:O4")
        .setBackground("#ffffff")
        .setBorder(
            true,
            true,
            true,
            true,
            true,
            true,
            "#e2e8f0",
            SpreadsheetApp.BorderStyle.SOLID,
        );
    dash.getRange("A8:K" + dataEnd).setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#e2e8f0",
        SpreadsheetApp.BorderStyle.SOLID,
    );
    dash.getRange("K6:O13").setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#dbeafe",
        SpreadsheetApp.BorderStyle.SOLID,
    );
    dash.getRange("K7:O8")
        .setBackground("#ffffff")
        .setVerticalAlignment("middle");
    dash.getRange("N9:O13").setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#cbd5e1",
        SpreadsheetApp.BorderStyle.SOLID,
    );
    if (dataEnd >= 9) {
        dash.getRange("A9:H" + dataEnd).applyRowBanding(
            SpreadsheetApp.BandingTheme.LIGHT_GREY,
        );
    }

    var positive = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setBackground("#ecfdf5")
        .setRanges([dash.getRange("F9:F" + dataEnd)])
        .build();

    var negative = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(0)
        .setBackground("#fef2f2")
        .setRanges([dash.getRange("F9:F" + dataEnd)])
        .build();

    dash.setConditionalFormatRules([positive, negative]);
}

function columnToLetter_(column) {
    var temp = "";
    var letter = "";
    while (column > 0) {
        temp = (column - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        column = (column - temp - 1) / 26;
    }
    return letter;
}

function getFundCodes_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dbSheet = ss.getSheetByName(APP_CFG.DB_SHEET);
    if (!dbSheet || dbSheet.getLastRow() < 2) return [];
    var values = dbSheet
        .getRange(2, 1, dbSheet.getLastRow() - 1, 1)
        .getValues();

    var out = [];
    for (var i = 0; i < values.length; i++) {
        var code = String(values[i][0] || "").trim();
        if (code) out.push(code);
    }
    return out;
}

function ensureSheetWithHeader_(name, header) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
        sh.getRange(1, 1, 1, header.length)
            .setValues([header])
            .setFontWeight("bold")
            .setBackground("#f8fafc");
    } else {
        var current = sh.getRange(1, 1, 1, header.length).getValues()[0];
        if (String(current[0] || "").trim() !== String(header[0])) {
            sh.getRange(1, 1, 1, header.length)
                .setValues([header])
                .setFontWeight("bold")
                .setBackground("#f8fafc");
        }
    }
}

function randomUa_() {
    var uas = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}

function parseInputDate_(yyyyMmDd) {
    if (!yyyyMmDd) return new Date();
    var parts = yyyyMmDd.split("-");
    if (parts.length !== 3) return new Date();
    var y = Number(parts[0]);
    var m = Number(parts[1]) - 1;
    var d = Number(parts[2]);
    return new Date(y, m, d);
}

function formatDateCell_(value) {
    if (value instanceof Date) {
        return Utilities.formatDate(value, APP_CFG.TIME_ZONE, "dd/MM/yyyy");
    }
    return String(value || "").trim();
}

function escapeHtml_(txt) {
    return String(txt || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function upsertUsageGuideSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(APP_CFG.GUIDE_SHEET);
    if (!sh) sh = ss.insertSheet(APP_CFG.GUIDE_SHEET);

    sh.clear();
    sh.setHiddenGridlines(true);
    sh.setColumnWidths(1, 1, 220);
    sh.setColumnWidths(2, 1, 620);

    var rows = [
        ["HUONG DAN SU DUNG APP QUAN LY QUY", ""],
        [
            "1) Khoi tao",
            'Chay menu "1. Khoi tao / Lam moi UI" de tao day du cac sheet va dong bo du lieu ban dau.',
        ],
        [
            "2) Sync toan bo quy",
            'Chay menu "2. Sync toan bo quy + NAV" de tai toan bo danh sach quy tu API va cap nhat NAV moi nhat vao Database_Quy.',
        ],
        [
            "3) Cap nhat tu dong",
            'Chay menu "5. Cai trigger tu dong". He thong se tu cap nhat NAV moi ' +
                APP_CFG.UPDATE_INTERVAL_MINUTES +
                " phut va snapshot moi " +
                APP_CFG.SNAPSHOT_INTERVAL_HOURS +
                " gio.",
        ],
        [
            "4) Them giao dich",
            'Chon menu "+. Them Giao Dich". Danh sach ma quy la dong, lay tu Database_Quy nen khong can nhap tay.',
        ],
        [
            "5) Dashboard",
            "Dashboard dung de tick checkbox cac ma quy can theo doi. Bieu do se duoc ve o trang Bieu_Do_Theo_Doi.",
        ],
        [
            "6) Trang bieu do",
            'Mo menu "9. Mo trang bieu do theo doi" de xem line chart + candlestick theo danh sach da tick.',
        ],
        [
            "6) Kiem tra log fetch API",
            'Mo menu "7. Mo log he thong" de xem chi tiet loi/fallback/cache. Cot Level va Action se cho biet API fail o buoc nao.',
        ],
        [
            "7) Luu y quota",
            "Muc " +
                APP_CFG.UPDATE_INTERVAL_MINUTES +
                " phut la can bang giua realtime va quota API/Apps Script.",
        ],
        [
            "MEO",
            'Neu muon lam moi giao dien nhanh: chay lai "1. Khoi tao / Lam moi UI".',
        ],
    ];

    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    sh.getRange("A1:B1")
        .merge()
        .setBackground("#0f172a")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setFontSize(13)
        .setHorizontalAlignment("center");

    sh.getRange("A2:A" + rows.length)
        .setFontWeight("bold")
        .setBackground("#f8fafc");
    sh.getRange("B2:B" + rows.length).setWrap(true);
}

function normalizeFundItem_(item, sourceLabel) {
    item = item || {};

    var code = pickString_(item, [
        "shortName",
        "short_name",
        "code",
        "productCode",
        "product_code",
        "ticker",
        "symbol",
        "fundCode",
    ]);
    var name =
        pickString_(item, [
            "name",
            "fullName",
            "full_name",
            "productName",
            "product_name",
        ]) || code;
    var company = pickString_(item, [
        "productCompanyName",
        "companyName",
        "issuerName",
        "fundCompanyName",
        "managementCompany",
    ]);
    var nav = pickNumber_(item, [
        "nav",
        "latestNav",
        "lastestNAV",
        "latestNAV",
        "navPrice",
        "nav_price",
        "tradingDateNav",
        "lastNav",
    ]);
    var lastYearNav = pickNumber_(item, [
        "lastYearNav",
        "lastYearNAV",
        "navLastYear",
        "nav_1y",
    ]);
    var perf1y = pickNumber_(item, [
        "performance1Y",
        "performance_1y",
        "return1Y",
        "return_1y",
        "profit1Y",
    ]);
    var annualReturnEst = 0;
    if (nav > 0 && lastYearNav > 0) {
        annualReturnEst = nav / lastYearNav - 1;
    } else if (perf1y > 0 && perf1y < 10) {
        annualReturnEst = perf1y > 1 ? perf1y / 100 : perf1y;
    }

    var productId = pickNumber_(item, ["id", "productId"]);
    if (
        (!productId || isNaN(productId)) &&
        item.productFund &&
        item.productFund.id
    ) {
        productId = Number(item.productFund.id);
    }

    return {
        code: code,
        name: name,
        nav: nav,
        company: company,
        annualReturnEst: annualReturnEst,
        productId: !isNaN(productId) ? productId : 0,
        source: sourceLabel || APP_CFG.API_URL,
    };
}

function pickString_(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]];
        if (v !== null && v !== undefined) {
            var s = String(v).trim();
            if (s) return s;
        }
    }
    return "";
}

function pickNumber_(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
        var v = Number(obj[keys[i]]);
        if (!isNaN(v) && isFinite(v) && v > 0) return v;
    }
    return 0;
}

function logSystem_(level, action, message, detail) {
    try {
        ensureSheetWithHeader_(APP_CFG.DEBUG_SHEET, [
            "Timestamp",
            "Level",
            "Action",
            "Message",
            "Detail",
        ]);
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sh = ss.getSheetByName(APP_CFG.DEBUG_SHEET);
        if (!sh) return;

        sh.appendRow([
            new Date(),
            String(level || "INFO"),
            String(action || ""),
            String(message || ""),
            shortText_(String(detail || ""), 1000),
        ]);

        if (sh.getLastRow() > 2000) {
            sh.deleteRows(2, 500);
        }
    } catch (e) {
        Logger.log("logSystem_ failed: " + e);
    }
}

function safeJson_(obj) {
    try {
        return JSON.stringify(obj);
    } catch (e) {
        return String(obj);
    }
}

function shortText_(txt, limit) {
    var s = String(txt || "");
    var max = Number(limit || 200);
    if (s.length <= max) return s;
    return s.substring(0, Math.max(0, max - 3)) + "...";
}

function parseServerMessage_(body) {
    if (!body) return "";
    try {
        var parsed = JSON.parse(body);
        if (parsed && parsed.message) return String(parsed.message);
        if (parsed && parsed.error && parsed.error.message)
            return String(parsed.error.message);
    } catch (e) {
        // Ignore non-JSON response.
    }
    return "";
}

function safeCachePut_(cache, cacheKey, value, ttlSeconds, actionName) {
    if (!cache || !cacheKey || !value) return;
    // Apps Script cache value has size limits, so skip very large payloads.
    if (String(value).length > 90000) {
        return;
    }
    try {
        cache.put(cacheKey, value, ttlSeconds);
    } catch (e) {
        logSystem_(
            "WARN",
            actionName || "safeCachePut_",
            "Bo qua cache do gioi han kich thuoc",
            "key=" + cacheKey + ", err=" + shortText_(String(e), 180),
        );
    }
}

function getPurchasedFundCodes_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName(APP_CFG.LOG_SHEET);
    if (!logSheet || logSheet.getLastRow() < 2) return [];

    var values = logSheet
        .getRange(2, 1, logSheet.getLastRow() - 1, 4)
        .getValues();
    var ccqByCode = {};
    for (var i = 0; i < values.length; i++) {
        var code = String(values[i][1] || "").trim();
        var ccq = Number(values[i][3] || 0);
        if (!code || isNaN(ccq)) continue;
        ccqByCode[code] = (ccqByCode[code] || 0) + ccq;
    }

    var out = [];
    for (var k in ccqByCode) {
        if (!ccqByCode.hasOwnProperty(k)) continue;
        if (ccqByCode[k] > 0) out.push(k);
    }
    return out;
}

function getHistoryTargetCodes_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    var selected = dash ? getSelectedTrackedCodes_(dash) : [];
    var purchased = getPurchasedFundCodes_();
    var planned = getPlannedMonthlyFundCodes_();
    var targets = uniqueArray_(selected.concat(purchased).concat(planned));

    if (!targets.length) {
        var allCodes = getFundCodes_();
        if (allCodes.length) targets = [allCodes[0]];
    }
    return targets.slice(0, 20);
}

function getPlannedMonthlyFundCodes_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    if (!dash) return [];

    var funds = getFundCodes_();
    var lastRow = Math.max(9, 8 + funds.length);
    if (lastRow < 9) return [];

    var rows = dash.getRange(9, 1, lastRow - 8, 8).getValues();
    var out = [];
    for (var i = 0; i < rows.length; i++) {
        var code = String(rows[i][0] || "").trim();
        var monthly = parseMonthlyContribution_(rows[i][7] || 0);
        if (code && monthly > 0) out.push(code);
    }
    return uniqueArray_(out);
}

function getDashboardMonthlyContributions_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(APP_CFG.DASH_SHEET);
    var out = {};
    if (!dash) return getStoredMonthlyContributionMap_();

    var funds = getFundCodes_();
    var lastRow = Math.max(9, 8 + funds.length);
    if (lastRow < 9) return out;

    var values = dash.getRange(9, 1, lastRow - 8, 8).getValues();
    for (var i = 0; i < values.length; i++) {
        var code = String(values[i][0] || "").trim();
        if (!code) continue;
        var monthly = parseMonthlyContribution_(values[i][7] || 0);
        if (monthly > 0) out[code] = monthly;
    }
    setStoredMonthlyContributionMap_(out);
    return out;
}

function buildLineChartRowsWithBreaks_(code, series, gapHours, breakFactor) {
    var out = [];
    if (!series || !series.length) return out;

    var factor = Number(breakFactor || 2);
    if (isNaN(factor) || factor < 1.2) factor = 2;
    var expectedMs = Math.max(1, Number(gapHours || 1)) * 60 * 60 * 1000;
    var breakMs = expectedMs * factor;

    for (var i = 0; i < series.length; i++) {
        var ts = Number(series[i][0] || 0);
        var nav = Number(series[i][1] || 0);
        if (!ts || !nav || isNaN(ts) || isNaN(nav)) continue;

        if (out.length) {
            var prevTs =
                out[out.length - 1][1] instanceof Date
                    ? out[out.length - 1][1].getTime()
                    : 0;
            if (prevTs && ts - prevTs > breakMs) {
                // Insert a null point to force Sheets line chart to break segments over large time gaps.
                out.push([code, new Date(ts - 1000), null, "", "", "", "", ""]);
            }
        }

        out.push([code, new Date(ts), nav, "", "", "", "", ""]);
    }

    return out;
}
