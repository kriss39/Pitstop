import { getBalance, totalUsd, TEMPO_CHAIN_ID } from '@pitstop/sdk'
import { Hono } from 'hono'
import { isAddress } from 'viem'

type Bindings = {
  LIFI_API_KEY?: string
  TELEGRAM_BOT_TOKEN?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/health', (c) => c.json({ ok: true, chainId: TEMPO_CHAIN_ID }))

app.get('/balance/:address', async (c) => {
  const address = c.req.param('address')
  if (!isAddress(address)) return c.json({ error: 'invalid address' }, 400)
  const balances = await getBalance({ address })
  return c.json({
    address,
    totalRaw: totalUsd(balances).toString(),
    balances: balances.map(({ symbol, token, raw, formatted }) => ({
      symbol,
      token,
      raw: raw.toString(),
      amount: formatted,
    })),
  })
})

export default app
