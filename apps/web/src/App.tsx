import {
  executeFuel,
  fuelQuote,
  getBalance,
  SOURCE_TOKENS,
  TIP20_DECIMALS,
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
  type Hex,
  type PublicClient,
} from 'viem'
import { base } from 'viem/chains'

/** Safety cap while Pitstop is in testing. */
const MAX_USDC = 5
const QUOTE_TTL_MS = 60_000
const LIFI_PROXY = '/lifi/v1'
const BASE_USDC = SOURCE_TOKENS.base.USDC

const baseClient = createPublicClient({ chain: base, transport: http() }) as PublicClient

type Step = { label: string; state: 'todo' | 'active' | 'done' | 'error'; link?: { href: string; text: string } }

function initialAgent(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('to')
  return fromUrl ?? __DEFAULT_AGENT__
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const usdc = (v: bigint, dp = 4) => Number(formatUnits(v, 6)).toFixed(dp)

export function App() {
  const [agent, setAgent] = useState(initialAgent)
  const [amount, setAmount] = useState('2')
  const [account, setAccount] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [baseUsdc, setBaseUsdc] = useState<bigint>()
  const [agentBalance, setAgentBalance] = useState<bigint>()
  const [quote, setQuote] = useState<FuelQuote>()
  const [quotedAt, setQuotedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [steps, setSteps] = useState<Step[]>([])

  const agentOk = isAddress(agent)
  const amountNum = Number(amount)
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= MAX_USDC
  const fromAmount = useMemo(() => (amountOk ? parseUnits(amount, 6) : 0n), [amount, amountOk])
  const onBase = chainId === base.id
  const enoughUsdc = baseUsdc != null && baseUsdc >= fromAmount

  const wallet = useMemo(() => {
    if (!window.ethereum || !account) return undefined
    return createWalletClient({ account, chain: base, transport: custom(window.ethereum) })
  }, [account])

  const refreshAgent = useCallback(async () => {
    if (!agentOk) return setAgentBalance(undefined)
    try {
      setAgentBalance(totalUsd(await getBalance({ address: agent as Address })))
    } catch {
      setAgentBalance(undefined)
    }
  }, [agent, agentOk])

  const refreshBaseUsdc = useCallback(async () => {
    if (!account) return
    try {
      setBaseUsdc(await baseClient.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account] }))
    } catch {
      setBaseUsdc(undefined)
    }
  }, [account])

  useEffect(() => void refreshAgent(), [refreshAgent])
  useEffect(() => void refreshBaseUsdc(), [refreshBaseUsdc])

  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return
    const onAccounts = (accs: string[]) => setAccount(accs[0] as Address | undefined)
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

  // A quote is only valid for the inputs it was made for.
  useEffect(() => setQuote(undefined), [agent, amount, account])

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true)
    setError(undefined)
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/user rejected|denied/i.test(msg) ? 'You rejected the request in your wallet.' : msg.split('\n')[0])
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      if (!window.ethereum) throw new Error('No browser wallet found. Install Rabby or MetaMask and reload.')
      const accs = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      setAccount(accs[0] as Address)
    })

  const switchToBase = () =>
    run(async () => {
      await createWalletClient({ chain: base, transport: custom(window.ethereum!) }).switchChain({ id: base.id })
    })

  const getQuote = () =>
    run(async () => {
      const q = await fuelQuote({
        fromChain: base.id,
        fromToken: BASE_USDC,
        fromAmount,
        fromAddress: account!,
        toAddress: agent as Address,
        integrator: __LIFI_INTEGRATOR__,
        baseUrl: LIFI_PROXY,
      })
      setQuote(q)
      setQuotedAt(Date.now())
      return q
    })

  const fuel = () =>
    run(async () => {
      let q = quote!
      if (Date.now() - quotedAt > QUOTE_TTL_MS) {
        const fresh = await fuelQuote({
          fromChain: base.id,
          fromToken: BASE_USDC,
          fromAmount,
          fromAddress: account!,
          toAddress: agent as Address,
          integrator: __LIFI_INTEGRATOR__,
          baseUrl: LIFI_PROXY,
        })
        setQuote(fresh)
        setQuotedAt(Date.now())
        q = fresh
      }
      const list: Step[] = [
        { label: 'Approve USDC (only if needed)', state: 'active' },
        { label: 'Send on Base', state: 'todo' },
        { label: 'Bridge to Tempo', state: 'todo' },
        { label: 'Fuel arrives in the agent wallet', state: 'todo' },
      ]
      const update = (i: number, patch: Partial<Step>) => {
        list[i] = { ...list[i]!, ...patch }
        setSteps([...list])
      }
      setSteps([...list])

      const hash = await executeFuel({
        quote: q,
        wallet: wallet!,
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

      update(2, { state: 'active', link: { href: `https://scan.li.fi/tx/${hash}`, text: 'LI.FI Scan' } })
      const status: FuelStatus = await waitForFuel({ txHash: hash as Hex, fromChain: base.id, baseUrl: LIFI_PROXY })
      if (status.status !== 'DONE') {
        update(2, { state: 'error' })
        throw new Error(`Bridge ${status.status.toLowerCase()}: ${status.substatusMessage ?? 'see LI.FI Scan'}`)
      }
      update(2, { state: 'done' })
      update(3, {
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
        <p className="lede">Send USDC from Base. The agent receives USDCe on Tempo in about two seconds. You sign every transaction in your own wallet.</p>
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

        <label className="field">
          <span>Amount (USDC on Base, max {MAX_USDC} while testing)</span>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
          {!amountOk && <small className="warn">Enter an amount between 0 and {MAX_USDC}.</small>}
        </label>

        <div className="row">
          {!account ? (
            <button className="primary" onClick={connect} disabled={busy}>Connect wallet</button>
          ) : !onBase ? (
            <button className="primary" onClick={switchToBase} disabled={busy}>Switch to Base</button>
          ) : (
            <button className="primary" onClick={getQuote} disabled={busy || !agentOk || !amountOk}>
              {quote ? 'Refresh quote' : 'Get quote'}
            </button>
          )}
          {account && (
            <span className="muted">
              {short(account)} · {onBase ? 'Base' : `chain ${chainId}`} · {baseUsdc != null ? `${usdc(baseUsdc, 2)} USDC` : '…'}
            </span>
          )}
        </div>
        {account && onBase && baseUsdc != null && !enoughUsdc && (
          <small className="warn">This wallet has less USDC on Base than the amount.</small>
        )}
      </section>

      {quote && (
        <section className="panel quote">
          <dl>
            <div><dt>You send</dt><dd>{usdc(quote.fromAmount, 2)} USDC · Base</dd></div>
            <div><dt>Agent receives</dt><dd>{usdc(quote.toAmount)} {quote.toToken.symbol} · Tempo</dd></div>
            <div><dt>Minimum</dt><dd>{usdc(quote.toAmountMin)}</dd></div>
            <div><dt>Time</dt><dd>~{quote.durationSeconds}s via {quote.tool}</dd></div>
            <div><dt>Fees + gas</dt><dd>${(quote.feesUsd + quote.gasUsd).toFixed(4)}</dd></div>
            <div><dt>To</dt><dd className="mono">{short(quote.toAddress)}</dd></div>
          </dl>
          <button className="primary go" onClick={fuel} disabled={busy || !enoughUsdc}>
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
