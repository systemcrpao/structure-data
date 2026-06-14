# CR-Vision — ระบบบริหารจัดการโครงสร้างพื้นฐาน

### องค์การบริหารส่วนจังหวัดเชียงราย (CRPAO)

ระบบแสดงผลโครงการก่อสร้างและพัฒนาโครงสร้างพื้นฐานบนแผนที่แบบ Interactive สำหรับ อบจ.เชียงราย พร้อมระบบ Backend API สำหรับจัดการข้อมูลตามสิทธิ์ผู้ใช้งาน (RBAC) ดึงข้อมูลจาก Google Sheets และแสดงผลบน Leaflet Map พร้อม Dashboard วิเคราะห์การใช้งาน

---

## โครงสร้างไฟล์

```
cr-vision/
├── backend/
│   └── Code.gs              — Backend API (Google Apps Script) จัดการ Auth, CRUD, Token
├── frontend/
│   ├── index.html           — หน้าหลัก (แผนที่ + รายการโครงการ)
│   ├── app.js               — Logic หลัก: โหลดข้อมูลแผนที่, GeoJSON, ตัวกรอง, GPS
│   ├── analytics.js         — ติดตามสถิติการใช้งาน (localStorage)
│   ├── dashboard.html       — หน้า Dashboard + Login
│   ├── dashboard.js         — Logic ของ Dashboard: Auth, Charts, Export
│   ├── login.html           — หน้าเข้าสู่ระบบสำหรับเจ้าหน้าที่
│   ├── technician.html      — หน้าจัดการข้อมูลสำหรับผู้บันทึกข้อมูล
│   ├── treasury.html        — หน้าอัปเดตสถานะสำหรับผู้บันทึกสถานะ
│   ├── admin.html           — หน้าจัดการระบบสำหรับผู้ดูแลระบบ
│   └── styles.css / theme.* — Custom CSS และ Theme
├── .github/workflows/
│   └── deploy.yml           — CI/CD Pipeline สำหรับ Deploy ขึ้น GitHub Pages
└── README.md                — เอกสารนี้
```

---

## การทำงานของระบบ

### 1. หน้าหลักแผนที่ (`index.html` + `app.js`)

- **การโหลดข้อมูล:** ดึงข้อมูลโครงการจาก **Google Sheets** ผ่าน Google Visualization API รองรับข้อมูลแยกตามปีงบประมาณ
- **แผนที่ (Leaflet):** - สลับ Layer ระหว่าง Street View (OSM) และ Satellite (ArcGIS)
  - **Dynamic Boundaries:** โหลดเส้นขอบเขตอำเภอและตำบลในเชียงรายจาก GeoJSON
  - **GPS Tracking:** ระบบระบุตำแหน่งผู้ใช้ (My Location) พร้อมรัศมีความแม่นยำ
- **การกรองข้อมูลแบบละเอียด:** กรองตามปีงบประมาณ, ประเภทงาน (9 ประเภท), สถานะโครงการ, และกรองพื้นที่ (อำเภอ/ตำบล) แบบสัมพันธ์กัน

### 2. ระบบสิทธิ์ผู้ใช้งาน (Role-Based Access Control)

ระบบ Backend (`Code.gs`) ควบคุมสิทธิ์การใช้งานผ่าน HMAC-SHA256 Token (อายุ 8 ชั่วโมง) โดยแบ่งระดับผู้ใช้งานดังนี้:

| Role (สิทธิ์)                | การเข้าถึงฟังก์ชัน                                                        |
| :--------------------------- | :------------------------------------------------------------------------ |
| **Admin** (ผู้ดูแลระบบ)      | จัดการได้ทุกฟังก์ชัน ทั้งข้อมูลโครงการและผู้ใช้งาน                        |
| **Director** (ผู้บริหาร)     | ดูข้อมูลภาพรวมและ Dashboard ระดับบริหาร                                   |
| **User** (ผู้บันทึกข้อมูล)   | เพิ่ม, แก้ไข, ลบข้อมูลโครงการ และนำเข้าข้อมูลผ่าน CSV                     |
| **Approve** (ผู้บันทึกสถานะ) | อัปเดตสถานะโครงการ (เช่น รอดำเนินการ, กำลังดำเนินการ, ดำเนินการเสร็จสิ้น) |

### 3. ระบบ Analytics (`analytics.js` & Dashboard)

บันทึกสถิติการใช้งานไว้ใน `localStorage` และนำเสนอผ่าน Dashboard:

- KPI Cards และ Charts สำหรับวิเคราะห์การใช้งานระบบ (ช่วงเวลา, อุปกรณ์, เบราว์เซอร์)
- ติดตาม Events เช่น การค้นหา, การกดซูม, การเปลี่ยน Layer และการคลิกโครงการ

---

## ความปลอดภัย และ CI/CD Pipeline

ระบบถูกออกแบบให้มีความปลอดภัยสูงขึ้น โดยไม่เก็บรหัสผ่านไว้ใน Source Code โดยตรง:

1. **Authentication:** - รหัสผ่านในระบบถูกเข้ารหัสแบบ SHA-256
   - Backend มีระบบ Rate Limiting (บล็อก 15 นาทีหากใส่รหัสผิดเกิน 5 ครั้ง) ป้องกัน Brute-force Attack
2. **GitHub Actions (`deploy.yml`):**
   - การ Deploy ขึ้น GitHub Pages ทำผ่านระบบ CI/CD
   - ระบบจะดึงค่า `DASH_USERNAME` และ `DASH_PASSWORD_HASH` จาก **GitHub Secrets** มาสร้างเป็นไฟล์ `dashboard-config.js` ในขั้นตอนการ Build เท่านั้น ทำให้ข้อมูลสำคัญไม่รั่วไหลลง Public Repository

---

## Technology Stack

| ส่วน              | เทคโนโลยี                                                  |
| :---------------- | :--------------------------------------------------------- |
| **UI / Styling**  | Tailwind CSS, Lucide Icons, Google Fonts (Prompt, Sarabun) |
| **Map Engine**    | Leaflet.js 1.9.4                                           |
| **Charts / Data** | Chart.js 4.4.3                                             |
| **Backend API**   | Google Apps Script (GAS)                                   |
| **Database**      | Google Sheets                                              |
| **Security**      | Web Crypto API (SHA-256), HMAC-SHA256 Tokens               |
| **CI/CD**         | GitHub Actions                                             |

---

## วิธีการติดตั้งและ Deploy (สำหรับ Developer)

1. **ตั้งค่า Backend (Google Apps Script):**
   - นำโค้ดจาก `backend/Code.gs` ไปวางใน Google Apps Script
   - เปลี่ยนค่า `SECRET_KEY`, `AUTH_SHEET_ID`, และ `DATA_SHEET_ID`
   - Deploy แบบ Web App (Execute as: Me, Access: Anyone)
2. **ตั้งค่า GitHub Secrets:**
   - ไปที่ Settings > Secrets and variables > Actions ของ Repository
   - เพิ่ม `DASH_USERNAME` และ `DASH_PASSWORD_HASH`
3. **Deploy:**
   - Push โค้ดขึ้น Branch `main`
   - GitHub Actions จะทำงานอัตโนมัติและ Deploy ระบบขึ้น GitHub Pages

---

&copy; 2569 องค์การบริหารส่วนจังหวัดเชียงราย (CRPAO)
