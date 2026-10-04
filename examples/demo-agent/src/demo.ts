import { agentAccount, getAgentKeyStatus, getBalance, TIP20_DECIMALS, totalUsd } from '@pitstop/sdk'
import { Mppx, tempo } from 'mppx/client'
import { formatUnits } from 'viem'
import { GUARD_URL, loadKey, requireWallet } from './agent-key.js'

// End-to-end demo: an agent researches tokens on Nansen, paying $0.01 per call over MPP
// with its Pitstop access key, until the owner's daily limit stops it.
//   pnpm demo [maxCalls=20]
const maxCalls = Number(process.argv[2] ?? 20)
const key = loadKey()
if (!key) throw new Error('No access key. Run: pnpm key')
const wallet = requireWallet()
const usd = (v: bigint) => Number(formatUnits(v, TIP20_DECIMALS)).toFixed(4)

const TOKENS: [string, string, string][] = [
  ['ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC'],
  ['ethereum', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'WETH'],
  ['ethereum', '0x514910771AF9Ca656af840dff83E8264EcF986CA', 'LINK'],
  ['ethereum', '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 'UNI'],
  ['ethereum', '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', 'AAVE'],
  ['base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC (Base)'],
]

const mppx = Mppx.create({ methods: [tempo({ account: agentAccount(key.privateKey, wallet) })], polyfill: false })

const start = await getAgentKeyStatus({ wallet, key: key.address })
const balance = totalUsd(await getBalance({ address: wallet }))
console.log(`Agent wallet ${wallet}`)
console.log(`Balance $${usd(balance)} · key ${start.revoked ? 'REVOKED' : start.authorized ? 'active' : 'not authorized'} · limit left today $${usd(start.remaining)}\n`)

for (let i = 0; i < maxCalls; i++) {
  const [chain, token, name] = TOKENS[i % TOKENS.length]!
  process.stdout.write(`#${String(i + 1).padStart(2)} Nansen token info: ${name.padEnd(12)} `)
  try {
    const res = await mppx.fetch('https://api.nansen.ai/api/v1/tgm/token-information', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Payment' },
      body: JSON.stringify({ chain, token_address: token, timeframe: '1d' }),
    })
    const body = (await res.json().catch(() => ({}))) as { data?: { token_details?: { market_cap_usd?: number } } }
    const cap = body.data?.token_details?.market_cap_usd
    const left = await getAgentKeyStatus({ wallet, key: key.address })
    console.log(`paid $0.01 → ${res.status}${cap ? ` · mcap $${(cap / 1e9).toFixed(2)}B` : ''} · limit left $${usd(left.remaining)}`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const reason = /Account keychain error: (\w+)|AccountKeychainError\((\w+)/.exec(msg)?.slice(1).find(Boolean)
    console.log(reason ? `BLOCKED by the guard: ${reason}` : `failed: ${msg.split('\n')[0]}`)
    if (reason) {
      console.log(`\nThe agent hit its daily limit. Only the owner can raise it: ${GUARD_URL}/guard?key=${key.address}`)
      process.exit(2)
    }
  }
}
