# Authong Athletics preorder 2026

ระบบพรีออเดอร์เสื้อสำหรับนักเรียนและบุคคลทั่วไป เชื่อม Google Sheets และ Google Drive สำหรับตรวจสลิป

## ข้อมูลที่บันทึก

- CUSTOMERS เก็บเลขที่/ห้องของนักเรียน หรือรหัส Google แบบแฮชพร้อมชื่อ/เบอร์/ข้อมูลรับเสื้อของบุคคลทั่วไป
- ORDERS_ALL เก็บเลขออเดอร์ คอลเลกชัน ชื่อเสื้อ เบอร์เสื้อ ไซส์ จำนวน ราคา และสถานะ
- PAYMENTS เก็บประวัติการแนบสลิปและสถานะตรวจ
- ORIGINAL, FOOTBALL, BASKETBALL, AUHISTORY แยกรายการสำหรับส่งร้านและตรวจสลิป
- SUMMARY ใช้สูตร Google Sheets นับออเดอร์ จำนวนเสื้อ ยอดรวม และสลิปรอตรวจ

ไม่มีชีต CATALOG และไม่บันทึกอีเมล Google ลงชีต รายการใหม่เป็น 1 ตัวต่อออเดอร์ นักเรียนรับที่โรงเรียน ส่วนบุคคลทั่วไปเลือกรับที่โรงเรียนหรือจัดส่ง

## เปิด localhost

จากโฟลเดอร์ work/purple รันคำสั่ง node ..\preoder-preview.cjs แล้วเปิด http://localhost:8765/ โดย `config.example.js` ตั้งค่า Apps Script URL และ Google Client ID ที่ใช้จริงไว้แล้ว; `config.js` ที่ถูก ignore สามารถใช้ override เฉพาะเครื่องได้

## ติดตั้ง Google Apps Script

1. เปิด Apps Script ที่ผูกกับสเปรดชีตเดิม แล้วแทนเนื้อหา Code.gs ด้วยไฟล์ใน repo
2. เลือก setupNewOrderSheets แล้วกด Run เพื่อสร้างชีตและซิงก์รายการเดิมจาก Orders, LEGACY_ORDERS_ARCHIVE หรือชีตเก่า `ชีต1` (ตามหัวตาราง) หรือเลือก `runLegacyMigrationOnly` หากต้องการซิงก์ข้อมูลอย่างเดียว ระบบจะซิงก์ ORDERS_ALL, CUSTOMERS, แท็บคอลเลกชัน และ PAYMENTS ให้ครบ การรันซ้ำจะอัปเดตรายการเดิมตาม Order ID โดยไม่สร้างออเดอร์หรือสลิปซ้ำ
3. เลือก `authorizeExternalRequests` แล้วกด Run ด้วยบัญชีเจ้าของ Web App จากนั้นอนุญาต UrlFetchApp เมื่อ Google ขอสิทธิ์ เพื่อให้ระบบตรวจสอบ Google Sign-In ได้
4. Deploy เป็น Web app โดยให้ Execute as เป็นบัญชีเจ้าของสเปรดชีต และกำหนดการเข้าถึงให้ผู้สั่งจองเปิดได้
5. คัดลอก Web app URL ไปใส่ช่องตั้งค่า Google Sheets ในหน้าเว็บ หรือในไฟล์ config.js
6. ตรวจรายการสลิปจากแท็บคอลเลกชัน แล้วแก้ Payment Status / Order Status ได้จากชีตนั้น
7. ตั้งค่า OAuth Web Client ID เดียวกันใน config.js (`googleClientId`) และตัวแปร `GOOGLE_CLIENT_ID` ด้านบนของ Code.gs ก่อน Deploy เวอร์ชันใหม่ ระบบจะใช้ Google `sub` แบบแฮชเป็น Customer ID และไม่นำอีเมลไปเก็บ

ชีตเก่า `ชีต1` เก็บข้อมูล Timestamp, Student No., Room, Screen Name, Screen Number, Size, Payment Slip และ Status ระบบนำข้อมูลไปยัง ORDERS_ALL, CUSTOMERS, แท็บคอลเลกชัน และ PAYMENTS โดยคงลิงก์/รหัสไฟล์สลิปใน Google Drive เดิมไว้ ไม่ดาวน์โหลดหรืออัปโหลดสลิปซ้ำ แปลงสถานะเดิมให้ตรงกับสถานะตรวจสลิป และรักษาเบอร์เสื้อที่มีเลขศูนย์นำหน้าเป็นข้อความ ต้นทางยังอยู่ครบ หน้าเว็บโหลดรายการผู้สั่งไว้ล่วงหน้า และใช้ข้อมูลแคชเมื่อเปิดแต่ละคอลเลกชัน

## Google Sign-In

สร้าง OAuth Client แบบ Web application และเพิ่ม Authorized JavaScript origins `http://localhost`, `http://localhost:8765` และ origin เว็บไซต์จริงที่ใช้งาน (`https://pluem4898.github.io` และ/หรือ `https://authong.store`) จากนั้นใส่ Client ID ใน config.js และ Code.gs ไม่ต้องใช้ Client Secret ฟอร์มบุคคลทั่วไปจะเรียกข้อมูลที่เคยบันทึกไว้หลังลงชื่อเข้าใช้อีกครั้ง นักเรียนกรอกเฉพาะเลขที่และห้อง

## ราคา

ตอนนี้ตั้งราคาทุกคอลเลกชันไว้ 279 บาทใน app.js และ Code.gs แก้ค่าทั้งสองตำแหน่งเมื่อมีราคาของแต่ละคอลเลกชัน
