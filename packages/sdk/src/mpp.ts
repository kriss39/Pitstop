export const MPP_SERVICES_URL = 'https://mpp.dev/api/services'

export type MppService = {
  id: string
  name: string
  description: string
  /** The service's https URL, or '' if the directory gave none (or a non-https one). */
  url: string
  categories: string[]
  /** Payment methods the service accepts, e.g. ["tempo", "evm"]. */
  methods: string[]
  status?: string
}

type RawService = {
  id?: unknown
  name?: unknown
  description?: unknown
  serviceUrl?: unknown
  url?: unknown
  categories?: unknown
  tags?: unknown
  methods?: unknown
  status?: unknown
}

/** Most entries listMppServices returns in one call. */
export const MAX_MPP_SERVICES = 1000

// Control, zero-width, line/paragraph separator and bidi-override characters.
const UNSAFE_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]+', 'g')

// Directory entries are written by third parties and end up in agents' prompts: keep them short,
// single-line and free of control characters, and only pass https URLs on.
const clean = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(UNSAFE_CHARS, ' ')
        .trim()
        .slice(0, max)
    : ''
const strings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20).map((x) => clean(x, max)) : []
function httpsUrl(v: unknown): string {
  if (typeof v !== 'string' || v.length > 2048) return ''
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}

/** Lists MPP services from the public directory, optionally filtered by a search term. */
export async function listMppServices(
  params: { query?: string; limit?: number; url?: string; timeoutMs?: number } = {},
): Promise<MppService[]> {
  const limit = Math.min(Math.max(Math.floor(Number(params.limit ?? 20)) || 1, 1), MAX_MPP_SERVICES)
  const res = await fetch(params.url ?? MPP_SERVICES_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(params.timeoutMs ?? 20_000),
  })
  if (!res.ok) throw new Error(`MPP directory request failed (${res.status})`)
  const body = (await res.json()) as { services?: unknown }
  const raw: RawService[] = Array.isArray(body?.services)
    ? body.services.filter((s): s is RawService => !!s && typeof s === 'object' && !Array.isArray(s))
    : []
  const q = params.query?.toLowerCase().trim()
  return raw
    .map((s) => ({
      id: clean(s.id, 100),
      name: clean(s.name, 100),
      description: clean(s.description, 500),
      url: httpsUrl(s.serviceUrl) || httpsUrl(s.url),
      categories: strings(s.categories, 50),
      tags: strings(s.tags, 50),
      methods:
        s.methods && typeof s.methods === 'object' && !Array.isArray(s.methods)
          ? Object.keys(s.methods).slice(0, 20).map((m) => clean(m, 30))
          : [],
      status: typeof s.status === 'string' ? clean(s.status, 30) : undefined,
    }))
    .filter((s) => s.id || s.name)
    .filter((s) => !q || [s.id, s.name, s.description, ...s.tags, ...s.categories].join(' ').toLowerCase().includes(q))
    .slice(0, limit)
    .map(({ tags: _tags, ...s }) => s)
}
