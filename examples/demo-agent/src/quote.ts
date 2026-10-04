import { fuelQuote, SOURCE_TOKENS, TIP20_DECIMALS } from '@pitstop/sdk'
import { formatUnits, isAddress, parseUnits } from 'viem'

// Read-only: asks LI.FI how much USDCe the agent would receive for N USDC from Base.
const to = process.env.AGENT_ADDRESS
const from = process.env.OWNER_ADDRESS
const amount = process.argv[2] ?? '2'
if (!to || !isAddress(to) || !from || !isAddress(from)) {
  console.error('Set AGENT_ADDRESS and OWNER_ADDRESS in .env')
  process.exit(1)
}

const quote = await fuelQuote({
  fromChain: SOURCE_TOKENS.base.chainId,
  fromToken: SOURCE_TOKENS.base.USDC,
  fromAmount: parseUnits(amount, 6),
  fromAddress: from,
  toAddress: to,
  apiKey: process.env.LIFI_API_KEY,
  integrator: process.env.LIFI_INTEGRATOR,
})

console.log(`Route     ${quote.tool}, ~${quote.durationSeconds}s`)
console.log(`Send      ${amount} ${quote.fromToken.symbol} on Base from ${from}`)
console.log(`Receive   ${formatUnits(quote.toAmount, TIP20_DECIMALS)} ${quote.toToken.symbol} on Tempo at ${quote.toAddress}`)
console.log(`Minimum   ${formatUnits(quote.toAmountMin, TIP20_DECIMALS)}`)
console.log(`Costs     fees $${quote.feesUsd.toFixed(4)} + gas $${quote.gasUsd.toFixed(4)}`)
console.log(`Approve   ${quote.approvalAddress}  Tx to ${quote.transactionRequest.to}`)
