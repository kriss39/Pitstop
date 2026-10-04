# Pitstop

> **Pitstop: refuel your AI agents from any chain in one second, and keep them on a leash.**

The project used to be called "MPP Tank". It was renamed Pitstop on 2026-10-04.

Pitstop funds AI agents that pay for services over MPP on Tempo:
- It takes stablecoins or tokens from any chain (Solana, Base, Arbitrum, Ethereum…) and sends USDC to the agent's Tempo wallet through LI.FI.
- It refills the wallet automatically when the balance drops below a threshold.
- It limits what the agent can spend with Tempo Account Keychain access keys: a daily cap, an allowlist of services, and an expiry.
- It ships as an MCP server, so Claude, Cursor and other agents can call it as a tool.

The full brief, architecture, plan and costs are in **`docs/BRIEF.md`**. Read it first in every new session.

## Working rules
- Reply to the user in Turkish. Code, comments, commit messages and README are in English.
- Never add AI attribution to commits, PRs or issues: no Co-Authored-By Claude, no "Generated with Claude Code", no session links.
- Never push, publish, open PRs or post anywhere without the user's explicit approval.
- Never handle, ask for or store the user's private keys or seed phrases. The user signs and funds every wallet transaction.
- Secrets go in `.dev.vars` or `.env`, both git-ignored. Never commit them.
- Test with small mainnet amounts ($1–5). Tempo has no meaningful testnet for LI.FI routes.

## Deadline
Colosseum World's Fair, Tempo track: submissions due 2026-10-12. Each builder may submit only one project. Re-verify the deadline and rules at https://colosseum.com/worldsfair before submitting.
