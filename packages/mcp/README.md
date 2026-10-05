# @getpitstop/mcp

MCP server that lets an AI agent check its fuel and spending limit on [Tempo](https://tempo.xyz), refuel itself from a small home wallet, and send its owner the link to raise or revoke its limit. There is no tool to raise a limit: the agent can't loosen its own leash.

## Add it to Claude Code

```sh
claude mcp add pitstop -e AGENT_WALLET=0x… -e PITSTOP_AGENT_KEY=0x… -- npx -y @getpitstop/mcp
```

Claude Desktop, Cursor and other clients:

```json
{
  "mcpServers": {
    "pitstop": {
      "command": "npx",
      "args": ["-y", "@getpitstop/mcp"],
      "env": { "AGENT_WALLET": "0x…", "PITSTOP_AGENT_KEY": "0x…" }
    }
  }
}
```

Get the wallet and key from the Guard page: https://fuel.pitstopgas.workers.dev/guard

## Tools

| Tool | What it does |
|---|---|
| `get_balance` | Stablecoin balances of the agent's Tempo wallet |
| `key_status` | Whether the key is active, how much it may still spend, and when that resets or expires |
| `fuel_quote` | Prices a refuel from the home wallet (read only) |
| `fuel_agent` | Refuels from the home wallet on Base (real funds, at most 5 USDC per call) |
| `list_mpp_services` | Paid APIs from the mpp.dev registry |
| `guard_link` | The link the owner uses to raise, change or revoke the limit |

## Environment

| Variable | Meaning |
|---|---|
| `AGENT_WALLET` | The agent's Tempo wallet |
| `PITSTOP_AGENT_KEY` | Access key created on the Guard page |
| `PITSTOP_DIR` | Folder with `agent-key.json` and `home-wallet.json` (default `./.pitstop`), used instead of `PITSTOP_AGENT_KEY` and for `fuel_agent` |
| `AGENT_TOKEN` | Token the key may spend (default `USDCe`) |

Source and docs: https://github.com/kriss39/pitstop

MIT
