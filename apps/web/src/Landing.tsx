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
  { v: '~2 s', t: 'Fuel lands on Tempo', d: '2 USDC, real transfer', href: 'https://scan.li.fi/tx/0x53d3dda1b3309d2888cea5c352d0ab9f2120556990286b2e1ef11a33f9a9f9a2' },
  { v: 'Any', t: 'Source chain', d: 'Solana, Ethereum, L2s · more soon', href: '/docs#fuel' },
  { v: '$0.01', t: 'Agent paid Nansen', d: 'one API call', href: 'https://explore.tempo.xyz/tx/0xe172ca615f977aaeaa2ca03635a7715d129229470a25d987f397e184514ca7d0' },
  { v: 'Blocked', t: 'Over the limit', d: 'stopped by Tempo', href: 'https://explore.tempo.xyz/address/0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0' },
]

const BUILT_ON = [
  {
    name: 'LI.FI',
    role: 'Brings the fuel in',
    line: 'Routes USDC and gas tokens from all the major chains into Tempo through Across and Relay. More are on the way.',
    stats: [['~1–2 s', 'to Tempo'], ['Any', 'source chain'], ['0.1%', 'Pitstop fee']],
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





/** Lines of a terminal-style scene that type in once they scroll into view. */
function Scene({ lines, label }: { lines: string[]; label?: string }) {
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
    <div ref={ref} className={`scene-wrap${play ? ' play' : ''}`}>
      {label && <span className="scene-label">{label}</span>}
      <div className="scene" aria-hidden>
        {lines.map((line, i) => (
          <span key={line} style={{ animationDelay: `${0.2 + i * 0.4}s` }}>
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}

const CHAPTERS = [
  { id: 'agent', n: '01', t: 'What is an AI agent?' },
  { id: 'pays', n: '02', t: 'What does it pay for?' },
  { id: 'wrong', n: '03', t: 'What goes wrong today' },
  { id: 'pitstop', n: '04', t: 'What Pitstop does' },
]

const USES = [
  ['Research', 'Reads markets, news and on-chain data, then writes you a summary.'],
  ['Watching', 'Keeps an eye on prices or wallets all day and tells you when something moves.'],
  ['Coding', 'Writes and tests code in Claude Code or Cursor while you review.'],
  ['Busywork', 'Fills in reports, cleans data, answers routine questions.'],
]

const PRICES = [
  ['$0.001', 'a token price', 'Codex'],
  ['$0.01', 'smart-money data on a token', 'Nansen'],
  ['100+', 'paid services agents can use', 'mpp.dev'],
]

const WRONG = [
  {
    t: 'Its money is in the wrong place',
    d: 'Most people keep their dollars on Solana, Base or Ethereum. Agents pay on Tempo. Getting money there means finding a bridge, buying gas tokens and juggling several apps, and an agent can’t do that alone.',
    eg: 'A research agent stops at step 3 of 5 because its wallet on Tempo is empty.',
    fix: 'Fuel',
  },
  {
    t: 'The brakes are hard to fit',
    d: 'A normal wallet is like your card with no limit: a bug, an endless loop or a web page that tricks the agent can spend everything, and a limit in the agent’s own code can be skipped by that code. Tempo can put the limit on-chain, but setting it up today means code or a command line.',
    eg: 'A loop calls a $0.01 API 50,000 times overnight: $500 gone by morning.',
    fix: 'Guard',
  },
  {
    t: 'You can’t see what it’s doing',
    d: 'Payments happen in the background, a cent at a time. You don’t know what it bought, from whom, or when it will run out, until it already has.',
    eg: 'You find out the agent was out of money only when its report never arrives.',
    fix: 'Watch',
  },
]

const DOES = [
  {
    k: 'Fuel',
    t: 'Top up from any chain, in seconds',
    d: 'Pay with USDC, or a chain’s own token like ETH or SOL, from wherever your money is. LI.FI finds the route and the agent receives dollars on Tempo about two seconds later. Every fee is shown before you sign.',
    proof: '2 USDC from Base, landed in ~2 s',
    href: '/fuel',
  },
  {
    k: 'Guard',
    t: 'A daily budget the chain enforces',
    d: 'Set up in the browser with your passkey (Face ID or Touch ID), no code. The agent gets its own key with a daily limit, one token and an end date, using Tempo’s built-in keys. Tempo checks every payment and refuses anything over. Only you can change it.',
    proof: '5th call refused by Tempo',
    href: '/guard',
  },
  {
    k: 'Watch',
    t: 'See every cent',
    d: 'A dashboard shows what’s left today, every payment and which service it went to. Telegram pings you when fuel runs low or the limit is used up.',
    proof: 'Alerts live on Telegram',
    href: '/dashboard',
  },
  {
    k: 'Refill',
    t: 'Tops itself up',
    d: 'When the agent runs low, it refuels itself from a small wallet you fund once, with a daily cap. It can also ask for fuel from Claude or Cursor through Pitstop’s MCP tools.',
    proof: 'Auto-refill and MCP fuel on mainnet',
    href: '/docs#agent',
  },
]

/** The plain-language guide: what an agent is, what it pays for, what goes wrong, and what Pitstop does. */
function Guide() {
  const [current, setCurrent] = useState(CHAPTERS[0]!.id)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setCurrent(top.target.id)
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    for (const c of CHAPTERS) {
      const el = document.getElementById(c.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])

  return (
    <section id="why">
      <div className="shell guide">
        <nav className="guide-nav" aria-label="Guide">
          <p className="eyebrow">The short guide</p>
          {CHAPTERS.map((c) => (
            <a key={c.id} href={`#${c.id}`} aria-current={current === c.id ? 'true' : undefined}>
              <span>{c.n}</span>
              {c.t}
            </a>
          ))}
        </nav>

        <div className="guide-body">
          <article id="agent" className="chapter">
            <span className="chapter-n">01</span>
            <h2 className="section">What is an AI agent?</h2>
            <p className="chapter-lead">A chatbot answers questions. An agent gets things done.</p>
            <p>
              You give it a goal in plain words. It splits the goal into steps, uses tools on the internet, checks what came back and keeps
              going until the job is finished. You don’t have to sit and watch.
            </p>
            <Scene
              label="One goal, three steps"
              lines={[
                'you    › Which tokens did smart money buy today? Add prices.',
                'agent  › step 1 · asks Nansen for smart-money flows',
                'agent  › step 2 · asks Codex for live prices',
                'agent  › step 3 · writes your summary ✓',
              ]}
            />
            <div className="uses">
              {USES.map(([t, d]) => (
                <div key={t}>
                  <b>{t}</b>
                  <p className="small muted">{d}</p>
                </div>
              ))}
            </div>
          </article>

          <article id="pays" className="chapter">
            <span className="chapter-n">02</span>
            <h2 className="section">What does it pay for?</h2>
            <p className="chapter-lead">The best tools charge per use, and the agent pays them itself.</p>
            <p>
              Good data, search, AI models and computing power cost money. Until now every service needed a person: sign up, add a card, copy
              an API key, pick a monthly plan. An agent can’t do any of that.
            </p>
            <p>
              On Tempo, services use <b>MPP</b>, a way to charge per request. The service replies “this costs one cent”, the agent pays in
              digital dollars in under a second, and gets its answer. No account, no card, no key.
            </p>
            <Scene label="What a paid request looks like" lines={['agent  › GET nansen.ai/token-info', 'nansen › 402 · this costs $0.01', 'agent  › pays $0.01 on Tempo', 'nansen › 200 · here is your data ✓']} />
            <div className="prices">
              {PRICES.map(([v, t, who]) => (
                <div key={t}>
                  <b>{v}</b>
                  <span>{t}</span>
                  <small>{who}</small>
                </div>
              ))}
            </div>
          </article>

          <article id="wrong" className="chapter">
            <span className="chapter-n">03</span>
            <h2 className="section">What goes wrong today</h2>
            <p className="chapter-lead">Paying per call is easy. Giving an agent money safely is not.</p>
            <div className="wrong">
              {WRONG.map((w, i) => (
                <div key={w.t} className="wrong-card">
                  <span className="fix-n">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{w.t}</h3>
                  <p className="muted">{w.d}</p>
                  <p className="eg"><b>For example:</b> {w.eg}</p>
                  <span className="wrong-fix">Fixed by {w.fix} ↓</span>
                </div>
              ))}
            </div>
          </article>

          <article id="pitstop" className="chapter">
            <span className="chapter-n">04</span>
            <h2 className="section">What Pitstop does</h2>
            <p className="chapter-lead">In a race, the driver goes fast and the pit crew keeps the car running. Your agent drives. Pitstop is the crew.</p>
            <div className="does">
              {DOES.map((d) => (
                <a key={d.k} href={d.href} className="does-card lift">
                  <span className="partner-role">{d.k}</span>
                  <h3>{d.t}</h3>
                  <p className="muted">{d.d}</p>
                  <span className="proof-chip">✓ {d.proof}</span>
                </a>
              ))}
            </div>
            <p className="chapter-close">
              The result: you give the agent <b>a budget, not your wallet</b>.
            </p>
          </article>
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
              <a className="btn signal-btn" href="/fuel">Fuel an agent</a>
              <a className="btn" href="/guard">Set a limit</a>
              <a className="btn ghost" href="/docs">How to use</a>
            </div>
          </div>
          <ReplayBoard />
        </div>
      </div>

      <Guide />

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

    </main>
  )
}
