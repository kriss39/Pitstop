import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Runs the built CLI (pnpm build first). Only offline commands: no RPC or LI.FI calls.
const bin = join(import.meta.dirname, '..', 'dist', 'index.js')
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }

function run(args: string[], env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'pitstop-cli-'))
  const cwd = mkdtempSync(join(tmpdir(), 'pitstop-cwd-'))
  const out = execFileSync(process.execPath, [bin, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? '', HOME: home, ...env },
    encoding: 'utf8',
  })
  return { out, home }
}

describe('pitstop-mcp CLI', () => {
  it('prints the package version', () => {
    expect(run(['version']).out.trim()).toBe(pkg.version)
  })

  it('creates the access key in ~/.pitstop with mode 600 and prints only public data', () => {
    const { out, home } = run(['key'])
    const file = join(home, '.pitstop', 'agent-key.json')
    const key = JSON.parse(readFileSync(file, 'utf8')) as { address: string; privateKey: string }
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(out).toContain(`/guard?key=${key.address}`)
    expect(out).not.toContain(key.privateKey.slice(2))
  })

  it('reports a PITSTOP_AGENT_KEY instead of writing a file', () => {
    const { out } = run(['key'], { PITSTOP_AGENT_KEY: `0x${'11'.repeat(32)}` })
    expect(out).toContain('Using the key in PITSTOP_AGENT_KEY')
    expect(out).not.toContain('11'.repeat(32))
  })

  it('honours PITSTOP_DIR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pitstop-dir-'))
    run(['key'], { PITSTOP_DIR: dir })
    expect(statSync(join(dir, 'agent-key.json')).isFile()).toBe(true)
  })
})
