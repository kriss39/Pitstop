# Product demo video (target 2:45, hard limit 3:00)

A screen recording with voice over, showing the product working end to end on mainnet. Record in one take per scene, then cut. Every step below is real: real wallet, real money ($5), real refusal.

## Before you record

- **Wait for the demo key's daily limit to reset** (it resets about 12:26 UTC each day). Check with `pnpm keystatus` in `examples/demo-agent`: it should show about $0.05 left. Otherwise the demo blocks at the first call.
- Browser: Chrome, dark mode, 1920×1080, zoom 110%, bookmarks bar hidden. Logged into the wallet you'll pay from (e.g. Rabby or MetaMask on Base, with ≥ $6 USDC and a little ETH).
- Same device as the owner passkey for the demo agent's wallet `0x9Bd4…0bC0` (the one used on Guard before).
- Terminal: large font (18 pt), in `examples/demo-agent`, cleared.
- Phone: Telegram open on @pitstop_alert_bot, already sent `/watch 0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0 0xd2a1B1a5c8cd78A31F95E9b41Dd7c1Eb92900074`.
- Claude Code or Claude Desktop with the Pitstop MCP server connected (see README).

## Shot list

### 1 · 0:00–0:15 · Hook

**Screen:** https://fuel.pitstopgas.workers.dev, the hero board replaying: four calls paid, the fifth refused.

**Say:** "Pitstop fuels AI agents from any chain and keeps them on a spending limit that Tempo enforces. Here's the whole loop, live on mainnet."

### 2 · 0:15–0:50 · Fuel the agent from Base

**Screen:** Fuel page.
1. Paste the agent wallet `0x9Bd4…0bC0` (or open `/fuel?to=0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0`). Point at the "Filled from a link" check.
2. Connect wallet → Base → USDC. Drag the slider to 5 USDC; the readout says "… · $5.00".
3. Scroll to **Where your money goes**: Pitstop 0.1%, LI.FI 0.25%, the bridge, gas. Total cost.
4. Press **Fuel agent**, approve and send in the wallet. The pit lane fills in: sent, bridged, arrived, with the seconds.

**Say:** "I pay five dollars of USDC on Base. Pitstop shows exactly where every cent goes, checks LI.FI's route goes to my agent on Tempo, and… it's there in about two seconds."

### 3 · 0:50–1:20 · Put the agent on a leash

**Screen:** Guard page (owner passkey for `0x9Bd4…0bC0`).
1. Show the agent key filled in, daily limit $0.05 in USDC.e, "Expires in …".
2. Show **Who can it pay?** and explain the allowlist option (new keys only).
3. Press **Create a key here** briefly on a second wallet, or just point at it: "or create the agent's key right here, no code."

**Say:** "My passkey owns this wallet. The agent only has its own key: five cents a day, one token, an end date, and optionally only the services I pick. The agent can't change any of this. Only my passkey can."

### 4 · 1:20–1:55 · The agent pays, then gets refused

**Screen:** terminal: `pnpm demo`.
- Codex price lookups ($0.001) and Nansen calls ($0.01) print "paid … → 200", with "left $…" going down.
- When a Nansen call no longer fits, it prints **BLOCKED by the guard: SpendingLimitExceeded**, then "(cheaper price lookups continue)".
- A few more $0.001 Codex calls go through, then the last one is **BLOCKED** too: "The agent hit its daily limit".

**Say:** "The agent buys data per call: a token price from Codex for a tenth of a cent, smart-money data from Nansen for a cent. When a Nansen call no longer fits the budget, Tempo refuses it. The agent can still afford cheap price lookups, until those are refused too. The limit is money, not a call count. Refused payments never reach the chain, so they cost nothing."

### 5 · 1:55–2:20 · Watch it

**Screen:** open the Dashboard for the agent (the link Guard gives, or `/dashboard?wallet=0x9Bd4…&key=0xd2a1…&limit=0.05`).
- The board: "Limit used — blocked", resets in …
- Activity: Codex and Nansen payments with their logos; "By service".
- Cut to the phone: the Telegram alert "hit its daily spending limit".

**Say:** "The dashboard shows what's left, every payment and who it went to. And I get a Telegram message the moment the limit is hit."

### 6 · 2:20–2:40 · From inside Claude

**Screen:** Claude with the Pitstop MCP server. Ask: *"What's my agent's balance and how much can it still spend today?"* Then *"Get me a quote to refuel it with 1 USDC."*

**Say:** "Agents can check their own fuel and ask for a refill through MCP. There's no tool to raise the limit: the agent can't loosen its own leash."

### 7 · 2:40–2:50 · Close

**Screen:** /stats, then the landing page footer.

**Say:** "Open source, live on Tempo mainnet. Give your agent a budget, not your wallet."

## After recording

- Trim to under 3:00. Add captions (YouTube auto captions, corrected).
- Upload unlisted to YouTube or Loom; put the link in the submission.
- The $5 fuel in step 2 also proves the 0.1% Pitstop fee on mainnet: check it on /stats and in the LI.FI portal afterwards.
