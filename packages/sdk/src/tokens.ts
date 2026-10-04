import type { Address } from 'viem'

/** TIP-20 stablecoins on Tempo mainnet. All use 6 decimals. */
export const TEMPO_TOKENS = {
  USDCe: '0x20C000000000000000000000b9537d11c60E8b50',
  PathUSD: '0x20C0000000000000000000000000000000000000',
  USDT0: '0x20C00000000000000000000014f22CA97301EB73',
  /** OpenUSD, which the MPP docs recommend since 2026-09-29. */
  OUSD: '0x20c0000000000000000000006a37DA5C996874BE',
  USD1: '0x20C000000000000000000000111111111E910F0f',
} as const satisfies Record<string, Address>

export type TempoTokenSymbol = keyof typeof TEMPO_TOKENS

/** Tokens LI.FI can deliver to Tempo from Base and Solana (checked 2026-10-04). USD1 has no route. */
export const FUEL_TOKENS = ['USDCe', 'PathUSD', 'USDT0', 'OUSD'] as const satisfies readonly TempoTokenSymbol[]
export type FuelTokenSymbol = (typeof FUEL_TOKENS)[number]

/** Finds a token's symbol by address (case-insensitive). */
export function tokenSymbol(address: string): TempoTokenSymbol | undefined {
  return (Object.keys(TEMPO_TOKENS) as TempoTokenSymbol[]).find((s) => TEMPO_TOKENS[s].toLowerCase() === address.toLowerCase())
}

export const TIP20_DECIMALS = 6
