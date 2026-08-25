/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  EOP-ABC V2 + Dashboard API – Google Apps Script             ║
 * ║  doGet  → Trả dữ liệu JSON (Read, Dashboard API)            ║
 * ║  doPost → Append / Update / Delete row (Write, CRUD)        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 Tuyendung Tool')
    .addItem('Đồng bộ PASS CV ➔ Vòng 1', 'syncPassCvToVong1')
    .addItem('Đồng bộ Đạt V1 ➔ Vòng 2', 'syncDatToVong2')
    .addItem('Đồng bộ Đạt V2 ➔ Thử việc', 'syncDatToThuViec')
    .addSeparator()
    .addItem('🧹 Xóa sạch dữ liệu 4 sheet', 'uiClearAllSheetsData')
    .addToUi();
}

// ─── ⚙️ CẤU HÌNH ──────────────────────────────────────────────────────────
var SECRET_KEY    = "CV_SCORER_SECRET_2025";
var TAB_TONGHOP   = "Tổng Hợp";
var TAB_VONG1     = "Vòng 1";
var TAB_VONG2     = "Vòng 2";
var TAB_THUVIEC   = "Thử việc";

// ── Sheet Văn Thư (Spreadsheet riêng) ──────────────────────────────────────
var VAN_THU_SS_ID = "1iqwIxPO4rF_As0B6LMJJV2ZwhU2BIU-PFaUgxlmGbJY";

var COL_TRANGTHAI = 14;  // Cột N – Tổng Hợp (1-indexed, sau khi thêm 3 cột mới)
var COL_KETQUA_V1 = 17;  // Cột Q – Vòng 1
var COL_KETQUA_V2 = 18;  // Cột R – Vòng 2

var PASS_VALUE = "PASS CV";
var DAT_VALUE  = "Đạt";

var HEADER_BASE = [
  "STT", "Ngày", "Tên ứng viên", "Email", "SĐT",
  "Bằng cấp", "Chuyên ngành", "Kinh nghiệm", "Chức danh gần nhất", "Công ty gần nhất",
  "Khu vực", "Phòng Ban",
  "Vị trí", "Trạng thái", "Nguồn", "Người đánh giá"
];
var HEADER_TONGHOP = HEADER_BASE.concat(["Ghi chú"]);
var HEADER_VONG1 = HEADER_BASE.concat(["Kết quả V1", "Ghi chú"]);
var HEADER_VONG2 = HEADER_BASE.concat(["Kết quả V1", "Kết quả V2", "Ghi chú"]);
var HEADER_THUVIEC = [
  "STT", "Ngày", "Tên ứng viên", "Email", "SĐT",
  "Bằng cấp", "Chuyên ngành", "Kinh nghiệm", "Chức danh gần nhất", "Công ty gần nhất",
  "Khu vực", "Phòng Ban", "Vị trí",
  "Kết quả V2", "Kết quả nhận việc", "HĐ Chính thức", "Ghi chú"
];


