import type { Address } from 'viem'

/** TIP-20 stablecoins on Tempo mainnet. All use 6 decimals. */
export const TEMPO_TOKENS = {
  PathUSD: '0x20C0000000000000000000000000000000000000',
  USDCe: '0x20C000000000000000000000b9537d11c60E8b50',
  USDT0: '0x20C00000000000000000000014f22CA97301EB73',
  USD1: '0x20C000000000000000000000111111111E910F0f',
} as const satisfies Record<string, Address>

export type TempoTokenSymbol = keyof typeof TEMPO_TOKENS

export const TIP20_DECIMALS = 6
