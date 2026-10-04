import { FUEL_TOKENS, type FuelTokenSymbol, type Spend } from '@pitstop/sdk'
import { useMemo, useState } from 'react'
import { isAddress } from 'viem'
import { Account } from 'viem/tempo'
import { AddressField, AgentBoard, APP_URL, BOT_HANDLE, CopyButton, PanelHead, savedKey, savedOwner, savedToken, short, usd, useAgent } from './ui'

/** Recipients seen on mainnet, labelled for the activity feed. */
const KNOWN: Record<string, string> = {
  '0xb83df53f396a4522b5755923fe45018ef07cc92b': 'Nansen · MPP',
  '0xc12b5d802da90d14a8b35dec1cfb6fd5ceede60b': 'Codex · MPP',
}

type Row = { txHash: string; time: number; to: string; amount: bigint; fee: bigint }

/** Groups a payment and its network fee (same transaction) into one row. */
function group(spends: Spend[]): Row[] {
  const rows = new Map<string, Row>()
  for (const s of spends) {
    const row = rows.get(s.txHash) ?? { txHash: s.txHash, time: s.time, to: '', amount: 0n, fee: 0n }
    if (s.kind === 'network-fee') row.fee += s.amount
    else {
      row.to = s.to
      row.amount += s.amount
    }
    rows.set(s.txHash, row)
  }
  return [...rows.values()].sort((a, b) => b.time - a.time)
}

const payee = (to: string) => KNOWN[to.toLowerCase()]?.split(' · ')[0]
/** Dollars with enough decimals that sub-cent MPP payments don't show as $0.00. */
const amt = (v: bigint) => `$${usd(v, v < 100n ? 6 : v < 10_000n ? 4 : 2)}`

