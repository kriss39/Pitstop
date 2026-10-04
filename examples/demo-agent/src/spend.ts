import { agentAccount, agentTransfer, getAgentKeyStatus, TIP20_DECIMALS } from '@pitstop/sdk'
import { formatUnits, isAddress, parseUnits } from 'viem'
import { loadKey, requireWallet } from './agent-key.js'

// Spends USDCe from the guarded wallet through the agent's access key.
//   pnpm spend [amount=1] [to=OWNER_ADDRESS]
const [amount = '1', toArg] = process.argv.slice(2)
const to = toArg ?? process.env.OWNER_ADDRESS
const key = loadKey()
if (!key) {
  console.error('No access key yet. Run: pnpm key')
  process.exit(1)
}
if (!to || !isAddress(to)) {
  console.error('Pass a recipient 0x address or set OWNER_ADDRESS in .env')
  process.exit(1)
}
const wallet = requireWallet()
const usd = (v: bigint) => formatUnits(v, TIP20_DECIMALS)

const before = await getAgentKeyStatus({ wallet, key: key.address })
console.log(`Remaining before: ${usd(before.remaining)} USDCe. Sending ${amount} USDCe to ${to}…`)

try {
  const hash = await agentTransfer({ account: agentAccount(key.privateKey, wallet), to, amount: parseUnits(amount, 6) })
  const after = await getAgentKeyStatus({ wallet, key: key.address })
  console.log(`Sent. https://explore.tempo.xyz/tx/${hash}`)
  console.log(`Remaining after:  ${usd(after.remaining)} USDCe`)
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  // The node explains keychain rejections in the "Details:" line, e.g. SpendingLimitExceeded.
  const keychain = /Account keychain error: (\w+)/.exec(msg)?.[1]
  console.log(keychain ? `BLOCKED by the guard: ${keychain}` : `FAILED: ${msg.split('\n')[0]}`)
  process.exitCode = 2
}
