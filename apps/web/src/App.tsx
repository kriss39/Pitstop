import {
  executeFuel,
  fuelQuote,
  getBalance,
  SOLANA_CHAIN_ID,
  SOURCE_TOKENS,
  totalUsd,
  waitForFuel,
  type FuelQuote,
  type FuelStatus,
} from '@pitstop/sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { base } from 'viem/chains'

/** Safety cap while Pitstop is in testing. */
const MAX_USDC = 5
const LIFI_PROXY = '/lifi/v1'

type Source = 'base' | 'solana'
const SOURCES: Record<Source, { label: string; chainId: number; usdc: string; wallet: string; ttlMs: number }> = {
  base: { label: 'Base', chainId: base.id, usdc: SOURCE_TOKENS.base.USDC, wallet: 'Rabby or MetaMask', ttlMs: 60_000 },
  // A Solana transaction carries a recent blockhash that expires in about a minute.
  solana: { label: 'Solana', chainId: SOLANA_CHAIN_ID, usdc: SOURCE_TOKENS.solana.USDC, wallet: 'Phantom', ttlMs: 25_000 },
}

const baseClient = createPublicClient({ chain: base, transport: http() }) as PublicClient

type Step = { label: string; state: 'todo' | 'active' | 'done' | 'error'; link?: { href: string; text: string } }

