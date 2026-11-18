/** Authong Athletics preorder backend.
 * Run setupNewOrderSheets() once before deploying this file as a web app.
 * Existing Orders / LEGACY_ORDERS_ARCHIVE / ชีต1 rows are copied into the new views; the old tab is preserved.
 */
var SPREADSHEET_ID = '1WOI_8VSHi_6FIaifxPNuX7hTHEElSVKeR8InFHSQZLw';
var SLIP_FOLDER_NAME = 'Authong Preorder Slips 2026';
// Paste the OAuth Web Client ID here. It is public configuration, not a secret.
var GOOGLE_CLIENT_ID = '815743815680-3314m7scb7nkotsjn1vf68t1uvt69kbe.apps.googleusercontent.com';
var CATEGORY_NAMES = ['ORIGINAL', 'FOOTBALL', 'BASKETBALL', 'AUHISTORY'];
var CATEGORY_TITLES = {
  ORIGINAL: 'เสื้อคอลเลกชันต้นฉบับ',
  FOOTBALL: 'เสื้อคอลเลกชันฟุตบอล',
  BASKETBALL: 'เสื้อคอลเลกชันบาสเกตบอล',
  AUHISTORY: 'เสื้อคอลเลกชันประวัติอู่ทอง'
};
// Current site price is 279 baht for each collection. Change these values here if prices differ.
var PRICE_BY_CATEGORY = { ORIGINAL: 279, FOOTBALL: 279, BASKETBALL: 279, AUHISTORY: 279 };
var ORDER_HEADERS = [
  'Created At', 'Order ID', 'Customer ID', 'Customer Type', 'Collection', 'Product Name',
  'Shirt Name (Print)', 'Shirt Number (Print)', 'Size', 'Quantity', 'Unit Price', 'Line Total',
  'Student Number', 'Room', 'Customer Name', 'Phone', 'Delivery Method', 'Recipient Name',
  'Shipping Address', 'Postal Code', 'Slip Drive ID', 'Payment Slip', 'Payment Status',
  'Order Status', 'Admin Note'
];
var CUSTOMER_HEADERS = [
  'Customer ID', 'Customer Type', 'Student Number', 'Room', 'Full Name', 'Phone',
  'Delivery Method', 'Recipient Name', 'Shipping Address', 'Postal Code', 'Created At', 'Updated At'
];
var PAYMENT_HEADERS = [
  'Uploaded At', 'Payment ID', 'Order ID', 'Amount', 'Slip Drive ID', 'Payment Slip',
  'File Name', 'Payment Status', 'Reviewed At', 'Review Note'
];
var PAYMENT_STATUSES = ['รอชำระเงิน', 'รอตรวจสอบสลิป', 'ผ่าน', 'ส่งสลิปใหม่'];
var ORDER_STATUSES = ['รอชำระเงิน', 'รับออเดอร์แล้ว', 'กำลังผลิต', 'พร้อมรับ', 'จัดส่งแล้ว', 'เสร็จสิ้น', 'ยกเลิก'];
var ROOM_PATTERN = /^ม\.[1-6]\/(?:[1-9]|1[0-7])$/;
var NEW_STUDENT_PATTERN = /^(?:[1-9]|1[0-9]|20)[กข]$/;
var LEGACY_STUDENT_PATTERN = /^[0-9]{1,3}[ก-ฮ]?$/;

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || '');
    if (action === 'consumeGoogleProfile') return consumeGoogleProfile_(p);
    if (action === 'consumeCustomerUpdate') return consumeCustomerUpdate_(p);
    ensureWorkbook_();
    if (action === 'ping') {
      return createJsonResponse_({ status: 'success', message: 'Authong preorder is ready', allRooms: true });
    }
    if (action === 'search') {
      var found = findOrder_(p);
      return createJsonResponse_({
        status: 'success', found: Boolean(found), allRooms: true,
        data: found ? publicOrder_(found.order, found.sheet, p.slipCode) : null
      });
    }
    if (action === 'searchAll') {
      var orders = CATEGORY_NAMES.map(function(category) {
        var query = Object.assign({}, p, { category: category });
        var match = findOrder_(query);
        return match ? publicOrder_(match.order, match.sheet, p.slipCode) : null;
      }).filter(function(order) { return Boolean(order); });
      return createJsonResponse_({ status: 'success', allRooms: true, orders: orders });
    }
    if (action === 'getSlip') return getSlipResponse_(p);
    if (action === 'list') {
      var sheet = getSheet_('ORDERS_ALL');
      return createJsonResponse_({ status: 'success', total: Math.max(0, sheet.getLastRow() - 1) });
    }
    return createJsonResponse_({ status: 'success', message: 'Authong preorder API is ready', allRooms: true });
  } catch (err) {
    return createJsonResponse_({ status: 'error', message: String(err && err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return createJsonResponse_({ status: 'error', message: 'ระบบกำลังบันทึก กรุณาลองอีกครั้ง' });
  try {
    ensureWorkbook_();
    var data = parsePostData_(e);
    if (String(data.action || '') === 'googleProfile') return handleGoogleProfile_(data);
    if (String(data.action || '') === 'updateCustomer') return updateCustomerProfile_(data);
    var customer = data.customer || {};
    var type = String(data.customerType || customer.type || '');
    var category = String(data.category || '').toUpperCase();
    var studentNumber = String(customer.studentNumber || data.studentNumber || '').replace(/\s+/g, '').trim();
    var room = normalizeRoom_(customer.room || data.room || '');
    var fullName = String(customer.fullName || data.fullName || '').trim();
    var phone = normalizePhone_(customer.phone || data.phone || '');
    var printName = String(data.name || '').trim().toUpperCase();
    var jerseyNumber = String(data.number || '').trim();
    var size = String(data.size || '').trim().toUpperCase();
    var quantity = Math.floor(Number(data.quantity || 1));
    var deliveryMethod = String(customer.deliveryMethod || data.deliveryMethod || 'school_pickup');
    var recipient = String(customer.recipientName || data.recipientName || '').trim();
    var address = String(customer.address || data.address || '').trim();
    var postcode = String(customer.postalCode || data.postalCode || '').replace(/\s/g, '');
    var slipImage = typeof data.slipImage === 'string' ? data.slipImage : '';
    var googleClaims = null;

    if (type !== 'student' && type !== 'general') throw new Error('เลือกประเภทผู้สั่งจองก่อน');
    if (CATEGORY_NAMES.indexOf(category) < 0) throw new Error('ไม่พบคอลเลกชันเสื้อ');
    if (type === 'student') {
      if (!NEW_STUDENT_PATTERN.test(studentNumber) && !LEGACY_STUDENT_PATTERN.test(studentNumber)) throw new Error('เลขที่นักเรียนไม่ถูกต้อง');
      if (!ROOM_PATTERN.test(room)) throw new Error('ห้องเรียนไม่ถูกต้อง');
      if (deliveryMethod !== 'school_pickup') throw new Error('นักเรียนรับเสื้อที่โรงเรียนเท่านั้น');
    } else {
      if (!fullName || phone.length < 8) throw new Error('บุคคลทั่วไปต้องกรอกชื่อและเบอร์โทรศัพท์');
      googleClaims = verifyGoogleCredential_(data.googleCredential);
    }
    if (deliveryMethod !== 'school_pickup' && deliveryMethod !== 'shipping') throw new Error('เลือกรูปแบบรับเสื้อไม่ถูกต้อง');
    if (deliveryMethod === 'shipping' && (!address || !/^\d{5}$/.test(postcode))) {
      throw new Error('ข้อมูลจัดส่งไม่ครบ');
    }
    if (!printName || printName.length > 16) throw new Error('กรอกชื่อเสื้อไม่ถูกต้อง');
    if (!/^[0-9]{1,2}$/.test(jerseyNumber)) throw new Error('เบอร์เสื้อต้องเป็นตัวเลข 1-2 หลัก');
    if (['2S', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].indexOf(size) < 0) throw new Error('เลือกไซส์เสื้อ');
    if (quantity < 1 || quantity > 5) throw new Error('จำนวนเสื้อต้องอยู่ระหว่าง 1-5 ตัว');

    var customerId = makeCustomerId_(type, studentNumber, room, phone, googleClaims ? googleClaims.sub : '');
    var now = new Date();
    var timestamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    var orderId = String(data.orderId || '').trim() || makeOrderId_();
    var old = findOrderById_(orderId);
    var oldOrder = old ? old.order : null;
    var oldMap = headerMap_(ORDER_HEADERS);
    if (oldOrder) {
      var oldType = String(oldOrder[oldMap['Customer Type'] - 1] || 'student');
      var oldCategory = String(oldOrder[oldMap.Collection - 1] || 'ORIGINAL');
      var sameCustomer = oldType === type && (type === 'general'
        ? String(oldOrder[oldMap['Customer ID'] - 1] || '') === customerId
        : normalizeStudent_(oldOrder[oldMap['Student Number'] - 1]) === normalizeStudent_(studentNumber)
          && normalizeRoom_(oldOrder[oldMap.Room - 1]) === room);
      if (!sameCustomer || oldCategory !== category) {
        throw new Error('ไม่สามารถแก้ไขรายการนี้ได้ กรุณาค้นหารายการด้วยข้อมูลผู้สั่งและคอลเลกชันเดิม');
      }
    }
    var oldPaymentStatus = oldOrder ? String(oldOrder[oldMap['Payment Status'] - 1] || '') : '';
    var oldOrderStatus = oldOrder ? String(oldOrder[oldMap['Order Status'] - 1] || '') : '';
    if (slipImage && (isPaymentApproved_(oldPaymentStatus) || isPaymentApproved_(oldOrderStatus))) {
      throw new Error('รายการนี้ตรวจสลิปผ่านแล้ว หากต้องแก้ไขให้ติดต่อผู้ดูแล');
    }

    var customerRow = upsertCustomer_({
      customerId: customerId, type: type, studentNumber: studentNumber, room: room,
      fullName: fullName, phone: phone, deliveryMethod: deliveryMethod,
      recipient: recipient, address: address, postcode: postcode, timestamp: timestamp
    });

    var slipFileId = oldOrder ? String(oldOrder[oldMap['Slip Drive ID'] - 1] || '') : '';
    var slipLink = slipFileId ? 'https://drive.google.com/open?id=' + slipFileId : '';
    var slipCode = '';
    var paymentStatus = oldPaymentStatus || 'รอชำระเงิน';
    if (slipImage) {
      var savedFile = saveSlip_(slipImage, orderId);
      slipFileId = savedFile.id;
      slipLink = savedFile.url;
      slipCode = normalizeSlipCode_(data.slipCode) || Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
      PropertiesService.getScriptProperties().setProperty(slipPropertyKey_(slipFileId), slipCode);
      paymentStatus = 'รอตรวจสอบสลิป';
    }

    var orderStatus = oldOrder ? String(oldOrder[oldMap['Order Status'] - 1] || 'รอชำระเงิน') : 'รอชำระเงิน';
    if (slipImage && orderStatus === 'รอชำระเงิน') orderStatus = 'รับออเดอร์แล้ว';
    var order = {
      createdAt: oldOrder ? oldOrder[oldMap['Created At'] - 1] : timestamp,
      orderId: orderId, customerId: customerId, customerType: type, category: category,
      productName: CATEGORY_TITLES[category], printName: printName, jerseyNumber: jerseyNumber,
      size: size, quantity: quantity, unitPrice: PRICE_BY_CATEGORY[category],
      studentNumber: studentNumber, room: room, customerName: fullName || String(customer.studentName || '').trim(),
      phone: phone, deliveryMethod: deliveryMethod, recipient: recipient, address: address,
      postcode: postcode, slipFileId: slipFileId, slipLink: slipLink,
      paymentStatus: paymentStatus, orderStatus: orderStatus,
      adminNote: oldOrder ? String(oldOrder[oldMap['Admin Note'] - 1] || '') : ''
    };

    writeOrder_(getSheet_('ORDERS_ALL'), order);
    writeCategoryOrder_(getSheet_(category), order);
    if (old && String(old.order[oldMap['Collection'] - 1]) !== category) {
      removeOrderFromCategory_(String(old.order[oldMap['Collection'] - 1]), orderId);
    }
    if (slipImage) appendPayment_(order, data.slipFileName || 'payment-slip');
    SpreadsheetApp.flush();
    return createJsonResponse_({
      status: 'success', orderId: orderId, message: 'บันทึกคำสั่งซื้อแล้ว',
      data: publicOrder_(orderToRow_(order), getSheet_('ORDERS_ALL')),
      customerId: customerRow.customerId
    });
  } catch (err) {
    return createJsonResponse_({ status: 'error', message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function isPaymentApproved_(status) {
  var value = String(status || '').replace(/\s/g, '');
  return ['ผ่าน', 'ผ่านแล้ว', 'ชำระแล้ว', 'ชำระเงินแล้ว', 'ชำระเงินสำเร็จ', 'ตรวจสอบแล้ว', 'อนุมัติแล้ว', 'กำลังผลิต', 'พร้อมรับ', 'จัดส่งแล้ว', 'เสร็จสิ้น'].indexOf(value) >= 0;
}

function ensureWorkbook_() {
  ensureSheet_('CUSTOMERS', CUSTOMER_HEADERS);
  ensureSheet_('ORDERS_ALL', ORDER_HEADERS);
  ensureSheet_('PAYMENTS', PAYMENT_HEADERS);
  ensureSheet_('SUMMARY', ['รายการ', 'จำนวน']);
  CATEGORY_NAMES.forEach(function(name) { ensureSheet_(name, ORDER_HEADERS); });
  setupSummary_();
}

function setupNewOrderSheets() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureWorkbook_();
    var migrated = migrateLegacyOrders_();
    return 'พร้อมใช้งาน: CUSTOMERS, ORDERS_ALL, PAYMENTS, SUMMARY และ 4 คอลเลกชัน · นำเข้า/ซิงก์ข้อมูลเดิม ' + migrated + ' รายการ';
  } finally {
    lock.releaseLock();
  }
}

// Run this when you only want to synchronize legacy rows into the new tabs.
// It keeps the original Drive slip files and reuses their IDs and URLs.
function runLegacyMigrationOnly() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureWorkbook_();
    return 'ซิงก์ข้อมูลเดิมแล้ว ' + migrateLegacyOrders_() + ' รายการ (เก็บสลิปเดิมไว้ ไม่อัปโหลดซ้ำ)';
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(name, headers) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) sheet = getSpreadsheet_().insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0]
      .map(function(value) { return String(value).trim(); }).filter(Boolean);
    if (actual.join('\u001f') !== headers.join('\u001f')) {
      throw new Error('ชีต ' + name + ' มีหัวตารางไม่ตรง กรุณาตรวจสอบก่อนเขียนข้อมูล');
    }
  }
  styleHeader_(sheet, headers.length);
  if (['ORDERS_ALL'].concat(CATEGORY_NAMES).indexOf(name) >= 0) {
    var paymentRule = SpreadsheetApp.newDataValidation().requireValueInList(PAYMENT_STATUSES, true).setAllowInvalid(false).build();
    var orderRule = SpreadsheetApp.newDataValidation().requireValueInList(ORDER_STATUSES, true).setAllowInvalid(false).build();
    var availableRows = Math.max(sheet.getMaxRows() - 1, 1);
    sheet.getRange(2, 23, availableRows, 1).setDataValidation(paymentRule);
    sheet.getRange(2, 24, availableRows, 1).setDataValidation(orderRule);
  }
  return sheet;
}

function getSpreadsheet_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('ไม่พบชีต ' + name);
  return sheet;
}

