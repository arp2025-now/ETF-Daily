var API_BASE = window.location.origin;
var ETF_LIST = [
  { symbol: 'BOTZ', name: 'Global X Robotics & AI ETF', sector: 'AI & Robotics' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', sector: 'Semiconductors' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', sector: 'Semiconductors' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', sector: 'Disruptive Innovation' },
  { symbol: 'WCLD', name: 'WisdomTree Cloud Computing', sector: 'Cloud Computing' },
  { symbol: 'CIBR', name: 'First Trust Cybersecurity ETF', sector: 'Cybersecurity' },
  { symbol: 'HACK', name: 'ETFMG Prime Cyber Security', sector: 'Cybersecurity' },
  { symbol: 'ARKG', name: 'ARK Genomic Revolution ETF', sector: 'Biotech & Genomics' },
  { symbol: 'XBI', name: 'SPDR S&P Biotech ETF', sector: 'Biotech & Genomics' },
  { symbol: 'ICLN', name: 'iShares Global Clean Energy', sector: 'Clean Energy' },
  { symbol: 'TAN', name: 'Invesco Solar ETF', sector: 'Clean Energy' },
  { symbol: 'KWEB', name: 'KraneShares CSI China Internet', sector: 'Emerging Markets Tech' },
  { symbol: 'VGT', name: 'Vanguard Information Tech ETF', sector: 'Technology' },
  { symbol: 'IGV', name: 'iShares Expanded Tech-Software', sector: 'Software' }
];
var etfData = {};
var chartInstances = {};
var currentPeriod = 'daily';
var ALLOC_COLORS = [
  '#3b82f6','#06b6d4','#8b5cf6','#10b981','#f59e0b',
  '#ef4444','#ec4899','#14b8a6','#f97316','#6366f1',
  '#84cc16','#0ea5e9','#a855f7','#22d3ee'
];

var SIGNAL_LABELS = { buy: 'קנייה', sell: 'מכירה', hold: 'המתנה' };
var RISK_LABELS = { conservative: 'שמרני', moderate: 'מאוזן', aggressive: 'אגרסיבי' };
var PERIOD_LABELS = { daily: 'יומי', weekly: 'שבוע אחרון', monthly: 'חודש אחרון' };

document.addEventListener('DOMContentLoaded', function() {
  setHeaderDate();
  loadDashboard();
  document.getElementById('refreshBtn').addEventListener('click', function() { loadDashboard(); });
  document.getElementById('aiAnalysisBtn').addEventListener('click', generateAIAnalysis);
  document.getElementById('allocationBtn').addEventListener('click', generateAllocation);

  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentPeriod = btn.getAttribute('data-period');
      loadDashboard();
    });
  });
});

