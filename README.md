# Pitstop

[![CI](https://github.com/kriss39/pitstop/actions/workflows/ci.yml/badge.svg)](https://github.com/kriss39/pitstop/actions/workflows/ci.yml) · MIT

**Refuel your AI agents from any chain in seconds, and keep them on a leash the Tempo protocol enforces.**

Live app: **https://fuel.pitstopgas.workers.dev** · Live usage: [/stats](https://fuel.pitstopgas.workers.dev/stats) · X: [@pitstop_agents](https://x.com/pitstop_agents) · Alerts: [@pitstop_alert_bot](https://t.me/pitstop_alert_bot) · Help & feedback: [pitstop.agents@gmail.com](mailto:pitstop.agents@gmail.com)

AI agents now pay for APIs per call over [MPP](https://mpp.dev): 137 services on mpp.dev, 134 of them payable on Tempo, from Anthropic and OpenAI to Dune, Nansen and Exa. Tempo gives every wallet access keys with spending limits. What's still missing is everything around them:

- **The money is somewhere else.** Owners hold stablecoins and gas tokens on Solana, Base, Ethereum and other chains; the agent needs USDC.e on Tempo.
- **Nobody is watching.** The agent runs dry halfway through a task, or burns its budget, and the owner finds out too late.

Pitstop is the pit crew around Tempo's keys. It fuels the agent from any chain through LI.FI in about two seconds, sets up its spending key (daily limit, token, end date) from a passkey in the browser, refills it automatically, and watches it from a dashboard and Telegram. The limit is enforced by Tempo itself: the owner's passkey is the only thing that can change it.

```
# 1 Nansen token info: USDC   paid $0.01 → 200 · limit left $0.0400
# 2 Nansen token info: WETH   paid $0.01 → 200 · limit left $0.0299
# 3 Nansen token info: LINK   paid $0.01 → 200 · limit left $0.0199
# 4 Nansen token info: UNI    paid $0.01 → 200 · limit left $0.0099
# 5 Nansen token info: AAVE   BLOCKED by the guard: SpendingLimitExceeded
```

## Proof on mainnet

Every flow below ran on Tempo mainnet with real funds (2026-10-04).

| Flow | Result | Link |
|---|---|---|
| Fuel from Base | 2 USDC → 1.994511 USDC.e on Tempo via Across, same block second | [LI.FI Scan](https://scan.li.fi/tx/0x53d3dda1b3309d2888cea5c352d0ab9f2120556990286b2e1ef11a33f9a9f9a2) |
| Fuel from Solana | 2 USDC → 1.974477 USDC.e via Relay in ~1 s | [LI.FI Scan](https://scan.li.fi/tx/2hQa9oxN1M4ondZRwr7LvAyzahW7SAnW6tqEc8PhbfionBLdafXD12qLvsKyXnJJ5roG9nwY6pcc4wBKawZEER97) |
| Agent pays Nansen over MPP | $0.01 per call, signed by the agent's access key | [Tempo tx](https://explore.tempo.xyz/tx/0xe172ca615f977aaeaa2ca03635a7715d129229470a25d987f397e184514ca7d0) |
| Agent pays Codex over MPP | $0.001 per price lookup | [Wallet](https://explore.tempo.xyz/address/0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0) |
| Daily limit enforced | 5th call rejected: `Account keychain error: SpendingLimitExceeded` (no tx, no cost) | [Wallet](https://explore.tempo.xyz/address/0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0) |
| Key revoked by owner | next spend rejected: `AccountKeychainError(KeyAlreadyRevoked)` | — |
| Auto-refill | agent below threshold → home wallet on Base fuels it (+1.994511 USDC.e) | [Basescan](https://basescan.org/tx/0xf465aa34bff733e4503f3e5c711cd068b076a3e3ef74bed6366d90c3c775e5f8) |
| MCP `fuel_agent` | Claude tool call → +0.997091 USDC.e on Tempo | [Tempo tx](https://explore.tempo.xyz/tx/0xfcbe0e731184eae38c2a2a61e29cddea78503c26b25284fd3377c5030a5d01c4) |

Every transfer routed through Pitstop is counted live, with our own tests marked, at [/stats](https://fuel.pitstopgas.workers.dev/stats).

## How it works

```
 Owner (you)                         Agent machine                      Tempo
 ───────────                         ─────────────                      ─────
 passkey (Touch ID) ──authorizes──▶  access key (P256)  ──pays MPP──▶  Nansen, Dune, 130+ services
   │   limit / token / end date          │                              ▲
   │                                     │ low on fuel?                 │ USDC.e
   ▼                                     ▼                              │
 Fuel page: USDC, ETH, SOL… ──────▶ LI.FI (Across, Relay…) ────────────┘
 from Base, Solana, Ethereum,       home wallet on Base ──auto-refill──┘
 Arbitrum, Optimism, Polygon,
 Avalanche, Arc
```

1. **Fuel.** Pay with USDC or the chain's own token (ETH, POL, AVAX, SOL) from Base, Solana, Ethereum, Arbitrum, Optimism, Polygon, Avalanche or Arc. The agent receives USDC.e (or PathUSD, USDT0, OUSD) on Tempo. USDC usually routes through Across or Relay in 1–2 seconds; gas tokens can take other bridges and longer. Every cost is itemized before you sign: Pitstop 0.1%, LI.FI 0.25%, the bridge and gas.
2. **Guard.** The agent's wallet is a Tempo passkey account. The owner authorizes the agent's P256 access key with Tempo's Account Keychain: a daily limit in one token, an end date and, optionally, the only services it may pay (Tempo's recipient scopes, TIP-1011). The owner can change the limit or revoke the key at any time; the agent can do neither.
3. **Pay.** The agent pays MPP services with `mppx`, signing with its access key. Each payment, and its network fee, counts against the limit. Over the limit, Tempo rejects the payment before it reaches the chain.
4. **Refill.** When the agent's balance drops below a threshold, it tops itself up from a small "home wallet" on Base, with a daily cap and a cooldown.
5. **Watch.** The dashboard shows what's left today, every payment and which service it went to. A Cloudflare cron checks watched agents every minute and messages the owner on Telegram when fuel is low, the limit is used up, or the key is revoked or expires.

## Quickstart

**1. Owner, in the browser:** open [/guard](https://fuel.pitstopgas.workers.dev/guard) and create the owner passkey. Its address is the agent's wallet. Fuel it with a few dollars from [/fuel](https://fuel.pitstopgas.workers.dev/fuel) ($5 minimum).

**2. Give the agent a key.** Two ways:

- **Create it in the browser** (fastest): on Guard, press *Create a key here*. The page hands you a ready-made `.env` or Claude/Cursor config with `PITSTOP_AGENT_KEY`. Nothing is stored or sent to a server.
- **Let the agent make its own** (the secret never leaves its machine): run `pnpm key` in `examples/demo-agent`, or ask the agent for its `guard_link`. It prints a link that opens Guard with the key filled in.

Then set a daily limit and authorize it with your passkey.

**3. Agent machine:** you need Node 22 or newer and pnpm (`corepack enable` sets it up). Put the variables below in a `.env` file at the repo root; the demo agent's scripts read it from there.

```sh
git clone https://github.com/kriss39/pitstop && cd pitstop
pnpm install && pnpm build
cd examples/demo-agent
pnpm keystatus       # limit left today, reset time, expiry
pnpm demo            # pay Codex and Nansen per call until the guard stops it
pnpm run home-wallet # optional: a small Base wallet for auto-refills
pnpm refill          # one refill check; pnpm watch keeps it running
```

| Variable | What |
|---|---|
| `AGENT_WALLET` | The guarded Tempo wallet (the owner passkey's address) |
| `PITSTOP_AGENT_KEY` | The agent's access key, if it was created in the browser; otherwise `.pitstop/agent-key.json` is used |
| `AGENT_TOKEN` | Token the key may spend: `USDCe` (default; what MPP services charge), `PathUSD`, `USDT0` or `OUSD` |
| `PITSTOP_DIR` | Folder for `agent-key.json` and `home-wallet.json` (default `./.pitstop`) |
| `REFILL_THRESHOLD`, `REFILL_AMOUNT`, `REFILL_MAX_PER_DAY` | Auto-refill: refill below this, by this much, at most this per day (USDC) |
| `PITSTOP_FEE` | Integrator fee on agent refills (default 0.001 = 0.1%; `0` turns it off) |
| `LIFI_API_KEY` | Optional LI.FI API key for higher rate limits |

**Claude / Cursor (MCP):** add to `.mcp.json`:

```json
{
  "mcpServers": {
    "pitstop": {
      "command": "node",
      "args": ["/path/to/pitstop/packages/mcp/dist/index.js"],
      "env": { "AGENT_WALLET": "0x…", "PITSTOP_AGENT_KEY": "0x…", "PITSTOP_DIR": "/path/to/.pitstop" }
    }
  }
}
```

| Tool | What it does |
|---|---|
| `get_balance` | Stablecoin balances of the agent's Tempo wallet |
| `key_status` | Active / expired / revoked, limit left today, reset time, expiry |
| `fuel_quote` | Read-only LI.FI quote from the home wallet |
| `fuel_agent` | Refuel now (max 5 USDC per call, `REFILL_MAX_PER_DAY` per day, one at a time) |
| `list_mpp_services` | Search mpp.dev for paid APIs |
| `guard_link` | Link for the owner to raise or revoke the limit |

There is deliberately no tool to change limits: the agent can't loosen its own leash.

**Alerts:** message [@pitstop_alert_bot](https://t.me/pitstop_alert_bot) `/watch <wallet> [key] [token]`, `/status`, `/unwatch <wallet>` or `/stop`.

## Security model

- **Non-custodial.** Pitstop's server holds no keys and no funds. The Worker proxies LI.FI quotes for the website only (the API key stays server-side, and it always uses Pitstop's integrator id and fee), reads Solana balances, and sends alerts.
- **Routes are checked before you sign.** `fuelQuote()` rejects a LI.FI route unless it ends at the agent's address on Tempo in the requested token, spends exactly the requested amount and token, calls the LI.FI Diamond, approves only the Diamond, and attaches no unexpected native coin. Approvals are for the exact amount.
- **The agent can spend only what the owner allowed.** Its access key is limited by the protocol (limit, token, end date). It can't authorize keys, raise limits or move funds past the limit.
- **The owner passkey is the root.** Losing it means you can't change limits or revoke the key (the key still expires). Keep it in a synced passkey manager, save the backup Guard shows, and keep balances small. Passkeys are bound to the site's domain (`fuel.pitstopgas.workers.dev`).
- **Browser-created keys** exist only in the page's memory until you copy or download them. Clear your clipboard and delete the downloaded file once the key is on the agent's machine.
- **The home wallet is a hot wallet** on the agent's machine. Fund it with a few dollars only; refills are capped per day, and a refill that was broadcast always counts against the cap, even if confirming it failed.
- Keys on the agent machine live in `.pitstop/` (mode 600, git-ignored).

## Repository

| Path | What |
|---|---|
| `packages/sdk` | `@getpitstop/sdk`: Tempo client, balances, LI.FI fuel (`fuelQuote`, `executeFuel`, `waitForFuel`), guard (`authorizeAgentKey`, `revokeAgentKey`, `getAgentKeyStatus`, `agentAccount`, `pickFeeToken`), auto-refill, MPP directory, recent spends; `@getpitstop/sdk/node` keystore |
| `packages/mcp` | MCP server (stdio) |
| `apps/web` | Landing, Fuel, Guard, Dashboard, Docs and Stats (Vite + React) |
| `apps/api` | Cloudflare Worker: serves the app, LI.FI proxy, Solana balances, usage stats, Telegram webhook, alert cron (D1) |
| `examples/demo-agent` | CLI agent: key, home wallet, spend, Codex + Nansen demo, refill, watch |

`pnpm test` runs the unit tests (route checks, fee split, fee token, refill cap, input parsing, key status); CI runs build and tests on every push.

## Business model

A 0.1% LI.FI integrator fee on every fuel route made through Pitstop, from the website and from agent refills, shown in each quote. Next: fleet dashboards and alerting for teams running many agents, and a hosted refill service for agents that can't keep a home wallet.

## Built with

[Tempo](https://tempo.xyz) (Account Keychain, passkey accounts, TIP-20) · [LI.FI](https://li.fi) (Across, Relay and other bridges) · [MPP](https://mpp.dev) / mppx · [viem](https://viem.sh) · Cloudflare Workers + D1 · Model Context Protocol SDK

## License

MIT