function styleHeader_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setBackground('#4d2357').setFontColor('#ffffff')
    .setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 42);
  sheet.autoResizeColumns(1, width);
  if (sheet.getName() !== 'SUMMARY' && !sheet.getFilter()) {
    sheet.getRange(1, 1, sheet.getMaxRows(), width).createFilter();
  }
}

function setupSummary_() {
  var sheet = getSheet_('SUMMARY');
  sheet.getRange(2, 1, 4, 2).setValues([
    ['ออเดอร์ทั้งหมด', ''],
    ['จำนวนเสื้อทั้งหมด', ''],
    ['ยอดรวมทั้งหมด (บาท)', ''],
    ['สลิปรอตรวจ', '']
  ]);
  sheet.getRange('B2').setFormula('=COUNTA(ORDERS_ALL!B2:B)');
  sheet.getRange('B3').setFormula('=SUM(ORDERS_ALL!J2:J)');
  sheet.getRange('B4').setFormula('=SUM(ORDERS_ALL!L2:L)');
  sheet.getRange('B5').setFormula('=COUNTIF(ORDERS_ALL!W2:W,"รอตรวจสอบสลิป")');
  styleHeader_(sheet, 2);
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 160);
  sheet.getRange('B2:B5').setNumberFormat('#,##0');
}

