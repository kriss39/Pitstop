import { FUEL_TOKENS, getAgentKeyStatus, getBalance, TEMPO_TOKENS, totalUsd, type FuelTokenSymbol } from '@getpitstop/sdk'
import { formatUnits, getAddress, isAddress, type Address } from 'viem'

export const APP_URL = 'https://fuel.pitstopgas.workers.dev'
const LOW_BALANCE_REPEAT_MS = 6 * 60 * 60_000
/** Below a tenth of a cent the key can't pay even the cheapest MPP call ($0.001), so treat the limit as used up. */
const LIMIT_USED_BELOW = 1_000n

/** Most agents one chat can watch; keeps the cron's work per run bounded. */
const MAX_WATCHES_PER_CHAT = 10
/** Most watches in total, so the every-minute cron stays within the Worker's subrequest budget. */
const MAX_WATCHES_TOTAL = 40

type WatchRow = {
  chat_id: string
  address: string
  min_balance_usd: number
  access_key: string | null
  token: string
  alert_state: string
}

const asToken = (t?: string | null): FuelTokenSymbol => {
  const match = FUEL_TOKENS.find((x) => x.toLowerCase() === (t ?? '').toLowerCase())
  return match ?? 'USDCe'
}

/** Which alerts were already sent, so each condition notifies once. */
type AlertState = { lowBalanceAt?: number; limitPeriodEnd?: number; revoked?: boolean; expired?: boolean }

const usd = (v: bigint) => Number(formatUnits(v, 6)).toFixed(2)

export async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!res.ok) console.error('telegram send failed', res.status, await res.text())
}

/** Describes an agent's wallet and key in a few lines. */
async function describe(wallet: Address, key?: Address | null, token: FuelTokenSymbol = 'USDCe') {
  const balance = totalUsd(await getBalance({ address: wallet }))
  const lines = [`Wallet ${wallet}`, `Balance $${usd(balance)}`]
  if (key) {
    const s = await getAgentKeyStatus({ wallet, key, token: TEMPO_TOKENS[token] })
    lines.push(
      s.revoked
        ? 'Key: revoked'
        : !s.authorized
          ? 'Key: not authorized yet'
          : s.expiry * 1000 < Date.now()
            ? 'Key: expired'
            : `Key: active, ${usd(s.remaining)} ${token} left today`,
    )
  }
  return lines.join('\n')
}

const HELP = [
  'Pitstop alerts for your AI agents.',
  '',
  '/watch <wallet> [key] [token] — alert me when this agent runs low or hits its daily limit (token: USDCe, PathUSD, USDT0 or OUSD; default USDCe)',
  '/status — show watched agents',
  '/unwatch <wallet> — stop alerts for one agent',
  '/stop — stop all alerts for this chat',
].join('\n')

/** Handles a Telegram webhook update (bot commands). */
export async function handleTelegramUpdate(db: D1Database, token: string, update: unknown) {
  const msg = (update as { message?: { chat?: { id?: number }; text?: string } }).message
  const chatId = msg?.chat?.id
  const text = msg?.text?.trim() ?? ''
  if (!chatId) return
  const reply = (t: string) => sendTelegram(token, String(chatId), t)
  const [cmd, ...args] = text.split(/\s+/)

  if (cmd === '/watch') {
    const [wallet, key, tokenArg] = args
    if (!wallet || !isAddress(wallet) || (key && !isAddress(key)))
      return reply('Usage: /watch <wallet 0x…> [access key 0x…] [token]')
    const address = getAddress(wallet)
    const accessKey = key ? getAddress(key) : null
    const token = asToken(tokenArg)
    const count = await db.prepare('SELECT count(*) AS n FROM watches WHERE chat_id = ?1 AND address != ?2').bind(String(chatId), address).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_WATCHES_PER_CHAT) return reply(`This chat already watches ${MAX_WATCHES_PER_CHAT} agents. Send /unwatch <wallet> first.`)
    const total = await db.prepare('SELECT count(*) AS n FROM watches WHERE NOT (chat_id = ?1 AND address = ?2)').bind(String(chatId), address).first<{ n: number }>()
    if ((total?.n ?? 0) >= MAX_WATCHES_TOTAL) return reply('Pitstop alerts are full right now. Please try again later.')
    // Each chat has its own row, so watching an agent never changes anyone else's alerts.
    await db
      .prepare(
        `INSERT INTO watches (chat_id, address, access_key, token) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(chat_id, address) DO UPDATE SET access_key = coalesce(?3, access_key), token = ?4, alert_state = '{}'`,
      )
      .bind(String(chatId), address, accessKey, token)
      .run()
    return reply(`Watching this agent.\n\n${await describe(address, accessKey, token)}`)
  }

  if (cmd === '/status') {
    const { results } = await db
      .prepare('SELECT address, access_key, token FROM watches WHERE chat_id = ?1')
      .bind(String(chatId))
      .all<{ address: Address; access_key: Address | null; token: string }>()
    if (!results.length) return reply('No agents watched yet. Send /watch <wallet> [key].')
    const parts = await Promise.all(results.map((r) => describe(r.address, r.access_key, asToken(r.token))))
    return reply(parts.join('\n\n'))
  }

  if (cmd === '/unwatch') {
    const [wallet] = args
    if (!wallet || !isAddress(wallet)) return reply('Usage: /unwatch <wallet 0x…>')
    await db.prepare('DELETE FROM watches WHERE chat_id = ?1 AND address = ?2').bind(String(chatId), getAddress(wallet)).run()
    return reply('Stopped alerts for that agent.')
  }

  if (cmd === '/stop') {
    await db.prepare('DELETE FROM watches WHERE chat_id = ?1').bind(String(chatId)).run()
    return reply('Alerts stopped for this chat.')
  }

  return reply(HELP)
}

