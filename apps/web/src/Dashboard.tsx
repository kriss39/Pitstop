import { FUEL_TOKENS, type FuelTokenSymbol, type Spend } from '@getpitstop/sdk'
import { useMemo, useState } from 'react'
import { isAddress, parseUnits } from 'viem'
import { Account } from 'viem/tempo'
import { DEMO_DASHBOARD } from './basics'
import { serviceAt } from './services'
import { AddressField, AgentBoard, APP_URL, BOT_HANDLE, CopyButton, isDecimal, PanelHead, tokenLabel, savedKey, savedOwner, savedToken, short, usd, useAgent } from './ui'

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

const service = serviceAt
const payee = (to: string) => service(to)?.name
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
  // Payments to known MPP services, and everything else the wallet sent (e.g. the owner's own transfers).
  // The summary covers the current limit period only, so it can be read against the daily limit.
  const periodStart = agent.status?.periodEnd ? agent.status.periodEnd - 86_400 : undefined
  const inPeriod = (r: Row) => periodStart == null || r.time >= periodStart
  const since = periodStart ? new Date(periodStart * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined
  const servicePayments = payments.filter((r) => service(r.to) && inPeriod(r))
  const otherTransfers = payments.filter((r) => !service(r.to) && inPeriod(r))
  const serviceTotal = servicePayments.reduce((sum, r) => sum + r.amount + r.fee, 0n)
  const otherTotal = otherTransfers.reduce((sum, r) => sum + r.amount + r.fee, 0n)
  // The real daily limit, when the link carries it (the chain only reports what's left).
  const urlLimit = isDecimal(q.get('limit') ?? '') ? parseUnits(q.get('limit')!, 6) : undefined
  // Spending per service, largest first; other transfers last.
  const byService = useMemo(() => {
    const m = new Map<string, { name: string; icon?: string; total: bigint; count: number }>()
    for (const r of payments) {
      // Known MPP services by name; plain transfers to anyone else share one row.
      const name = payee(r.to) ?? 'Other transfers'
      const e = m.get(name) ?? { name, icon: service(r.to)?.icon, total: 0n, count: 0 }
      e.total += r.amount + r.fee
      e.count++
      m.set(name, e)
    }
    const other = (e: { name: string }) => (e.name === 'Other transfers' ? 1 : 0)
    return [...m.values()].sort((a, b) => other(a) - other(b) || (b.total > a.total ? 1 : -1))
  }, [rows])
  // Bars are scaled to the biggest row, wherever it sits in the list.
  const serviceMax = Math.max(1, ...byService.map((e) => Number(e.total)))
  const watchCmd = `/watch ${wallet} ${isAddress(key) ? key : ''}`.trim()
  const mcp = JSON.stringify(
    {
      mcpServers: {
        pitstop: {
          command: 'node',
          args: ['/path/to/pitstop/packages/mcp/dist/index.js'],
          env: { AGENT_WALLET: walletOk ? wallet : '0x…', PITSTOP_AGENT_KEY: '0x… (only if you created the key on Guard)', PITSTOP_DIR: '/path/to/.pitstop' },
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
          <a className="btn ghost swap-cta" href={DEMO_DASHBOARD}>See the live demo agent</a>
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
                <option key={t} value={t}>{tokenLabel(t)}</option>
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
          <AgentBoard data={agent} keyAddress={isAddress(key) ? key : undefined} limit={urlLimit} />

          <section className="panel">
            <PanelHead title="Activity">
              <div className="seg small-seg" role="radiogroup" aria-label="Show">
                <button role="radio" aria-checked={!showFees} onClick={() => setShowFees(false)}>Payments</button>
                <button role="radio" aria-checked={showFees} onClick={() => setShowFees(true)}>All</button>
              </div>
            </PanelHead>
            {rows.length > 0 && (
              <p className="feed-sum">
                <b>{servicePayments.length}</b> {servicePayments.length === 1 ? 'payment' : 'payments'} to MPP services · <b>{amt(serviceTotal)}</b>
                {otherTransfers.length > 0 && (
                  <>
                    {' '}· {otherTransfers.length} other {otherTransfers.length === 1 ? 'transfer' : 'transfers'} · {amt(otherTotal)}
                  </>
                )}{' '}
                {since ? `since the limit reset at ${since}` : 'in the last ~15 hours'}, fees included
              </p>
            )}
            {visible.length ? (
              <ul className="feed">
                {visible.map((r) => {
                  const svc = r.amount ? service(r.to) : undefined
                  const name = svc?.name
                  return (
                    <li key={r.txHash}>
                      {svc?.icon ? (
                        <img className="avatar" src={svc.icon} alt="" width={34} height={34} />
                      ) : (
                        <span className={`avatar${r.amount ? '' : ' fee'}`} aria-hidden>
                          {svc ? svc.name[0] : r.amount ? '→' : '⛽'}
                        </span>
                      )}
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
            <span className="swap-label">Fuel tank · on Tempo</span>
            <div className="tank">${agent.balance != null ? usd(agent.balance) : '–'}</div>
            {agent.balances && (
              <ul className="tank-split">
                {agent.balances
                  .filter((b) => b.raw > 0n || b.symbol === token)
                  .map((b) => (
                    <li key={b.symbol} className={b.symbol === token ? 'spendable' : undefined}>
                      <span>
                        {tokenLabel(b.symbol)}
                        {b.symbol === token ? <small> · the agent spends this</small> : <small> · not spendable by the key</small>}
                      </span>
                      <b>${usd(b.raw)}</b>
                    </li>
                  ))}
              </ul>
            )}
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
                    <span className="svc">
                      {e.icon ? <img src={e.icon} alt="" width={20} height={20} /> : <i className="svc-dot" aria-hidden />}
                      {e.name}<small> · {e.count} {e.name === 'Other transfers' ? (e.count === 1 ? 'transfer' : 'transfers') : e.count === 1 ? 'call' : 'calls'}</small></span>
                    <b>{amt(e.total)}</b>
                    <i style={{ width: `${Math.max(4, (Number(e.total) / serviceMax) * 100)}%` }} aria-hidden />
                  </li>
                ))}
              </ul>
              {byService.some((e) => e.name === 'Other transfers') && (
                <p className="small muted">Other transfers went to addresses that aren’t known MPP services, such as test payments.</p>
              )}
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