function parsePostData_(e) {
  var text = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  try { return JSON.parse(text); } catch (_) { return (e && e.parameter) || {}; }
}

function handleGoogleProfile_(data) {
  var nonce = String(data.nonce || '');
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('คำขอลงชื่อเข้าใช้หมดอายุ กรุณาลองอีกครั้ง');
  var claims = verifyGoogleCredential_(data.credential);
  var customerId = makeCustomerId_('general', '', '', '', claims.sub);
  var sheet = getSheet_('CUSTOMERS');
  var rowIndex = findRowByValue_(sheet, 1, customerId);
  var row = rowIndex ? sheet.getRange(rowIndex, 1, 1, CUSTOMER_HEADERS.length).getDisplayValues()[0] : [];
  var profile = {
    customerId: customerId,
    found: Boolean(rowIndex),
    googleName: String(claims.name || ''),
    fullName: String(row[4] || claims.name || ''),
    phone: String(row[5] || ''),
    deliveryMethod: String(row[6] || 'school_pickup'),
    address: String(row[8] || ''),
    postalCode: String(row[9] || ''),
    sessionToken: issueGoogleSession_(claims.sub),
    sessionExpiresAt: Date.now() + (6 * 60 * 60 * 1000) - 60000
  };
  var cacheKey = 'AUTHONG_GOOGLE_PROFILE_' + nonce;
  CacheService.getScriptCache().put(cacheKey, JSON.stringify({ status: 'success', profile: profile }), 90);
  return createJsonResponse_({ status: 'accepted' });
}

