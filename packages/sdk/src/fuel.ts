import {
  decodeAbiParameters,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  isHex,
  slice,
  zeroAddress,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { TEMPO_CHAIN_ID } from './client.js'
import { TEMPO_TOKENS, type TempoTokenSymbol } from './tokens.js'

export const LIFI_API_URL = 'https://li.quest/v1'

/** Pitstop's integrator fee on fuel routes (0.1%), collected by LI.FI to the fee wallet set in the LI.FI portal. */
export const PITSTOP_FEE = 0.001

/** LI.FI Diamond contract. Same address on most EVM chains LI.FI supports. */
export const LIFI_DIAMOND: Address = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'

/** Chains where LI.FI deployed its Diamond elsewhere (lifinance/contracts deployments/*.json). */
const LIFI_DIAMOND_BY_CHAIN: Record<number, Address> = {
  5042: '0xA4072583658Fae592A3506A42431cb6316a8d40b', // Arc
}

/** The LI.FI Diamond a fuel transaction on `chainId` must call. */
export function lifiDiamond(chainId: number): Address {
  return LIFI_DIAMOND_BY_CHAIN[chainId] ?? LIFI_DIAMOND
}

/** Native gas tokens as LI.FI addresses them. */
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'
export const SOLANA_NATIVE_TOKEN = '11111111111111111111111111111111'

/** LI.FI's numeric chain id for Solana. */
export const SOLANA_CHAIN_ID = 1151111081099710

/** Well-known source tokens. */
export const SOURCE_TOKENS = {
  base: { chainId: 8453, USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  arbitrum: { chainId: 42161, USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  optimism: { chainId: 10, USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
  ethereum: { chainId: 1, USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  polygon: { chainId: 137, USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  avalanche: { chainId: 43114, USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
  // On Arc, USDC is the gas token; LI.FI addresses it at its ERC-20 interface.
  arc: { chainId: 5042, USDC: '0x3600000000000000000000000000000000000000' },
  solana: { chainId: SOLANA_CHAIN_ID, USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
} as const

const NATIVE_TOKENS = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
])

export type LifiOptions = {
  /** LI.FI API key. Never ship it to a browser; use a proxy `baseUrl` there. */
  apiKey?: string
  /** Defaults to https://li.quest/v1. Must be https, a localhost URL, or a same-origin path like `/lifi/v1`. */
  baseUrl?: string
  integrator?: string
  /** Per-request timeout for LI.FI calls. Defaults to 20 s. */
  timeoutMs?: number
}

/** Upper bound for the integrator fee and the slippage a caller may ask for (5%). */
export const MAX_FEE = 0.05
export const MAX_SLIPPAGE = 0.05
/** Default cap on what a route may lose between the value sent and the guaranteed minimum received (5%). */
export const DEFAULT_MAX_LOSS = 0.05
/** No fuel route needs more gas than this. */
const MAX_GAS_LIMIT = 5_000_000n

/** Source tokens counted as $1 when judging route loss (USDC on the chains Pitstop lists). */
const DOLLAR_SOURCE_TOKENS = new Set(Object.values(SOURCE_TOKENS).map((t) => t.USDC.toLowerCase()))

function checkFraction(name: string, value: number | undefined, max: number) {
  if (value == null) return
  if (!Number.isFinite(value) || value < 0 || value > max) throw new LifiError(`${name} must be between 0 and ${max}, got ${value}`)
}

function checkBaseUrl(baseUrl: string) {
  if (baseUrl.startsWith('/') && !baseUrl.startsWith('//')) return
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new LifiError(`Invalid LI.FI baseUrl: ${baseUrl}`)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new LifiError('LI.FI baseUrl must use https (http is allowed only for localhost)')
}

/** The first argument of every LI.FI bridge facet call (ILiFi.BridgeData). */
const BRIDGE_DATA = [
  {
    type: 'tuple',
    components: [
      { name: 'transactionId', type: 'bytes32' },
      { name: 'bridge', type: 'string' },
      { name: 'integrator', type: 'string' },
      { name: 'referrer', type: 'address' },
      { name: 'sendingAssetId', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'hasSourceSwaps', type: 'bool' },
      { name: 'hasDestinationCall', type: 'bool' },
    ],
  },
] as const

/**
 * Reads the Diamond call itself, not only LI.FI's description of it: the bridge must deliver on
 * Tempo to `toAddress`. A route with a destination call must still name `toAddress` in its calldata.
 */
function checkBridgeCalldata(data: Hex, toAddress: Address) {
  let bridge
  try {
    ;[bridge] = decodeAbiParameters(BRIDGE_DATA, slice(data, 4))
  } catch {
    throw new LifiError('Could not read the bridge details in the LI.FI transaction')
  }
  if (bridge.destinationChainId !== BigInt(TEMPO_CHAIN_ID))
    throw new LifiError(`Transaction bridges to chain ${bridge.destinationChainId}, not Tempo`)
  if (bridge.hasDestinationCall) {
    if (!data.toLowerCase().includes(toAddress.slice(2).toLowerCase()))
      throw new LifiError('Transaction makes a destination call that does not pay the agent')
  } else if (!isAddressEqual(bridge.receiver, toAddress)) {
    throw new LifiError(`Transaction pays ${bridge.receiver}, not ${toAddress}`)
  }
}

/** Checks an EVM route when it is quoted and again right before it is signed. */
function checkEvmRoute(r: {
  fromChain: number
  fromToken: string
  fromAmount: bigint
  toAddress: Address
  to: string | undefined
  data: string
  value: bigint
  chainId: number | undefined
  gas?: bigint
  approvalAddress?: string
}) {
  if (r.chainId !== r.fromChain) throw new LifiError(`Transaction is for chain ${r.chainId}, expected ${r.fromChain}`)
  if (!r.to || !isAddress(r.to, { strict: false }) || !isAddressEqual(r.to, lifiDiamond(r.fromChain)))
    throw new LifiError(`Transaction targets ${r.to}, not the LI.FI Diamond`)
  if (!isHex(r.data) || r.data.length < 10) throw new LifiError('Transaction data is not hex calldata')
  // Native coin attached to the call: none for token routes, at most the amount (plus 1%) for gas-token routes.
  const native = NATIVE_TOKENS.has(r.fromToken.toLowerCase())
  if (r.value < 0n) throw new LifiError('Transaction value is negative')
  if (!native && r.value !== 0n) throw new LifiError(`Token route also asks for ${r.value} wei of the native coin`)
  if (native && r.value > (r.fromAmount * 101n) / 100n) throw new LifiError(`Route asks for ${r.value} wei, more than the amount`)
  if (r.gas != null && (r.gas <= 0n || r.gas > MAX_GAS_LIMIT)) throw new LifiError(`Gas limit ${r.gas} is out of range`)
  // The token approval (if any) may only go to the same Diamond.
  if (r.approvalAddress && (!isAddress(r.approvalAddress, { strict: false }) || !isAddressEqual(r.approvalAddress, lifiDiamond(r.fromChain))))
    throw new LifiError(`Approval goes to ${r.approvalAddress}, not the LI.FI Diamond`)
  checkBridgeCalldata(r.data, r.toAddress)
}

export type FuelQuoteParameters = LifiOptions & {
  fromChain: number
  /** Token address (EVM) or mint (Solana). */
  fromToken: string
  /** Amount in the source token's base units. */
  fromAmount: bigint
  /** Sender address: 0x… on EVM chains, base58 on Solana. */
  fromAddress: string
  /** The agent's Tempo address. */
  toAddress: Address
  /** Stablecoin the agent receives on Tempo. Defaults to USDCe. */
  toToken?: TempoTokenSymbol
  /** Max slippage as a decimal, e.g. 0.005 = 0.5%. */
  slippage?: number
  /** Integrator fee as a decimal, e.g. 0.003 = 0.3%. At most MAX_FEE. */
  fee?: number
  /**
   * Refuse routes whose guaranteed minimum is worth less than (1 - maxLoss) of what is sent,
   * in dollars. Defaults to DEFAULT_MAX_LOSS (5%). Pass 1 to turn the check off.
   */
  maxLoss?: number
}

export type EvmTransactionRequest = {
  kind: 'evm'
  to: Address
  data: Hex
  value: bigint
  chainId: number
  gas?: bigint
}

/** A serialized Solana versioned transaction for the sender's wallet to sign and send. */
export type SolanaTransactionRequest = {
  kind: 'solana'
  /** Base64-encoded transaction. */
  data: string
}

export type FuelQuote = {
  id: string
  tool: string
  fromChain: number
  fromToken: { address: string; symbol: string; decimals: number }
  fromAmount: bigint
  toToken: { address: Address; symbol: string; decimals: number }
  toAddress: Address
  toAmount: bigint
  toAmountMin: bigint
  /** Dollar values LI.FI estimates for what is sent and what arrives (route quality = to / from). */
  fromAmountUSD?: number
  toAmountUSD?: number
  durationSeconds: number
  feesUsd: number
  gasUsd: number
  /** Every cost on the route, in the order money leaves: integrator, LI.FI, bridge, then source-chain gas. */
  costs: FuelCost[]
  /** Spender to approve on EVM chains. Ignored for Solana. */
  approvalAddress?: Address
  transactionRequest: EvmTransactionRequest | SolanaTransactionRequest
}

export type FuelCost = {
  /** `deposit` is refundable (e.g. Solana rent for a new token account), so it isn't a cost. */
  kind: 'integrator' | 'lifi' | 'bridge' | 'deposit' | 'gas'
  name: string
  amount: bigint
  token: { symbol: string; decimals: number }
  usd: number
  /** Share of the amount sent, when LI.FI reports one (e.g. 0.0025 = 0.25%). */
  percentage?: number
  /** True if it is taken out of the amount sent; false if paid on top (gas). */
  included: boolean
}

/** The source-chain transaction was mined but reverted: nothing left the wallet except gas. */
export class FuelRevertedError extends Error {
  constructor(readonly hash: Hex) {
    super(`Transfer transaction ${hash} reverted on the source chain`)
    this.name = 'FuelRevertedError'
  }
}

export class LifiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'LifiError'
  }
}

async function lifiGet<T>(path: string, query: Record<string, string>, opts: LifiOptions): Promise<T> {
  const base = opts.baseUrl ?? LIFI_API_URL
  checkBaseUrl(base)
  const url = `${base}${path}?${new URLSearchParams(query)}`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (opts.apiKey) headers['x-lifi-api-key'] = opts.apiKey
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) })
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: number }
  if (!res.ok) throw new LifiError(body.message ?? `LI.FI request failed (${res.status})`, res.status, body.code)
  return body as T
}

