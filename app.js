(function () {
  "use strict";

  // =============================================
  // CONFIGURATION
  // =============================================
  const CONFIG = {
    SHEET_ID: "179WwkuBkc6QwiuVvJIP-RXpW0zI_gkKnfBLHw87YYyI",
    SHEETS: [
      { name: "2569", gid: null },
      { name: "2568", gid: "1364287519" }
    ],
    MAP_CENTER: [19.9071, 99.8325],
    MAP_ZOOM: 10,
    DEBOUNCE_MS: 250,
  };

  function getSheetURL(sheetConfig) {
    if (sheetConfig.gid) {
      return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&gid=${sheetConfig.gid}`;
    }
    return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheetConfig.name}`;
  }

  // =============================================
  // TYPE CLASSIFICATION & COLORS
  // =============================================
  function classifyType(rawType) {
    if (!rawType)
      return { category: "other", color: "gray", label: "อื่นๆ", badgeClass: "badge-default" };
    const t = rawType.trim();
    if (/ถนนคอนกรีต|ถนน คสล|คสล\.|คอนกรีตเสริมเหล็ก/i.test(t))
      return { category: "road-concrete", color: "orange", label: "ถนน คสล.", badgeClass: "badge-road-concrete" };
    if (/หินคลุก/i.test(t))
      return { category: "road-gravel", color: "amber", label: "ถนนหินคลุก", badgeClass: "badge-road-gravel" };
    if (/ขุดลอก/i.test(t))
      return { category: "dredge", color: "blue", label: "ขุดลอก", badgeClass: "badge-dredge" };
    if (/วางท่อระบายน้ำ|วางท่อ/i.test(t))
      return { category: "drain-pipe", color: "cyan", label: "วางท่อระบายน้ำ", badgeClass: "badge-drain-pipe" };
    if (/รางระบายน้ำ/i.test(t))
      return { category: "drain-channel", color: "teal", label: "รางระบายน้ำ", badgeClass: "badge-drain-channel" };
    if (/ท่อลอดเหลี่ยม|ท่อลอด/i.test(t))
      return { category: "culvert", color: "indigo", label: "ท่อลอดเหลี่ยม", badgeClass: "badge-culvert" };
    if (/สวนสุขภาพ|สวน|ลานกีฬา/i.test(t))
      return { category: "park", color: "green", label: "สวนสุขภาพ", badgeClass: "badge-park" };
    if (/เขื่อน|พนังกั้นน้ำ/i.test(t))
      return { category: "dam", color: "red", label: "เขื่อน", badgeClass: "badge-dam" };
    if (/รั้ว|fence/i.test(t))
      return { category: "fence", color: "purple", label: "ก่อสร้างรั้ว", badgeClass: "badge-fence" };
    return {
      category: "other", color: "gray",
      label: t.length > 20 ? t.substring(0, 20) + "…" : t,
      badgeClass: "badge-default",
    };
  }

  // =============================================
  // COORDINATE PARSER
  // =============================================
  function parseCoordinates(raw) {
    if (!raw || typeof raw !== "string") return null;
    const cleaned = raw.trim().replace(/\s+/g, " ");

    let match = cleaned.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
    if (match) {
      const a = parseFloat(match[1]), b = parseFloat(match[2]);
      if (a >= 15 && a <= 25 && b >= 95 && b <= 105) return { lat: a, lng: b };
      if (b >= 15 && b <= 25 && a >= 95 && a <= 105) return { lat: b, lng: a };
      return { lat: a, lng: b };
    }

    match = cleaned.match(/[Nn]\s*(-?\d+\.?\d*)\s*[,\s]*\s*[Ee]\s*(-?\d+\.?\d*)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    match = cleaned.match(/(-?\d+\.?\d*)\s*[Nn]\s*[,\s]*\s*(-?\d+\.?\d*)\s*[Ee]/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    const dmsRegex = /(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]\s*([NSns])\s*[,\s]*\s*(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]\s*([EWew])/;
    match = cleaned.match(dmsRegex);
    if (match) {
      let lat = parseInt(match[1]) + parseInt(match[2]) / 60 + parseFloat(match[3]) / 3600;
      let lng = parseInt(match[5]) + parseInt(match[6]) / 60 + parseFloat(match[7]) / 3600;
      if (match[4].toUpperCase() === "S") lat = -lat;
      if (match[8].toUpperCase() === "W") lng = -lng;
      return { lat, lng };
    }

    const nums = cleaned.match(/-?\d+\.\d+/g);
    if (nums && nums.length >= 2) {
      const a = parseFloat(nums[0]), b = parseFloat(nums[1]);
      if (a >= 15 && a <= 25 && b >= 95 && b <= 105) return { lat: a, lng: b };
      if (b >= 15 && b <= 25 && a >= 95 && a <= 105) return { lat: b, lng: a };
      return { lat: a, lng: b };
    }
    return null;
  }

  // =============================================
  // GOOGLE DRIVE IMAGE URL PARSER
  // =============================================
  function parseGoogleDriveImage(raw) {
    if (!raw || typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;

    let fileId = null;
    // Try various Google Drive URL formats
    let match = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) fileId = match[1];
    if (!fileId) { match = s.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/); if (match) fileId = match[1]; }
    if (!fileId) { match = s.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/); if (match) fileId = match[1]; }
    if (!fileId) { match = s.match(/drive\.google\.com\/thumbnail\?.*id=([a-zA-Z0-9_-]+)/); if (match) fileId = match[1]; }
    if (!fileId) { match = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/); if (match) fileId = match[1]; }
    // If only file ID is provided
    if (!fileId && /^[a-zA-Z0-9_-]{10,}$/.test(s)) fileId = s;
    // If already a direct image URL, use as-is
    if (!fileId && /^https?:\/\//i.test(s)) return s;
    // Convert to Google Drive thumbnail URL (optimized for performance & CORS)
    if (fileId) {
      console.log("[CR-Vision] Image fileId extracted:", fileId);
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    }
    return null;
  }

  // =============================================
  // EXTRACT YEAR FROM TEXT
  // =============================================
  function extractYear(text) {
    if (!text || typeof text !== "string") return null;
    // Try to extract 4-digit year (e.g., "ข้อบัญญัติ ปี 2569" → "2569")
    const match = text.match(/\b(25\d{2}|26\d{2})\b/);
    return match ? match[1] : null;
  }

  // =============================================
  // BUDGET FORMATTERS
  // ==============================================
  function parseBudgetNumber(val) {
    if (val == null || val === "") return null;
    if (typeof val === "number") return val;
    const cleaned = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function formatBudget(val) {
    const num = parseBudgetNumber(val);
    if (num === null) return "—";
    return num.toLocaleString("th-TH", {
      style: "currency", currency: "THB",
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    });
  }

  function formatBudgetCompact(val) {
    const num = parseBudgetNumber(val);
    if (num === null) return "—";
    return Math.round(num).toLocaleString("th-TH") + " บาท";
  }

  // =============================================
  // DATA FETCHER - Google Sheets
  // =============================================
  async function fetchSheetData() {
    const allProjects = [];
    
    // โหลดข้อมูลจากทุก sheet ใน CONFIG.SHEETS
    for (const sheetConfig of CONFIG.SHEETS) {
      try {
        console.log(`[CR-Vision] Loading sheet: ${sheetConfig.name}...`);
        const url = getSheetURL(sheetConfig);
        const response = await fetch(url);
        const text = await response.text();

        const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
        if (!jsonStr || !jsonStr[1]) {
          console.warn(`Failed to parse sheet ${sheetConfig.name}`);
          continue;
        }

        const data = JSON.parse(jsonStr[1]);
        if (data.status === "error") {
          console.warn(`Sheet ${sheetConfig.name} error:`, data.errors?.[0]?.message);
          continue;
        }

        const projects = parseSheetRows(data, sheetConfig.name);
        allProjects.push(...projects);
        console.log(`[CR-Vision] Loaded ${projects.length} projects from ${sheetConfig.name}`);
      } catch (err) {
        console.warn(`Failed to load sheet ${sheetConfig.name}:`, err.message);
      }
    }
    
    return allProjects;
  }

  function parseSheetRows(data, sheetName) {
    const cols = data.table.cols.map((c) => c.label || "");
    const rows = data.table.rows;

    // Map columns by header names
    // ORDER MATTERS: more specific patterns must come before general ones
    // "แหล่งงบประมาณ" contains "งบประมาณ" → check แหล่งงบ BEFORE งบประมาณ
    // "ปีงบประมาณ" contains "งบประมาณ" → check ปีงบ BEFORE งบประมาณ
    // "พิกัด สิ้นสุด" contains "พิกัด" → check เริ่มต้น first, skip สิ้นสุด
    const colMap = {};
    cols.forEach((label, idx) => {
      // Normalize: collapse newlines/whitespace inside header text
      const l = label.replace(/\s+/g, " ").trim();
      if (/^ที่$|^ลำดับ$|^id$/i.test(l))
        colMap.id = idx;
      else if (/ชื่อโครงการ|โครงการ/i.test(l))
        colMap.title = idx;
      else if (/แหล่งงบ/i.test(l)) {
        colMap.fundSource = idx;
        colMap.fiscalYear = idx; // ใช้ column เดียวกันสำหรับทั้ง fundSource และ fiscalYear
      }
      else if (/ปีงบ|ปีงบประมาณ|ปี พ\.ศ|พ\.ศ\.|fiscal.*year|fy|^งบ$|ข้อบัญญัติ/i.test(l))
        colMap.fiscalYear = idx;
      else if (/งบประมาณ|budget/i.test(l))
        colMap.budget = idx;
      else if (/อำเภอ/i.test(l))
        colMap.district = idx;
      else if (/ตำบล|tambon|subdistrict/i.test(l))
        colMap.subdistrict = idx;
      else if (/พิกัด.*เริ่ม|coord.*start/i.test(l))
        colMap.coordStart = idx;
      else if (/พิกัด.*สิ้นสุด|พิกัด.*end|coord.*end/i.test(l))
        colMap.coordEnd = idx;
      else if (/พิกัด|lat.*lng|lng.*lat|coordinate/i.test(l) && colMap.coordStart === undefined)
        colMap.coordStart = idx;
      else if (/ประเภทงาน|ประเภท/i.test(l))
        colMap.type = idx;
      else if (/รูปภาพ|รูป|ภาพ|image|photo|picture/i.test(l))
        colMap.image = idx;
      else if (/รายละเอียด|detail|description/i.test(l))
        colMap.description = idx;
      else if (/สถานะ|status/i.test(l))
        colMap.status = idx;
    });

    // Fallback: if budget col not found by header, use column C (index 2)
    if (colMap.budget === undefined && cols.length > 2) {
      colMap.budget = 2;
    }

    // Fallback: try to find lat/lng in separate columns
    if (colMap.coordStart === undefined) {
      cols.forEach((label, idx) => {
        const l = label.trim().toLowerCase();
        if (/^lat|latitude/i.test(l)) colMap.lat = idx;
        if (/^lng|^lon|longitude/i.test(l)) colMap.lng = idx;
      });
    }

    // Debug: log column mapping to help troubleshoot
    console.log("[CR-Vision] Column headers:", cols);
    cols.forEach((header, idx) => {
      console.log(`  Column ${idx}: "${header}"`);
    });
    console.log("[CR-Vision] Column mapping:", JSON.stringify(colMap));
    console.log("[CR-Vision] fiscalYear column index:", colMap.fiscalYear);
    console.log("[CR-Vision] fundSource column index:", colMap.fundSource);

    const projects = [];
    rows.forEach((row, rowIdx) => {
      const getVal = (idx) => {
        if (idx === undefined || !row.c || !row.c[idx]) return null;
        const cell = row.c[idx];
        return cell.f || cell.v;
      };
      const getRaw = (idx) => {
        if (idx === undefined || !row.c || !row.c[idx]) return null;
        return row.c[idx].v;
      };

      const title = getVal(colMap.title);
      if (!title) return;

      let coords = null;
      if (colMap.coordStart !== undefined) {
        const valStart = String(getRaw(colMap.coordStart) || getVal(colMap.coordStart) || "").trim();
        // Try parsing as full "lat, lng" string first
        coords = parseCoordinates(valStart);
        // If that failed and we have a second coord column, combine them
        if (!coords && colMap.coordEnd !== undefined) {
          const valEnd = String(getRaw(colMap.coordEnd) || getVal(colMap.coordEnd) || "").trim();
          const numA = parseFloat(valStart);
          const numB = parseFloat(valEnd);
          if (!isNaN(numA) && !isNaN(numB)) {
            // Auto-detect which is lat vs lng based on Thailand ranges
            // Lat ~15-25, Lng ~95-105
            if (numA >= 15 && numA <= 25 && numB >= 95 && numB <= 105) {
              coords = { lat: numA, lng: numB };
            } else if (numB >= 15 && numB <= 25 && numA >= 95 && numA <= 105) {
              coords = { lat: numB, lng: numA };
            } else {
              // Fallback: try combining as "numA, numB" string
              coords = parseCoordinates(numA + ", " + numB);
            }
          }
        }
      } else if (colMap.lat !== undefined && colMap.lng !== undefined) {
        const lat = parseFloat(getRaw(colMap.lat));
        const lng = parseFloat(getRaw(colMap.lng));
        if (!isNaN(lat) && !isNaN(lng)) coords = { lat, lng };
      }

      // Budget: prefer raw numeric value (cell.v)
      const budgetRaw = getRaw(colMap.budget);
      const budgetNum = parseBudgetNumber(budgetRaw);

      const typeInfo = classifyType(getVal(colMap.type));
      const imageRaw = (getVal(colMap.image) || "").trim();
      const imageUrl = parseGoogleDriveImage(imageRaw);

      const fyRaw = getVal(colMap.fiscalYear) || "";
      const fyStr = String(fyRaw).trim();
      const fyYear = extractYear(fyStr); // Extract year number from text

      // Debug first 5 rows
      if (rowIdx < 5) {
        console.log(`[CR-Vision] Row ${rowIdx} fiscalYear raw:`, fyStr, "→ year:", fyYear);
        console.log(`[CR-Vision] Row ${rowIdx} image raw:`, imageRaw);
        console.log(`[CR-Vision] Row ${rowIdx} image parsed:`, imageUrl);
      }

      projects.push({
        id: `${sheetName}-${getVal(colMap.id) || rowIdx + 1}`, // Add sheet name prefix for unique ID
        title: String(title).trim(),
        budget: budgetNum,
        budgetFormatted: formatBudget(budgetRaw),
        district: (getVal(colMap.district) || "").trim(),
        subdistrict: (getVal(colMap.subdistrict) || "").trim(),
        coords: coords,
        typeRaw: (getVal(colMap.type) || "").trim(),
        typeInfo: typeInfo,
        fundSource: (getVal(colMap.fundSource) || "").trim(),
        image: imageUrl,
        description: (getVal(colMap.description) || "").trim(),
        fiscalYear: fyYear, // Use extracted year
        fiscalYearFull: fyStr, // Keep full text for reference
        status: (getVal(colMap.status) || "").trim(),
      });
    });

    return projects;
  }

  // =============================================
  // SAMPLE/FALLBACK DATA
  // =============================================
  function getSampleData() {
    return [
      { id: 1, title: "ก่อสร้างถนนคอนกรีตเสริมเหล็ก หมู่ที่ 3 บ้านป่าซาง ต.แม่ลาว", budget: 2500000, budgetFormatted: formatBudget(2500000), district: "แม่ลาว", coords: { lat: 19.7755, lng: 99.7123 }, typeRaw: "ถนนคอนกรีตเสริมเหล็ก", typeInfo: classifyType("ถนนคอนกรีตเสริมเหล็ก"), fundSource: "เงินอุดหนุนเฉพาะกิจ", image: null, fiscalYear: "2569" },
      { id: 2, title: "ก่อสร้างถนนหินคลุก หมู่ที่ 5 บ้านห้วยไร่ ต.แม่สาย", budget: 1800000, budgetFormatted: formatBudget(1800000), district: "แม่สาย", coords: { lat: 20.4282, lng: 99.8826 }, typeRaw: "ถนนหินคลุก", typeInfo: classifyType("ถนนหินคลุก"), fundSource: "รายได้ อบจ.", image: null, fiscalYear: "2569" },
      { id: 3, title: "ขุดลอกลำน้ำห้วยแม่สาย บ้านแม่สาย หมู่ที่ 1", budget: 3200000, budgetFormatted: formatBudget(3200000), district: "แม่สาย", coords: { lat: 20.435, lng: 99.875 }, typeRaw: "ขุดลอก", typeInfo: classifyType("ขุดลอก"), fundSource: "เงินอุดหนุนทั่วไป", image: null, fiscalYear: "2568" },
      { id: 4, title: "วางท่อระบายน้ำ คสล. หมู่ที่ 7 ต.เวียง อ.เชียงแสน", budget: 1500000, budgetFormatted: formatBudget(1500000), district: "เชียงแสน", coords: { lat: 20.274, lng: 100.088 }, typeRaw: "วางท่อระบายน้ำ", typeInfo: classifyType("วางท่อระบายน้ำ"), fundSource: "เงินอุดหนุนเฉพาะกิจ", image: null, fiscalYear: "2568" },
      { id: 5, title: "ก่อสร้างสวนสุขภาพ บ้านเวียงกลาง ต.เวียง อ.เมือง", budget: 4500000, budgetFormatted: formatBudget(4500000), district: "เมืองเชียงราย", coords: { lat: 19.9107, lng: 99.8407 }, typeRaw: "สวนสุขภาพ", typeInfo: classifyType("สวนสุขภาพ"), fundSource: "รายได้ อบจ.", image: null, fiscalYear: "2569" },
      { id: 6, title: "ก่อสร้างเขื่อนป้องกันตลิ่ง ริมน้ำลาว ต.ดงมะดะ อ.แม่ลาว", budget: 8500000, budgetFormatted: formatBudget(8500000), district: "แม่ลาว", coords: { lat: 19.7525, lng: 99.7285 }, typeRaw: "เขื่อน", typeInfo: classifyType("เขื่อน"), fundSource: "เงินอุดหนุนเฉพาะกิจ", image: null, fiscalYear: "2568" },
      { id: 7, title: "ก่อสร้างถนน คสล. หมู่ที่ 2 บ้านแม่จัน ต.แม่จัน", budget: 2200000, budgetFormatted: formatBudget(2200000), district: "แม่จัน", coords: { lat: 20.165, lng: 99.857 }, typeRaw: "ถนนคอนกรีตเสริมเหล็ก", typeInfo: classifyType("ถนนคอนกรีตเสริมเหล็ก"), fundSource: "เงินอุดหนุนทั่วไป", image: null, fiscalYear: "2569" },
      { id: 8, title: "ขุดลอกหนองน้ำสาธารณะ บ้านร่องห้า ต.พาน อ.พาน", budget: 1200000, budgetFormatted: formatBudget(1200000), district: "พาน", coords: { lat: 19.554, lng: 99.76 }, typeRaw: "ขุดลอก", typeInfo: classifyType("ขุดลอก"), fundSource: "รายได้ อบจ.", image: null, fiscalYear: "2568" },
      { id: 9, title: "ก่อสร้างถนน คสล. หมู่ที่ 9 บ้านแม่สรวย ต.แม่สรวย", budget: 1950000, budgetFormatted: formatBudget(1950000), district: "แม่สรวย", coords: { lat: 19.652, lng: 99.321 }, typeRaw: "ถนนคอนกรีตเสริมเหล็ก", typeInfo: classifyType("ถนนคอนกรีตเสริมเหล็ก"), fundSource: "เงินอุดหนุนเฉพาะกิจ", image: null, fiscalYear: "2569" },
      { id: 10, title: "วางท่อระบายน้ำ หมู่ที่ 4 ต.เวียงชัย อ.เวียงชัย", budget: 2750000, budgetFormatted: formatBudget(2750000), district: "เวียงชัย", coords: { lat: 19.978, lng: 99.92 }, typeRaw: "วางท่อระบายน้ำ", typeInfo: classifyType("วางท่อระบายน้ำ"), fundSource: "รายได้ อบจ.", image: null, fiscalYear: "2568" },
      { id: 11, title: "ก่อสร้างถนนหินคลุก หมู่ที่ 6 ต.เทอดไทย อ.แม่ฟ้าหลวง", budget: 980000, budgetFormatted: formatBudget(980000), district: "แม่ฟ้าหลวง", coords: { lat: 20.289, lng: 99.545 }, typeRaw: "ถนนหินคลุก", typeInfo: classifyType("ถนนหินคลุก"), fundSource: "เงินอุดหนุนทั่วไป", image: null, fiscalYear: "2569" },
      { id: 12, title: "ก่อสร้างเขื่อนป้องกันตลิ่ง ริมน้ำกก ต.ริมกก อ.เมือง", budget: 12000000, budgetFormatted: formatBudget(12000000), district: "เมืองเชียงราย", coords: { lat: 19.928, lng: 99.865 }, typeRaw: "เขื่อน", typeInfo: classifyType("เขื่อน"), fundSource: "เงินอุดหนุนเฉพาะกิจ", image: null, fiscalYear: "2570" },
    ];
  }

  // =============================================
  // APPLICATION STATE
  // =============================================
  const state = {
    allProjects: [],
    filteredProjects: [],
    markers: new Map(),
    activeMarkerId: null,
    map: null,
    streetLayer: null,
    satelliteLayer: null,
    boundaryLayer: null,
    boundaryType: 'subdistrict',  // 'subdistrict' or 'district'
    boundaryVisible: true,
    boundariesData: {
      subdistrict: null,
      district: null,
    },
    geoData: {
      districts: [],           // List of unique districts from GeoJSON
      subdistrictsByDistrict: {},  // Map: { "อำเภอ": ["ตำบล1", "ตำบล2", ...] }
      loaded: false
    }
  };

  // =============================================
  // MAP SETUP
  // =============================================
  function initMap() {
    state.map = L.map("map", {
      center: CONFIG.MAP_CENTER,
      zoom: CONFIG.MAP_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    state.streetLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19 },
    ).addTo(state.map);

    state.satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 },
    );

    L.control.attribution({ position: "bottomleft", prefix: "" })
      .addAttribution('&copy; <a href="https://openstreetmap.org" class="text-blue-400">OSM</a> | CR-Vision')
      .addTo(state.map);
  }

  // =============================================
  // LOAD GEOJSON FOR FILTERS (District/Subdistrict)
  // =============================================
  async function loadGeoJSONForFilters() {
    if (state.geoData.loaded) return; // Already loaded
    
    const geojsonUrl = 'https://raw.githubusercontent.com/chingchai/OpenGISData-Thailand/master/subdistricts.geojson';
    
    try {
      console.log('📍 Loading GeoJSON for filters...');
      const response = await fetch(geojsonUrl);
      if (!response.ok) throw new Error('Failed to load GeoJSON');
      const geojsonData = await response.json();

      const districts = new Set();
      const subdistrictsByDistrict = {};

      // Filter for Chiang Rai (pro_code: '57') and organize data
      geojsonData.features.forEach(feature => {
        const props = feature.properties || {};
        const provinceCode = props.pro_code || props.prov_code;
        
        // Only process Chiang Rai province
        if (provinceCode !== '57' && provinceCode !== 57) return;
        
        const districtName = props.amp_th || props.AMP_TH;
        const subdistrictName = props.tam_th || props.TAM_TH;
        
        if (!districtName || !subdistrictName) return;
        
        districts.add(districtName);
        
        if (!subdistrictsByDistrict[districtName]) {
          subdistrictsByDistrict[districtName] = new Set();
        }
        subdistrictsByDistrict[districtName].add(subdistrictName);
      });

      // Convert Sets to sorted Arrays
      state.geoData.districts = Array.from(districts).sort();
      state.geoData.subdistrictsByDistrict = {};
      Object.keys(subdistrictsByDistrict).forEach(district => {
        state.geoData.subdistrictsByDistrict[district] = Array.from(subdistrictsByDistrict[district]).sort();
      });
      
      state.geoData.loaded = true;
      console.log('✅ GeoJSON loaded:', state.geoData.districts.length, 'districts');
      
    } catch (error) {
      console.error('❌ Failed to load GeoJSON for filters:', error);
    }
  }

  // =============================================
  // LOAD SUBDISTRICT BOUNDARIES (GeoJSON)
  // =============================================
  async function loadSubdistrictBoundaries() {
    if (state.boundariesData.subdistrict) return; // Already loaded
    
    const geojsonUrl = 'https://raw.githubusercontent.com/chingchai/OpenGISData-Thailand/master/subdistricts.geojson';
    
    try {
      console.log('🌐 Loading subdistrict boundaries...');
      const response = await fetch(geojsonUrl);
      if (!response.ok) throw new Error('Failed to load GeoJSON');
      const geojsonData = await response.json();

      console.log('📦 GeoJSON loaded, total features:', geojsonData.features?.length);
      
      let filteredCount = 0;
      
      // สร้าง GeoJSON layer แต่ไม่ add to map ทันที
      const subdistrictLayer = L.geoJSON(geojsonData, {
        filter: function(feature) {
          const props = feature.properties || {};
          const provinceCode = props.pro_code || props.prov_code;
          const provinceName = props.pro_th || props.prov_namt || '';
          
          const isChiangRai = 
            provinceCode === '57' || provinceCode === 57 ||
            provinceName.includes('เชียงราย') || provinceName.includes('CHIANG RAI');
          
          if (isChiangRai) filteredCount++;
          return isChiangRai;
        },
        style: function(feature) {
          return {
            color: '#3b82f6',        // สีน้ำเงิน
            weight: 1.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.08
          };
        },
        onEachFeature: function(feature, layer) {
          const props = feature.properties;
          const tamName = props.tam_th || props.TAM_TH || 'ไม่ระบุ';
          const ampName = props.amp_th || props.AMP_TH || 'ไม่ระบุ';

          layer.on({
            mouseover: function(e) {
              e.target.setStyle({
                fillColor: '#fbbf24',
                fillOpacity: 0.4,
                weight: 2
              });
            },
            mouseout: function(e) {
              e.target.setStyle({
                fillColor: '#3b82f6',
                fillOpacity: 0.08,
                weight: 1.5
              });
            },
            click: function(e) {
              const popupContent = `
                <div style="font-family:'Prompt',sans-serif;padding:8px;">
                  <div style="font-size:16px;font-weight:700;color:#2c3e50;margin-bottom:4px;">
                    ตำบล${tamName}
                  </div>
                  <div style="font-size:14px;color:#64748b;">
                    อำเภอ${ampName}
                  </div>
                </div>
              `;
              e.target.bindPopup(popupContent).openPopup();
            }
          });
        }
      });

      state.boundariesData.subdistrict = subdistrictLayer;
      console.log('✅ Loaded', filteredCount, 'subdistricts for Chiang Rai');
      
      // แสดงผลถ้า boundaryVisible เป็น true
      if (state.boundaryVisible && state.boundaryType === 'subdistrict') {
        subdistrictLayer.addTo(state.map);
        state.boundaryLayer = subdistrictLayer;
      }
    } catch (error) {
      console.error('❌ Failed to load subdistrict boundaries:', error);
    }
  }

  // =============================================
  // LOAD DISTRICT BOUNDARIES (GeoJSON)
  // =============================================
  async function loadDistrictBoundaries() {
    if (state.boundariesData.district) return; // Already loaded
    
    const geojsonUrl = 'https://raw.githubusercontent.com/chingchai/OpenGISData-Thailand/master/districts.geojson';
    
    try {
      console.log('🌐 Loading district boundaries...');
      const response = await fetch(geojsonUrl);
      if (!response.ok) throw new Error('Failed to load GeoJSON');
      const geojsonData = await response.json();

      console.log('📦 GeoJSON loaded, total districts:', geojsonData.features?.length);
      
      let filteredCount = 0;
      
      const districtLayer = L.geoJSON(geojsonData, {
        filter: function(feature) {
          const props = feature.properties || {};
          const provinceCode = props.pro_code || props.prov_code;
          const provinceName = props.pro_th || props.prov_namt || '';
          
          const isChiangRai = 
            provinceCode === '57' || provinceCode === 57 ||
            provinceName.includes('เชียงราย') || provinceName.includes('CHIANG RAI');
          
          if (isChiangRai) filteredCount++;
          return isChiangRai;
        },
        style: function(feature) {
          return {
            color: '#10b981',        // สีเขียว
            weight: 2.5,
            fillColor: '#10b981',
            fillOpacity: 0.12
          };
        },
        onEachFeature: function(feature, layer) {
          const props = feature.properties;
          const ampName = props.amp_th || props.AMP_TH || props.district_name || 'ไม่ระบุ';

          layer.on({
            mouseover: function(e) {
              e.target.setStyle({
                fillColor: '#fbbf24',
                fillOpacity: 0.4,
                weight: 3
              });
            },
            mouseout: function(e) {
              e.target.setStyle({
                fillColor: '#10b981',
                fillOpacity: 0.12,
                weight: 2.5
              });
            },
            click: function(e) {
              const popupContent = `
                <div style="font-family:'Prompt',sans-serif;padding:8px;">
                  <div style="font-size:16px;font-weight:700;color:#2c3e50;margin-bottom:4px;">
                    อำเภอ${ampName}
                  </div>
                  <div style="font-size:14px;color:#64748b;">
                    จังหวัดเชียงราย
                  </div>
                </div>
              `;
              e.target.bindPopup(popupContent).openPopup();
            }
          });
        }
      });

      state.boundariesData.district = districtLayer;
      console.log('✅ Loaded', filteredCount, 'districts for Chiang Rai');
      
      // แสดงผลถ้า boundaryVisible เป็น true และเลือก district
      if (state.boundaryVisible && state.boundaryType === 'district') {
        districtLayer.addTo(state.map);
        state.boundaryLayer = districtLayer;
      }
    } catch (error) {
      console.error('❌ Failed to load district boundaries:', error);
    }
  }

  // =============================================
  // CUSTOM MARKER CREATION
  // =============================================
  function createCustomIcon(category) {
    return L.divIcon({
      className: "",
      html: `<div class="custom-marker custom-marker-${category}" style="width:32px;height:32px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${getIconPath(category)}
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    });
  }

  function getIconPath(category) {
    const paths = {
      // ถนน คสล. — road icon
      "road-concrete": '<path d="M4 19 8 5"/><path d="m8 19 4-14"/><path d="M4 19h16"/><path d="M16 5l4 14"/>',
      // ถนนหินคลุก — truck/gravel icon
      "road-gravel": '<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
      // ขุดลอก — shovel/excavation icon
      "dredge": '<path d="M2 22v-5l5-5 5 5-5 5z"/><path d="M9.5 14.5 16 8"/><path d="m17 2 5 5"/><path d="m21 6-8.5 8.5"/>',
      // วางท่อระบายน้ำ — pipe icon
      "drain-pipe": '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 22 4-10 4 10"/>',
      // รางระบายน้ำ — waves/channel icon
      "drain-channel": '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
      // ท่อลอดเหลี่ยม — box culvert icon
      "culvert": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
      // สวนสุขภาพ — tree/park icon
      "park": '<path d="M10 10v.2A3 3 0 0 1 8.9 16v0H5v0h0a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M16 13v.2A3 3 0 0 1 14.9 19v0H11v0h0a3 3 0 0 1-1-5.8V13a3 3 0 0 1 6 0z"/>',
      // เขื่อน — shield/dam icon
      "dam": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      // ก่อสร้างรั้ว — fence icon
      "fence": '<path d="M4 3v18"/><path d="M12 3v18"/><path d="M20 3v18"/><path d="M4 8h8"/><path d="M12 8h8"/><path d="M4 14h8"/><path d="M12 14h8"/>',
      // อื่นๆ
      "other": '<circle cx="12" cy="12" r="10"/>',
    };
    return paths[category] || paths.other;
  }

  // =============================================
  // POPUP CONTENT
  // =============================================
  function createPopupContent(p) {
    // Debug: log image URL
    if (p.image) {
      console.log("[CR-Vision] Popup image URL:", p.image);
    }
    
    const typeGradient = {
      "road-concrete": "from-amber-500 to-orange-500",
      "road-gravel": "from-yellow-500 to-amber-500",
      "dredge": "from-blue-500 to-blue-600",
      "drain-pipe": "from-cyan-500 to-blue-500",
      "drain-channel": "from-teal-500 to-cyan-600",
      "culvert": "from-indigo-500 to-blue-600",
      "park": "from-emerald-500 to-green-500",
      "dam": "from-red-500 to-rose-500",
      "fence": "from-purple-500 to-violet-500",
      "other": "from-gray-500 to-slate-500",
    };
    const gradient = typeGradient[p.typeInfo.category] || typeGradient.other;

    return `
      <div style="font-family: 'Sarabun', sans-serif;">
        <div class="bg-gradient-to-r ${gradient} px-4 py-3" style="border-radius:8px 8px 0 0;">
          <p style="font-family:'Prompt',sans-serif;font-size:13px;font-weight:600;color:white;line-height:1.4;margin:0;">${p.title}</p>
        </div>
        <div style="padding:12px 16px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#6b7280;font-size:12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>อ.${p.district || "N/A"}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#059669;font-size:14px;font-weight:600;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l-5 3Z"/><path d="M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l-5 3Z"/><path d="M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12"/><path d="M22 9c-4.6 0-7.2 4-7.2 4"/></svg>
            <span>${p.budgetFormatted}</span>
          </div>
          
          ${p.fundSource ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#6b7280;font-size:12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>
            <span>แหล่งงบ: ${p.fundSource}</span>
          </div>` : ""}
          ${p.description ? `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px;color:#6b7280;font-size:12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
            <span style="line-height:1.4;">รายละเอียด: ${p.description}</span>
          </div>` : ""}
          ${p.status ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#6b7280;font-size:12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <span style="font-weight:500;color:${p.status.includes('อยู่ระหว่าง') || p.status.includes('ดำเนินการ') && !p.status.includes('เสร็จสิ้น') ? '#ef4444' : '#10b981'};">สถานะ: ${p.status}</span>
          </div>` : ""}
          <div style="margin-top:8px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <span class="${p.typeInfo.badgeClass}" style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:500;">${p.typeInfo.label}</span>
            ${p.fiscalYear ? `<span style="color:#3b82f6;font-size:12px;font-weight:700;white-space:nowrap;">ปีงบประมาณ : ${p.fiscalYear}</span>` : ""}
          </div>
          ${p.image ? `<div style="width:90%;margin:12px auto 0;border-radius:8px;overflow:hidden;background:#e2e8f0;">
            <img src="${p.image}" alt="${p.title}" referrerpolicy="no-referrer" loading="lazy" style="width:100%;height:auto;max-height:200px;object-fit:contain;display:block;" onerror="this.style.display='none'; const parent = this.parentElement; if (parent) { parent.style.background='#f1f5f9'; parent.style.border='2px dashed #cbd5e1'; parent.style.padding='30px 20px'; parent.style.textAlign='center'; parent.innerHTML='<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'#94a3b8\\' stroke-width=\\'2\\' style=\\'margin:0 auto 8px;\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/><line x1=\\'12\\' y1=\\'8\\' x2=\\'12\\' y2=\\'12\\'/><line x1=\\'12\\' y1=\\'16\\' x2=\\'12.01\\' y2=\\'16\\'/></svg><p style=\\'color:#64748b;font-size:12px;margin:0;\\'>ไม่สามารถโหลดรูปภาพได้<br><small style=\\'color:#94a3b8;font-size:10px;\\'>ตรวจสอบการแชร์ไฟล์</small></p>'; }" />
          </div>` : `<div style="width:90%;margin:12px auto 0;padding:30px 20px;border-radius:8px;background:#f1f5f9;border:2px dashed #cbd5e1;text-align:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 8px;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <p style="color:#64748b;font-size:13px;margin:0;font-weight:500;">ไม่ได้อัปโหลดรูปภาพ</p>
          </div>`}
        </div>
      </div>`;
  }

  // =============================================
  // RENDER MAP MARKERS
  // =============================================
  function renderMarkers(projects) {
    state.markers.forEach((m) => m.remove());
    state.markers.clear();

    projects.forEach((p) => {
      if (!p.coords) return;
      const icon = createCustomIcon(p.typeInfo.category);
      const marker = L.marker([p.coords.lat, p.coords.lng], { icon })
        .addTo(state.map)
        .bindPopup(createPopupContent(p), { maxWidth: 320, closeButton: true });

      marker.on("click", () => {
        state.map.flyTo([p.coords.lat, p.coords.lng], 15, { duration: 0.8 });
        highlightCard(p.id);
        scrollToCard(p.id);
      });

      marker.on("popupclose", () => {
        if (state.activeMarkerId === p.id) {
          state.activeMarkerId = null;
          clearCardHighlights();
        }
      });

      state.markers.set(p.id, marker);
    });
  }

  // =============================================
  // RENDER PROJECT CARDS
  // =============================================
  function renderCards(projects) {
    const container = document.getElementById("projectList");
    const loadingEl = document.getElementById("loadingState");
    const emptyEl = document.getElementById("emptyState");

    loadingEl.classList.add("hidden");
    container.querySelectorAll(".project-card").forEach((el) => el.remove());

    if (projects.length === 0) {
      emptyEl.classList.remove("hidden");
      emptyEl.classList.add("flex");
      return;
    }
    emptyEl.classList.add("hidden");
    emptyEl.classList.remove("flex");

    const fragment = document.createDocumentFragment();

    projects.forEach((p) => {
      const card = document.createElement("div");
      const hasCoords = p.coords !== null;
      
      // แยก className ตามว่ามีพิกัดหรือไม่
      if (hasCoords) {
        card.className = "project-card bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400 rounded-xl p-3.5 cursor-pointer transition-all duration-200 group";
      } else {
        card.className = "project-card bg-white/5 border border-white/10 rounded-xl p-3.5 cursor-default transition-all duration-200 group opacity-50";
      }
      
      card.dataset.id = p.id;

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
          <h3 class="font-heading text-[13px] font-medium text-gray-200 group-hover:text-white leading-snug flex-1">${p.title}</h3>
          ${hasCoords
            ? '<span class="flex-shrink-0 w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md transition-all group-hover:scale-110"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>'
            : '<span class="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-gray-500 opacity-60"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/><line x1="2" x2="22" y1="2" y2="22"/></svg></span>'}
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="${p.typeInfo.badgeClass} text-[10px] font-medium px-2 py-0.5 rounded-full">${p.typeInfo.label}</span>
            ${p.district ? `<span class="text-[11px] text-gray-400">อ.${p.district}</span>` : ""}
            
          </div>
          <span class="text-[13px] font-semibold text-emerald-400">${formatBudgetCompact(p.budget)}</span>
        </div>`;

      card.addEventListener("click", () => { if (hasCoords) panToProject(p); });
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  // =============================================
  // INTERACTIVITY
  // =============================================
  function panToProject(project) {
    if (!project.coords) return;
    state.map.flyTo([project.coords.lat, project.coords.lng], 15, { duration: 0.8 });
    const marker = state.markers.get(project.id);
    if (marker) setTimeout(() => marker.openPopup(), 500);
    highlightCard(project.id);
  }

  function highlightCard(id) {
    clearCardHighlights();
    state.activeMarkerId = id;
    const card = document.querySelector(`.project-card[data-id="${id}"]`);
    if (card) {
      card.classList.add("active", "card-highlight");
      setTimeout(() => card.classList.remove("card-highlight"), 1500);
    }
  }

  function clearCardHighlights() {
    document.querySelectorAll(".project-card.active").forEach((el) => el.classList.remove("active"));
  }

  function scrollToCard(id) {
    const card = document.querySelector(`.project-card[data-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // =============================================
  // FILTERING
  // =============================================
  function applyFilters() {
    const searchTerm = document.getElementById("searchInput").value.trim().toLowerCase();
    const districtVal = document.getElementById("districtFilter").value;
    const subdistrictVal = document.getElementById("subdistrictFilter").value;
    const typeVal = document.getElementById("typeFilter").value;
    const yearVal = document.getElementById("yearFilter").value;
    const statusInProgress = document.getElementById("statusInProgress").checked;
    const statusCompleted = document.getElementById("statusCompleted").checked;

    let filtered = state.allProjects;

    // Debug: log year filtering
    if (yearVal) {
      console.log(`[CR-Vision] Filtering by year: ${yearVal}`);
      const beforeCount = filtered.length;
      filtered = filtered.filter((p) => {
        const match = p.fiscalYear && String(p.fiscalYear) === String(yearVal);
        if (!match && p.fiscalYear) {
          console.log(`  Mismatch: "${p.fiscalYear}" !== "${yearVal}" (types: ${typeof p.fiscalYear} vs ${typeof yearVal})`);
        }
        return match;
      });
      console.log(`[CR-Vision] Year filter: ${beforeCount} → ${filtered.length} projects`);
    }
    if (searchTerm) {
      filtered = filtered.filter((p) =>
        p.title.toLowerCase().includes(searchTerm) ||
        p.district.toLowerCase().includes(searchTerm) ||
        p.subdistrict.toLowerCase().includes(searchTerm) ||
        p.typeRaw.toLowerCase().includes(searchTerm)
      );
    }
    if (districtVal) filtered = filtered.filter((p) => p.district === districtVal);
    if (subdistrictVal) filtered = filtered.filter((p) => p.subdistrict === subdistrictVal);
    if (typeVal) filtered = filtered.filter((p) => p.typeInfo.category === typeVal);

    // Status filter - if no checkbox is checked, show nothing
    if (!statusInProgress && !statusCompleted) {
      filtered = [];
    } else if (statusInProgress || statusCompleted) {
      filtered = filtered.filter((p) => {
        if (!p.status) return false;
        const isInProgress = p.status.includes("อยู่ระหว่าง") || (p.status.includes("ดำเนินการ") && !p.status.includes("เสร็จสิ้น"));
        const isCompleted = p.status.includes("เสร็จสิ้น");
        return (statusInProgress && isInProgress) || (statusCompleted && isCompleted);
      });
    }

    state.filteredProjects = filtered;
    renderCards(filtered);
    renderMarkers(filtered);
    updateResultCount(filtered.length);
    updateTotalProjectCount(yearVal);
    updateStats(filtered);

    // Zoom map based on filter context
    const points = filtered.filter((p) => p.coords).map((p) => [p.coords.lat, p.coords.lng]);
    if (districtVal && points.length > 0) {
      // District selected → zoom to that district's markers
      state.map.flyToBounds(L.latLngBounds(points).pad(0.2), { duration: 0.8 });
    } else if (!districtVal && !searchTerm) {
      // "ทุกอำเภอ" → zoom to all Chiang Rai
      state.map.flyTo(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { duration: 0.8 });
    }

    const clearBtn = document.getElementById("clearFilters");
    if (searchTerm || districtVal || subdistrictVal || typeVal || yearVal) {
      clearBtn.classList.remove("hidden");
    } else {
      clearBtn.classList.add("hidden");
    }
  }

  function updateResultCount(count) {
    document.getElementById("resultCount").textContent = `แสดง ${count} โครงการ`;
    document.getElementById("mobileBadge").textContent = count;
  }

  function updateTotalProjectCount(yearVal) {
    const countEl = document.getElementById("totalProjectCount");
    if (countEl) {
      // Filter by year if selected
      let projectsInYear = state.allProjects;
      if (yearVal) {
        projectsInYear = state.allProjects.filter((p) => p.fiscalYear && String(p.fiscalYear) === String(yearVal));
      }
      const withCoords = projectsInYear.filter(p => p.coords).length;
      countEl.textContent = `ทั้งหมด ${projectsInYear.length} โครงการ (${withCoords} มีพิกัด)`;
    }
  }

  // =============================================
  // POPULATE FILTERS
  // =============================================
  function populateFilters(projects) {
    // Fiscal Year filter
    const years = [...new Set(projects.map((p) => p.fiscalYear).filter(Boolean))].sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numB - numA;
    });
    console.log("[CR-Vision] Years found:", years);
    const yearSelect = document.getElementById("yearFilter");
    years.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = `${y}`;
      yearSelect.appendChild(opt);
    });

    // District filter - Use GeoJSON data if available, fallback to projects
    const districtSelect = document.getElementById("districtFilter");
    const districts = state.geoData.loaded 
      ? state.geoData.districts 
      : [...new Set(projects.map((p) => p.district).filter(Boolean))].sort();
    
    districts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      districtSelect.appendChild(opt);
    });

    // Subdistrict filter - Initially show all from GeoJSON or all from projects
    const subdistrictSelect = document.getElementById("subdistrictFilter");
    if (state.geoData.loaded) {
      // Flatten all subdistricts from all districts
      const allSubdistricts = new Set();
      Object.values(state.geoData.subdistrictsByDistrict).forEach(subs => {
        subs.forEach(s => allSubdistricts.add(s));
      });
      const sortedSubs = Array.from(allSubdistricts).sort();
      sortedSubs.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        subdistrictSelect.appendChild(opt);
      });
    } else {
      // Fallback to projects data
      const subdistricts = [...new Set(projects.map((p) => p.subdistrict).filter(Boolean))].sort();
      subdistricts.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        subdistrictSelect.appendChild(opt);
      });
    }

    // Type filter — all 9 categories
    const typeCategories = [
      { value: "road-concrete", label: "ถนน คสล." },
      { value: "road-gravel", label: "ถนนหินคลุก" },
      { value: "dredge", label: "ขุดลอก" },
      { value: "drain-pipe", label: "วางท่อระบายน้ำ" },
      { value: "drain-channel", label: "รางระบายน้ำ" },
      { value: "culvert", label: "ท่อลอดเหลี่ยม" },
      { value: "park", label: "สวนสุขภาพ" },
      { value: "dam", label: "เขื่อน" },
      { value: "fence", label: "ก่อสร้างรั้ว" },
      { value: "other", label: "อื่นๆ" },
    ];
    const typesInData = new Set(projects.map((p) => p.typeInfo.category));
    const typeSelect = document.getElementById("typeFilter");
    typeCategories.forEach((tc) => {
      if (typesInData.has(tc.value)) {
        const opt = document.createElement("option");
        opt.value = tc.value;
        opt.textContent = tc.label;
        typeSelect.appendChild(opt);
      }
    });
    
    // Setup district change listener to update subdistrict options
    setupDistrictSubdistrictLink();
  }

  // =============================================
  // DISTRICT-SUBDISTRICT LINK
  // =============================================
  function setupDistrictSubdistrictLink() {
    if (!state.geoData.loaded) return; // Only if GeoJSON is loaded
    
    const districtSelect = document.getElementById("districtFilter");
    const subdistrictSelect = document.getElementById("subdistrictFilter");
    
    // Remove existing listener if any (prevent double binding)
    const newDistrictSelect = districtSelect.cloneNode(true);
    districtSelect.parentNode.replaceChild(newDistrictSelect, districtSelect);
    
    newDistrictSelect.addEventListener("change", () => {
      const selectedDistrict = newDistrictSelect.value;
      
      // Save current subdistrict selection
      const currentSubdistrict = subdistrictSelect.value;
      
      // Clear subdistrict options (except "ทุกตำบล")
      subdistrictSelect.innerHTML = '<option value="">ทุกตำบล</option>';
      
      if (!selectedDistrict) {
        // No district selected → show all subdistricts
        const allSubdistricts = new Set();
        Object.values(state.geoData.subdistrictsByDistrict).forEach(subs => {
          subs.forEach(s => allSubdistricts.add(s));
        });
        const sortedSubs = Array.from(allSubdistricts).sort();
        sortedSubs.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          subdistrictSelect.appendChild(opt);
        });
      } else {
        // District selected → show only subdistricts in that district
        const subdistricts = state.geoData.subdistrictsByDistrict[selectedDistrict] || [];
        subdistricts.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          subdistrictSelect.appendChild(opt);
        });
      }
      
      // Restore subdistrict selection if it exists in new options
      if (currentSubdistrict) {
        const optionExists = Array.from(subdistrictSelect.options).some(opt => opt.value === currentSubdistrict);
        if (optionExists) {
          subdistrictSelect.value = currentSubdistrict;
        } else {
          subdistrictSelect.value = ""; // Reset if not in new options
        }
      }
      
      // Trigger filter update
      applyFilters();
    });
  }

  // =============================================
  // UPDATE STATS
  // =============================================
  function updateStats(projects) {
    document.getElementById("statTotal").textContent = projects.length;
    const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
    document.getElementById("statBudget").textContent = Math.round(totalBudget).toLocaleString("th-TH");
    const districtCount = new Set(projects.map((p) => p.district).filter(Boolean)).size;
    document.getElementById("statDistricts").textContent = districtCount;
  }

  // =============================================
  // DEBOUNCE
  // =============================================
  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  // =============================================
  // MAP LAYER TOGGLE
  // =============================================
  function setupLayerToggle() {
    const streetBtn = document.getElementById("layerStreet");
    const satBtn = document.getElementById("layerSatellite");

    streetBtn.addEventListener("click", () => {
      state.map.removeLayer(state.satelliteLayer);
      state.map.addLayer(state.streetLayer);
      streetBtn.className = "map-layer-btn active flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-blue-600 text-white";
      satBtn.className = "map-layer-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-gray-400 hover:text-white hover:bg-slate-700";
    });

    satBtn.addEventListener("click", () => {
      state.map.removeLayer(state.streetLayer);
      state.map.addLayer(state.satelliteLayer);
      satBtn.className = "map-layer-btn active flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-blue-600 text-white";
      streetBtn.className = "map-layer-btn flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-gray-400 hover:text-white hover:bg-slate-700";
    });
  }

  // =============================================
  // ZOOM CONTROLS
  // =============================================
  function setupZoomControls() {
    document.getElementById("zoomIn").addEventListener("click", () => state.map.zoomIn());
    document.getElementById("zoomOut").addEventListener("click", () => state.map.zoomOut());
    document.getElementById("zoomFit").addEventListener("click", () => {
      const points = state.filteredProjects.filter((p) => p.coords).map((p) => [p.coords.lat, p.coords.lng]);
      if (points.length > 0) state.map.flyToBounds(L.latLngBounds(points).pad(0.15), { duration: 0.8 });
    });
  }

  // =============================================
  // MOBILE SIDEBAR TOGGLE
  // =============================================
  function setupMobileToggle() {
    const sidebar = document.getElementById("sidebar");
    const openBtn = document.getElementById("openSidebarBtn");
    const closeBtn = document.getElementById("closeSidebarBtn");

    openBtn.addEventListener("click", () => { sidebar.classList.add("active"); openBtn.classList.add("hidden"); });
    closeBtn.addEventListener("click", () => { sidebar.classList.remove("active"); openBtn.classList.remove("hidden"); });

    state.map.on("click", () => {
      if (window.innerWidth < 1024) { sidebar.classList.remove("active"); openBtn.classList.remove("hidden"); }
    });
  }

  // =============================================
  // FULLSCREEN MODE TOGGLE
  // =============================================
  function setupFullscreenToggle() {
    const toggleBtn = document.getElementById("toggleFullscreen");
    const sidebar = document.getElementById("sidebar");
    const mapControls = document.getElementById("mapControls");
    const mapLegend = document.getElementById("mapLegend");
    const boundaryControls = document.getElementById("boundaryControls");
    const openBtn = document.getElementById("openSidebarBtn");
    
    let isFullscreen = false;

    toggleBtn.addEventListener("click", () => {
      isFullscreen = !isFullscreen;
      
      if (isFullscreen) {
        // ซ่อนเมนูด้านซ้าย และ controls ด้านขวา (ยกเว้นปุ่ม toggle)
        sidebar.style.display = "none";
        mapControls.style.display = "none";
        mapLegend.style.display = "none";
        boundaryControls.style.display = "none";
        openBtn.style.display = "none";
        
        // เปลี่ยนไอคอนเป็น minimize
        const icon = toggleBtn.querySelector("i");
        icon.setAttribute("data-lucide", "minimize");
        lucide.createIcons();
        toggleBtn.title = "แสดงเมนู";
      } else {
        // แสดงเมนูทั้งหมดกลับมา
        sidebar.style.display = "";
        mapControls.style.display = "";
        mapLegend.style.display = "";
        boundaryControls.style.display = "";
        if (window.innerWidth >= 1024) {
          openBtn.style.display = "none";
        } else {
          openBtn.style.display = "";
        }
        
        // เปลี่ยนไอคอนเป็น maximize
        const icon = toggleBtn.querySelector("i");
        icon.setAttribute("data-lucide", "maximize");
        lucide.createIcons();
        toggleBtn.title = "ซ่อนเมนู";
      }
      
      // อัพเดตขนาดแผนที่
      setTimeout(() => state.map.invalidateSize(), 100);
    });
  }

  // =============================================
  // BOUNDARY CONTROLS
  // =============================================
  function setupBoundaryControls() {
    const toggleBtn = document.getElementById("toggleBoundary");
    const districtBtn = document.getElementById("boundaryDistrict");
    const subdistrictBtn = document.getElementById("boundarySubdistrict");
    
    // Toggle boundary visibility
    toggleBtn.addEventListener("click", () => {
      state.boundaryVisible = !state.boundaryVisible;
      
      if (state.boundaryVisible) {
        toggleBtn.classList.remove("text-gray-400", "hover:text-white", "hover:bg-slate-700");
        toggleBtn.classList.add("bg-emerald-600", "text-white");
        
        // แสดง boundary ตามประเภทที่เลือก
        if (state.boundaryType === 'subdistrict' && state.boundariesData.subdistrict) {
          state.boundariesData.subdistrict.addTo(state.map);
          state.boundaryLayer = state.boundariesData.subdistrict;
        } else if (state.boundaryType === 'district' && state.boundariesData.district) {
          state.boundariesData.district.addTo(state.map);
          state.boundaryLayer = state.boundariesData.district;
        }
      } else {
        toggleBtn.classList.remove("bg-emerald-600", "text-white");
        toggleBtn.classList.add("text-gray-400", "hover:text-white", "hover:bg-slate-700");
        
        // ซ่อน boundary
        if (state.boundaryLayer) {
          state.map.removeLayer(state.boundaryLayer);
          state.boundaryLayer = null;
        }
      }
    });
    
    // Switch to district level
    districtBtn.addEventListener("click", async () => {
      if (state.boundaryType === 'district') return; // Already selected
      
      state.boundaryType = 'district';
      
      // อัพเดต UI
      districtBtn.classList.remove("text-gray-400", "hover:text-white", "hover:bg-slate-700");
      districtBtn.classList.add("bg-blue-600", "text-white", "active");
      subdistrictBtn.classList.remove("bg-blue-600", "text-white", "active");
      subdistrictBtn.classList.add("text-gray-400", "hover:text-white", "hover:bg-slate-700");
      
      // ลบ layer เก่า
      if (state.boundaryLayer) {
        state.map.removeLayer(state.boundaryLayer);
        state.boundaryLayer = null;
      }
      
      // โหลดและแสดง district boundaries
      if (!state.boundariesData.district) {
        await loadDistrictBoundaries();
      }
      
      if (state.boundaryVisible && state.boundariesData.district) {
        state.boundariesData.district.addTo(state.map);
        state.boundaryLayer = state.boundariesData.district;
      }
    });
    
    // Switch to subdistrict level
    subdistrictBtn.addEventListener("click", async () => {
      if (state.boundaryType === 'subdistrict') return; // Already selected
      
      state.boundaryType = 'subdistrict';
      
      // อัพเดต UI
      subdistrictBtn.classList.remove("text-gray-400", "hover:text-white", "hover:bg-slate-700");
      subdistrictBtn.classList.add("bg-blue-600", "text-white", "active");
      districtBtn.classList.remove("bg-blue-600", "text-white", "active");
      districtBtn.classList.add("text-gray-400", "hover:text-white", "hover:bg-slate-700");
      
      // ลบ layer เก่า
      if (state.boundaryLayer) {
        state.map.removeLayer(state.boundaryLayer);
        state.boundaryLayer = null;
      }
      
      // แสดง subdistrict boundaries
      if (state.boundaryVisible && state.boundariesData.subdistrict) {
        state.boundariesData.subdistrict.addTo(state.map);
        state.boundaryLayer = state.boundariesData.subdistrict;
      }
    });
  }

  // =============================================
  // EVENT LISTENERS
  // =============================================
  function setupEventListeners() {
    document.getElementById("searchInput").addEventListener("input", debounce(applyFilters, CONFIG.DEBOUNCE_MS));
    // Note: districtFilter change is handled by setupDistrictSubdistrictLink()
    // Don't add applyFilters() here for districtFilter to avoid double triggering
    document.getElementById("subdistrictFilter").addEventListener("change", applyFilters);
    document.getElementById("typeFilter").addEventListener("change", applyFilters);
    document.getElementById("yearFilter").addEventListener("change", applyFilters);
    document.getElementById("statusInProgress").addEventListener("change", applyFilters);
    document.getElementById("statusCompleted").addEventListener("change", applyFilters);

    // Click on totalProjectCount to show all projects in selected year
    document.getElementById("totalProjectCount").addEventListener("click", () => {
      const yearVal = document.getElementById("yearFilter").value;
      let projectsToShow = state.allProjects;
      if (yearVal) {
        projectsToShow = state.allProjects.filter((p) => p.fiscalYear && String(p.fiscalYear) === String(yearVal));
      }
      state.filteredProjects = projectsToShow;
      renderCards(projectsToShow);
      renderMarkers(projectsToShow);
      updateResultCount(projectsToShow.length);
      updateStats(projectsToShow);
      
      // Zoom to fit all projects
      const points = projectsToShow.filter((p) => p.coords).map((p) => [p.coords.lat, p.coords.lng]);
      if (points.length > 0) {
        state.map.flyToBounds(L.latLngBounds(points).pad(0.15), { duration: 0.8 });
      }
    });

    // Click on totalProjectCount to show all projects in selected year
    document.getElementById("totalProjectCount").addEventListener("click", () => {
      const yearVal = document.getElementById("yearFilter").value;
      let projectsToShow = state.allProjects;
      if (yearVal) {
        projectsToShow = state.allProjects.filter((p) => p.fiscalYear && String(p.fiscalYear) === String(yearVal));
      }
      state.filteredProjects = projectsToShow;
      renderCards(projectsToShow);
      renderMarkers(projectsToShow);
      updateResultCount(projectsToShow.length);
      updateStats(projectsToShow);
      
      // Zoom to fit all projects
      const points = projectsToShow.filter((p) => p.coords).map((p) => [p.coords.lat, p.coords.lng]);
      if (points.length > 0) {
        state.map.flyToBounds(L.latLngBounds(points).pad(0.15), { duration: 0.8 });
      }
    });

    document.getElementById("clearFilters").addEventListener("click", () => {
      document.getElementById("searchInput").value = "";
      document.getElementById("districtFilter").value = "";
      document.getElementById("typeFilter").value = "";
      document.getElementById("yearFilter").value = "";
      document.getElementById("statusInProgress").checked = true;
      document.getElementById("statusCompleted").checked = true;
      
      // Reset subdistrict dropdown to show all
      const subdistrictSelect = document.getElementById("subdistrictFilter");
      subdistrictSelect.innerHTML = '<option value="">ทุกตำบล</option>';
      if (state.geoData.loaded) {
        const allSubdistricts = new Set();
        Object.values(state.geoData.subdistrictsByDistrict).forEach(subs => {
          subs.forEach(s => allSubdistricts.add(s));
        });
        const sortedSubs = Array.from(allSubdistricts).sort();
        sortedSubs.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          subdistrictSelect.appendChild(opt);
        });
      }
      
      applyFilters();
    });
  }

  // =============================================
  // INIT
  // =============================================
  async function init() {
    lucide.createIcons();
    initMap();
    loadSubdistrictBoundaries();  // โหลดขอบเขตตำบล
    setupLayerToggle();
    setupZoomControls();
    setupMobileToggle();
    setupFullscreenToggle();
    setupBoundaryControls();  // Setup boundary controls
    setupEventListeners();

    let projects;
    try {
      projects = await fetchSheetData();
      if (projects.length === 0) throw new Error("No data returned");
    } catch (err) {
      console.warn("Failed to fetch from Google Sheets, using sample data:", err.message);
      projects = getSampleData();
    }

    state.allProjects = projects;
    state.filteredProjects = projects;

    // Load GeoJSON for filter dropdowns
    await loadGeoJSONForFilters();
    
    populateFilters(projects);
    updateStats(projects);
    renderCards(projects);
    renderMarkers(projects);
    updateResultCount(projects.length);
    updateTotalProjectCount(null);

    const points = projects.filter((p) => p.coords).map((p) => [p.coords.lat, p.coords.lng]);
    if (points.length > 0) state.map.fitBounds(L.latLngBounds(points).pad(0.15));

    lucide.createIcons();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
