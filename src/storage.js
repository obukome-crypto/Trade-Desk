// Everything the user owns lives in localStorage. Nothing is sent to a server.
const KEY = 'tradedesk.v1'
export const START_CASH = 10000

const DEFAULT_WATCHLIST = [
  { symbol: 'BTC', type: 'crypto' },
  { symbol: 'ETH', type: 'crypto' },
  { symbol: 'SOL', type: 'crypto' },
  { symbol: 'XRP', type: 'crypto' },
  { symbol: 'DOGE', type: 'crypto' },
]

export function defaultState() {
  return { cash: START_CASH, positions: {}, trades: [], watchlist: DEFAULT_WATCHLIST }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const s = JSON.parse(raw)
    return { ...defaultState(), ...s }
  } catch {
    return defaultState()
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}
