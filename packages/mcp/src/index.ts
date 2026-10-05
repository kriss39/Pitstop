#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  fuelQuote,
  getAgentKeyStatus,
  getBalance,
  listMppServices,
  PITSTOP_FEE,
  refillIfLow,
  FUEL_TOKENS,
  SOURCE_TOKENS,
  TEMPO_TOKENS,
  TIP20_DECIMALS,
  type FuelTokenSymbol,
  totalUsd,
} from '@getpitstop/sdk'
import { keystore } from '@getpitstop/sdk/node'
import { formatUnits, isAddress, parseUnits, type Address } from 'viem'
import { z } from 'zod'

// Configuration comes from the agent machine's environment:
//   AGENT_WALLET   guarded Tempo wallet the agent spends from
//   PITSTOP_DIR    folder with agent-key.json and home-wallet.json (default ./.pitstop)
//   PITSTOP_AGENT_KEY  access key made on the Guard page (instead of agent-key.json)
//   LIFI_API_KEY, LIFI_INTEGRATOR, REFILL_MAX_PER_DAY (default 6), PITSTOP_URL
const store = keystore()
/** PITSTOP_FEE as a fraction (0.001 = 0.1%); falls back to the default if it isn't a number in 0..0.05. */
function feeFromEnv() {
  const raw = process.env.PITSTOP_FEE
  if (raw == null || raw.trim() === '') return PITSTOP_FEE
  const fee = Number(raw)
  return Number.isFinite(fee) && fee >= 0 && fee <= 0.05 ? fee : PITSTOP_FEE
}
const MAX_FUEL = 5
// Token the agent's key is scoped to (AGENT_TOKEN, default USDCe).
const AGENT_TOKEN: FuelTokenSymbol = (FUEL_TOKENS as readonly string[]).includes(process.env.AGENT_TOKEN ?? '')
  ? (process.env.AGENT_TOKEN as FuelTokenSymbol)
  : 'USDCe'
const tokenArg = z.enum(FUEL_TOKENS).optional().describe(`Token to receive on Tempo; defaults to ${AGENT_TOKEN}`)
const GUARD_URL = process.env.PITSTOP_URL ?? 'https://fuel.pitstopgas.workers.dev'
const lifi = {
  apiKey: process.env.LIFI_API_KEY,
  integrator: process.env.LIFI_INTEGRATOR ?? 'pitstop',
  // Pitstop's fee applies to agent refuels too; PITSTOP_FEE=0 turns it off.
  fee: feeFromEnv(),
}

const usd = (v: bigint) => formatUnits(v, TIP20_DECIMALS)
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const fail = (message: string) => ({ ...text(message), isError: true })

function agentWallet(override?: string): Address | undefined {
  const w = override ?? process.env.AGENT_WALLET
  return w && isAddress(w) ? w : undefined
}

const address = z
  .string()
  .refine((value) => isAddress(value), 'Must be a 0x-prefixed EVM address')

const server = new McpServer({ name: 'pitstop', version: '0.1.0' })

server.registerTool(
  'get_balance',
  {
    title: 'Get agent balance',
    description: "Read stablecoin balances on Tempo (chain 4217). Defaults to the agent's own wallet.",
    inputSchema: { address: address.optional().describe('Tempo address; defaults to AGENT_WALLET') },
  },
  async ({ address: a }) => {
    const wallet = agentWallet(a)
    if (!wallet) return fail('No address given and AGENT_WALLET is not set.')
    const balances = await getBalance({ address: wallet })
    return text({
      address: wallet,
      totalUsd: usd(totalUsd(balances)),
      balances: balances.map(({ symbol, formatted }) => ({ symbol, amount: formatted })),
    })
  },
)

server.registerTool(
  'fuel_quote',
  {
    title: 'Quote a refuel',
    description: "Ask LI.FI how much USDCe the agent would receive on Tempo for N USDC from its home wallet on Base. Read-only.",
    inputSchema: { amount: z.number().positive().max(MAX_FUEL).describe(`USDC to send, at most ${MAX_FUEL}`), token: tokenArg },
  },
  async ({ amount, token }) => {
    const wallet = agentWallet()
    const home = store.loadHomeWallet()
    if (!wallet || !home) return fail('Set AGENT_WALLET and create a home wallet (pnpm home-wallet) first.')
    const q = await fuelQuote({
      toToken: token ?? AGENT_TOKEN,
      ...lifi,
      fromChain: SOURCE_TOKENS.base.chainId,
      fromToken: SOURCE_TOKENS.base.USDC,
      fromAmount: parseUnits(String(amount), 6),
      fromAddress: home.address,
      toAddress: wallet,
    })
    return text({
      send: `${amount} USDC on Base`,
      receive: `${usd(q.toAmount)} ${q.toToken.symbol} on Tempo`,
      minimum: usd(q.toAmountMin),
      route: q.tool,
      seconds: q.durationSeconds,
      costsUsd: Number((q.feesUsd + q.gasUsd).toFixed(4)),
    })
  },
)

