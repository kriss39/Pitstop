import { erc20Abi, formatUnits, type Address, type PublicClient } from 'viem'
import { createTempoClient } from './client.js'
import { TEMPO_TOKENS, TIP20_DECIMALS, type TempoTokenSymbol } from './tokens.js'

export type TokenBalance = {
  symbol: TempoTokenSymbol
  token: Address
  /** Raw amount in base units (6 decimals). */
  raw: bigint
  /** Human-readable amount, e.g. "4.987". */
  formatted: string
}

export type GetBalanceParameters = {
  address: Address
  /** Tokens to read. Defaults to every known Tempo stablecoin. */
  tokens?: readonly TempoTokenSymbol[]
  client?: PublicClient
}

/** Reads the agent's TIP-20 stablecoin balances on Tempo. */
export async function getBalance({
  address,
  tokens = Object.keys(TEMPO_TOKENS) as TempoTokenSymbol[],
  client = createTempoClient(),
}: GetBalanceParameters): Promise<TokenBalance[]> {
  return Promise.all(
    tokens.map(async (symbol) => {
      const token = TEMPO_TOKENS[symbol]
      const raw = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      })
      return { symbol, token, raw, formatted: formatUnits(raw, TIP20_DECIMALS) }
    }),
  )
}

/** Sum of all stablecoin balances in base units. Treats every token as $1. */
export function totalUsd(balances: readonly TokenBalance[]): bigint {
  return balances.reduce((sum, b) => sum + b.raw, 0n)
}
