import { refillIfLow } from '@pitstop/sdk'
import { formatUnits } from 'viem'
import { refillConfig, store } from './agent-key.js'

// One check: if the agent's Tempo USDCe is below REFILL_THRESHOLD, fuel REFILL_AMOUNT from the home wallet.
const config = refillConfig()
const { result, state } = await refillIfLow(config, store.loadRefillState(), (m) => console.log(m))
store.saveRefillState(state)

if (result.action === 'skipped') {
  console.log(`No refill (${result.reason}). Agent USDCe: ${formatUnits(result.balance, 6)}; threshold ${formatUnits(config.threshold, 6)}.`)
} else {
  console.log(`Refilled. Source tx https://basescan.org/tx/${result.txHash}`)
  console.log(`Sent today: ${formatUnits(BigInt(state.sentToday), 6)} of ${formatUnits(config.maxPerDay, 6)} USDC`)
}
