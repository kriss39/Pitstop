import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { getBalance } from './balance.js'
import { executeFuel, fuelQuote, SOURCE_TOKENS, waitForFuel, type FuelStatus, type LifiOptions } from './fuel.js'
import type { FuelTokenSymbol } from './tokens.js'

/**
 * The agent's home wallet: a small Base hot wallet the agent controls, used only to
 * top up its Tempo wallet. Fund it with a few dollars; that is all it can ever lose.
 */
export type HomeWallet = { privateKey: Hex; address: Address }

export function generateHomeWallet(): HomeWallet {
  const privateKey = generatePrivateKey()
  return { privateKey, address: privateKeyToAccount(privateKey).address }
}

const baseClient = (rpcUrl?: string) => createPublicClient({ chain: base, transport: http(rpcUrl) }) as PublicClient

export async function getHomeBalances(address: Address, rpcUrl?: string): Promise<{ usdc: bigint; eth: bigint }> {
  const client = baseClient(rpcUrl)
  const [usdc, eth] = await Promise.all([
    client.readContract({ address: SOURCE_TOKENS.base.USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    client.getBalance({ address }),
  ])
  return { usdc, eth }
}

export type RefillConfig = LifiOptions & {
  /** The agent's Tempo wallet (the guarded wallet). */
  agentWallet: Address
  home: HomeWallet
  /** Token the agent spends and receives on Tempo. Defaults to USDCe. */
  token?: FuelTokenSymbol
  /** Refill when the agent's balance of `token` is below this (6 decimals). */
  threshold: bigint
  /** USDC to send from Base per refill (6 decimals). */
  amount: bigint
  /** Never send more than this per UTC day (6 decimals). */
  maxPerDay: bigint
  /** Minimum time between refills. Defaults to 10 minutes. */
  cooldownMs?: number
  /** Refuel now regardless of balance and cooldown (the daily cap still applies). */
  force?: boolean
  /** Optional integrator fee as a decimal (see PITSTOP_FEE). */
  fee?: number
  baseRpcUrl?: string
}

/** What the caller persists between runs so the daily cap and cooldown survive restarts. */
export type RefillState = { day: string; sentToday: string; lastRefillAt?: number }

export type RefillResult =
  | { action: 'skipped'; reason: 'above-threshold' | 'cooldown' | 'daily-cap'; balance: bigint }
  | { action: 'refilled'; balance: bigint; txHash: Hex; status: FuelStatus }

const today = () => new Date().toISOString().slice(0, 10)

export function initialRefillState(): RefillState {
  return { day: today(), sentToday: '0' }
}

/** Checks the agent's Tempo balance and, if it is low, fuels it from the home wallet on Base. */
export async function refillIfLow(
  config: RefillConfig,
  state: RefillState = initialRefillState(),
  onProgress?: (message: string) => void,
): Promise<{ result: RefillResult; state: RefillState }> {
  const log = onProgress ?? (() => {})
  const s: RefillState = state.day === today() ? { ...state } : { day: today(), sentToday: '0', lastRefillAt: state.lastRefillAt }

  const token = config.token ?? 'USDCe'
  const [held] = await getBalance({ address: config.agentWallet, tokens: [token] })
  const balance = held!.raw
  if (!config.force && balance >= config.threshold)
    return { result: { action: 'skipped', reason: 'above-threshold', balance }, state: s }

  const cooldown = config.cooldownMs ?? 10 * 60_000
  if (!config.force && s.lastRefillAt && Date.now() - s.lastRefillAt < cooldown)
    return { result: { action: 'skipped', reason: 'cooldown', balance }, state: s }
  if (BigInt(s.sentToday) + config.amount > config.maxPerDay)
    return { result: { action: 'skipped', reason: 'daily-cap', balance }, state: s }

  const account = privateKeyToAccount(config.home.privateKey)
  const funds = await getHomeBalances(account.address, config.baseRpcUrl)
  if (funds.usdc < config.amount)
    throw new Error(`Home wallet ${account.address} has ${formatUnits(funds.usdc, 6)} USDC on Base; needs ${formatUnits(config.amount, 6)}`)
  if (funds.eth === 0n) throw new Error(`Home wallet ${account.address} has no ETH on Base for gas`)

  log(
    config.force
      ? `Manual refuel: agent ${token} ${formatUnits(balance, 6)}; fueling ${formatUnits(config.amount, 6)} USDC from Base`
      : `Agent ${token} ${formatUnits(balance, 6)} < ${formatUnits(config.threshold, 6)}; fueling ${formatUnits(config.amount, 6)} USDC from Base`,
  )
  const quote = await fuelQuote({
    ...config,
    fromChain: base.id,
    fromToken: SOURCE_TOKENS.base.USDC,
    fromAmount: config.amount,
    fromAddress: account.address,
    toAddress: config.agentWallet,
    toToken: token,
  })
  const client = baseClient(config.baseRpcUrl)
  const wallet = createWalletClient({ account, chain: base, transport: http(config.baseRpcUrl) })
  const txHash = await executeFuel({ quote, wallet, client, onStep: (step) => log(`  ${step.step}${'hash' in step ? ` ${step.hash}` : ''}`) })

  // The money has left the home wallet: count it now, and always hand the new state back,
  // so a slow or failed bridge check can't lead to a second send.
  s.sentToday = (BigInt(s.sentToday) + config.amount).toString()
  s.lastRefillAt = Date.now()

  let status: FuelStatus
  try {
    status = await waitForFuel({ ...config, txHash, fromChain: base.id })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    status = { status: 'PENDING', substatusMessage: `Sent, but the bridge status is unknown (${reason}). Check LI.FI Scan.` }
  }
  log(`  bridge ${status.status}${status.receivedAmount != null ? `, received ${formatUnits(status.receivedAmount, 6)} ${token}` : ''}`)
  return { result: { action: 'refilled', balance, txHash, status }, state: s }
}

/** Runs `refillIfLow` on an interval. Returns a function that stops the loop. */
export function startAutoRefill(
  config: RefillConfig,
  options: {
    intervalMs?: number
    state?: RefillState
    onResult?: (result: RefillResult, state: RefillState) => void
    onError?: (error: unknown) => void
    onProgress?: (message: string) => void
  } = {},
): () => void {
  let state = options.state ?? initialRefillState()
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      const out = await refillIfLow(config, state, options.onProgress)
      state = out.state
      options.onResult?.(out.result, state)
    } catch (error) {
      options.onError?.(error)
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(tick, options.intervalMs ?? 60_000)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

