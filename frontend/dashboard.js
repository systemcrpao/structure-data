/* =============================================
   Dashboard Logic — v2
   Auth ใช้ CRAuth (auth.js)
   ============================================= */
(function () {
  'use strict';

  // ═══════════════════════════════════════
  // AUTH GUARD
  // ═══════════════════════════════════════
  var _session = window.CRAuth.requireRole(['director']);
  if (!_session) return;

  // ═══════════════════════════════════════
  // ANALYTICS KEY
  // ═══════════════════════════════════════
  var ANALYTICS_KEY = 'crpao_analytics';

  function getAnalyticsData() {
    try { return JSON.parse(localStorage.getItem(ANALYTICS_KEY)) || { sessions: [], events: [] }; }
    catch (e) { return { sessions: [], events: [] }; }
  }

  // ═══════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════
  var $ = function (id) { return document.getElementById(id); };

  function escH(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════
  lucide.createIcons();

  (function () {
    var el = $('dashUserLabel');
    if (el && _session) {
      var label = _session.displayRole || window.CRAuth.getRoleLabel(_session.role);
      el.textContent = _session.user + ' · ' + label;
    }
  })();

  $('lastUpdated').textContent = 'อัปเดต: ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  $('exportBtn').addEventListener('click', exportAnalyticsCSV);

  // ═══════════════════════════════════════
  // TAB SWITCHING
  // ═══════════════════════════════════════
  var _analyticsBuilt = false;

  window.switchDashTab = function (tab) {
    var isSum = tab === 'summary';
    $('tabSummary').classList.toggle('hidden', !isSum);
    $('tabAnalytics').classList.toggle('hidden', isSum);
    $('tabSummaryBtn').classList.toggle('active-tab', isSum);
    $('tabAnalyticsBtn').classList.toggle('active-tab', !isSum);
    if (!isSum && !_analyticsBuilt) { _analyticsBuilt = true; buildAnalytics(); }
  };

  // ══════════════════════════════════════════════════════
  // TAB 1: PROJECT SUMMARY
  // ══════════════════════════════════════════════════════
  var _sumAll      = [];
  var _sumFiltered = [];
  var _sumCharts   = {};
  var _sumPage     = 1;
  var _sumPageSize = 25;

  function destroySumChart(key) {
    if (_sumCharts[key]) { _sumCharts[key].destroy(); delete _sumCharts[key]; }
  }

  var STATUS_COLORS = {
    'ดำเนินการเสร็จสิ้น':      '#10b981',
    'กำลังดำเนินการ': '#f59e0b',
    'รอดำเนินการ':    '#3b82f6',
    'ยกเลิก':         '#ef4444',
    'ระงับชั่วคราว':  '#94a3b8',
  };
  var STATUS_BADGE = {
    'ดำเนินการเสร็จสิ้น':      'sum-s-done',
    'กำลังดำเนินการ': 'sum-s-progress',
    'รอดำเนินการ':    'sum-s-wait',
    'ยกเลิก':         'sum-s-cancel',
    'ระงับชั่วคราว':  'sum-s-pause',
  };
  var SUM_PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#a3e635'];

  function fmtBudget(n) {
    n = parseFloat(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' พันล้าน';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' ล้าน';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' พัน';
    return n.toLocaleString('th-TH');
  }

  window.loadSummary = async function () {
    $('sumLoading').classList.remove('hidden');
    $('sumError').classList.add('hidden');
    $('sumKpis').innerHTML = '';
    try {
      var result = await window.CRAuth.callGAS({ action: 'getProjects', token: _session.token, year: $('sumYear').value });
      if (!result.success) throw new Error(result.error || 'โหลดข้อมูลไม่สำเร็จ');
      _sumAll = result.data || [];
      populateSumFilters(_sumAll);
      filterSummary();
    } catch (err) {
      $('sumError').classList.remove('hidden');
      $('sumErrorMsg').textContent = err.message;
    } finally {
      $('sumLoading').classList.add('hidden');
    }
  };

  function populateSumFilters(projects) {
    function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
    var districts = uniq(projects.map(function (p) { return (p['อำเภอ'] || '').toString().trim(); }));
    var types     = uniq(projects.map(function (p) { return (p['ประเภทงาน'] || '').toString().trim(); }));
    var dSel = $('sumDistrict'), prevD = dSel.value;
    dSel.innerHTML = '<option value="">ทุกอำเภอ</option>'
      + districts.map(function (d) { return '<option value="' + escH(d) + '"' + (d === prevD ? ' selected' : '') + '>' + escH(d) + '</option>'; }).join('');
    var tSel = $('sumType'), prevT = tSel.value;
    tSel.innerHTML = '<option value="">ทุกประเภท</option>'
      + types.map(function (t) { return '<option value="' + escH(t) + '"' + (t === prevT ? ' selected' : '') + '>' + escH(t) + '</option>'; }).join('');
  }

  window.filterSummary = function () {
    var district = $('sumDistrict').value, type = $('sumType').value, status = $('sumStatus').value;
    var search   = ($('sumSearch').value || '').trim().toLowerCase();
    _sumFiltered = _sumAll.filter(function (p) {
      if (district && (p['อำเภอ']     || '').toString().trim() !== district) return false;
      if (type     && (p['ประเภทงาน'] || '').toString().trim() !== type)     return false;
      if (status   && (p['สถานะ']     || '').toString().trim() !== status)   return false;
      if (search) {
        var hay = [(p['ชื่อโครงการ']||''),(p['ตำบล']||''),(p['อำเภอ']||''),(p['ประเภทงาน']||'')].join(' ').toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });
    buildSummaryKPIs(_sumFiltered);
    buildSummaryCharts(_sumFiltered);
    buildSummaryTable(_sumFiltered);
  };

  function buildSummaryKPIs(projects) {
    var total       = projects.length;
    var totalBudget = projects.reduce(function (a, p) { return a + (parseFloat(p['งบประมาณ']) || 0); }, 0);
    var done        = projects.filter(function (p) { return (p['สถานะ']||'').toString().trim() === 'ดำเนินการเสร็จสิ้น'; }).length;
    var inProg      = projects.filter(function (p) { return (p['สถานะ']||'').toString().trim() === 'กำลังดำเนินการ'; }).length;
    var waiting     = projects.filter(function (p) { return (p['สถานะ']||'').toString().trim() === 'รอดำเนินการ'; }).length;
    var distCount   = new Set(projects.map(function (p) { return (p['อำเภอ']||'').toString().trim(); }).filter(Boolean)).size;
    var donePct     = total > 0 ? Math.round((done / total) * 100) : 0;
    var kpis = [
      { label:'โครงการทั้งหมด', value:total.toLocaleString('th-TH'),   sub:'รายการ',                       icon:'folder-open',    color:'blue'    },
      { label:'งบประมาณรวม',    value:fmtBudget(totalBudget),          sub:'บาท',                          icon:'coins',          color:'violet'  },
      { label:'ดำเนินการเสร็จสิ้น',      value:done.toLocaleString('th-TH'),    sub:donePct+'% ของโครงการทั้งหมด',  icon:'check-circle-2', color:'emerald' },
      { label:'กำลังดำเนินการ', value:inProg.toLocaleString('th-TH'),  sub:'รายการ',                       icon:'hammer',         color:'amber'   },
      { label:'รอดำเนินการ',    value:waiting.toLocaleString('th-TH'), sub:'รายการ',                       icon:'hourglass',      color:'sky'     },
      { label:'ครอบคลุม',       value:distCount.toLocaleString('th-TH'),sub:'อำเภอ',                       icon:'map-pin',        color:'rose'    },
    ];
    var colMap = { blue:['bg-blue-500/20','text-blue-400'],violet:['bg-violet-500/20','text-violet-400'],emerald:['bg-emerald-500/20','text-emerald-400'],amber:['bg-amber-500/20','text-amber-400'],sky:['bg-sky-500/20','text-sky-400'],rose:['bg-rose-500/20','text-rose-400'] };
    $('sumKpis').innerHTML = kpis.map(function (k) {
      var c = colMap[k.color];
      return '<div class="kpi-card bg-slate-800 border border-slate-700 rounded-2xl p-4">'
        + '<div class="flex items-center gap-2 mb-3"><div class="w-8 h-8 rounded-lg '+c[0]+' flex items-center justify-center flex-shrink-0"><i data-lucide="'+k.icon+'" class="w-4 h-4 '+c[1]+'"></i></div>'
        + '<p class="text-xs text-gray-400 leading-tight">'+k.label+'</p></div>'
        + '<p class="text-2xl font-bold text-white font-heading leading-none">'+k.value+'</p>'
        + '<p class="text-[11px] text-gray-500 mt-1">'+k.sub+'</p></div>';
    }).join('');
    lucide.createIcons({ nodes: [$('sumKpis')] });
  }

  function sumEmptyChart(canvasId, msg) {
    var canvas = $(canvasId); if (!canvas) return;
    var parent = canvas.parentElement;
    parent.innerHTML = '<div class="flex flex-col items-center justify-center h-full py-4 gap-2"><i data-lucide="bar-chart-2" class="w-7 h-7 text-slate-600"></i><p class="text-xs text-gray-500">'+escH(msg||'ยังไม่มีข้อมูล')+'</p></div>';
    lucide.createIcons({ nodes: [parent] });
  }

  function buildSummaryCharts(projects) {
    // Status doughnut
    destroySumChart('status');
    var sc = {};
    projects.forEach(function (p) { var s=(p['สถานะ']||'ไม่ระบุ').toString().trim(); sc[s]=(sc[s]||0)+1; });
    var sLabels=Object.keys(sc), sData=sLabels.map(function(l){return sc[l];}), sColors=sLabels.map(function(l){return STATUS_COLORS[l]||'#64748b';});
    if (!sLabels.length) { sumEmptyChart('sumChartStatus','ไม่มีข้อมูล'); }
    else {
      _sumCharts.status = new Chart($('sumChartStatus'),{type:'doughnut',data:{labels:sLabels,datasets:[{data:sData,backgroundColor:sColors,borderWidth:2,borderColor:'#1e293b'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'60%'}});
      var leg=$('sumStatusLegend'); if(leg){var tot=sData.reduce(function(a,b){return a+b;},0); leg.innerHTML=sLabels.map(function(l,i){var pct=tot>0?Math.round((sData[i]/tot)*100):0;return '<div class="flex items-center justify-between text-xs"><div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:'+sColors[i]+'"></span><span class="text-gray-300">'+escH(l)+'</span></div><span class="text-gray-400">'+sData[i].toLocaleString('th-TH')+' ('+pct+'%)</span></div>';}).join('');}
    }

    // Type bar
    destroySumChart('type');
    var tc={}; projects.forEach(function(p){var t=(p['ประเภทงาน']||'ไม่ระบุ').toString().trim();tc[t]=(tc[t]||0)+1;});
    var tE=Object.entries(tc).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    if(!tE.length){sumEmptyChart('sumChartType','ไม่มีข้อมูล');}
    else{_sumCharts.type=new Chart($('sumChartType'),{type:'bar',data:{labels:tE.map(function(x){return x[0].length>20?x[0].substring(0,20)+'…':x[0];}),datasets:[{data:tE.map(function(x){return x[1];}),backgroundColor:SUM_PALETTE.slice(0,tE.length),borderWidth:0,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1,color:'#94a3b8'}},y:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:10}}}}}});}

    // District bar
    destroySumChart('district');
    var dc={}; projects.forEach(function(p){var d=(p['อำเภอ']||'ไม่ระบุ').toString().trim();dc[d]=(dc[d]||0)+1;});
    var dE=Object.entries(dc).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    if(!dE.length){sumEmptyChart('sumChartDistrict','ไม่มีข้อมูล');}
    else{_sumCharts.district=new Chart($('sumChartDistrict'),{type:'bar',data:{labels:dE.map(function(x){return x[0];}),datasets:[{data:dE.map(function(x){return x[1];}),backgroundColor:'rgba(245,158,11,0.7)',borderColor:'#f59e0b',borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1,color:'#94a3b8'}},y:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:10}}}}}});}

    // Budget by type
    destroySumChart('budget');
    var bt={}; projects.forEach(function(p){var t=(p['ประเภทงาน']||'ไม่ระบุ').toString().trim();bt[t]=(bt[t]||0)+(parseFloat(p['งบประมาณ'])||0);});
    var bE=Object.entries(bt).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    if(!bE.length){sumEmptyChart('sumChartBudget','ไม่มีข้อมูล');}
    else{_sumCharts.budget=new Chart($('sumChartBudget'),{type:'bar',data:{labels:bE.map(function(x){return x[0].length>18?x[0].substring(0,18)+'…':x[0];}),datasets:[{label:'ล้านบาท',data:bE.map(function(x){return Math.round(x[1]/1e6*100)/100;}),backgroundColor:'rgba(139,92,246,0.7)',borderColor:'#8b5cf6',borderWidth:1,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return ' '+ctx.raw.toLocaleString('th-TH')+' ล้านบาท';}}}},scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:10},maxRotation:30}},y:{beginAtZero:true,ticks:{color:'#94a3b8',callback:function(v){return v.toLocaleString('th-TH');}}}}}});}
  }

  function buildSummaryTable(projects) {
    $('sumTableCount').textContent = projects.length.toLocaleString('th-TH') + ' รายการ';
    _sumPage = 1; renderSumPage(projects);
  }

  function renderSumPage(projects) {
    var start=(_sumPage-1)*_sumPageSize, slice=projects.slice(start,start+_sumPageSize), pages=Math.ceil(projects.length/_sumPageSize), tbody=$('sumTable');
    if(!projects.length){tbody.innerHTML='<tr><td colspan="7" class="py-10 text-center text-gray-500">ไม่พบโครงการที่ตรงเงื่อนไข</td></tr>';$('sumPagination').innerHTML='';return;}
    tbody.innerHTML=slice.map(function(p,i){
      var status=(p['สถานะ']||'').toString().trim(), budget=parseFloat(p['งบประมาณ']||0);
      return '<tr class="hover:bg-slate-700/30 transition-colors">'
        +'<td class="px-3 py-2.5 text-center text-gray-500 text-xs">'+(start+i+1)+'</td>'
        +'<td class="px-3 py-2.5 font-medium text-white"><div class="max-w-[220px] truncate" title="'+escH(p['ชื่อโครงการ']||'')+'">'+escH(p['ชื่อโครงการ']||'—')+'</div></td>'
        +'<td class="px-3 py-2.5 text-gray-300 text-xs">'+escH(p['ตำบล']||'')+(p['อำเภอ']?' · '+escH(p['อำเภอ']||''):'')+'</td>'
        +'<td class="px-3 py-2.5 text-gray-300 text-xs">'+escH(p['ประเภทงาน']||'—')+'</td>'
        +'<td class="px-3 py-2.5 text-right text-gray-300 font-mono text-xs whitespace-nowrap">'+(isNaN(budget)?'—':budget.toLocaleString('th-TH'))+'</td>'
        +'<td class="px-3 py-2.5 text-gray-400 text-xs">'+escH(p['แหล่งงบประมาณ']||'—')+'</td>'
        +'<td class="px-3 py-2.5 text-center"><span class="sum-badge '+(STATUS_BADGE[status]||'sum-s-wait')+'">'+escH(status||'—')+'</span></td>'
        +'</tr>';
    }).join('');
    var pag=$('sumPagination');
    if(pages<=1){pag.innerHTML='';return;}
    var html='<div class="flex items-center gap-1 flex-wrap">';
    html+='<button onclick="changeSumPage('+(_sumPage-1)+',true)" '+(_sumPage<=1?'disabled ':'')+'class="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg disabled:opacity-40">‹</button>';
    for(var pg=1;pg<=pages;pg++){
      if(pg===_sumPage) html+='<button class="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg">'+pg+'</button>';
      else if(pg===1||pg===pages||Math.abs(pg-_sumPage)<=1) html+='<button onclick="changeSumPage('+pg+',true)" class="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg">'+pg+'</button>';
      else if(Math.abs(pg-_sumPage)===2) html+='<span class="text-gray-500 text-xs px-1">…</span>';
    }
    html+='<button onclick="changeSumPage('+(_sumPage+1)+',true)" '+(_sumPage>=pages?'disabled ':'')+'class="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg disabled:opacity-40">›</button></div>';
    pag.innerHTML=html;
  }

  window.changeSumPage = function (val, abs) {
    var pages = Math.ceil(_sumFiltered.length / _sumPageSize);
    _sumPage = abs ? Math.max(1, Math.min(pages, val)) : Math.max(1, Math.min(pages, _sumPage + val));
    renderSumPage(_sumFiltered);
  };

  window.exportSummaryCSV = function () {
    var data = _sumFiltered.length > 0 ? _sumFiltered : _sumAll;
    if (!data.length) { alert('ไม่มีข้อมูลให้ส่งออก'); return; }
    var headers = ['ปี','ที่','ชื่อโครงการ','งบประมาณ','ตำบล','อำเภอ','ประเภทงาน','สถานะ','แหล่งงบประมาณ','สถานที่ดำเนินงาน'];
    var rows = [headers].concat(data.map(function(p){return[p['_sheet']||'',p['ที่']||'',p['ชื่อโครงการ']||'',p['งบประมาณ']||0,p['ตำบล']||'',p['อำเภอ']||'',p['ประเภทงาน']||'',p['สถานะ']||'',p['แหล่งงบประมาณ']||'',p['สถานที่ดำเนินงาน']||''];}));
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='สรุปโครงการ-'+new Date().toISOString().split('T')[0]+'.csv';a.click();
    URL.revokeObjectURL(url);
  };

  // ══════════════════════════════════════════════════════
  // TAB 2: ANALYTICS
  // ══════════════════════════════════════════════════════
  var PALETTE = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
  var chartInstances = {};

  function destroyChart(key) { if(chartInstances[key]){chartInstances[key].destroy();delete chartInstances[key];} }
  function formatDuration(secs) { if(!secs||secs<=0)return'< 1 วิ';var m=Math.floor(secs/60),s=secs%60;return m===0?s+' วิ':m+' น.'+(s>0?' '+s+' วิ':''); }
  function todayISO() { return new Date().toISOString().split('T')[0]; }
  function last30Days() { var d=[];for(var i=29;i>=0;i--){var x=new Date();x.setDate(x.getDate()-i);d.push(x.toISOString().split('T')[0]);}return d; }
  function countBy(arr,key) { var m={};arr.forEach(function(item){var k=item[key]||'ไม่ระบุ';m[k]=(m[k]||0)+1;});return m; }
  function countEvents(events,name) { return events.filter(function(e){return e.name===name;}).length; }

  function showAnalyticsEmpty(canvasId, msg) {
    var canvas=$(canvasId); if(!canvas)return;
    var parent=canvas.parentElement;
    parent.innerHTML='<div class="flex flex-col items-center justify-center h-full gap-2"><i data-lucide="inbox" class="w-8 h-8 text-slate-600"></i><p class="text-xs text-gray-500 text-center px-2">'+escH(msg||'ยังไม่มีข้อมูล')+'</p></div>';
    lucide.createIcons({nodes:[parent]});
  }

  function buildAnalytics() {
    Chart.defaults.color='#94a3b8';Chart.defaults.borderColor='rgba(71,85,105,0.35)';Chart.defaults.font.family="'Sarabun', sans-serif";Chart.defaults.font.size=11;

    // ลองดึงจาก GAS ก่อน (server-side aggregated) — fallback localStorage ถ้าล้มเหลว
    var gasUrl = window.GAS_WEBAPP_URL || '';
    if (gasUrl && !gasUrl.includes('REPLACE_WITH') && _session && _session.token) {
      window.CRAuth.callGAS({ action: 'getAnalytics', token: _session.token })
        .then(function (result) {
          if (result && result.success && Array.isArray(result.sessions)) {
            // แปลง eventsJSON (summary object) → array ของ event records
            var events = [];
            result.sessions.forEach(function (s) {
              if (s.eventsJSON && typeof s.eventsJSON === 'object') {
                Object.keys(s.eventsJSON).forEach(function (name) {
                  var cnt = s.eventsJSON[name] || 0;
                  for (var i = 0; i < cnt; i++) events.push({ name: name, sid: s.id });
                });
              }
            });
            renderAnalytics(result.sessions, events);
          } else {
            var raw = getAnalyticsData();
            renderAnalytics(raw.sessions || [], raw.events || []);
          }
        })
        .catch(function () {
          var raw = getAnalyticsData();
          renderAnalytics(raw.sessions || [], raw.events || []);
        });
      return; // renderAnalytics จะถูกเรียกจาก .then() / .catch()
    }

    // fallback: localStorage เท่านั้น (offline / GAS ยังไม่ตั้งค่า)
    var raw = getAnalyticsData();
    renderAnalytics(raw.sessions || [], raw.events || []);
  }

  function renderAnalytics(sessions, events) {
    var today=todayISO();

    $('kpiTotalSessions').textContent=sessions.length.toLocaleString('th-TH');
    $('kpiToday').textContent=sessions.filter(function(s){return s.date===today;}).length.toLocaleString('th-TH');
    $('kpiReturning').textContent=sessions.filter(function(s){return s.isReturn;}).length.toLocaleString('th-TH');
    $('kpiTotalEvents').textContent=events.length.toLocaleString('th-TH');
    $('kpiSearches').textContent=countEvents(events,'search').toLocaleString('th-TH');
    $('kpiProjectClicks').textContent=countEvents(events,'project_click').toLocaleString('th-TH');
    var withDur=sessions.filter(function(s){return s.duration>0;});
    $('kpiAvgDuration').textContent=withDur.length>0?(withDur.reduce(function(a,s){return a+s.duration;},0)/withDur.length/60).toFixed(1):'—';
    var hourCounts=new Array(24).fill(0);
    sessions.forEach(function(s){if(s.hour!==undefined)hourCounts[s.hour]++;});
    var peakHour=hourCounts.indexOf(Math.max.apply(null,hourCounts));
    $('kpiPeakHour').textContent=sessions.length>0?peakHour+':00 น.':'—';

    var days7=[],days7P=[];
    for(var i=6;i>=0;i--){var d1=new Date();d1.setDate(d1.getDate()-i);days7.push(d1.toISOString().split('T')[0]);}
    for(var j=13;j>=7;j--){var d2=new Date();d2.setDate(d2.getDate()-j);days7P.push(d2.toISOString().split('T')[0]);}
    var thisW=sessions.filter(function(s){return days7.indexOf(s.date)!==-1;}).length;
    var lastW=sessions.filter(function(s){return days7P.indexOf(s.date)!==-1;}).length;
    var tEl=$('kpiVisitorTrend');
    if(tEl&&lastW>0){var pct=Math.round(((thisW-lastW)/lastW)*100);tEl.textContent=(pct>=0?'↑ ':'↓ ')+Math.abs(pct)+'%';tEl.className='text-[10px] font-medium '+(pct>=0?'text-emerald-400':'text-red-400');}

    buildDailyChart(sessions);
    buildDeviceChart(sessions);
    buildHourlyChart(hourCounts,sessions.length);
    buildBrowserChart(sessions);
    buildFeatureTable(events);
    buildReferrerTable(sessions);
    buildSessionTable(sessions);

    var exportBtn=$('exportCsvBtn');if(exportBtn)exportBtn.onclick=exportAnalyticsCSV;
    var clearBtn=$('clearDataBtn');if(clearBtn)clearBtn.onclick=clearAnalyticsData;
  }

  function buildDailyChart(sessions) {
    destroyChart('daily');
    var days=last30Days(),byDay=countBy(sessions,'date');
    chartInstances.daily=new Chart($('chartDaily'),{type:'bar',data:{labels:days.map(function(d){var p=d.split('-');return p[2]+'/'+p[1];}),datasets:[{label:'การเข้าใช้งาน',data:days.map(function(d){return byDay[d]||0;}),backgroundColor:'rgba(59,130,246,0.6)',borderColor:'#3b82f6',borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,ticks:{stepSize:1}}}}});
  }

  function buildDeviceChart(sessions) {
    destroyChart('device');
    var counts=countBy(sessions,'device');
    var labels=Object.keys(counts).filter(function(k){return k!=='ไม่ระบุ';}),data=labels.map(function(l){return counts[l];});
    if(!labels.length){showAnalyticsEmpty('chartDevice','ยังไม่มีข้อมูลอุปกรณ์\nจะแสดงเมื่อมีผู้ใช้เข้าชมระบบ');return;}
    chartInstances.device=new Chart($('chartDevice'),{type:'doughnut',data:{labels:labels,datasets:[{data:data,backgroundColor:PALETTE.slice(0,labels.length),borderWidth:2,borderColor:'#1e293b'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){var tot=ctx.dataset.data.reduce(function(a,b){return a+b;},0);var pct=tot>0?Math.round((ctx.raw/tot)*100):0;return ' '+ctx.label+': '+ctx.raw+' ('+pct+'%)';}}}},cutout:'65%'}});
    var legend=$('deviceLegend');
    if(legend){var tot=data.reduce(function(a,b){return a+b;},0);legend.innerHTML=labels.map(function(l,i){var pct=tot>0?Math.round((data[i]/tot)*100):0;return'<div class="flex items-center justify-between text-xs"><div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:'+PALETTE[i]+'"></span><span class="text-gray-300">'+l+'</span></div><span class="text-gray-400">'+data[i]+' ('+pct+'%)</span></div>';}).join('');}
  }

  function buildHourlyChart(hourCounts,sessionTotal) {
    destroyChart('hourly');
    if(!sessionTotal){showAnalyticsEmpty('chartHourly','ยังไม่มีข้อมูล\nจะแสดงเมื่อมีผู้ใช้เข้าชมระบบ');return;}
    var labels=[];for(var h=0;h<24;h++)labels.push(h+':00');
    chartInstances.hourly=new Chart($('chartHourly'),{type:'line',data:{labels:labels,datasets:[{label:'การเข้าใช้งาน',data:hourCounts,fill:true,backgroundColor:'rgba(6,182,212,0.15)',borderColor:'#06b6d4',borderWidth:2,pointRadius:3,pointBackgroundColor:'#06b6d4',pointHoverRadius:5,tension:0.4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12}},y:{beginAtZero:true,ticks:{stepSize:1}}}}});
  }

  function buildBrowserChart(sessions) {
    destroyChart('browser');
    var counts=countBy(sessions,'browser');
    var entries=Object.entries(counts).filter(function(x){return x[0]!=='ไม่ระบุ';}).sort(function(a,b){return b[1]-a[1];});
    if(!entries.length){showAnalyticsEmpty('chartBrowser','ยังไม่มีข้อมูลเบราว์เซอร์\nจะแสดงเมื่อมีผู้ใช้เข้าชมระบบ');return;}
    var labels=entries.map(function(x){return x[0];}),data=entries.map(function(x){return x[1];});
    chartInstances.browser=new Chart($('chartBrowser'),{type:'bar',data:{labels:labels,datasets:[{label:'ครั้ง',data:data,backgroundColor:PALETTE.slice(0,labels.length),borderWidth:0,borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1}},y:{grid:{display:false}}}}});
  }

  var EVENT_LABELS={'layer_switch':'เปลี่ยน Layer แผนที่','boundary_toggle':'เปิด/ปิดเขตแบ่ง','boundary_level':'เปลี่ยนระดับเขต','location_toggle':'แสดงตำแหน่งของฉัน','search':'ค้นหาโครงการ','filter_year':'กรองตามปีงบ','filter_district':'กรองตามอำเภอ','filter_subdistrict':'กรองตามตำบล','filter_type':'กรองตามประเภทงาน','status_filter':'กรองสถานะ','filter_clear':'ล้างตัวกรอง','project_click':'คลิกดูโครงการ','zoom':'ซูมแผนที่','fullscreen_toggle':'เปิด/ปิด Fullscreen','legend_toggle':'เปิด/ปิด Legend','mobile_sidebar_open':'เปิด Sidebar มือถือ'};

  function buildFeatureTable(events) {
    var counts={};events.forEach(function(e){var k=e.name||'unknown';counts[k]=(counts[k]||0)+1;});
    var sorted=Object.entries(counts).sort(function(a,b){return b[1]-a[1];}).slice(0,12),total=sorted.reduce(function(a,x){return a+x[1];},0);
    var el=$('featureTable');if(!el)return;
    if(!sorted.length){el.innerHTML='<p class="text-xs text-gray-500 text-center py-6">ยังไม่มีข้อมูลการใช้งาน</p>';return;}
    el.innerHTML=sorted.map(function(pair){var label=EVENT_LABELS[pair[0]]||pair[0],pct=total>0?Math.round((pair[1]/total)*100):0;return'<div class="flex items-center gap-2"><div class="flex-1 min-w-0"><div class="flex justify-between text-xs mb-0.5"><span class="text-gray-300 truncate">'+label+'</span><span class="text-gray-400 flex-shrink-0 ml-2">'+pair[1].toLocaleString('th-TH')+'</span></div><div class="h-1 bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" style="width:'+pct+'%"></div></div></div></div>';}).join('');
  }

  function buildReferrerTable(sessions) {
    var counts=countBy(sessions,'ref'),sorted=Object.entries(counts).sort(function(a,b){return b[1]-a[1];}).slice(0,8),total=sessions.length;
    var el=$('referrerTable');if(!el)return;
    if(!sorted.length){el.innerHTML='<p class="text-xs text-gray-500 text-center py-6">ยังไม่มีข้อมูลแหล่งที่มา</p>';return;}
    el.innerHTML=sorted.map(function(pair,i){var pct=total>0?Math.round((pair[1]/total)*100):0;return'<div class="flex items-center gap-2"><div class="flex-1 min-w-0"><div class="flex justify-between text-xs mb-0.5"><span class="text-gray-300 truncate">'+pair[0]+'</span><span class="text-gray-400 flex-shrink-0 ml-2">'+pair[1].toLocaleString('th-TH')+' ('+pct+'%)</span></div><div class="h-1 bg-slate-700 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:'+pct+'%;background:'+PALETTE[i%PALETTE.length]+'"></div></div></div></div>';}).join('');
  }

  function buildSessionTable(sessions) {
    var recent=sessions.slice(-20).reverse(),tbody=$('sessionTable');if(!tbody)return;
    if(!recent.length){tbody.innerHTML='<tr><td colspan="7" class="py-8 text-center text-gray-500 text-xs">ยังไม่มีข้อมูล — Analytics จะเริ่มเก็บเมื่อมีผู้ใช้เข้าชมหน้าแผนที่</td></tr>';return;}
    tbody.innerHTML=recent.map(function(s){var dt=new Date(s.ts),label=dt.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit'})+' '+dt.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),dur=s.duration?formatDuration(s.duration):'—',badge=s.isReturn?'<span class="bg-purple-900/60 text-purple-300 text-[9px] px-1.5 py-0.5 rounded-md ml-1">ซ้ำ</span>':'<span class="bg-emerald-900/60 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded-md ml-1">ใหม่</span>';return'<tr class="text-gray-400 hover:text-gray-200 hover:bg-slate-700/30 transition-colors"><td class="py-1.5 pr-4 whitespace-nowrap">'+label+'</td><td class="py-1.5 pr-4">'+(s.device||'—')+badge+'</td><td class="py-1.5 pr-4">'+(s.browser||'—')+'</td><td class="py-1.5 pr-4">'+(s.screen||'—')+'</td><td class="py-1.5 pr-4">'+(s.ref||'direct')+'</td><td class="py-1.5 pr-4">'+dur+'</td><td class="py-1.5">'+(s.eventCount||0)+' actions</td></tr>';}).join('');
  }

  function exportAnalyticsCSV() {
    var raw=getAnalyticsData(),sessions=raw.sessions||[];
    var rows=[['ID','Date','Hour','Device','Browser','Screen','Source','Duration(s)','Events','IsReturn']];
    sessions.forEach(function(s){rows.push([s.id||'',s.date||'',s.hour!==undefined?s.hour:'',s.device||'',s.browser||'',s.screen||'',s.ref||'',s.duration||0,s.eventCount||0,s.isReturn?'1':'0']);});
    var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='analytics-'+new Date().toISOString().split('T')[0]+'.csv';a.click();URL.revokeObjectURL(url);
  }

  function clearAnalyticsData() {
    if(!confirm('ต้องการล้างข้อมูล Analytics ทั้งหมดใช่หรือไม่?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้'))return;
    localStorage.removeItem(ANALYTICS_KEY);buildAnalytics();
  }

  // ═══════════════════════════════════════
  // INITIAL LOAD (เรียกหลังนิยามฟังก์ชันทั้งหมดแล้ว)
  // ═══════════════════════════════════════
  loadSummary();

})();