function consumeGoogleProfile_(params) {
  var nonce = String(params.nonce || '');
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) return createJsonResponse_({ status: 'error', message: 'คำขอลงชื่อเข้าใช้ไม่ถูกต้อง' });
  var cache = CacheService.getScriptCache();
  var cacheKey = 'AUTHONG_GOOGLE_PROFILE_' + nonce;
  var result = cache.get(cacheKey);
  if (!result) return createJsonResponse_({ status: 'pending' });
  cache.remove(cacheKey);
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
}

function consumeCustomerUpdate_(params) {
  var nonce = String(params.nonce || '');
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) return createJsonResponse_({ status: 'error', message: 'คำขอบันทึกข้อมูลไม่ถูกต้อง' });
  var cache = CacheService.getScriptCache();
  var cacheKey = 'AUTHONG_CUSTOMER_UPDATE_' + nonce;
  var result = cache.get(cacheKey);
  if (!result) return createJsonResponse_({ status: 'pending' });
  cache.remove(cacheKey);
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
}

function issueGoogleSession_(subject) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('AUTHONG_GOOGLE_SESSION_' + token, String(subject), 21600);
  return token;
}

function updateCustomerProfile_(data) {
  var nonce = String(data.nonce || '');
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('คำขอบันทึกข้อมูลหมดอายุ กรุณาลองอีกครั้ง');
  var claims = verifyGoogleCredential_(data.googleCredential);
  var customerId = makeCustomerId_('general', '', '', '', claims.sub);
  if (data.customerId && String(data.customerId) !== customerId) throw new Error('บัญชี Google ไม่ตรงกับผู้ใช้');

  var customer = data.customer || {};
  var fullName = String(customer.fullName || '').trim();
  var phone = normalizePhone_(customer.phone || '');
  var deliveryMethod = String(customer.deliveryMethod || 'school_pickup');
  var address = String(customer.address || '').trim();
  var postcode = String(customer.postalCode || customer.postcode || '').replace(/\s/g, '');
  if (!fullName || phone.length < 8) throw new Error('กรุณากรอกชื่อและเบอร์โทรศัพท์ให้ถูกต้อง');
  if (deliveryMethod !== 'school_pickup' && deliveryMethod !== 'shipping') throw new Error('เลือกรูปแบบรับเสื้อไม่ถูกต้อง');
  if (deliveryMethod === 'shipping' && (!address || !/^\d{5}$/.test(postcode))) throw new Error('กรุณากรอกที่อยู่และรหัสไปรษณีย์ 5 หลัก');

  var timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  upsertCustomer_({
    customerId: customerId, type: 'general', studentNumber: '', room: '', fullName: fullName,
    phone: phone, deliveryMethod: deliveryMethod, recipient: '', address: address,
    postcode: postcode, timestamp: timestamp
  });
  var updatedOrders = updateGeneralOrderDelivery_(customerId, {
    fullName: fullName, phone: phone, deliveryMethod: deliveryMethod, address: address, postcode: postcode
  });
  var result = JSON.stringify({ status: 'success', customerId: customerId, updatedOrders: updatedOrders });
  CacheService.getScriptCache().put('AUTHONG_CUSTOMER_UPDATE_' + nonce, result, 90);
  return createJsonResponse_({ status: 'accepted' });
}

