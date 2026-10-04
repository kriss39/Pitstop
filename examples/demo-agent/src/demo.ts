import { agentAccount, getAgentKeyStatus, getBalance, TIP20_DECIMALS, totalUsd } from '@pitstop/sdk'
import { Mppx, tempo } from 'mppx/client'
import { formatUnits } from 'viem'
import { AGENT_TOKEN, AGENT_TOKEN_ADDRESS, GUARD_URL, loadKey, requireWallet } from './agent-key.js'
import { codexPrice, nansenTokenInfo } from './services.js'

// End-to-end demo: a research agent checks tokens with two paid MPP services,
// Codex for the price ($0.001) and Nansen for token intelligence ($0.01),
// paying with its Pitstop access key until the owner's daily limit stops it.
// When Nansen no longer fits the budget, it keeps buying cheaper prices until
// those are refused too, so the day's budget really runs out.
//   pnpm demo [maxRounds=12]
const maxRounds = Number(process.argv[2] ?? 12)
const key = loadKey()
if (!key) throw new Error('No access key. Run: pnpm key')
const wallet = requireWallet()
const usd = (v: bigint) => Number(formatUnits(v, TIP20_DECIMALS)).toFixed(4)

const TOKENS = [
  { name: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { name: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  { name: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA' },
  { name: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
  { name: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9' },
]

const mppx = Mppx.create({ methods: [tempo({ account: agentAccount(key.privateKey, wallet) })], polyfill: false })
const left = async () => (await getAgentKeyStatus({ wallet, key: key.address, token: AGENT_TOKEN_ADDRESS })).remaining

const start = await getAgentKeyStatus({ wallet, key: key.address, token: AGENT_TOKEN_ADDRESS })
const balance = totalUsd(await getBalance({ address: wallet }))
console.log(`Agent wallet ${wallet}`)
console.log(`Balance $${usd(balance)} · key ${start.revoked ? 'REVOKED' : start.authorized ? 'active' : 'not authorized'} · ${AGENT_TOKEN} left today $${usd(start.remaining)}\n`)

/** Runs one paid call; returns false when the guard refused it. */
async function paid(label: string, price: string, call: () => Promise<string>): Promise<boolean> {
  process.stdout.write(`  ${label.padEnd(28)} `)
  try {
    const result = await call()
    console.log(`paid ${price} → ${result} · left $${usd(await left())}`)
    return true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const reason = /Account keychain error: (\w+)|AccountKeychainError\((\w+)/.exec(msg)?.slice(1).find(Boolean)
    if (reason) {
      console.log(`BLOCKED by the guard: ${reason}`)
      return false
    }
    console.log(`failed: ${msg.split('\n')[0]}`)
    return true
  }
}

let infoBlocked = false
for (let round = 0; round < maxRounds; round++) {
  const token = TOKENS[round % TOKENS.length]!
  console.log(`${token.name}`)
  const okPrice = await paid('Codex · price', '$0.001', async () => {
    const p = await codexPrice(mppx.fetch, { address: token.address, networkId: 1 })
    return p != null ? `$${p.toFixed(p < 10 ? 4 : 2)}` : 'no price'
  })
  if (!okPrice) break
  if (infoBlocked) continue
  const okInfo = await paid('Nansen · token intelligence', '$0.01', async () => {
    const cap = await nansenTokenInfo(mppx.fetch, { chain: 'ethereum', address: token.address })
    return cap ? `mcap $${(cap / 1e9).toFixed(2)}B` : 'ok'
  })
  if (!okInfo) {
    infoBlocked = true
    console.log('  (a Nansen call no longer fits; cheaper price lookups continue)')
  }
}

const end = await getAgentKeyStatus({ wallet, key: key.address, token: AGENT_TOKEN_ADDRESS })
// Below $0.001 not even the cheapest call fits.
if (end.remaining < 1_000n) {
  console.log(`\nThe agent hit its daily limit. Only the owner can raise it: ${GUARD_URL}/guard?key=${key.address}`)
  process.exitCode = 2
}
