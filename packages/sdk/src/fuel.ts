import {
  erc20Abi,
  getAddress,
  isAddressEqual,
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

/** LI.FI Diamond contract. Same address on every EVM chain LI.FI supports. */
export const LIFI_DIAMOND: Address = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'

/** LI.FI's numeric chain id for Solana. */
export const SOLANA_CHAIN_ID = 1151111081099710

/** Well-known source tokens. */
export const SOURCE_TOKENS = {
  base: { chainId: 8453, USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  arbitrum: { chainId: 42161, USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  ethereum: { chainId: 1, USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  solana: { chainId: SOLANA_CHAIN_ID, USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
} as const

const NATIVE_TOKENS = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
])

export type LifiOptions = {
  /** LI.FI API key. Never ship it to a browser; use a proxy `baseUrl` there. */
  apiKey?: string
  /** Defaults to https://li.quest/v1. */
  baseUrl?: string
  integrator?: string
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
  /** Integrator fee as a decimal, e.g. 0.003 = 0.3%. */
  fee?: number
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
  durationSeconds: number
  feesUsd: number
  gasUsd: number
  /** Spender to approve on EVM chains. Ignored for Solana. */
  approvalAddress?: Address
  transactionRequest: EvmTransactionRequest | SolanaTransactionRequest
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
  const url = `${opts.baseUrl ?? LIFI_API_URL}${path}?${new URLSearchParams(query)}`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (opts.apiKey) headers['x-lifi-api-key'] = opts.apiKey
  const res = await fetch(url, { headers })
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
    feeCosts?: { amountUSD?: string }[]
    gasCosts?: { amountUSD?: string }[]
  }
  transactionRequest?: { to?: string; data: string; value?: string; chainId?: number; gasLimit?: string }
}

const sumUsd = (items?: { amountUSD?: string }[]) =>
  (items ?? []).reduce((sum, item) => sum + Number(item.amountUSD ?? 0), 0)

/**
 * Asks LI.FI for a one-step route that delivers a Tempo stablecoin to the agent.
 * Throws if the returned route does not send to `toAddress` on Tempo, or does not
 * call the LI.FI Diamond on the source chain.
 */
export async function fuelQuote(params: FuelQuoteParameters): Promise<FuelQuote> {
  const toToken = TEMPO_TOKENS[params.toToken ?? 'USDCe']
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

  let transactionRequest: FuelQuote['transactionRequest']
  if (params.fromChain === SOLANA_CHAIN_ID) {
    if (tx.to) throw new LifiError('Expected a serialized Solana transaction')
    transactionRequest = { kind: 'solana', data: tx.data }
  } else {
    if (tx.chainId !== params.fromChain) throw new LifiError(`Transaction is for chain ${tx.chainId}, expected ${params.fromChain}`)
    if (!tx.to || !isAddressEqual(tx.to as Address, LIFI_DIAMOND))
      throw new LifiError(`Transaction targets ${tx.to}, not the LI.FI Diamond`)
    transactionRequest = {
      kind: 'evm',
      to: getAddress(tx.to),
      data: tx.data as Hex,
      value: BigInt(tx.value ?? 0),
      chainId: tx.chainId,
      gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
    }
  }

  return {
    id: q.id,
    tool: q.tool,
    fromChain: q.action.fromChainId,
    fromToken: q.action.fromToken,
    fromAmount: BigInt(q.action.fromAmount),
    toToken: { ...q.action.toToken, address: getAddress(q.action.toToken.address) },
    toAddress: getAddress(q.action.toAddress),
    toAmount: BigInt(q.estimate.toAmount),
    toAmountMin: BigInt(q.estimate.toAmountMin),
    durationSeconds: q.estimate.executionDuration,
    feesUsd: sumUsd(q.estimate.feeCosts),
    gasUsd: sumUsd(q.estimate.gasCosts),
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
  if (receipt.status !== 'success') throw new Error('Transfer transaction failed on the source chain')
  onStep?.({ step: 'sent' })
  return hash
}
