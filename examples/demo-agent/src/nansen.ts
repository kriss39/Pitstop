import { agentAccount, getAgentKeyStatus, TIP20_DECIMALS } from '@getpitstop/sdk'
import { Mppx, tempo } from 'mppx/client'
import { formatUnits } from 'viem'
import { loadKey, requireWallet } from './agent-key.js'

// One paid Nansen call over MPP, signed by the agent's access key (counts against its daily limit).
//   pnpm nansen [chain=ethereum] [token=USDC]
const [chain = 'ethereum', token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'] = process.argv.slice(2)
const key = loadKey()
if (!key) throw new Error('No access key. Run: pnpm key')
const wallet = requireWallet()
const usd = (v: bigint) => formatUnits(v, TIP20_DECIMALS)

const mppx = Mppx.create({ methods: [tempo({ account: agentAccount(key.privateKey, wallet) })], polyfill: false })

const before = await getAgentKeyStatus({ wallet, key: key.address })
const res = await mppx.fetch('https://api.nansen.ai/api/v1/tgm/token-information', {
  method: 'POST',
  // Ask for an MPP (Tempo) challenge; without it Nansen offers only x402 on Base.
  headers: { 'content-type': 'application/json', authorization: 'Payment' },
  body: JSON.stringify({ chain, token_address: token, timeframe: '1d' }),
})
const after = await getAgentKeyStatus({ wallet, key: key.address })

console.log(`HTTP ${res.status}  receipt: ${res.headers.get('payment-receipt') ? 'yes' : 'no'}`)
console.log(`Limit left: ${usd(before.remaining)} → ${usd(after.remaining)} USDCe`)
console.log((await res.text()).slice(0, 600))
