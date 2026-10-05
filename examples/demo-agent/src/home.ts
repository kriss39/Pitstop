import { getHomeBalances } from '@getpitstop/sdk'
import { formatEther, formatUnits } from 'viem'
import { store } from './agent-key.js'

// The agent's home wallet on Base: a small hot wallet that tops up its Tempo wallet.
const existing = store.loadHomeWallet()
const home = existing ?? store.createHomeWallet()
const { usdc, eth } = await getHomeBalances(home.address)

console.log(existing ? 'Home wallet already exists.' : 'Created a new home wallet.')
console.log(`Stored in   ${store.homeWalletFile} (never commit or share this file)`)
console.log(`Address     ${home.address} (Base)`)
console.log(`Balance     ${formatUnits(usdc, 6)} USDC, ${formatEther(eth)} ETH`)
if (usdc === 0n || eth === 0n)
  console.log('\nFund it on Base with a few USDC (e.g. 5) and a little ETH for gas (~$0.10). Keep only small amounts here.')