// ══════════════════════════════════════════════════════════════════════════
// GET API – Dashboard đọc dữ liệu
// URL params:
//   ?action=getData&sheet=Tổng Hợp   → trả toàn bộ rows (JSON array of objects)
//   ?action=getStats                  → trả KPI tổng hợp
//   ?action=getVanThuStats            → trả KPI công văn (sheet VanThu riêng)
//   ?action=getVanThuData&sheet=...   → trả dữ liệu 1 tab công văn
// ══════════════════════════════════════════════════════════════════════════
function doGet(e) {
  var params = e ? e.parameter : {};
  var action = params.action || "health";
  var ss     = SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (action === "getData") {
      var sheetName = params.sheet || TAB_TONGHOP;
      var ws        = _getSheet(ss, sheetName);
      if (!ws) return response({ success: false, error: "Sheet không tồn tại: " + sheetName });

      var rows    = ws.getDataRange().getValues();
      var headers = rows[0];
      var data    = [];
      for (var i = 1; i < rows.length; i++) {
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          var val = rows[i][j];
          if (val instanceof Date) {
            val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
          }
          obj[headers[j]] = val;
        }
        data.push(obj);
      }
      return response({ success: true, sheet: ws.getName(), total: data.length, data: data });
    }

    if (action === "getStats") {
      return response(_buildStats(ss));
    }

    // ── Văn Thư: thống kê KPI ──────────────────────────────────────────
    if (action === "getVanThuStats") {
      try {
        var vtSs = SpreadsheetApp.openById(VAN_THU_SS_ID);
        return response(_buildVanThuStats(vtSs));
      } catch (err) {
        return response({ success: false, error: "Không mở được sheet Văn Thư: " + err.message });
      }
    }

    // ── Văn Thư: dữ liệu 1 tab ────────────────────────────────────────
    if (action === "getVanThuData") {
      try {
        var vtSs2    = SpreadsheetApp.openById(VAN_THU_SS_ID);
        var tabName  = params.sheet || "Công văn đến";
        var vtWs     = _getSheet(vtSs2, tabName);
        if (!vtWs) return response({ success: false, error: "Tab không tồn tại: " + tabName });

        var vtRows    = vtWs.getDataRange().getValues();
        var vtHeaders = vtRows[0];
        var vtData    = [];
        for (var vi = 1; vi < vtRows.length; vi++) {
          var vtObj = {}; var hasData = false;
          for (var vj = 0; vj < vtHeaders.length; vj++) {
            var vval = vtRows[vi][vj];
            if (vval instanceof Date) vval = Utilities.formatDate(vval, Session.getScriptTimeZone(), "dd/MM/yyyy");
            vtObj[vtHeaders[vj]] = vval;
            if (vval !== "" && vval !== null) hasData = true;
          }
          if (hasData) vtData.push(vtObj);
        }
        return response({ success: true, sheet: tabName, total: vtData.length, data: vtData });
      } catch (err) {
        return response({ success: false, error: "Lỗi đọc Văn Thư: " + err.message });
      }
    }

    return response({ status: "OK", message: "EOP-ABC API Ready" });

  } catch (err) {
    return response({ success: false, error: err.message });
  }
}



// ══════════════════════════════════════════════════════════════════════════
// POST API – Python / Dashboard ghi dữ liệu
// ══════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET_KEY) return response({ success: false, error: "Unauthorized" });

    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var action = body.action || "append";

    if (action === "append") {
      var rowData = body.row;
      if (!rowData || rowData.length < 10) return response({ success: false, error: "Dữ liệu thiếu" });
      
      var sheetName = body.sheet || TAB_TONGHOP;
      var headers = HEADER_TONGHOP;
      if (sheetName === TAB_VONG1) headers = HEADER_VONG1;
      else if (sheetName === TAB_VONG2) headers = HEADER_VONG2;
      else if (sheetName === TAB_THUVIEC) headers = HEADER_THUVIEC;
      
      var ws = _getOrCreateSheet(ss, sheetName, headers);
      var nextStt = ws.getLastRow();
      var finalRow = [nextStt].concat(rowData);
      ws.appendRow(finalRow);

      // ⚡ Auto-copy PASS CV → Vòng 1
      // rowData không có STT, thứ tự: Ngày(0) Tên(1) Email(2) SĐT(3) Bằng cấp(4) Chuyên ngành(5) Kinh nghiệm(6) Chức danh(7) Công ty(8) Khu vực(9) Phòng Ban(10) Vị trí(11) Trạng thái(12) Nguồn(13) Người đánh giá(14)
      var trangThai = String(rowData[12] || "").trim().toUpperCase();
      var isPass    = (trangThai === PASS_VALUE.toUpperCase());
      
      if (isPass) {
        // Copy sang Vòng 1 (vì là dòng mới từ Python app)
        _copyToSheet(ss, finalRow, TAB_VONG1, HEADER_VONG1);
      }

      return response({ success: true, stt: nextStt, copied_v1: isPass });
    }

    if (action === "update") {
      var wsU = _getSheet(ss, body.sheet || TAB_TONGHOP);
      if (!wsU) return response({ success: false, error: "Sheet không tồn tại" });
      var stt = Number(body.stt);
      var all = wsU.getDataRange().getValues();
      var h   = all[0];
      for (var i = 1; i < all.length; i++) {
        if (Number(all[i][0]) === stt) {
          for (var k in body.updates) {
            var idx = h.indexOf(k);
            if (idx >= 0) wsU.getRange(i+1, idx+1).setValue(body.updates[k]);
          }
          return response({ success: true });
        }
      }
      return response({ success: false, error: "STT not found" });
    }

    if (action === "delete") {
      var wsD = _getSheet(ss, body.sheet || TAB_TONGHOP);
      if (!wsD) return response({ success: false, error: "Sheet không tồn tại" });
      var allD = wsD.getDataRange().getValues();
      for (var j = 1; j < allD.length; j++) {
        if (Number(allD[j][0]) === Number(body.stt)) {
          wsD.deleteRow(j + 1);
          return response({ success: true });
        }
      }
      return response({ success: false });
    }

    if (action === "clear_all") {
      var wsTH = _getSheet(ss, TAB_TONGHOP);
      var wsV1 = _getSheet(ss, TAB_VONG1);
      var wsV2 = _getSheet(ss, TAB_VONG2);
      var wsTV = _getSheet(ss, TAB_THUVIEC);

      if (wsTH) _clearSheet(wsTH, HEADER_TONGHOP);
      if (wsV1) _clearSheet(wsV1, HEADER_VONG1);
      if (wsV2) _clearSheet(wsV2, HEADER_VONG2);
      if (wsTV) _clearSheet(wsTV, HEADER_THUVIEC);

      return response({ success: true, message: "Đã xóa sạch dữ liệu 4 sheet" });
    }

    if (action === "sync_pass") {
      // Python gọi sau khi append PASS CV → copy sang Vòng 1
      var wsTH = _getSheet(ss, TAB_TONGHOP);
      if (!wsTH) return response({ success: false, error: "Sheet Tổng Hợp không tồn tại" });
      var allRows = wsTH.getDataRange().getValues();
      var sttTarget = Number(body.stt);
      for (var ri = 1; ri < allRows.length; ri++) {
        if (Number(allRows[ri][0]) === sttTarget) {
          var rowData = allRows[ri];
          if (!_existsInSheet(ss, TAB_VONG1, rowData)) {
            _copyToSheet(ss, rowData, TAB_VONG1, HEADER_VONG1);
            return response({ success: true, message: "Đã copy STT=" + sttTarget + " sang Vòng 1" });
          }
          return response({ success: true, message: "Đã tồn tại trong Vòng 1" });
        }
      }
      return response({ success: false, error: "Không tìm thấy STT=" + sttTarget });
    }

    return response({ success: false, error: "Unknown action" });
  } catch (err) {
    return response({ success: false, error: err.message });
  }
}


