import { useEffect, useState, type ReactNode } from 'react'
import { APP_URL, BOT_HANDLE, CopyButton } from './ui'

const SECTIONS = [
  ['overview', 'Overview'],
  ['quickstart', 'Quickstart'],
  ['fuel', 'Fuel an agent'],
  ['guard', 'Set a limit'],
  ['agent', 'Set up the agent'],
  ['pay', 'Pay MPP services'],
  ['mcp', 'Claude & Cursor (MCP)'],
  ['alerts', 'Alerts'],
  ['sdk', 'SDK'],
  ['security', 'Security'],
  ['faq', 'FAQ'],
] as const

function Code({ children }: { children: string }) {
  return (
    <div className="doc-code">
      <pre>{children}</pre>
      <CopyButton text={children} />
    </div>
  )
}

function Note({ kind = 'info', children }: { kind?: 'info' | 'warn'; children: ReactNode }) {
  return <p className={`doc-note ${kind}`}>{children}</p>
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="doc-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/** Highlights the section currently on screen in the table of contents. */
function useActiveSection() {
  const [active, setActive] = useState<string>(SECTIONS[0][0])
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    SECTIONS.forEach(([id]) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])
  return active
}

const MCP_CONFIG = `{
  "mcpServers": {
    "pitstop": {
      "command": "node",
      "args": ["/path/to/pitstop/packages/mcp/dist/index.js"],
      "env": {
        "AGENT_WALLET": "0xYourAgentWallet",
        "PITSTOP_DIR": "/path/to/.pitstop"
      }
    }
  }
}`

const PAY_SNIPPET = `import { agentAccount } from '@pitstop/sdk'
import { Mppx, tempo } from 'mppx/client'

// The agent signs with its own key, inside the owner's limit.
const account = agentAccount(AGENT_KEY, AGENT_WALLET)
const mppx = Mppx.create({ methods: [tempo({ account })], polyfill: false })

const res = await mppx.fetch('https://api.nansen.ai/api/v1/tgm/token-information', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Payment' },
  body: JSON.stringify({ chain: 'ethereum', token_address: '0xA0b8…eB48', timeframe: '1d' }),
})`

const FUEL_SNIPPET = `import { executeFuel, fuelQuote, SOURCE_TOKENS, waitForFuel } from '@pitstop/sdk'

const quote = await fuelQuote({
  fromChain: SOURCE_TOKENS.base.chainId,
  fromToken: SOURCE_TOKENS.base.USDC,
  fromAmount: 2_000_000n,        // 2 USDC (6 decimals)
  fromAddress: myAddress,
  toAddress: agentWallet,        // the agent's Tempo wallet
})
const hash = await executeFuel({ quote, wallet, client })
await waitForFuel({ txHash: hash, fromChain: quote.fromChain })`

