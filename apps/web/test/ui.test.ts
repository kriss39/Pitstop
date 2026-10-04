import { describe, expect, it } from 'vitest'
import { cleanDecimal, decimalValue, describeKey } from '../src/ui'

describe('amount inputs', () => {
  it.each([
    ['12abc', '12'],
    ['$10', '10'],
    ['5,25', '5.25'],
    ['1.2.3', '1.23'],
    ['1e3', '13'],
    ['-4', '4'],
  ])('cleans %j to %j', (input, out) => expect(cleanDecimal(input)).toBe(out))

  it('only reads plain decimals', () => {
    expect(decimalValue('0.5')).toBe(0.5)
    expect(decimalValue('.5')).toBe(0.5)
    expect(decimalValue('1e3')).toBeNaN()
    expect(decimalValue('')).toBeNaN()
  })
})

describe('describeKey', () => {
  const now = Math.floor(Date.now() / 1000)
  const key = { authorized: true, revoked: false, expiry: now + 86_400, spendPolicy: 'limited' as const, remaining: 3_000_000n, periodEnd: now + 3600 }

  it('reports an active key', () => expect(describeKey(key, [], 5_000_000n)).toMatchObject({ flag: 'green' }))
  it('reports an expired key as expired, not active', () => expect(describeKey({ ...key, expiry: now - 60 }, [])).toMatchObject({ label: 'Expired' }))
  it('reports a revoked key', () => expect(describeKey({ ...key, revoked: true }, [])).toMatchObject({ flag: 'black' }))
  it('reports a used-up limit as blocked', () => expect(describeKey({ ...key, remaining: 500n }, [], 5_000_000n)).toMatchObject({ flag: 'red' }))
  it('still allows a $0.001 call with half a cent left', () => expect(describeKey({ ...key, remaining: 5_000n }, [], 5_000_000n)).toMatchObject({ label: 'Almost used up' }))
  it('warns near the limit', () => expect(describeKey({ ...key, remaining: 500_000n }, [], 5_000_000n)).toMatchObject({ flag: 'yellow' }))
})
