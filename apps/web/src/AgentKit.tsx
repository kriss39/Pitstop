import { useEffect, useRef, useState } from 'react'
import { CopyButton } from './basics'

const SKILL_URL = 'https://fuel.pitstopgas.workers.dev/SKILL.md'

/** Services shown in the fan-out and the runs, with their logos; prices below are their real MPP prices (mpp.dev, Oct 2026). */
const SVC = {
  nansen: { name: 'Nansen', icon: '/services/nansen.png' },
  codex: { name: 'Codex', icon: '/services/codex.png' },
  exa: { name: 'Exa', icon: '/services/exa.png' },
  firecrawl: { name: 'Firecrawl', icon: '/services/firecrawl.png' },
  perplexity: { name: 'Perplexity', icon: '/services/perplexity.png' },
  dune: { name: 'Dune', icon: '/services/dune.png' },
} as const
type SvcId = keyof typeof SVC

function Avatar({ id, size = 30 }: { id: SvcId; size?: number }) {
  return <img className="svc-av" src={SVC[id].icon} alt="" width={size} height={size} />
}

/** One line the owner pastes into their agent; the agent reads SKILL.md and sets itself up. */
export function SetupLine() {
  const [tab, setTab] = useState<'claude' | 'codex' | 'other'>('claude')
  const command =
    tab === 'claude'
      ? `claude "Read ${SKILL_URL} and set up Pitstop for my agent"`
      : tab === 'codex'
        ? `codex "Read ${SKILL_URL} and set up Pitstop for my agent"`
        : `Read ${SKILL_URL} and set up Pitstop for my agent.`
  return (
    <section className="setup-band">
      <div className="shell setup-grid">
        <div className="setup-copy">
          <p className="eyebrow">For agents</p>
          <h2 className="section">Set your agent up in one line</h2>
          <p className="lede">
            Paste this into Claude Code, Codex or any agent. It reads Pitstop’s skill file, installs the tools, and asks you for its wallet
            and a daily limit. Then it can pay for APIs on its own, inside that limit.
          </p>
          <div className="seg small-seg setup-tabs" role="radiogroup" aria-label="Agent">
            {(
              [
                ['claude', 'Claude Code'],
                ['codex', 'Codex'],
                ['other', 'Any agent'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="cmd">
            <code>
              <span className="cmd-prompt" aria-hidden>
                {tab === 'other' ? '›' : '$'}
              </span>{' '}
              {command}
            </code>
            <CopyButton text={command} label="Copy" />
          </div>
          <p className="small muted">
            Prefer to read it first? <a href="/SKILL.md" target="_blank" rel="noreferrer">SKILL.md</a> · or follow the{' '}
            <a href="/docs#agent">manual setup</a>.
          </p>
        </div>
        <FanOut />
      </div>
    </section>
  )
}

/** Pitstop in the middle, fuel lines out to the services an agent pays. */
function FanOut() {
  const ids = Object.keys(SVC) as SvcId[]
  const y = (i: number) => 40 + i * 64
  return (
    <div className="fanout" aria-label="Pitstop fuels payments to MPP services">
      <svg viewBox="0 0 420 400" role="img" aria-hidden>
        <defs>
          <linearGradient id="fuel-line" x1="0" x2="1">
            <stop offset="0" stopColor="#ffd400" />
            <stop offset="1" stopColor="#8a6cff" />
          </linearGradient>
        </defs>
        {ids.map((id, i) => (
          <path key={id} className="fan-path" d={`M 92 200 C 200 200, 220 ${y(i)}, 320 ${y(i)}`} stroke="url(#fuel-line)" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
        <rect x="30" y="168" width="64" height="64" rx="16" fill="#ffd400" />
        <rect x="45" y="180" width="9" height="40" rx="1.5" fill="#111" />
        <path d="M54 184.5h7a11.5 11.5 0 0 1 0 23h-7" fill="none" stroke="#111" strokeWidth="9" />
        <path d="M61 196 68.5 188.5" stroke="#111" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="61" cy="196" r="3.2" fill="#111" />
      </svg>
      <ul className="fan-svcs">
        {ids.map((id, i) => (
          <li key={id} style={{ top: `${(y(i) / 400) * 100}%` }}>
            <Avatar id={id} size={34} />
            <span>{SVC[id].name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type Step = { svc: SvcId; what: string; usd: number }
type UseCase = { title: string; prompt: string; limit: number; steps: Step[]; outcome: string; refused?: boolean }

// Prices are the services' own MPP prices; network fees add a fraction of a cent per call.
const CASES: UseCase[] = [
  {
    title: 'Smart-money digest',
    prompt:
      'Every morning, find which tokens smart money bought on Ethereum in the last 24 hours using Nansen, add live prices from Codex, and send me a 5-line summary. Stay under $0.10 a day.',
    limit: 0.1,
    steps: [
      { svc: 'nansen', what: 'Smart-money net flows, 24 h', usd: 0.05 },
      { svc: 'codex', what: 'Price · LINK', usd: 0.001 },
      { svc: 'codex', what: 'Price · UNI', usd: 0.001 },
      { svc: 'codex', what: 'Price · AAVE', usd: 0.001 },
      { svc: 'codex', what: 'Price · ENA', usd: 0.001 },
      { svc: 'codex', what: 'Price · ONDO', usd: 0.001 },
    ],
    outcome: 'Digest sent: 5 tokens, prices and 24 h flows',
  },
  {
    title: 'Research brief with sources',
    prompt:
      'Research what changed in stablecoin regulation this week. Search with Exa, read the five best sources with Firecrawl, and write me a one-page brief with links. Keep it under $0.05.',
    limit: 0.05,
    steps: [
      { svc: 'exa', what: 'Search: stablecoin regulation, this week', usd: 0.01 },
      { svc: 'exa', what: 'Search: follow-up on two bills', usd: 0.01 },
      { svc: 'firecrawl', what: 'Read source 1', usd: 0.002 },
      { svc: 'firecrawl', what: 'Read source 2', usd: 0.002 },
      { svc: 'firecrawl', what: 'Read source 3', usd: 0.002 },
      { svc: 'firecrawl', what: 'Read source 4', usd: 0.002 },
      { svc: 'firecrawl', what: 'Read source 5', usd: 0.002 },
    ],
    outcome: 'Brief ready: one page, 5 linked sources',
  },
  {
    title: 'Quick answers, on a budget',
    prompt:
      'Answer my questions about the market today with Perplexity search, citing sources. Use at most $0.03 today and tell me when you are close to it.',
    limit: 0.03,
    steps: [
      { svc: 'perplexity', what: 'Search: why is ETH up today?', usd: 0.006 },
      { svc: 'perplexity', what: 'Search: biggest stablecoin inflows', usd: 0.006 },
      { svc: 'perplexity', what: 'Search: upcoming token unlocks', usd: 0.006 },
    ],
    outcome: 'Three answers with sources · $0.012 left today',
  },
  {
    title: 'When the budget runs out',
    prompt:
      'Get Nansen token intelligence for these 10 tokens: USDC, WETH, LINK, UNI, AAVE, MKR, LDO, ARB, OP, PEPE.',
    limit: 0.05,
    steps: [
      { svc: 'nansen', what: 'Token info · USDC', usd: 0.01 },
      { svc: 'nansen', what: 'Token info · WETH', usd: 0.01 },
      { svc: 'nansen', what: 'Token info · LINK', usd: 0.01 },
      { svc: 'nansen', what: 'Token info · UNI', usd: 0.01 },
      { svc: 'nansen', what: 'Token info · AAVE', usd: 0.01 },
    ],
    outcome: 'Refused by Tempo: with network fees, $0.0099 was left and the call needed $0.01 plus a fee. No transaction, no cost.',
    refused: true,
  },
]

const money = (v: number) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`

/** Prompt cards on the left; on the right, a replay of the agent doing that job inside its limit. */
export function UseCases() {
  const [pick, setPick] = useState(0)
  const [step, setStep] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const c = CASES[pick]!
  // The last step of the refused case never goes through.
  const paidSteps = c.refused ? c.steps.length - 1 : c.steps.length

  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return setInView(true)
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => setStep(reduce ? c.steps.length + 1 : 0), [pick])
  useEffect(() => {
    if (!inView || reduce) return
    // Play the run, hold the result, then move on to the next example.
    const done = step > c.steps.length
    const t = setTimeout(() => (done ? (setPick((p) => (p + 1) % CASES.length), setStep(0)) : setStep((s) => s + 1)), done ? 4200 : 850)
    return () => clearTimeout(t)
  }, [step, inView, pick])

  const shown = Math.min(step, c.steps.length)
  const spent = c.steps.slice(0, Math.min(shown, paidSteps)).reduce((s, x) => s + x.usd, 0)
  const finished = step > c.steps.length

  return (
    <section id="use-cases">
      <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="lane" />
        <h2 className="section">What your agent could do</h2>
        <p className="lede">Real jobs, priced per call by the services themselves. The daily limit decides how far the agent can go.</p>
        <div className="uc-grid" ref={ref}>
          <div className="uc-list">
            {CASES.map((u, i) => (
              <div key={u.title} className={`uc-card${i === pick ? ' on' : ''}`}>
                <button className="uc-title" onClick={() => setPick(i)} aria-pressed={i === pick}>
                  <b>{u.title}</b>
                  <span className="small muted">Limit ${u.limit.toFixed(2)} a day</span>
                </button>
                <p className="small">{u.prompt}</p>
                <CopyButton text={u.prompt} label="Copy prompt" className="link-btn" />
              </div>
            ))}
          </div>
          <div className={`uc-run${c.refused && finished ? ' refused' : ''}`} aria-live="polite">
            <div className="uc-run-head">
              <span className="board-tag">Agent run · {c.title}</span>
              <span className="uc-meter-label">
                {money(spent)} of ${c.limit.toFixed(2)}
              </span>
            </div>
            <div className="uc-meter" aria-hidden>
              <i style={{ width: `${Math.min(100, (spent / c.limit) * 100)}%` }} />
            </div>
            <ul className="uc-steps">
              {c.steps.map((s, i) => {
                const state = i < shown ? (c.refused && i === c.steps.length - 1 ? 'no' : 'ok') : i === shown ? 'now' : 'todo'
                return (
                  <li key={i} className={state}>
                    <Avatar id={s.svc} size={26} />
                    <span>
                      <b>{SVC[s.svc].name}</b> · {s.what}
                    </span>
                    <span className="uc-price">{state === 'no' ? 'refused' : state === 'ok' ? money(s.usd) : state === 'now' ? 'paying…' : money(s.usd)}</span>
                  </li>
                )
              })}
            </ul>
            <div className={`uc-outcome${finished ? ' show' : ''}`}>
              <span className={c.refused ? 'bad-text' : 'ok-text'}>{c.refused ? '⛔' : '✓'}</span> {c.outcome}
            </div>
            <p className="uc-foot">Each payment is signed with the agent’s own key and checked by Tempo against the daily limit. Network fees, a fraction of a cent each, count too.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
