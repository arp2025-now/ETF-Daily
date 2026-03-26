var API_BASE = window.location.origin;
var ETF_LIST = [
  { symbol: 'SPY', name: 'S&P 500 ETF', sector: 'Broad Market' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', sector: 'Technology' },
  { symbol: 'IWM', name: 'Russell 2000 ETF', sector: 'Small Cap' },
  { symbol: 'VTI', name: 'Total Stock Market ETF', sector: 'Broad Market' },
  { symbol: 'XLF', name: 'Financial Select SPDR', sector: 'Financials' },
  { symbol: 'XLE', name: 'Energy Select SPDR', sector: 'Energy' },
  { symbol: 'XLK', name: 'Technology Select SPDR', sector: 'Technology' },
  { symbol: 'XLV', name: 'Health Care Select SPDR', sector: 'Healthcare' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', sector: 'Commodities' },
  { symbol: 'TLT', name: '20+ Year Treasury Bond', sector: 'Bonds' },
  { symbol: 'VNQ', name: 'Real Estate ETF', sector: 'Real Estate' },
  { symbol: 'EEM', name: 'Emerging Markets ETF', sector: 'International' }
];
var etfData = {};
var chartInstances = {};

document.addEventListener('DOMContentLoaded', function() {
  setHeaderDate();
  loadDashboard();
  document.getElementById('refreshBtn').addEventListener('click', loadDashboard);
  document.getElementById('aiAnalysisBtn').addEventListener('click', generateAIAnalysis);
});

function setHeaderDate() {
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function loadDashboard() {
  var overlay = document.getElementById('loadingOverlay');
  var refreshBtn = document.getElementById('refreshBtn');
  overlay.classList.remove('hidden');
  refreshBtn.classList.add('spinning');
  try {
    await checkMarketStatus();
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
    renderCards(); renderSummary(); renderCharts();
  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById('etfGrid').innerHTML = '<div class="error-card">Failed to load ETF data. Make sure the server is running.</div>';
  } finally { overlay.classList.add('hidden'); refreshBtn.classList.remove('spinning'); }
}

async function fetchETFQuote(symbol) {
  var res = await fetch(API_BASE + '/api/etf/' + symbol + '/quote');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function checkMarketStatus() {
  try {
    var res = await fetch(API_BASE + '/api/etf/market-status');
    var data = await res.json();
    var dot = document.querySelector('#marketStatus .status-dot');
    var text = document.querySelector('#marketStatus .status-text');
    if (data.isOpen) { dot.className = 'status-dot open'; text.textContent = 'Market Open'; }
    else { dot.className = 'status-dot closed'; text.textContent = 'Market Closed'; }
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

function renderCards() {
  var grid = document.getElementById('etfGrid');
  grid.innerHTML = '';
  ETF_LIST.forEach(function(etf) {
    var d = etfData[etf.symbol]; if (!d) return;
    var chgCls = d.dp >= 0 ? 'positive' : 'negative';
    var chgSign = d.dp >= 0 ? '+' : '';
    var sig = d.signal || 'hold';
    var card = document.createElement('div');
    card.className = 'etf-card signal-' + sig;
    card.innerHTML =
      '<div class="etf-card-header"><div><div class="etf-symbol">' + d.symbol + '</div><div class="etf-name">' + d.name + '</div></div><span class="signal-badge ' + sig + '">' + sig + '</span></div>' +
      '<div class="etf-price-row"><span class="etf-price">$' + (d.c ? d.c.toFixed(2) : '--') + '</span><span class="etf-change ' + chgCls + '">' + chgSign + (d.dp ? d.dp.toFixed(2) : '0.00') + '%</span></div>' +
      '<div class="etf-details">' +
      '<div class="etf-detail"><span class="etf-detail-label">Open</span><span class="etf-detail-value">$' + (d.o ? d.o.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">High</span><span class="etf-detail-value">$' + (d.h ? d.h.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">Low</span><span class="etf-detail-value">$' + (d.l ? d.l.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">Prev Close</span><span class="etf-detail-value">$' + (d.pc ? d.pc.toFixed(2) : '--') + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">Sector</span><span class="etf-detail-value">' + d.sector + '</span></div>' +
      '<div class="etf-detail"><span class="etf-detail-label">Change $</span><span class="etf-detail-value" style="color:var(--color-' + (d.d >= 0 ? 'buy' : 'sell') + ')">' + (d.d >= 0 ? '+' : '') + (d.d ? d.d.toFixed(2) : '0.00') + '</span></div></div>' +
      '<div class="etf-card-chart"><canvas id="miniChart-' + d.symbol + '" height="80"></canvas></div>';
    grid.appendChild(card);
    renderMiniChart(d.symbol, d);
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
    type:'bar', data:{labels:labs,datasets:[{label:'Avg Change %',data:data,backgroundColor:cols,borderRadius:6}]},
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
    type:'bar', data:{labels:labs,datasets:[{label:'Daily Change %',data:data,backgroundColor:cols,borderRadius:6}]},
    options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(30,58,95,0.3)'},ticks:{color:'#8899aa',callback:function(v){return v+'%';}}},y:{grid:{display:false},ticks:{color:'#8899aa',font:{weight:'bold'}}}}}
  });
}

async function generateAIAnalysis() {
  var btn=document.getElementById('aiAnalysisBtn'), content=document.getElementById('aiContent');
  btn.disabled=true; btn.textContent='Analyzing...';
  content.innerHTML='<div class="ai-loading"><div class="spinner-sm"></div> Generating AI analysis...</div>';
  var summary=Object.values(etfData).filter(function(e){return !e.error;}).map(function(e){
    return {symbol:e.symbol,name:e.name,sector:e.sector,price:e.c,changePercent:e.dp,changeDollar:e.d,open:e.o,high:e.h,low:e.l,prevClose:e.pc,signal:e.signal};
  });
  try {
    var res=await fetch(API_BASE+'/api/ai/market-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({etfs:summary})});
    if (!res.ok) throw new Error('HTTP '+res.status);
    var data=await res.json();
    content.innerHTML=formatAI(data.analysis);
  } catch(err) {
    content.innerHTML='<div class="error-card">Failed to generate AI analysis. Check server and ANTHROPIC_API_KEY.</div>';
  } finally { btn.disabled=false; btn.textContent='Generate Analysis'; }
}

function formatAI(t) {
  if (!t) return '<p class="ai-placeholder">No analysis available.</p>';
  return '<div>'+t.replace(/### (.+)/g,'<h4>$1</h4>').replace(/## (.+)/g,'<h4>$1</h4>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/\n/g,'<br>')+'</div>';
}
