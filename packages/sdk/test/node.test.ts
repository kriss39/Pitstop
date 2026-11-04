import { mkdirSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultKeystoreDir, keystore } from '../src/node.js'

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('keystore', () => {
  it('creates its folder with mode 700 and key files with mode 600', () => {
    const dir = join(tmp('pitstop-ks-'), '.pitstop')
    const store = keystore(dir)
    store.createAccessKey()
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    expect(statSync(store.accessKeyFile).mode & 0o777).toBe(0o600)
    expect(store.loadAccessKey()?.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

describe('defaultKeystoreDir', () => {
  it('uses PITSTOP_DIR when set', () => {
    vi.stubEnv('PITSTOP_DIR', '/somewhere/keys')
    expect(defaultKeystoreDir()).toBe('/somewhere/keys')
  })

  it('prefers an existing ./.pitstop, otherwise ~/.pitstop', () => {
    vi.stubEnv('PITSTOP_DIR', '')
    const home = tmp('pitstop-home-')
    vi.stubEnv('HOME', home)
    const cwd = tmp('pitstop-cwd-')
    vi.spyOn(process, 'cwd').mockReturnValue(cwd)
    expect(defaultKeystoreDir()).toBe(join(home, '.pitstop'))
    mkdirSync(join(cwd, '.pitstop'))
    expect(defaultKeystoreDir()).toBe(join(cwd, '.pitstop'))
  })
})
