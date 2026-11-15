/**
 * =========================================================================
 * GOOGLE APPS SCRIPT BACKEND FOR AUTHONG ATHLETICS OFFICIAL STORE
 * ระบบบันทึกและจัดการคำสั่งจองเสื้อกีฬาสีทีมสีม่วง 2026 เชื่อมต่อ Google Sheets
 * Spreadsheet URL: https://docs.google.com/spreadsheets/d/1WOI_8VSHi_6FIaifxPNuX7hTHEElSVKeR8InFHSQZLw/edit
 * =========================================================================
 */

var SPREADSHEET_ID = "1WOI_8VSHi_6FIaifxPNuX7hTHEElSVKeR8InFHSQZLw";
var SHEET_NAME = "Orders";
var DRIVE_FOLDER_NAME = "Purple Jersey Slips 2026"; // โฟลเดอร์เก็บสลิป
var ORDER_HEADERS = ["Timestamp", "Email", "Student No.", "Room", "Screen Name", "Screen Number", "Size", "Payment Slip", "Status"];
var LOCKED_PAYMENT_STATUSES = ["ชำระเงินแล้ว", "ชำระเงินสำเร็จ", "ตรวจสอบแล้ว", "กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"];
var ROOM_OPTIONS = [
  "ม.1/3", "ม.1/8", "ม.1/13",
  "ม.2/2", "ม.2/7", "ม.2/12", "ม.2/17",
  "ม.3/6", "ม.3/11", "ม.3/16",
  "ม.4/1", "ม.4/5", "ม.4/10", "ม.4/15",
  "ม.5/4", "ม.5/9", "ม.5/14",
  "ม.6/1", "ม.6/12", "ม.6/13"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ status: "error", message: "The sheet is busy. Please try again." });
  }

  try {
    var sheet = getOrCreateSheet();
    var columns = getColumnMap(sheet);
    var rawData = e.postData ? e.postData.contents : "{}";
    var data = {};
    
    try {
      data = JSON.parse(rawData);
    } catch (parseErr) {
      data = e.parameter || {};
    }

    var email = (data.email || "").toString().trim().toLowerCase();
    var studentNumber = (data.studentNumber || data.studentNo || "").toString().replace(/\s+/g, "").trim();
    var room = (data.room || data.classRoom || "").toString().trim();
    var originalStudentNumber = (data.originalStudentNumber || "").toString().replace(/\s+/g, "").trim();
    var originalRoom = (data.originalRoom || "").toString().trim();
    var name = (data.name || "").toString().trim().toUpperCase();
    var number = (data.number || "").toString().trim();
    var size = (data.size || "L").toString().trim().toUpperCase();
    var slipImage = typeof data.slipImage === "string" ? data.slipImage : "";
    var timestamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

    if (!studentNumber || !room) {
      return createJsonResponse({
        status: "error",
        message: "Required fields: studentNumber and room"
      });
    }

    if (!/^[0-9]{1,3}[ก-ฮ]?$/.test(studentNumber)) {
      return createJsonResponse({ status: "error", message: "Student number must be 1-3 digits, with an optional Thai class suffix." });
    }

    if (!/^[0-9]{1,2}$/.test(number)) {
      return createJsonResponse({ status: "error", message: "Jersey number must be 1-2 digits." });
    }

    if (ROOM_OPTIONS.indexOf(room) < 0) {
      return createJsonResponse({ status: "error", message: "Please select a valid classroom." });
    }

    var values = sheet.getDataRange().getValues();
    var foundRowIndex = -1;
    var existingEmail = "";

    // Keep email-based matching for older clients, then use the original student key for edits.
    if (email) {
      for (var i = 1; i < values.length; i++) {
        var rowEmail = (values[i][columns["Email"] - 1] || "").toString().trim().toLowerCase();
        if (rowEmail === email) {
          foundRowIndex = i + 1;
          existingEmail = rowEmail;
          break;
        }
      }
    }

    if (foundRowIndex < 0 && originalStudentNumber && originalRoom) {
      for (var j = 1; j < values.length; j++) {
        var oldNumber = (values[j][columns["Student No."] - 1] || "").toString();
        var oldRoom = (values[j][columns["Room"] - 1] || "").toString();
        if (normalizeStudentNumberKey(oldNumber) === normalizeStudentNumberKey(originalStudentNumber)
          && normalizeRoomKey(oldRoom) === normalizeRoomKey(originalRoom)) {
          foundRowIndex = j + 1;
          existingEmail = (values[j][columns["Email"] - 1] || "").toString().trim().toLowerCase();
          break;
        }
      }
    }

    if (foundRowIndex < 0) {
      for (var k = 1; k < values.length; k++) {
        var currentNumber = (values[k][columns["Student No."] - 1] || "").toString();
        var currentRoom = (values[k][columns["Room"] - 1] || "").toString();
        if (normalizeStudentNumberKey(currentNumber) === normalizeStudentNumberKey(studentNumber)
          && normalizeRoomKey(currentRoom) === normalizeRoomKey(room)) {
          foundRowIndex = k + 1;
          existingEmail = (values[k][columns["Email"] - 1] || "").toString().trim().toLowerCase();
          break;
        }
      }
    }

    var slipOwnerKey = email || existingEmail
      || ("room_" + room.replace(/^ม\./, "").replace(/\//g, "_") + "_no_" + studentNumber);

    var status = foundRowIndex > 0
      ? values[foundRowIndex - 1][columns["Status"] - 1] || "รอชำระเงิน"
      : "รอชำระเงิน";
    var slipFormula = "";
    if (slipImage) {
      if (LOCKED_PAYMENT_STATUSES.indexOf(status) !== -1) {
        return createJsonResponse({ status: "error", message: "Payment has already been reviewed." });
      }
      var slipFileId = saveSlipToDrive(slipImage, slipOwnerKey);
      if (!slipFileId) {
        return createJsonResponse({ status: "error", message: "Unable to save the payment slip." });
      }
      var slipCode = normalizeSlipCode(data.slipCode) || generateSlipCode();
      PropertiesService.getScriptProperties().setProperty(slipCodeProperty(slipFileId), slipCode);
      slipFormula = '=HYPERLINK("' + slipDriveUrl(slipFileId) + '","เปิดสลิป")';
      status = "รอตรวจสอบสลิป";
    }

    if (foundRowIndex > 0) {
      // UPDATE existing row
      sheet.getRange(foundRowIndex, columns["Timestamp"]).setValue(timestamp);
      if (email) sheet.getRange(foundRowIndex, columns["Email"]).setValue(email);
      sheet.getRange(foundRowIndex, columns["Student No."]).setValue(studentNumber);
      sheet.getRange(foundRowIndex, columns["Room"]).setValue(room);
      sheet.getRange(foundRowIndex, columns["Screen Name"]).setValue(name);
      var screenNumberCell = sheet.getRange(foundRowIndex, columns["Screen Number"]);
      screenNumberCell.setNumberFormat("@");
      screenNumberCell.setValue(number);
      sheet.getRange(foundRowIndex, columns["Size"]).setValue(size);
      
      if (slipFormula) {
        sheet.getRange(foundRowIndex, columns["Payment Slip"]).setFormula(slipFormula);
      }
      sheet.getRange(foundRowIndex, columns["Status"]).setValue(status);
      SpreadsheetApp.flush();

      return createJsonResponse({
        status: "success",
        action: "updated",
        message: "อัปเดตคำสั่งจองเรียบร้อยแล้ว",
        row: foundRowIndex,
        data: {
          timestamp: timestamp,
          studentNumber: studentNumber,
          room: room,
          name: name,
          number: number,
          size: size,
          status: status
        }
      });

    } else {
      // APPEND new row
      var newRow = new Array(sheet.getLastColumn()).fill("");
      newRow[columns["Timestamp"] - 1] = timestamp;
      newRow[columns["Email"] - 1] = email;
      newRow[columns["Student No."] - 1] = studentNumber;
      newRow[columns["Room"] - 1] = room;
      newRow[columns["Screen Name"] - 1] = name;
      newRow[columns["Screen Number"] - 1] = number;
      newRow[columns["Size"] - 1] = size;
      newRow[columns["Payment Slip"] - 1] = slipFormula || "⏳ ยังไม่แนบสลิป";
      newRow[columns["Status"] - 1] = status;
      
      var newRowIndex = sheet.getLastRow() + 1;
      sheet.getRange(newRowIndex, columns["Screen Number"]).setNumberFormat("@");
      sheet.getRange(newRowIndex, 1, 1, newRow.length).setValues([newRow]);
      SpreadsheetApp.flush();

      return createJsonResponse({
        status: "success",
        action: "created",
        message: "บันทึกการสั่งจองใหม่เรียบร้อยแล้ว",
        data: {
          timestamp: timestamp,
          studentNumber: studentNumber,
          room: room,
          name: name,
          number: number,
          size: size,
          status: status
        }
      });
    }

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || "";
    var email = (params.email || "").toString().trim().toLowerCase();
    var studentNumber = (params.studentNumber || params.studentNo || "").toString().replace(/\s+/g, "").trim();
    var room = (params.room || params.classRoom || "").toString().trim();
    var slipCode = normalizeSlipCode(params.slipCode);
    var isSlipRequest = action === "getSlip";

    if (action === "getImage") {
      return createJsonResponse({ status: "error", code: "slip_code_required" });
    }
    if (isSlipRequest && (!studentNumber || !room || !slipCode)) {
      return createJsonResponse({ status: "error", code: "slip_code_required" });
    }

    if (action === "ping") {
      return createJsonResponse({
        status: "ok",
        message: "Authong Athletics Official Store GAS Backend is active!",
        slipViewVersion: 1,
        spreadsheetId: SPREADSHEET_ID,
        timestamp: new Date().toISOString()
      });
    }

    var sheet = getOrCreateSheet();
    var columns = getColumnMap(sheet);
    var values = sheet.getDataRange().getValues();

    if (isSlipRequest || (action === "search" && (email || (studentNumber && room)))) {
      for (var i = 1; i < values.length; i++) {
        var rowEmail = (values[i][columns["Email"] - 1] || "").toString().trim().toLowerCase();
        var rowStudentNumber = (values[i][columns["Student No."] - 1] || "").toString();
        var rowRoom = (values[i][columns["Room"] - 1] || "").toString();
        var matchesEmail = email && rowEmail === email;
        var matchesStudent = studentNumber && room
          && normalizeStudentNumberKey(rowStudentNumber) === normalizeStudentNumberKey(studentNumber)
          && normalizeRoomKey(rowRoom) === normalizeRoomKey(room);
        if (matchesStudent || (!isSlipRequest && matchesEmail)) {
          var slipFormula = sheet.getRange(i + 1, columns["Payment Slip"]).getFormula();
          var slip = getStoredSlip(slipFormula, values[i][columns["Payment Slip"] - 1]);
          var storedCode = slip.fileId
            ? normalizeSlipCode(PropertiesService.getScriptProperties().getProperty(slipCodeProperty(slip.fileId)))
            : "";
          var slipAvailable = Boolean(slip.fileId && storedCode);
          var slipCodeMatches = Boolean(slipAvailable && slipCode && slipCode === storedCode);
          if (isSlipRequest) {
            if (!slipCodeMatches) {
              return createJsonResponse({ status: "error", code: "invalid_slip_code" });
            }
            return getStoredSlipImage(slip.fileId);
          }
          
          return createJsonResponse({
            status: "success",
            found: true,
            data: {
              timestamp: values[i][columns["Timestamp"] - 1],
              studentNumber: (values[i][columns["Student No."] - 1] || "").toString(),
              room: (values[i][columns["Room"] - 1] || "").toString(),
              name: values[i][columns["Screen Name"] - 1],
              number: (values[i][columns["Screen Number"] - 1] || "").toString(),
              size: values[i][columns["Size"] - 1] || "L",
              hasSlip: slip.exists,
              slipAvailable: slipAvailable,
              slipCodeMatches: slipCodeMatches,
              status: values[i][columns["Status"] - 1] || ""
            }
          });
        }
      }

      if (isSlipRequest) {
        return createJsonResponse({ status: "error", code: "invalid_slip_code" });
      }
      return createJsonResponse({
        status: "success",
        found: false,
        message: "Student record not found"
      });
    }

    if (action === "list") {
      var orders = [];
      var slipFormulas = values.length > 1
        ? sheet.getRange(2, columns["Payment Slip"], values.length - 1, 1).getFormulas()
        : [];
      for (var j = 1; j < values.length; j++) {
        if (values[j][columns["Student No."] - 1] || values[j][columns["Email"] - 1]) {
          orders.push({
            timestamp: values[j][columns["Timestamp"] - 1],
            studentNumber: (values[j][columns["Student No."] - 1] || "").toString(),
            room: (values[j][columns["Room"] - 1] || "").toString(),
            name: values[j][columns["Screen Name"] - 1],
            number: values[j][columns["Screen Number"] - 1],
            size: values[j][columns["Size"] - 1] || "L",
            hasSlip: getStoredSlip(slipFormulas[j - 1][0], values[j][columns["Payment Slip"] - 1]).exists,
            status: values[j][columns["Status"] - 1] || ""
          });
        }
      }
      return createJsonResponse({
        status: "success",
        total: orders.length,
        orders: orders
      });
    }

    return createJsonResponse({
      status: "success",
      message: "Authong Official Store API Ready",
      spreadsheetId: SPREADSHEET_ID
    });

  } catch (error) {
    if (isSlipRequest) return createJsonResponse({ status: "error", code: "slip_unavailable" });
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

function getStoredSlip(formula, cellValue) {
  var formulaUrl = /^=\s*(?:IMAGE|HYPERLINK)\s*\(\s*"([^"]+)"/i.exec(formula);
  var url = formulaUrl ? formulaUrl[1] : typeof cellValue === "string" ? cellValue.trim() : "";
  var fileId = "";
  if (/^https:\/\/drive\.google\.com\//i.test(url)) {
    var match = /\/file\/d\/([\w-]{10,})(?=[/?#]|$)/.exec(url) || /[?&]id=([\w-]{10,})(?=[&#]|$)/.exec(url);
    if (match) fileId = match[1];
  }
  var isImage = /^=\s*IMAGE\s*\(/i.test(formula) ||
    Boolean(cellValue && typeof cellValue.getContentUrl === "function");
  return { fileId: fileId, exists: Boolean(fileId || isImage) };
}

function getStoredSlipImage(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    if (!file.isTrashed()) {
      var parents = file.getParents();
      while (parents.hasNext()) {
        if (parents.next().getName() !== DRIVE_FOLDER_NAME) continue;
        var blob = file.getBlob();
        var mime = blob.getContentType();
        if (/^image\/(?:jpeg|png|webp|gif)$/i.test(mime)) {
          return createJsonResponse({
            status: "success",
            image: "data:" + mime + ";base64," + Utilities.base64Encode(blob.getBytes())
          });
        }
        break;
      }
    }
  } catch (error) {
    Logger.log("Unable to load a stored payment slip.");
  }
  return createJsonResponse({ status: "error", code: "slip_unavailable" });
}

function normalizeSlipCode(value) {
  var code = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(code) ? code : "";
}

function generateSlipCode() {
  return Utilities.getUuid().replace(/-/g, "").toLowerCase();
}

function slipCodeProperty(fileId) {
  return "SLIP_VIEW_CODE_" + fileId;
}

function slipDriveUrl(fileId) {
  return "https://drive.google.com/file/d/" + fileId + "/view";
}

// Run from the Apps Script editor to create a private report of slip links.
// Share each link only with the order's owner.
function prepareExistingSlipCodes() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var reportRows = [["เลขที่", "ห้อง", "เปิดสลิปในเว็บ", "ลิงก์ Drive สำหรับผู้ดูแล"]];
  var added = {};
  try {
    var sheet = getOrCreateSheet();
    var columns = getColumnMap(sheet);
    var rowCount = sheet.getLastRow() - 1;
    if (rowCount < 1) return;
    var slipRange = sheet.getRange(2, columns["Payment Slip"], rowCount, 1);
    var formulas = slipRange.getFormulas();
    var orders = sheet.getDataRange().getValues();
    var properties = PropertiesService.getScriptProperties();
    var existing = properties.getProperties();
    for (var i = 0; i < rowCount; i++) {
      var order = orders[i + 1];
      var student = String(order[columns["Student No."] - 1] || "");
      var room = String(order[columns["Room"] - 1] || "");
      var slip = getStoredSlip(formulas[i][0], order[columns["Payment Slip"] - 1]);
      if (!student || !room || !slip.fileId) continue;
      var key = slipCodeProperty(slip.fileId);
      var code = normalizeSlipCode(existing[key]) || added[key];
      if (!code) code = added[key] = generateSlipCode();
      var url = "https://authong.store/#slip=" + code + "&no=" + encodeURIComponent(student) + "&room=" + encodeURIComponent(room);
      reportRows.push([student, room, '=HYPERLINK("' + url + '","เปิดรูปสลิป")', slipDriveUrl(slip.fileId)]);
    }
    if (Object.keys(added).length) properties.setProperties(added);
  } finally {
    lock.releaseLock();
  }

  if (reportRows.length < 2) {
    Logger.log("No saved slip links were found.");
    return;
  }
  var report = SpreadsheetApp.create("Authong - ลิงก์เปิดสลิป (ส่วนตัว)", reportRows.length, 4);
  if (DriveApp.getFileById(report.getId()).getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw new Error("The slip report must be restricted before writing links.");
  }
  var tab = report.getSheets()[0];
  tab.getRange(2, 1, reportRows.length - 1, 2).setNumberFormat("@");
  tab.getRange(1, 1, reportRows.length, 4).setValues(reportRows);
  tab.setFrozenRows(1);
  tab.setColumnWidth(3, 170);
  tab.setColumnWidth(4, 440);
  Logger.log("ไฟล์ลิงก์เปิดสลิปส่วนตัว: " + report.getUrl());
  return report.getUrl();
}

function getOrCreateSheet() {
  var doc;
  try {
    if (SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID") {
      doc = SpreadsheetApp.openById(SPREADSHEET_ID);
    } else {
      doc = SpreadsheetApp.getActiveSpreadsheet();
    }
  } catch (err) {
    doc = SpreadsheetApp.getActiveSpreadsheet();
  }
  
  var sheet = doc.getSheetByName(SHEET_NAME) || doc.getActiveSheet();
  
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  } else {
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    var emailIndex = existingHeaders.indexOf("Email");
    var nameIndex = existingHeaders.indexOf("Screen Name");
    var hasStudentNumber = existingHeaders.indexOf("Student No.") >= 0;
    var hasRoom = existingHeaders.indexOf("Room") >= 0;

    // Preserve legacy rows by adding the new fields between Email and Screen Name.
    if (!hasStudentNumber && !hasRoom && emailIndex >= 0 && nameIndex === emailIndex + 1) {
      var insertAt = nameIndex + 1;
      sheet.insertColumnsBefore(insertAt, 2);
      sheet.getRange(1, insertAt, 1, 2).setValues([["Student No.", "Room"]]);
    } else {
      if (!hasStudentNumber) {
        var studentColumn = sheet.getLastColumn() + 1;
        sheet.getRange(1, studentColumn).setValue("Student No.");
      }
      if (!hasRoom) {
        var roomColumn = sheet.getLastColumn() + 1;
        sheet.getRange(1, roomColumn).setValue("Room");
      }
    }
  }

  var columns = getColumnMap(sheet);
  var headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4c1d95");
  headerRange.setFontColor("#ffffff");
  headerRange.setHorizontalAlignment("center");

  sheet.setColumnWidth(columns["Timestamp"], 170);
  sheet.setColumnWidth(columns["Email"], 220);
  sheet.setColumnWidth(columns["Student No."], 100);
  sheet.setColumnWidth(columns["Room"], 100);
  sheet.setColumnWidth(columns["Screen Name"], 160);
  sheet.setColumnWidth(columns["Screen Number"], 120);
  sheet.setColumnWidth(columns["Size"], 80);
  sheet.setColumnWidth(columns["Payment Slip"], 150);
  sheet.setColumnWidth(columns["Status"], 140);

  // Keep leading zeroes such as 08 in the student number column.
  sheet.getRange(2, columns["Student No."], Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  // Jersey numbers are text too, so values like 01 remain unchanged in Sheets.
  sheet.getRange(2, columns["Screen Number"], Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  
  // Setup Data Validation for Status column.
  var statusColumn = sheet.getRange(2, columns["Status"], Math.max(sheet.getMaxRows() - 1, 1), 1);
  var statusOptions = [
    "รอชำระเงิน",
    "รอตรวจสอบสลิป", 
    "ชำระเงินแล้ว",
    "กำลังผลิต",
    "จัดส่งแล้ว",
    "เสร็จสิ้น",
    "ยกเลิก"
  ];
  
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusOptions, true)
    .setAllowInvalid(false)
    .build();
  
  statusColumn.setDataValidation(rule);
  
  return sheet;
}

function getColumnMap(sheet) {
  var headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var columns = {};
  headerValues.forEach(function(header, index) {
    if (header) columns[header.toString().trim()] = index + 1;
  });
  return columns;
}

function normalizeStudentNumberKey(value) {
  var text = (value || "").toString().replace(/\s+/g, "").trim();
  var match = text.match(/^0*([0-9]+)([ก-ฮ]?)$/);
  if (!match) return text;
  return String(parseInt(match[1], 10)) + match[2];
}

function normalizeRoomKey(value) {
  var text = (value || "").toString().trim();
  return /^[1-6]\/\d{1,2}$/.test(text) ? "ม." + text : text;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * บันทึกรูปสลิป (Base64) ลง Google Drive
 * @param {string} base64Data - Base64 encoded image (data:image/jpeg;base64,...)
 * @param {string} ownerKey - Student or email key for naming the uploaded file
 * @return {string|null} รหัสไฟล์ใน Drive หรือ null ถ้าบันทึกไม่สำเร็จ
 */
function saveSlipToDrive(base64Data, ownerKey) {
  try {
    ownerKey = (ownerKey || "student").toString().trim();
    var image = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/i.exec(base64Data);
    if (!image) return null;
    var extension = image[1].split("/")[1].toLowerCase();
    var fileName = "slip_" + ownerKey.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Utilities.getUuid() + "." + extension;
    var blob = Utilities.newBlob(Utilities.base64Decode(image[2]), image[1], fileName);
    var file = getOrCreateFolder().createFile(blob);
    return file.getId();
  } catch (error) {
    Logger.log('Error saving slip to Drive: ' + error.toString());
    return null;
  }
}

/**
 * หาหรือสร้างโฟลเดอร์ใน Google Drive สำหรับเก็บสลิป
 */
function getOrCreateFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  while (folders.hasNext()) {
    var existing = folders.next();
    if (existing.getSharingAccess() === DriveApp.Access.PRIVATE) return existing;
  }
  var folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw new Error("The slip folder must be restricted.");
  }
  folder.setDescription('โฟลเดอร์เก็บสลิปการโอนเงินจากระบบจองเสื้อทีมสีม่วง 2026');
  return folder;
}

/**
 * ฟังก์ชันช่วยทดสอบการบันทึกรูป
 */
function testSaveSlip() {
  // ตัวอย่าง base64 ขนาดเล็กสำหรับทดสอบ (1x1 pixel red PNG)
  var testData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  var fileId = saveSlipToDrive(testData, 'test@example.com');
  Logger.log('Test slip URL: ' + (fileId ? slipDriveUrl(fileId) : 'upload failed'));
  return url;
}
