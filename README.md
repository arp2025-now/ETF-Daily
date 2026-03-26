# ETF Daily Recommendation Dashboard

A beautiful dark-mode dashboard that provides daily ETF recommendations powered by AI analysis.

![Status](https://img.shields.io/badge/Status-Active-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Real-time ETF Data** -- Live prices, volume, and performance from Finnhub API
- **AI-Powered Analysis** -- Claude AI generates buy/sell/hold recommendations
- **Beautiful Dark UI** -- Modern card-based layout with Chart.js visualizations
- **Responsive Design** -- Desktop, tablet, and mobile
- **RTL Support** -- Hebrew-friendly interface elements

## Quick Start

```bash
git clone https://github.com/arp2025-now/ETF-Daily.git
cd ETF-Daily/server
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

Open http://localhost:3000

## API Keys Required

- **FINNHUB_API_KEY** -- Get from https://finnhub.io/
- **ANTHROPIC_API_KEY** -- Get from https://console.anthropic.com/

## Project Structure

```
ETF-Daily/
  etf-dashboard.html      # Dashboard page
  etf-dashboard.css        # Styles
  etf-dashboard.js         # Frontend logic
  server/
    server.js              # Express API server
    package.json           # Dependencies
    .env.example           # Environment template
    .gitignore             # Server ignores
  .gitignore
  README.md
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| /api/etf/:symbol/quote | GET | Real-time ETF quote |
| /api/etf/:symbol/candles | GET | Historical candle data |
| /api/etf/market-status | GET | Market open/close status |
| /api/ai/recommendation | POST | AI recommendation for an ETF |
| /api/ai/market-analysis | POST | AI market analysis |

## Disclaimer

For educational purposes only. Not financial advice.

## License

MIT
