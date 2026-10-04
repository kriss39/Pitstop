import { FUEL_TOKENS, getAgentKeyStatus, getBalance, TEMPO_TOKENS, totalUsd, type FuelTokenSymbol } from '@pitstop/sdk'
import { formatUnits, getAddress, isAddress, type Address } from 'viem'

export const APP_URL = 'https://fuel.pitstopgas.workers.dev'
const LOW_BALANCE_REPEAT_MS = 6 * 60 * 60_000
/** Below one cent the key can't pay even the cheapest MPP call, so treat the limit as used up. */
const LIMIT_USED_BELOW = 10_000n

type AgentRow = {
  address: string
  name: string | null
  min_balance_usd: number
  telegram_chat_id: string
  access_key: string | null
  token: string
  alert_state: string
}

const asToken = (t?: string | null): FuelTokenSymbol => {
  const match = FUEL_TOKENS.find((x) => x.toLowerCase() === (t ?? '').toLowerCase())
  return match ?? 'USDCe'
}

/** Which alerts were already sent, so each condition notifies once. */
type AlertState = { lowBalanceAt?: number; limitPeriodEnd?: number; revoked?: boolean }

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
        : s.authorized
          ? `Key: active, ${usd(s.remaining)} ${token} left today`
          : 'Key: not authorized yet',
    )
  }
  return lines.join('\n')
}

const HELP = [
  'Pitstop alerts for your AI agents.',
  '',
  '/watch <wallet> [key] [token] — alert me when this agent runs low or hits its daily limit (token: USDCe, PathUSD, USDT0 or OUSD; default USDCe)',
  '/status — show watched agents',
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
    await db
      .prepare(
        `INSERT INTO agents (address, telegram_chat_id, access_key, token) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(address) DO UPDATE SET telegram_chat_id = ?2, access_key = coalesce(?3, access_key), token = ?4, alert_state = '{}'`,
      )
      .bind(address, String(chatId), accessKey, token)
      .run()
    return reply(`Watching this agent.\n\n${await describe(address, accessKey, token)}`)
  }

  if (cmd === '/status') {
    const { results } = await db
      .prepare('SELECT address, access_key, token FROM agents WHERE telegram_chat_id = ?1')
      .bind(String(chatId))
      .all<{ address: Address; access_key: Address | null; token: string }>()
    if (!results.length) return reply('No agents watched yet. Send /watch <wallet> [key].')
    const parts = await Promise.all(results.map((r) => describe(r.address, r.access_key, asToken(r.token))))
    return reply(parts.join('\n\n'))
  }

  if (cmd === '/stop') {
    await db.prepare('UPDATE agents SET telegram_chat_id = NULL WHERE telegram_chat_id = ?1').bind(String(chatId)).run()
    return reply('Alerts stopped for this chat.')
  }

  return reply(HELP)
}

/** Cron: checks every watched agent and sends each alert once. */
export async function checkAgents(db: D1Database, token: string) {
  const { results } = await db
    .prepare('SELECT address, name, min_balance_usd, telegram_chat_id, access_key, token, alert_state FROM agents WHERE telegram_chat_id IS NOT NULL')
    .all<AgentRow>()

  for (const agent of results) {
    try {
      const wallet = getAddress(agent.address)
      const state = JSON.parse(agent.alert_state || '{}') as AlertState
      const next: AlertState = { ...state }
      const label = agent.name ?? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
      const send = (t: string) => sendTelegram(token, agent.telegram_chat_id, t)

      const balance = totalUsd(await getBalance({ address: wallet }))
      const min = BigInt(Math.round(agent.min_balance_usd * 1e6))
      if (balance < min) {
        if (!state.lowBalanceAt || Date.now() - state.lowBalanceAt > LOW_BALANCE_REPEAT_MS) {
          await send(`⛽ ${label} is low on fuel: $${usd(balance)} (alert below $${agent.min_balance_usd}).\nRefuel from any chain: ${APP_URL}/?to=${wallet}`)
          next.lowBalanceAt = Date.now()
        }
      } else delete next.lowBalanceAt

      if (agent.access_key) {
        const s = await getAgentKeyStatus({ wallet, key: getAddress(agent.access_key), token: TEMPO_TOKENS[asToken(agent.token)] })
        if (s.revoked && !state.revoked) {
          await send(`🔒 ${label}: the agent key was revoked. It can no longer spend.`)
          next.revoked = true
        }
        if (s.authorized && !s.revoked && s.remaining < LIMIT_USED_BELOW && s.periodEnd && state.limitPeriodEnd !== s.periodEnd) {
          const resets = new Date(s.periodEnd * 1000).toISOString().replace('T', ' ').slice(0, 16)
          await send(`🛑 ${label} hit its daily spending limit. Payments are blocked until ${resets} UTC.\nRaise or keep the limit: ${APP_URL}/guard?key=${agent.access_key}`)
          next.limitPeriodEnd = s.periodEnd
        }
      }

      if (JSON.stringify(next) !== JSON.stringify(state))
        await db.prepare('UPDATE agents SET alert_state = ?2 WHERE address = ?1').bind(wallet, JSON.stringify(next)).run()
    } catch (error) {
      console.error('check failed', agent.address, error)
    }
  }
}
