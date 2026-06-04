// =============================================
// gas-config.js — CR-Vision GAS Configuration
// =============================================
// วิธีตั้งค่า:
//   1. เปิด script.google.com → โปรเจกต์ใหม่
//   2. วาง Code.gs ลงไปและตั้งค่า SECRET_KEY ใหม่
//   3. Deploy → New Deployment → Web App
//      - Execute as: Me (เจ้าของ)
//      - Who has access: Anyone (ทุกคน, รวมถึงไม่ได้ login)
//   4. คัดลอก Web App URL → ใส่ใน GAS_WEBAPP_URL ด้านล่าง
//   5. บันทึกไฟล์นี้ (ห้าม commit ขึ้น public repo)
// =============================================

window.GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwRHAfh8L9r5rg0BzunR6mDyw-nLI5i-0qv8kv9VUif7OBaEInEb8LZBLDg8vBif_fOgA/exec';
