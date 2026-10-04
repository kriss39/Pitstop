import { getBalance, totalUsd, TIP20_DECIMALS } from '@pitstop/sdk'
import { formatUnits, isAddress } from 'viem'

// Day 0: read the agent's balance. Refuel, MPP payments and the spending cap come later.
const address = process.argv[2] ?? process.env.AGENT_ADDRESS
if (!address || !isAddress(address)) {
  console.error('Usage: AGENT_ADDRESS=0x... pnpm start  (or pass the address as an argument)')
  process.exit(1)
}

const balances = await getBalance({ address })
for (const b of balances) console.log(`${b.symbol.padEnd(8)} ${b.formatted}`)
console.log(`Total    $${formatUnits(totalUsd(balances), TIP20_DECIMALS)}`)