// ══════════════════════════════════════════════════════════════════════════
// Triggers
// ══════════════════════════════════════════════════════════════════════════
function onEdit(e) {
  try {
    var r = e.range; var s = r.getSheet(); var name = s.getName(); var c = r.getColumn(); var row = r.getRow();
    if (row <= 1) return;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var val = String(e.value || "").trim().toUpperCase();

    // Tổng Hợp (K) -> Vòng 1
    if (name.toLowerCase() === TAB_TONGHOP.toLowerCase() && c === COL_TRANGTHAI) {
      if (val === PASS_VALUE.toUpperCase()) {
        var data = s.getRange(row, 1, 1, 17).getValues()[0]; // 17 columns (STT to Ghi chú)
        var dataV1 = data.slice(0, 16);
        dataV1.push("Chờ đánh giá");
        dataV1.push(data[16] || "");
        if (!_existsInSheet(ss, TAB_VONG1, data)) _copyToSheet(ss, dataV1, TAB_VONG1, HEADER_VONG1);
      }
    }
    // Vòng 1 (N) -> Vòng 2
    if (name.toLowerCase() === TAB_VONG1.toLowerCase() && c === COL_KETQUA_V1) {
      if (val === DAT_VALUE.toUpperCase()) {
        var d1 = s.getRange(row, 1, 1, 18).getValues()[0]; // 18 columns (STT to Ghi chú)
        var dataV2 = d1.slice(0, 17);
        dataV2.push("Chờ đánh giá");
        dataV2.push(d1[17] || "");
        if (!_existsInSheet(ss, TAB_VONG2, d1)) _copyToSheet(ss, dataV2, TAB_VONG2, HEADER_VONG2);
      }
    }
    // Vòng 2 (O) -> Thử việc
    if (name.toLowerCase() === TAB_VONG2.toLowerCase() && c === COL_KETQUA_V2) {
      if (val === DAT_VALUE.toUpperCase()) {
        var d2 = s.getRange(row, 1, 1, 19).getValues()[0]; // 19 columns (STT to Ghi chú)
        if (!_existsInSheet(ss, TAB_THUVIEC, d2)) _copyToThuViec(ss, d2);
      }
    }
  } catch (e) { console.error(e); }
}


