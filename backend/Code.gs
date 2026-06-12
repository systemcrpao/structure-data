/**
 * Code.gs — CR-Vision Backend API
 * Google Apps Script Web App
 *
 * ─── วิธี Deploy ───────────────────────────────────────────────────
 *  1. เปิด script.google.com → โปรเจกต์ใหม่
 *  2. วางโค้ดนี้ลงใน Code.gs
 *  3. เปลี่ยน SECRET_KEY ด้านล่างให้เป็นค่าที่ยาวและซับซ้อน
 *  4. Deploy → New Deployment → Web App
 *     - Execute as: Me (บัญชีเจ้าของ Google Sheet)
 *     - Who has access: Anyone
 *  5.  Web Apคัดลอกp URL ไปใส่ใน gas-config.js
 *
 * ─── ความปลอดภัย ────────────────────────────────────────────────────
 *  - Auth Sheet (ตารางผู้ใช้) ต้องเป็น Private — ไม่ share ให้ public
 *  - รหัสผ่านในชีท: ใส่เป็น plain text ก็ได้ (GAS จะ hash ก่อนเปรียบ)
 *    หรือแปลงเป็น SHA-256 hex ก่อนบันทึก (ปลอดภัยกว่า)
 *  - Token ใช้ HMAC-SHA256 มีอายุ 8 ชั่วโมง
 *  - มีระบบล็อคบัญชีหลังกรอกผิด 5 ครั้ง
 */

// ═══════════════════════════════════════════
// CONFIGURATION — เปลี่ยนค่าเหล่านี้ก่อน Deploy
// ═══════════════════════════════════════════
var AUTH_SHEET_ID = "18DXCRGCgoW4JaTpDYPsA-u91aP2zMzB07AFxyJ3IrVk";
var DATA_SHEET_ID = "179WwkuBkc6QwiuVvJIP-RXpW0zI_gkKnfBLHw87YYyI";

// ⚠️ เปลี่ยน SECRET_KEY ทันที — ใช้ค่าสุ่มที่ยาวอย่างน้อย 32 ตัวอักษร
var SECRET_KEY = "CR-Vision-2026!ChangeMeNow#UseALongRandomString$Here";

var MAX_ATTEMPTS = 5; // จำนวนครั้งสูงสุดที่ login ผิดพลาดได้
var BLOCK_MINS = 15; // เวลาล็อคบัญชีชั่วคราว (นาที)
var TOKEN_HOURS = 8; // อายุ token (ชั่วโมง)

// สถานะที่อนุญาต (whitelist) — treasury เปลี่ยนได้เฉพาะค่าเหล่านี้
var ALLOWED_STATUSES = [
  "รอดำเนินการ",
  "กำลังดำเนินการ",
  "แล้วเสร็จ",
  "ยกเลิก",
  "ระงับชั่วคราว",
];

// Header สำหรับ sheet โครงการ
var PROJECT_HEADERS = [
  "ที่",
  "ชื่อโครงการ",
  "งบประมาณ",
  "ตำบล",
  "อำเภอ",
  "สถานที่ดำเนินงาน",
  "พิกัดเริ่มต้น",
  "พิกัดสิ้นสุด",
  "แหล่งงบประมาณ",
  "ประเภทงาน",
  "รายละเอียด",
  "สถานะ",
  "รูปภาพ",
];

// ═══════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var action = sanitize(params.action || "");

    if (!action) return error_("Missing action");

    // Login ไม่ต้องใช้ token
    if (action === "login") return handleLogin(params);

    // ทุก action อื่นต้องมี valid token
    var session = verifyToken(params.token);
    if (!session) return error_("Unauthorized — กรุณาเข้าสู่ระบบใหม่");

    switch (action) {
      case "addProject":
        return handleAddProject(params, session);
      case "importCSV":
        return handleImportCSV(params, session);
      case "updateStatus":
        return handleUpdateStatus(params, session);
      case "updateProject":
        return handleUpdateProject(params, session);
      case "deleteProject":
        return handleDeleteProject(params, session);
      case "getProjects":
        return handleGetProjects(params, session);
      case "getUsers":
        return handleGetUsers(params, session);
      case "addUser":
        return handleAddUser(params, session);
      case "updateUser":
        return handleUpdateUser(params, session);
      case "deleteUser":
        return handleDeleteUser(params, session);
      default:
        return error_("Unknown action: " + action);
    }
  } catch (err) {
    Logger.log("doPost error: " + err.message);
    return error_("Server error: " + err.message);
  }
}