export function Docs() {
  const active = useActiveSection()
  // Links like /docs#mcp arrive before the page renders; scroll once it has.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  return (
    <main className="page wide docs">
      <header className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="eyebrow">Docs</p>
        <h1 className="title">How to use Pitstop</h1>
        <p className="lede">Everything you need to fuel an agent, put it on a daily budget, and connect it to Claude or Cursor.</p>
      </header>

      <div className="docs-layout">
        <nav className="toc" aria-label="On this page">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined}>
              {label}
            </a>
          ))}
        </nav>

        <article className="doc-body">
          <Section id="overview" title="Overview">
            <p>
              Pitstop is a pit crew for AI agents on Tempo. It does two things: it <b>fuels</b> the agent with USDC from other chains in
              seconds, and it puts the agent on a <b>daily budget</b> that the Tempo chain enforces.
            </p>
            <div className="doc-flow">
              {[
                ['Fuel', 'USDC from 7 chains'],
                ['Guard', 'Your passkey sets a daily limit'],
                ['Pay', 'The agent pays APIs per call'],
                ['Refill', 'It tops itself up when low'],
              ].map(([t, d], i) => (
                <div key={t}>
                  <span className="n">0{i + 1}</span>
                  <b>{t}</b>
                  <span className="small muted">{d}</span>
                </div>
              ))}
            </div>
            <p className="muted">
              Three roles: <b>you</b> (the owner, with a passkey), <b>the agent</b> (software with its own spending key) and{' '}
              <b>the services</b> it pays (like Nansen, through MPP).
            </p>
          </Section>

          <Section id="quickstart" title="Quickstart">
            <ol className="doc-steps">
              <li>
                <b>Create your passkey.</b> Open <a href="/guard">Guard</a> and create the owner passkey. Its address becomes the agent’s
                wallet.
              </li>
              <li>
                <b>Fuel the wallet.</b> On <a href="/fuel">Fuel</a>, send 1–5 USDC to that address from any supported chain. A little of it pays
                Tempo fees.
              </li>
              <li>
                <b>Create the agent’s key.</b> On the agent’s machine, run <code>pnpm key</code>. It prints the key’s address.
              </li>
              <li>
                <b>Authorize it.</b> Back on Guard, paste the key address, choose a daily limit and an expiry, and confirm with your passkey.
              </li>
              <li>
                <b>Let it work.</b> Put the wallet address in the agent’s <code>.env</code> as <code>AGENT_WALLET</code> and run{' '}
                <code>pnpm demo</code>.
              </li>
            </ol>
          </Section>

          <Section id="fuel" title="Fuel an agent">
            <p>Send USDC from any of the seven chains below. The agent receives one of four stablecoins on Tempo: USDC.e (default), PathUSD, USDT0 or OUSD.</p>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>From</th><th>Wallets</th><th>Typical time</th><th>Route</th></tr></thead>
              <tbody>
                <tr><td>Base</td><td>Rabby, MetaMask, Phantom</td><td>~2 s</td><td>Across</td></tr>
                <tr><td>Arbitrum</td><td>Rabby, MetaMask</td><td>~2 s</td><td>Across</td></tr>
                <tr><td>Optimism</td><td>Rabby, MetaMask</td><td>~2 s</td><td>Across</td></tr>
                <tr><td>Ethereum</td><td>Rabby, MetaMask</td><td>~2 s</td><td>Across (higher gas)</td></tr>
                <tr><td>Polygon</td><td>Rabby, MetaMask</td><td>~2 s</td><td>Across</td></tr>
                <tr><td>Avalanche</td><td>Rabby, MetaMask</td><td>~1 s</td><td>Relay</td></tr>
                <tr><td>Solana</td><td>Phantom, MetaMask, Solflare, Backpack</td><td>~1 s</td><td>Relay</td></tr>
              </tbody>
            </table></div>
            <ul className="doc-list">
              <li>Up to 5 USDC per transfer on the web app. Approvals are for the exact amount.</li>
              <li>Fees: a few cents for the bridge, plus a 0.25% Pitstop fee. Every quote shows the total.</li>
              <li>Before you sign, Pitstop checks that the route ends at the agent’s address on Tempo and calls the official LI.FI contract.</li>
            </ul>
            <p><b>Funding links.</b> Share a link that opens Fuel with the agent already filled in:</p>
            <Code>{`${APP_URL}/fuel?to=0xAgentWallet&from=solana`}</Code>
          </Section>

          <Section id="guard" title="Set a limit">
            <p>The owner passkey controls three things on the agent’s key:</p>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>Control</th><th>What it does</th></tr></thead>
              <tbody>
                <tr><td>Daily limit</td><td>The most the agent can spend in 24 hours, in that stablecoin. Tempo fees paid in it count too.</td></tr>
                <tr><td>Scope</td><td>The one stablecoin the key may spend: USDC.e, PathUSD, USDT0 or OUSD. Pick the one your agent’s services charge in.</td></tr>
                <tr><td>Expiry</td><td>After this date the key stops working on its own.</td></tr>
              </tbody>
            </table></div>
            <ul className="doc-list">
              <li><b>At the limit</b>, Tempo refuses the payment (<code>SpendingLimitExceeded</code>). Nothing is spent.</li>
              <li><b>Change the limit</b> any time on Guard with “Set daily limit”.</li>
              <li><b>Revoke</b> stops the key for good (<code>KeyAlreadyRevoked</code>). Create a new key with <code>pnpm key --new</code>.</li>
            </ul>
            <Note kind="warn">
              Your passkey is the only owner of the wallet. Keep it in a synced passkey manager, and save the backup shown on Guard so you can
              find the wallet on another device. Passkeys are tied to this site’s address.
            </Note>
          </Section>

          <Section id="agent" title="Set up the agent">
            <p>From <code>examples/demo-agent</code> in the repo, after <code>pnpm install && pnpm build</code>:</p>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>Command</th><th>What it does</th></tr></thead>
              <tbody>
                <tr><td><code>pnpm key</code></td><td>Creates the agent’s spending key and prints its address.</td></tr>
                <tr><td><code>pnpm key --new</code></td><td>Replaces a revoked key.</td></tr>
                <tr><td><code>pnpm keystatus</code></td><td>Shows limit left today, reset time and expiry.</td></tr>
                <tr><td><code>pnpm run home-wallet</code></td><td>Creates a small Base wallet the agent refills itself from.</td></tr>
                <tr><td><code>pnpm demo</code></td><td>Pays Nansen per call until the limit stops it.</td></tr>
                <tr><td><code>pnpm refill</code></td><td>Tops up once if fuel is below the threshold.</td></tr>
                <tr><td><code>pnpm watch</code></td><td>Keeps the agent fuelled, checking every minute.</td></tr>
              </tbody>
            </table></div>
            <p><b>Settings</b> in <code>.env</code>:</p>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>Name</th><th>Meaning</th><th>Default</th></tr></thead>
              <tbody>
                <tr><td><code>AGENT_WALLET</code></td><td>The agent’s wallet (from Guard)</td><td>required</td></tr>
                <tr><td><code>AGENT_TOKEN</code></td><td>Stablecoin the key is scoped to</td><td>USDCe</td></tr>
                <tr><td><code>REFILL_THRESHOLD</code></td><td>Refill when fuel is below this (USDC)</td><td>1</td></tr>
                <tr><td><code>REFILL_AMOUNT</code></td><td>How much to send per refill</td><td>2</td></tr>
                <tr><td><code>REFILL_MAX_PER_DAY</code></td><td>Most the agent may refill in a day</td><td>6</td></tr>
                <tr><td><code>LIFI_API_KEY</code></td><td>Optional; raises LI.FI rate limits</td><td>none</td></tr>
              </tbody>
            </table></div>
            <Note>Keys live only on the agent’s machine, in <code>.pitstop/</code>. Never commit or share that folder.</Note>
          </Section>

          <Section id="pay" title="Pay MPP services">
            <p>
              MPP services charge per request. The agent pays with its own key, so every payment counts against its daily limit. No account
              or API key with the service is needed.
            </p>
            <Code>{PAY_SNIPPET}</Code>
            <Note>
              Nansen offers several payment methods. Send <code>authorization: Payment</code> so it answers with the Tempo (MPP) option.
              Find more services on <a href="https://mpp.dev" target="_blank" rel="noreferrer">mpp.dev</a>.
            </Note>
          </Section>

          <Section id="mcp" title="Claude & Cursor (MCP)">
            <p>Add Pitstop as an MCP server, then ask in plain words: “What’s my agent’s balance?” or “Fuel my agent with 1 USDC”.</p>
            <Code>{MCP_CONFIG}</Code>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
              <tbody>
                <tr><td><code>get_balance</code></td><td>Fuel on Tempo</td></tr>
                <tr><td><code>key_status</code></td><td>Limit left today, reset time, expiry</td></tr>
                <tr><td><code>fuel_quote</code></td><td>Price of a refuel (read only)</td></tr>
                <tr><td><code>fuel_agent</code></td><td>Refuel now from the home wallet (spends real money)</td></tr>
                <tr><td><code>list_mpp_services</code></td><td>Find paid APIs</td></tr>
                <tr><td><code>guard_link</code></td><td>A link for the owner to raise or revoke the limit</td></tr>
              </tbody>
            </table></div>
            <Note>There’s no tool to change limits. The agent can ask; only you can decide.</Note>
          </Section>

          <Section id="alerts" title="Alerts">
            <p>
              Open <a href={`https://t.me/${BOT_HANDLE}`} target="_blank" rel="noreferrer">@{BOT_HANDLE}</a> on Telegram and press Start.
            </p>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>Command</th><th>What it does</th></tr></thead>
              <tbody>
                <tr><td><code>/watch &lt;wallet&gt; &lt;key&gt; [token]</code></td><td>Alert me about this agent (token defaults to USDCe)</td></tr>
                <tr><td><code>/status</code></td><td>Show my agents now</td></tr>
                <tr><td><code>/stop</code></td><td>Stop all alerts</td></tr>
              </tbody>
            </table></div>
            <p className="muted">You get a message when fuel drops below $1, and once per day when the limit is used up.</p>
          </Section>

          <Section id="sdk" title="SDK">
            <p>
              <code>@pitstop/sdk</code> is the TypeScript library behind the app, the agent and the MCP server.
            </p>
            <Code>{FUEL_SNIPPET}</Code>
            <div className="table-wrap"><table className="doc-table">
              <thead><tr><th>Function</th><th>Use it to</th></tr></thead>
              <tbody>
                <tr><td><code>fuelQuote</code> · <code>executeFuel</code> · <code>waitForFuel</code></td><td>Quote, send and track a refuel</td></tr>
                <tr><td><code>authorizeAgentKey</code> · <code>updateAgentLimit</code> · <code>revokeAgentKey</code></td><td>Manage the agent’s key (owner)</td></tr>
                <tr><td><code>getAgentKeyStatus</code></td><td>Read limit left, reset time and expiry</td></tr>
                <tr><td><code>agentAccount</code></td><td>Sign as the agent, inside its limit</td></tr>
                <tr><td><code>refillIfLow</code> · <code>startAutoRefill</code></td><td>Keep the agent fuelled</td></tr>
                <tr><td><code>getBalance</code> · <code>getRecentSpends</code></td><td>Fuel level and recent payments</td></tr>
              </tbody>
            </table></div>
          </Section>

          <Section id="security" title="Security">
            <ul className="doc-list">
              <li><b>Non-custodial.</b> Pitstop never holds keys or funds. You sign every transfer in your own wallet.</li>
              <li><b>Limits are on-chain.</b> Tempo checks every payment. There is no Pitstop server to bypass.</li>
              <li><b>The agent can’t raise its own limit.</b> Only the owner passkey can.</li>
              <li><b>Keep hot wallets small.</b> The agent’s home wallet sits on its machine; refills are capped per day.</li>
            </ul>
          </Section>

          <Section id="faq" title="FAQ">
            <div className="faq">
              {[
                ['Does Pitstop hold my money?', 'No. Funds move straight from your wallet to the agent’s wallet.'],
                ['What does it cost?', 'A few cents in bridge fees plus 0.25%. Each quote shows the total before you sign.'],
                ['What if I lose my passkey?', 'You can’t change the limit any more, but the key still expires. Keep balances small.'],
                ['Can I use it without the CLI?', 'Yes. Fuel and Guard work in the browser; the CLI and MCP are for running the agent.'],
                ['Which stablecoin should I use?', 'USDC.e works with most MPP services today, and it’s the default. The MPP docs now recommend OUSD; pick it if your services charge in OUSD.'],
                ['Which services can the agent pay?', 'Any MPP service on Tempo, such as Nansen and Dune. See mpp.dev for the list.'],
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p className="small">{a}</p>
                </details>
              ))}
            </div>
          </Section>
        </article>
      </div>
    </main>
  )
}