type RawQuote = {
  id: string
  tool: string
  action: {
    fromChainId: number
    toChainId: number
    fromAmount: string
    toAddress: string
    fromToken: { address: string; symbol: string; decimals: number }
    toToken: { address: string; symbol: string; decimals: number }
  }
  estimate: {
    approvalAddress?: string
    toAmount: string
    toAmountMin: string
    executionDuration: number
    fromAmountUSD?: string
    toAmountUSD?: string
    feeCosts?: RawCost[]
    gasCosts?: RawCost[]
  }
  transactionRequest?: { to?: string; data: string; value?: string; chainId?: number; gasLimit?: string }
}

type RawCost = {
  name?: string
  amount?: string
  amountUSD?: string
  percentage?: string
  included?: boolean
  token?: { symbol: string; decimals: number }
}

/**
 * Turns LI.FI's fee and gas lists into FuelCosts. LI.FI reports its own fee and the
 * integrator fee as one "LIFI Fixed Fee" item, so that item is split by the fee we asked for.
 */
function toCosts(q: RawQuote, integratorFee?: number): FuelCost[] {
  const costs: FuelCost[] = []
  for (const f of q.estimate.feeCosts ?? []) {
    const base = {
      amount: BigInt(f.amount ?? 0),
      token: f.token ?? q.action.fromToken,
      usd: Number(f.amountUSD ?? 0),
      percentage: f.percentage != null ? Number(f.percentage) : undefined,
      included: f.included ?? true,
    }
    const name = f.name ?? 'Fee'
    if (/lifi/i.test(name) && integratorFee && base.percentage && base.percentage >= integratorFee) {
      const share = integratorFee / base.percentage
      // Integer math in parts per million, so 0.1% of 5 USDC is exactly 5000 base units.
      const amount = (base.amount * BigInt(Math.round(integratorFee * 1e6))) / BigInt(Math.round(base.percentage * 1e6))
      costs.push({ ...base, kind: 'integrator', name: 'Integrator fee', amount, usd: base.usd * share, percentage: integratorFee })
      costs.push({
        ...base,
        kind: 'lifi',
        name: 'LI.FI fee',
        amount: base.amount - amount,
        usd: base.usd * (1 - share),
        percentage: base.percentage - integratorFee,
      })
    } else costs.push({ ...base, kind: /lifi/i.test(name) ? 'lifi' : /deposit/i.test(name) ? 'deposit' : 'bridge', name })
  }
  for (const g of q.estimate.gasCosts ?? [])
    costs.push({
      kind: 'gas',
      name: 'Network gas',
      amount: BigInt(g.amount ?? 0),
      token: g.token ?? q.action.fromToken,
      usd: Number(g.amountUSD ?? 0),
      included: false,
    })
  return costs
}

