# Pitstop

**Refuel your AI agents from any chain in seconds, and keep them on a leash the Tempo protocol enforces.**

Live app: **https://fuel.pitstopgas.workers.dev** · Alerts: [@pitstop_alert_bot](https://t.me/pitstop_alert_bot)

AI agents now pay for APIs per call over [MPP](https://mpp.dev) on Tempo. Two things stop people from letting them: getting stablecoins onto Tempo from where the money actually is (Solana, Base, Ethereum), and trusting an agent with a wallet at all. Pitstop solves both. It fuels the agent from any chain through LI.FI in about a second, and it gives the agent a spending key whose daily limit, token scope and expiry are enforced by Tempo itself. The owner's passkey is the only thing that can change them.

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
| Fuel from Base | 2 USDC → 1.994511 USDCe on Tempo via Across, same block second | [LI.FI Scan](https://scan.li.fi/tx/0x53d3dda1b3309d2888cea5c352d0ab9f2120556990286b2e1ef11a33f9a9f9a2) |
| Fuel from Solana | 2 USDC → 1.974477 USDCe via Relay in ~1 s | [LI.FI Scan](https://scan.li.fi/tx/2hQa9oxN1M4ondZRwr7LvAyzahW7SAnW6tqEc8PhbfionBLdafXD12qLvsKyXnJJ5roG9nwY6pcc4wBKawZEER97) |
| Agent pays Nansen over MPP | $0.01 per call, signed by the agent's access key | [Tempo tx](https://explore.tempo.xyz/tx/0xe172ca615f977aaeaa2ca03635a7715d129229470a25d987f397e184514ca7d0) |
| Daily limit enforced | 5th call rejected: `Account keychain error: SpendingLimitExceeded` (no tx, no cost) | [Wallet](https://explore.tempo.xyz/address/0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0) |
| Key revoked by owner | next spend rejected: `AccountKeychainError(KeyAlreadyRevoked)` | — |
| Auto-refill | agent below threshold → home wallet on Base fuels it (+1.994511 USDCe) | [Basescan](https://basescan.org/tx/0xf465aa34bff733e4503f3e5c711cd068b076a3e3ef74bed6366d90c3c775e5f8) |
| MCP `fuel_agent` | Claude tool call → +0.997091 USDCe on Tempo | [Tempo tx](https://explore.tempo.xyz/tx/0xfcbe0e731184eae38c2a2a61e29cddea78503c26b25284fd3377c5030a5d01c4) |

## How it works

```
 Owner (you)                         Agent machine                      Tempo
 ───────────                         ─────────────                      ─────
 passkey (Touch ID) ──authorizes──▶  access key (P256)  ──pays MPP──▶  Nansen, Dune, 130+ services
   │   limit / scope / expiry            │                              ▲
   │                                     │ low on fuel?                 │ USDCe
   ▼                                     ▼                              │
 Fuel page: USDC on Base / Solana ──▶ LI.FI (Across, Relay) ───────────┘
                                     home wallet on Base ──auto-refill──┘
```

1. **Fuel.** Send USDC from Base (Rabby, MetaMask, Phantom) or Solana (Phantom). `fuelQuote()` refuses any route that doesn't end at the agent's address on Tempo or doesn't call the LI.FI Diamond; approvals are for the exact amount.
2. **Guard.** The agent's wallet is a Tempo passkey account. The owner authorizes the agent's P256 access key with Tempo's Account Keychain: a daily USDCe limit, a token scope and an expiry. The owner can lower the limit or revoke the key at any time.
3. **Pay.** The agent pays MPP services with `mppx`, signing with its access key. Each payment, and its network fee, counts against the limit. Over the limit, Tempo rejects the payment before it reaches the chain.
4. **Refill.** When the agent's balance drops below a threshold, it tops itself up from a small "home wallet" on Base, with a daily cap and a cooldown.
5. **Watch.** A Cloudflare cron checks registered agents every minute and messages the owner on Telegram when fuel is low or the limit is used up.

## Quickstart

```sh
pnpm install && pnpm build
```

**Owner, in the browser:** open [/guard](https://fuel.pitstopgas.workers.dev/guard), create the owner passkey (its address is the agent's wallet), fuel it from [/fuel](https://fuel.pitstopgas.workers.dev/fuel), then authorize the agent's key with a daily limit.

**Agent machine:** set `AGENT_WALLET` in `.env`, then from `examples/demo-agent`:

```sh
pnpm key             # create the agent's access key; prints its address for the owner
pnpm run home-wallet # create the small Base wallet used for refills
pnpm keystatus       # limit left today, reset time, expiry
pnpm demo            # pay Nansen per call until the guard stops it
pnpm refill          # one refill check; pnpm watch keeps it running
```

**Claude / Cursor (MCP):** add to `.mcp.json`:

```json
{
  "mcpServers": {
    "pitstop": {
      "command": "node",
      "args": ["/path/to/pitstop/packages/mcp/dist/index.js"],
      "env": { "AGENT_WALLET": "0x…", "PITSTOP_DIR": "/path/to/.pitstop" }
    }
  }
}
```

| Tool | What it does |
|---|---|
| `get_balance` | Stablecoin balances of the agent's Tempo wallet |
| `key_status` | Active / revoked, limit left today, reset time, expiry |
| `fuel_quote` | Read-only LI.FI quote from the home wallet |
| `fuel_agent` | Refuel now (max 5 USDC per call, `REFILL_MAX_PER_DAY` per day) |
| `list_mpp_services` | Search mpp.dev for paid APIs |
| `guard_link` | Link for the owner to raise or revoke the limit |

There is deliberately no tool to change limits: the agent can't loosen its own leash.

**Alerts:** message [@pitstop_alert_bot](https://t.me/pitstop_alert_bot) `/watch <wallet> <key>`.

## Security model

- **Non-custodial.** Pitstop's server holds no keys and no funds. The Worker proxies LI.FI (so the API key stays server-side), stores public agent addresses, and sends alerts.
- **The agent can spend only what the owner allowed.** Its access key is limited by the protocol (limit, scope, expiry). It can't authorize keys, raise limits or move funds past the limit.
- **The owner passkey is the root.** Losing it means you can't change limits or revoke the key (the key still expires). Keep it in a synced passkey manager and keep balances small. Passkeys are bound to the site's domain (`fuel.pitstopgas.workers.dev`).
- **The home wallet is a hot wallet** on the agent's machine. Fund it with a few dollars only; refills are capped per day.
- Keys on the agent machine live in `.pitstop/` (mode 600, git-ignored).

## Repository

| Path | What |
|---|---|
| `packages/sdk` | `@pitstop/sdk`: Tempo client, balances, LI.FI fuel (`fuelQuote`, `executeFuel`, `waitForFuel`), guard (`authorizeAgentKey`, `revokeAgentKey`, `getAgentKeyStatus`, `agentAccount`), auto-refill, MPP directory, recent spends; `@pitstop/sdk/node` keystore |
| `packages/mcp` | MCP server (stdio) |
| `apps/web` | Landing, Fuel, Guard and Dashboard (Vite + React) |
| `apps/api` | Cloudflare Worker: serves the app, LI.FI proxy, D1 agent registry, Telegram webhook, alert cron |
| `examples/demo-agent` | CLI agent: key, home wallet, spend, Nansen demo, refill, watch |
| `docs/BRIEF.md` | Plan, decisions and the full mainnet log |

## Business model

A 0.1% LI.FI integrator fee on every fuel route made through Pitstop, shown in each quote. Next: fleet dashboards and alerting for teams running many agents, and a hosted refill service for agents that can't keep a home wallet.

## Built with

[Tempo](https://tempo.xyz) (Account Keychain, passkey accounts, TIP-20) · [LI.FI](https://li.fi) (Across, Relay) · [MPP](https://mpp.dev) / mppx · [viem](https://viem.sh) · Cloudflare Workers + D1 · Model Context Protocol SDK

## License

MIT
