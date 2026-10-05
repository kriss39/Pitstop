import { agentAccount, agentTransfer, getAgentKeyStatus, TIP20_DECIMALS } from '@getpitstop/sdk'
import { formatUnits, isAddress, parseUnits } from 'viem'
import { AGENT_TOKEN, AGENT_TOKEN_ADDRESS, loadKey, requireWallet } from './agent-key.js'

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

const before = await getAgentKeyStatus({ wallet, key: key.address, token: AGENT_TOKEN_ADDRESS })
console.log(`Remaining before: ${usd(before.remaining)} ${AGENT_TOKEN}. Sending ${amount} ${AGENT_TOKEN} to ${to}…`)

try {
  const hash = await agentTransfer({ account: agentAccount(key.privateKey, wallet), to, amount: parseUnits(amount, 6), token: AGENT_TOKEN_ADDRESS })
  const after = await getAgentKeyStatus({ wallet, key: key.address, token: AGENT_TOKEN_ADDRESS })
  console.log(`Sent. https://explore.tempo.xyz/tx/${hash}`)
  console.log(`Remaining after:  ${usd(after.remaining)} ${AGENT_TOKEN}`)
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  // The node explains keychain rejections in the "Details:" line, either at execution
  // ("Account keychain error: SpendingLimitExceeded") or at submission
  // ("AccountKeychainError(KeyAlreadyRevoked(...))").
  const keychain = /Account keychain error: (\w+)|AccountKeychainError\((\w+)/.exec(msg)?.slice(1).find(Boolean)
  console.log(keychain ? `BLOCKED by the guard: ${keychain}` : `FAILED: ${msg.split('\n')[0]}`)
  process.exitCode = 2
}
