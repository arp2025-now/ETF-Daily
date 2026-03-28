require('dotenv').config({ override: true });
var express = require('express');
var cors = require('cors');
var https = require('https');
var path = require('path');

var app = express();
var PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

function httpsReq(method, url, body, headers) {
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: method,
      headers: Object.assign({'Content-Type':'application/json'}, headers || {})
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    var req = https.request(opts, function(res) {
      var b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        try { resolve({status:res.statusCode,data:JSON.parse(b)}); }
        catch(e) { resolve({status:res.statusCode,data:b}); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

var FINNHUB = 'https://finnhub.io/api/v1';
function fUrl(p) {
  var k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error('FINNHUB_API_KEY not set');
  return FINNHUB + p + (p.includes('?') ? '&' : '?') + 'token=' + k;
}

app.get('/api/etf/:symbol/quote', async function(req, res) {
  try {
    var r = await httpsReq('GET', fUrl('/quote?symbol=' + req.params.symbol.toUpperCase()));
    if (r.status !== 200) return res.status(r.status).json({error:'Finnhub error'});
    res.json(r.data);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/etf/:symbol/candles', async function(req, res) {
  try {
    var sym = req.params.symbol.toUpperCase();
    var resolution = req.query.resolution || 'D';
    var to = req.query.to || Math.floor(Date.now()/1000);
    var from = req.query.from || (to - 30*86400);
    var r = await httpsReq('GET', fUrl('/stock/candle?symbol='+sym+'&resolution='+resolution+'&from='+from+'&to='+to));
    if (r.status !== 200) return res.status(r.status).json({error:'Finnhub error'});
    res.json(r.data);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/etf/market-status', async function(req, res) {
  try {
    var r = await httpsReq('GET', fUrl('/stock/market-status?exchange=US'));
    if (r.status !== 200) return res.status(r.status).json({error:'Finnhub error'});
    res.json(r.data);
  } catch(e) { res.status(500).json({error:e.message}); }
});

async function claude(sys, msg) {
  var k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set');
  var r = await httpsReq('POST', 'https://api.anthropic.com/v1/messages', {
    model:'claude-sonnet-4-20250514', max_tokens:2048, system:sys,
    messages:[{role:'user',content:msg}]
  }, {'x-api-key':k,'anthropic-version':'2023-06-01'});
  if (r.status !== 200) throw new Error('Claude API '+r.status);
  return r.data.content[0].text;
}

app.post('/api/ai/recommendation', async function(req, res) {
  try {
    var b = req.body;
    var text = await claude(
      'You are an expert ETF analyst. Provide concise analysis with a clear BUY/SELL/HOLD recommendation. Under 150 words.',
      'ETF: '+b.symbol+' ('+b.sector+')\nPrice: $'+b.quote.c+' | Change: '+(b.quote.dp>=0?'+':'')+b.quote.dp+'%\nO: $'+b.quote.o+' H: $'+b.quote.h+' L: $'+b.quote.l+' PC: $'+b.quote.pc+'\nRecommendation?'
    );
    res.json({recommendation:text});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/ai/market-analysis', async function(req, res) {
  try {
    var etfs = req.body.etfs;
    var today = new Date().toISOString().split('T')[0];
    var summary = etfs.map(function(e) {
      return e.symbol+' ('+e.sector+'): $'+(e.price?e.price.toFixed(2):'N/A')+' | '+(e.changePercent>=0?'+':'')+(e.changePercent?e.changePercent.toFixed(2):'0.00')+'% | '+e.signal;
    }).join('\n');
    var text = await claude(
      'You are a senior market strategist. Analyze ETF data with: 1) Market sentiment 2) Sector breakdown 3) Top picks 4) Risk factors 5) Summary. Use ### headers and bullets. Under 500 words. Date: '+today,
      'ETF Data:\n'+summary+'\n\nProvide daily market analysis.'
    );
    res.json({analysis:text});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.listen(PORT, function() {
  console.log('\n  ETF Daily Dashboard Server');
  console.log('  http://localhost:' + PORT);
  console.log('  Finnhub: ' + (process.env.FINNHUB_API_KEY ? 'OK' : 'MISSING'));
  console.log('  Anthropic: ' + (process.env.ANTHROPIC_API_KEY ? 'OK' : 'MISSING') + '\n');
});
