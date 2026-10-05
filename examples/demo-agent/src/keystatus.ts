import { getAgentKeyStatus, TIP20_DECIMALS } from '@getpitstop/sdk'
import { formatUnits } from 'viem'
import { AGENT_TOKEN, AGENT_TOKEN_ADDRESS, loadKey, requireWallet } from './agent-key.js'

const key = loadKey()
if (!key) {
  console.error('No access key yet. Run: pnpm key')
  process.exit(1)
}
const wallet = requireWallet()
const s = await getAgentKeyStatus({ wallet, key: key.address, token: AGENT_TOKEN_ADDRESS })

const fmt = (t?: number) => (t ? new Date(t * 1000).toISOString().replace('.000Z', 'Z') : '-')
console.log(`Wallet        ${wallet}`)
console.log(`Key           ${key.address}`)
console.log(`Authorized    ${s.authorized ? 'yes' : 'no'}${s.revoked ? ' (REVOKED)' : ''}`)
console.log(`Expires       ${fmt(s.expiry)}`)
console.log(`Policy        ${s.spendPolicy}`)
console.log(`Remaining     ${formatUnits(s.remaining, TIP20_DECIMALS)} ${AGENT_TOKEN} this period`)
console.log(`Period ends   ${fmt(s.periodEnd)}`)