// Health check — GET request ไม่ต้อง auth
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "ok",
      service: "CR-Vision API",
      ts: new Date().toISOString(),
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════
// AUTH — LOGIN
// ═══════════════════════════════════════════

function handleLogin(params) {
  var username = sanitize(params.username || "").toLowerCase();
  var passHash = sanitize(params.passHash || "").toLowerCase();

  if (!username || !passHash) {
    return error_("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
  }

  // Rate limiting
  if (!checkRateLimit(username)) {
    return error_(
      "บัญชีถูกล็อคชั่วคราว กรุณารอ " + BLOCK_MINS + " นาทีแล้วลองใหม่",
    );
  }

  var user = findUser(username, passHash);
  if (!user) {
    recordFailedAttempt(username);
    // Delay สุ่มเพื่อป้องกัน timing attack
    Utilities.sleep(500 + Math.floor(Math.random() * 500));
    return error_("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }

  clearAttempts(username);
  var token = generateToken(username, user.role);
  return ok_({
    role: user.role,
    token: token,
    user: username,
    displayRole: getRoleDisplay(user.role),
  });
}

// ค้นหาผู้ใช้ใน Auth Sheet
function findUser(username, passHash) {
  try {
    var ss = SpreadsheetApp.openById(AUTH_SHEET_ID);
    var sheet = ss.getSheets()[0];
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowUser = (row[1] || "").toString().trim().toLowerCase();
      var rowPass = (row[2] || "").toString().trim();
      var rowRole = (row[3] || "").toString().trim().toLowerCase();

      if (rowUser !== username) continue;

      // รองรับทั้ง plain text และ SHA-256 hash ใน sheet
      var stored = isHex64(rowPass)
        ? rowPass.toLowerCase()
        : sha256Hex(rowPass);
      if (timingSafeEqual(stored, passHash)) {
        return { role: rowRole };
      }
      return null; // username ถูกแต่ password ผิด
    }
    return null;
  } catch (e) {
    throw new Error("ไม่สามารถตรวจสอบข้อมูลผู้ใช้ได้: " + e.message);
  }
}

function isHex64(str) {
  return /^[0-9a-f]{64}$/.test(str);
}

function sha256Hex(input) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    input,
    Utilities.Charset.UTF_8,
  );
  return bytes
    .map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    })
    .join("");
}

function getRoleDisplay(role) {
  var map = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้อำนวยการ",
    user: "ช่างเทคนิค",
    approve: "การเงิน/คลัง",
  };
  return map[role] || role;
}

// ═══════════════════════════════════════════
// TOKEN MANAGEMENT (HMAC-SHA256)
// ═══════════════════════════════════════════

function generateToken(username, role) {
  var payload = [username, role, Date.now().toString()].join("|");
  var payloadB64 = Utilities.base64EncodeWebSafe(payload);
  var sig = computeHmac(payload);
  return payloadB64 + "." + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    var parts = token.split(".");
    if (parts.length !== 2) return null;

    var payloadBytes = Utilities.base64DecodeWebSafe(parts[0]);
    var payload = payloadBytes
      .map(function (b) {
        return String.fromCharCode(b & 0xff);
      })
      .join("");

    // ตรวจสอบ HMAC signature (constant-time compare)
    var expectedSig = computeHmac(payload);
    if (!timingSafeEqual(parts[1], expectedSig)) return null;

    var segs = payload.split("|");
    if (segs.length !== 3) return null;

    var username = segs[0];
    var role = segs[1];
    var timestamp = parseInt(segs[2], 10);
    if (isNaN(timestamp)) return null;

    // ตรวจสอบ token หมดอายุ
    if (Date.now() - timestamp > TOKEN_HOURS * 3600 * 1000) return null;

    return { username: username, role: role };
  } catch (e) {
    return null;
  }
}

