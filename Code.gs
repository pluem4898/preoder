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

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

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
    var studentNumber = (data.studentNumber || "").toString().trim();
    var room = (data.room || "").toString().trim();
    var name = (data.name || "").toString().trim().toUpperCase();
    var number = (data.number || "").toString().trim();
    var size = (data.size || "L").toString().trim().toUpperCase();
    var slipImage = data.slipImage || "";
    var slipUrl = data.slipUrl || ""; // URL ของรูปที่อัปโหลดไว้แล้ว
    var status = data.status || (data.slipImage || data.slipUrl ? "รอตรวจสอบสลิป" : "รอชำระเงิน");
    var timestamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

    if (!email || !studentNumber || !room) {
      return createJsonResponse({
        status: "error",
        message: "Required fields: email, studentNumber, and room"
      });
    }

    if (!/^\d{1,3}$/.test(studentNumber)) {
      return createJsonResponse({ status: "error", message: "Student number must be 1-3 digits" });
    }

    var values = sheet.getDataRange().getValues();
    var foundRowIndex = -1;

    for (var i = 1; i < values.length; i++) {
      var rowEmail = (values[i][columns["Email"] - 1] || "").toString().trim().toLowerCase();
      if (rowEmail === email) {
        foundRowIndex = i + 1;
        break;
      }
    }

    if (foundRowIndex > 0) {
      // UPDATE existing row
      sheet.getRange(foundRowIndex, columns["Timestamp"]).setValue(timestamp);
      sheet.getRange(foundRowIndex, columns["Student No."]).setValue(studentNumber);
      sheet.getRange(foundRowIndex, columns["Room"]).setValue(room);
      sheet.getRange(foundRowIndex, columns["Screen Name"]).setValue(name);
      sheet.getRange(foundRowIndex, columns["Screen Number"]).setValue(number);
      sheet.getRange(foundRowIndex, columns["Size"]).setValue(size);
      
      var slipCell = sheet.getRange(foundRowIndex, columns["Payment Slip"]);
      var currentSlipValue = slipCell.getValue();
      var currentSlipFormula = slipCell.getFormula();
      
      // กรณีที่ 1: มีรูปสลิป base64 ใหม่ = อัปโหลดใหม่
      if (slipImage && slipImage.indexOf('data:image') === 0) {
        var imageUrl = saveSlipToDrive(slipImage, email);
        if (imageUrl) {
          slipCell.setFormula('=IMAGE("' + imageUrl + '", 4, 100, 100)');
          sheet.setRowHeight(foundRowIndex, 110);
        } else {
          slipCell.setValue("✅ มีสลิป (บันทึกไม่สำเร็จ)");
        }
      } 
      // กรณีที่ 2: ส่ง URL เดิมมา (ไม่ต้องอัปโหลดใหม่)
      else if (slipUrl && slipUrl.length > 0 && slipUrl.indexOf('http') === 0) {
        slipCell.setFormula('=IMAGE("' + slipUrl + '", 4, 100, 100)');
        sheet.setRowHeight(foundRowIndex, 110);
      }
      // กรณีที่ 3: ไม่ได้ส่งอะไรมา แต่ไม่มีรูปเดิม = ตั้งเป็นยังไม่แนบ
      else if ((!slipImage || slipImage === "") && (!slipUrl || slipUrl === "") && !currentSlipFormula && currentSlipValue.indexOf('IMAGE') < 0) {
        slipCell.setValue("⏳ ยังไม่แนบสลิป");
      }
      // กรณีอื่นๆ = เก็บค่าเดิมไว้ (ไม่ทำอะไร)
      
      sheet.getRange(foundRowIndex, columns["Status"]).setValue(status);

      return createJsonResponse({
        status: "success",
        action: "updated",
        message: "อัปเดตคำสั่งจองเรียบร้อยแล้ว",
        row: foundRowIndex,
        data: {
          timestamp: timestamp,
          email: email,
          studentNumber: studentNumber,
          room: room,
          name: name,
          number: number,
          size: size,
          slipUrl: slipUrl || (slipImage ? "uploaded" : ""),
          hasSlip: (slipImage || slipUrl) ? "มีสลิป" : "ยังไม่แนบ",
          status: status
        }
      });

    } else {
      // APPEND new row
      var slipStatus = "⏳ ยังไม่แนบสลิป";
      var slipFormula = "";
      var imageUrl = null;
      
      if (slipImage && slipImage.indexOf('data:image') === 0) {
        imageUrl = saveSlipToDrive(slipImage, email);
        if (imageUrl) {
          slipFormula = '=IMAGE("' + imageUrl + '", 4, 100, 100)';
        } else {
          slipStatus = "✅ มีสลิป (บันทึกไม่สำเร็จ)";
        }
      } else if (slipImage && slipImage.length > 10) {
        slipStatus = "✅ มีสลิปแนบแล้ว";
      }
      
      var newRow = new Array(sheet.getLastColumn()).fill("");
      newRow[columns["Timestamp"] - 1] = timestamp;
      newRow[columns["Email"] - 1] = email;
      newRow[columns["Student No."] - 1] = studentNumber;
      newRow[columns["Room"] - 1] = room;
      newRow[columns["Screen Name"] - 1] = name;
      newRow[columns["Screen Number"] - 1] = number;
      newRow[columns["Size"] - 1] = size;
      newRow[columns["Payment Slip"] - 1] = slipFormula || slipStatus;
      newRow[columns["Status"] - 1] = status;
      
      sheet.appendRow(newRow);
      
      // Set row height for image display
      if (slipFormula) {
        var lastRow = sheet.getLastRow();
        sheet.setRowHeight(lastRow, 110);
      }

      return createJsonResponse({
        status: "success",
        action: "created",
        message: "บันทึกการสั่งจองใหม่เรียบร้อยแล้ว",
        data: {
          timestamp: timestamp,
          email: email,
          studentNumber: studentNumber,
          room: room,
          name: name,
          number: number,
          size: size,
          slipUrl: slipFormula ? imageUrl : "",
          hasSlip: slipFormula ? "มีสลิป" : "ยังไม่แนบ",
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
    var fileId = params.fileId || "";

    // NEW: Serve image from Drive as base64
    if (action === "getImage" && fileId) {
      try {
        var file = DriveApp.getFileById(fileId);
        var blob = file.getBlob();
        var base64 = Utilities.base64Encode(blob.getBytes());
        var mimeType = blob.getContentType();
        
        return createJsonResponse({
          status: "success",
          image: "data:" + mimeType + ";base64," + base64
        });
      } catch (driveErr) {
        return createJsonResponse({
          status: "error",
          message: "Cannot access file: " + driveErr.toString()
        });
      }
    }

    if (action === "ping") {
      return createJsonResponse({
        status: "ok",
        message: "Authong Athletics Official Store GAS Backend is active!",
        spreadsheetId: SPREADSHEET_ID,
        timestamp: new Date().toISOString()
      });
    }

    var sheet = getOrCreateSheet();
    var columns = getColumnMap(sheet);
    var values = sheet.getDataRange().getValues();

    if (action === "search" && email) {
      for (var i = 1; i < values.length; i++) {
        var rowEmail = (values[i][columns["Email"] - 1] || "").toString().trim().toLowerCase();
        if (rowEmail === email) {
          // Extract slipUrl from IMAGE formula if exists
          var slipCellValue = values[i][columns["Payment Slip"] - 1] || "";
          var slipUrl = "";
          
          if (slipCellValue.toString().indexOf('=IMAGE("') === 0) {
            // Extract URL from =IMAGE("url", 4, 100, 100)
            var matches = slipCellValue.toString().match(/=IMAGE\("([^"]+)"/);
            if (matches && matches[1]) {
              slipUrl = matches[1];
            }
          }
          
          return createJsonResponse({
            status: "success",
            found: true,
            data: {
              timestamp: values[i][columns["Timestamp"] - 1],
              email: values[i][columns["Email"] - 1],
              studentNumber: (values[i][columns["Student No."] - 1] || "").toString(),
              room: (values[i][columns["Room"] - 1] || "").toString(),
              name: values[i][columns["Screen Name"] - 1],
              number: (values[i][columns["Screen Number"] - 1] || "").toString(),
              size: values[i][columns["Size"] - 1] || "L",
              hasSlip: slipUrl ? "มีสลิป" : (slipCellValue.toString().indexOf('✅') >= 0 ? "มีสลิป" : "ยังไม่แนบสลิป"),
              slipUrl: slipUrl,
              status: values[i][columns["Status"] - 1] || ""
            }
          });
        }
      }

      return createJsonResponse({
        status: "success",
        found: false,
        message: "Email not found"
      });
    }

    if (action === "list") {
      var orders = [];
      for (var j = 1; j < values.length; j++) {
        if (values[j][columns["Email"] - 1]) {
          orders.push({
            timestamp: values[j][columns["Timestamp"] - 1],
            email: values[j][columns["Email"] - 1],
            studentNumber: (values[j][columns["Student No."] - 1] || "").toString(),
            room: (values[j][columns["Room"] - 1] || "").toString(),
            name: values[j][columns["Screen Name"] - 1],
            number: values[j][columns["Screen Number"] - 1],
            size: values[j][columns["Size"] - 1] || "L",
            hasSlip: values[j][columns["Payment Slip"] - 1] || "",
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
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
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

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * บันทึกรูปสลิป (Base64) ลง Google Drive
 * @param {string} base64Data - Base64 encoded image (data:image/jpeg;base64,...)
 * @param {string} email - Email สำหรับตั้งชื่อไฟล์
 * @return {string} URL ของรูปภาพที่บันทึกแล้ว หรือ null ถ้าไม่สำเร็จ
 */
function saveSlipToDrive(base64Data, email) {
  try {
    // แยก metadata และ base64 data
    var contentType = base64Data.split(',')[0].split(':')[1].split(';')[0];
    var base64String = base64Data.split(',')[1];
    
    // Decode base64 to binary
    var decoded = Utilities.base64Decode(base64String);
    
    // สร้างชื่อไฟล์ที่ไม่ซ้ำ
    var timestamp = new Date().getTime();
    var fileName = 'slip_' + email.replace(/[^a-zA-Z0-9]/g, '_') + '_' + timestamp + '.jpg';
    
    // สร้าง Blob
    var blob = Utilities.newBlob(decoded, contentType, fileName);
    
    // หาหรือสร้างโฟลเดอร์สำหรับเก็บสลิป
    var folder = getOrCreateFolder();
    
    // ลบไฟล์เก่าของ email เดียวกัน (ถ้ามี)
    deleteOldSlips(email, folder);
    
    // สร้างไฟล์ใหม่
    var file = folder.createFile(blob);
    
    // ตั้งค่าให้ทุกคนที่มี link ดูได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่า URL สำหรับแสดงรูปใน Sheets
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
    
  } catch (error) {
    Logger.log('Error saving slip to Drive: ' + error.toString());
    return null;
  }
}

/**
 * ลบไฟล์สลิปเก่าของ email นี้ (ถ้ามี)
 */
function deleteOldSlips(email, folder) {
  try {
    var searchPattern = 'slip_' + email.replace(/[^a-zA-Z0-9]/g, '_');
    var files = folder.getFilesByName(searchPattern);
    
    // ถ้าไม่เจอด้วยชื่อแน่นอน ให้ลองหาทุกไฟล์ที่เริ่มต้นด้วย pattern
    if (!files.hasNext()) {
      var allFiles = folder.getFiles();
      while (allFiles.hasNext()) {
        var file = allFiles.next();
        if (file.getName().indexOf(searchPattern) === 0) {
          Logger.log('Deleting old slip: ' + file.getName());
          file.setTrashed(true);
        }
      }
    } else {
      // ลบไฟล์ที่เจอ
      while (files.hasNext()) {
        var file = files.next();
        Logger.log('Deleting old slip: ' + file.getName());
        file.setTrashed(true);
      }
    }
  } catch (error) {
    Logger.log('Error deleting old slips: ' + error.toString());
  }
}

/**
 * หาหรือสร้างโฟลเดอร์ใน Google Drive สำหรับเก็บสลิป
 */
function getOrCreateFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    // สร้างโฟลเดอร์ใหม่
    var folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
    folder.setDescription('โฟลเดอร์เก็บสลิปการโอนเงินจากระบบจองเสื้อทีมสีม่วง 2026');
    return folder;
  }
}

/**
 * ฟังก์ชันช่วยทดสอบการบันทึกรูป
 */
function testSaveSlip() {
  // ตัวอย่าง base64 ขนาดเล็กสำหรับทดสอบ (1x1 pixel red PNG)
  var testData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  var url = saveSlipToDrive(testData, 'test@example.com');
  Logger.log('Test slip URL: ' + url);
  return url;
}
