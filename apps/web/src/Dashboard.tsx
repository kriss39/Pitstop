import type { Spend } from '@pitstop/sdk'
import { useMemo, useState } from 'react'
import { isAddress } from 'viem'
import { Account } from 'viem/tempo'
import { AgentBoard, APP_URL, BOT_HANDLE, CopyButton, FlagChip, PanelHead, savedKey, savedOwner, short, usd, useAgent } from './ui'

/** Recipients seen on mainnet, labelled for the activity feed. */
const KNOWN: Record<string, string> = {
  '0xb83df53f396a4522b5755923fe45018ef07cc92b': 'Nansen · MPP',
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

const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`
}

export function Dashboard() {
  const q = new URLSearchParams(window.location.search)
  const owner = savedOwner()
  const ownerWallet = useMemo(() => (owner ? Account.fromWebAuthnP256(owner).address : undefined), [owner?.publicKey])
  const [wallet, setWallet] = useState(q.get('wallet') ?? ownerWallet ?? '')
  const [key, setKey] = useState(q.get('key') ?? savedKey.get() ?? '')
  const walletOk = isAddress(wallet)
  const agent = useAgent(walletOk ? wallet : undefined, isAddress(key) ? key : undefined, true)
  const rows = useMemo(() => (agent.spends ? group(agent.spends) : []), [agent.spends])
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

  return (
    <main className="page wide">
      <header className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="eyebrow">03 · Dashboard</p>
        <h1 className="title">Agent pit wall</h1>
      </header>

      <section className="panel">
        <div className="grid2">
          <label className="field">
            <span>Agent wallet</span>
            <input id="wallet" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
          </label>
          <label className="field">
            <span>Agent key (optional)</span>
            <input id="dkey" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
          </label>
        </div>
        {!walletOk && (
          <p className="small muted">
            Enter an agent wallet, or create one on the <a href="/guard">Guard</a> page. This device has {owner ? 'an owner passkey' : 'no owner passkey'}.
          </p>
        )}
      </section>

      {walletOk && (
        <div className="dash">
          <div className="col">
            <AgentBoard data={agent} keyAddress={isAddress(key) ? key : undefined} />

            <section className="panel">
              <PanelHead title="Activity">
                <button className="ghost small-btn" onClick={() => void agent.refresh()} disabled={agent.loading}>
                  {agent.loading ? 'Loading…' : 'Refresh'}
                </button>
              </PanelHead>
              {rows.length ? (
                <ul className="feed">
                  {rows.slice(0, 12).map((r) => (
                    <li key={r.txHash}>
                      <FlagChip flag={r.amount ? 'green' : 'none'}>{r.amount ? 'Paid' : 'Fee'}</FlagChip>
                      <span style={{ minWidth: 0 }}>
                        {r.amount ? KNOWN[r.to.toLowerCase()] ?? `To ${short(r.to)}` : 'Tempo network fee'}
                        <br />
                        <a className="when" href={`https://explore.tempo.xyz/tx/${r.txHash}`} target="_blank" rel="noreferrer">
                          {ago(r.time)} · {short(r.txHash)} ↗
                        </a>
                      </span>
                      <span className="amt">${usd(r.amount + r.fee, r.amount ? 2 : 6)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{agent.loading ? 'Reading the last ~15 hours from Tempo…' : 'No spending in the last ~15 hours.'}</p>
              )}
              <p className="small muted">Payments the guard refused never reach the chain, so they cost nothing and don’t appear here.</p>
            </section>
          </div>

          <div className="col">
            <section className="panel">
              <PanelHead title="Fuel tank" />
              <div className="tank">${agent.balance != null ? usd(agent.balance) : '–'}</div>
              <p className="small muted">USDCe on Tempo · {short(wallet)}</p>
              <div className="row">
                <a className="btn primary" href={`/fuel?to=${wallet}`}>Fuel now</a>
                <CopyButton text={`${APP_URL}/fuel?to=${wallet}`} label="Copy funding link" />
              </div>
            </section>

            <section className="panel">
              <PanelHead title="Leash" />
              <p className="small">
                Change the daily limit or revoke the key with the owner passkey. The agent itself can’t do either.
              </p>
              <div className="row">
                <a className="btn ghost" href={`/guard${isAddress(key) ? `?key=${key}` : ''}`}>Open Guard</a>
              </div>
            </section>

            <section className="panel">
              <PanelHead title="Alerts" />
              <p className="small">
                Get a Telegram message when the agent runs low or uses up its limit. Open{' '}
                <a href={`https://t.me/${BOT_HANDLE}`} target="_blank" rel="noreferrer">@{BOT_HANDLE}</a>, press Start, then send:
              </p>
              <code className="block">{watchCmd}</code>
              <div className="row"><CopyButton text={watchCmd} label="Copy command" /></div>
            </section>

            <section className="panel">
              <PanelHead title="Connect your agent" />
              <p className="small">Add Pitstop to Claude or Cursor as an MCP server (fill in your paths):</p>
              <code className="block">{mcp}</code>
              <div className="row"><CopyButton text={mcp} label="Copy config" /></div>
            </section>
          </div>
        </div>
      )}
    </main>
  )
}
