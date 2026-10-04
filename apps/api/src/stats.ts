// Public usage numbers for /stats: transfers routed with Pitstop's LI.FI integrator id,
// Pitstop fees waiting to be claimed, and Telegram watches. Team test wallets are marked
// so outside usage can be told apart from our own testing.

const LIFI = 'https://li.quest'
const INTEGRATOR = 'pitstop'
const CACHE_MS = 5 * 60_000
const MAX_PAGES = 10

/** Wallets the Pitstop team used for mainnet tests (senders and the demo agent). */
const TEAM = new Set(
  [
    '0xFE99072AB3823d1873BB2caC339Ed326140fd169', // demo agent's home wallet on Base
    '0xA35ab49388eae377D0757d334C07C3bf4FB99AFc', // owner's wallet
    '0x0f7b41747db741E0A4fF444915F231452f9f92fA', // first test wallet
    'Bq2rLKotNSmnouVtyL3JFzYEUEjiD6P8WGKqFc1M42Dq', // owner's Solana wallet
    '0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0', // demo agent's Tempo wallet
  ].map((a) => a.toLowerCase()),
)

const CHAINS: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  5042: 'Arc',
  1151111081099710: 'Solana',
}

type Side = { chainId: number; amountUSD?: string; timestamp?: number; token?: { symbol?: string }; txHash?: string }
type Transfer = {
  fromAddress?: string
  toAddress?: string
  status?: string
  tool?: string
  lifiExplorerLink?: string
  sending: Side
  receiving: Side
}

export type Stats = {
  updatedAt: number
  transfers: { total: number; outside: number; team: number }
  users: number
  agents: number
  volumeUsd: { total: number; outside: number }
  feesUnclaimedUsd: number
  telegram: { chats: number; agents: number }
  byChain: { chain: string; transfers: number; volumeUsd: number }[]
  recent: { time: number; chain: string; amountUsd: number; token: string; tool: string; team: boolean; link?: string }[]
}

let cached: { at: number; stats: Stats } | undefined
/** A recent failure, remembered briefly so a LI.FI outage doesn't turn every page view into 11 calls. */
let failed: { at: number; error: Error } | undefined

async function lifiGet<T>(path: string, apiKey?: string): Promise<T> {
  const res = await fetch(`${LIFI}${path}`, {
    headers: apiKey ? { 'x-lifi-api-key': apiKey } : {},
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`LI.FI ${res.status}`)
  return (await res.json()) as T
}

async function allTransfers(apiKey?: string): Promise<Transfer[]> {
  const out: Transfer[] = []
  let next: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ integrator: INTEGRATOR, limit: '100', ...(next ? { next } : {}) })
    const body = await lifiGet<{ data: Transfer[]; hasNext?: boolean; next?: string }>(`/v2/analytics/transfers?${q}`, apiKey)
    out.push(...body.data)
    if (!body.hasNext || !body.next) break
    next = body.next
  }
  return out
}

/** Sums the integrator fees LI.FI holds for Pitstop, in dollars. */
async function unclaimedFees(apiKey?: string): Promise<number> {
  type Balance = { amountUsd?: string; amount?: string; token?: { decimals?: number; priceUSD?: string } }
  const body = await lifiGet<{ feeBalances?: { tokenBalances?: Balance[] }[] }>(`/v1/integrators/${INTEGRATOR}`, apiKey)
  let usd = 0
  for (const chain of body.feeBalances ?? [])
    for (const b of chain.tokenBalances ?? []) {
      if (b.amountUsd != null) usd += Number(b.amountUsd)
      else if (b.amount && b.token?.priceUSD) usd += (Number(b.amount) / 10 ** (b.token.decimals ?? 6)) * Number(b.token.priceUSD)
    }
  return usd
}

const isTeam = (t: Transfer) => TEAM.has((t.fromAddress ?? '').toLowerCase()) || TEAM.has((t.toAddress ?? '').toLowerCase())
const usdOf = (t: Transfer) => Number(t.sending.amountUSD ?? 0)
const round = (n: number) => Math.round(n * 100) / 100

export async function getStats(db: D1Database | undefined, apiKey?: string): Promise<Stats> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.stats
  if (failed && Date.now() - failed.at < 60_000) {
    if (cached) return cached.stats
    throw failed.error
  }
  try {
    return await computeStats(db, apiKey)
  } catch (e) {
    failed = { at: Date.now(), error: e instanceof Error ? e : new Error(String(e)) }
    if (cached) return cached.stats
    throw failed.error
  }
}

async function computeStats(db: D1Database | undefined, apiKey?: string): Promise<Stats> {

  const [transfers, fees, watches] = await Promise.all([
    allTransfers(apiKey),
    unclaimedFees(apiKey).catch(() => 0),
    db
      ? db.prepare('SELECT count(DISTINCT chat_id) AS chats, count(DISTINCT address) AS agents FROM watches').first<{ chats: number; agents: number }>()
      : null,
  ])
  const done = transfers.filter((t) => t.status === 'DONE')
  const outside = done.filter((t) => !isTeam(t))

  const byChain = new Map<string, { transfers: number; volumeUsd: number }>()
  for (const t of done) {
    const chain = CHAINS[t.sending.chainId] ?? `Chain ${t.sending.chainId}`
    const e = byChain.get(chain) ?? { transfers: 0, volumeUsd: 0 }
    e.transfers++
    e.volumeUsd += usdOf(t)
    byChain.set(chain, e)
  }

  const stats: Stats = {
    updatedAt: Date.now(),
    transfers: { total: done.length, outside: outside.length, team: done.length - outside.length },
    users: new Set(outside.map((t) => (t.fromAddress ?? '').toLowerCase())).size,
    agents: new Set(outside.map((t) => (t.toAddress ?? '').toLowerCase())).size,
    volumeUsd: { total: round(done.reduce((s, t) => s + usdOf(t), 0)), outside: round(outside.reduce((s, t) => s + usdOf(t), 0)) },
    feesUnclaimedUsd: Math.round(fees * 10_000) / 10_000,
    telegram: { chats: watches?.chats ?? 0, agents: watches?.agents ?? 0 },
    byChain: [...byChain.entries()]
      .map(([chain, e]) => ({ chain, transfers: e.transfers, volumeUsd: round(e.volumeUsd) }))
      .sort((a, b) => b.transfers - a.transfers),
    // No addresses here: the page shows what happened, not who did it.
    recent: done
      .sort((a, b) => (b.sending.timestamp ?? 0) - (a.sending.timestamp ?? 0))
      .slice(0, 12)
      .map((t) => ({
        time: t.sending.timestamp ?? 0,
        chain: CHAINS[t.sending.chainId] ?? `Chain ${t.sending.chainId}`,
        amountUsd: round(usdOf(t)),
        token: t.receiving.token?.symbol ?? '',
        tool: t.tool ?? '',
        team: isTeam(t),
        link: t.lifiExplorerLink,
      })),
  }
  cached = { at: Date.now(), stats }
  return stats
}
