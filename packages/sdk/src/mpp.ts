export const MPP_SERVICES_URL = 'https://mpp.dev/api/services'

export type MppService = {
  id: string
  name: string
  description: string
  url: string
  categories: string[]
  /** Payment methods the service accepts, e.g. ["tempo", "evm"]. */
  methods: string[]
  status?: string
}

type RawService = {
  id: string
  name: string
  description?: string
  serviceUrl?: string
  url?: string
  categories?: string[]
  tags?: string[]
  methods?: Record<string, unknown>
  status?: string
}

/** Lists MPP services from the public directory, optionally filtered by a search term. */
export async function listMppServices(params: { query?: string; limit?: number; url?: string } = {}): Promise<MppService[]> {
  const res = await fetch(params.url ?? MPP_SERVICES_URL, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`MPP directory request failed (${res.status})`)
  const body = (await res.json()) as { services?: RawService[] }
  const q = params.query?.toLowerCase().trim()
  return (body.services ?? [])
    .filter((s) => !q || [s.id, s.name, s.description, ...(s.tags ?? []), ...(s.categories ?? [])].join(' ').toLowerCase().includes(q))
    .slice(0, params.limit ?? 20)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      url: s.serviceUrl ?? s.url ?? '',
      categories: s.categories ?? [],
      methods: Object.keys(s.methods ?? {}),
      status: s.status,
    }))
}
