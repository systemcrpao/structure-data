# 📘 คู่มือสถาปัตยกรรมระบบและลำดับการทำงาน (AI Agent Reference Guide)
**Project:** CR-Vision (Structure Data System)
**Document Purpose:** เพื่อเป็นคู่มืออ้างอิง (Reference) สำหรับ AI Agent หรือ Developer ในการทำความเข้าใจ Logic, กระบวนการทำงาน (Workflow), การแบ่งสิทธิ์ (RBAC), และโครงสร้างข้อมูล เพื่อให้สามารถวิเคราะห์และแก้ไข Bug ได้อย่างแม่นยำ

---

## 🏗️ 1. สถาปัตยกรรมภาพรวม (System Architecture)
ระบบถูกออกแบบในลักษณะ **Serverless SPA (Single Page Application)**
* **Frontend:** HTML, CSS, JavaScript (Vanilla JS), Leaflet.js (สำหรับการจัดการแผนที่)
* **Backend (API Server):** Google Apps Script (GAS) ทำหน้าที่รับ request ผ่าน `doPost`
* **Database:** Google Sheets (`AUTH_SHEET_ID` และ `DATA_SHEET_ID`)
* **Data Fetching (Read-only):** หน้า Dashboard/Map ดึงข้อมูลตรงจาก Google Sheets ผ่าน Google Visualization API (`gviz`) เพื่อความรวดเร็ว

---

## 🔐 2. ระบบรักษาความปลอดภัยและ Authentication (Auth Flow)
ไฟล์ที่เกี่ยวข้อง: `frontend/auth.js`, `backend/Code.gs`

1.  **Client-Side Hashing:** เมื่อผู้ใช้กรอกรหัสผ่าน Frontend จะทำการแปลงรหัสผ่านเป็น **SHA-256 Hash** ผ่าน Web Crypto API ก่อนส่งไปที่ Backend
2.  **API Request:** ส่ง `username` และ `passHash` ไปยัง GAS (Action: `login`)
3.  **Backend Validation:**
    * ตรวจสอบ Rate Limit (ผิดพลาดเกิน 5 ครั้ง ล็อคบัญชี 15 นาที) ป้องกัน Brute-force
    * เทียบ Hash ด้วยฟังก์ชัน `timingSafeEqual` (ป้องกัน Timing Attack)
4.  **Token Generation:** หากสำเร็จ GAS จะสร้าง **Token ด้วย HMAC-SHA256** (อายุ 8 ชั่วโมง)
5.  **Session Storage:** Frontend เก็บข้อมูล User, Role, Token ไว้ใน `sessionStorage` (Key: `crpao_v2_sess`)

---

## 👥 3. ลำดับการทำงานตามบทบาท (Role-Based Access Control - RBAC)
ระบบแบ่งผู้ใช้งานออกเป็น 4 บทบาทหลัก (อ้างอิงจาก `getRoleDisplay` และ `requireRole`)

### 3.1 👑 Admin (ผู้ดูแลระบบ)
* **Landing Page:** `admin.html`
* **สิทธิ์การเข้าถึง:** เข้าถึงได้ *ทุกฟังก์ชัน* ของระบบและสามารถ Bypass Rule ของ Role อื่นได้ทั้งหมด
* **API Actions ที่ทำได้:** `addProject`, `importCSV`, `updateProject`, `deleteProject`, `updateStatus`, `getUsers`, `addUser`, `updateUser`, `deleteUser`
* **การจัดการผู้ใช้:** หน้า `admin.html` มี UI แบบ CRUD สำหรับเพิ่ม/แก้ไข/ลบผู้ใช้ในระบบ พร้อม Modal Form และ Confirm Dialog (ไม่สามารถลบหรือเปลี่ยน Role ของตัวเองได้)

