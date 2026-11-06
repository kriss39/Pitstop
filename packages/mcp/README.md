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

## Or let the agent make its own key

The secret then never leaves the agent's machine:

```sh
npx -y @getpitstop/mcp key          # creates ~/.pitstop/agent-key.json and prints the Guard link for the owner
npx -y @getpitstop/mcp home-wallet  # optional: a small Base wallet that fuel_agent refuels from
```

The server reads the same folder, so leave out `PITSTOP_AGENT_KEY`. `npx -y @getpitstop/mcp help` lists the commands.

## Tools

| Tool | What it does |
|---|---|
| `get_balance` | Stablecoin balances of the agent's Tempo wallet |
| `key_status` | Whether the key is active, how much it may still spend, when that resets or expires, and which payees it may pay |
| `fuel_quote` | Prices a refuel from the home wallet (read only) |
| `fuel_agent` | Refuels from the home wallet on Base (real funds, 0.01–5 USDC per call) |
| `list_mpp_services` | Paid APIs from the mpp.dev registry that take Tempo payments |
| `guard_link` | The link the owner uses to raise, change or revoke the limit |

## Environment

| Variable | Meaning |
|---|---|
| `AGENT_WALLET` | The agent's Tempo wallet |
| `PITSTOP_AGENT_KEY` | Access key created on the Guard page |
| `PITSTOP_DIR` | Folder with `agent-key.json` and `home-wallet.json` (default `~/.pitstop`; a `./.pitstop` in the working folder is used only if you point `PITSTOP_DIR` at it), used instead of `PITSTOP_AGENT_KEY` and for `fuel_agent` |
| `AGENT_TOKEN` | Token the key may spend (default `USDCe`) |
| `REFILL_MAX_PER_DAY` | Most `fuel_agent` may send per UTC day, in USDC (default `6`) |
| `LIFI_API_KEY` | Optional LI.FI key for higher rate limits |
| `PITSTOP_URL` | Site for the Guard links (must be https; default `https://fuel.pitstopgas.workers.dev`) |

Source and docs: https://github.com/kriss39/pitstop

MIT
