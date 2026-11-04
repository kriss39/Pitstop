import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { accessKeyFromPrivateKey, generateAccessKey, type GeneratedAccessKey } from './guard.js'
import { generateHomeWallet, initialRefillState, type HomeWallet, type RefillState } from './refill.js'

/**
 * Where the keystore lives when no folder is given: `$PITSTOP_DIR`, else `./.pitstop` if it
 * exists (the only default before 0.1.2), else `~/.pitstop`. The home folder means a key made
 * in one terminal is found by an agent or MCP server started from any other folder.
 */
export function defaultKeystoreDir(): string {
  if (process.env.PITSTOP_DIR) return process.env.PITSTOP_DIR
  const local = resolve(process.cwd(), '.pitstop')
  return existsSync(local) ? local : join(homedir(), '.pitstop')
}

/**
 * Local keystore for an agent machine. Keys live in plain JSON files with mode 600, in a
 * folder with mode 700 (default: see `defaultKeystoreDir`). Keep that folder out of git.
 * The access key can instead come from `$PITSTOP_AGENT_KEY` (a key made on the Guard page).
 */
export function keystore(dir = defaultKeystoreDir()) {
  const path = (name: string) => join(dir, name)

  const read = <T>(name: string): T | undefined =>
    existsSync(path(name)) ? (JSON.parse(readFileSync(path(name), 'utf8')) as T) : undefined

  const write = (name: string, value: unknown) => {
    // Only the owner may list or open the folder. (A folder that already exists keeps its mode.)
    mkdirSync(dirname(path(name)), { recursive: true, mode: 0o700 })
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
