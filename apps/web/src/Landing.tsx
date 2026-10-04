import { useEffect, useState } from 'react'
import { BOT_HANDLE, CopyButton, FlagChip, FuelCells } from './ui'

/** The real mainnet demo, replayed: 4 Nansen calls at $0.01, the 5th refused by Tempo. */
const CALLS = ['USDC', 'WETH', 'LINK', 'UNI', 'AAVE']

function ReplayBoard() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [step, setStep] = useState(reduce ? 5 : 0)
  useEffect(() => {
    if (reduce) return
    const t = setTimeout(() => setStep((s) => (s >= 7 ? 0 : s + 1)), step >= 5 ? 1800 : 1000)
    return () => clearTimeout(t)
  }, [step, reduce])

  const paid = Math.min(step, 4)
  const blocked = step >= 5
  const left = 5 - paid
  return (
    <div className={`board rise d3 ${blocked ? 'blocked shake' : ''}`} aria-label="Replay of the mainnet demo">
      <div className="board-top">
        <span className="board-tag">P1 · Research agent</span>
        {blocked ? <FlagChip flag="red">Blocked</FlagChip> : paid >= 4 ? <FlagChip flag="yellow">Near limit</FlagChip> : <FlagChip flag="green">Active</FlagChip>}
      </div>
      <div>
        <div className="board-big tick" key={left}>${(left / 100).toFixed(2)}</div>
        <div className="board-label">left today · of $0.05</div>
      </div>
      <FuelCells total={5} left={left} />
      <ol className="steps" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
        {CALLS.map((token, i) => {
          const state = i < paid ? 'done' : i === 4 && blocked ? 'error' : i === paid ? 'active' : 'todo'
          return (
            <li key={token} className={state} style={{ color: state === 'todo' ? 'var(--slab-muted)' : undefined }}>
              <span className="dot" aria-hidden />
              <span>Nansen · {token}</span>
              <span className="t" style={{ color: state === 'error' ? 'var(--bad)' : 'var(--slab-muted)' }}>
                {state === 'done' ? 'paid $0.01' : state === 'error' ? 'refused by Tempo' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const PROOF = [
  { v: '~2 s', t: 'Base → Tempo', d: '2 USDC', href: 'https://scan.li.fi/tx/0x53d3dda1b3309d2888cea5c352d0ab9f2120556990286b2e1ef11a33f9a9f9a2' },
  { v: '~1 s', t: 'Solana → Tempo', d: '2 USDC', href: 'https://scan.li.fi/tx/2hQa9oxN1M4ondZRwr7LvAyzahW7SAnW6tqEc8PhbfionBLdafXD12qLvsKyXnJJ5roG9nwY6pcc4wBKawZEER97' },
  { v: '$0.01', t: 'Agent paid Nansen', d: 'one API call', href: 'https://explore.tempo.xyz/tx/0xe172ca615f977aaeaa2ca03635a7715d129229470a25d987f397e184514ca7d0' },
  { v: 'Blocked', t: 'Over the limit', d: 'stopped by Tempo', href: 'https://explore.tempo.xyz/address/0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0' },
]

const STEPS = [
  { n: '01', t: 'Fuel', d: 'Send USDC from Base or Solana. It lands on Tempo in seconds.' },
  { n: '02', t: 'Guard', d: 'Your passkey sets a daily limit for the agent.' },
  { n: '03', t: 'Pay', d: 'The agent pays APIs per call, within its limit.' },
  { n: '04', t: 'Refill', d: 'Low on fuel? The agent tops itself up.' },
]

const STACK: [string, string][] = [
  ['Tempo', 'The payments chain. Enforces the limit.'],
  ['LI.FI', 'Moves USDC in from other chains.'],
  ['MPP', 'Lets the agent pay APIs per call.'],
  ['Base · Solana', 'Where your USDC comes from.'],
  ['Cloudflare', 'Hosts the app and sends alerts.'],
  ['MCP', 'Works inside Claude and Cursor.'],
]

const MCP_SNIPPET = `{
  "mcpServers": {
    "pitstop": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": { "AGENT_WALLET": "0x…" }
    }
  }
}`

const AGENT_CMDS = `pnpm key        # create the agent's key
pnpm demo       # pay Nansen until the limit stops it
pnpm watch      # keep the agent fuelled`

const FAQ: [string, string][] = [
  ['Does Pitstop hold my money?', 'No. You sign every transfer in your own wallet. Pitstop never holds keys or funds.'],
  ['What happens at the limit?', 'Tempo refuses the payment. Nothing is spent. The limit resets after 24 hours.'],
  ['Can the agent raise its own limit?', 'No. Only your passkey can change it.'],
  ['What does it cost?', 'A few cents in bridge fees, plus a 0.25% Pitstop fee shown in every quote.'],
  ['What if I lose my passkey?', 'You can’t change the limit any more, but the agent’s key still expires. Keep small balances.'],
]

export function Landing() {
  return (
    <main className="landing">
      <div className="shell">
        <div className="hero">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p className="eyebrow rise">Fuel and spending limits for AI agents</p>
            <h1 className="display rise d1">Refuel your agents from any chain. Keep them on a leash.</h1>
            <p className="lede rise d2">
              Send USDC to your agent’s wallet on Tempo in seconds, and set how much it may spend each day. The limit is enforced by the
              chain, so the agent can’t go past it.
            </p>
            <div className="cta rise d2">
              <a className="btn primary" href="/fuel">Fuel an agent</a>
              <a className="btn" href="/guard">Set a limit</a>
              <a className="btn ghost" href="#docs">How to use</a>
            </div>
          </div>
          <ReplayBoard />
        </div>
      </div>

      <section>
        <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="eyebrow">Done on mainnet · tap to see the transaction</p>
          <div className="proof">
            {PROOF.map((p) => (
              <a key={p.t} href={p.href} target="_blank" rel="noreferrer" className="lift">
                <span className="v">{p.v}</span>
                <b>{p.t}</b>
                <span className="small muted">{p.d} ↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="lane" />
          <h2 className="section">How it works</h2>
          <div className="pitlane" aria-hidden />
          <div className="steps4">
            {STEPS.map((s) => (
              <div className="card lift" key={s.n}>
                <span className="num">{s.n}</span>
                <h3>{s.t}</h3>
                <p className="small muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="shell split">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="lane" />
            <h2 className="section">The agent can’t loosen its own leash</h2>
            <p className="lede">
              Your passkey gives the agent a key with a daily limit. Tempo checks every payment against it. The agent has no way to change
              the limit; only you can.
            </p>
          </div>
          <div className="chain-diagram flow">
            <div className="node"><b>Your passkey</b><span className="small muted">Touch ID or Face ID</span></div>
            <span className="arrow">sets the limit ↓</span>
            <div className="node"><b>Agent key</b><span className="small muted">$0.05 a day · expires in 30 days</span></div>
            <span className="arrow">pays per call ↓</span>
            <div className="node"><b>Paid APIs</b><span className="small muted">Nansen, Dune and 130+ more</span></div>
          </div>
        </div>
      </section>

      <section>
        <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p className="eyebrow">Built on</p>
          <div className="stack">
            {STACK.map(([name, what]) => (
              <div className="card lift" key={name}>
                <h3 style={{ font: '800 22px/1 var(--display)', textTransform: 'uppercase' }}>{name}</h3>
                <p className="small muted">{what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="docs">
        <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="lane" />
          <h2 className="section">Docs</h2>
          <div className="docs-grid">
            <div className="card">
              <p className="eyebrow">For you</p>
              <ol className="small docs-list">
                <li>On <a href="/guard">Guard</a>, create a passkey. That makes your agent’s wallet.</li>
                <li>On <a href="/fuel">Fuel</a>, send it a few USDC.</li>
                <li>Paste the agent’s key, pick a daily limit, confirm with your passkey.</li>
              </ol>
            </div>
            <div className="card">
              <p className="eyebrow">For the agent</p>
              <code className="block nowrap">{AGENT_CMDS}</code>
            </div>
            <div className="card">
              <p className="eyebrow">In Claude or Cursor</p>
              <code className="block nowrap">{MCP_SNIPPET}</code>
              <div className="row"><CopyButton text={MCP_SNIPPET} label="Copy" /></div>
            </div>
            <div className="card">
              <p className="eyebrow">Alerts</p>
              <p className="small muted">
                Message <a href={`https://t.me/${BOT_HANDLE}`} target="_blank" rel="noreferrer">@{BOT_HANDLE}</a> on Telegram:{' '}
                <code>/watch &lt;wallet&gt; &lt;key&gt;</code>. It tells you when fuel is low or the limit is used up.
              </p>
            </div>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p className="small">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell">
          <span>Pitstop · built on Tempo, LI.FI and MPP · Colosseum World’s Fair 2026</span>
          <span className="row" style={{ gap: 16 }}>
            <a href="/fuel">Fuel</a>
            <a href="/guard">Guard</a>
            <a href="/dashboard">Dashboard</a>
            <a href="/#docs">Docs</a>
          </span>
        </div>
      </footer>
    </main>
  )
}
