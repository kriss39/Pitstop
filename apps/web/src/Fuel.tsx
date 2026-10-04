import {
  executeFuel,
  fuelQuote,
  NATIVE_TOKEN,
  PITSTOP_FEE,
  SOLANA_NATIVE_TOKEN,
  SOLANA_CHAIN_ID,
  SOURCE_TOKENS,
  waitForFuel,
  FUEL_TOKENS,
  type FuelQuote,
  type FuelTokenSymbol,
} from '@pitstop/sdk'
import { useEffect, useMemo, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { arbitrum, arc, avalanche, base, mainnet, optimism, polygon, type Chain } from 'viem/chains'
import { PanelHead, short, TokenPicker, usd, useAgent } from './ui'
import { openConnect, switchChain, useWallet } from './wallet'

/** Per-transfer cap on the web app, in dollars. */
const MAX_USD = 5
/** Route cost (value lost between send and arrival) that triggers a warning, and that blocks the transfer. */
const COST_WARN = 0.03
const COST_BLOCK = 0.1
const LIFI_PROXY = '/lifi/v1'

type Source = 'base' | 'arbitrum' | 'optimism' | 'ethereum' | 'polygon' | 'avalanche' | 'arc' | 'solana'
type SourceInfo = {
  label: string
  chainId: number
  usdc: string
  ttlMs: number
  chain?: Chain
  explorer?: string
  /** The chain's gas token, if it isn't USDC itself (Arc's gas token is USDC). */
  native?: { symbol: string; decimals: number }
}

const ETH = { symbol: 'ETH', decimals: 18 }
// Every route below was quoted to Tempo through LI.FI on 2026-10-04.
const SOURCES: Record<Source, SourceInfo> = {
  base: { label: 'Base', chainId: base.id, usdc: SOURCE_TOKENS.base.USDC, ttlMs: 60_000, chain: base, explorer: 'https://basescan.org', native: ETH },
  arbitrum: { label: 'Arbitrum', chainId: arbitrum.id, usdc: SOURCE_TOKENS.arbitrum.USDC, ttlMs: 60_000, chain: arbitrum, explorer: 'https://arbiscan.io', native: ETH },
  optimism: { label: 'Optimism', chainId: optimism.id, usdc: SOURCE_TOKENS.optimism.USDC, ttlMs: 60_000, chain: optimism, explorer: 'https://optimistic.etherscan.io', native: ETH },
  ethereum: { label: 'Ethereum', chainId: mainnet.id, usdc: SOURCE_TOKENS.ethereum.USDC, ttlMs: 60_000, chain: mainnet, explorer: 'https://etherscan.io', native: ETH },
  polygon: { label: 'Polygon', chainId: polygon.id, usdc: SOURCE_TOKENS.polygon.USDC, ttlMs: 60_000, chain: polygon, explorer: 'https://polygonscan.com', native: { symbol: 'POL', decimals: 18 } },
  avalanche: { label: 'Avalanche', chainId: avalanche.id, usdc: SOURCE_TOKENS.avalanche.USDC, ttlMs: 60_000, chain: avalanche, explorer: 'https://snowtrace.io', native: { symbol: 'AVAX', decimals: 18 } },
  arc: { label: 'Arc', chainId: arc.id, usdc: SOURCE_TOKENS.arc.USDC, ttlMs: 60_000, chain: arc, explorer: 'https://explorer.arc.io' },
  // A Solana transaction carries a recent blockhash that expires in about a minute.
  solana: { label: 'Solana', chainId: SOLANA_CHAIN_ID, usdc: SOURCE_TOKENS.solana.USDC, ttlMs: 25_000, native: { symbol: 'SOL', decimals: 9 } },
}
const SOURCE_KEYS = Object.keys(SOURCES) as Source[]

const clients = new Map<number, PublicClient>()
/** Read-only client for an EVM source chain, created on first use. */
function clientFor(chain: Chain): PublicClient {
  let c = clients.get(chain.id)
  if (!c) {
    c = createPublicClient({ chain, transport: http() }) as PublicClient
    clients.set(chain.id, c)
  }
  return c
}

type Step = { label: string; state: 'todo' | 'active' | 'done' | 'error'; link?: { href: string; text: string }; t?: number }

const params = new URLSearchParams(window.location.search)
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

export function Fuel() {
  const w = useWallet()
  const [agent, setAgent] = useState(params.get('to') ?? __DEFAULT_AGENT__)
  const [amount, setAmount] = useState('2')
  const [source, setSource] = useState<Source>(() => {
    const f = params.get('from') as Source | null
    return f && f in SOURCES ? f : 'base'
  })
  const [receive, setReceive] = useState<FuelTokenSymbol>(() => {
    const t = params.get('token')
    return (FUEL_TOKENS as readonly string[]).includes(t ?? '') ? (t as FuelTokenSymbol) : 'USDCe'
  })
  const [payNative, setPayNative] = useState(params.get('pay') === 'native')
  const [srcBalance, setSrcBalance] = useState<bigint>()
  const [quote, setQuote] = useState<FuelQuote>()
  const [quotedAt, setQuotedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [steps, setSteps] = useState<Step[]>([])
  const [finished, setFinished] = useState<number>()

  const src = SOURCES[source]
  const useNative = payNative && !!src.native
  // What the user pays with: the chain's USDC, or its gas token.
  const pay = useNative
    ? { symbol: src.native!.symbol, decimals: src.native!.decimals, address: src.chain ? NATIVE_TOKEN : SOLANA_NATIVE_TOKEN }
    : { symbol: 'USDC', decimals: 6, address: src.usdc }
  const agentOk = isAddress(agent)
  const target = useAgent(agentOk ? agent : undefined)
  const amountNum = Number(amount)
  // USDC is capped before quoting; gas tokens are checked against MAX_USD once the quote prices them.
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && (useNative || amountNum <= MAX_USD)
  const fromAmount = useMemo(() => (amountOk ? parseUnits(amount, pay.decimals) : 0n), [amount, amountOk, pay.decimals])
  const isEvm = !!src.chain
  const sender = isEvm ? w.evm?.account : w.solana?.address
  const onChain = isEvm && w.evm?.chainId === src.chainId
  const ready = isEvm ? !!w.evm && onChain : !!w.solana
  const enoughFunds = !isEvm || (srcBalance != null && srcBalance >= fromAmount)
  const routeCost = quote?.fromAmountUSD && quote.toAmountUSD ? 1 - quote.toAmountUSD / quote.fromAmountUSD : undefined
  const overCap = quote?.fromAmountUSD != null && quote.fromAmountUSD > MAX_USD * 1.01
  const tooCostly = routeCost != null && routeCost > COST_BLOCK

  useEffect(() => {
    setSrcBalance(undefined)
    if (!w.evm || !src.chain) return
    const c = clientFor(src.chain)
    const read =
      useNative
        ? c.getBalance({ address: w.evm.account })
        : c.readContract({ address: src.usdc as Address, abi: erc20Abi, functionName: 'balanceOf', args: [w.evm.account] })
    read.then(setSrcBalance, () => setSrcBalance(undefined))
  }, [w.evm?.account, source, useNative, finished])

  // Picking an EVM source asks the connected wallet to switch to it.
  useEffect(() => {
    if (w.evm && src.chain && w.evm.chainId !== src.chainId) void switchChain(w.evm.wallet.provider, src.chain).catch(() => {})
  }, [source, !!w.evm])

  // A quote is only valid for the inputs it was made for.
  useEffect(() => setQuote(undefined), [agent, amount, source, sender, receive, useNative])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/user rejected|denied|declined/i.test(msg) ? 'You rejected the request in your wallet.' : msg.split('\n')[0])
    } finally {
      setBusy(false)
    }
  }

  const newQuote = async () => {
    const q = await fuelQuote({
      fromChain: src.chainId,
      fromToken: pay.address,
      fromAmount,
      fromAddress: sender!,
      toAddress: agent as Address,
      toToken: receive,
      integrator: __LIFI_INTEGRATOR__,
      fee: PITSTOP_FEE,
      baseUrl: LIFI_PROXY,
    })
    setQuote(q)
    setQuotedAt(Date.now())
    return q
  }

  const fuel = () =>
    run(async () => {
      setFinished(undefined)
      const q = Date.now() - quotedAt > src.ttlMs ? await newQuote() : quote!
      // Re-check the (possibly refreshed) quote before anything is signed.
      if (q.fromAmountUSD != null && q.fromAmountUSD > MAX_USD * 1.01) throw new Error(`Over the $${MAX_USD} per-transfer cap.`)
      if (q.fromAmountUSD && q.toAmountUSD && 1 - q.toAmountUSD / q.fromAmountUSD > COST_BLOCK)
        throw new Error('This route got too expensive. Get a new quote or try another chain.')
      const tx = q.transactionRequest
      const t0 = Date.now()
      const list: Step[] =
        tx.kind === 'evm'
          ? [
              { label: 'Approve exactly this amount (if needed)', state: 'active' },
              { label: `Send on ${src.label}`, state: 'todo' },
              { label: `Bridge to Tempo via ${q.tool}`, state: 'todo' },
              { label: 'Fuel arrives in the agent wallet', state: 'todo' },
            ]
          : [
              { label: 'Sign and send on Solana', state: 'active' },
              { label: `Bridge to Tempo via ${q.tool}`, state: 'todo' },
              { label: 'Fuel arrives in the agent wallet', state: 'todo' },
            ]
      const update = (i: number, patch: Partial<Step>) => {
        list[i] = { ...list[i]!, ...patch, ...(patch.state === 'done' ? { t: Date.now() - t0 } : {}) }
        setSteps([...list])
      }
      setSteps([...list])

      let hash: string
      if (tx.kind === 'evm') {
        const wallet = createWalletClient({ account: w.evm!.account, chain: src.chain!, transport: custom(w.evm!.wallet.provider) })
        const explorer = (h: string) => ({ href: `${src.explorer}/tx/${h}`, text: `${src.label} explorer ↗` })
        hash = await executeFuel({
          quote: q,
          wallet,
          client: clientFor(src.chain!),
          onStep: (s) => {
            if (s.step === 'approve') update(0, { link: explorer(s.hash) })
            if (s.step === 'approved') update(0, { state: 'done' })
            if (s.step === 'send') {
              if (list[0]!.state === 'active') update(0, { state: 'done', label: 'Approval already in place' })
              update(1, { state: 'active', link: explorer(s.hash) })
            }
            if (s.step === 'sent') update(1, { state: 'done' })
          },
        })
      } else {
        // The wallet (Wallet Standard) signs and sends LI.FI's serialized transaction as-is.
        const signature = await w.sendSolanaTransaction(fromBase64(tx.data))
        hash = signature
        update(0, { state: 'done', link: { href: `https://solscan.io/tx/${signature}`, text: 'Solscan ↗' } })
      }

      const bridge = list.length - 2
      update(bridge, { state: 'active', link: { href: `https://scan.li.fi/tx/${hash}`, text: 'LI.FI Scan ↗' } })
      const status = await waitForFuel({ txHash: hash, fromChain: src.chainId, baseUrl: LIFI_PROXY, intervalMs: 1500 })
      if (status.status !== 'DONE') {
        update(bridge, { state: 'error' })
        throw new Error(`Bridge ${status.status.toLowerCase()}: ${status.substatusMessage ?? 'see LI.FI Scan'}`)
      }
      update(bridge, { state: 'done' })
      update(bridge + 1, {
        state: 'done',
        label: `Arrived: ${status.receivedAmount != null ? usd(status.receivedAmount, 4) : '?'} ${receive}`,
        link: status.receivingTxHash ? { href: `https://explore.tempo.xyz/tx/${status.receivingTxHash}`, text: 'Tempo ↗' } : undefined,
      })
      setFinished(Date.now() - t0)
      await target.refresh()
    })

  return (
    <main className="page">
      <header className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="eyebrow">01 · Fuel</p>
        <h1 className="title">Refuel an agent on Tempo</h1>
        <p className="lede">
          Send USDC or the chain’s own token from any of eight chains. The agent receives USDC.e, PathUSD, USDT0 or OUSD on Tempo in seconds. You sign in your own wallet; Pitstop never holds funds.
        </p>
      </header>

      <section className="panel">
        <PanelHead num="A" title="Agent" />
        <label className="field">
          <span>Agent wallet on Tempo</span>
          <input id="agent" value={agent} onChange={(e) => setAgent(e.target.value.trim())} spellCheck={false} placeholder="0x…" />
          {agentOk ? (
            <small className="muted">Tempo balance ${target.balance != null ? usd(target.balance) : '…'} · {short(agent)}</small>
          ) : agent ? (
            <small className="note bad">That isn’t a valid 0x address. Check it before sending; fuel can’t be recalled.</small>
          ) : (
            <small className="muted">Paste the agent’s wallet address. Create one on the Guard page if you don’t have it yet.</small>
          )}
        </label>
      </section>

      <section className="panel">
        <PanelHead num="B" title="Pay from" />
        <div className="seg chains" role="radiogroup" aria-label="Source chain">
          {SOURCE_KEYS.map((key) => (
            <button key={key} role="radio" aria-checked={source === key} onClick={() => setSource(key)} disabled={busy}>
              {SOURCES[key].label}
            </button>
          ))}
        </div>
        {src.native && (
          <div className="field">
            <span>Pay with</span>
            <div className="seg" role="radiogroup" aria-label="Token to pay with">
              <button role="radio" aria-checked={!useNative} onClick={() => setPayNative(false)} disabled={busy}>USDC</button>
              <button role="radio" aria-checked={useNative} onClick={() => setPayNative(true)} disabled={busy}>{src.native.symbol}</button>
            </div>
            {useNative && <small className="muted">LI.FI swaps {src.native.symbol} into the stablecoin the agent receives, on the way to Tempo.</small>}
          </div>
        )}
        <label className="field">
          <span>Amount ({pay.symbol}{useNative ? `, worth up to $${MAX_USD}` : `, up to ${MAX_USD}`} per transfer)</span>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
          {!amountOk && amount !== '' && <small className="note bad">Enter an amount{useNative ? ' above 0' : ` between 0 and ${MAX_USD}`}.</small>}
        </label>
        <div className="field">
          <span>Agent receives on Tempo</span>
          <TokenPicker value={receive} onChange={setReceive} disabled={busy} label="Token received on Tempo" />
          <small className="muted">
            {receive === 'USDCe' ? 'USDC.e: the default for Pitstop guards and most MPP services.' : receive === 'OUSD' ? 'OpenUSD: the token the MPP docs recommend.' : `Use ${receive} if the services your agent pays charge in it.`}{' '}
            A guarded key only spends the token it was authorized for.
          </small>
        </div>
        <div className="row">
          {!sender ? (
            <button className="primary" onClick={() => openConnect(isEvm ? 'base' : 'solana')}>
              Connect {isEvm ? 'an EVM wallet' : 'a Solana wallet'}
            </button>
          ) : isEvm && !onChain ? (
            <button className="primary" onClick={() => run(() => switchChain(w.evm!.wallet.provider, src.chain!))} disabled={busy}>
              Switch to {src.label}
            </button>
          ) : (
            <button className="primary" onClick={() => run(newQuote)} disabled={busy || !agentOk || !amountOk || !ready}>
              {quote ? 'Refresh quote' : 'Get quote'}
            </button>
          )}
          {sender && (
            <span className="small muted">
              From {short(sender)} on {src.label}
              {isEvm && srcBalance != null && ` · ${Number(formatUnits(srcBalance, pay.decimals)).toFixed(pay.decimals > 6 ? 5 : 2)} ${pay.symbol}`}
            </span>
          )}
        </div>
        {isEvm && ready && srcBalance != null && !enoughFunds && (
          <p className="note bad">This wallet has less {pay.symbol} on {src.label} than the amount.</p>
        )}
      </section>

      {quote && (
        <section className="panel quote">
          <PanelHead num="C" title="Quote" />
          <div>
            <p className="eyebrow">Agent receives</p>
            <p className="big">{usd(quote.toAmount, 4)} {quote.toToken.symbol}</p>
          </div>
          <dl>
            <div>
              <dt>You send</dt>
              <dd>
                {Number(formatUnits(quote.fromAmount, pay.decimals)).toFixed(pay.decimals > 6 ? 5 : 2)} {pay.symbol} · {src.label}
                {quote.fromAmountUSD != null && <span className="muted"> (${quote.fromAmountUSD.toFixed(2)})</span>}
              </dd>
            </div>
            <div><dt>Arrives in</dt><dd>~{quote.durationSeconds} s via {quote.tool}</dd></div>
            <div><dt>Minimum</dt><dd>{usd(quote.toAmountMin, 4)} {quote.toToken.symbol}</dd></div>
            <div><dt>Route cost</dt><dd>{routeCost != null ? `${(routeCost * 100).toFixed(1)}% of value` : '–'}</dd></div>
            <div><dt>Fees + gas</dt><dd>${(quote.feesUsd + quote.gasUsd).toFixed(4)} · incl. {PITSTOP_FEE * 100}% Pitstop</dd></div>
            <div><dt>To</dt><dd className="mono">{short(quote.toAddress)} · Tempo</dd></div>
            <div><dt>Contract</dt><dd className="mono">LI.FI Diamond (checked)</dd></div>
          </dl>
          {overCap && <p className="note bad">That’s worth ${quote.fromAmountUSD!.toFixed(2)}, over the ${MAX_USD} per-transfer cap. Lower the amount.</p>}
          {tooCostly && (
            <p className="note bad">
              This route would lose {(routeCost! * 100).toFixed(0)}% of the value, so Pitstop won’t send it. Try USDC, another chain, or a larger amount.
            </p>
          )}
          {!tooCostly && routeCost != null && routeCost > COST_WARN && (
            <p className="note warn">This route costs {(routeCost * 100).toFixed(1)}% of the value. USDC from another chain is usually cheaper.</p>
          )}
          <div className="row">
            <button className="primary" onClick={fuel} disabled={busy || !enoughFunds || overCap || tooCostly}>
              Fuel agent with {amount} {pay.symbol}
            </button>
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section className="panel">
          <PanelHead num="D" title="Pit lane" />
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.label} className={s.state}>
                <span className="dot" aria-hidden />
                <span>{s.label}</span>
                {s.link && <a href={s.link.href} target="_blank" rel="noreferrer">{s.link.text}</a>}
                {s.t != null && <span className="t">{secs(s.t)}</span>}
              </li>
            ))}
          </ol>
          {finished != null && (
            <>
              <div className="chequer" aria-hidden />
              <p style={{ font: '800 28px/1 var(--display)', textTransform: 'uppercase' }}>Fuelled in {secs(finished)}</p>
            </>
          )}
        </section>
      )}

      {finished != null && (
        <p className="small muted">
          Watch this agent’s spending on the <a href={`/dashboard?wallet=${agent}`}>dashboard</a>.
        </p>
      )}
      {error && <p className="note bad" role="alert">{error}</p>}
    </main>
  )
}
