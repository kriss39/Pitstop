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
  type FuelCost,
  type FuelQuote,
  type FuelTokenSymbol,
} from '@pitstop/sdk'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
import { Account } from 'viem/tempo'
import { cleanDecimal, decimalValue, savedOwner, short, usd, useAgent } from './ui'
import { solanaBalances } from './solana'
import { openConnect, switchChain, useWallet } from './wallet'

/** Smallest transfer the web app sends, in dollars. Below it, fixed bridge and gas costs eat too much of the amount. */
const MIN_USD = 5
/** Route cost (value lost between send and arrival) that triggers a warning, and that blocks the transfer. */
const COST_WARN = 0.03
const COST_BLOCK = 0.1
const LIFI_PROXY = '/lifi/v1'
const SOLANA_PREVIEW_SENDER = '11111111111111111111111111111111'

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
/** The guarded wallet of the owner passkey on this device, so its owner doesn't have to paste it. */
const ownerWallet = (() => {
  const o = savedOwner()
  try {
    return o ? Account.fromWebAuthnP256(o).address : undefined
  } catch {
    return undefined
  }
})()
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`
/** A number with thousands separators and a fixed number of decimals. */
const grouped = (n: number, dp: number) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

export function Fuel() {
  const w = useWallet()
  const [agent, setAgent] = useState(params.get('to') ?? ownerWallet ?? __DEFAULT_AGENT__)
  const [amount, setAmount] = useState(String(MIN_USD))
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
  const amountNum = decimalValue(amount)
  // USDC is checked against the minimum before quoting; gas tokens once the quote prices them.
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && (useNative || amountNum >= MIN_USD)
  const fromAmount = useMemo(() => (amountOk ? parseUnits(amount, pay.decimals) : 0n), [amount, amountOk, pay.decimals])
  // What's typed, even below the minimum, so the balance slider can follow it.
  const typedAmount = useMemo(() => {
    try {
      return amountNum > 0 ? parseUnits(amount, pay.decimals) : 0n
    } catch {
      return 0n
    }
  }, [amount, pay.decimals])
  const isEvm = !!src.chain
  const sender = isEvm ? w.evm?.account : w.solana?.address
  const onChain = isEvm && w.evm?.chainId === src.chainId
  const ready = isEvm ? !!w.evm && onChain : !!w.solana
  // Solana balances come from the Worker; if that read fails, the wallet still checks funds when signing.
  const enoughFunds = isEvm ? srcBalance != null && srcBalance >= fromAmount : srcBalance == null || srcBalance >= fromAmount
  const routeCost = quote?.fromAmountUSD && quote.toAmountUSD ? 1 - quote.toAmountUSD / quote.fromAmountUSD : undefined
  const underMin = useNative && quote?.fromAmountUSD != null && quote.fromAmountUSD < MIN_USD * 0.99
  const tooCostly = routeCost != null && routeCost > COST_BLOCK

  useEffect(() => {
    setSrcBalance(undefined)
    // Solana: the Worker reads USDC and SOL for the connected wallet.
    if (!src.chain) {
      if (!w.solana) return
      let live = true
      solanaBalances(w.solana.address).then(
        (b) => live && setSrcBalance(useNative ? b.sol : b.usdc),
        () => live && setSrcBalance(undefined),
      )
      return () => {
        live = false
      }
    }
    if (!w.evm) return
    const c = clientFor(src.chain)
    const read =
      useNative
        ? c.getBalance({ address: w.evm.account })
        : c.readContract({ address: src.usdc as Address, abi: erc20Abi, functionName: 'balanceOf', args: [w.evm.account] })
    read.then(setSrcBalance, () => setSrcBalance(undefined))
  }, [w.evm?.account, w.solana?.address, source, useNative, finished])

  // Picking an EVM source asks the connected wallet to switch to it.
  useEffect(() => {
    if (w.evm && src.chain && w.evm.chainId !== src.chainId) void switchChain(w.evm.wallet.provider, src.chain).catch(() => {})
  }, [source, !!w.evm])


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

  /** Quotes for `from` (the connected wallet, or the agent address as a stand-in for a live preview). */
  const newQuote = async (from: string) =>
    fuelQuote({
      fromChain: src.chainId,
      fromToken: pay.address,
      fromAmount,
      fromAddress: from,
      toAddress: agent as Address,
      toToken: receive,
      integrator: __LIFI_INTEGRATOR__,
      fee: PITSTOP_FEE,
      baseUrl: LIFI_PROXY,
    })

  // Live quote as you type. Before a wallet is connected, previews quote for a stand-in sender:
  // the agent's address on EVM chains, the System Program address on Solana.
  const previewFrom = sender ?? (agentOk ? (isEvm ? agent : SOLANA_PREVIEW_SENDER) : undefined)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string>()
  useEffect(() => setQuote(undefined), [agent, source, receive, useNative])
  useEffect(() => {
    setQuoteError(undefined)
    if (!agentOk || !amountOk || !previewFrom || busy) {
      setQuote(undefined)
      setQuoting(false)
      return
    }
    let live = true
    setQuoting(true)
    const t = setTimeout(() => {
      newQuote(previewFrom).then(
        (q) => live && setQuote(q),
        (e) => live && setQuoteError(e instanceof Error && /no available quotes|not found/i.test(e.message) ? 'No route for this amount. Try more, or another token.' : 'Couldn’t get a quote. Try again.'),
      ).finally(() => live && setQuoting(false))
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [agent, amount, source, previewFrom, receive, useNative])

  const fuel = () =>
    run(async () => {
      setFinished(undefined)
      // Always sign a fresh quote for the real sender, and re-check it first.
      const q = await newQuote(sender!)
      setQuote(q)
      if (useNative && q.fromAmountUSD != null && q.fromAmountUSD < MIN_USD * 0.99) throw new Error(`The minimum is $${MIN_USD} per transfer.`)
      if (q.fromAmountUSD && q.toAmountUSD && 1 - q.toAmountUSD / q.fromAmountUSD > COST_BLOCK)
        throw new Error('This route got too expensive. Try another chain or token.')
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

  const [editAgent, setEditAgent] = useState(!agentOk)
  const balanceText =
    srcBalance != null ? `${Number(formatUnits(srcBalance, pay.decimals)).toFixed(pay.decimals > 6 ? 5 : 2)} ${pay.symbol}` : undefined
  // Gas tokens keep 5% back so the wallet can still pay the network fee.
  const spendable = srcBalance != null ? (useNative ? (srcBalance * 95n) / 100n : srcBalance) : undefined
  /** Token amount as input text, rounded down so it never exceeds the balance. */
  const payText = (v: bigint) => {
    const unit = 10n ** BigInt(pay.decimals - (pay.decimals > 6 ? 6 : 2))
    return formatUnits((v / unit) * unit, pay.decimals)
  }
  const walletSlide =
    spendable != null && spendable > 0n
      ? { max: spendable, amount: typedAmount, token: { symbol: pay.symbol, decimals: pay.decimals }, set: (v: bigint) => setAmount(payText(v)) }
      : undefined

  // One button, whose job depends on what's missing. Problems with the transfer itself come before the wallet.
  const cta =
    agent === '' ? { label: 'No agent wallet yet? Create one', onClick: () => window.location.assign('/guard') }
    : !agentOk ? { label: 'Enter the agent’s address', disabled: true }
    : !amountOk ? { label: amountNum > 0 ? `Minimum $${MIN_USD}` : 'Enter an amount', disabled: true }
    : underMin ? { label: `Minimum $${MIN_USD}`, disabled: true }
    : tooCostly ? { label: 'Route too expensive', disabled: true }
    : !sender ? { label: isEvm ? 'Connect wallet' : 'Connect a Solana wallet', onClick: () => openConnect(isEvm ? 'base' : 'solana') }
    : isEvm && !onChain ? { label: `Switch to ${src.label}`, onClick: () => run(() => switchChain(w.evm!.wallet.provider, src.chain!)) }
    : !enoughFunds ? { label: `Not enough ${pay.symbol} on ${src.label}`, disabled: true }
    : { label: quoting || !quote ? 'Getting the best route…' : 'Fuel agent', onClick: fuel, disabled: quoting || !quote }

  return (
    <main className="page fuel-page">
      <header className="rise fuel-head">
        <h1 className="title">Refuel an agent</h1>
        <p className="lede">Pay from any chain. It lands on Tempo in seconds.</p>
      </header>

      <section className="swap rise d1" aria-label="Fuel">
        <div className="swap-box">
          <div className="swap-top">
            <span className="swap-label">You pay</span>
            {balanceText && (
              <button className="link-btn" onClick={() => spendable != null && setAmount(payText(spendable))} title={useNative ? 'Use 95% of the balance (the rest pays gas)' : 'Use full balance'}>
                Balance {balanceText}
              </button>
            )}
          </div>
          <div className="swap-row">
            <input
              id="amount"
              className="swap-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(cleanDecimal(e.target.value))}
              placeholder="0"
              aria-label={`Amount in ${pay.symbol}`}
            />
            <div className="swap-pickers">
              <label className="chip-select">
                <span className="sr-only">Chain</span>
                <select value={source} onChange={(e) => setSource(e.target.value as Source)} disabled={busy}>
                  {SOURCE_KEYS.map((k) => (
                    <option key={k} value={k}>{SOURCES[k].label}</option>
                  ))}
                  <option disabled>More soon…</option>
                </select>
              </label>
              <label className="chip-select">
                <span className="sr-only">Token</span>
                <select value={useNative ? 'native' : 'usdc'} onChange={(e) => setPayNative(e.target.value === 'native')} disabled={busy || !src.native}>
                  <option value="usdc">USDC</option>
                  {src.native && <option value="native">{src.native.symbol}</option>}
                </select>
              </label>
            </div>
          </div>
          <span className="swap-sub">
            {quote?.fromAmountUSD != null ? `≈ $${grouped(quote.fromAmountUSD, 2)}` : `Minimum $${MIN_USD} per transfer`}
          </span>
        </div>

        <div className="swap-arrow" aria-hidden>
          <span>↓</span>
        </div>

        <div className="swap-box">
          <div className="swap-top">
            <span className="swap-label">Agent receives on Tempo</span>
            <label className="chip-select small">
              <span className="sr-only">Token received</span>
              <select value={receive} onChange={(e) => setReceive(e.target.value as FuelTokenSymbol)} disabled={busy}>
                {FUEL_TOKENS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={`swap-amount out${quoting ? ' loading' : ''}`}>{quote ? grouped(Number(formatUnits(quote.toAmount, 6)), 4) : '0.00'}</div>
          {editAgent || !agentOk ? (
            <input
              id="agent"
              className="swap-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value.trim())}
              onBlur={() => isAddress(agent) && setEditAgent(false)}
              spellCheck={false}
              placeholder="Agent wallet on Tempo (0x…)"
              aria-label="Agent wallet on Tempo"
            />
          ) : (
            <button className="link-btn agent-chip" onClick={() => setEditAgent(true)} title="Change the agent wallet">
              to <code>{short(agent)}</code>
              {target.balance != null && <span className="muted"> · has ${usd(target.balance)}</span>} · change
            </button>
          )}
          {agent !== '' && !agentOk && <small className="note bad">That isn’t a valid 0x address.</small>}
          {agent === '' && (
            <p className="swap-text small">
              Paste the agent’s Tempo wallet, or <a href="/guard">create one on Guard</a> with a passkey. It takes a minute.
            </p>
          )}
        </div>

        {(quote || quoteError) && (
          <div className="route">
            {quoteError ? (
              <span className="bad">{quoteError}</span>
            ) : (
              quote && (
                <>
                  <span>~{quote.durationSeconds} s</span>
                  <span>via {toolName(quote.tool)}</span>
                  <span className={routeCost != null && routeCost > COST_WARN ? 'warn-text' : undefined}>
                    costs {dollars(costSummary(quote, useNative).totalUsd)} ({costSummary(quote, useNative).share})
                  </span>
                  <a href="#breakdown">details ↓</a>
                </>
              )
            )}
          </div>
        )}
        {underMin && (
          <p className="note bad">
            That’s about ${grouped(quote!.fromAmountUSD!, 2)}. The minimum is ${MIN_USD} per transfer.
          </p>
        )}
        {tooCostly && <p className="note bad">This route would lose {(routeCost! * 100).toFixed(0)}% of the value, so Pitstop won’t send it.</p>}
        {!tooCostly && routeCost != null && routeCost > COST_WARN && <p className="note warn">This route costs {(routeCost * 100).toFixed(1)}%. USDC is usually cheaper.</p>}

        <button className="signal-btn swap-cta" onClick={cta.onClick} disabled={busy || cta.disabled}>
          {busy && steps.length ? 'Fueling…' : cta.label}
        </button>
        <p className="swap-foot">
          Includes a {PITSTOP_FEE * 100}% Pitstop fee. You sign in your own wallet; approvals are for the exact amount; the route is checked before you sign.
        </p>
      </section>

      {(quote || (walletSlide && !busy && agentOk)) && (
        <Breakdown
          quote={quote}
          belowMin={!useNative && amountNum > 0 && amountNum < MIN_USD}
          chain={src.label}
          loading={quoting}
          onConnect={sender ? undefined : () => openConnect(isEvm ? 'base' : 'solana')}
          native={useNative}
          wallet={walletSlide}
        />
      )}

      {steps.length > 0 && (
        <section className="panel">
          <ol className="steps">
            {steps.map((st) => (
              <li key={st.label} className={st.state}>
                <span className="dot" aria-hidden />
                <span>{st.label}</span>
                {st.link && <a href={st.link.href} target="_blank" rel="noreferrer">{st.link.text}</a>}
                {st.t != null && <span className="t">{secs(st.t)}</span>}
              </li>
            ))}
          </ol>
          {finished != null && (
            <>
              <div className="chequer" aria-hidden />
              <p style={{ font: '800 28px/1 var(--display)', textTransform: 'uppercase' }}>Fuelled in {secs(finished)}</p>
              <p className="small muted">
                Watch this agent on the <a href={`/dashboard?wallet=${agent}`}>dashboard</a>.
              </p>
            </>
          )}
        </section>
      )}

      {error && <p className="note bad" role="alert">{error}</p>}
    </main>
  )
}

const TOOL_NAMES: Record<string, string> = { across: 'Across', relaydepository: 'Relay', relay: 'Relay' }
const toolName = (t: string) => TOOL_NAMES[t] ?? t.charAt(0).toUpperCase() + t.slice(1)
const pct = (p?: number) => (p != null && p > 0 ? `${(p * 100).toFixed(p < 0.001 ? 3 : 2)}%` : '')
const dollars = (v: number) => `$${v < 1 ? v.toFixed(4) : grouped(v, 2)}`
const tokenAmt = (amount: bigint, t: { symbol: string; decimals: number }, dp?: number) => {
  const n = Number(formatUnits(amount, t.decimals))
  return `${n === 0 ? '0' : n < 0.0001 ? n.toPrecision(2) : grouped(n, dp ?? (n < 1 ? 4 : 2))} ${t.symbol}`
}

/** Total route cost in dollars (fees, swap loss and gas; refundable deposits excluded) and its share of what's sent. */
function costSummary(quote: FuelQuote, native: boolean) {
  const takenUsd = quote.costs.filter((c) => c.included).reduce((s, c) => s + c.usd, 0)
  const onTopUsd = quote.costs.filter((c) => !c.included && c.kind !== 'deposit').reduce((s, c) => s + c.usd, 0)
  const swapUsd = native && quote.fromAmountUSD != null && quote.toAmountUSD != null ? quote.fromAmountUSD - takenUsd - quote.toAmountUSD : 0
  const totalUsd = takenUsd + Math.max(0, swapUsd) + onTopUsd
  const base = quote.fromAmountUSD ?? 0
  return { swapUsd, totalUsd, share: base > 0 ? `${((totalUsd / base) * 100).toFixed(2)}%` : '–' }
}

/** Itemized route: what you send, each cost on the way, and what the agent gets. Live from the quote. */
function Breakdown({
  quote,
  belowMin,
  chain,
  loading,
  onConnect,
  native,
  wallet,
}: {
  quote?: FuelQuote
  /** True when the amount is under the minimum, so there's no quote to show. */
  belowMin?: boolean
  chain: string
  loading: boolean
  /** Opens the wallet dialog; set while no wallet is connected. */
  onConnect?: () => void
  native: boolean
  /** With a connected wallet, the slider runs from 0 to what the wallet can send. */
  wallet?: { max: bigint; amount: bigint; token: { symbol: string; decimals: number }; set: (v: bigint) => void }
}) {
  const walletPermille = wallet ? Number((wallet.amount > wallet.max ? wallet.max : wallet.amount) * 1000n / wallet.max) : 0
  // What the slider position is worth: dollars for USDC; tokens plus their dollar value (at the quote's price) for gas tokens.
  const slid = wallet ? (wallet.amount > wallet.max ? wallet.max : wallet.amount) : 0n
  const price = quote?.fromAmountUSD ? quote.fromAmountUSD / Number(formatUnits(quote.fromAmount, quote.fromToken.decimals)) : undefined
  const readout = !wallet
    ? ''
    : native
      ? `${tokenAmt(slid, wallet.token)}${price ? ` ≈ ${dollars(price * Number(formatUnits(slid, wallet.token.decimals)))}` : ''}`
      : `$${grouped(Number(formatUnits(slid, wallet.token.decimals)), 2)}`

  return (
    <section id="breakdown" className={`breakdown rise${loading ? ' stale' : ''}`} aria-label="Where your money goes" aria-busy={loading}>
      <div className="bd-head">
        <h2>Where your money goes</h2>
        <span className="muted small">{loading ? 'Updating…' : quote ? `Live quote · via ${toolName(quote.tool)}` : ''}</span>
      </div>

      {wallet ? (
        <div className="bd-play">
          <div className="bd-readout">
            <label htmlFor="bd-range" className="small muted">
              Your balance: <b>{tokenAmt(wallet.max, wallet.token)}</b> on {chain}
            </label>
            <output htmlFor="bd-range">
              <b>{Math.round(walletPermille / 10)}%</b> · {readout}
            </output>
          </div>
          <input
            id="bd-range"
            type="range"
            min={0}
            max={1000}
            step={1}
            value={walletPermille}
            onChange={(e) => wallet.set((wallet.max * BigInt(e.target.value)) / 1000n)}
            style={{ '--f': walletPermille / 1000 } as CSSProperties}
          />
          <div className="bd-chips">
            {[25, 50, 75, 100].map((p) => (
              <button key={p} className={Math.abs(walletPermille - p * 10) <= 2 ? 'on' : ''} onClick={() => wallet.set((wallet.max * BigInt(p)) / 100n)}>
                {p === 100 ? 'Max' : `${p}%`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        onConnect && (
          <div className="bd-connect">
            <span className="small muted">Connect a wallet to pick the amount from your balance.</span>
            <button className="ghost small-btn" onClick={onConnect}>Connect wallet</button>
          </div>
        )
      )}

      {quote ? (
        <CostFlow quote={quote} chain={chain} native={native} />
      ) : (
        <p className="small muted">{!belowMin
            ? 'Getting a quote…'
            : wallet && !native && Number(formatUnits(wallet.max, wallet.token.decimals)) < MIN_USD
              ? `Your balance on ${chain} is under the $${MIN_USD} minimum. Add funds there or pick another chain.`
              : `Slide up: the minimum is $${MIN_USD} per transfer.`}</p>
      )}
    </section>
  )
}

/** The itemized list: what you send, each cost on the way, what arrives, and the total. */
function CostFlow({ quote, chain, native }: { quote: FuelQuote; chain: string; native: boolean }) {
  const bridge = toolName(quote.tool)
  const label = (c: FuelCost) =>
    c.kind === 'integrator' ? { t: 'Pitstop fee', d: 'Keeps Pitstop running' }
    : c.kind === 'lifi' ? { t: 'LI.FI fee', d: 'Finds the best route and runs it' }
    : c.kind === 'deposit' ? { t: 'Refundable deposit', d: 'Opens a token account if your wallet has none. Not a fee; you can get it back' }
    : c.kind === 'gas' ? { t: `Gas on ${chain}`, d: `Paid on top by your wallet, in ${c.token.symbol}` }
    : { t: `${bridge} · ${c.name.replace(/^./, (x) => x.toUpperCase())}`, d: 'Paid to the bridge that moves the money' }
  const taken = quote.costs.filter((c) => c.included)
  const onTop = quote.costs.filter((c) => !c.included)
  // With a gas token, the swap into a stablecoin and price moves cost something too.
  const { swapUsd, totalUsd, share } = costSummary(quote, native)


  return (
    <>
      <ol className="bd-flow">
        <li className="bd-start">
          <span className="bd-t">You send<small>from {chain}</small></span>
          <span className="bd-v">{tokenAmt(quote.fromAmount, quote.fromToken)}</span>
          <span className="bd-u">{quote.fromAmountUSD != null ? dollars(quote.fromAmountUSD) : ''}</span>
        </li>
        {taken.map((c, i) => {
          const l = label(c)
          return (
            <li key={i} className={`bd-cost ${c.kind}`}>
              <span className="bd-t">
                <span>
                  {l.t} {pct(c.percentage) && <em>{pct(c.percentage)}</em>}
                </span>
                <small>{l.d}</small>
              </span>
              <span className="bd-v">− {tokenAmt(c.amount, c.token)}</span>
              <span className="bd-u">{dollars(c.usd)}</span>
            </li>
          )
        })}
        {swapUsd > 0.0005 && (
          <li className="bd-cost">
            <span className="bd-t">Swap and price<small>{quote.fromToken.symbol} becomes a stablecoin on the way</small></span>
            <span className="bd-v">≈ − {dollars(swapUsd)}</span>
            <span className="bd-u">{dollars(swapUsd)}</span>
          </li>
        )}
        <li className="bd-end">
          <span className="bd-t">Agent receives<small>on Tempo, in about {quote.durationSeconds} s</small></span>
          <span className="bd-v">{tokenAmt(quote.toAmount, quote.toToken, 4)}</span>
          <span className="bd-u">{quote.toAmountUSD != null ? dollars(quote.toAmountUSD) : ''}</span>
        </li>
        {onTop.map((c, i) => {
          const l = label(c)
          return (
            <li key={`g${i}`} className="bd-cost on-top">
              <span className="bd-t">+ {l.t}<small>{l.d}</small></span>
              <span className="bd-v">{tokenAmt(c.amount, c.token)}</span>
              <span className="bd-u">{dollars(c.usd)}</span>
            </li>
          )
        })}
      </ol>

      <div className="bd-total">
        <span>All costs</span>
        <b>{dollars(totalUsd)}</b>
        <span className="muted">{share} of what you send</span>
      </div>
      <p className="small muted">
        The percentage fees grow with the amount. The bridge and gas costs stay about the same, so larger transfers cost less per dollar.
      </p>
    </>
  )
}
