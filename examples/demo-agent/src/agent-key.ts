import { FUEL_TOKENS, PITSTOP_FEE, TEMPO_TOKENS, TIP20_DECIMALS, type FuelTokenSymbol, type RefillConfig } from '@getpitstop/sdk'
import { keystore } from '@getpitstop/sdk/node'
import { resolve } from 'node:path'
import { parseUnits } from 'viem'

/** Keys live only on this machine, in a git-ignored folder next to the demo agent. */
export const store = keystore(process.env.PITSTOP_DIR ?? resolve(import.meta.dirname, '../.pitstop'))

export const GUARD_URL = process.env.PITSTOP_URL ?? 'https://fuel.pitstopgas.workers.dev'

export const loadKey = store.loadAccessKey

/** Token the agent's key is scoped to (AGENT_TOKEN, default USDCe). */
export const AGENT_TOKEN: FuelTokenSymbol = (FUEL_TOKENS as readonly string[]).includes(process.env.AGENT_TOKEN ?? '')
  ? (process.env.AGENT_TOKEN as FuelTokenSymbol)
  : 'USDCe'
export const AGENT_TOKEN_ADDRESS = TEMPO_TOKENS[AGENT_TOKEN]

export function requireWallet(): `0x${string}` {
  const wallet = process.env.AGENT_WALLET
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    console.error('Set AGENT_WALLET in .env to the guarded wallet address shown on the Guard page.')
    process.exit(1)
  }
  return wallet as `0x${string}`
}

/** Auto-refill settings from .env, with small defaults for testing. */
export function refillConfig(): RefillConfig {
  const home = store.loadHomeWallet()
  if (!home) {
    console.error('No home wallet yet. Run: pnpm home-wallet')
    process.exit(1)
  }
  const usd = (name: string, fallback: string) => parseUnits(process.env[name] ?? fallback, TIP20_DECIMALS)
  return {
    agentWallet: requireWallet(),
    home,
    token: AGENT_TOKEN,
    threshold: usd('REFILL_THRESHOLD', '1'),
    amount: usd('REFILL_AMOUNT', '2'),
    maxPerDay: usd('REFILL_MAX_PER_DAY', '6'),
    apiKey: process.env.LIFI_API_KEY,
    integrator: process.env.LIFI_INTEGRATOR,
    // Pitstop's fee applies to refills too; PITSTOP_FEE=0 turns it off.
    fee: Number.isFinite(Number(process.env.PITSTOP_FEE)) && (process.env.PITSTOP_FEE ?? '').trim() !== '' ? Number(process.env.PITSTOP_FEE) : PITSTOP_FEE,
  }
}
