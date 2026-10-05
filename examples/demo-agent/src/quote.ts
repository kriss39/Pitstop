import { fuelQuote, SOURCE_TOKENS, TIP20_DECIMALS } from '@getpitstop/sdk'
import { formatUnits, isAddress, parseUnits } from 'viem'

// Read-only: asks LI.FI how much USDCe the agent would receive.
//   pnpm quote [amount]                     from Base (OWNER_ADDRESS)
//   pnpm quote [amount] solana <base58>     from Solana
const [amount = '2', source = 'base', solanaFrom] = process.argv.slice(2)
const to = process.env.AGENT_ADDRESS
const from = source === 'solana' ? solanaFrom : process.env.OWNER_ADDRESS
if (!to || !isAddress(to) || !from) {
  console.error('Set AGENT_ADDRESS and OWNER_ADDRESS in .env (and pass a Solana address for solana)')
  process.exit(1)
}
const src = source === 'solana' ? SOURCE_TOKENS.solana : SOURCE_TOKENS.base

const quote = await fuelQuote({
  fromChain: src.chainId,
  fromToken: src.USDC,
  fromAmount: parseUnits(amount, 6),
  fromAddress: from,
  toAddress: to,
  apiKey: process.env.LIFI_API_KEY,
  integrator: process.env.LIFI_INTEGRATOR,
})

console.log(`Route     ${quote.tool}, ~${quote.durationSeconds}s`)
console.log(`Send      ${amount} ${quote.fromToken.symbol} on ${source} from ${from}`)
console.log(`Receive   ${formatUnits(quote.toAmount, TIP20_DECIMALS)} ${quote.toToken.symbol} on Tempo at ${quote.toAddress}`)
console.log(`Minimum   ${formatUnits(quote.toAmountMin, TIP20_DECIMALS)}`)
console.log(`Costs     fees $${quote.feesUsd.toFixed(4)} + gas $${quote.gasUsd.toFixed(4)}`)
console.log(`Tx        ${quote.transactionRequest.kind === 'evm' ? `EVM call to ${quote.transactionRequest.to}` : `Solana tx, ${quote.transactionRequest.data.length} base64 chars`}`)