const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`
}

export function Dashboard() {
  const q = new URLSearchParams(window.location.search)
  const owner = savedOwner()
  const ownerWallet = useMemo(() => (owner ? Account.fromWebAuthnP256(owner).address : undefined), [owner?.publicKey])
  const [wallet, setWallet] = useState(q.get('wallet') ?? ownerWallet ?? '')
  const [key, setKey] = useState(q.get('key') ?? savedKey.get(q.get('wallet') ?? ownerWallet) ?? '')
  const [token, setToken] = useState<FuelTokenSymbol>(() => {
    const t = q.get('token')
    return (FUEL_TOKENS as readonly string[]).includes(t ?? '') ? (t as FuelTokenSymbol) : savedToken.get(q.get('key') ?? savedKey.get(q.get('wallet') ?? ownerWallet))
  })
  const walletOk = isAddress(wallet)
  const agent = useAgent(walletOk ? wallet : undefined, isAddress(key) ? key : undefined, true, token)
  const rows = useMemo(() => (agent.spends ? group(agent.spends) : []), [agent.spends])
  const [showFees, setShowFees] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const payments = rows.filter((r) => r.amount > 0n)
  const visible = (showFees ? rows : payments).slice(0, showAll ? undefined : 8)
  const hiddenCount = (showFees ? rows : payments).length - visible.length
  const spentTotal = rows.reduce((sum, r) => sum + r.amount + r.fee, 0n)
  // Spending per service, largest first; other transfers last.
  const byService = useMemo(() => {
    const m = new Map<string, { name: string; total: bigint; count: number }>()
    for (const r of payments) {
      // Known MPP services by name; plain transfers to anyone else share one row.
      const name = payee(r.to) ?? 'Other transfers'
      const e = m.get(name) ?? { name, total: 0n, count: 0 }
      e.total += r.amount + r.fee
      e.count++
      m.set(name, e)
    }
    const other = (e: { name: string }) => (e.name === 'Other transfers' ? 1 : 0)
    return [...m.values()].sort((a, b) => other(a) - other(b) || (b.total > a.total ? 1 : -1))
  }, [rows])
  const watchCmd = `/watch ${wallet} ${isAddress(key) ? key : ''}`.trim()
  const mcp = JSON.stringify(
    {
      mcpServers: {
        pitstop: {
          command: 'node',
          args: ['/path/to/pitstop/packages/mcp/dist/index.js'],
          env: { AGENT_WALLET: walletOk ? wallet : '0x…', PITSTOP_DIR: '/path/to/.pitstop' },
        },
      },
    },
    null,
    2,
  )

  if (!walletOk)
    return (
      <main className="page fuel-page">
        <header className="rise fuel-head">
          <h1 className="title">Agent pit wall</h1>
          <p className="lede">Fuel, limit and spending for one agent, live from Tempo.</p>
        </header>
        <section className="swap rise d1">
          <div className="swap-box">
            <span className="swap-label">Agent wallet on Tempo</span>
            <AddressField label="Wallet" value={wallet} onChange={setWallet} placeholder="0x…" />
            {wallet !== '' && <small className="note bad">That isn’t a valid 0x address.</small>}
          </div>
          <a className="btn signal-btn swap-cta" href="/guard">No agent yet? Set one up</a>
          <p className="swap-foot">This device has {owner ? 'an owner passkey, but no wallet was found for it' : 'no owner passkey'}.</p>
        </section>
      </main>
    )

  return (
    <main className="page wide">
      <header className="rise dash-head">
        <h1 className="title">Agent pit wall</h1>
        <div className="dash-bar">
          <AddressField label="Wallet" value={wallet} onChange={setWallet} />
          <AddressField label="Key" value={key} onChange={setKey} placeholder="Agent key (optional)" />
          <label className="chip-select small">
            <span className="sr-only">Token the key spends</span>
            <select value={token} onChange={(e) => setToken(e.target.value as FuelTokenSymbol)}>
              {FUEL_TOKENS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <button className="link-btn" onClick={() => void agent.refresh()} disabled={agent.loading}>
            {agent.loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      <div className="dash">
        <div className="col">
          <AgentBoard data={agent} keyAddress={isAddress(key) ? key : undefined} />

          <section className="panel">
            <PanelHead title="Activity">
              <div className="seg small-seg" role="radiogroup" aria-label="Show">
                <button role="radio" aria-checked={!showFees} onClick={() => setShowFees(false)}>Payments</button>
                <button role="radio" aria-checked={showFees} onClick={() => setShowFees(true)}>All</button>
              </div>
            </PanelHead>
            {rows.length > 0 && (
              <p className="feed-sum">
                <b>{payments.length}</b> {payments.length === 1 ? 'payment' : 'payments'} · <b>{amt(spentTotal)}</b> spent in the last ~15 hours, fees included
              </p>
            )}
            {visible.length ? (
              <ul className="feed">
                {visible.map((r) => {
                  const name = r.amount ? payee(r.to) : undefined
                  return (
                    <li key={r.txHash}>
                      <span className={`avatar${r.amount ? '' : ' fee'}`} aria-hidden>
                        {r.amount ? (name?.[0] ?? '→') : '⛽'}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        {r.amount ? (name ? <>{name} <span className="muted small">· MPP</span></> : <>To <code>{short(r.to)}</code></>) : 'Tempo network fee'}
                        <br />
                        <a className="when" href={`https://explore.tempo.xyz/tx/${r.txHash}`} target="_blank" rel="noreferrer">
                          {ago(r.time)} · {short(r.txHash)} ↗
                        </a>
                      </span>
                      <span className="amt">
                        {amt(r.amount || r.fee)}
                        {r.amount > 0n && r.fee > 0n && <small>+{amt(r.fee)} fee</small>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="small muted">{agent.loading ? 'Reading the last ~15 hours from Tempo…' : 'No spending in the last ~15 hours.'}</p>
            )}
            {hiddenCount > 0 && (
              <button className="link-btn" onClick={() => setShowAll(true)}>Show {hiddenCount} more</button>
            )}
            <p className="small muted">Payments the guard refused never reach the chain, so they cost nothing and don’t appear here.</p>
          </section>
        </div>

        <div className="col">
          <section className="panel">
            <span className="swap-label">Fuel tank</span>
            <div className="tank">${agent.balance != null ? usd(agent.balance) : '–'}</div>
            <div className="row">
              <a className="btn signal-btn" href={`/fuel?to=${wallet}`}>Fuel now</a>
              <a className="btn ghost" href={`/guard${isAddress(key) ? `?key=${key}` : ''}`}>Change limit</a>
            </div>
            <CopyButton text={`${APP_URL}/fuel?to=${wallet}`} label="Copy a funding link to share" className="link-btn" />
          </section>

          {byService.length > 0 && (
            <section className="panel">
              <span className="swap-label">By service</span>
              <ul className="by-service">
                {byService.map((e) => (
                  <li key={e.name}>
                    <span>{e.name}<small> · {e.count} {e.name === 'Other transfers' ? (e.count === 1 ? 'transfer' : 'transfers') : e.count === 1 ? 'call' : 'calls'}</small></span>
                    <b>{amt(e.total)}</b>
                    <i style={{ width: `${Math.max(4, (Number(e.total) / Number(byService[0]!.total)) * 100)}%` }} aria-hidden />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <span className="swap-label">Telegram alerts</span>
            <p className="small">
              A message when the agent runs low or hits its limit. Open{' '}
              <a href={`https://t.me/${BOT_HANDLE}`} target="_blank" rel="noreferrer">@{BOT_HANDLE}</a>, press Start, and send:
            </p>
            <code className="block">{watchCmd}</code>
            <CopyButton text={watchCmd} label="Copy command" className="link-btn" />
          </section>

          <details className="panel">
            <summary>Connect your agent to Claude or Cursor (MCP)</summary>
            <code className="block">{mcp}</code>
            <CopyButton text={mcp} label="Copy config" className="link-btn" />
          </details>
        </div>
      </div>
    </main>
  )
}