function setHeaderDate() {
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getPeriodParams() {
  var now = Math.floor(Date.now() / 1000);
  var todayMidnight = Math.floor(new Date().setHours(0,0,0,0) / 1000);
  if (currentPeriod === 'weekly') {
    return { from: todayMidnight - 7 * 86400, to: todayMidnight, resolution: 'D', days: 7 };
  } else if (currentPeriod === 'monthly') {
    return { from: todayMidnight - 30 * 86400, to: todayMidnight, resolution: 'D', days: 30 };
  }
  return null;
}

async function loadDashboard() {
  var overlay = document.getElementById('loadingOverlay');
  var refreshBtn = document.getElementById('refreshBtn');
  overlay.classList.remove('hidden');
  refreshBtn.classList.add('spinning');
  try {
    await checkMarketStatus();
    var periodParams = getPeriodParams();

    if (periodParams) {
      var results = await Promise.allSettled(ETF_LIST.map(function(etf) {
        return fetchETFCandles(etf.symbol, periodParams);
      }));
      etfData = {};
      results.forEach(function(result, i) {
        var etf = ETF_LIST[i];
        if (result.status === 'fulfilled' && result.value) {
          var d = result.value;
          etfData[etf.symbol] = Object.assign({}, etf, d, { signal: computeSignalPeriod(d) });
        } else {
          etfData[etf.symbol] = Object.assign({}, etf, { error: true, c: 0, dp: 0, d: 0, h: 0, l: 0, o: 0, pc: 0, signal: 'hold', closePrices: [] });
        }
      });
    } else {
      var results = await Promise.allSettled(ETF_LIST.map(function(etf) { return fetchETFQuote(etf.symbol); }));
      etfData = {};
      results.forEach(function(result, i) {
        var etf = ETF_LIST[i];
        if (result.status === 'fulfilled' && result.value) {
          etfData[etf.symbol] = Object.assign({}, etf, result.value, { signal: computeSignal(result.value) });
        } else {
          etfData[etf.symbol] = Object.assign({}, etf, { error: true, c: 0, dp: 0, d: 0, h: 0, l: 0, o: 0, pc: 0, signal: 'hold' });
        }
      });
    }
    renderCards(); renderSummary(); renderCharts();
  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById('etfGrid').innerHTML = '<div class="error-card">שגיאה בטעינת נתוני ETF. ודאו שהשרת פועל.</div>';
  } finally { overlay.classList.add('hidden'); refreshBtn.classList.remove('spinning'); }
}

async function fetchETFQuote(symbol) {
  var res = await fetch(API_BASE + '/api/etf/' + symbol + '/quote');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fetchETFCandles(symbol, params) {
  var url = API_BASE + '/api/etf/' + symbol + '/candles?resolution=' + params.resolution + '&from=' + params.from + '&to=' + params.to;
  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var data = await res.json();
  if (data.s === 'no_data' || !data.c || data.c.length === 0) return null;

  var openPrice = data.o[0];
  var closePrice = data.c[data.c.length - 1];
  var highPrice = Math.max.apply(null, data.h);
  var lowPrice = Math.min.apply(null, data.l);
  var changeDollar = closePrice - openPrice;
  var changePercent = ((closePrice - openPrice) / openPrice) * 100;

  return {
    o: openPrice,
    c: closePrice,
    h: highPrice,
    l: lowPrice,
    pc: openPrice,
    d: changeDollar,
    dp: changePercent,
    closePrices: data.c
  };
}

async function checkMarketStatus() {
  try {
    var res = await fetch(API_BASE + '/api/etf/market-status');
    var data = await res.json();
    var dot = document.querySelector('#marketStatus .status-dot');
    var text = document.querySelector('#marketStatus .status-text');
    if (data.isOpen) { dot.className = 'status-dot open'; text.textContent = 'השוק פתוח'; }
    else { dot.className = 'status-dot closed'; text.textContent = 'השוק סגור'; }
  } catch (e) {}
}

function computeSignal(q) {
  if (!q || !q.dp) return 'hold';
  if (q.dp > 1.5 && q.c > q.o) return 'buy';
  if (q.dp > 0.5 && (q.h - q.c) / q.h < 0.005) return 'buy';
  if (q.dp < -1.5) return 'sell';
  if (q.dp < -0.5 && q.c <= q.o) return 'sell';
  return 'hold';
}

function computeSignalPeriod(d) {
  if (!d || !d.dp) return 'hold';
  if (currentPeriod === 'weekly') {
    if (d.dp > 3) return 'buy';
    if (d.dp < -3) return 'sell';
  } else if (currentPeriod === 'monthly') {
    if (d.dp > 5) return 'buy';
    if (d.dp < -5) return 'sell';
  }
  return 'hold';
}

function renderCards() {
  var grid = document.getElementById('etfGrid');
  grid.innerHTML = '';
  var periodLabel = PERIOD_LABELS[currentPeriod];
  ETF_LIST.forEach(function(etf) {
    var d = etfData[etf.symbol]; if (!d) return;
    var chgCls = d.dp >= 0 ? 'positive' : 'negative';
    var chgSign = d.dp >= 0 ? '+' : '';
    var sig = d.signal || 'hold';
    var sigLabel = SIGNAL_LABELS[sig] || sig;
    var card = document.createElement('div');
    card.className = 'etf-card signal-' + sig;

    var periodTag = currentPeriod !== 'daily' ? '<span class="period-tag">' + periodLabel + '</span>' : '';

    card.innerHTML =
      '<div class="etf-card-header"><div><div class="etf-symbol">' + d.symbol + '</div><div class="etf-name">' + d.name + '</div></div><span class="signal-badge ' + sig + '">' + sigLabel + '</span></div>' +
      '<div class="etf-price-row"><span class="etf-change ' + chgCls + '">' + chgSign + (d.dp ? d.dp.toFixed(2) : '0.00') + '%</span><span class="etf-price">$' + (d.c ? d.c.toFixed(2) : '--') + '</span></div>' +
      periodTag +
      '<div class="etf-details">' +
      '<div class="etf-detail"><span class="etf-detail-label">' + (currentPeriod === 'daily' ? 'פתיחה' : 'מחיר התחלה') + '</span><span class="etf-detail-value">$' + (d.o ? d.o.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">גבוה</span><span class="etf-detail-value">$' + (d.h ? d.h.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">נמוך</span><span class="etf-detail-value">$' + (d.l ? d.l.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">' + (currentPeriod === 'daily' ? 'סגירה קודמת' : 'מחיר סיום') + '</span><span class="etf-detail-value">$' + (currentPeriod === 'daily' ? (d.pc ? d.pc.toFixed(2) : '--') : (d.c ? d.c.toFixed(2) : '--')) + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">סקטור</span><span class="etf-detail-value">' + d.sector + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">שינוי $</span><span class="etf-detail-value" style="color:var(--color-' + (d.d >= 0 ? 'buy' : 'sell') + ')">' + (d.d >= 0 ? '+' : '') + (d.d ? d.d.toFixed(2) : '0.00') + '</span></div></div>' +
      '<div class="etf-card-chart"><canvas id="miniChart-' + d.symbol + '" height="80"></canvas></div>';
    grid.appendChild(card);

    if (d.closePrices && d.closePrices.length > 1) {
      renderMiniChartFromPrices(d.symbol, d.closePrices, d.dp >= 0);
    } else {
      renderMiniChart(d.symbol, d);
    }
  });
}

function renderMiniChartFromPrices(sym, prices, up) {
  var canvas = document.getElementById('miniChart-' + sym); if (!canvas) return;
  if (chartInstances['m-' + sym]) chartInstances['m-' + sym].destroy();
  chartInstances['m-' + sym] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: prices.map(function(_, i) { return i + 1; }),
      datasets: [{
        data: prices,
        borderColor: up ? '#10b981' : '#ef4444',
        backgroundColor: up ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
  });
}

function renderMiniChart(sym, d) {
  var canvas = document.getElementById('miniChart-' + sym); if (!canvas) return;
  var pts = sparkline(d), up = d.dp >= 0;
  if (chartInstances['m-' + sym]) chartInstances['m-' + sym].destroy();
  chartInstances['m-' + sym] = new Chart(canvas, {
    type: 'line',
    data: { labels: pts.map(function(_, i){return i;}), datasets: [{ data: pts, borderColor: up ? '#10b981' : '#ef4444', backgroundColor: up ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
  });
}

function sparkline(d) {
  if (!d.o || !d.c) return [0,0,0,0,0];
  var o=d.o, h=d.h, l=d.l, c=d.c, mid=(h+l)/2, pts=[], n=20;
  for (var i=0;i<=n;i++) {
    var t=i/n, v;
    if (t<0.15) v=o+(mid-o)*t/0.15*0.5;
    else if (t<0.35) v=o+(l-o)*Math.sin((t-0.15)/0.2*Math.PI/2);
    else if (t<0.65) v=l+(h-l)*(t-0.35)/0.3;
    else if (t<0.85) v=h-(h-c)*(t-0.65)/0.2*0.6;
    else v=c+(h-c)*0.4*(1-(t-0.85)/0.15)+(c-h)*0.4*(t-0.85)/0.15;
    v+=(Math.random()-0.5)*(h-l)*0.05;
    pts.push(+v.toFixed(2));
  }
  pts[n]=c; return pts;
}

function renderSummary() {
  var all=Object.values(etfData), ok=all.filter(function(e){return !e.error&&e.c;});
  document.getElementById('etfCount').textContent = ok.length;
  var avg=ok.reduce(function(s,e){return s+(e.dp||0);},0)/(ok.length||1);
  var el=document.getElementById('avgChange');
  el.textContent=(avg>=0?'+':'')+avg.toFixed(2)+'%';
  el.style.color=avg>=0?'var(--color-buy)':'var(--color-sell)';
  document.getElementById('buyCount').textContent=all.filter(function(e){return e.signal==='buy';}).length;
  document.getElementById('holdCount').textContent=all.filter(function(e){return e.signal==='hold';}).length;
  document.getElementById('sellCount').textContent=all.filter(function(e){return e.signal==='sell';}).length;
}

function renderCharts() { renderSectorChart(); renderChangeChart(); }

function renderSectorChart() {
  var c=document.getElementById('sectorChart');
  if (chartInstances.sector) chartInstances.sector.destroy();
  var m={};
  Object.values(etfData).forEach(function(e){if(!m[e.sector])m[e.sector]=[];m[e.sector].push(e.dp||0);});
  var labs=Object.keys(m), data=labs.map(function(s){var v=m[s];return +(v.reduce(function(a,b){return a+b;},0)/v.length).toFixed(2);});
  var cols=data.map(function(v){return v>=0?'rgba(16,185,129,0.7)':'rgba(239,68,68,0.7)';});
  chartInstances.sector = new Chart(c, {
    type:'bar', data:{labels:labs,datasets:[{label:'שינוי ממוצע %',data:data,backgroundColor:cols,borderRadius:6}]},
    options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{grid:{color:'rgba(30,58,95,0.3)'},ticks:{color:'#8899aa',callback:function(v){return v+'%';}}},x:{grid:{display:false},ticks:{color:'#8899aa',font:{size:11}}}}}
  });
}

function renderChangeChart() {
  var c=document.getElementById('changeChart');
  if (chartInstances.change) chartInstances.change.destroy();
  var sorted=Object.values(etfData).filter(function(e){return !e.error;}).sort(function(a,b){return (b.dp||0)-(a.dp||0);});
  var labs=sorted.map(function(e){return e.symbol;}), data=sorted.map(function(e){return e.dp||0;});
  var cols=data.map(function(v){return v>=0?'rgba(16,185,129,0.7)':'rgba(239,68,68,0.7)';});
  chartInstances.change = new Chart(c, {
    type:'bar', data:{labels:labs,datasets:[{label:'שינוי ' + PERIOD_LABELS[currentPeriod] + ' %',data:data,backgroundColor:cols,borderRadius:6}]},
    options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(30,58,95,0.3)'},ticks:{color:'#8899aa',callback:function(v){return v+'%';}}},y:{grid:{display:false},ticks:{color:'#8899aa',font:{weight:'bold'}}}}}
  });
}

async function generateAIAnalysis() {
  var btn=document.getElementById('aiAnalysisBtn'), content=document.getElementById('aiContent');
  btn.disabled=true; btn.textContent='מנתח...';
  content.innerHTML='<div class="ai-loading"><div class="spinner-sm"></div> מייצר ניתוח AI...</div>';
  var summary=Object.values(etfData).filter(function(e){return !e.error;}).map(function(e){
    return {symbol:e.symbol,name:e.name,sector:e.sector,price:e.c,changePercent:e.dp,changeDollar:e.d,open:e.o,high:e.h,low:e.l,prevClose:e.pc,signal:e.signal,period:currentPeriod};
  });
  try {
    var res=await fetch(API_BASE+'/api/ai/market-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({etfs:summary,period:currentPeriod})});
    if (!res.ok) throw new Error('HTTP '+res.status);
    var data=await res.json();
    content.innerHTML=formatAI(data.analysis);
  } catch(err) {
    content.innerHTML='<div class="error-card">שגיאה בייצור ניתוח AI. בדקו את השרת ומפתח ANTHROPIC_API_KEY.</div>';
  } finally { btn.disabled=false; btn.textContent='הפק ניתוח'; }
}

async function generateAllocation() {
  var btn=document.getElementById('allocationBtn');
  var tableWrap=document.getElementById('allocationTableWrap');
  var summaryEl=document.getElementById('allocationSummary');
  btn.disabled=true; btn.textContent='מחשב...';
  tableWrap.innerHTML='<div class="ai-loading"><div class="spinner-sm"></div> מייצר חלוקת השקעה מומלצת...</div>';
  summaryEl.innerHTML='';

  var summary=Object.values(etfData).filter(function(e){return !e.error;}).map(function(e){
    return {symbol:e.symbol,name:e.name,sector:e.sector,price:e.c,changePercent:e.dp,signal:e.signal,period:currentPeriod};
  });

  try {
    var res=await fetch(API_BASE+'/api/ai/portfolio-allocation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({etfs:summary,period:currentPeriod})});
    if (!res.ok) throw new Error('HTTP '+res.status);
    var data=await res.json();
    renderAllocationChart(data.allocation);
    renderAllocationTable(data.allocation, data.riskLevel, data.summary);
  } catch(err) {
    tableWrap.innerHTML='<div class="error-card">שגיאה בייצור חלוקת השקעה. בדקו את השרת ומפתח ANTHROPIC_API_KEY.</div>';
  } finally { btn.disabled=false; btn.textContent='צור חלוקה'; }
}

function renderAllocationChart(allocation) {
  if (chartInstances.allocation) chartInstances.allocation.destroy();
  var canvas = document.getElementById('allocationChart');
  var sorted = allocation.slice().sort(function(a,b){ return b.percentage - a.percentage; });
  chartInstances.allocation = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: sorted.map(function(a){ return a.symbol + ' (' + a.percentage + '%)'; }),
      datasets: [{
        data: sorted.map(function(a){ return a.percentage; }),
        backgroundColor: sorted.map(function(_, i){ return ALLOC_COLORS[i % ALLOC_COLORS.length]; }),
        borderColor: '#0a0e17',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ctx.label + ' - ' + ctx.parsed + '%'; }
          }
        }
      }
    }
  });
}

function renderAllocationTable(allocation, riskLevel, summary) {
  var badge = document.getElementById('riskBadge');
  badge.textContent = RISK_LABELS[riskLevel] || riskLevel;
  badge.className = 'risk-badge ' + (riskLevel || '');

  var sorted = allocation.slice().sort(function(a,b){ return b.percentage - a.percentage; });
  var html = '<table class="allocation-table"><thead><tr>' +
    '<th>תעודה</th><th>סקטור</th><th>הקצאה</th><th>נימוק</th>' +
    '</tr></thead><tbody>';

  sorted.forEach(function(a, i) {
    var color = ALLOC_COLORS[i % ALLOC_COLORS.length];
    html += '<tr>' +
      '<td><span class="alloc-color-dot" style="background:' + color + '"></span><strong>' + a.symbol + '</strong></td>' +
      '<td>' + (a.sector || getETFSector(a.symbol)) + '</td>' +
      '<td><span class="alloc-pct">' + a.percentage + '%</span></td>' +
      '<td><span class="alloc-rationale">' + (a.rationale || '') + '</span></td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('allocationTableWrap').innerHTML = html;
  document.getElementById('allocationSummary').innerHTML = summary ? '<strong>סיכום אסטרטגיה:</strong> ' + summary : '';
}

function getETFSector(symbol) {
  var etf = ETF_LIST.find(function(e){ return e.symbol === symbol; });
  return etf ? etf.sector : '';
}

function formatAI(t) {
  if (!t) return '<p class="ai-placeholder">אין ניתוח זמין.</p>';
  return '<div>'+t.replace(/### (.+)/g,'<h4>$1</h4>').replace(/## (.+)/g,'<h4>$1</h4>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/\n/g,'<br>')+'</div>';
}
