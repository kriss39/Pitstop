import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import { tempo } from 'viem/chains'

export const TEMPO_CHAIN_ID = tempo.id

/** Public Tempo mainnet RPCs, tried in order. */
export const TEMPO_RPC_URLS = [
  'https://rpc.tempo.xyz',
  'https://tempo-rpc.publicnode.com',
  'https://tempo-mainnet.drpc.org',
] as const

export type TempoClientOptions = {
  /** Override the RPC list. The first URL is tried first. */
  rpcUrls?: readonly string[]
}

export function createTempoClient(options: TempoClientOptions = {}): PublicClient {
  const urls = options.rpcUrls?.length ? options.rpcUrls : TEMPO_RPC_URLS
  return createPublicClient({
    chain: tempo,
    transport: fallback(urls.map((url) => http(url))),
  }) as PublicClient
}

export { tempo }