function updateGeneralOrderDelivery_(customerId, profile) {
  var updated = 0;
  ['ORDERS_ALL'].concat(CATEGORY_NAMES).forEach(function(name) {
    var sheet = getSheet_(name);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var rows = sheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
    rows.forEach(function(row, index) {
      if (String(row[2] || '') !== customerId || String(row[3] || '') !== 'general') return;
      var orderStatus = String(row[23] || '');
      if (['จัดส่งแล้ว', 'เสร็จสิ้น', 'ยกเลิก'].indexOf(orderStatus) >= 0) return;
      sheet.getRange(index + 2, 15, 1, 6).setValues([[
        profile.fullName, profile.phone, profile.deliveryMethod, '', profile.address, profile.postcode
      ]]);
      updated++;
    });
  });
  return updated;
}

function verifyGoogleCredential_(credential) {
  var token = String(credential || '');
  if (!GOOGLE_CLIENT_ID) throw new Error('ใส่ OAuth Web Client ID ใน Code.gs ก่อนเปิด Google Sign-In');
  if (/^[a-f0-9]{64}$/i.test(token)) {
    var subject = CacheService.getScriptCache().get('AUTHONG_GOOGLE_SESSION_' + token);
    if (!subject) throw new Error('การลงชื่อเข้าใช้หมดอายุ กรุณาลงชื่อเข้าใช้อีกครั้ง');
    return { sub: String(subject), name: '' };
  }
  if (token.length < 100 || token.length > 12000) throw new Error('ข้อมูลบัญชี Google ไม่ถูกต้อง');
  var parts = token.split('.');
  if (parts.length !== 3) throw new Error('ข้อมูลบัญชี Google ไม่ถูกต้อง');
  var claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString('UTF-8'));
  } catch (_) {
    throw new Error('อ่านข้อมูลบัญชี Google ไม่สำเร็จ');
  }

  var audience = String(claims.aud || '');
  var issuer = String(claims.iss || '');
  var subject = String(claims.sub || '');
  var expiry = Number(claims.exp || 0);
  if (audience !== GOOGLE_CLIENT_ID) throw new Error('บัญชี Google นี้ไม่ได้ลงชื่อเข้าใช้แอปนี้');
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(issuer) < 0) throw new Error('ผู้ออกบัญชี Google ไม่ถูกต้อง');
  if (!subject || !expiry || expiry <= Math.floor(Date.now() / 1000)) throw new Error('การลงชื่อเข้าใช้หมดอายุ กรุณาลองอีกครั้ง');

  var verificationUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token);
  var response = UrlFetchApp.fetch(verificationUrl, { method: 'get', muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Google ยืนยันบัญชีไม่สำเร็จ กรุณาลงชื่อเข้าใช้อีกครั้ง');
  var verified;
  try { verified = JSON.parse(response.getContentText()); }
  catch (_) { throw new Error('อ่านผลยืนยันบัญชี Google ไม่สำเร็จ'); }
  var verifiedAudience = String(verified.aud || verified.issued_to || '');
  var verifiedSubject = String(verified.sub || verified.user_id || '');
  if (verifiedAudience !== GOOGLE_CLIENT_ID || (verifiedSubject && verifiedSubject !== subject)) {
    throw new Error('ข้อมูลบัญชี Google ไม่ตรงกับแอป');
  }
  return { sub: subject, name: String(claims.name || '') };
}

function findOrder_(params) {
  var sheet = getSheet_('ORDERS_ALL');
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ORDER_HEADERS.length).getDisplayValues();
  var m = headerMap_(ORDER_HEADERS);
  var type = String(params.customerType || 'student');
  var category = String(params.category || '').toUpperCase();
  var wantedOrderId = String(params.orderId || '');
  var no = normalizeStudent_(params.studentNumber || params.studentNo || '');
  var room = normalizeRoom_(params.room || '');
  var phone = normalizePhone_(params.phone || '');
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    if (wantedOrderId && row[m['Order ID'] - 1] !== wantedOrderId) continue;
    if (category && row[m['Collection'] - 1] !== category) continue;
    if (type === 'general') {
      var customerId = String(params.customerId || '');
      if (customerId) {
        if (String(row[m['Customer ID'] - 1] || '') !== customerId) continue;
      } else if (!phone || normalizePhone_(row[m.Phone - 1]) !== phone) continue;
    } else {
      if (!no || !room || normalizeStudent_(row[m['Student Number'] - 1]) !== no
        || normalizeRoom_(row[m.Room - 1]) !== room) continue;
    }
    return { order: row, sheet: sheet };
  }
  return null;
}

function findOrderById_(orderId) {
  var sheet = getSheet_('ORDERS_ALL');
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ORDER_HEADERS.length).getValues();
  var idColumn = headerMap_(ORDER_HEADERS)['Order ID'] - 1;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][idColumn]) === orderId) return { rowIndex: i + 2, order: rows[i], sheet: sheet };
  }
  return null;
}