function computeHmac(payload) {
  var sig = Utilities.computeHmacSha256Signature(
    payload,
    SECRET_KEY,
    Utilities.Charset.UTF_8,
  );
  return sig
    .map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    })
    .join("");
}

// ป้องกัน timing attack — compare แบบ constant-time
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ═══════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════

function checkRateLimit(username) {
  var props = PropertiesService.getScriptProperties();
  var blockUntil = parseInt(props.getProperty("blk_" + username) || "0", 10);
  if (Date.now() < blockUntil) return false;
  var attempts = parseInt(props.getProperty("att_" + username) || "0", 10);
  return attempts < MAX_ATTEMPTS;
}

function recordFailedAttempt(username) {
  var props = PropertiesService.getScriptProperties();
  var key = "att_" + username;
  var attempts = parseInt(props.getProperty(key) || "0", 10) + 1;
  props.setProperty(key, attempts.toString());
  if (attempts >= MAX_ATTEMPTS) {
    props.setProperty(
      "blk_" + username,
      (Date.now() + BLOCK_MINS * 60000).toString(),
    );
    props.deleteProperty(key);
  }
}

function clearAttempts(username) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty("att_" + username);
  props.deleteProperty("blk_" + username);
}

// ═══════════════════════════════════════════
// PROJECT OPERATIONS — TECHNICIAN (role: user)
// ═══════════════════════════════════════════

function handleAddProject(params, session) {
  requireRole_(session, ["admin", "user"]);

  var p = params.project || {};
  if (!sanitize(p.title)) return error_("ชื่อโครงการไม่ถูกต้อง");

  var year = parseInt(p.year, 10);
  if (isNaN(year) || year < 2560 || year > 2600)
    return error_("ปีงบประมาณไม่ถูกต้อง");

  var ss = SpreadsheetApp.openById(DATA_SHEET_ID);
  var sheet = getOrCreateSheet_(ss, year.toString());
  var id = sheet.getLastRow(); // auto-id = row count (header = row 1)

  sheet.appendRow([
    id,
    sanitize(p.title),
    sanitize(p.budget || ""),
    sanitize(p.subdistrict || ""),
    sanitize(p.district || ""),
    sanitize(p.location || ""),
    sanitize(p.coordStart || ""),
    sanitize(p.coordEnd || ""),
    sanitize(p.fundSource || ""),
    sanitize(p.type || ""),
    sanitize(p.description || ""),
    ALLOWED_STATUSES.indexOf(sanitize(p.status || "")) !== -1
      ? sanitize(p.status)
      : "รอดำเนินการ",
    sanitize(p.image || ""),
  ]);

  logAudit_(session.username, "addProject", {
    year: year,
    title: sanitize(p.title),
  });
  return ok_({ id: id, message: "เพิ่มโครงการสำเร็จ" });
}

function handleImportCSV(params, session) {
  requireRole_(session, ["admin", "user"]);

  var rows = params.rows;
  var year = parseInt(params.year, 10);

  if (!Array.isArray(rows) || rows.length === 0)
    return error_("ไม่มีข้อมูลที่จะนำเข้า");
  if (rows.length > 500) return error_("นำเข้าได้สูงสุด 500 รายการต่อครั้ง");
  if (isNaN(year) || year < 2560 || year > 2600)
    return error_("ปีงบประมาณไม่ถูกต้อง");

  var ss = SpreadsheetApp.openById(DATA_SHEET_ID);
  var sheet = getOrCreateSheet_(ss, year.toString());
  var startId = sheet.getLastRow();

  var bulk = rows.map(function (p, i) {
    return [
      startId + i,
      sanitize(p.title || ""),
      sanitize(p.budget || ""),
      sanitize(p.subdistrict || ""),
      sanitize(p.district || ""),
      sanitize(p.location || ""),
      sanitize(p.coordStart || ""),
      sanitize(p.coordEnd || ""),
      sanitize(p.fundSource || ""),
      sanitize(p.type || ""),
      sanitize(p.description || ""),
      ALLOWED_STATUSES.indexOf(sanitize(p.status || "")) !== -1
        ? sanitize(p.status)
        : "รอดำเนินการ",
      sanitize(p.image || ""),
    ];
  });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, bulk.length, bulk[0].length)
    .setValues(bulk);
  logAudit_(session.username, "importCSV", { year: year, count: rows.length });
  return ok_({
    count: rows.length,
    message: "นำเข้า " + rows.length + " โครงการสำเร็จ",
  });
}

