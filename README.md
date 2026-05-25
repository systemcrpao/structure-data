# CR-Vision — ระบบบริหารจัดการโครงสร้างพื้นฐาน

### องค์การบริหารส่วนจังหวัดเชียงราย (CRPAO)

ระบบแสดงผลโครงการก่อสร้างและพัฒนาโครงสร้างพื้นฐานบนแผนที่แบบ Interactive สำหรับ อบจ.เชียงราย ดึงข้อมูลจาก Google Sheets และแสดงผลบน Leaflet Map พร้อม Dashboard วิเคราะห์การใช้งาน

---

## โครงสร้างไฟล์

```
cr-vision/
├── index.html       — หน้าหลัก (แผนที่ + รายการโครงการ)
├── app.js           — Logic หลัก: โหลดข้อมูล, แผนที่, ตัวกรอง
├── analytics.js     — ติดตามสถิติการใช้งาน (localStorage)
├── dashboard.html   — หน้า Dashboard + Login
├── dashboard.js     — Logic ของ Dashboard: Auth, Charts, Export
├── styles.css       — Custom CSS
└── README.md        — เอกสารนี้
```

---

## การทำงานของระบบ

### 1. หน้าหลัก (`index.html` + `app.js`)

#### การโหลดข้อมูล

- ดึงข้อมูลโครงการจาก **Google Sheets** ผ่าน Google Visualization API (`gviz/tq`)
- รองรับหลาย Sheet (ปีงบประมาณต่าง ๆ) ผ่าน `CONFIG.SHEETS`
- หากโหลดไม่สำเร็จ จะแสดง **Sample Data** สำรอง (12 โครงการ)

#### แผนที่ (Leaflet)

| ฟีเจอร์     | รายละเอียด                                         |
| ----------- | -------------------------------------------------- |
| Map Layer   | Street View (OpenStreetMap) / Satellite (ArcGIS)   |
| Boundary    | แสดงเขตอำเภอ / ตำบล จาก GeoJSON (เชียงรายเท่านั้น) |
| Markers     | จุดปักหมุดแต่ละโครงการ มีป๊อปอัปรายละเอียด         |
| My Location | GPS ตำแหน่งผู้ใช้พร้อม Accuracy Circle             |
| Zoom        | Zoom In / Out / Fit All                            |

#### การกรองข้อมูล

- **ปีงบประมาณ** — dropdown ตามปีที่มีในข้อมูล
- **ค้นหา** — ชื่อโครงการ / หมู่บ้าน / หมู่ที่
- **อำเภอ / ตำบล** — โหลดจาก GeoJSON
- **ประเภทงาน** — จำแนก 9 ประเภท (ถนน คสล., หินคลุก, ขุดลอก, ท่อระบายน้ำ, รางระบายน้ำ, ท่อลอดเหลี่ยม, สวนสุขภาพ, เขื่อน, รั้ว)
- **สถานะ** — อยู่ระหว่างดำเนินการ / ดำเนินการเสร็จสิ้น

#### การแยกประเภทโครงการ (`classifyType`)

ใช้ Regex เปรียบเทียบชื่อประเภทงาน กำหนดสีและ badge ให้แต่ละ category โดยอัตโนมัติ

#### รูปภาพโครงการ

รองรับ URL รูปจาก Google Drive หลายรูปแบบ แปลงเป็น Thumbnail URL อัตโนมัติ

---

### 2. ระบบ Analytics (`analytics.js`)

บันทึกสถิติการใช้งานไว้ใน `localStorage` ภายใต้ key `crpao_analytics`

#### ข้อมูลที่เก็บต่อ Session

| ฟิลด์        | คำอธิบาย                                 |
| ------------ | ---------------------------------------- |
| `id`         | Session ID ไม่ซ้ำกัน                     |
| `ts`         | Timestamp เริ่มต้น                       |
| `date`       | วันที่ (YYYY-MM-DD)                      |
| `hour`       | ชั่วโมงที่เริ่มใช้งาน                    |
| `device`     | Desktop / Mobile / Tablet                |
| `browser`    | Chrome / Firefox / Safari / Edge / Other |
| `screen`     | ความละเอียดหน้าจอ (เช่น 1920x1080)       |
| `ref`        | แหล่งที่มา (domain ต้นทาง หรือ "direct") |
| `duration`   | ระยะเวลาใช้งาน (วินาที)                  |
| `eventCount` | จำนวน event ที่เกิดในช่วง session นี้    |
| `isReturn`   | `true` = ผู้ใช้เคยเข้าใช้งานมาก่อน       |

#### Events ที่ติดตาม

| Event                 | ทริกเกอร์เมื่อ                                          |
| --------------------- | ------------------------------------------------------- |
| `layer_switch`        | กด Street / Satellite                                   |
| `boundary_toggle`     | เปิด/ปิดเขต                                             |
| `boundary_level`      | เปลี่ยนระดับอำเภอ/ตำบล                                  |
| `location_toggle`     | กดแสดงตำแหน่งของฉัน                                     |
| `search`              | พิมพ์ค้นหาโครงการ (บันทึกเฉพาะความยาว ไม่บันทึกเนื้อหา) |
| `filter_year`         | เปลี่ยนปีงบ                                             |
| `filter_district`     | เปลี่ยนอำเภอ                                            |
| `filter_subdistrict`  | เปลี่ยนตำบล                                             |
| `filter_type`         | เปลี่ยนประเภทงาน                                        |
| `status_filter`       | เปลี่ยนสถานะโครงการ                                     |
| `filter_clear`        | ล้างตัวกรอง                                             |
| `project_click`       | คลิกการ์ดโครงการ                                        |
| `zoom`                | ซูม in/out/fit                                          |
| `fullscreen_toggle`   | ซ่อน/แสดง Sidebar                                       |
| `legend_toggle`       | เปิด/ปิด Legend                                         |
| `mobile_sidebar_open` | เปิด Sidebar บนมือถือ                                   |

