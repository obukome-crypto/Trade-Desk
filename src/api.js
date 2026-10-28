// Live price helpers. Binance needs no key. Alpaca needs VITE_ALPACA_KEY / VITE_ALPACA_SECRET.

export const ALPACA_KEY = import.meta.env.VITE_ALPACA_KEY || ''
export const ALPACA_SECRET = import.meta.env.VITE_ALPACA_SECRET || ''
export const hasAlpacaKeys = Boolean(ALPACA_KEY && ALPACA_SECRET)

// Binance: key = 'BTC' -> pair 'BTCUSDT'. Returns { BTC: { price, change } }
export async function fetchCryptoPrices(symbols) {
  if (!symbols.length) return {}
  const pairs = symbols.map((s) => s + 'USDT')
  const url =
    'https://api.binance.com/api/v3/ticker/24hr?symbols=' +
    encodeURIComponent(JSON.stringify(pairs))
  const res = await fetch(url)
  if (!res.ok) throw new Error('Binance request failed (' + res.status + ')')
  const rows = await res.json()
  const out = {}
  for (const r of rows) {
    const sym = r.symbol.replace(/USDT$/, '')
    out[sym] = { price: parseFloat(r.lastPrice), change: parseFloat(r.priceChangePercent) }
  }
  return out
}

// Alpaca snapshots: returns { AAPL: { price, change } }
export async function fetchStockPrices(symbols) {
  if (!symbols.length || !hasAlpacaKeys) return {}
  const url =
    'https://data.alpaca.markets/v2/stocks/snapshots?feed=iex&symbols=' +
    encodeURIComponent(symbols.join(','))
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': ALPACA_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET,
    },
  })
  if (!res.ok) throw new Error('Alpaca request failed (' + res.status + '). Check your keys.')
  const json = await res.json()
  const snaps = json.snapshots || json
  const out = {}
  for (const sym of Object.keys(snaps)) {
    const s = snaps[sym] || {}
    const price = s.latestTrade?.p ?? s.dailyBar?.c ?? s.prevDailyBar?.c
    const prev = s.prevDailyBar?.c
    if (price == null) continue
    const change = prev ? ((price - prev) / prev) * 100 : 0
    out[sym] = { price: Number(price), change }
  }
  return out
}