// ══════════════════════════════════════════════════════════════════════════
// Sync Functions
// ══════════════════════════════════════════════════════════════════════════
function syncPassCvToVong1() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var count = _syncByColumn(ss, _getSheet(ss, TAB_TONGHOP), COL_TRANGTHAI, PASS_VALUE, TAB_VONG1, HEADER_VONG1);
  SpreadsheetApp.getUi().alert("✅ Đã chuyển " + count + " ứng viên PASS CV sang " + TAB_VONG1);
}
function syncDatToVong2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var count = _syncByColumn(ss, _getSheet(ss, TAB_VONG1), COL_KETQUA_V1, DAT_VALUE, TAB_VONG2, HEADER_VONG2);
  SpreadsheetApp.getUi().alert("✅ Đã chuyển " + count + " ứng viên Đạt V1 sang " + TAB_VONG2);
}


// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════
function _getSheet(ss, name) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === name.toLowerCase()) return sheets[i];
  }
  return null;
}

function _getOrCreateSheet(ss, name, headers) {
  var ws = _getSheet(ss, name);
  if (!ws) {
    // Tạo mới sheet
    ws = ss.insertSheet(name);
    ws.appendRow(headers);
    ws.getRange(1,1,1,headers.length).setFontWeight("bold").setBackground("#1a73e8").setFontColor("white").setHorizontalAlignment("center");
    ws.setFrozenRows(1);
  } else {
    // Sheet đã tồn tại – kiểm tra header có đủ cột không
    var existingHeaders = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    for (var h = 0; h < headers.length; h++) {
      if (existingHeaders.indexOf(headers[h]) === -1) {
        // Cột bị thiếu → thêm vào cuối
        var newCol = ws.getLastColumn() + 1;
        ws.getRange(1, newCol).setValue(headers[h])
          .setFontWeight("bold").setBackground("#1a73e8").setFontColor("white").setHorizontalAlignment("center");
      }
    }
    ws.setFrozenRows(1);
  }
  return ws;
}


function _copyToSheet(ss, rowData, destName, destHeader) {
  var d = _getOrCreateSheet(ss, destName, destHeader);
  var nr = rowData.slice();
  while (nr.length < destHeader.length) nr.push("");
  nr[0] = d.getLastRow(); // STT mới
  d.appendRow(nr);
}

function _copyToThuViec(ss, rowData) {
  var d = _getOrCreateSheet(ss, TAB_THUVIEC, HEADER_THUVIEC);
  d.appendRow([
    d.getLastRow(), 
    rowData[1], rowData[2], rowData[3], rowData[4], 
    rowData[5], rowData[6], rowData[7], rowData[8], rowData[9], 
    rowData[10], rowData[11], rowData[12], 
    rowData[17] || DAT_VALUE, 
    "", 
    "",
    rowData[18] || ""
  ]);
}

function _syncByColumn(ss, src, col, val, destName, destHeader) {
  if (!src) return 0;
  var data = src.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var v = String(data[i][col-1]).trim().toUpperCase();
    if (v === val.toUpperCase() && !_existsInSheet(ss, destName, data[i])) {
      var row;
      if (destName === TAB_VONG1) {
        row = data[i].slice(0, 16);
        row.push("Chờ đánh giá");
        row.push(data[i][16] || "");
      } else if (destName === TAB_VONG2) {
        row = data[i].slice(0, 17);
        row.push("Chờ đánh giá");
        row.push(data[i][17] || "");
      } else {
        row = data[i];
      }
      _copyToSheet(ss, row, destName, destHeader); count++;
    }
  }
  return count;
}

function _existsInSheet(ss, sheetName, rowData) {
  var ws = _getSheet(ss, sheetName);
  if (!ws || ws.getLastRow() <= 1) return false;
  
  var ten  = String(rowData[2] || "").trim().toLowerCase();
  var ngay = _fmtDate(rowData[1]);
  
  var data = ws.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var sTen = String(data[i][2] || "").trim().toLowerCase();
    var sNgay = _fmtDate(data[i][1]);
    if (sTen === ten && sNgay === ngay) return true;
  }
  return false;
}

