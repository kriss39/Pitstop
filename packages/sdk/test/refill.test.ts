import { beforeEach, describe, expect, it, vi } from 'vitest'

// No network: balances, LI.FI and the Base client are all stand-ins.
const agentBalance = vi.fn(async () => 0n)
vi.mock('../src/balance.js', () => ({
  getBalance: async () => [{ symbol: 'USDCe', token: '0x', raw: await agentBalance(), formatted: '' }],
}))
const executeFuel = vi.fn()
const waitForFuel = vi.fn()
vi.mock('../src/fuel.js', async (orig) => ({
  ...(await orig<typeof import('../src/fuel.js')>()),
  fuelQuote: vi.fn(async () => ({ transactionRequest: { kind: 'evm' } })),
  executeFuel: (...a: unknown[]) => executeFuel(...a),
  waitForFuel: (...a: unknown[]) => waitForFuel(...a),
}))
vi.mock('viem', async (orig) => ({
  ...(await orig<typeof import('viem')>()),
  createPublicClient: () => ({ readContract: async () => 10_000_000n, getBalance: async () => 10n ** 18n }),
}))

const { refillIfLow, generateHomeWallet, initialRefillState } = await import('../src/refill.js')

const config = {
  agentWallet: '0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0' as const,
  home: generateHomeWallet(),
  threshold: 1_000_000n,
  amount: 2_000_000n,
  maxPerDay: 4_000_000n,
}
const HASH = `0x${'ab'.repeat(32)}` as const

beforeEach(() => {
  agentBalance.mockResolvedValue(0n)
  executeFuel.mockReset().mockImplementation(async ({ onStep }) => {
    onStep({ step: 'send', hash: HASH })
    return HASH
  })
  waitForFuel.mockReset().mockResolvedValue({ status: 'DONE', receivedAmount: 1_990_000n })
})

describe('refillIfLow', () => {
  it('skips while the agent is above its threshold', async () => {
    agentBalance.mockResolvedValue(5_000_000n)
    const { result } = await refillIfLow(config)
    expect(result).toMatchObject({ action: 'skipped', reason: 'above-threshold' })
  })

  it('counts a refill against the daily cap and then stops', async () => {
    let { state } = await refillIfLow(config, initialRefillState())
    expect(state.sentToday).toBe('2000000')
    ;({ state } = await refillIfLow({ ...config, force: true }, state))
    const third = await refillIfLow({ ...config, force: true }, state)
    expect(third.result).toMatchObject({ action: 'skipped', reason: 'daily-cap' })
  })

  it('still counts the send when the bridge check fails', async () => {
    waitForFuel.mockRejectedValue(new Error('LI.FI 429'))
    const { result, state } = await refillIfLow(config)
    expect(result).toMatchObject({ action: 'refilled', status: { status: 'PENDING' } })
    expect(state.sentToday).toBe('2000000')
  })

  it('still counts the send when the receipt check fails after broadcast', async () => {
    executeFuel.mockImplementation(async ({ onStep }) => {
      onStep({ step: 'send', hash: HASH })
      throw new Error('RPC timeout')
    })
    const { result, state } = await refillIfLow(config)
    expect(result).toMatchObject({ action: 'refilled', txHash: HASH })
    expect(state.sentToday).toBe('2000000')
  })

  it('does not count a send that reverted on the source chain', async () => {
    const { FuelRevertedError } = await import('../src/fuel.js')
    executeFuel.mockImplementation(async ({ onStep }) => {
      onStep({ step: 'send', hash: HASH })
      throw new FuelRevertedError(HASH)
    })
    await expect(refillIfLow(config)).rejects.toThrow('reverted')
  })

  it('does not count anything when nothing was sent', async () => {
    executeFuel.mockRejectedValue(new Error('user rejected'))
    await expect(refillIfLow(config)).rejects.toThrow('user rejected')
  })
})
