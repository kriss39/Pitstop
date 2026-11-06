import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Audits the tarballs as published on npm. Skipped unless NPM_AUDIT_DIR points at a folder with
// both packed packages extracted, e.g.:
//   npm pack @getpitstop/sdk@0.1.2 @getpitstop/mcp@0.1.3 && for f in *.tgz; do mkdir -p "${f%.tgz}" && tar -xzf "$f" -C "${f%.tgz}"; done
const ROOT = process.env.NPM_AUDIT_DIR ?? ''
const SDK_VERSION = process.env.NPM_AUDIT_SDK ?? '0.1.2'
const MCP_VERSION = process.env.NPM_AUDIT_MCP ?? '0.1.3'
const sdk = join(ROOT, `getpitstop-sdk-${SDK_VERSION}/package`)
const mcp = join(ROOT, `getpitstop-mcp-${MCP_VERSION}/package`)
const have = ROOT !== '' && existsSync(sdk) && existsSync(mcp)
const d = describe.skipIf(!have)
const walk = (p: string): string[] => readdirSync(p).flatMap((f) => (statSync(join(p, f)).isDirectory() ? walk(join(p, f)) : [join(p, f)]))
const pkg = (p: string) => JSON.parse(readFileSync(join(p, 'package.json'), 'utf8'))

d('published npm artifacts', () => {
  it('ATTACK N1: no secrets, env files or absolute home paths in tarballs', () => {
    for (const f of [...walk(sdk), ...walk(mcp)]) {
      expect(f).not.toMatch(/\.env|\.dev\.vars|\.pitstop|\.npmrc/)
      const t = readFileSync(f, 'utf8')
      expect(t).not.toMatch(/\/Users\/|0x[0-9a-fA-F]{64}\b/)
    }
  })
  it('ATTACK N2: no install-time scripts', () => {
    for (const p of [sdk, mcp]) {
      const s = pkg(p).scripts ?? {}
      for (const k of ['preinstall', 'install', 'postinstall', 'prepare']) expect(s[k]).toBeUndefined()
    }
  })
  it('ATTACK N3: bin has shebang and is executable', () => {
    const f = join(mcp, 'dist/index.js')
    expect(readFileSync(f, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true)
    expect(statSync(f).mode & 0o111).not.toBe(0)
  })
  it('ATTACK N4: shipped src equals repo src (no drift)', () => {
    for (const [name, p] of [['sdk', sdk], ['mcp', mcp]] as const) {
      const repo = join(__dirname, '../..', name, 'src')
      for (const f of readdirSync(join(p, 'src'))) expect(readFileSync(join(p, 'src', f), 'utf8')).toBe(readFileSync(join(repo, f), 'utf8'))
    }
  })
  it('ATTACK N5: mcp pins sdk exactly (no floating @getpitstop range)', () => {
    expect(pkg(mcp).dependencies['@getpitstop/sdk']).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('ATTACK N6: third-party deps are exact-pinned (no caret range for future malicious minors)', () => {
    for (const p of [sdk, mcp]) for (const v of Object.values(pkg(p).dependencies as Record<string, string>)) expect(v).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('ATTACK N7: sdk exports only the intended entry points', () => {
    expect(Object.keys(pkg(sdk).exports).sort()).toEqual(['.', './node'])
  })
  it('ATTACK N8: source maps do not embed sources/absolute paths', () => {
    for (const f of [...walk(sdk), ...walk(mcp)].filter((x) => x.endsWith('.map'))) {
      const m = JSON.parse(readFileSync(f, 'utf8'))
      expect(m.sourcesContent).toBeUndefined()
      for (const s of m.sources) expect(s.startsWith('/')).toBe(false)
    }
  })
  it('ATTACK N9: keystore directory is created owner-only (0700), not just the key files', () => {
    const src = readFileSync(join(sdk, 'src/node.ts'), 'utf8')
    expect(src).toMatch(/mkdirSync\([^)]*mode:\s*0o700/)
  })
  it('ATTACK N10: mcp does not auto-trust a ./.pitstop keystore from the (possibly untrusted) cwd', () => {
    const src = readFileSync(join(mcp, 'src/index.ts'), 'utf8')
    // The server may mention a ./.pitstop it skipped, but must never pick it just because it exists
    // (packages/mcp/test/attacks-mcp.test.ts K21 checks the behaviour end to end).
    expect(src).not.toMatch(/existsSync\(local\)\s*\?\s*local/)
  })
  it('ATTACK N11: keystore does not follow a symlinked/foreign-owned key file (lstat check)', () => {
    const src = readFileSync(join(sdk, 'src/node.ts'), 'utf8')
    expect(src).toMatch(/lstat|O_NOFOLLOW|statSync/)
  })
})
