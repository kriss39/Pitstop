import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keystore } from '../src/node.js'

// Red-team suite for the local keystore. Each test asserts the SECURE behaviour.
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `pitstop-ks-${p}-`))
const saved = process.env.PITSTOP_AGENT_KEY
afterEach(() => { if (saved === undefined) delete process.env.PITSTOP_AGENT_KEY; else process.env.PITSTOP_AGENT_KEY = saved })

describe('ATTACK K: keystore', () => {
  it('ATTACK K30: keys are written 0600 and the dir is created 0700', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = join(tmp('a'), 'nested', 'ks')
    const ks = keystore(dir)
    ks.createAccessKey(); ks.createHomeWallet()
    expect(statSync(ks.accessKeyFile).mode & 0o777).toBe(0o600)
    expect(statSync(ks.homeWalletFile).mode & 0o777).toBe(0o600)
    expect(statSync(dir).mode & 0o077).toBe(0)
  })

  it('ATTACK K31: a planted dangling symlink at agent-key.json is not followed (key would be written to attacker path)', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = tmp('b'); const target = join(tmp('victim'), 'stolen.json')
    symlinkSync(target, join(dir, 'agent-key.json'))
    const ks = keystore(dir)
    try { ks.createAccessKey() } catch { /* refusing is fine */ }
    expect(existsSync(target)).toBe(false)
  })

  it('ATTACK K32: same for home-wallet.json symlink', () => {
    const dir = tmp('c'); const target = join(tmp('victim2'), 'stolen.json')
    symlinkSync(target, join(dir, 'home-wallet.json'))
    try { keystore(dir).createHomeWallet() } catch { /* ok */ }
    expect(existsSync(target)).toBe(false)
  })

  it('ATTACK K33: createAccessKey never overwrites an existing key file (even if it appears after the exists-check)', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = tmp('d')
    const ks = keystore(dir)
    const first = ks.createAccessKey()
    // Simulate the race: another process created the file between existsSync and write by
    // making existsSync lie is not possible, so check the write itself is exclusive via a pre-existing 0400 file.
    chmodSync(ks.accessKeyFile, 0o400)
    let threw = false
    try { ks.createAccessKey() } catch { threw = true }
    expect(threw).toBe(true)
    expect(JSON.parse(readFileSync(ks.accessKeyFile, 'utf8')).address).toBe(first.address)
  })

  it('ATTACK K34: an own key file readable by group/other is tightened to 600 on load', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = tmp('e')
    const ks = keystore(dir)
    ks.createAccessKey()
    chmodSync(ks.accessKeyFile, 0o644)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ks.loadAccessKey()
    expect(lstatSync(ks.accessKeyFile).mode & 0o777).toBe(0o600)
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/mode 600/))
    err.mockRestore()
  })

  it('ATTACK K35: a key file that is a symlink is refused on load', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = tmp('f'); const other = tmp('g')
    const real = keystore(other); real.createAccessKey()
    symlinkSync(real.accessKeyFile, join(dir, 'agent-key.json'))
    expect(lstatSync(join(dir, 'agent-key.json')).isSymbolicLink()).toBe(true)
    expect(() => keystore(dir).loadAccessKey()).toThrow()
  })

  it('ATTACK K36: agent-key.json whose address does not match its private key is rejected', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = tmp('h'); mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-key.json'), JSON.stringify({ privateKey: `0x${'11'.repeat(32)}`, address: '0x' + '22'.repeat(20) }), { mode: 0o600 })
    expect(() => keystore(dir).loadAccessKey()).toThrow()
  })

  it('ATTACK K37: PITSTOP_AGENT_KEY errors never contain the supplied value', () => {
    process.env.PITSTOP_AGENT_KEY = '0xTOPSECRET' + 'f'.repeat(20)
    try { keystore(tmp('i')).loadAccessKey() } catch (e) { expect(String(e)).not.toContain('TOPSECRET'); return }
    throw new Error('accepted an invalid key')
  })

  it('ATTACK K38: refill-state.json with garbage values is rejected (negative / non-numeric sentToday)', () => {
    const dir = tmp('j')
    writeFileSync(join(dir, 'refill-state.json'), JSON.stringify({ day: '2026-01-01', sentToday: '-5000000' }))
    expect(() => keystore(dir).loadRefillState()).toThrow()
  })

  it('ATTACK K39: rotating twice in the same millisecond never destroys a retired key', () => {
    delete process.env.PITSTOP_AGENT_KEY
    const dir = tmp('k'); const ks = keystore(dir)
    const k0 = ks.createAccessKey()
    const realNow = Date.now; Date.now = () => 1700000000000
    try { ks.createAccessKey({ rotate: true }); ks.createAccessKey({ rotate: true }) } finally { Date.now = realNow }
    const retired = join(dir, 'agent-key.retired-1700000000000.json')
    // The very first key must still exist somewhere on disk.
    const all = require('node:fs').readdirSync(dir).filter((f: string) => f.includes('retired')).map((f: string) => readFileSync(join(dir, f), 'utf8')).join('')
    expect(all).toContain(k0.address)
    void retired
  })
})
