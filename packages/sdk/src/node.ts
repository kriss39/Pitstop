import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { accessKeyFromPrivateKey, generateAccessKey, type GeneratedAccessKey } from './guard.js'
import { generateHomeWallet, initialRefillState, type HomeWallet, type RefillState } from './refill.js'

/**
 * Local keystore for an agent machine. Keys live in plain JSON files with mode 600 in
 * `dir` (default: `$PITSTOP_DIR` or `./.pitstop`). Keep that directory out of git.
 * The access key can instead come from `$PITSTOP_AGENT_KEY` (a key made on the Guard page).
 */
export function keystore(dir = process.env.PITSTOP_DIR ?? resolve(process.cwd(), '.pitstop')) {
  const path = (name: string) => join(dir, name)

  const read = <T>(name: string): T | undefined =>
    existsSync(path(name)) ? (JSON.parse(readFileSync(path(name), 'utf8')) as T) : undefined

  const write = (name: string, value: unknown) => {
    mkdirSync(dirname(path(name)), { recursive: true })
    writeFileSync(path(name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    chmodSync(path(name), 0o600)
  }

  return {
    dir,
    accessKeyFile: path('agent-key.json'),
    homeWalletFile: path('home-wallet.json'),

    loadAccessKey(): GeneratedAccessKey | undefined {
      const fromEnv = process.env.PITSTOP_AGENT_KEY?.trim()
      if (fromEnv) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(fromEnv)) throw new Error('PITSTOP_AGENT_KEY must be a 0x-prefixed 32-byte hex private key')
        return accessKeyFromPrivateKey(fromEnv as `0x${string}`)
      }
      return read<GeneratedAccessKey>('agent-key.json')
    },
    /** Creates the access key, or a fresh one with `rotate` (the old file is kept, renamed). */
    createAccessKey(opts: { rotate?: boolean } = {}): GeneratedAccessKey {
      if (existsSync(path('agent-key.json'))) {
        if (!opts.rotate) throw new Error('Access key already exists')
        renameSync(path('agent-key.json'), path(`agent-key.retired-${Date.now()}.json`))
      }
      const key = generateAccessKey()
      write('agent-key.json', key)
      return key
    },

    loadHomeWallet: () => read<HomeWallet>('home-wallet.json'),
    createHomeWallet(): HomeWallet {
      if (existsSync(path('home-wallet.json'))) throw new Error('Home wallet already exists')
      const wallet = generateHomeWallet()
      write('home-wallet.json', wallet)
      return wallet
    },

    loadRefillState: () => read<RefillState>('refill-state.json') ?? initialRefillState(),
    saveRefillState: (state: RefillState) => write('refill-state.json', state),
  }
}

export type Keystore = ReturnType<typeof keystore>