### 3.2 👨‍🔧 User (ช่างเทคนิค / ผู้ปฏิบัติงาน)
* **Landing Page:** `technician.html`
* **หน้าที่หลัก:** จัดการข้อมูลโครงการโครงสร้างพื้นฐานเบื้องต้น
* **API Actions ที่ทำได้:**
    * `addProject`: เพิ่มโครงการใหม่เข้า Sheet (ระบุปีงบประมาณ)
    * `importCSV`: นำเข้าข้อมูลโครงการจำนวนมาก (สูงสุด 500 รายการ/ครั้ง)
    * `updateProject`: แก้ไขรายละเอียดโครงการ (เช่น ชื่อ, งบประมาณ, พิกัด, รูปภาพ)
    * `deleteProject`: ลบข้อมูลโครงการ

### 3.3 💰 Approve (ฝ่ายการเงิน/คลัง)
* **Landing Page:** `treasury.html`
* **หน้าที่หลัก:** ตรวจสอบและอัปเดตสถานะของโครงการเท่านั้น (ไม่สามารถแก้ไขรายละเอียดโครงการได้)
* **API Actions ที่ทำได้:**
    * `updateStatus`: เปลี่ยนสถานะโครงการ โดยจำกัดเฉพาะค่าใน Whitelist ได้แก่: `"รอดำเนินการ", "กำลังดำเนินการ", "แล้วเสร็จ", "ยกเลิก", "ระงับชั่วคราว"`

### 3.4 👔 Director (ผู้อำนวยการ / ผู้บริหาร)
* **Landing Page:** `dashboard.html`
* **หน้าที่หลัก:** ดูภาพรวมระบบ แผนที่ และสถิติต่างๆ (Read-only)
* **หมายเหตุ:** ไม่มีสิทธิ์เรียกใช้ API Action ที่มีการเปลี่ยนแปลงข้อมูล (Mutation) ใน Backend

---

### 3.5 🗺️ หน้าแผนที่สาธารณะ (index.html)
* เปิดให้ประชาชนเข้าดูได้โดยไม่ต้อง Login
* **ปุ่มมุมล่างซ้าย:** แสดง "เข้าสู่ระบบ" สำหรับผู้ที่ยังไม่ Login → นำทางไปหน้า `login.html`
* **เมื่อ Login แล้ว:** ปุ่มเดียวกันจะแสดงชื่อผู้ใช้ + บทบาท และเมื่อกด → นำทางไปยัง Landing Page ของ Role นั้นๆ โดยอัตโนมัติ (`getRoleHome`)

---

## ⚙️ 4. กระบวนการทำงานของ Backend API (Code.gs)
Backend ทำงานผ่านฟังก์ชัน `doPost(e)` โดยรับ Payload เป็น JSON (Content-Type: text/plain เพื่อเลี่ยง CORS)
1.  **Parse Payload:** ตรวจสอบค่า `action`
2.  **Verify Token:** ถ้าไม่ใช่ Action `login` ระบบจะแกะ Token ตรวจสอบ Signature และวันหมดอายุ หากไม่ผ่านจะ Reject ทันที
3.  **Route Action:** ใช้ `switch(action)` โยนไปยัง Handler function ต่างๆ
4.  **Authorization Check:** ภายใน Handler จะเรียกฟังก์ชัน `requireRole_(session, [...allowedRoles])` เพื่อเช็คสิทธิ์
5.  **Audit Log:** ทุกครั้งที่มีการเพิ่ม ลบ หรือแก้ไขข้อมูล จะมีการบันทึกประวัติลงใน Sheet `_audit_log` โดยอัตโนมัติ (Best-effort)

**User Management Actions (Admin only):**
* `addUser`: เพิ่มผู้ใช้ใหม่ — ตรวจสอบชื่อซ้ำ, validate format, hash รหัสผ่านด้วย SHA-256 ก่อนบันทึก
* `updateUser`: แก้ไข Role และ/หรือรหัสผ่านของผู้ใช้ตาม `userId` — ห้ามเปลี่ยน Role ตัวเอง
* `deleteUser`: ลบผู้ใช้ตาม `userId` — ห้ามลบบัญชีตัวเอง

