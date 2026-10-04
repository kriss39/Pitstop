# Pitstop

**Refuel your AI agents from any chain in one second, and keep them on a leash.**

Pitstop funds AI agents that pay for services over [MPP](https://mpp.dev) on [Tempo](https://tempo.xyz):

- **Fuel:** send stablecoins or tokens from any chain (Solana, Base, Arbitrum, Ethereum…) to the agent's Tempo wallet through [LI.FI](https://li.fi).
- **Auto-refill:** top the wallet up when its balance drops below a threshold.
- **Guard:** cap what the agent can spend with Tempo Account Keychain access keys (spending limit per period, call allowlist, expiry).
- **MCP server:** Claude, Cursor and other agents can call Pitstop as a tool.

> Status: early development for the Colosseum Crypto World's Fair (Tempo track).

## Layout

| Path | What |
|---|---|
| `packages/sdk` | `@pitstop/sdk`: Tempo client, TIP-20 balances, fuel and guard helpers |
| `packages/mcp` | `@pitstop/mcp`: MCP server (stdio) wrapping the SDK |
| `apps/web` | Fuel page, dashboard and guard setup (Vite + React) |
| `apps/api` | Agent registry, balance watcher and alerts (Hono on Cloudflare Workers) |
| `examples/demo-agent` | End-to-end demo agent |

## Development

Requires Node 22+ and pnpm (`corepack enable` or `brew install pnpm`).

```sh
pnpm install
pnpm build
```

Read an agent's Tempo balance:

```sh
pnpm --filter @pitstop/demo-agent start 0xYourAgentAddress
```

Use the MCP server with Claude Code:

```sh
claude mcp add pitstop -- node /absolute/path/to/pitstop/packages/mcp/dist/index.js
```

## License

MIT
