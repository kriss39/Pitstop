// Public usage numbers for /stats: transfers routed with Pitstop's LI.FI integrator id,
// Pitstop's fees from them, and Telegram watches.

const LIFI = 'https://li.quest'
const INTEGRATOR = 'pitstop'
const CACHE_MS = 5 * 60_000
const MAX_PAGES = 10

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
type FeeCost = { token?: { symbol?: string; decimals?: number; priceUSD?: string }; feeSplit?: { integratorFee?: string } }
type Transfer = {
  feeCosts?: FeeCost[]
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
  transfers: number
  users: number
  agents: number
  volumeUsd: number
  /** Pitstop's integrator fees, from each transfer's fee split (stablecoins at $1). */
  feesEarnedUsd: number
  telegram: { chats: number; agents: number }
  byChain: { chain: string; transfers: number; volumeUsd: number }[]
  recent: { time: number; chain: string; amountUsd: number; token: string; tool: string; link?: string }[]
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
    // From before Pitstop's first transfer, so the count isn't limited to LI.FI's default window.
    const q = new URLSearchParams({ integrator: INTEGRATOR, limit: '100', fromTimestamp: '1788000000', ...(next ? { next } : {}) })
    const body = await lifiGet<{ data: Transfer[]; hasNext?: boolean; next?: string }>(`/v2/analytics/transfers?${q}`, apiKey)
    out.push(...body.data)
    if (!body.hasNext || !body.next) break
    next = body.next
  }
  return out
}

/** Pitstop's share of the fees on a transfer, in dollars. */
function earnedUsd(t: Transfer): number {
  let usd = 0
  for (const f of t.feeCosts ?? []) {
    const raw = Number(f.feeSplit?.integratorFee ?? 0)
    if (!raw) continue
    const amount = raw / 10 ** (f.token?.decimals ?? 6)
    usd += /usd/i.test(f.token?.symbol ?? '') ? amount : amount * Number(f.token?.priceUSD ?? 0)
  }
  return usd
}

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

  const [transfers, watches] = await Promise.all([
    allTransfers(apiKey),
    db
      ? db.prepare('SELECT count(DISTINCT chat_id) AS chats, count(DISTINCT address) AS agents FROM watches').first<{ chats: number; agents: number }>()
      : null,
  ])
  const done = transfers.filter((t) => t.status === 'DONE')

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
    transfers: done.length,
    users: new Set(done.map((t) => (t.fromAddress ?? '').toLowerCase())).size,
    agents: new Set(done.map((t) => (t.toAddress ?? '').toLowerCase())).size,
    volumeUsd: round(done.reduce((s, t) => s + usdOf(t), 0)),
    feesEarnedUsd: Math.round(done.reduce((sum, t) => sum + earnedUsd(t), 0) * 10_000) / 10_000,
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
        link: t.lifiExplorerLink,
      })),
  }
  cached = { at: Date.now(), stats }
  return stats
}
