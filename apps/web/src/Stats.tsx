import { useEffect, useState } from 'react'

type Stats = {
  updatedAt: number
  transfers: { total: number; outside: number; team: number }
  users: number
  agents: number
  volumeUsd: { total: number; outside: number }
  feesEarnedUsd: number
  telegram: { chats: number; agents: number }
  byChain: { chain: string; transfers: number; volumeUsd: number }[]
  recent: { time: number; chain: string; amountUsd: number; token: string; tool: string; team: boolean; link?: string }[]
}

const TOOLS: Record<string, string> = { across: 'Across', relaydepository: 'Relay', relay: 'Relay' }
const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ago = (unix: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix)
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86_400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86_400)}d ago`
}

/** Live usage, from LI.FI's records of transfers routed with Pitstop's integrator id. */
export function StatsPage() {
  const [stats, setStats] = useState<Stats>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<Stats & { error?: string }>)
      .then((s) => (s.error ? setError(s.error) : setStats(s)), () => setError('Couldn’t load the numbers.'))
  }, [])

  const maxChain = Math.max(1, ...(stats?.byChain.map((c) => c.transfers) ?? []))

  return (
    <main className="page wide stats-page">
      <header className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="title">Live usage</h1>
        <p className="lede">
          Every transfer routed through Pitstop, straight from LI.FI’s records. Our own mainnet tests are counted separately, so the
          outside numbers are real users only.
        </p>
      </header>

      {error && <p className="note bad">{error}</p>}
      {!stats && !error && <p className="muted">Loading…</p>}

      {stats && (
        <>
          <section className="stat-grid rise d1">
            <div className="stat">
              <span className="stat-k">Outside users</span>
              <b>{stats.users}</b>
              <small>unique wallets that fuelled an agent</small>
            </div>
            <div className="stat">
              <span className="stat-k">Agents fuelled</span>
              <b>{stats.agents}</b>
              <small>by outside users</small>
            </div>
            <div className="stat">
              <span className="stat-k">Moved to Tempo</span>
              <b>{money(stats.volumeUsd.total)}</b>
              <small>{money(stats.volumeUsd.outside)} by outside users</small>
            </div>
            <div className="stat">
              <span className="stat-k">Transfers</span>
              <b>{stats.transfers.total}</b>
              <small>
                {stats.transfers.outside} outside · {stats.transfers.team} team tests
              </small>
            </div>
            <div className="stat">
              <span className="stat-k">Pitstop fees earned</span>
              <b>{stats.feesEarnedUsd > 0 && stats.feesEarnedUsd < 0.01 ? `$${stats.feesEarnedUsd.toFixed(4)}` : money(stats.feesEarnedUsd)}</b>
              <small>0.1% of each route, paid out by LI.FI</small>
            </div>
            <div className="stat">
              <span className="stat-k">Telegram alerts</span>
              <b>{stats.telegram.agents}</b>
              <small>agents watched in {stats.telegram.chats} {stats.telegram.chats === 1 ? 'chat' : 'chats'}</small>
            </div>
          </section>

          {stats.transfers.outside === 0 && (
            <p className="note warn">
              No outside users yet: every transfer so far is our own mainnet testing. Be the first: <a href="/fuel">fuel an agent</a>.
            </p>
          )}

          <div className="dash">
            <section className="panel">
              <span className="swap-label">Recent transfers</span>
              <ul className="feed">
                {stats.recent.map((t) => (
                  <li key={`${t.time}-${t.link}`}>
                    <span className={`avatar${t.team ? ' fee' : ''}`} aria-hidden>
                      {t.chain[0]}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      {t.chain} → Tempo <span className="muted small">· {t.token === 'USDCe' ? 'USDC.e' : t.token} via {TOOLS[t.tool] ?? t.tool}</span>
                      <br />
                      {t.link ? (
                        <a className="when" href={t.link} target="_blank" rel="noreferrer">
                          {ago(t.time)} · LI.FI Scan ↗
                        </a>
                      ) : (
                        <span className="when">{ago(t.time)}</span>
                      )}
                    </span>
                    <span className="amt">
                      {money(t.amountUsd)}
                      <small>{t.team ? 'team test' : 'user'}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <span className="swap-label">By source chain</span>
              <ul className="by-service">
                {stats.byChain.map((c) => (
                  <li key={c.chain}>
                    <span>
                      {c.chain}
                      <small> · {c.transfers} {c.transfers === 1 ? 'transfer' : 'transfers'}</small>
                    </span>
                    <b>{money(c.volumeUsd)}</b>
                    <i style={{ width: `${Math.max(4, (c.transfers / maxChain) * 100)}%` }} aria-hidden />
                  </li>
                ))}
              </ul>
              <p className="small muted">
                Source: LI.FI analytics for the integrator id “pitstop”, refreshed every five minutes. Updated{' '}
                {new Date(stats.updatedAt).toLocaleTimeString()}.
              </p>
            </section>
          </div>
        </>
      )}
    </main>
  )
}
