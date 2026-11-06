import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fuelQuote, LIFI_DIAMOND, NATIVE_TOKEN, SOURCE_TOKENS, TEMPO_TOKENS } from '../src/index.js'
import { bridgeCalldata } from './lifi-calldata.js'

const AGENT = '0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0'
const SENDER = '0xFE99072AB3823d1873BB2caC339Ed326140fd169'
const USDC = SOURCE_TOKENS.base.USDC

/** A LI.FI quote for 5 USDC from Base to the agent's USDCe, with Pitstop's fee folded into "LIFI Fixed Fee". */
function lifiQuote(over: { action?: object; estimate?: object; tx?: object } = {}) {
  return {
    id: 'q1',
    tool: 'across',
    action: {
      fromChainId: 8453,
      toChainId: 4217,
      fromAmount: '5000000',
      toAddress: AGENT,
      fromToken: { address: USDC, symbol: 'USDC', decimals: 6 },
      toToken: { address: TEMPO_TOKENS.USDCe, symbol: 'USDC.e', decimals: 6 },
      ...over.action,
    },
    estimate: {
      approvalAddress: LIFI_DIAMOND,
      toAmount: '4981700',
      toAmountMin: '4981700',
      executionDuration: 2,
      fromAmountUSD: '5.01',
      toAmountUSD: '4.99',
      feeCosts: [
        { name: 'LIFI Fixed Fee', percentage: '0.0035', amount: '17500', amountUSD: '0.0175', included: true, token: { symbol: 'USDC', decimals: 6 } },
        { name: 'Relayer fee', percentage: '0.0001', amount: '500', amountUSD: '0.0005', included: true, token: { symbol: 'USDC', decimals: 6 } },
      ],
      gasCosts: [{ amount: '1400000000000', amountUSD: '0.0038', token: { symbol: 'ETH', decimals: 18 } }],
      ...over.estimate,
    },
    transactionRequest: { to: LIFI_DIAMOND, data: bridgeCalldata(AGENT), value: '0', chainId: 8453, gasLimit: '300000', ...over.tx },
  }
}

function mockLifi(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
}

const params = { fromChain: 8453, fromToken: USDC, fromAmount: 5_000_000n, fromAddress: SENDER, toAddress: AGENT, fee: 0.001 } as const

afterEach(() => vi.unstubAllGlobals())

describe('fuelQuote checks the route before anyone signs', () => {
  it('accepts a route that matches the request', async () => {
    mockLifi(lifiQuote())
    const q = await fuelQuote(params)
    expect(q.toAmount).toBe(4_981_700n)
    expect(q.transactionRequest).toMatchObject({ kind: 'evm', to: LIFI_DIAMOND })
  })

  it.each([
    ['sends to another address', { action: { toAddress: SENDER } }, /not 0x9Bd4/],
    ['ends on another chain', { action: { toChainId: 8453 } }, /not Tempo/],
    ['delivers another token', { action: { toToken: { address: TEMPO_TOKENS.PathUSD, symbol: 'pathUSD', decimals: 6 } } }, /requested token/],
    ['sends a different amount', { action: { fromAmount: '50000000' } }, /expected 5000000/],
    ['spends a different token', { action: { fromToken: { address: SOURCE_TOKENS.base.USDC.replace(/.$/, '0'), symbol: 'X', decimals: 6 } } }, /requested token/],
    ['calls another contract', { tx: { to: SENDER } }, /not the LI.FI Diamond/],
    ['asks for an approval elsewhere', { estimate: { approvalAddress: SENDER } }, /Approval goes to/],
    ['attaches native coin to a token route', { tx: { value: '1000000000000000000' } }, /native coin/],
  ])('rejects a route that %s', async (_name, over, message) => {
    mockLifi(lifiQuote(over))
    await expect(fuelQuote(params)).rejects.toThrow(message)
  })

  it('lets a gas-token route carry its own amount, but not more', async () => {
    const native = { fromToken: NATIVE_TOKEN, fromAmount: 2_000_000_000_000_000n }
    const action = { fromAmount: '2000000000000000', fromToken: { address: NATIVE_TOKEN, symbol: 'ETH', decimals: 18 } }
    mockLifi(lifiQuote({ action, estimate: { approvalAddress: undefined }, tx: { value: '2000000000000000' } }))
    await expect(fuelQuote({ ...params, ...native })).resolves.toBeDefined()
    mockLifi(lifiQuote({ action, estimate: { approvalAddress: undefined }, tx: { value: '3000000000000000' } }))
    await expect(fuelQuote({ ...params, ...native })).rejects.toThrow(/more than the amount/)
  })
})

