import { getBalance, LIFI_API_URL, TEMPO_CHAIN_ID, totalUsd } from '@pitstop/sdk'
import { Hono } from 'hono'
import { checkAgents, handleTelegramUpdate } from './alerts.js'
import { getAddress, isAddress } from 'viem'

type Bindings = {
  /** Static web app (apps/web/dist). */
  ASSETS: Fetcher
  /** Agent registry. Optional until the D1 database is created. */
  DB?: D1Database
  LIFI_API_KEY?: string
  TELEGRAM_BOT_TOKEN?: string
  /** Shared secret Telegram sends in X-Telegram-Bot-Api-Secret-Token. */
  TELEGRAM_WEBHOOK_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', (c) => c.json({ ok: true, chainId: TEMPO_CHAIN_ID, registry: Boolean(c.env.DB) }))

app.get('/api/balance/:address', async (c) => {
  const address = c.req.param('address')
  if (!isAddress(address)) return c.json({ error: 'invalid address' }, 400)
  const balances = await getBalance({ address })
  return c.json({
    address,
    totalRaw: totalUsd(balances).toString(),
    balances: balances.map(({ symbol, token, raw, formatted }) => ({ symbol, token, raw: raw.toString(), amount: formatted })),
  })
})

// Solana balances for the fuel page. Solana's public RPC refuses browsers and Cloudflare's IPs
// for token-account reads, so the Worker asks Jupiter's free balance API first and the RPC second,
// and returns only the two numbers the page needs.
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

async function jupiterBalances(owner: string) {
  const res = await fetch(`https://lite-api.jup.ag/ultra/v1/balances/${owner}`)
  if (!res.ok) throw new Error(`Jupiter ${res.status}`)
  const body = (await res.json()) as Record<string, { amount: string } | undefined>
  return { sol: body.SOL?.amount ?? '0', usdc: body[SOLANA_USDC]?.amount ?? '0' }
}

async function rpcBalances(owner: string) {
  const rpc = async <T>(method: string, params: unknown[]) => {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    const body = (await res.json()) as { result?: T; error?: { message: string } }
    if (!body.result) throw new Error(body.error?.message ?? `Solana RPC ${res.status}`)
    return body.result
  }
  const [sol, usdc] = await Promise.all([
    rpc<{ value: number }>('getBalance', [owner]),
    // A wallet can hold USDC in more than one token account; add them up.
    rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>('getTokenAccountsByOwner', [
      owner,
      { mint: SOLANA_USDC },
      { encoding: 'jsonParsed' },
    ]),
  ])
  const usdcRaw = usdc.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n)
  return { sol: String(sol.value), usdc: usdcRaw.toString() }
}

app.get('/api/solana/balance/:owner', async (c) => {
  const owner = c.req.param('owner')
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) return c.json({ error: 'invalid address' }, 400)
  try {
    const b = await jupiterBalances(owner).catch(() => rpcBalances(owner))
    return c.json({ owner, ...b }, 200, { 'cache-control': 'no-store' })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Solana balance unavailable' }, 502)
  }
})

// LI.FI proxy: the browser never sees the API key. Only the read endpoints the
// fuel page needs are forwarded, so the key can't be used for anything else.
const LIFI_PATHS = new Set(['quote', 'status'])
app.get('/lifi/v1/:endpoint', async (c) => {
  const endpoint = c.req.param('endpoint')
  if (!LIFI_PATHS.has(endpoint)) return c.json({ message: 'Not found' }, 404)
  const url = new URL(c.req.url)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (c.env.LIFI_API_KEY) headers['x-lifi-api-key'] = c.env.LIFI_API_KEY
  const res = await fetch(`${LIFI_API_URL}/${endpoint}${url.search}`, { headers })
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  })
})

// Agent registry: public Tempo addresses the watcher should keep an eye on.
app.post('/api/agents', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'registry not configured' }, 503)
  const body = await c.req.json<{ address?: string; name?: string; minBalanceUsd?: number }>().catch(() => null)
  if (!body?.address || !isAddress(body.address)) return c.json({ error: 'address must be a 0x address' }, 400)
  const name = (body.name ?? '').trim().slice(0, 64) || null
  const minBalance = Number.isFinite(body.minBalanceUsd) ? Math.max(0, Math.min(1000, Number(body.minBalanceUsd))) : 1
  const address = getAddress(body.address)
  await db
    .prepare(
      `INSERT INTO agents (address, name, min_balance_usd) VALUES (?1, ?2, ?3)
       ON CONFLICT(address) DO UPDATE SET name = coalesce(?2, name), min_balance_usd = ?3`,
    )
    .bind(address, name, minBalance)
    .run()
  return c.json({ address, name, minBalanceUsd: minBalance }, 201)
})

app.get('/api/agents/:address', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'registry not configured' }, 503)
  const address = c.req.param('address')
  if (!isAddress(address)) return c.json({ error: 'invalid address' }, 400)
  const row = await db
    .prepare('SELECT address, name, min_balance_usd AS minBalanceUsd, created_at AS createdAt FROM agents WHERE address = ?1')
    .bind(getAddress(address))
    .first()
  return row ? c.json(row) : c.json({ error: 'not found' }, 404)
})

// Telegram bot webhook. Telegram signs each call with the secret set in setWebhook.
app.post('/api/telegram/webhook', async (c) => {
  const { DB, TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = c.env
  if (!DB || !token || !secret) return c.json({ error: 'alerts not configured' }, 503)
  if (c.req.header('x-telegram-bot-api-secret-token') !== secret) return c.json({ error: 'forbidden' }, 403)
  await handleTelegramUpdate(DB, token, await c.req.json().catch(() => ({})))
  return c.json({ ok: true })
})

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))
app.all('/lifi/*', (c) => c.json({ message: 'Not found' }, 404))

// Everything else is the web app.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  // Cron: watch registered agents and send Telegram alerts.
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    if (env.DB && env.TELEGRAM_BOT_TOKEN) ctx.waitUntil(checkAgents(env.DB, env.TELEGRAM_BOT_TOKEN))
  },
} satisfies ExportedHandler<Bindings>