function _fmtDate(d) {
  if (!d) return "";
  if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var s = String(d).trim();
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

function _buildStats(ss) {
  var s = { success: true };
  var ws = _getSheet(ss, TAB_TONGHOP);
  if (!ws) return s;
  var data = ws.getDataRange().getValues();
  var h = data[0];
  var idxS = h.indexOf("Trạng thái");
  var idxD = h.indexOf("Phòng Ban");
  var idxT = h.indexOf("Ngày");
  
  var pass = 0, fail = 0, depts = {}, months = {};
  for (var i = 1; i < data.length; i++) {
    var st = String(data[i][idxS] || "").trim().toUpperCase();
    if (st === PASS_VALUE.toUpperCase()) pass++; else fail++;
    var dp = String(data[i][idxD] || "N/A").trim();
    depts[dp] = (depts[dp] || 0) + 1;
    var dt = _fmtDate(data[i][idxT]).substring(0, 7);
    if (dt) months[dt] = (months[dt] || 0) + 1;
  }
  
  s.total_candidates = data.length - 1;
  s.pass_count = pass;
  s.fail_count = fail;
  s.pass_rate = s.total_candidates > 0 ? Math.round(pass/s.total_candidates*1000)/10 : 0;
  s.by_department = depts;
  s.by_month = months;
  
  // Counts from other sheets
  s.vong1_count = (_getSheet(ss, TAB_VONG1)?.getLastRow() || 1) - 1;
  s.vong2_count = (_getSheet(ss, TAB_VONG2)?.getLastRow() || 1) - 1;

  // Thử việc: chỉ đếm dòng có dữ liệu ở cột "Kết quả nhận việc"
  var wsThuViec = _getSheet(ss, TAB_THUVIEC);
  var thuviec_count = 0;
  var hd_count = 0;
  if (wsThuViec && wsThuViec.getLastRow() > 1) {
    var tvData = wsThuViec.getDataRange().getValues();
    var tvHeader = tvData[0];
    var idxKQNV = tvHeader.indexOf("Kết quả nhận việc");
    var idxHD   = tvHeader.indexOf("HĐ Chính thức");
    for (var ti = 1; ti < tvData.length; ti++) {
      var kqnv = String(tvData[ti][idxKQNV] || "").trim();
      if (kqnv !== "") thuviec_count++;
      if (idxHD >= 0) {
        var hd = String(tvData[ti][idxHD] || "").trim().toLowerCase();
        if (hd === "đã ký") hd_count++;
      }
    }
  }
  s.thuviec_count = thuviec_count;
  s.hd_count = hd_count;
  
  return s;
}

function response(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}

// ── Văn Thư helpers ────────────────────────────────────────────────────────
function _vtCountRows(ss, tabName) {
  var ws = _getSheet(ss, tabName);
  if (!ws || ws.getLastRow() <= 1) return 0;
  var vals = ws.getRange(2, 1, ws.getLastRow() - 1, 1).getValues();
  var count = 0;
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] !== "" && vals[i][0] !== null) count++;
  }
  return count;
}

function _buildVanThuStats(ss) {
  var den  = _vtCountRows(ss, "Công văn đến");
  var di1  = _vtCountRows(ss, "Công văn đi 1");
  var di2  = _vtCountRows(ss, "Công văn đi 2");
  var hdqt = _vtCountRows(ss, "Công văn đi 1 - HĐQT");
  return {
    success:       true,
    cong_van_den:  den,
    cong_van_di_1: di1,
    cong_van_di_2: di2,
    cong_van_hdqt: hdqt,
    tong_cong_van: den + di1 + di2 + hdqt
  };
}

function clearAllSheetsData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tongHopSheet = _getSheet(ss, TAB_TONGHOP);
  var vong1Sheet = _getSheet(ss, TAB_VONG1);
  var vong2Sheet = _getSheet(ss, TAB_VONG2);
  var thuViecSheet = _getSheet(ss, TAB_THUVIEC);
  
  if (tongHopSheet) _clearSheet(tongHopSheet, HEADER_TONGHOP);
  if (vong1Sheet) _clearSheet(vong1Sheet, HEADER_VONG1);
  if (vong2Sheet) _clearSheet(vong2Sheet, HEADER_VONG2);
  if (thuViecSheet) _clearSheet(thuViecSheet, HEADER_THUVIEC);
}

function uiClearAllSheetsData() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('CẢNH BÁO', 'Bạn có chắc chắn muốn xóa sạch toàn bộ dữ liệu ứng viên ở cả 4 sheet?\nHành động này không thể hoàn tác.', ui.ButtonSet.YES_NO);
  if (response == ui.Button.YES) {
    clearAllSheetsData();
    ui.alert('Thành công', 'Đã xóa sạch dữ liệu ở cả 4 sheet.', ui.ButtonSet.OK);
  }
}

function _clearSheet(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  // Reset headers to make sure they are correct
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}