server.registerTool(
  'fuel_agent',
  {
    title: 'Refuel the agent now',
    description:
      "Send USDC from the agent's home wallet on Base to its Tempo wallet through LI.FI and wait until it arrives (usually seconds). Spends real money: at most 5 USDC per call and REFILL_MAX_PER_DAY per day.",
    inputSchema: { amount: z.number().positive().max(MAX_FUEL).describe(`USDC to send, at most ${MAX_FUEL}`), token: tokenArg },
  },
  // One refuel at a time: parallel calls would read the same daily total and could overshoot it.
  ({ amount, token }) => {
    const run = fuelQueue.then(() => fuelAgent(amount, token))
    fuelQueue = run.catch(() => {})
    return run
  },
)

let fuelQueue: Promise<unknown> = Promise.resolve()

async function fuelAgent(amount: number, token?: FuelTokenSymbol) {
  const wallet = agentWallet()
  const home = store.loadHomeWallet()
  if (!wallet || !home) return fail('Set AGENT_WALLET and create a home wallet (pnpm home-wallet) first.')
  const progress: string[] = []
  try {
    const { result, state } = await refillIfLow(
      {
        ...lifi,
        agentWallet: wallet,
        home,
        token: token ?? AGENT_TOKEN,
        threshold: 0n,
        amount: parseUnits(String(amount), 6),
        maxPerDay: parseUnits(process.env.REFILL_MAX_PER_DAY ?? '6', 6),
        force: true,
      },
      store.loadRefillState(),
      (m) => progress.push(m.trim()),
    )
    store.saveRefillState(state)
    if (result.action === 'skipped') return fail(`Not fueled: ${result.reason}. Sent today: ${usd(BigInt(state.sentToday))} USDC.`)
    return text({
      status: result.status.status,
      note: result.status.substatusMessage,
      received: result.status.receivedAmount != null ? `${usd(result.status.receivedAmount)} ${token ?? AGENT_TOKEN}` : undefined,
      sourceTx: `https://basescan.org/tx/${result.txHash}`,
      tempoTx: result.status.receivingTxHash ? `https://explore.tempo.xyz/tx/${result.status.receivingTxHash}` : undefined,
      sentTodayUsd: usd(BigInt(state.sentToday)),
      log: progress,
    })
  } catch (error) {
    return fail(`Refuel failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
}

server.registerTool(
  'key_status',
  {
    title: 'Spending key status',
    description:
      "Show the agent's spending key on Tempo: whether it is active, how much it may still spend this period, when that resets and when the key expires.",
    inputSchema: {},
  },
  async () => {
    const wallet = agentWallet()
    const key = store.loadAccessKey()
    if (!wallet || !key) return fail('Set AGENT_WALLET and create an access key (pnpm key) first.')
    const s = await getAgentKeyStatus({ wallet, key: key.address, token: TEMPO_TOKENS[AGENT_TOKEN] })
    const iso = (t?: number) => (t ? new Date(t * 1000).toISOString() : undefined)
    return text({
      wallet,
      key: key.address,
      state: s.revoked ? 'revoked' : !s.authorized ? 'not authorized' : s.expiry * 1000 < Date.now() ? 'expired' : 'active',
      token: AGENT_TOKEN,
      remaining: usd(s.remaining),
      periodEnds: iso(s.periodEnd),
      expires: iso(s.expiry),
    })
  },
)

server.registerTool(
  'guard_link',
  {
    title: 'Link for the owner',
    description:
      "The agent cannot change its own limits. Returns the Guard page link where the owner authorizes the key, changes the daily limit or revokes it with their passkey.",
    inputSchema: {},
  },
  async () => {
    const key = store.loadAccessKey()
    return text(key ? `${GUARD_URL}/guard?key=${key.address}` : `${GUARD_URL}/guard`)
  },
)

server.registerTool(
  'list_mpp_services',
  {
    title: 'Find MPP services',
    description: 'Search the public MPP directory (mpp.dev) for paid APIs the agent can use, e.g. "dune", "nansen", "search".',
    inputSchema: {
      query: z.string().optional().describe('Search term'),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async ({ query, limit }) => text(await listMppServices({ query, limit: limit ?? 10 })),
)

await server.connect(new StdioServerTransport())
