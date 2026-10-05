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

type PlanItem = { svc: SvcId; what: string; usd: number; payee: string; calls: number }

// Per-call MPP prices from mpp.dev. `payee` is the name Guard's allowlist knows the service by:
// Firecrawl is paid through Tempo's gateway and Perplexity through Locus.
const PLAN: PlanItem[] = [
  { svc: 'nansen', what: 'Smart-money flows', usd: 0.05, payee: 'Nansen', calls: 1 },
  { svc: 'nansen', what: 'Token info', usd: 0.01, payee: 'Nansen', calls: 0 },
  { svc: 'codex', what: 'Token price', usd: 0.001, payee: 'Codex', calls: 5 },
  { svc: 'exa', what: 'Web search', usd: 0.01, payee: 'Exa', calls: 2 },
  { svc: 'firecrawl', what: 'Read a page', usd: 0.002, payee: 'Tempo MPP gateway', calls: 5 },
  { svc: 'perplexity', what: 'Answer with sources', usd: 0.006, payee: 'Locus gateway', calls: 0 },
]
/** Upper bound on Tempo's network fee per payment; it's paid from the same limit. */
const NET_FEE = 0.0001
const MAX_CALLS = 9999

/** Pick services and calls a day; get the daily limit to set and what fuel lasts. */
export function BudgetPlanner() {
  const [calls, setCalls] = useState(() => PLAN.map((p) => p.calls))
  const [onlyThese, setOnlyThese] = useState(true)
  const set = (i: number, n: number) => setCalls((c) => c.map((v, j) => (j === i ? Math.max(0, Math.min(MAX_CALLS, n)) : v)))

  const count = calls.reduce((s, n) => s + n, 0)
  const cost = PLAN.reduce((s, p, i) => s + p.usd * calls[i]!, 0)
  const fees = count * NET_FEE
  // 20% headroom for price changes and retries, rounded up to the cent.
  const limit = count ? Math.max(0.01, Math.ceil((cost + fees) * 1.2 * 100 - 1e-9) / 100) : 0
  const fuelDays = limit ? Math.floor(5 / (cost + fees)) : 0
  const payees = [...new Set(PLAN.filter((_, i) => calls[i]! > 0).map((p) => p.payee))]
  const guardLink = `/guard?limit=${limit.toFixed(2)}${onlyThese && payees.length ? `&allow=${encodeURIComponent(payees.join(','))}` : ''}`

  return (
    <section id="budget">
      <div className="shell" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="lane" />
        <h2 className="section">Plan your agent’s budget</h2>
        <p className="lede">Choose what it calls and how often. Pitstop works out the daily limit to set and how long fuel lasts.</p>
        <div className="plan-grid">
          <ul className="plan-list">
            {PLAN.map((p, i) => (
              <li key={i} className={calls[i] ? 'on' : ''}>
                <Avatar id={p.svc} size={32} />
                <span className="plan-name">
                  <b>{SVC[p.svc].name}</b>
                  <span className="small muted">
                    {p.what} · {money(p.usd)}
                  </span>
                </span>
                <span className="stepper">
                  <button onClick={() => set(i, calls[i]! - 1)} aria-label={`Fewer ${SVC[p.svc].name} calls`} disabled={!calls[i]}>
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    aria-label={`${SVC[p.svc].name} ${p.what} calls a day`}
                    value={calls[i]}
                    onChange={(e) => set(i, Number(e.target.value.replace(/\D/g, '') || 0))}
                  />
                  <button onClick={() => set(i, calls[i]! + 1)} aria-label={`More ${SVC[p.svc].name} calls`}>
                    +
                  </button>
                </span>
                <span className="plan-sub">{calls[i] ? money(p.usd * calls[i]!) : '—'}</span>
              </li>
            ))}
          </ul>
          <div className="plan-out">
            <span className="board-tag">Suggested daily limit</span>
            <div className="plan-big">${limit.toFixed(2)}</div>
            <dl className="plan-dl">
              <div>
                <dt>{count} calls a day</dt>
                <dd>{money(cost)}</dd>
              </div>
              <div>
                <dt>Network fees, at most</dt>
                <dd>{money(fees)}</dd>
              </div>
              <div>
                <dt>Headroom (20%)</dt>
                <dd>{money(Math.max(0, limit - cost - fees))}</dd>
              </div>
              <div>
                <dt>A month at this pace</dt>
                <dd>${((cost + fees) * 30).toFixed(2)}</dd>
              </div>
            </dl>
            <p className="small plan-note">
              {count
                ? `A $5 fuel-up lasts about ${fuelDays} day${fuelDays === 1 ? '' : 's'}. If the agent tries more, Tempo refuses the payment and nothing is charged.`
                : 'Add a few calls to see a limit.'}
            </p>
            {payees.length > 0 && (
              <label className="check">
                <input type="checkbox" checked={onlyThese} onChange={(e) => setOnlyThese(e.target.checked)} /> Only let it pay these services
              </label>
            )}
            <div className="cta">
              <a className="btn signal-btn" href={count ? guardLink : '/guard'}>
                {count ? `Set a $${limit.toFixed(2)} limit` : 'Set a limit'}
              </a>
              <a className="btn ghost" href="/fuel">
                Fuel an agent
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
