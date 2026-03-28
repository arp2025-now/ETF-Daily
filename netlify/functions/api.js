var https = require('https');

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

exports.handler = async function(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: headers, body: '' };
  }

  var path = event.path.replace('/.netlify/functions/api', '');

  try {
    // GET /api/etf/market-status
    if (path === '/api/etf/market-status' && event.httpMethod === 'GET') {
      var r = await httpsReq('GET', fUrl('/stock/market-status?exchange=US'));
      return { statusCode: r.status, headers: headers, body: JSON.stringify(r.data) };
    }

    // GET /api/etf/:symbol/quote
    var quoteMatch = path.match(/^\/api\/etf\/([A-Z]+)\/quote$/);
    if (quoteMatch && event.httpMethod === 'GET') {
      var r = await httpsReq('GET', fUrl('/quote?symbol=' + quoteMatch[1]));
      return { statusCode: r.status, headers: headers, body: JSON.stringify(r.data) };
    }

    // GET /api/etf/:symbol/candles
    var candleMatch = path.match(/^\/api\/etf\/([A-Z]+)\/candles$/);
    if (candleMatch && event.httpMethod === 'GET') {
      var sym = candleMatch[1];
      var qs = event.queryStringParameters || {};
      var resolution = qs.resolution || 'D';
      var to = qs.to || Math.floor(Date.now()/1000);
      var from = qs.from || (to - 30*86400);
      var r = await httpsReq('GET', fUrl('/stock/candle?symbol='+sym+'&resolution='+resolution+'&from='+from+'&to='+to));
      return { statusCode: r.status, headers: headers, body: JSON.stringify(r.data) };
    }

    // POST /api/ai/recommendation
    if (path === '/api/ai/recommendation' && event.httpMethod === 'POST') {
      var b = JSON.parse(event.body);
      var text = await claude(
        'You are an expert ETF analyst. Provide concise analysis with a clear BUY/SELL/HOLD recommendation. Under 150 words.',
        'ETF: '+b.symbol+' ('+b.sector+')\nPrice: $'+b.quote.c+' | Change: '+(b.quote.dp>=0?'+':'')+b.quote.dp+'%\nO: $'+b.quote.o+' H: $'+b.quote.h+' L: $'+b.quote.l+' PC: $'+b.quote.pc+'\nRecommendation?'
      );
      return { statusCode: 200, headers: headers, body: JSON.stringify({recommendation:text}) };
    }

    // POST /api/ai/market-analysis
    if (path === '/api/ai/market-analysis' && event.httpMethod === 'POST') {
      var body = JSON.parse(event.body);
      var etfs = body.etfs;
      var today = new Date().toISOString().split('T')[0];
      var summary = etfs.map(function(e) {
        return e.symbol+' ('+e.sector+'): $'+(e.price?e.price.toFixed(2):'N/A')+' | '+(e.changePercent>=0?'+':'')+(e.changePercent?e.changePercent.toFixed(2):'0.00')+'% | '+e.signal;
      }).join('\n');
      var text = await claude(
        'You are a senior market strategist. Analyze ETF data with: 1) Market sentiment 2) Sector breakdown 3) Top picks 4) Risk factors 5) Summary. Use ### headers and bullets. Under 500 words. Date: '+today,
        'ETF Data:\n'+summary+'\n\nProvide daily market analysis.'
      );
      return { statusCode: 200, headers: headers, body: JSON.stringify({analysis:text}) };
    }

    return { statusCode: 404, headers: headers, body: JSON.stringify({error:'Not found'}) };
  } catch(e) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({error:e.message}) };
  }
};