function publicOrder_(row, sheet, suppliedSlipCode) {
  var m = headerMap_(ORDER_HEADERS);
  var slipId = String(row[m['Slip Drive ID'] - 1] || '');
  var slipCode = slipId ? PropertiesService.getScriptProperties().getProperty(slipPropertyKey_(slipId)) : '';
  return {
    orderId: String(row[m['Order ID'] - 1] || ''), customerType: String(row[m['Customer Type'] - 1] || ''),
    category: String(row[m.Collection - 1] || ''), productTitle: String(row[m['Product Name'] - 1] || ''),
    name: String(row[m['Shirt Name (Print)'] - 1] || ''), number: String(row[m['Shirt Number (Print)'] - 1] || ''),
    size: String(row[m.Size - 1] || ''), quantity: Number(row[m.Quantity - 1] || 1),
    price: Number(row[m['Unit Price'] - 1] || 0), studentNumber: String(row[m['Student Number'] - 1] || ''),
    room: String(row[m.Room - 1] || ''), status: String(row[m['Order Status'] - 1] || ''),
    paymentStatus: String(row[m['Payment Status'] - 1] || ''), hasSlip: Boolean(slipId),
    slipAvailable: Boolean(slipId && slipCode),
    slipCodeMatches: Boolean(slipId && slipCode && normalizeSlipCode_(suppliedSlipCode) === slipCode)
  };
}

function writeOrder_(sheet, order) {
  var row = orderToRow_(order);
  var existing = findRowByValue_(sheet, 2, order.orderId);
  var rowIndex = existing || sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, ORDER_HEADERS.length).setValues([row]);
  sheet.getRange(rowIndex, 12).setFormula('=IF(OR(J' + rowIndex + '="",K' + rowIndex + '=""),"",J' + rowIndex + '*K' + rowIndex + ')');
  sheet.getRange(rowIndex, 8).setNumberFormat('@');
  sheet.getRange(rowIndex, 13).setNumberFormat('@');
  sheet.getRange(rowIndex, 20).setNumberFormat('@');
  if (order.slipLink) {
    sheet.getRange(rowIndex, 22).setFormula('=HYPERLINK("' + order.slipLink + '","เปิดสลิป")');
  } else {
    sheet.getRange(rowIndex, 22).setValue('');
  }
  return rowIndex;
}

// Collection tabs are intended for production and slip review. Keep contact and
// shipping details in CUSTOMERS / ORDERS_ALL, not in sheets shared with a shop.
function writeCategoryOrder_(sheet, sourceOrder) {
  var shopOrder = Object.assign({}, sourceOrder, {
    customerName: '', phone: '', recipient: '', address: '', postcode: ''
  });
  return writeOrder_(sheet, shopOrder);
}

function orderToRow_(o) {
  return [
    o.createdAt, o.orderId, o.customerId, o.customerType, o.category, o.productName,
    o.printName, String(o.jerseyNumber), o.size, Number(o.quantity), Number(o.unitPrice), '',
    String(o.studentNumber || ''), String(o.room || ''), o.customerName || '', o.phone || '',
    o.deliveryMethod, o.recipient || '', o.address || '', String(o.postcode || ''),
    o.slipFileId || '', '', o.paymentStatus, o.orderStatus, o.adminNote || ''
  ];
}

function findRowByValue_(sheet, column, value) {
  if (sheet.getLastRow() < 2) return 0;
  var found = sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(value)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function upsertCustomer_(c) {
  var sheet = getSheet_('CUSTOMERS');
  var rowIndex = findRowByValue_(sheet, 1, c.customerId);
  var oldCreated = rowIndex ? sheet.getRange(rowIndex, 11).getValue() : c.timestamp;
  var row = [c.customerId, c.type, c.studentNumber, c.room, c.fullName, c.phone,
    c.deliveryMethod, c.recipient, c.address, c.postcode, oldCreated, c.timestamp];
  if (!rowIndex) rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, CUSTOMER_HEADERS.length).setValues([row]);
  sheet.getRange(rowIndex, 3, 1, 1).setNumberFormat('@');
  sheet.getRange(rowIndex, 4, 1, 1).setNumberFormat('@');
  sheet.getRange(rowIndex, 6, 1, 1).setNumberFormat('@');
  sheet.getRange(rowIndex, 10, 1, 1).setNumberFormat('@');
  return { customerId: c.customerId };
}

function appendPayment_(order, fileName) {
  var sheet = getSheet_('PAYMENTS');
  var now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var row = [now, order.orderId + '-' + Utilities.getUuid().slice(0, 8), order.orderId,
    order.unitPrice * order.quantity, order.slipFileId, '', fileName,
    order.paymentStatus || 'รอตรวจสอบสลิป', order.paymentStatus === 'ผ่าน' ? now : '',
    order.paymentStatus === 'ผ่าน' ? 'นำเข้าจากข้อมูลเดิม' : ''];
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, PAYMENT_HEADERS.length).setValues([row]);
  if (order.slipLink) sheet.getRange(rowIndex, 6).setFormula('=HYPERLINK("' + order.slipLink + '","เปิดสลิป")');
  sheet.getRange(rowIndex, 4).setNumberFormat('#,##0.00');
}

function upsertLegacyPayment_(order, sourceTimestamp) {
  var sheet = getSheet_('PAYMENTS');
  var existingRow = findRowByValue_(sheet, 3, order.orderId);
  var rowIndex = existingRow || sheet.getLastRow() + 1;
  var paymentId = order.orderId + '-LEGACY';
  var status = order.paymentStatus || 'รอตรวจสอบสลิป';
  var row = [sourceTimestamp || order.createdAt, paymentId, order.orderId,
    Number(order.unitPrice) * Number(order.quantity), order.slipFileId, '',
    'สลิปจากรายการเดิม', status, status === 'ผ่าน' ? (sourceTimestamp || order.createdAt) : '',
    status === 'ผ่าน' ? 'นำเข้าจากข้อมูลเดิม' : ''];
  sheet.getRange(rowIndex, 1, 1, PAYMENT_HEADERS.length).setValues([row]);
  if (order.slipLink) {
    sheet.getRange(rowIndex, 6).setFormula('=HYPERLINK("' + order.slipLink + '","เปิดสลิป")');
  } else {
    sheet.getRange(rowIndex, 6).setValue('');
  }
  sheet.getRange(rowIndex, 4).setNumberFormat('#,##0.00');
  return rowIndex;
}

