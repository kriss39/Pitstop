import { describe, expect, it } from 'vitest'
import { pickFeeToken, TEMPO_TOKENS, type TokenBalance } from '../src/index.js'

const bal = (symbol: keyof typeof TEMPO_TOKENS, raw: bigint): TokenBalance => ({ symbol, token: TEMPO_TOKENS[symbol], raw, formatted: '' })

describe('pickFeeToken', () => {
  it('prefers USDCe when the wallet can cover a fee with it', () => {
    expect(pickFeeToken([bal('USDCe', 50_000n), bal('PathUSD', 9_000_000n)])).toBe(TEMPO_TOKENS.USDCe)
  })
  it('falls back to the largest other stablecoin', () => {
    expect(pickFeeToken([bal('USDCe', 0n), bal('USDT0', 3_000_000n), bal('OUSD', 1_000_000n)])).toBe(TEMPO_TOKENS.USDT0)
  })
  it('returns nothing when no supported token covers a fee', () => {
    expect(pickFeeToken([bal('USDCe', 5_000n), bal('USD1', 9_000_000n)])).toBeUndefined()
  })
})
