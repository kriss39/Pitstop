import { randomBytes } from 'node:crypto'
import { chmodSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isAddressEqual, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { accessKeyFromPrivateKey, generateAccessKey, type GeneratedAccessKey } from './guard.js'
import { generateHomeWallet, initialRefillState, type HomeWallet, type RefillState } from './refill.js'

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/
const uid = typeof process.getuid === 'function' ? process.getuid() : undefined

/**
 * Local keystore for an agent machine. Keys live in plain JSON files with mode 600 in
 * `dir` (default: `$PITSTOP_DIR` or `./.pitstop`), a folder with mode 700. Keep it out of git.
 * The access key can instead come from `$PITSTOP_AGENT_KEY` (a key made on the Guard page).
 *
 * On POSIX systems the keystore refuses files that are symlinks, owned by another user, or
 * readable by group/others, so a planted or swapped file is never trusted or written through.
 */
export function keystore(dir = process.env.PITSTOP_DIR ?? resolve(process.cwd(), '.pitstop')) {
  const path = (name: string) => join(dir, name)

  const ensureDir = () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const st = lstatSync(dir)
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`Keystore ${dir} is not a plain directory`)
    if (uid != null) {
      if (st.uid !== uid) throw new Error(`Keystore ${dir} belongs to another user`)
      if (st.mode & 0o077) chmodSync(dir, 0o700)
    }
  }

  const read = <T>(name: string): T | undefined => {
    const p = path(name)
    let st
    try {
      st = lstatSync(p)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    if (st.isSymbolicLink() || !st.isFile()) throw new Error(`${p} is not a regular file; refusing to read it`)
    if (uid != null) {
      if (st.uid !== uid) throw new Error(`${p} belongs to another user; refusing to read it`)
      if (st.mode & 0o077) {
        // Ours, but too open (e.g. copied by hand): tighten it, like ssh would ask you to.
        chmodSync(p, 0o600)
        console.error(`pitstop: ${p} was readable by other users; changed it to mode 600`)
      }
    }
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as T
    } catch {
      throw new Error(`${p} is not valid JSON`)
    }
  }

  /** Writes through a fresh temp file. `exclusive` fails if the target exists (even as a dangling symlink). */
  const write = (name: string, value: unknown, opts: { exclusive?: boolean } = {}) => {
    ensureDir()
    const target = path(name)
    const tmp = path(`.${name}.${randomBytes(6).toString('hex')}.tmp`)
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    try {
      chmodSync(tmp, 0o600)
      if (opts.exclusive) linkSync(tmp, target)
      else renameSync(tmp, target) // replaces a symlink at `target` itself, never what it points to
    } finally {
      try {
        unlinkSync(tmp)
      } catch {}
    }
  }

  const exists = (name: string) => {
    try {
      lstatSync(path(name))
      return true
    } catch {
      return false
    }
  }

  return {
    dir,
    accessKeyFile: path('agent-key.json'),
    homeWalletFile: path('home-wallet.json'),

    loadAccessKey(): GeneratedAccessKey | undefined {
      const fromEnv = process.env.PITSTOP_AGENT_KEY?.trim()
      if (fromEnv) {
        if (!PRIVATE_KEY.test(fromEnv)) throw new Error('PITSTOP_AGENT_KEY must be a 0x-prefixed 32-byte hex private key')
        return accessKeyFromPrivateKey(fromEnv as Hex)
      }
      const stored = read<Partial<GeneratedAccessKey>>('agent-key.json')
      if (!stored) return undefined
      if (typeof stored.privateKey !== 'string' || !PRIVATE_KEY.test(stored.privateKey))
        throw new Error(`${path('agent-key.json')} has no valid private key`)
      // Trust the private key, not the address written next to it.
      const key = accessKeyFromPrivateKey(stored.privateKey as Hex)
      if (stored.address && !isAddressEqual(stored.address, key.address))
        throw new Error(`${path('agent-key.json')} lists an address that does not match its private key`)
      return key
    },
    /** Creates the access key, or a fresh one with `rotate` (the old file is kept, renamed). */
    createAccessKey(opts: { rotate?: boolean } = {}): GeneratedAccessKey {
      ensureDir()
      if (exists('agent-key.json')) {
        if (!opts.rotate) throw new Error('Access key already exists')
        const retired = `agent-key.retired-${Date.now()}-${randomBytes(4).toString('hex')}.json`
        linkSync(path('agent-key.json'), path(retired)) // fails rather than overwrite an older retired key
        unlinkSync(path('agent-key.json'))
      }
      const key = generateAccessKey()
      write('agent-key.json', key, { exclusive: true })
      return key
    },

    loadHomeWallet(): HomeWallet | undefined {
      const stored = read<Partial<HomeWallet>>('home-wallet.json')
      if (!stored) return undefined
      if (typeof stored.privateKey !== 'string' || !PRIVATE_KEY.test(stored.privateKey))
        throw new Error(`${path('home-wallet.json')} has no valid private key`)
      const address = privateKeyToAccount(stored.privateKey as Hex).address
      if (stored.address && !isAddressEqual(stored.address, address))
        throw new Error(`${path('home-wallet.json')} lists an address that does not match its private key`)
      return { privateKey: stored.privateKey as Hex, address }
    },
    createHomeWallet(): HomeWallet {
      if (exists('home-wallet.json')) throw new Error('Home wallet already exists')
      const wallet = generateHomeWallet()
      write('home-wallet.json', wallet, { exclusive: true })
      return wallet
    },

    loadRefillState(): RefillState {
      const s = read<Partial<RefillState>>('refill-state.json')
      if (!s) return initialRefillState()
      const ok =
        typeof s.day === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(s.day) &&
        typeof s.sentToday === 'string' &&
        /^\d{1,30}$/.test(s.sentToday) &&
        (s.lastRefillAt == null || (typeof s.lastRefillAt === 'number' && Number.isFinite(s.lastRefillAt)))
      if (!ok) throw new Error(`${path('refill-state.json')} is corrupt; fix or delete it (deleting resets today's total)`)
      return s as RefillState
    },
    saveRefillState: (state: RefillState) => write('refill-state.json', state),

    /**
     * Runs `fn` while holding a lock file in the keystore, so two processes sharing it (say Claude
     * and Cursor) never refuel at once. A lock older than `staleMs` is assumed abandoned.
     */
    async withLock<T>(name: string, fn: () => Promise<T>, staleMs = 15 * 60_000): Promise<T | 'locked'> {
      ensureDir()
      const lock = path(`${name}.lock`)
      const take = () => {
        try {
          writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }), { mode: 0o600, flag: 'wx' })
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          return false
        }
      }
      if (!take()) {
        let stale = false
        try {
          stale = Date.now() - lstatSync(lock).mtimeMs > staleMs
        } catch {}
        if (!stale) return 'locked'
        try {
          unlinkSync(lock)
        } catch {}
        if (!take()) return 'locked'
      }
      try {
        return await fn()
      } finally {
        try {
          unlinkSync(lock)
        } catch {}
      }
    },
  }
}

export type Keystore = ReturnType<typeof keystore>