describe('fuelQuote reads the Diamond calldata', () => {
  it.each(['base-usdc', 'arb-usdc', 'base-eth', 'eth-usdt'])('accepts the real LI.FI route %s', async (name) => {
    const q = JSON.parse(readFileSync(new URL(`./fixtures/lifi-${name}.json`, import.meta.url), 'utf8'))
    mockLifi(q)
    await expect(
      fuelQuote({
        fromChain: q.action.fromChainId,
        fromToken: q.action.fromToken.address,
        fromAmount: BigInt(q.action.fromAmount),
        fromAddress: SENDER,
        toAddress: AGENT,
        fee: 0.001,
      }),
    ).resolves.toMatchObject({ toAddress: AGENT })
  })

  it.each([
    ['pays someone else', { data: bridgeCalldata(SENDER) }, /pays 0xFE99/],
    ['bridges to another chain', { data: bridgeCalldata(AGENT, { destinationChainId: 8453n }) }, /not Tempo/],
    ['makes a destination call that never names the agent', { data: bridgeCalldata(SENDER, { hasDestinationCall: true }) }, /destination call/],
    ['carries unreadable calldata', { data: '0xdeadbeef' }, /Could not read/],
    ['carries non-hex calldata', { data: 'hello' }, /not hex/],
    ['asks for an absurd gas limit', { gasLimit: '999999999999' }, /Gas limit/],
  ])('rejects a Diamond call that %s', async (_name, tx, message) => {
    mockLifi(lifiQuote({ tx }))
    await expect(fuelQuote(params)).rejects.toThrow(message)
  })
})

describe('fuelQuote refuses lossy routes and bad inputs', () => {
  it('rejects a route whose guaranteed minimum loses more than 5%', async () => {
    mockLifi(lifiQuote({ estimate: { toAmount: '4900000', toAmountMin: '4700000' } }))
    await expect(fuelQuote(params)).rejects.toThrow(/loses too much/)
  })

  it('lets the caller widen the loss limit', async () => {
    mockLifi(lifiQuote({ estimate: { toAmount: '4900000', toAmountMin: '4700000' } }))
    await expect(fuelQuote({ ...params, maxLoss: 0.1 })).resolves.toBeDefined()
  })

  it.each([
    ['a zero amount', { fromAmount: 0n }],
    ['the zero address', { toAddress: '0x0000000000000000000000000000000000000000' }],
    ['a 50% fee', { fee: 0.5 }],
    ['NaN slippage', { slippage: NaN }],
    ['an http LI.FI URL', { baseUrl: 'http://evil.example' }],
  ])('rejects %s before calling LI.FI', async (_name, over) => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await expect(fuelQuote({ ...params, ...over } as typeof params)).rejects.toThrow()
    expect(f).not.toHaveBeenCalled()
  })
})

describe('fee breakdown', () => {
  it("splits LI.FI's combined fee into Pitstop's share and LI.FI's own", async () => {
    mockLifi(lifiQuote())
    const { costs } = await fuelQuote(params)
    const pitstop = costs.find((c) => c.kind === 'integrator')!
    const lifi = costs.find((c) => c.kind === 'lifi')!
    expect(pitstop.amount).toBe(5_000n) // 0.1% of 5 USDC
    expect(lifi.amount).toBe(12_500n) // 0.25%
    expect(pitstop.percentage).toBeCloseTo(0.001)
    expect(lifi.percentage).toBeCloseTo(0.0025)
    expect(costs.find((c) => c.kind === 'gas')?.included).toBe(false)
  })

  it('treats a refundable Solana rent deposit as a deposit, not a fee', async () => {
    const feeCosts = [{ name: 'Rent Exemption Deposit', amount: '2039280', amountUSD: '0.18', included: false, token: { symbol: 'SOL', decimals: 9 } }]
    mockLifi(lifiQuote({ estimate: { feeCosts } }))
    const { costs } = await fuelQuote(params)
    expect(costs[0]!.kind).toBe('deposit')
  })
})