> **ข้อจำกัด:** ข้อมูลเก็บเฉพาะบนเบราว์เซอร์/อุปกรณ์นั้น ๆ  
> หากต้องการสถิติข้ามอุปกรณ์ ให้เชื่อมต่อ Google Analytics หรือ Plausible Analytics

---

### 3. Dashboard (`dashboard.html` + `dashboard.js`)

#### การเข้าสู่ระบบ

- ต้อง Login ด้วยชื่อผู้ใช้ + รหัสผ่านก่อนเข้าหน้า Dashboard
- รหัสผ่านถูก Hash ด้วย **SHA-256** ผ่าน Web Crypto API ก่อนเปรียบเทียบ (ไม่มีการส่งรหัสผ่านออกไปที่ใด)
- Session เก็บใน `sessionStorage` หมดอายุหลัง **8 ชั่วโมง**

#### สิ่งที่แสดงใน Dashboard

- **KPI Cards** — จำนวนครั้งที่เข้าใช้, วันนี้, ผู้ใช้ซ้ำ, เวลาใช้งานเฉลี่ย, event ทั้งหมด, การค้นหา, คลิกโครงการ, ชั่วโมง Peak
- **Bar Chart** — การเข้าใช้งานรายวัน 30 วันล่าสุด
- **Doughnut Chart** — สัดส่วนอุปกรณ์ที่ใช้ (Desktop/Mobile/Tablet)
- **Line Chart** — การกระจายตามชั่วโมงของวัน
- **Horizontal Bar** — Browser breakdown
- **Feature Usage** — ฟีเจอร์ที่ใช้บ่อยพร้อม Progress bar
- **Referrer Table** — แหล่งที่มาของผู้เข้าชม
- **Recent Sessions** — รายการ 20 session ล่าสุด
- **Export CSV** — ส่งออกข้อมูล Session ทั้งหมด

---

## วิธีตั้งค่า Login

### การเปลี่ยนรหัสผ่าน

1. เปิดหน้าใดก็ได้ในเบราว์เซอร์ แล้วกด **F12** เพื่อเปิด DevTools
2. ไปที่แท็บ **Console** แล้วรันคำสั่งนี้:

```javascript
crypto.subtle
  .digest("SHA-256", new TextEncoder().encode("รหัสผ่านของคุณ"))
  .then((b) =>
    console.log(
      Array.from(new Uint8Array(b))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    ),
  );
```

3. นำค่า Hash ที่ได้ไปแทนที่ใน `dashboard.js`:

```javascript
const CONFIG = {
  USERNAME:      'admin',          // ← เปลี่ยนชื่อผู้ใช้
  PASSWORD_HASH: 'hash-ที่ได้',    // ← วาง Hash ที่นี่
  ...
};
```

### ข้อควรระวัง

> ⚠️ เนื่องจากเป็น Static Web App ที่ไม่มี Backend รหัสผ่านที่ Hash แล้วจะอยู่ในไฟล์ `dashboard.js`  
> ผู้ที่เข้าถึงซอร์สโค้ดได้จะสามารถอ่าน Hash ได้ (แม้จะไม่รู้รหัสผ่านต้นฉบับ)
>
> **แนะนำ:**
>
> - ใช้รหัสผ่านที่คาดเดายาก (ไม่ใช่ "admin", "password", "1234")
> - หากนำขึ้น Web Server ให้ปกป้องด้วย HTTP Basic Auth ระดับ Server (Nginx/Apache) แทน
> - เพิ่ม `dashboard.js` ใน `.gitignore` ถ้าไม่ต้องการให้ Hash รั่วออก Public Repository

---

## Technology Stack

| ส่วน         | เทคโนโลยี                                 |
| ------------ | ----------------------------------------- |
| UI Framework | Tailwind CSS (CDN)                        |
| แผนที่       | Leaflet.js 1.9.4                          |
| ไอคอน        | Lucide Icons                              |
| ฟอนต์        | Prompt + Sarabun (Google Fonts)           |
| Charts       | Chart.js 4.4.3                            |
| ข้อมูล       | Google Sheets (gviz API)                  |
| GeoJSON      | github.com/chingchai/OpenGISData-Thailand |
| Analytics    | localStorage (Client-side)                |
| Hashing      | Web Crypto API (SHA-256)                  |

---

## การ Deploy

ระบบเป็น Static Web App ไม่ต้องการ Server-side runtime  
สามารถ deploy ได้บน:

- **GitHub Pages** — อัปโหลดไฟล์ทั้งหมดไปที่ Repository
- **Netlify / Vercel** — ลาก folder ไป drop
- **Web Server ทั่วไป** — copy ไฟล์ไปไว้ใน public folder

---

&copy; 2026 องค์การบริหารส่วนจังหวัดเชียงราย (CRPAO)