// ═══════════════════════════════════════════
// UPDATE PROJECT — TECHNICIAN (role: user/admin)
// ═══════════════════════════════════════════

function handleUpdateProject(params, session) {
  requireRole_(session, ["admin", "user"]);

  var rowId = parseInt(params.rowId, 10);
  var year = sanitize(params.year || "");
  var p = params.project || {};

  if (isNaN(rowId) || rowId < 1) return error_("rowId ไม่ถูกต้อง");
  if (!year) return error_("กรุณาระบุปีงบประมาณ");
  if (!sanitize(p.title)) return error_("ชื่อโครงการไม่ถูกต้อง");

  var ss = SpreadsheetApp.openById(DATA_SHEET_ID);
  var sheet = ss.getSheetByName(year);
  if (!sheet) return error_("ไม่พบปีงบประมาณ: " + year);

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (parseInt(data[i][0], 10) === rowId) {
      // Columns: ที่, ชื่อโครงการ, งบประมาณ, ตำบล, อำเภอ, สถานที่ดำเนินงาน, พิกัดเริ่มต้น, พิกัดสิ้นสุด, แหล่งงบประมาณ, ประเภทงาน, รายละเอียด, สถานะ, รูปภาพ
      sheet
        .getRange(i + 1, 2, 1, 12)
        .setValues([
          [
            sanitize(p.title || ""),
            sanitize(p.budget || ""),
            sanitize(p.subdistrict || ""),
            sanitize(p.district || ""),
            sanitize(p.location || ""),
            sanitize(p.coordStart || ""),
            sanitize(p.coordEnd || ""),
            sanitize(p.fundSource || ""),
            sanitize(p.type || ""),
            sanitize(p.description || ""),
            ALLOWED_STATUSES.indexOf(sanitize(p.status || "")) !== -1
              ? sanitize(p.status)
              : data[i][11],
            sanitize(p.image || ""),
          ],
        ]);
      logAudit_(session.username, "updateProject", {
        year: year,
        rowId: rowId,
      });
      return ok_({ message: "แก้ไขโครงการสำเร็จ" });
    }
  }
  return error_("ไม่พบโครงการ ID: " + rowId);
}

// ═══════════════════════════════════════════
// DELETE PROJECT — TECHNICIAN (role: user/admin)
// ═══════════════════════════════════════════

function handleDeleteProject(params, session) {
  requireRole_(session, ["admin", "user"]);

  var rowId = parseInt(params.rowId, 10);
  var year = sanitize(params.year || "");

  if (isNaN(rowId) || rowId < 1) return error_("rowId ไม่ถูกต้อง");
  if (!year) return error_("กรุณาระบุปีงบประมาณ");

  var ss = SpreadsheetApp.openById(DATA_SHEET_ID);
  var sheet = ss.getSheetByName(year);
  if (!sheet) return error_("ไม่พบปีงบประมาณ: " + year);

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (parseInt(data[i][0], 10) === rowId) {
      sheet.deleteRow(i + 1);
      logAudit_(session.username, "deleteProject", {
        year: year,
        rowId: rowId,
      });
      return ok_({ message: "ลบโครงการสำเร็จ" });
    }
  }
  return error_("ไม่พบโครงการ ID: " + rowId);
}

// ═══════════════════════════════════════════
// STATUS UPDATE — TREASURY (role: approve)
// ═══════════════════════════════════════════

