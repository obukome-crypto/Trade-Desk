import { useEffect, useMemo, useState } from 'react'
import { fetchCryptoPrices, fetchStockPrices, hasAlpacaKeys } from './api.js'
import { loadState, saveState, START_CASH } from './storage.js'

const money = (n) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPrice = (n) =>
  n == null ? '--' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 2 })

const keyOf = (item) => item.type + ':' + item.symbol

export default function App() {
  const [state, setState] = useState(loadState)
  const [prices, setPrices] = useState({}) // { 'crypto:BTC': { price, change } }
  const [tab, setTab] = useState('watch')
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => saveState(state), [state])

  // Live prices: refresh every 5 seconds
  useEffect(() => {
    let alive = true
    const cryptoSyms = state.watchlist.filter((w) => w.type === 'crypto').map((w) => w.symbol)
    const stockSyms = state.watchlist.filter((w) => w.type === 'stock').map((w) => w.symbol)
    // also include held positions so value stays live
    Object.values(state.positions).forEach((p) => {
      const list = p.type === 'crypto' ? cryptoSyms : stockSyms
      if (!list.includes(p.symbol)) list.push(p.symbol)
    })

    async function tick() {
      try {
        const [c, s] = await Promise.all([
          fetchCryptoPrices([...new Set(cryptoSyms)]),
          stockSyms.length ? fetchStockPrices([...new Set(stockSyms)]) : Promise.resolve({}),
        ])
        if (!alive) return
        const next = {}
        for (const k of Object.keys(c)) next['crypto:' + k] = c[k]
        for (const k of Object.keys(s)) next['stock:' + k] = s[k]
        setPrices((prev) => ({ ...prev, ...next }))
        setLastUpdate(new Date())
        setError('')
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [state.watchlist, state.positions])

  const holdings = useMemo(
    () =>
      Object.values(state.positions).map((p) => {
        const live = prices[keyOf(p)]?.price ?? p.avgCost
        return { ...p, live, value: live * p.qty }
      }),
    [state.positions, prices]
  )

  const invested = holdings.reduce((sum, h) => sum + h.value, 0)
  const total = state.cash + invested
  const pnl = total - START_CASH

  function priceFor(item) {
    return prices[keyOf(item)]?.price
  }

  function trade(item, side, qty) {
    const price = priceFor(item)
    if (!price) return { ok: false, msg: 'no live price yet' }
    const k = keyOf(item)
    setState((s) => {
      const pos = s.positions[k]
      if (side === 'buy') {
        const cost = price * qty
        if (cost > s.cash) return s
        const newQty = (pos?.qty || 0) + qty
        const avg = ((pos?.avgCost || 0) * (pos?.qty || 0) + cost) / newQty
        return {
          ...s,
          cash: s.cash - cost,
          positions: { ...s.positions, [k]: { symbol: item.symbol, type: item.type, qty: newQty, avgCost: avg } },
          trades: [{ t: Date.now(), side, symbol: item.symbol, qty, price }, ...s.trades].slice(0, 200),
        }
      } else {
        if (!pos || qty > pos.qty) return s
        const left = pos.qty - qty
        const positions = { ...s.positions }
        if (left <= 1e-12) delete positions[k]
        else positions[k] = { ...pos, qty: left }
        return {
          ...s,
          cash: s.cash + price * qty,
          positions,
          trades: [{ t: Date.now(), side, symbol: item.symbol, qty, price }, ...s.trades].slice(0, 200),
        }
      }
    })
    return { ok: true }
  }

  function resetAll() {
    if (window.confirm('Reset paper account back to $10,000? Trades and positions will be cleared.')) {
      setState((s) => ({ ...s, cash: START_CASH, positions: {}, trades: [] }))
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Trade Desk</h1>
        <p>Paper trading · fake money · live prices</p>
      </div>

      <div className="card balance">
        <h2>Portfolio</h2>
        <div className="big">{money(total)}</div>
        <div className="row">
          <span>Cash</span>
          <span>{money(state.cash)}</span>
        </div>
        <div className="row">
          <span>Positions</span>
          <span>{money(invested)}</span>
        </div>
        <div className="row">
          <span>All time</span>
          <span className={pnl >= 0 ? 'up' : 'down'}>
            {(pnl >= 0 ? '+' : '') + money(pnl)}
          </span>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {lastUpdate ? 'prices updated ' + lastUpdate.toLocaleTimeString() : 'loading prices…'}
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {tab === 'watch' && (
        <Watchlist
          state={state}
          setState={setState}
          prices={prices}
          priceFor={priceFor}
          onTrade={(item) => setTab('trade:' + keyOf(item))}
        />
      )}

      {tab.startsWith('trade:') && (
        <TradePanel
          item={state.watchlist.find((w) => keyOf(w) === tab.slice(6)) || holdingAsItem(state, tab.slice(6))}
          price={priceFor(state.watchlist.find((w) => keyOf(w) === tab.slice(6)) || holdingAsItem(state, tab.slice(6)))}
          cash={state.cash}
          held={state.positions[tab.slice(6)]?.qty || 0}
          onTrade={trade}
          onClose={() => setTab('watch')}
        />
      )}

      {tab === 'portfolio' && (
        <div className="card">
          <h2>Positions</h2>
          {holdings.length === 0 && <div className="empty">No positions yet. Buy something from Watchlist.</div>}
          {holdings.map((h) => (
            <div className="item" key={keyOf(h)}>
              <div>
                <div className="sym">{h.symbol}</div>
                <div className="sub">
                  {h.qty.toFixed(6).replace(/\.?0+$/, '')} units · avg {fmtPrice(h.avgCost)}
                </div>
              </div>
              <div className="price">
                <div>{money(h.value)}</div>
                <div className="sub">now {fmtPrice(h.live)}</div>
              </div>
            </div>
          ))}

          <h2 style={{ marginTop: 22 }}>Recent trades</h2>
          {state.trades.length === 0 && <div className="empty">No trades yet.</div>}
          {state.trades.slice(0, 20).map((t, i) => (
            <div className="item" key={i}>
              <div>
                <div className={'sym ' + (t.side === 'buy' ? 'up' : 'down')}>
                  {t.side.toUpperCase()} {t.symbol}
                </div>
                <div className="sub">
                  {new Date(t.t).toLocaleString()} · {t.qty} @ {fmtPrice(t.price)}
                </div>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 18 }}>
            <button className="ghost" onClick={resetAll} style={{ width: '100%' }}>
              Reset to $10,000
            </button>
          </div>
        </div>
      )}

      {tab === 'stocks' && <StocksInfo />}

      <nav className="tabs">
        <button className={tab === 'watch' ? 'active' : ''} onClick={() => setTab('watch')}>Watchlist</button>
        <button className={tab === 'portfolio' ? 'active' : ''} onClick={() => setTab('portfolio')}>Portfolio</button>
        <button className={tab === 'stocks' ? 'active' : ''} onClick={() => setTab('stocks')}>Stock keys</button>
      </nav>
    </div>
  )
}

function holdingAsItem(state, k) {
  const p = state.positions[k]
  return p ? { symbol: p.symbol, type: p.type } : null
}

function Watchlist({ state, setState, prices, priceFor, onTrade }) {
  const [symbol, setSymbol] = useState('')
  const [type, setType] = useState('crypto')
  const [err, setErr] = useState('')

  function add(e) {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
    if (!sym) return setErr('Type a symbol first.')
    if (state.watchlist.some((w) => w.symbol === sym && w.type === type)) return setErr(sym + ' is already on your list.')
    if (type === 'stock' && !hasAlpacaKeys) return setErr('Add your Alpaca keys first (see Stock keys tab).')
    setState((s) => ({ ...s, watchlist: [...s.watchlist, { symbol: sym, type }] }))
    setSymbol('')
    setErr('')
  }

  function remove(item) {
    setState((s) => ({
      ...s,
      watchlist: s.watchlist.filter((w) => !(w.symbol === item.symbol && w.type === item.type)),
    }))
  }

  return (
    <>
      <div className="card">
        <h2>Add to watchlist</h2>
        <form className="form" onSubmit={add}>
          <div className="pair">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="crypto">Crypto (Binance)</option>
              <option value="stock">US stock (Alpaca)</option>
            </select>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={type === 'crypto' ? 'e.g. ADA' : 'e.g. AAPL'}
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </div>
          <button type="submit">Add symbol</button>
          {err && <div className="error">{err}</div>}
        </form>
      </div>

      <div className="card">
        <h2>Watchlist</h2>
        {state.watchlist.length === 0 && <div className="empty">Your list is empty. Add a symbol above.</div>}
        {state.watchlist.map((w) => {
          const p = prices[keyOf(w)]
          return (
            <div className="item" key={keyOf(w)}>
              <div>
                <div className="sym">{w.symbol}</div>
                <div className="sub">{w.type === 'crypto' ? 'Crypto · USDT' : 'US stock'}</div>
              </div>
              <div className="price">
                <div>{p ? fmtPrice(p.price) : w.type === 'stock' && !hasAlpacaKeys ? 'no keys' : '…'}</div>
                {p && (
                  <div className={p.change >= 0 ? 'up sub' : 'down sub'}>
                    {(p.change >= 0 ? '+' : '') + p.change.toFixed(2)}%
                  </div>
                )}
              </div>
              <div className="row-actions">
                <button className="buy" disabled={!p} onClick={() => onTrade(w)}>Trade</button>
                <button className="ghost" onClick={() => remove(w)} aria-label={'remove ' + w.symbol}>✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TradePanel({ item, price, cash, held, onTrade, onClose }) {
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')
  if (!item) return null
  const n = parseFloat(qty) || 0
  const cost = (price || 0) * n

  function go(side) {
    if (!n || n <= 0) return setMsg('Enter a quantity.')
    const res = onTrade(item, side, n)
    if (!res.ok) return setMsg(res.msg)
    setMsg('')
    setQty('')
  }

  return (
    <div className="card">
      <h2>
        {item.symbol} · {item.type === 'crypto' ? 'Crypto' : 'US stock'}
      </h2>
      <div className="sub" style={{ fontSize: 22, color: '#e6edf3', fontWeight: 700 }}>
        {fmtPrice(price)}
      </div>
      <div className="muted" style={{ marginTop: 4 }}>
        Cash {money(cash)} · you hold {held}
      </div>
      <div className="form" style={{ marginTop: 14 }}>
        <input
          inputMode="decimal"
          placeholder="Quantity (e.g. 0.5)"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <div className="muted">Estimated cost: {money(cost)}</div>
        <div className="pair">
          <button className="buy" disabled={!price} onClick={() => go('buy')}>Buy</button>
          <button className="sell" disabled={!price || held <= 0} onClick={() => go('sell')}>Sell</button>
        </div>
        {!price && <div className="muted">Waiting for a live price…</div>}
        {msg && <div className="error">{msg}</div>}
        <button className="ghost" onClick={onClose}>Back to watchlist</button>
      </div>
    </div>
  )
}

function StocksInfo() {
  return (
    <div className="card">
      <h2>Stock quotes (Alpaca)</h2>
      {hasAlpacaKeys ? (
        <div className="notice">
          Alpaca keys are set. Stock quotes are live. Add a stock from the Watchlist tab.
        </div>
      ) : (
        <div className="notice">
          Stock prices are off until you add your Alpaca keys.
          <br />
          1. Make a free account at alpaca.markets and open Paper Trading, then copy your API key and secret.
          <br />
          2. In Vercel, open the project, go to Settings, then Environment Variables.
          <br />
          3. Add VITE_ALPACA_KEY and VITE_ALPACA_SECRET, then redeploy.
          <br />
          Crypto prices work already, no keys needed.
        </div>
      )}
    </div>
  )
}
