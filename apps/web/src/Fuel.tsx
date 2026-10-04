import {
  executeFuel,
  fuelQuote,
  PITSTOP_FEE,
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
  http,
  isAddress,
  parseUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { base } from 'viem/chains'
import { PanelHead, short, TokenPicker, usd, useAgent } from './ui'
import { BASE_CHAIN_ID, openConnect, switchToBase, useWallet } from './wallet'

/** Per-transfer cap on the web app. */
const MAX_USDC = 5
const LIFI_PROXY = '/lifi/v1'

type Source = 'base' | 'solana'
const SOURCES: Record<Source, { label: string; chainId: number; usdc: string; wallet: string; ttlMs: number }> = {
  base: { label: 'Base', chainId: base.id, usdc: SOURCE_TOKENS.base.USDC, wallet: 'Rabby, MetaMask or Phantom', ttlMs: 60_000 },
  // A Solana transaction carries a recent blockhash that expires in about a minute.
  solana: { label: 'Solana', chainId: SOLANA_CHAIN_ID, usdc: SOURCE_TOKENS.solana.USDC, wallet: 'Phantom, MetaMask or another Solana wallet', ttlMs: 25_000 },
}

const baseClient = createPublicClient({ chain: base, transport: http() }) as PublicClient

type Step = { label: string; state: 'todo' | 'active' | 'done' | 'error'; link?: { href: string; text: string }; t?: number }

const params = new URLSearchParams(window.location.search)
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

export function Fuel() {
  const w = useWallet()
  const [agent, setAgent] = useState(params.get('to') ?? __DEFAULT_AGENT__)
  const [amount, setAmount] = useState('2')
  const [source, setSource] = useState<Source>(params.get('from') === 'solana' ? 'solana' : 'base')
  const [receive, setReceive] = useState<FuelTokenSymbol>(() => {
    const t = params.get('token')
    return (FUEL_TOKENS as readonly string[]).includes(t ?? '') ? (t as FuelTokenSymbol) : 'USDCe'
  })
  const [baseUsdc, setBaseUsdc] = useState<bigint>()
  const [quote, setQuote] = useState<FuelQuote>()
  const [quotedAt, setQuotedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [steps, setSteps] = useState<Step[]>([])
  const [finished, setFinished] = useState<number>()

  const src = SOURCES[source]
  const agentOk = isAddress(agent)
  const target = useAgent(agentOk ? agent : undefined)
  const amountNum = Number(amount)
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= MAX_USDC
  const fromAmount = useMemo(() => (amountOk ? parseUnits(amount, 6) : 0n), [amount, amountOk])
  const sender = source === 'base' ? w.evm?.account : w.solana?.address
  const onBase = w.evm?.chainId === BASE_CHAIN_ID
  const ready = source === 'base' ? !!w.evm && onBase : !!w.solana
  const enoughFunds = source === 'solana' || (baseUsdc != null && baseUsdc >= fromAmount)

  useEffect(() => {
    if (!w.evm) return setBaseUsdc(undefined)
    baseClient
      .readContract({ address: SOURCE_TOKENS.base.USDC, abi: erc20Abi, functionName: 'balanceOf', args: [w.evm.account] })
      .then(setBaseUsdc, () => setBaseUsdc(undefined))
  }, [w.evm?.account, finished])

  // A quote is only valid for the inputs it was made for.
  useEffect(() => setQuote(undefined), [agent, amount, source, sender, receive])

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
      fromToken: src.usdc,
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
      const tx = q.transactionRequest
      const t0 = Date.now()
      const list: Step[] =
        tx.kind === 'evm'
          ? [
              { label: 'Approve exactly this amount (if needed)', state: 'active' },
              { label: 'Send on Base', state: 'todo' },
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
        const wallet = createWalletClient({ account: w.evm!.account, chain: base, transport: custom(w.evm!.wallet.provider) })
        hash = await executeFuel({
          quote: q,
          wallet,
          client: baseClient,
          onStep: (s) => {
            if (s.step === 'approve') update(0, { link: { href: `https://basescan.org/tx/${s.hash}`, text: 'Basescan ↗' } })
            if (s.step === 'approved') update(0, { state: 'done' })
            if (s.step === 'send') {
              if (list[0]!.state === 'active') update(0, { state: 'done', label: 'Approval already in place' })
              update(1, { state: 'active', link: { href: `https://basescan.org/tx/${s.hash}`, text: 'Basescan ↗' } })
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
          Send USDC from Base or Solana. The agent receives USDC.e, PathUSD, USDT0 or OUSD on Tempo in seconds. You sign in your own wallet; Pitstop never holds funds.
        </p>
      </header>

      <section className="panel">
        <PanelHead num="A" title="Agent" />
        <label className="field">
          <span>Agent wallet on Tempo</span>
          <input id="agent" value={agent} onChange={(e) => setAgent(e.target.value.trim())} spellCheck={false} placeholder="0x…" />
          <small className={agentOk ? 'muted' : 'note bad'}>
            {agentOk
              ? `Tempo balance $${target.balance != null ? usd(target.balance) : '…'} · ${short(agent)}`
              : 'Enter the agent’s 0x address. Fuel can’t be recalled once sent.'}
          </small>
        </label>
      </section>

      <section className="panel">
        <PanelHead num="B" title="Pay from" />
        <div className="seg" role="radiogroup" aria-label="Source chain">
          {(Object.keys(SOURCES) as Source[]).map((key) => (
            <button key={key} role="radio" aria-checked={source === key} onClick={() => setSource(key)} disabled={busy}>
              {SOURCES[key].label} USDC
            </button>
          ))}
        </div>
        <div className="field">
          <span>Agent receives on Tempo</span>
          <TokenPicker value={receive} onChange={setReceive} disabled={busy} label="Token received on Tempo" />
          <small className="muted">
            {receive === 'USDCe' ? 'USDC.e: the default for Pitstop guards and most MPP services.' : receive === 'OUSD' ? 'OpenUSD: the token the MPP docs recommend.' : `Use ${receive} if the services your agent pays charge in it.`}{' '}
            A guarded key only spends the token it was authorized for.
          </small>
        </div>
        <label className="field">
          <span>Amount (USDC, up to {MAX_USDC} per transfer)</span>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
          {!amountOk && <small className="note bad">Enter an amount between 0 and {MAX_USDC}.</small>}
        </label>
        <div className="row">
          {!sender ? (
            <button className="primary" onClick={() => openConnect(source)}>
              Connect {source === 'base' ? 'a Base wallet' : 'a Solana wallet'}
            </button>
          ) : source === 'base' && !onBase ? (
            <button className="primary" onClick={() => run(() => switchToBase(w.evm!.wallet.provider))} disabled={busy}>
              Switch to Base
            </button>
          ) : (
            <button className="primary" onClick={() => run(newQuote)} disabled={busy || !agentOk || !amountOk || !ready}>
              {quote ? 'Refresh quote' : 'Get quote'}
            </button>
          )}
          {sender && (
            <span className="small muted">
              From {short(sender)} on {src.label}
              {source === 'base' && baseUsdc != null && ` · ${usd(baseUsdc)} USDC`}
            </span>
          )}
        </div>
        {source === 'base' && ready && baseUsdc != null && !enoughFunds && (
          <p className="note bad">This wallet has less USDC on Base than the amount.</p>
        )}
      </section>

      {quote && (
        <section className="panel quote">
          <PanelHead num="C" title="Quote" />
          <div>
            <p className="eyebrow">Agent receives</p>
            <p className="big">{usd(quote.toAmount, 4)} USDCe</p>
          </div>
          <dl>
            <div><dt>You send</dt><dd>{usd(quote.fromAmount)} USDC · {src.label}</dd></div>
            <div><dt>Arrives in</dt><dd>~{quote.durationSeconds} s via {quote.tool}</dd></div>
            <div><dt>Minimum</dt><dd>{usd(quote.toAmountMin, 4)} USDCe</dd></div>
            <div><dt>Fees + gas</dt><dd>${(quote.feesUsd + quote.gasUsd).toFixed(4)} · incl. {PITSTOP_FEE * 100}% Pitstop</dd></div>
            <div><dt>To</dt><dd className="mono">{short(quote.toAddress)} · Tempo</dd></div>
            <div><dt>Contract</dt><dd className="mono">LI.FI Diamond (checked)</dd></div>
          </dl>
          <div className="row">
            <button className="primary" onClick={fuel} disabled={busy || !enoughFunds}>
              Fuel agent with {amount} USDC
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