function initialAgent(): string {
  return new URLSearchParams(window.location.search).get('to') ?? __DEFAULT_AGENT__
}
function initialSource(): Source {
  return new URLSearchParams(window.location.search).get('from') === 'solana' ? 'solana' : 'base'
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const usdc = (v: bigint, dp = 4) => Number(formatUnits(v, 6)).toFixed(dp)
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function App() {
  const [agent, setAgent] = useState(initialAgent)
  const [amount, setAmount] = useState('2')
  const [source, setSource] = useState<Source>(initialSource)
  const [evmAccount, setEvmAccount] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [solAccount, setSolAccount] = useState<string>()
  const [baseUsdc, setBaseUsdc] = useState<bigint>()
  const [agentBalance, setAgentBalance] = useState<bigint>()
  const [quote, setQuote] = useState<FuelQuote>()
  const [quotedAt, setQuotedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [steps, setSteps] = useState<Step[]>([])

  const src = SOURCES[source]
  const agentOk = isAddress(agent)
  const amountNum = Number(amount)
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= MAX_USDC
  const fromAmount = useMemo(() => (amountOk ? parseUnits(amount, 6) : 0n), [amount, amountOk])
  const sender = source === 'base' ? evmAccount : solAccount
  const ready = source === 'base' ? !!evmAccount && chainId === base.id : !!solAccount
  // Base balance is checked here; Phantom shows the Solana balance itself.
  const enoughFunds = source === 'solana' || (baseUsdc != null && baseUsdc >= fromAmount)

  const evmWallet = useMemo(() => {
    if (!window.ethereum || !evmAccount) return undefined
    return createWalletClient({ account: evmAccount, chain: base, transport: custom(window.ethereum) })
  }, [evmAccount])

  const refreshAgent = useCallback(async () => {
    if (!agentOk) return setAgentBalance(undefined)
    try {
      setAgentBalance(totalUsd(await getBalance({ address: agent as Address })))
    } catch {
      setAgentBalance(undefined)
    }
  }, [agent, agentOk])

  const refreshBaseUsdc = useCallback(async () => {
    if (!evmAccount) return
    try {
      setBaseUsdc(
        await baseClient.readContract({
          address: SOURCE_TOKENS.base.USDC,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [evmAccount],
        }),
      )
    } catch {
      setBaseUsdc(undefined)
    }
  }, [evmAccount])

  useEffect(() => void refreshAgent(), [refreshAgent])
  useEffect(() => void refreshBaseUsdc(), [refreshBaseUsdc])

  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return
    const onAccounts = (accs: string[]) => setEvmAccount(accs[0] as Address | undefined)
    const onChain = (id: string) => setChainId(Number(id))
    eth.on('accountsChanged', onAccounts)
    eth.on('chainChanged', onChain)
    void eth.request({ method: 'eth_accounts' }).then((a) => onAccounts(a as string[]))
    void eth.request({ method: 'eth_chainId' }).then((id) => onChain(id as string))
    return () => {
      eth.removeListener('accountsChanged', onAccounts)
      eth.removeListener('chainChanged', onChain)
    }
  }, [])

  useEffect(() => {
    const phantom = window.phantom?.solana
    if (!phantom) return
    const onChange = (pk: { toString(): string } | null) => setSolAccount(pk ? pk.toString() : undefined)
    phantom.on('accountChanged', onChange)
    phantom.connect({ onlyIfTrusted: true }).then((r) => onChange(r.publicKey), () => {})
    return () => phantom.removeListener?.('accountChanged', onChange)
  }, [])

  // A quote is only valid for the inputs it was made for.
  useEffect(() => setQuote(undefined), [agent, amount, source, sender])

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true)
    setError(undefined)
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/user rejected|denied|declined/i.test(msg) ? 'You rejected the request in your wallet.' : msg.split('\n')[0])
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      if (source === 'base') {
        if (!window.ethereum) throw new Error('No EVM wallet found. Install Rabby or MetaMask and reload.')
        const accs = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
        setEvmAccount(accs[0] as Address)
      } else {
        const phantom = window.phantom?.solana
        if (!phantom?.isPhantom) throw new Error('Phantom not found. Install Phantom and reload.')
        const r = await phantom.connect()
        setSolAccount(r.publicKey.toString())
      }
    })

  const switchToBase = () =>
    run(() => createWalletClient({ chain: base, transport: custom(window.ethereum!) }).switchChain({ id: base.id }))

  const newQuote = async () => {
    const q = await fuelQuote({
      fromChain: src.chainId,
      fromToken: src.usdc,
      fromAmount,
      fromAddress: sender!,
      toAddress: agent as Address,
      integrator: __LIFI_INTEGRATOR__,
      baseUrl: LIFI_PROXY,
    })
    setQuote(q)
    setQuotedAt(Date.now())
    return q
  }

  const getQuote = () => run(newQuote)

  const fuel = () =>
    run(async () => {
      const q = Date.now() - quotedAt > src.ttlMs ? await newQuote() : quote!
      const tx = q.transactionRequest
      const list: Step[] =
        tx.kind === 'evm'
          ? [
              { label: 'Approve USDC (only if needed)', state: 'active' },
              { label: 'Send on Base', state: 'todo' },
              { label: 'Bridge to Tempo', state: 'todo' },
              { label: 'Fuel arrives in the agent wallet', state: 'todo' },
            ]
          : [
              { label: 'Sign and send on Solana', state: 'active' },
              { label: 'Bridge to Tempo', state: 'todo' },
              { label: 'Fuel arrives in the agent wallet', state: 'todo' },
            ]
      const update = (i: number, patch: Partial<Step>) => {
        list[i] = { ...list[i]!, ...patch }
        setSteps([...list])
      }
      setSteps([...list])

      let hash: string
      if (tx.kind === 'evm') {
        hash = await executeFuel({
          quote: q,
          wallet: evmWallet!,
          client: baseClient,
          onStep: (s) => {
            if (s.step === 'approve') update(0, { link: { href: `https://basescan.org/tx/${s.hash}`, text: 'Basescan' } })
            if (s.step === 'approved') update(0, { state: 'done' })
            if (s.step === 'send') {
              if (list[0]!.state === 'active') update(0, { state: 'done', label: 'Approve USDC (not needed)' })
              update(1, { state: 'active', link: { href: `https://basescan.org/tx/${s.hash}`, text: 'Basescan' } })
            }
            if (s.step === 'sent') update(1, { state: 'done' })
          },
        })
      } else {
        const phantom = window.phantom?.solana
        if (!phantom) throw new Error('Phantom not found')
        // Loaded on demand so Base users never download the Solana library.
        const { VersionedTransaction } = await import('@solana/web3.js')
        const { signature } = await phantom.signAndSendTransaction(VersionedTransaction.deserialize(fromBase64(tx.data)))
        hash = signature
        update(0, { state: 'done', link: { href: `https://solscan.io/tx/${signature}`, text: 'Solscan' } })
      }

      const bridge = list.length - 2
      update(bridge, { state: 'active', link: { href: `https://scan.li.fi/tx/${hash}`, text: 'LI.FI Scan' } })
      const status: FuelStatus = await waitForFuel({ txHash: hash, fromChain: src.chainId, baseUrl: LIFI_PROXY })
      if (status.status !== 'DONE') {
        update(bridge, { state: 'error' })
        throw new Error(`Bridge ${status.status.toLowerCase()}: ${status.substatusMessage ?? 'see LI.FI Scan'}`)
      }
      update(bridge, { state: 'done' })
      update(bridge + 1, {
        state: 'done',
        label: `Arrived: ${status.receivedAmount != null ? usdc(status.receivedAmount) : '?'} USDCe`,
        link: status.receivingTxHash
          ? { href: `https://explore.tempo.xyz/tx/${status.receivingTxHash}`, text: 'Tempo Explorer' }
          : undefined,
      })
      await Promise.all([refreshAgent(), refreshBaseUsdc()])
    })

  return (
    <main className="page">
      <header className="top">
        <p className="eyebrow">Pitstop · Fuel</p>
        <h1>Refuel an agent on Tempo</h1>
        <p className="lede">
          Send USDC from Base or Solana. The agent receives USDCe on Tempo in seconds. You sign every transaction in your own
          wallet.
        </p>
      </header>

      <section className="panel">
        <label className="field">
          <span>Agent address on Tempo</span>
          <input id="agent" value={agent} onChange={(e) => setAgent(e.target.value.trim())} spellCheck={false} placeholder="0x…" />
          <small className={agentOk ? 'muted' : 'warn'}>
            {agentOk
              ? `Tempo balance: ${agentBalance != null ? `$${usdc(agentBalance, 2)}` : '…'}`
              : 'Enter a 0x address. Fuel cannot be recalled once sent.'}
          </small>
        </label>

        <div className="field">
          <span>Pay from</span>
          <div className="seg" role="radiogroup" aria-label="Source chain">
            {(Object.keys(SOURCES) as Source[]).map((key) => (
              <button
                key={key}
                role="radio"
                aria-checked={source === key}
                className={source === key ? 'on' : ''}
                onClick={() => setSource(key)}
                disabled={busy}
              >
                {SOURCES[key].label} USDC
              </button>
            ))}
          </div>
          <small className="muted">Sign with {src.wallet}.</small>
        </div>

        <label className="field">
          <span>Amount (USDC, max {MAX_USDC} while testing)</span>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
          {!amountOk && <small className="warn">Enter an amount between 0 and {MAX_USDC}.</small>}
        </label>

        <div className="row">
          {!sender ? (
            <button className="primary" onClick={connect} disabled={busy}>Connect {src.wallet.split(' ')[0]}</button>
          ) : source === 'base' && chainId !== base.id ? (
            <button className="primary" onClick={switchToBase} disabled={busy}>Switch to Base</button>
          ) : (
            <button className="primary" onClick={getQuote} disabled={busy || !agentOk || !amountOk || !ready}>
              {quote ? 'Refresh quote' : 'Get quote'}
            </button>
          )}
          {sender && (
            <span className="muted">
              {short(sender)} · {src.label}
              {source === 'base' && ` · ${baseUsdc != null ? `${usdc(baseUsdc, 2)} USDC` : '…'}`}
            </span>
          )}
        </div>
        {source === 'base' && ready && baseUsdc != null && !enoughFunds && (
          <small className="warn">This wallet has less USDC on Base than the amount.</small>
        )}
      </section>

      {quote && (
        <section className="panel quote">
          <dl>
            <div><dt>You send</dt><dd>{usdc(quote.fromAmount, 2)} USDC · {src.label}</dd></div>
            <div><dt>Agent receives</dt><dd>{usdc(quote.toAmount)} {quote.toToken.symbol} · Tempo</dd></div>
            <div><dt>Minimum</dt><dd>{usdc(quote.toAmountMin)}</dd></div>
            <div><dt>Time</dt><dd>~{quote.durationSeconds}s via {quote.tool}</dd></div>
            <div><dt>Fees + gas</dt><dd>${(quote.feesUsd + quote.gasUsd).toFixed(4)}</dd></div>
            <div><dt>To</dt><dd className="mono">{short(quote.toAddress)}</dd></div>
          </dl>
          <button className="primary go" onClick={fuel} disabled={busy || !enoughFunds}>
            Fuel agent with {amount} USDC
          </button>
        </section>
      )}

      {steps.length > 0 && (
        <section className="panel">
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.label} className={s.state}>
                <span className="dot" aria-hidden />
                <span>{s.label}</span>
                {s.link && <a href={s.link.href} target="_blank" rel="noreferrer">{s.link.text}</a>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
