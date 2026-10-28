# Trade Desk

Personal paper-trading dashboard. React + Vite, plain JavaScript. Fake money only, no real trades.

- Crypto prices: Binance public API, no key needed.
- Stock quotes: Alpaca Market Data API. Add VITE_ALPACA_KEY and VITE_ALPACA_SECRET (see .env.example).
- Paper account: starts with $10,000 cash, saved in your browser's localStorage.

Run locally: npm install, then npm run dev. Build: npm run build.
Deploy: import the repo into Vercel (framework preset Vite) and it auto-deploys on each push to main.
