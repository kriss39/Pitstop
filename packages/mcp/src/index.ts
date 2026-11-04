#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  fuelQuote,
  getAgentKeyRecipients,
  getAgentKeyStatus,
  getBalance,
  getHomeBalances,
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
import { formatEther, formatUnits, isAddress, parseUnits, type Address } from 'viem'
import { z } from 'zod'

const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

// Configuration comes from the agent machine's environment:
//   AGENT_WALLET   guarded Tempo wallet the agent spends from
//   PITSTOP_DIR    folder with agent-key.json and home-wallet.json
//                  (default: ./.pitstop if it exists, otherwise ~/.pitstop)
//   PITSTOP_AGENT_KEY  access key made on the Guard page (instead of agent-key.json)
//   LIFI_API_KEY, LIFI_INTEGRATOR, REFILL_MAX_PER_DAY (default 6), PITSTOP_URL
//
// MCP clients start the server from a folder of their choosing, so the default keystore is
// ~/.pitstop: `npx -y @getpitstop/mcp key` in any terminal and the server find the same files.
// A ./.pitstop folder (the only place 0.1.1 looked) still wins when it exists.
function storeDir() {
  if (process.env.PITSTOP_DIR) return process.env.PITSTOP_DIR
  const local = resolve(process.cwd(), '.pitstop')
  return existsSync(local) ? local : join(homedir(), '.pitstop')
}
const store = keystore(storeDir())

/** PITSTOP_FEE as a fraction (0.001 = 0.1%); falls back to the default if it isn't a number in 0..0.05. */
function feeFromEnv() {
  const raw = process.env.PITSTOP_FEE
  if (raw == null || raw.trim() === '') return PITSTOP_FEE
  const fee = Number(raw)
  return Number.isFinite(fee) && fee >= 0 && fee <= 0.05 ? fee : PITSTOP_FEE
}
const MIN_FUEL = 0.01
const MAX_FUEL = 5
// Token the agent's key is scoped to (AGENT_TOKEN, default USDCe).
const AGENT_TOKEN: FuelTokenSymbol = (FUEL_TOKENS as readonly string[]).includes(process.env.AGENT_TOKEN ?? '')
  ? (process.env.AGENT_TOKEN as FuelTokenSymbol)
  : 'USDCe'
if (process.env.AGENT_TOKEN && process.env.AGENT_TOKEN !== AGENT_TOKEN)
  console.error(`pitstop: AGENT_TOKEN=${process.env.AGENT_TOKEN} is not one of ${FUEL_TOKENS.join(', ')}; using USDCe`)
const tokenArg = z.enum(FUEL_TOKENS).optional().describe(`Token to receive on Tempo; defaults to ${AGENT_TOKEN}`)
const GUARD_URL = process.env.PITSTOP_URL ?? 'https://fuel.pitstopgas.workers.dev'
const lifi = {
  apiKey: process.env.LIFI_API_KEY,
  integrator: process.env.LIFI_INTEGRATOR ?? 'pitstop',
  // Pitstop's fee applies to agent refuels too; PITSTOP_FEE=0 turns it off.
  fee: feeFromEnv(),
}

const usd = (v: bigint) => formatUnits(v, TIP20_DECIMALS)
/** USDC base units from a tool argument. toFixed avoids "1e-7", which parseUnits rejects. */
const usdc = (amount: number) => parseUnits(amount.toFixed(6), 6)
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const fail = (message: string) => ({ ...text(message), isError: true })

const NEED_WALLET = 'AGENT_WALLET is not set to the Tempo wallet the agent spends from.'
const NEED_KEY =
  'No access key. Set PITSTOP_AGENT_KEY to a key from the Guard page, or run `npx -y @getpitstop/mcp key` on this machine.'
const NEED_HOME = 'No home wallet. Run `npx -y @getpitstop/mcp home-wallet` on this machine and fund it on Base.'

function agentWallet(override?: string): Address | undefined {
  const w = override ?? process.env.AGENT_WALLET
  return w && isAddress(w) ? w : undefined
}

const address = z
  .string()
  .refine((value) => isAddress(value), 'Must be a 0x-prefixed EVM address')