/** Cron: checks every watched agent and sends each alert once per chat. */
export async function checkAgents(db: D1Database, token: string) {
  const { results } = await db
    .prepare('SELECT chat_id, address, min_balance_usd, access_key, token, alert_state FROM watches')
    .all<WatchRow>()

  // Several chats can watch the same wallet; read each wallet's balances once per run.
  const balances = new Map<string, ReturnType<typeof getBalance>>()
  const balancesOf = (wallet: Address) => {
    if (!balances.has(wallet)) balances.set(wallet, getBalance({ address: wallet }))
    return balances.get(wallet)!
  }

  for (const watch of results) {
    try {
      const wallet = getAddress(watch.address)
      const agentToken = asToken(watch.token)
      const state = JSON.parse(watch.alert_state || '{}') as AlertState
      const next: AlertState = { ...state }
      // Labels are built here, never taken from user input, so alerts can't carry someone else's text.
      const label = `Agent ${wallet.slice(0, 6)}…${wallet.slice(-4)}`
      const send = (t: string) => sendTelegram(token, watch.chat_id, t)

      // With a key, "fuel" is what the key can spend; without one, every stablecoin counts.
      const all = await balancesOf(wallet)
      const balance = watch.access_key ? (all.find((b) => b.symbol === agentToken)?.raw ?? 0n) : totalUsd(all)
      const min = BigInt(Math.round(watch.min_balance_usd * 1e6))
      if (balance < min) {
        if (!state.lowBalanceAt || Date.now() - state.lowBalanceAt > LOW_BALANCE_REPEAT_MS) {
          await send(`⛽ ${label} is low on fuel: $${usd(balance)}${watch.access_key ? ` ${agentToken}` : ''} (alert below $${watch.min_balance_usd}).\nRefuel from any chain: ${APP_URL}/fuel?to=${wallet}`)
          next.lowBalanceAt = Date.now()
        }
      } else delete next.lowBalanceAt

      if (watch.access_key) {
        const s = await getAgentKeyStatus({ wallet, key: getAddress(watch.access_key), token: TEMPO_TOKENS[agentToken] })
        const expired = s.authorized && !s.revoked && s.expiry * 1000 < Date.now()
        if (s.revoked && !state.revoked) {
          await send(`🔒 ${label}: the agent key was revoked. It can no longer spend.`)
          next.revoked = true
        }
        if (expired && !state.expired) {
          await send(`⌛ ${label}: the agent key expired. Authorize a new key to keep it paying: ${APP_URL}/guard`)
          next.expired = true
        }
        if (s.authorized && !s.revoked && !expired && s.remaining < LIMIT_USED_BELOW && s.periodEnd && state.limitPeriodEnd !== s.periodEnd) {
          const resets = new Date(s.periodEnd * 1000).toISOString().replace('T', ' ').slice(0, 16)
          await send(`🛑 ${label} hit its daily spending limit. Payments are blocked until ${resets} UTC.\nRaise or keep the limit: ${APP_URL}/guard?key=${watch.access_key}`)
          next.limitPeriodEnd = s.periodEnd
        }
      }

      if (JSON.stringify(next) !== JSON.stringify(state))
        await db
          .prepare('UPDATE watches SET alert_state = ?3 WHERE chat_id = ?1 AND address = ?2')
          .bind(watch.chat_id, wallet, JSON.stringify(next))
          .run()
    } catch (error) {
      console.error('check failed', watch.address, error)
    }
  }
}
