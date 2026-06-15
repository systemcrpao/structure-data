/* =============================================
   CR-Vision Analytics — Client-side tracker
   บันทึกสถิติการใช้งานไว้ใน localStorage
   ============================================= */
(function () {
  'use strict';

  const NS          = 'crpao_analytics';   // localStorage key
  const MAX_SESS    = 1000;               // จำนวน session สูงสุดที่เก็บ
  const MAX_EVENTS  = 5000;              // จำนวน event สูงสุดที่เก็บ

  // ─── Storage helpers ───────────────────────
  function load() {
    try {
      return JSON.parse(localStorage.getItem(NS)) || { sessions: [], events: [] };
    } catch (e) {
      return { sessions: [], events: [] };
    }
  }

  function save(data) {
    try {
      if (data.sessions.length > MAX_SESS)
        data.sessions = data.sessions.slice(-MAX_SESS);
      if ((data.events || []).length > MAX_EVENTS)
        data.events = data.events.slice(-MAX_EVENTS);
      localStorage.setItem(NS, JSON.stringify(data));
    } catch (e) {/* quota exceeded — silent fail */}
  }

  // ─── User-agent detection ───────────────────
  function detectUA() {
    const s = navigator.userAgent;
    let browser = 'Other';
    if (/Edg\//i.test(s))         browser = 'Edge';
    else if (/Chrome\//i.test(s)) browser = 'Chrome';
    else if (/Firefox\//i.test(s))browser = 'Firefox';
    else if (/Safari\//i.test(s)) browser = 'Safari';

    let device = 'Desktop';
    if (/Mobi/i.test(s))           device = 'Mobile';
    else if (/Tablet|iPad/i.test(s)) device = 'Tablet';

    return { browser, device };
  }

  // ─── Session record ─────────────────────────
  const sessionId = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const { browser, device } = detectUA();
  const nowDate = new Date().toISOString().split('T')[0];

  const session = {
    id:         sessionId,
    ts:         Date.now(),
    date:       nowDate,
    hour:       new Date().getHours(),
    device:     device,
    browser:    browser,
    screen:     screen.width + 'x' + screen.height,
    ref:        (function() {
                  try { return document.referrer ? new URL(document.referrer).hostname : 'direct'; }
                  catch (e) { return 'direct'; }
                })(),
    duration:   0,
    eventCount: 0,
    isReturn:   !!localStorage.getItem(NS)   // เคยเข้าใช้มาก่อน = ผู้ใช้ซ้ำ
  };

  const _data = load();
  _data.sessions = _data.sessions || [];
  _data.events   = _data.events   || [];
  _data.sessions.push(session);
  save(_data);

  // บันทึก duration + ส่งไป GAS เมื่อออกจากหน้า
  window.addEventListener('pagehide', function () {
    const d = load();
    const s = d.sessions.find(function (x) { return x.id === sessionId; });
    if (!s) return;

    s.duration = Math.round((Date.now() - session.ts) / 1000);
    save(d);

    // รวม event counts ของ session นี้เป็น JSON สรุป
    const myEvents = d.events.filter(function (e) { return e.sid === sessionId; });
    const evCounts = {};
    myEvents.forEach(function (e) {
      evCounts[e.name] = (evCounts[e.name] || 0) + 1;
    });

    // ส่งไป GAS (fire-and-forget)
    const gasUrl = window.GAS_WEBAPP_URL;
    if (gasUrl && !gasUrl.includes('REPLACE_WITH')) {
      const payload = JSON.stringify({
        action: 'logVisit',
        session: {
          id:         s.id,
          date:       s.date,
          hour:       s.hour,
          device:     s.device,
          browser:    s.browser,
          screen:     s.screen,
          ref:        s.ref,
          duration:   s.duration,
          eventCount: s.eventCount,
          isReturn:   s.isReturn,
          eventsJSON: JSON.stringify(evCounts),
        },
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(gasUrl, payload);
        } else {
          fetch(gasUrl, { method: 'POST', body: payload }).catch(function () {});
        }
      } catch (e) { /* silent fail */ }
    }
  });

  // ─── Public API ─────────────────────────────
  window.crAnalytics = {
    /** บันทึก event */
    track: function (eventName, detail) {
      const d = load();
      d.events.push({
        ts:     Date.now(),
        date:   nowDate,
        sid:    sessionId,
        name:   eventName,
        detail: detail !== undefined ? detail : null
      });
      const s = d.sessions.find(function (x) { return x.id === sessionId; });
      if (s) s.eventCount = (s.eventCount || 0) + 1;
      save(d);
    },
    /** ดึงข้อมูลดิบทั้งหมด */
    getData: function () { return load(); },
    /** ล้างข้อมูลทั้งหมด */
    clear: function () { localStorage.removeItem(NS); }
  };

  // ─── DOM event listeners ────────────────────
  // รอให้ DOM พร้อมก่อนแนบ listeners
  function attachListeners() {

    function on(id, evt, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    }

    // Map layer switch
    on('layerStreet',    'click', function () { window.crAnalytics.track('layer_switch', 'street'); });
    on('layerSatellite', 'click', function () { window.crAnalytics.track('layer_switch', 'satellite'); });

    // Boundary controls
    on('toggleBoundary',    'click', function () { window.crAnalytics.track('boundary_toggle'); });
    on('boundaryDistrict',  'click', function () { window.crAnalytics.track('boundary_level', 'district'); });
    on('boundarySubdistrict','click', function () { window.crAnalytics.track('boundary_level', 'subdistrict'); });

    // My location
    on('toggleMyLocation', 'click', function () { window.crAnalytics.track('location_toggle'); });

    // Zoom
    on('zoomIn',  'click', function () { window.crAnalytics.track('zoom', 'in'); });
    on('zoomOut', 'click', function () { window.crAnalytics.track('zoom', 'out'); });
    on('zoomFit', 'click', function () { window.crAnalytics.track('zoom', 'fit'); });

    // Fullscreen / legend
    on('toggleFullscreen', 'click', function () { window.crAnalytics.track('fullscreen_toggle'); });
    on('legendToggleBtn',  'click', function () { window.crAnalytics.track('legend_toggle'); });

    // Search (debounced — track after 1.5 s typing stop, record only length for privacy)
    var searchTimer = null;
    on('searchInput', 'input', function (e) {
      clearTimeout(searchTimer);
      var len = e.target.value.length;
      searchTimer = setTimeout(function () {
        if (len > 0) window.crAnalytics.track('search', len);
      }, 1500);
    });

    // Filters
    on('yearFilter',        'change', function (e) { window.crAnalytics.track('filter_year',         e.target.value || 'all'); });
    on('districtFilter',    'change', function (e) { window.crAnalytics.track('filter_district',     e.target.value || 'all'); });
    on('subdistrictFilter', 'change', function (e) { window.crAnalytics.track('filter_subdistrict',  e.target.value || 'all'); });
    on('typeFilter',        'change', function (e) { window.crAnalytics.track('filter_type',         e.target.value || 'all'); });
    on('clearFilters',      'click',  function ()  { window.crAnalytics.track('filter_clear'); });

    // Status checkboxes
    on('statusInProgress', 'change', function (e) { window.crAnalytics.track('status_filter', { type: 'in_progress', checked: e.target.checked }); });
    on('statusCompleted',  'change', function (e) { window.crAnalytics.track('status_filter', { type: 'completed',   checked: e.target.checked }); });

    // Project card clicks (event delegation on projectList)
    var projectList = document.getElementById('projectList');
    if (projectList) {
      projectList.addEventListener('click', function (e) {
        var card = e.target.closest('[data-id]');
        if (card) window.crAnalytics.track('project_click');
      });
    }

    // Mobile sidebar open
    on('openSidebarBtn', 'click', function () { window.crAnalytics.track('mobile_sidebar_open'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachListeners);
  } else {
    // DOM already loaded
    setTimeout(attachListeners, 100);
  }

})();
