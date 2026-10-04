/** Paid MPP services the demo agent uses. Each says how it asks for an MPP (Tempo) challenge. */
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Codex: onchain token data over GraphQL, $0.001 per request. */
export async function codexPrice(fetch: Fetch, token: { address: string; networkId: number }): Promise<number | undefined> {
  const res = await fetch('https://graph.codex.io/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-codex-payment': 'mpp' },
    body: JSON.stringify({
      query: `{ getTokenPrices(inputs: [{ address: "${token.address}", networkId: ${token.networkId} }]) { priceUsd } }`,
    }),
  })
  if (!res.ok) throw new Error(`Codex ${res.status}`)
  const body = (await res.json()) as { data?: { getTokenPrices?: { priceUsd?: number }[] } }
  return body.data?.getTokenPrices?.[0]?.priceUsd
}

/** Nansen: token intelligence, $0.01 per request. */
export async function nansenTokenInfo(fetch: Fetch, token: { chain: string; address: string }): Promise<number | undefined> {
  const res = await fetch('https://api.nansen.ai/api/v1/tgm/token-information', {
    method: 'POST',
    // Ask for the MPP (Tempo) challenge; without it Nansen offers only x402 on Base.
    headers: { 'content-type': 'application/json', authorization: 'Payment' },
    body: JSON.stringify({ chain: token.chain, token_address: token.address, timeframe: '1d' }),
  })
  if (!res.ok) throw new Error(`Nansen ${res.status}`)
  const body = (await res.json()) as { data?: { token_details?: { market_cap_usd?: number } } }
  return body.data?.token_details?.market_cap_usd
}