/** `pitstop-mcp key | home-wallet | help | version`: sets up the keystore from a terminal. Prints public data only. */
async function cli(cmd: string, args: string[]) {
  if (cmd === 'key') {
    const rotate = args.includes('--new')
    if (process.env.PITSTOP_AGENT_KEY) {
      const key = store.loadAccessKey()!
      console.log(`Using the key in PITSTOP_AGENT_KEY: ${key.address}`)
      if (rotate) console.log('Unset PITSTOP_AGENT_KEY to create a new key in the keystore.')
      console.log(`The owner authorizes it at ${GUARD_URL}/guard?key=${key.address}`)
      return
    }
    const existing = rotate ? undefined : store.loadAccessKey()
    const key = existing ?? store.createAccessKey({ rotate })
    console.log(existing ? 'Access key already exists.' : rotate ? 'Created a new access key (the old file is kept, renamed).' : 'Created a new access key.')
    console.log(`Stored in    ${store.accessKeyFile} (never commit or share this file)`)
    console.log(`Key address  ${key.address}`)
    console.log()
    console.log('Ask the owner to authorize it with their passkey:')
    console.log(`  ${GUARD_URL}/guard?key=${key.address}`)
    if (!process.env.PITSTOP_DIR && store.dir !== join(homedir(), '.pitstop'))
      console.log(`\nThis keystore is ${store.dir}. If your MCP client starts the server elsewhere, add -e PITSTOP_DIR=${store.dir}`)
    return
  }
  if (cmd === 'home-wallet') {
    const existing = store.loadHomeWallet()
    const home = existing ?? store.createHomeWallet()
    console.log(existing ? 'Home wallet already exists.' : 'Created a new home wallet.')
    console.log(`Stored in  ${store.homeWalletFile} (never commit or share this file)`)
    console.log(`Address    ${home.address} (Base)`)
    try {
      const { usdc: held, eth } = await getHomeBalances(home.address)
      console.log(`Balance    ${formatUnits(held, 6)} USDC, ${formatEther(eth)} ETH`)
      if (held === 0n || eth === 0n)
        console.log('\nFund it on Base with a few USDC (e.g. 5) and a little ETH for gas (~$0.10). Keep only small amounts here.')
    } catch {
      console.log('Balance    unknown (Base RPC unavailable)')
    }
    return
  }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    console.log(VERSION)
    return
  }
  console.log(`@getpitstop/mcp ${VERSION}

Usage:
  npx -y @getpitstop/mcp               Start the MCP server on stdio (your MCP client runs this)
  npx -y @getpitstop/mcp key [--new]   Create the agent's access key (--new replaces a revoked one)
  npx -y @getpitstop/mcp home-wallet   Create the small Base wallet the agent refuels from

Keystore: ${store.dir} (set PITSTOP_DIR to change it)
Docs: ${GUARD_URL}/docs`)
  if (cmd !== 'help' && cmd !== '--help' && cmd !== '-h') process.exitCode = 1
}

const command = process.argv[2]
if (command) {
  await cli(command, process.argv.slice(3))
  process.exit()
}

const server = new McpServer({ name: 'pitstop', version: VERSION })

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
    description: 'Ask LI.FI how much the agent would receive on Tempo for N USDC from its home wallet on Base. Read-only.',
    inputSchema: { amount: z.number().min(MIN_FUEL).max(MAX_FUEL).describe(`USDC to send, ${MIN_FUEL} to ${MAX_FUEL}`), token: tokenArg },
  },
  async ({ amount, token }) => {
    const wallet = agentWallet()
    if (!wallet) return fail(NEED_WALLET)
    const home = store.loadHomeWallet()
    if (!home) return fail(NEED_HOME)
    const q = await fuelQuote({
      toToken: token ?? AGENT_TOKEN,
      ...lifi,
      fromChain: SOURCE_TOKENS.base.chainId,
      fromToken: SOURCE_TOKENS.base.USDC,
      fromAmount: usdc(amount),
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
    inputSchema: { amount: z.number().min(MIN_FUEL).max(MAX_FUEL).describe(`USDC to send, ${MIN_FUEL} to ${MAX_FUEL}`), token: tokenArg },
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
  if (!wallet) return fail(NEED_WALLET)
  const home = store.loadHomeWallet()
  if (!home) return fail(NEED_HOME)
  const progress: string[] = []
  try {
    const { result, state } = await refillIfLow(
      {
        ...lifi,
        agentWallet: wallet,
        home,
        token: token ?? AGENT_TOKEN,
        threshold: 0n,
        amount: usdc(amount),
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
      "Show the agent's spending key on Tempo: whether it is active, how much it may still spend this period, when that resets, when the key expires and which payees it may pay.",
    inputSchema: {},
  },
  async () => {
    const wallet = agentWallet()
    if (!wallet) return fail(NEED_WALLET)
    const key = store.loadAccessKey()
    if (!key) return fail(NEED_KEY)
    const s = await getAgentKeyStatus({ wallet, key: key.address, token: TEMPO_TOKENS[AGENT_TOKEN] })
    const iso = (t?: number) => (t ? new Date(t * 1000).toISOString() : undefined)
    const state = s.revoked ? 'revoked' : !s.authorized ? 'not authorized' : s.expiry * 1000 < Date.now() ? 'expired' : 'active'
    if (state === 'not authorized')
      return text({ wallet, key: key.address, state, next: `Ask the owner to authorize it: ${GUARD_URL}/guard?key=${key.address}` })
    const unlimited = s.spendPolicy === 'unlimited'
    // undefined: any payee; a list: only these (Tempo rejects the rest); null: the read failed.
    const payees = state === 'active' ? await getAgentKeyRecipients({ wallet, key: key.address }).catch(() => null) : null
    return text({
      wallet,
      key: key.address,
      state,
      token: AGENT_TOKEN,
      remaining: unlimited ? 'unlimited' : usd(s.remaining),
      periodEnds: unlimited ? undefined : iso(s.periodEnd),
      expires: iso(s.expiry),
      allowedPayees: payees === undefined ? 'any' : (payees ?? undefined),
    })
  },
)

server.registerTool(
  'guard_link',
  {
    title: 'Link for the owner',
    description:
      'The agent cannot change its own limits. Returns the Guard page link where the owner authorizes the key, changes the daily limit or revokes it with their passkey.',
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
    description: 'Search the public MPP directory (mpp.dev) for paid APIs the agent can pay on Tempo, e.g. "dune", "nansen", "search".',
    inputSchema: {
      query: z.string().optional().describe('Search term'),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  // Only services that take Tempo payments; the limit applies after that filter.
  async ({ query, limit }) => {
    const services = await listMppServices({ query, limit: Number.MAX_SAFE_INTEGER })
    return text(services.filter((s) => s.methods.includes('tempo')).slice(0, limit ?? 10))
  },
)

await server.connect(new StdioServerTransport())
