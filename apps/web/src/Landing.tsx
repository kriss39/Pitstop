import { Fragment, useEffect, useRef, useState } from 'react'
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

const BUILT_ON = [
  {
    name: 'LI.FI',
    role: 'Brings the fuel in',
    line: 'Routes USDC from Base and Solana into Tempo through Across and Relay.',
    stats: [['~1–2 s', 'to Tempo'], ['75', 'chains'], ['0.25%', 'Pitstop fee']],
    href: 'https://li.fi',
  },
  {
    name: 'Tempo',
    role: 'Holds the leash',
    line: 'The payments chain. Its Account Keychain checks every payment against the agent’s limit.',
    stats: [['On-chain', 'limits'], ['$0.00004', 'fee per payment'], ['Passkey', 'owner']],
    href: 'https://tempo.xyz',
  },
]





/** Plain-language story: what an agent is, why it needs fuel and a leash. */
const STORY = [
  {
    k: '01 · The driver',
    t: 'An AI agent works for you',
    d: 'An agent is an AI, like Claude, that does tasks on its own. It researches, calls APIs and finishes the job while you do something else.',
    scene: ['you   › Which wallets are buying LINK?', 'agent › asking Nansen…', 'agent › found 12 smart-money buyers'],
  },
  {
    k: '02 · The fuel',
    t: 'It pays for each call',
    d: 'Good data costs money. On Tempo, services like Nansen charge the agent a cent per request, paid instantly in dollars. No account, no API key, no card.',
    scene: ['POST nansen/token-information', '402 · pay $0.01', 'paid · 200 OK'],
  },
  {
    k: '03 · The pit stop',
    t: 'Fuel in seconds. Rules you set.',
    d: 'Pitstop refuels the agent from any chain in seconds and gives it a key with a daily budget. You stay in charge, and the chain enforces it.',
    scene: ['fuel   +2.00 USDC in 1.4 s', 'limit  $5 a day', '6th $1 call → refused'],
  },
]

/** Replays a scene's lines when the card scrolls into view; lines stay visible at rest. */
function StoryCard({ item }: { item: (typeof STORY)[number] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [play, setPlay] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setPlay(true), io.disconnect()), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`story-card${play ? ' play' : ''}`}>
      <p className="eyebrow">{item.k}</p>
      <h3 className="story-title">{item.t}</h3>
      <p className="muted">{item.d}</p>
      <div className="scene" aria-hidden>
        {item.scene.map((line, i) => (
          <span key={line} style={{ animationDelay: `${0.25 + i * 0.45}s` }}>
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}

function Story() {
  return (
    <section id="why">
      <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="lane" />
        <h2 className="section">Why agents need a pit stop</h2>
        <p className="lede">
          In a race, the driver goes fast and the pit crew keeps the car running. Your AI agent is the driver. Pitstop is the crew: fuel when
          it runs low, and rules it can’t break.
        </p>
        <div className="story">
          {STORY.map((item) => (
            <StoryCard key={item.k} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}


/** The industry problem, today vs with Pitstop, each backed by a mainnet result. */
const PROBLEMS = [
  {
    p: 'The money is in the wrong place',
    today: 'Agents pay on Tempo, but people keep their dollars on Solana, Base or Ethereum. Every top-up means bridges, gas tokens and minutes of clicking.',
    fix: 'One link fuels the agent from any chain. LI.FI finds the route and the USDC lands on Tempo in one to two seconds.',
    proof: 'Base → Tempo in ~2 s',
  },
  {
    p: 'Trust depends on someone’s server',
    today: 'To cap an agent you either trust a provider’s backend to say no, or you hand it a full wallet and hope nothing goes wrong.',
    fix: 'The limit lives in the account itself. Tempo refuses any payment past it, so there is no server to bypass and nothing to hack around.',
    proof: '5th call refused by Tempo',
  },
  {
    p: 'Owners are flying blind',
    today: 'You find out the agent ran dry, or spent too much, after it already happened.',
    fix: 'A live pit wall shows fuel, limit left and every payment. Telegram pings you when fuel is low, and the agent can refill itself.',
    proof: 'Alerts and auto-refill on mainnet',
  },
]

function Problems() {
  return (
    <section id="problem">
      <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="lane" />
        <h2 className="section">The problem, and how Pitstop fixes it</h2>
        <p className="lede">
          AI agents are starting to pay for the services they use, one request at a time. The payments rail exists. What’s missing is the
          pit crew: a fast way to get money to the agent, and a hard limit on what it can do with it.
        </p>
        <div className="problems">
          <div className="problems-head" aria-hidden>
            <span />
            <span><i className="dot-flag bad" /> Today</span>
            <span><i className="dot-flag ok" /> With Pitstop</span>
          </div>
          {PROBLEMS.map((row) => (
            <div className="problem-row" key={row.p}>
              <h3 className="problem-title">{row.p}</h3>
              <p className="problem-today"><span className="m-label">Today</span>{row.today}</p>
              <div className="problem-fix">
                <span className="m-label">With Pitstop</span>
                <p>{row.fix}</p>
                <span className="proof-chip">✓ {row.proof}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

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
              <a className="btn ghost" href="/docs">How to use</a>
            </div>
          </div>
          <ReplayBoard />
        </div>
      </div>

      <Story />

      <Problems />

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

      <section id="built-on">
        <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p className="eyebrow">Built on</p>
          <div className="builton">
            {BUILT_ON.map((b, i) => (
              <Fragment key={b.name}>
                {i === 1 && (
                  <div className="fuelline" aria-hidden>
                    <span>USDC</span>
                  </div>
                )}
                <a className="partner lift" href={b.href} target="_blank" rel="noreferrer">
                  <span className="partner-role">{b.role}</span>
                  <span className="partner-name">{b.name}</span>
                  <span className="partner-line">{b.line}</span>
                  <span className="partner-stats">
                    {b.stats.map(([v, l]) => (
                      <span key={l}>
                        <b>{v}</b>
                        {l}
                      </span>
                    ))}
                  </span>
                  <span className="partner-link">{b.href.replace('https://', '')} ↗</span>
                </a>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section id="docs">
        <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="lane" />
          <h2 className="section">Docs</h2>
          <div className="doc-teaser">
            {[
              ['quickstart', 'Quickstart', 'From zero to a guarded agent in five steps.'],
              ['agent', 'Set up the agent', 'Commands and settings for the agent’s machine.'],
              ['mcp', 'Claude & Cursor', 'Add Pitstop as an MCP server.'],
              ['security', 'Security', 'What the agent can and can’t do.'],
            ].map(([id, t, d]) => (
              <a key={id} className="card lift" href={`/docs#${id}`}>
                <h3>{t} →</h3>
                <p className="small muted">{d}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell">
          <span>Pitstop · fuel and spending limits for AI agents · built on Tempo and LI.FI</span>
          <span className="row" style={{ gap: 16 }}>
            <a href="/fuel">Fuel</a>
            <a href="/guard">Guard</a>
            <a href="/dashboard">Dashboard</a>
            <a href="/docs">Docs</a>
          </span>
        </div>
      </footer>
    </main>
  )
}
