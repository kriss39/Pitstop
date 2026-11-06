// Preloaded into the MCP server child (node --import). Replaces fetch: nothing leaves the machine.
import { appendFileSync, readFileSync, existsSync } from 'node:fs'
const log = (o) => process.env.MOCK_LOG && appendFileSync(process.env.MOCK_LOG, JSON.stringify(o) + '\n')
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const file = (name) => (process.env[name] && existsSync(process.env[name]) ? JSON.parse(readFileSync(process.env[name], 'utf8')) : undefined)
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.includes('li.quest')) {
    log({ kind: 'lifi', url })
    const b = file('MOCK_LIFI_FILE')
    return b ? json(b.body, b.status ?? 200) : json({ message: 'no mock' }, 500)
  }
  if (url.includes('mpp.dev')) {
    log({ kind: 'mpp', url })
    return json(file('MOCK_MPP_FILE') ?? { services: [] })
  }
  if (init?.body && String(init.body).includes('jsonrpc')) {
    const one = (r) => {
      log({ kind: 'rpc', url, method: r.method })
      const result = r.method === 'eth_chainId' ? '0x1079' : r.method === 'eth_call' ? '0x' + '0'.repeat(64) : '0x0'
      return { jsonrpc: '2.0', id: r.id, result }
    }
    const p = JSON.parse(String(init.body))
    return json(Array.isArray(p) ? p.map(one) : one(p))
  }
  log({ kind: 'blocked', url })
  throw new Error('network blocked in test: ' + url)
}
