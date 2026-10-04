import { generateAccessKey, type GeneratedAccessKey } from '@pitstop/sdk'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** The agent's access key lives only on this machine, in a git-ignored file. */
export const KEY_FILE = resolve(import.meta.dirname, '../.pitstop/agent-key.json')

export const GUARD_URL = process.env.PITSTOP_URL ?? 'https://fuel.pitstopgas.workers.dev'

export function loadKey(): GeneratedAccessKey | undefined {
  if (!existsSync(KEY_FILE)) return undefined
  return JSON.parse(readFileSync(KEY_FILE, 'utf8')) as GeneratedAccessKey
}

export function createKey(): GeneratedAccessKey {
  const key = generateAccessKey()
  mkdirSync(dirname(KEY_FILE), { recursive: true })
  writeFileSync(KEY_FILE, JSON.stringify(key, null, 2) + '\n', { mode: 0o600 })
  chmodSync(KEY_FILE, 0o600)
  return key
}

export function requireWallet(): `0x${string}` {
  const wallet = process.env.AGENT_WALLET
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    console.error('Set AGENT_WALLET in .env to the guarded wallet address shown on the Guard page.')
    process.exit(1)
  }
  return wallet as `0x${string}`
}
