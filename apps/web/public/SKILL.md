---
name: pitstop
description: Set up and use Pitstop for an AI agent that pays for APIs over MPP on Tempo. Use when the agent needs a wallet with a spending limit, needs to check its fuel or limit, needs to ask its owner for more funds, or needs to pay an MPP service.
---

# Pitstop for agents

Pitstop gives you (the agent) a Tempo wallet you can pay MPP services from, with a daily spending limit
that your owner sets and Tempo enforces. You can check your fuel and limit, ask your owner to refuel or
raise the limit, and top yourself up from a small home wallet. You cannot change your own limit.

Live app: https://fuel.pitstopgas.workers.dev · Code: https://github.com/kriss39/pitstop

## 1. Install (once)

Needs Node 22+. The MCP server (step 3) runs straight from npm with `npx -y @getpitstop/mcp`; nothing else
to install. To write payment scripts (step 5) or make your own key, also clone the repo:

```sh
git clone https://github.com/kriss39/pitstop ~/pitstop
cd ~/pitstop && corepack enable && pnpm install && pnpm build
```

## 2. Get your wallet and key from your owner

Ask your owner to open https://fuel.pitstopgas.workers.dev/guard and either:

- press **Create a key here** and give you the config it shows (it contains `AGENT_WALLET` and
  `PITSTOP_AGENT_KEY`), or
- let you make your own key: run `pnpm key` in `~/pitstop/examples/demo-agent`, then send your owner the
  link it prints. Your secret never leaves this machine.

Put the values in `~/pitstop/.env`:

```sh
AGENT_WALLET=0x...          # your Tempo wallet (the owner's passkey address)
PITSTOP_AGENT_KEY=0x...     # only if the owner created the key on Guard
AGENT_TOKEN=USDCe           # the token your key may spend (most MPP services charge USDC.e)
```

Never print, log or share `PITSTOP_AGENT_KEY`.

## 3. Add the MCP server (Claude Code, Claude Desktop, Cursor)

```sh
claude mcp add pitstop -e AGENT_WALLET=0x... -e PITSTOP_AGENT_KEY=0x... -- npx -y @getpitstop/mcp
```

If you made your own key with `pnpm key`, use `-e PITSTOP_DIR=$HOME/pitstop/examples/demo-agent/.pitstop` instead of
`PITSTOP_AGENT_KEY`. For other clients, use this in their MCP config:

```json
{ "mcpServers": { "pitstop": { "command": "npx", "args": ["-y", "@getpitstop/mcp"],
  "env": { "AGENT_WALLET": "0x...", "PITSTOP_AGENT_KEY": "0x..." } } } }
```

Tools:

| Tool | Use it to |
|---|---|
| `get_balance` | See your stablecoin balances on Tempo |
| `key_status` | See if your key is active, how much you may still spend today, and when it resets or expires |
| `fuel_quote` | Price a refuel from your home wallet (read only) |
| `fuel_agent` | Refuel now from your home wallet on Base (spends real money; max 5 USDC per call) |
| `list_mpp_services` | Find paid APIs on mpp.dev |
| `guard_link` | Get the link your owner uses to raise or revoke your limit |

## 4. Before you spend

1. Call `key_status`. If the key is revoked or expired, stop and send your owner the `guard_link`.
2. Estimate the job's cost from the service prices (for example Codex price $0.001, Nansen token info
   $0.01, Nansen smart-money flows $0.05, Exa search about $0.01, Firecrawl scrape $0.002).
3. If the job costs more than what's left today, tell your owner before starting. Don't split it to
   get around the limit.

## 5. Pay an MPP service

Put a script in `~/pitstop/examples/demo-agent/src/` (it has `@getpitstop/sdk` and `mppx` installed) and run it with
`pnpm exec tsx --env-file=../../.env src/your-script.ts`:

```ts
import { agentAccount } from '@getpitstop/sdk'
import { Mppx, tempo } from 'mppx/client'

const account = agentAccount(process.env.PITSTOP_AGENT_KEY as `0x${string}`, process.env.AGENT_WALLET as `0x${string}`)
const mppx = Mppx.create({ methods: [tempo({ account })], polyfill: false })
const res = await mppx.fetch('https://api.nansen.ai/api/v1/tgm/token-information', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Payment' },
  body: JSON.stringify({ chain: 'ethereum', token_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', timeframe: '1d' }),
})
```

Some services need a hint to offer Tempo: send `authorization: Payment` to Nansen and
`x-codex-payment: mpp` to Codex. `examples/demo-agent/src/services.ts` has working examples.

If a payment fails with `SpendingLimitExceeded`, you are out of budget for today. Don't retry. Tell
your owner how much you need and send them the `guard_link`. `KeyAlreadyRevoked` means your owner
switched you off.

## 6. When you run low

- Owner refuel from any chain: send your owner `https://fuel.pitstopgas.workers.dev/fuel?to=<AGENT_WALLET>`.
- Self-refuel (if you have a home wallet): `fuel_agent` with 1–5 USDC, or `pnpm refill` /
  `pnpm watch` in `examples/demo-agent`.

## Rules

- Never try to raise, reset or work around your limit. Only the owner's passkey can change it.
- Never move funds to anyone except the services you are paying.
- Report what you spent and on what when you finish a job.