function handleUpdateStatus(params, session) {
  requireRole_(session, ["admin", "approve"]);

  var rowId = parseInt(params.rowId, 10);
  var newStatus = sanitize(params.status || "");
  var year = sanitize(params.year || "");

  if (isNaN(rowId) || rowId < 1) return error_("rowId ไม่ถูกต้อง");
  if (ALLOWED_STATUSES.indexOf(newStatus) === -1)
    return error_("ค่าสถานะไม่ถูกต้อง");
  if (!year) return error_("กรุณาระบุปีงบประมาณ");

  var ss = SpreadsheetApp.openById(DATA_SHEET_ID);
  var sheet = ss.getSheetByName(year);
  if (!sheet) return error_("ไม่พบปีงบประมาณ: " + year);

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (parseInt(data[i][0], 10) === rowId) {
      var statusCol = data[0].indexOf("สถานะ");
      if (statusCol === -1) statusCol = 11; // fallback
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      logAudit_(session.username, "updateStatus", {
        year: year,
        rowId: rowId,
        status: newStatus,
      });
      return ok_({ message: "อัปเดตสถานะสำเร็จ" });
    }
  }
  return error_("ไม่พบโครงการ ID: " + rowId);
}

// ═══════════════════════════════════════════
// GET DATA
// ═══════════════════════════════════════════

function handleGetProjects(params, session) {
  // ทุก role ดูข้อมูลได้
  var year = sanitize(params.year || "");
  var ss = SpreadsheetApp.openById(DATA_SHEET_ID);

  var sheets = year
    ? [ss.getSheetByName(year)].filter(Boolean)
    : ss.getSheets().filter(function (s) {
        return s.getName().charAt(0) !== "_";
      });

  var all = [];
  sheets.forEach(function (sheet) {
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0].map(function (h) {
      return normalizeHeader_(h);
    });
    for (var i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      var obj = { _sheet: sheet.getName() };
      headers.forEach(function (h, j) {
        obj[h] = data[i][j];
      });
      all.push(obj);
    }
  });

  return ok_({ data: all, count: all.length });
}