function removeOrderFromCategory_(category, orderId) {
  if (CATEGORY_NAMES.indexOf(category) < 0) return;
  var sheet = getSheet_(category);
  var row = findRowByValue_(sheet, 2, orderId);
  if (row) sheet.deleteRow(row);
}

function onEdit(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (['ORDERS_ALL'].concat(CATEGORY_NAMES).indexOf(name) < 0) return;
  var column = e.range.getColumn();
  if ([23, 24, 25].indexOf(column) < 0) return;
  var orderId = String(sheet.getRange(e.range.getRow(), 2).getDisplayValue());
  if (!orderId) return;
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return;
  try {
    var value = e.range.getValue();
    var masterRow = findRowByValue_(getSheet_('ORDERS_ALL'), 2, orderId);
    if (masterRow && name !== 'ORDERS_ALL') getSheet_('ORDERS_ALL').getRange(masterRow, column).setValue(value);
    CATEGORY_NAMES.forEach(function(category) {
      if (category === name) return;
      var row = findRowByValue_(getSheet_(category), 2, orderId);
      if (row) getSheet_(category).getRange(row, column).setValue(value);
    });
    if (column === 23) updatePaymentStatus_(orderId, value);
  } finally {
    lock.releaseLock();
  }
}

function updatePaymentStatus_(orderId, status) {
  var sheet = getSheet_('PAYMENTS');
  if (sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PAYMENT_HEADERS.length).getDisplayValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][2] === orderId) {
      sheet.getRange(i + 2, 8).setValue(status);
      if (status === 'ผ่าน') sheet.getRange(i + 2, 9).setValue(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'));
      break;
    }
  }
}