---

## 🗺️ 5. กระบวนการทำงานของ Frontend & Map (app.js)
1.  **Data Fetching (GViz):** ฟังก์ชัน `fetchSheetData()` ยิง Request ไปยัง Google Sheets (`/gviz/tq`) ตามปีงบประมาณที่คอนฟิกไว้ (เช่น 2568, 2569) เพื่อดึงข้อมูลมาแสดงผลโดยไม่ต้องผ่าน GAS
2.  **Data Parsing:**
    * ฟังก์ชัน `parseSheetRows()` จับคู่ Column Header จาก Sheet เพื่อ Mapping เป็น Object ของโครงการ
    * แกะพิกัด (`parseCoordinates`) ที่อาจมาในรูปแบบ Lat/Lng, N/E, หรือ DMS ให้เป็น Decimal Degrees
    * แปลง URL รูปภาพของ Google Drive ให้แสดงผลเป็น Thumbnail (`parseGoogleDriveImage`)
3.  **GeoJSON & Filtering:**
    * โหลดข้อมูล GeoJSON เพื่อวาดขอบเขตอำเภอ/ตำบล และเป็น Data source สำหรับ Dropdown Filter
4.  **State Management:** เก็บข้อมูลไว้ในตัวแปร `state` (เช่น `allProjects`, `filteredProjects`, `markers`)
5.  **Map rendering:** สร้าง Marker พร้อม Custom Icon ตาม `category` ของประเภทงาน และเชื่อมการคลิกที่ Marker กับการทำ Highlight ที่ Card ด้านข้าง

---

## 🐛 6. แนวทางการ Debug สำหรับ AI Agent (Troubleshooting Guide)
หากคุณ (AI) ต้องวิเคราะห์ Bug ในระบบนี้ ให้พิจารณาตรวจสอบจุดต่อไปนี้เป็นลำดับแรก:

1.  **ปัญหา Login / Auth (Invalid Token):**
    * เช็คว่ามีการอัปเดต `SECRET_KEY` ระหว่างที่มี Token ค้างในระบบผู้ใช้หรือไม่ (ทำให้ Signature ไม่ตรง)
    * เช็คว่ารหัสผ่านใน Auth Sheet เป็น Plain text หรือ SHA-256 Hash แล้ว (ระบบรองรับทั้งคู่ แต่เช็คผ่าน `isHex64`)
2.  **ปัญหา Map ไม่โหลด / ข้อมูลไม่ขึ้น:**
    * ระบบโหลดข้อมูลผ่าน GViz URL (`/gviz/tq?tqx=out:json`). ตรวจสอบ Permission ของ `DATA_SHEET_ID` ว่าตั้งเป็น "Anyone with the link" (Viewer) หรือยัง
    * Header ใน Sheet มีการเปลี่ยนแปลงหรือไม่ ฟังก์ชัน `parseSheetRows` ใน `app.js` ใช้ Regex ในการจับคู่ Header ถ้าพิมพ์ผิดจะทำให้ Map ไม่เจอ Column พิกัด
3.  **ปัญหา API Error (CORS / HTTP 405):**
    * ตรวจสอบตัวแปร `window.GAS_WEBAPP_URL` ใน `gas-config.js`
    * เช็คว่า GAS มีการ Deploy เป็น **"Web App"** แบบ **"Execute as: Me"** และ **"Who has access: Anyone"** เสมอ หากแก้ไข `Code.gs` ต้อง **Deploy as New Version** ทุกครั้ง ไม่งั้นการเปลี่ยนแปลงจะไม่มีผลกับ Webhook
4.  **ปัญหา Role ไม่มีสิทธิ์ทำงาน:**
    * เช็คค่าที่ Return กลับมาตอน Login ว่า Role ตรงกับที่กำหนดไว้ในฟังก์ชัน `requireRole_` ของ `Code.gs` หรือไม่ (ระวังตัวพิมพ์เล็ก/ใหญ่)
