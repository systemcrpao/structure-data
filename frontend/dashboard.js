/* =============================================
   CR-Vision Dashboard — Logic
   Auth ใช้ CRAuth (auth.js) — ไม่มี login form ที่นี่อีกแล้ว
   ============================================= */
(function () {
  'use strict';

  // =============================================
  // AUTH GUARD — ต้องมี session และ role = director (หรือ admin)
  // =============================================
  var _session = window.CRAuth.requireRole(['director']);
  // requireRole คืนค่า session object ถ้าผ่าน หรือ redirect ถ้าไม่ผ่าน

  // =============================================
  // ANALYTICS DATA
  // =============================================
  const CONFIG = {
    ANALYTICS_KEY: 'crpao_analytics',
  };

  function getAnalyticsData() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.ANALYTICS_KEY)) || { sessions: [], events: [] };
    } catch (e) { return { sessions: [], events: [] }; }
  }

  // =============================================
  // UI ELEMENTS
  // =============================================
  const $ = function (id) { return document.getElementById(id); };

  // =============================================
  // INIT — Session ผ่านแล้ว เริ่ม build dashboard ได้เลย
  // =============================================
  if (!_session) return; // กำลัง redirect อยู่ — หยุดทำงาน

  buildDashboard();
  lucide.createIcons();

  // แสดง user label ใน top bar
  (function () {
    var el = $('dashUserLabel');
    if (el && _session) {
      var label = _session.displayRole || window.CRAuth.getRoleLabel(_session.role);
      el.textContent = _session.user + ' · ' + label;
    }
  })();

  // Logout
  $('logoutBtn').addEventListener('click', function () { window.CRAuth.logout(); });
  $('exportBtn').addEventListener('click', exportCSV);

  // =============================================
  // CHART.JS DEFAULTS (dark theme)
  // =============================================
  Chart.defaults.color           = '#94a3b8';
  Chart.defaults.borderColor     = 'rgba(71,85,105,0.35)';
  Chart.defaults.font.family     = "'Sarabun', sans-serif";
  Chart.defaults.font.size       = 11;

  const PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

  let chartInstances = {};

  function destroyChart(key) {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  }

  // =============================================
  // UTILITY HELPERS
  // =============================================
  function formatDuration(secs) {
    if (!secs || secs <= 0) return '< 1 วิ';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return s + ' วิ';
    return m + ' น. ' + (s > 0 ? s + ' วิ' : '');
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function last30Days() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }

  function countBy(arr, key) {
    const map = {};
    arr.forEach(function (item) {
      const k = item[key] || 'Other';
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function countEvents(events, name) {
    return events.filter(function (e) { return e.name === name; }).length;
  }

  function countEventsByPrefix(events, prefix) {
    return events.filter(function (e) { return e.name && e.name.startsWith(prefix); }).length;
  }

  // =============================================
  // BUILD DASHBOARD
  // =============================================
  function buildDashboard() {
    const raw      = getAnalyticsData();
    const sessions = raw.sessions || [];
    const events   = raw.events   || [];
    const today    = todayISO();

    // ── KPIs ───────────────────────────────────
    $('kpiTotalSessions').textContent  = sessions.length.toLocaleString('th-TH');
    $('kpiToday').textContent          = sessions.filter(function (s) { return s.date === today; }).length.toLocaleString('th-TH');
    $('kpiReturning').textContent      = sessions.filter(function (s) { return s.isReturn; }).length.toLocaleString('th-TH');
    $('kpiTotalEvents').textContent    = events.length.toLocaleString('th-TH');
    $('kpiSearches').textContent       = countEvents(events, 'search').toLocaleString('th-TH');
    $('kpiProjectClicks').textContent  = countEvents(events, 'project_click').toLocaleString('th-TH');

    // Avg duration (only sessions with recorded duration > 0)
    const withDur = sessions.filter(function (s) { return s.duration > 0; });
    if (withDur.length > 0) {
      const avgSec = Math.round(withDur.reduce(function (a, s) { return a + s.duration; }, 0) / withDur.length);
      $('kpiAvgDuration').textContent = (avgSec / 60).toFixed(1);
    } else {
      $('kpiAvgDuration').textContent = '—';
    }

    // Peak hour
    const hourCounts = new Array(24).fill(0);
    sessions.forEach(function (s) { if (s.hour !== undefined) hourCounts[s.hour]++; });
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    $('kpiPeakHour').textContent = sessions.length > 0 ? peakHour + ':00 น.' : '—';

    // Visitor trend (vs previous 7 days)
    const days7  = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days7.push(d.toISOString().split('T')[0]); }
    const days7Prev = [];
    for (let i = 13; i >= 7; i--) { const d = new Date(); d.setDate(d.getDate() - i); days7Prev.push(d.toISOString().split('T')[0]); }
    const thisWeek = sessions.filter(function (s) { return days7.includes(s.date); }).length;
    const lastWeek = sessions.filter(function (s) { return days7Prev.includes(s.date); }).length;
    const trendEl = $('kpiVisitorTrend');
    if (lastWeek > 0) {
      const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
      trendEl.textContent = (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(pct) + '%';
      trendEl.className = 'text-[10px] font-medium ' + (pct >= 0 ? 'text-emerald-400' : 'text-red-400');
    }

    // Last updated
    $('lastUpdated').textContent = 'อัปเดต: ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    // ── Charts ─────────────────────────────────
    buildDailyChart(sessions);
    buildDeviceChart(sessions);
    buildHourlyChart(hourCounts);
    buildBrowserChart(sessions);

    // ── Tables ─────────────────────────────────
    buildFeatureTable(events);
    buildReferrerTable(sessions);
    buildSessionTable(sessions);

    // ── Wire export/clear buttons ───────────────
    $('exportCsvBtn').onclick = exportCSV;
    $('clearDataBtn').onclick = clearData;
  }

  // ── DAILY BAR CHART ──────────────────────────
  function buildDailyChart(sessions) {
    destroyChart('daily');
    const days  = last30Days();
    const byDay = countBy(sessions, 'date');
    const data  = days.map(function (d) { return byDay[d] || 0; });
    const labels = days.map(function (d) {
      const parts = d.split('-');
      return parts[2] + '/' + parts[1];
    });

    chartInstances.daily = new Chart($('chartDaily'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'การเข้าใช้งาน',
          data:  data,
          backgroundColor: 'rgba(59,130,246,0.6)',
          borderColor:     '#3b82f6',
          borderWidth:     1,
          borderRadius:    4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
        },
      },
    });
  }

  // ── DEVICE DOUGHNUT ───────────────────────────
  function buildDeviceChart(sessions) {
    destroyChart('device');
    const counts = countBy(sessions, 'device');
    const labels = Object.keys(counts);
    const data   = labels.map(function (l) { return counts[l]; });

    chartInstances.device = new Chart($('chartDevice'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data:            data,
          backgroundColor: PALETTE.slice(0, labels.length),
          borderWidth:     2,
          borderColor:     '#1e293b',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                const pct   = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                return ' ' + ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
              },
            },
          },
        },
        cutout: '65%',
      },
    });

    // Custom legend
    const legend = $('deviceLegend');
    legend.innerHTML = '';
    labels.forEach(function (label, i) {
      const total = data.reduce(function (a, b) { return a + b; }, 0);
      const pct   = total > 0 ? Math.round((data[i] / total) * 100) : 0;
      legend.innerHTML += '<div class="flex items-center justify-between text-xs">'
        + '<div class="flex items-center gap-1.5">'
        + '<span class="w-2.5 h-2.5 rounded-sm" style="background:' + PALETTE[i] + '"></span>'
        + '<span class="text-gray-300">' + label + '</span>'
        + '</div>'
        + '<span class="text-gray-400">' + data[i] + ' (' + pct + '%)</span>'
        + '</div>';
    });
  }

  // ── HOURLY LINE CHART ────────────────────────
  function buildHourlyChart(hourCounts) {
    destroyChart('hourly');
    const labels = [];
    for (let h = 0; h < 24; h++) labels.push(h + ':00');

    chartInstances.hourly = new Chart($('chartHourly'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label:           'การเข้าใช้งาน',
          data:            hourCounts,
          fill:            true,
          backgroundColor: 'rgba(6,182,212,0.15)',
          borderColor:     '#06b6d4',
          borderWidth:     2,
          pointRadius:     2,
          pointHoverRadius:5,
          tension:         0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
        },
      },
    });
  }

  // ── BROWSER HORIZONTAL BAR ───────────────────
  function buildBrowserChart(sessions) {
    destroyChart('browser');
    const counts = countBy(sessions, 'browser');
    const sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
    const labels = sorted.map(function (x) { return x[0]; });
    const data   = sorted.map(function (x) { return x[1]; });

    chartInstances.browser = new Chart($('chartBrowser'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label:           'ครั้ง',
          data:            data,
          backgroundColor: PALETTE.slice(0, labels.length),
          borderWidth:     0,
          borderRadius:    4,
        }],
      },
      options: {
        indexAxis:           'y',
        responsive:          true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  // ── FEATURE USAGE TABLE ──────────────────────
  var EVENT_LABELS = {
    'layer_switch':       'เปลี่ยน Layer แผนที่',
    'boundary_toggle':    'เปิด/ปิดเขตแบ่ง',
    'boundary_level':     'เปลี่ยนระดับเขต (อำเภอ/ตำบล)',
    'location_toggle':    'แสดงตำแหน่งของฉัน',
    'search':             'ค้นหาโครงการ',
    'filter_year':        'กรองตามปีงบ',
    'filter_district':    'กรองตามอำเภอ',
    'filter_subdistrict': 'กรองตามตำบล',
    'filter_type':        'กรองตามประเภทงาน',
    'status_filter':      'กรองสถานะโครงการ',
    'filter_clear':       'ล้างตัวกรอง',
    'project_click':      'คลิกดูโครงการ',
    'zoom':               'ซูมแผนที่',
    'fullscreen_toggle':  'เปิด/ปิด Fullscreen',
    'legend_toggle':      'เปิด/ปิด Legend',
    'mobile_sidebar_open':'เปิด Sidebar มือถือ',
  };

  function buildFeatureTable(events) {
    const counts = {};
    events.forEach(function (e) {
      const key = e.name || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 12);

    const total = sorted.reduce(function (a, x) { return a + x[1]; }, 0);
    const el    = $('featureTable');
    el.innerHTML = '';

    if (sorted.length === 0) {
      el.innerHTML = '<p class="text-xs text-gray-500 text-center py-6">ยังไม่มีข้อมูล</p>';
      return;
    }

    sorted.forEach(function (pair) {
      const label = EVENT_LABELS[pair[0]] || pair[0];
      const count = pair[1];
      const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
      el.innerHTML += '<div class="flex items-center gap-2">'
        + '<div class="flex-1 min-w-0">'
        + '<div class="flex justify-between text-xs mb-0.5">'
        + '<span class="text-gray-300 truncate">' + label + '</span>'
        + '<span class="text-gray-400 flex-shrink-0 ml-2">' + count.toLocaleString('th-TH') + '</span>'
        + '</div>'
        + '<div class="h-1 bg-slate-700 rounded-full overflow-hidden">'
        + '<div class="h-full bg-blue-500 rounded-full" style="width:' + pct + '%"></div>'
        + '</div>'
        + '</div>'
        + '</div>';
    });
  }

  // ── REFERRER TABLE ───────────────────────────
  function buildReferrerTable(sessions) {
    const counts = countBy(sessions, 'ref');
    const sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    const total  = sessions.length;
    const el     = $('referrerTable');
    el.innerHTML = '';

    if (sorted.length === 0) {
      el.innerHTML = '<p class="text-xs text-gray-500 text-center py-6">ยังไม่มีข้อมูล</p>';
      return;
    }

    sorted.forEach(function (pair, i) {
      const pct = total > 0 ? Math.round((pair[1] / total) * 100) : 0;
      el.innerHTML += '<div class="flex items-center gap-2">'
        + '<div class="flex-1 min-w-0">'
        + '<div class="flex justify-between text-xs mb-0.5">'
        + '<span class="text-gray-300 truncate">' + pair[0] + '</span>'
        + '<span class="text-gray-400 flex-shrink-0 ml-2">' + pair[1].toLocaleString('th-TH') + ' (' + pct + '%)</span>'
        + '</div>'
        + '<div class="h-1 bg-slate-700 rounded-full overflow-hidden">'
        + '<div class="h-full rounded-full" style="width:' + pct + '%;background:' + PALETTE[i % PALETTE.length] + '"></div>'
        + '</div>'
        + '</div>'
        + '</div>';
    });
  }

  // ── RECENT SESSIONS TABLE ────────────────────
  function buildSessionTable(sessions) {
    const recent = sessions.slice(-20).reverse();
    const tbody  = $('sessionTable');
    tbody.innerHTML = '';

    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-500 text-xs">ยังไม่มีข้อมูล</td></tr>';
      return;
    }

    recent.forEach(function (s) {
      const dt    = new Date(s.ts);
      const label = dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' })
                  + ' ' + dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const dur   = s.duration ? formatDuration(s.duration) : '—';
      const returnBadge = s.isReturn
        ? '<span class="bg-purple-900/60 text-purple-300 text-[9px] px-1.5 py-0.5 rounded-md ml-1">ซ้ำ</span>'
        : '<span class="bg-emerald-900/60 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded-md ml-1">ใหม่</span>';

      tbody.innerHTML += '<tr class="text-gray-400 hover:text-gray-200 hover:bg-slate-700/30 transition-colors">'
        + '<td class="py-1.5 pr-4 whitespace-nowrap">' + label + '</td>'
        + '<td class="py-1.5 pr-4">' + (s.device || '—') + returnBadge + '</td>'
        + '<td class="py-1.5 pr-4">' + (s.browser || '—') + '</td>'
        + '<td class="py-1.5 pr-4">' + (s.screen  || '—') + '</td>'
        + '<td class="py-1.5 pr-4">' + (s.ref     || 'direct') + '</td>'
        + '<td class="py-1.5 pr-4">' + dur + '</td>'
        + '<td class="py-1.5">' + (s.eventCount || 0) + ' actions</td>'
        + '</tr>';
    });
  }

  // =============================================
  // EXPORT CSV
  // =============================================
  function exportCSV() {
    const raw      = getAnalyticsData();
    const sessions = raw.sessions || [];
    const rows     = [['ID','Date','Hour','Device','Browser','Screen','Source','Duration(s)','Events','IsReturn']];

    sessions.forEach(function (s) {
      rows.push([
        s.id       || '',
        s.date     || '',
        s.hour     !== undefined ? s.hour : '',
        s.device   || '',
        s.browser  || '',
        s.screen   || '',
        s.ref      || '',
        s.duration || 0,
        s.eventCount || 0,
        s.isReturn ? '1' : '0',
      ]);
    });

    const csv  = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'crpao-analytics-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // =============================================
  // CLEAR DATA
  // =============================================
  function clearData() {
    if (!confirm('ต้องการล้างข้อมูล Analytics ทั้งหมดใช่หรือไม่?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้')) return;
    localStorage.removeItem(CONFIG.ANALYTICS_KEY);
    buildDashboard();
  }

})();