function handleGetUsers(params, session) {
  requireRole_(session, ["admin"]);
  var ss = SpreadsheetApp.openById(AUTH_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  // คืนค่าโดยไม่รวม password
  var users = data.slice(1).map(function (row) {
    return {
      id: row[0],
      username: row[1],
      role: row[3],
      display: getRoleDisplay((row[3] || "").toString().toLowerCase()),
    };
  });
  return ok_({ users: users });
}

function handleAddUser(params, session) {
  requireRole_(session, ["admin"]);

  var username = sanitize((params.username || "").toLowerCase().trim());
  var password = sanitize(params.password || "");
  var role     = sanitize((params.role || "").toLowerCase().trim());

  if (!username) return error_("กรุณาระบุชื่อผู้ใช้");
  if (!/^[a-z0-9._-]{3,30}$/.test(username))
    return error_("ชื่อผู้ใช้ต้องเป็นตัวอักษร a-z, 0-9, . _ - และมีความยาว 3-30 ตัวอักษร");
  if (!password || password.length < 6)
    return error_("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
  if (["admin", "director", "user", "approve"].indexOf(role) === -1)
    return error_("บทบาทไม่ถูกต้อง");

  var ss    = SpreadsheetApp.openById(AUTH_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();

  // ตรวจสอบชื่อผู้ใช้ซ้ำ
  for (var i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toLowerCase() === username) {
      return error_("ชื่อผู้ใช้ " + username + " มีในระบบแล้ว");
    }
  }

  var newId   = data.length; // id = จำนวนแถวทั้งหมด (header + data)
  var passHash = sha256Hex(password);
  sheet.appendRow([newId, username, passHash, role]);
  logAudit_(session.username, "addUser", { username: username, role: role });
  return ok_({ message: "เพิ่มผู้ใช้ " + username + " สำเร็จ", id: newId });
}

function handleUpdateUser(params, session) {
  requireRole_(session, ["admin"]);

  var userId   = parseInt(params.userId, 10);
  var newRole  = sanitize((params.role || "").toLowerCase().trim());
  var newPass  = sanitize(params.password || "");

  if (isNaN(userId)) return error_("userId ไม่ถูกต้อง");
  if (newRole && ["admin", "director", "user", "approve"].indexOf(newRole) === -1)
    return error_("บทบาทไม่ถูกต้อง");
  if (newPass && newPass.length < 6)
    return error_("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");

  var ss    = SpreadsheetApp.openById(AUTH_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (parseInt(data[i][0], 10) === userId) {
      var targetUser = (data[i][1] || "").toString().trim();
      // ห้าม admin แก้ role ตัวเอง
      if (targetUser.toLowerCase() === session.username.toLowerCase() && newRole && newRole !== data[i][3]) {
        return error_("ไม่สามารถเปลี่ยน Role ของตัวเองได้");
      }
      if (newRole)  sheet.getRange(i + 1, 4).setValue(newRole);
      if (newPass)  sheet.getRange(i + 1, 3).setValue(sha256Hex(newPass));
      logAudit_(session.username, "updateUser", { userId: userId, username: targetUser, role: newRole || "(ไม่เปลี่ยน)" });
      return ok_({ message: "แก้ไขผู้ใช้สำเร็จ" });
    }
  }
  return error_("ไม่พบผู้ใช้ ID: " + userId);
}

function handleDeleteUser(params, session) {
  requireRole_(session, ["admin"]);

  var userId = parseInt(params.userId, 10);
  if (isNaN(userId)) return error_("userId ไม่ถูกต้อง");

  var ss    = SpreadsheetApp.openById(AUTH_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (parseInt(data[i][0], 10) === userId) {
      var targetUser = (data[i][1] || "").toString().trim();
      // ห้ามลบบัญชีตัวเอง
      if (targetUser.toLowerCase() === session.username.toLowerCase()) {
        return error_("ไม่สามารถลบบัญชีของตัวเองได้");
      }
      sheet.deleteRow(i + 1);
      logAudit_(session.username, "deleteUser", { userId: userId, username: targetUser });
      return ok_({ message: "ลบผู้ใช้ " + targetUser + " สำเร็จ" });
    }
  }
  return error_("ไม่พบผู้ใช้ ID: " + userId);
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function getOrCreateSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(PROJECT_HEADERS);
  // ตั้งค่า header row
  sheet
    .getRange(1, 1, 1, PROJECT_HEADERS.length)
    .setBackground("#1e3a5f")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  return sheet;
}

function requireRole_(session, roles) {
  if (roles.indexOf(session.role) === -1) {
    throw new Error("ไม่มีสิทธิ์ดำเนินการนี้ (role: " + session.role + ")");
  }
}

function logAudit_(username, action, details) {
  try {
    var ss = SpreadsheetApp.openById(DATA_SHEET_ID);
    var log = ss.getSheetByName("_audit_log");
    if (!log) {
      log = ss.insertSheet("_audit_log");
      log.appendRow(["Timestamp", "User", "Action", "Details"]);
      log
        .getRange(1, 1, 1, 4)
        .setBackground("#1e3a5f")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
    }
    log.appendRow([
      new Date().toISOString(),
      username,
      action,
      JSON.stringify(details),
    ]);
  } catch (e) {
    /* audit log เป็น best-effort */
  }
}

// แปลง header ของ sheet ให้เป็นรูปแบบมาตรฐาน
// รองรับ cell ที่มี line break หรือ วงเล็บ เช่น "พิกัด\nเริ่มต้น" → "พิกัดเริ่มต้น"
function normalizeHeader_(h) {
  var cleaned = (h || "")
    .toString()
    .replace(/[\r\n]+/g, "")
    .trim();
  var aliases = {
    "งบประมาณ (บาท)": "งบประมาณ",
    "งบประมาณ(บาท)": "งบประมาณ",
    สถานะการดำเนินงาน: "สถานะ",
    "พิกัด เริ่มต้น": "พิกัดเริ่มต้น",
    "พิกัด สิ้นสุด": "พิกัดสิ้นสุด",
  };
  return aliases[cleaned] || cleaned;
}

// ป้องกัน formula injection และ control characters
function sanitize(val) {
  if (val === null || val === undefined) return "";
  var s = val
    .toString()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars
    .replace(/^([=+\-@\t\r|%])/, "'$1") // formula injection
    .substring(0, 2000); // จำกัดความยาว
  return s;
}

function ok_(data) {
  var payload = Object.assign({ success: true }, data);
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function error_(msg) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: false, error: msg }),
  ).setMimeType(ContentService.MimeType.JSON);
}