const sumUsd = (items?: { amountUSD?: string }[]) =>
  (items ?? []).reduce((sum, item) => {
    const usd = Number(item.amountUSD ?? 0)
    return Number.isFinite(usd) ? sum + usd : sum
  }, 0)

/**
 * Asks LI.FI for a one-step route that delivers a Tempo stablecoin to the agent.
 * Throws if the returned route does not send to `toAddress` on Tempo, or does not
 * call the LI.FI Diamond on the source chain.
 */
export async function fuelQuote(params: FuelQuoteParameters): Promise<FuelQuote> {
  if (typeof params.fromAmount !== 'bigint' || params.fromAmount <= 0n) throw new LifiError('fromAmount must be a positive bigint')
  if (!isAddress(params.toAddress, { strict: false }) || isAddressEqual(params.toAddress, zeroAddress))
    throw new LifiError(`Invalid agent address ${params.toAddress}`)
  checkFraction('fee', params.fee, MAX_FEE)
  checkFraction('slippage', params.slippage, MAX_SLIPPAGE)
  checkFraction('maxLoss', params.maxLoss, 1)
  const toToken = TEMPO_TOKENS[params.toToken ?? 'USDCe']
  if (!toToken) throw new LifiError(`Unknown Tempo token ${params.toToken}`)
  const query: Record<string, string> = {
    fromChain: String(params.fromChain),
    toChain: String(TEMPO_CHAIN_ID),
    fromToken: params.fromToken,
    toToken,
    fromAmount: params.fromAmount.toString(),
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
  }
  if (params.integrator) query.integrator = params.integrator
  if (params.slippage != null) query.slippage = String(params.slippage)
  if (params.fee != null) query.fee = String(params.fee)

  const q = await lifiGet<RawQuote>('/quote', query, params)
  const tx = q.transactionRequest
  if (!tx) throw new LifiError('LI.FI returned no transaction for this route')
  if (q.action.toChainId !== TEMPO_CHAIN_ID) throw new LifiError(`Route ends on chain ${q.action.toChainId}, not Tempo`)
  if (!isAddressEqual(q.action.toAddress as Address, params.toAddress))
    throw new LifiError(`Route sends to ${q.action.toAddress}, not ${params.toAddress}`)
  if (!isAddressEqual(q.action.toToken.address as Address, toToken))
    throw new LifiError(`Route delivers ${q.action.toToken.symbol}, not the requested token`)
  if (q.action.fromChainId !== params.fromChain)
    throw new LifiError(`Route starts on chain ${q.action.fromChainId}, expected ${params.fromChain}`)
  // What leaves the sender's wallet must be exactly what they asked to send.
  if (BigInt(q.action.fromAmount) !== params.fromAmount)
    throw new LifiError(`Route sends ${q.action.fromAmount}, expected ${params.fromAmount}`)
  const sameToken =
    params.fromChain === SOLANA_CHAIN_ID
      ? q.action.fromToken.address === params.fromToken
      : q.action.fromToken.address.toLowerCase() === params.fromToken.toLowerCase()
  if (!sameToken) throw new LifiError(`Route spends ${q.action.fromToken.symbol}, not the requested token`)

  let transactionRequest: FuelQuote['transactionRequest']
  if (params.fromChain === SOLANA_CHAIN_ID) {
    if (tx.to) throw new LifiError('Expected a serialized Solana transaction')
    transactionRequest = { kind: 'solana', data: tx.data }
  } else {
    const value = BigInt(tx.value ?? 0)
    const gas = tx.gasLimit ? BigInt(tx.gasLimit) : undefined
    checkEvmRoute({
      fromChain: params.fromChain,
      fromToken: params.fromToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
      to: tx.to,
      data: tx.data,
      value,
      chainId: tx.chainId,
      gas,
      approvalAddress: q.estimate.approvalAddress,
    })
    transactionRequest = { kind: 'evm', to: getAddress(tx.to!), data: tx.data as Hex, value, chainId: tx.chainId!, gas }
  }

  // Route quality: what is guaranteed to arrive against what is sent, in dollars.
  // Tempo stablecoins are $1 with 6 decimals; USDC sources are $1; other sources use LI.FI's USD estimate.
  const toAmount = BigInt(q.estimate.toAmount)
  const toAmountMin = BigInt(q.estimate.toAmountMin)
  if (toAmountMin <= 0n || toAmountMin > toAmount) throw new LifiError(`Route minimum ${toAmountMin} is out of range`)
  if (params.slippage != null && toAmountMin * 10_000n < toAmount * BigInt(Math.floor((1 - params.slippage - 0.001) * 10_000)))
    throw new LifiError('Route minimum is below the requested slippage')
  const dollarSource = DOLLAR_SOURCE_TOKENS.has(params.fromToken.toLowerCase()) && q.action.fromToken.decimals === 6
  const sentUsd = dollarSource ? Number(params.fromAmount) / 1e6 : Number(q.estimate.fromAmountUSD)
  if (Number.isFinite(sentUsd) && sentUsd > 0) {
    const maxLoss = params.maxLoss ?? DEFAULT_MAX_LOSS
    const minUsd = Number(toAmountMin) / 1e6
    if (minUsd < sentUsd * (1 - maxLoss))
      throw new LifiError(
        `Route loses too much: sends $${sentUsd.toFixed(2)}, guarantees only $${minUsd.toFixed(2)} (limit ${(maxLoss * 100).toFixed(1)}%)`,
      )
  } else if (!dollarSource) {
    throw new LifiError('LI.FI gave no USD value for the amount sent, so the route loss cannot be checked')
  }

  return {
    id: q.id,
    tool: q.tool,
    fromChain: q.action.fromChainId,
    fromToken: q.action.fromToken,
    fromAmount: BigInt(q.action.fromAmount),
    toToken: { ...q.action.toToken, address: getAddress(q.action.toToken.address) },
    toAddress: getAddress(q.action.toAddress),
    toAmount,
    toAmountMin,
    fromAmountUSD: q.estimate.fromAmountUSD != null ? Number(q.estimate.fromAmountUSD) : undefined,
    toAmountUSD: q.estimate.toAmountUSD != null ? Number(q.estimate.toAmountUSD) : undefined,
    durationSeconds: q.estimate.executionDuration,
    feesUsd: sumUsd(q.estimate.feeCosts),
    gasUsd: sumUsd(q.estimate.gasCosts),
    costs: toCosts(q, params.fee),
    approvalAddress: q.estimate.approvalAddress ? getAddress(q.estimate.approvalAddress) : undefined,
    transactionRequest,
  }
}

