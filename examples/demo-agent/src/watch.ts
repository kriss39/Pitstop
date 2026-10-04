import { startAutoRefill } from '@pitstop/sdk'
import { formatUnits } from 'viem'
import { refillConfig, store } from './agent-key.js'

// Keeps the agent fuelled: checks every REFILL_INTERVAL seconds (default 60). Ctrl+C to stop.
const config = refillConfig()
const intervalMs = Number(process.env.REFILL_INTERVAL ?? 60) * 1000
console.log(`Watching ${config.agentWallet}: refill ${formatUnits(config.amount, 6)} when below ${formatUnits(config.threshold, 6)} USDCe, max ${formatUnits(config.maxPerDay, 6)}/day.`)

const stop = startAutoRefill(config, {
  intervalMs,
  state: store.loadRefillState(),
  onProgress: (m) => console.log(m),
  onResult: (r, state) => {
    store.saveRefillState(state)
    const t = new Date().toISOString().slice(11, 19)
    console.log(r.action === 'skipped' ? `${t} ok (${r.reason}), USDCe ${formatUnits(r.balance, 6)}` : `${t} refilled, tx ${r.txHash}`)
  },
  onError: (e) => console.error(`refill error: ${e instanceof Error ? e.message.split('\n')[0] : e}`),
})
process.on('SIGINT', () => {
  stop()
  process.exit(0)
})