function getSlipResponse_(p) {
  var match = findOrder_(p);
  if (!match) return createJsonResponse_({ status: 'error', code: 'order_not_found' });
  var m = headerMap_(ORDER_HEADERS);
  var fileId = String(match.order[m['Slip Drive ID'] - 1] || '');
  var stored = fileId ? PropertiesService.getScriptProperties().getProperty(slipPropertyKey_(fileId)) : '';
  if (!fileId || !stored || normalizeSlipCode_(p.slipCode) !== stored) {
    return createJsonResponse_({ status: 'error', code: 'invalid_slip_code' });
  }
  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  return createJsonResponse_({ status: 'success', image: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
}

function saveSlip_(dataUrl, orderId) {
  var match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/i.exec(dataUrl);
  if (!match) throw new Error('ไฟล์สลิปต้องเป็น JPG, PNG หรือ WEBP');
  var bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 7 * 1024 * 1024) throw new Error('ไฟล์สลิปมีขนาดเกิน 7 MB');
  var extension = match[1].split('/')[1].toLowerCase();
  var fileName = 'slip_' + orderId.replace(/[^A-Za-z0-9-]/g, '_') + '_' + Utilities.getUuid() + '.' + extension;
  var file = getSlipFolder_().createFile(Utilities.newBlob(bytes, match[1], fileName));
  return { id: file.getId(), url: 'https://drive.google.com/open?id=' + file.getId() };
}

function getSlipFolder_() {
  var folders = DriveApp.getFoldersByName(SLIP_FOLDER_NAME);
  while (folders.hasNext()) {
    var folder = folders.next();
    if (folder.getSharingAccess() === DriveApp.Access.PRIVATE) return folder;
  }
  var created = DriveApp.createFolder(SLIP_FOLDER_NAME);
  created.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return created;
}

function migrateLegacyOrders_() {
  var doc = getSpreadsheet_();
  var source = null;
  var sourceNames = ['Orders', 'LEGACY_ORDERS_ARCHIVE', 'ชีต1'];
  for (var sourceIndex = 0; sourceIndex < sourceNames.length; sourceIndex++) {
    var candidate = doc.getSheetByName(sourceNames[sourceIndex]);
    if (candidate && candidate.getLastRow() > 1) { source = candidate; break; }
  }
  if (!source) return 0;
  var headers = source.getRange(1, 1, 1, source.getLastColumn()).getDisplayValues()[0].map(function(v) { return String(v).trim(); });
  var m = headerMap_(headers);
  var studentColumn = m['Student No.'] || m['Student Number'];
  var statusColumn = m.Status || m['Payment Status'];
  var requiredColumns = [studentColumn, m.Room, m['Screen Name'], m['Screen Number'], m.Size];
  if (requiredColumns.some(function(column) { return !column; })) {
    throw new Error('ย้ายข้อมูลไม่ได้: ตรวจหัวตาราง Student No., Room, Screen Name, Screen Number และ Size ในชีต Orders');
  }
  var rows = source.getDataRange().getDisplayValues();
  var migrated = 0;
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var number = String(r[studentColumn - 1] || '').trim();
    var room = normalizeRoom_(r[(m.Room || 0) - 1] || '');
    if (!number || !room) continue;
    var originalOrderId = String(r[(m['Order ID'] || 0) - 1] || '').trim();
    var orderId = originalOrderId || 'LEGACY-' + String(i + 1).padStart(5, '0');
    var customerId = makeCustomerId_('student', number, room, '');
    var timestamp = String(r[(m.Timestamp || 0) - 1] || '');
    var customerName = '';
    var customer = { customerId: customerId, type: 'student', studentNumber: number, room: room,
      fullName: customerName, phone: '', deliveryMethod: 'school_pickup', recipient: '', address: '', postcode: '', timestamp: timestamp || new Date() };
    upsertCustomer_(customer);
    var slipColumn = m['Payment Slip'] || 0;
    var slipLink = '';
    if (slipColumn) {
      var slipCell = source.getRange(i + 1, slipColumn);
      var formula = slipCell.getFormula();
      var richText = slipCell.getRichTextValue();
      slipLink = (/^=HYPERLINK\("([^"]+)"/i.exec(formula) || [])[1]
        || (richText && richText.getLinkUrl())
        || (/^https?:\/\//i.test(slipCell.getDisplayValue()) ? slipCell.getDisplayValue() : '');
    }
    var slipId = (/\/file\/d\/([A-Za-z0-9_-]+)/.exec(slipLink)
      || /[?&]id=([A-Za-z0-9_-]+)/.exec(slipLink)
      || [])[1] || '';
    var rawStatus = String(r[(statusColumn || 0) - 1] || '').trim();
    var paymentStatus = 'รอชำระเงิน';
    var orderStatus = 'รอชำระเงิน';
    if (['ชำระเงินแล้ว', 'ชำระเงินสำเร็จ', 'ผ่าน'].indexOf(rawStatus) >= 0) {
      paymentStatus = 'ผ่าน';
      orderStatus = 'รับออเดอร์แล้ว';
    } else if (rawStatus === 'รอตรวจสอบสลิป') {
      paymentStatus = 'รอตรวจสอบสลิป';
      orderStatus = 'รับออเดอร์แล้ว';
    } else if (rawStatus === 'ส่งสลิปใหม่') {
      paymentStatus = 'ส่งสลิปใหม่';
      orderStatus = 'รอชำระเงิน';
    } else if (ORDER_STATUSES.indexOf(rawStatus) >= 0) {
      orderStatus = rawStatus;
      paymentStatus = slipId ? 'รอตรวจสอบสลิป' : 'รอชำระเงิน';
    } else if (slipId) {
      paymentStatus = 'รอตรวจสอบสลิป';
      orderStatus = 'รับออเดอร์แล้ว';
    }
    var category = String(r[(m.Collection || m.Category || 0) - 1] || 'ORIGINAL').trim().toUpperCase();
    if (CATEGORY_NAMES.indexOf(category) < 0) category = 'ORIGINAL';
    var quantity = Math.max(1, Math.floor(Number(r[(m.Quantity || 0) - 1] || 1)));
    var unitPrice = Number(r[(m['Unit Price'] || m.Price || 0) - 1] || PRICE_BY_CATEGORY[category]);
    var order = {
      createdAt: timestamp || new Date(), orderId: orderId, customerId: customerId,
      customerType: 'student', category: category, productName: CATEGORY_TITLES[category],
      printName: String(r[(m['Screen Name'] || 0) - 1] || ''), jerseyNumber: String(r[(m['Screen Number'] || 0) - 1] || ''),
      size: String(r[(m.Size || 0) - 1] || 'L'), quantity: quantity, unitPrice: unitPrice,
      studentNumber: number, room: room, customerName: '', phone: '', deliveryMethod: 'school_pickup',
      recipient: '', address: '', postcode: '', slipFileId: slipId, slipLink: slipLink,
      paymentStatus: paymentStatus, orderStatus: orderStatus, adminNote: ''
    };
    // Upsert every related tab even when the order already exists. This makes
    // the migration recover safely after a timeout or a partial earlier run.
    writeOrder_(getSheet_('ORDERS_ALL'), order);
    writeCategoryOrder_(getSheet_(category), order);
    if (slipId) upsertLegacyPayment_(order, timestamp);
    migrated++;
  }
  return migrated;
}

function makeCustomerId_(type, studentNumber, room, phone, googleSub) {
  var key = type === 'student'
    ? 'student|' + normalizeStudent_(studentNumber) + '|' + normalizeRoom_(room)
    : googleSub ? 'google|' + String(googleSub) : 'general|' + normalizePhone_(phone);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key, Utilities.Charset.UTF_8);
  var hex = digest.map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 14).toUpperCase();
  return 'CUS-' + hex;
}

function makeOrderId_() {
  return 'AT-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function normalizePhone_(value) { return String(value || '').replace(/[\s()-]/g, '').trim(); }
function normalizeRoom_(value) { return String(value || '').replace(/\s+/g, '').trim(); }
function normalizeStudent_(value) {
  var text = String(value || '').replace(/\s+/g, '').trim();
  var match = text.match(/^0*([0-9]+)([ก-ฮ]?)$/);
  return match ? String(parseInt(match[1], 10)) + match[2] : text;
}
function normalizeSlipCode_(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12); }
function slipPropertyKey_(fileId) { return 'AUTHONG_SLIP_CODE_' + fileId; }
function headerMap_(headers) {
  var map = {};
  headers.forEach(function(value, index) { if (value) map[String(value).trim()] = index + 1; });
  return map;
}
function getManagedTabNames_() { return ['CUSTOMERS', 'ORDERS_ALL', 'PAYMENTS', 'SUMMARY'].concat(CATEGORY_NAMES); }
function createJsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