export type FuelStatus = {
  status: 'NOT_FOUND' | 'INVALID' | 'PENDING' | 'DONE' | 'FAILED'
  substatus?: string
  substatusMessage?: string
  receivingTxHash?: Hex
  receivedAmount?: bigint
}

export async function getFuelStatus(
  /** `txHash` is the source tx hash (0x…) or the Solana signature (base58). */
  params: LifiOptions & { txHash: string; fromChain: number },
): Promise<FuelStatus> {
  const s = await lifiGet<{
    status: FuelStatus['status']
    substatus?: string
    substatusMessage?: string
    receiving?: { txHash?: Hex; amount?: string }
  }>('/status', { txHash: params.txHash, fromChain: String(params.fromChain), toChain: String(TEMPO_CHAIN_ID) }, params)
  return {
    status: s.status,
    substatus: s.substatus,
    substatusMessage: s.substatusMessage,
    receivingTxHash: s.receiving?.txHash,
    receivedAmount: s.receiving?.amount ? BigInt(s.receiving.amount) : undefined,
  }
}

/** Polls LI.FI until the transfer is DONE or FAILED. */
export async function waitForFuel(
  params: LifiOptions & {
    txHash: string
    fromChain: number
    intervalMs?: number
    timeoutMs?: number
    onStatus?: (status: FuelStatus) => void
  },
): Promise<FuelStatus> {
  const { intervalMs = 3000, timeoutMs = 10 * 60_000 } = params
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let status: FuelStatus
    try {
      status = await getFuelStatus(params)
    } catch (error) {
      // LI.FI answers 404 until it has indexed the source transaction.
      if (!(error instanceof LifiError && error.status === 404)) throw error
      status = { status: 'NOT_FOUND' }
    }
    params.onStatus?.(status)
    if (status.status === 'DONE' || status.status === 'FAILED') return status
    if (Date.now() > deadline) throw new LifiError('Timed out waiting for the transfer to complete')
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export type FuelStep =
  | { step: 'approve'; hash: Hex }
  | { step: 'approved' }
  | { step: 'send'; hash: Hex }
  | { step: 'sent' }

/**
 * Executes a quote from the connected wallet: approves exactly `fromAmount` if the
 * allowance is short, then sends the LI.FI transaction. Returns the source tx hash.
 * The wallet (a browser wallet or a local account) signs every transaction.
 */
export async function executeFuel(params: {
  quote: FuelQuote
  wallet: WalletClient<Transport, Chain | undefined, Account>
  /** Public client for the source chain. */
  client: PublicClient
  onStep?: (step: FuelStep) => void
}): Promise<Hex> {
  const { quote, wallet, client, onStep } = params
  const account = wallet.account
  const chain = client.chain
  const tx = quote.transactionRequest
  if (tx.kind !== 'evm') throw new Error('executeFuel signs EVM routes; sign Solana routes with the Solana wallet')
  if (!chain || chain.id !== quote.fromChain) throw new Error(`Public client must be on chain ${quote.fromChain}`)
  // A quote is a plain object that may have been serialized, cached or edited since fuelQuote checked it.
  checkEvmRoute({
    fromChain: quote.fromChain,
    fromToken: quote.fromToken.address,
    fromAmount: quote.fromAmount,
    toAddress: quote.toAddress,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    chainId: tx.chainId,
    gas: tx.gas,
    approvalAddress: quote.approvalAddress,
  })
  if (quote.fromAmount <= 0n) throw new LifiError('Quote amount must be positive')

  if (!NATIVE_TOKENS.has(quote.fromToken.address.toLowerCase()) && quote.approvalAddress) {
    const token = getAddress(quote.fromToken.address)
    const allowance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, quote.approvalAddress],
    })
    if (allowance < quote.fromAmount) {
      const hash = await wallet.writeContract({
        chain,
        account,
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [quote.approvalAddress, quote.fromAmount],
      })
      onStep?.({ step: 'approve', hash })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Approval transaction failed')
      onStep?.({ step: 'approved' })
    }
  }

  const hash = await wallet.sendTransaction({ chain, account, to: tx.to, data: tx.data, value: tx.value, gas: tx.gas })
  onStep?.({ step: 'send', hash })
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new FuelRevertedError(hash)
  onStep?.({ step: 'sent' })
  return hash
}
