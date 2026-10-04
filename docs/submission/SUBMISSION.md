# Colosseum submission text

Track: **Tempo**. Deadline: 2026-10-12 23:59 PT. Fields follow the submission portal's FAQ (product, chains and tools, team, location, logo, go-to-market and demand). Fill in everything marked **[FILL IN]**; re-check the live form, since its exact fields weren't visible without a login.

---

## Product name
Pitstop

## Tagline (one line)
Refuel your AI agents from any chain in seconds, and keep them on a spending limit Tempo enforces.

## Short description (≈ 60 words)
AI agents now pay for APIs per call over MPP on Tempo. Pitstop is the pit crew around them: it fuels an agent's Tempo wallet from any chain through LI.FI in about two seconds, sets up its spending key (daily limit, token, end date, allowed services) from a passkey in the browser, refills it automatically, and alerts the owner on Telegram. Live on mainnet.

## Long description
**The problem.** More than 130 APIs (Anthropic, OpenAI, Dune, Nansen, Exa…) now sell per call over MPP on Tempo, and agents can pay them with no account or card. Builders keep hitting two walls. Their money is on Solana, Base or Ethereum, while the agent needs USDC.e on Tempo; the official advice is a card onramp or manual bridging. And they have to trust an agent with a wallet: Tempo's Account Keychain can cap an agent key on-chain, but setting that up takes code or a CLI, and nothing watches the agent afterwards.

**What Pitstop does.**
- **Fuel:** pay with USDC or a chain's own token (ETH, POL, AVAX, SOL) from Base, Solana, Ethereum, Arbitrum, Optimism, Polygon, Avalanche or Arc. LI.FI routes it; the agent receives USDC.e (or pathUSD, USDT0, OUSD) on Tempo in about two seconds. Every cost is itemized before signing, and Pitstop rejects any route that doesn't end at the agent, send exactly the requested amount and token, or use the LI.FI contract.
- **Guard:** the owner's passkey owns the wallet. The agent gets its own P256 access key with a daily limit, one token, an end date and, optionally, a list of the only services it may pay (TIP-1011 recipient scopes). Tempo enforces all of it; only the passkey can change it. The key can be created in the browser and handed to the agent as a ready `.env` or Claude/Cursor config.
- **Watch:** a dashboard with the limit left, every payment and which service it went to; Telegram alerts when fuel is low, the limit is used, or the key is revoked or expires; a public live-usage page.
- **Refill:** agents top themselves up from a small home wallet with a daily cap, or ask for fuel from Claude or Cursor through Pitstop's MCP server. There is no tool to raise a limit: the agent can't loosen its own leash.

**Proof on mainnet (2026-10-04).** Fuel from Base (2 USDC → 1.9945 USDC.e via Across) and Solana (via Relay, ~1 s); the agent paid Nansen ($0.01) and Codex ($0.001) per call through its access key; the 5th call was refused with `SpendingLimitExceeded` at no cost; a revoked key was refused with `KeyAlreadyRevoked`; auto-refill and an MCP `fuel_agent` call both fuelled the agent. Links: README "Proof on mainnet".

**How it's built.** TypeScript monorepo: `@pitstop/sdk` (viem `tempo` actions for the Account Keychain, LI.FI REST with strict route validation, refill logic), an MCP server, a React web app and a Cloudflare Worker (LI.FI proxy locked to the site, Solana balances, D1, Telegram cron). 33 unit tests and CI. Non-custodial: the server never holds keys or funds.

## Blockchains and tools
- **Tempo** (mainnet, chain 4217): Account Keychain access keys with periodic limits and TIP-1011 recipient scopes, passkey (WebAuthn P256) accounts, TIP-20 stablecoins, fee AMM (fees in any held stablecoin), MPP payments via mppx.
- **LI.FI** (REST API, integrator `pitstop`, 0.1% integrator fee): routes through Across and Relay.
- **Source chains:** Base, Solana, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Arc.
- **MPP services used in the demo:** Nansen, Codex.
- Also: viem, Model Context Protocol SDK, Cloudflare Workers + D1, Telegram Bot API, Wallet Standard and EIP-6963 wallet discovery (MetaMask, Rabby, Phantom, Solflare, Backpack).

## Links
- Live app: https://fuel.pitstopgas.workers.dev
- Live usage: https://fuel.pitstopgas.workers.dev/stats
- Repo: https://github.com/kriss39/pitstop **[make public, or give access to hackathon@colosseum.com]**
- Presentation video: **[FILL IN]**
- Demo video: **[FILL IN]**
- X: https://x.com/pitstop_agents · Telegram alerts: https://t.me/pitstop_alert_bot · Contact: pitstop.agents@gmail.com

## Team
**[FILL IN]** Name, role, one or two lines of background (what you've built before, why agents and payments). Example shape: "Kanan, solo founder and full-stack developer. Previously built … . Runs AI agents daily and hit both problems Pitstop solves."

## Location
**[FILL IN]** City, country.

## Logo
`apps/web/public/icon-512.png` (512×512) or `docs/brand/avatar-400.png`. Banner: `docs/brand/x-banner-1500x500.png`.

## Market, demand and go-to-market

**Demand we can point to.**
- MPP volume: about 263,000 payments and $4,000 in the last 7 days on MPPscan (≈ $570/day, average $0.015 per payment), 137 services in the mpp.dev registry.
- The two problems show up as open questions from builders: funding a mainnet wallet ([wevm/mppx#739](https://github.com/wevm/mppx/discussions/739), unanswered; [#598](https://github.com/wevm/mppx/issues/598)), and stopping overspending ([wevm/mppx#239](https://github.com/wevm/mppx/discussions/239), [tempoxyz/mpp-specs#211](https://github.com/tempoxyz/mpp-specs/issues/211), [x402#2405](https://github.com/x402-foundation/x402/issues/2405)). In mpp-specs#211 the Tempo team says spend controls belong at the wallet level, which is what Pitstop does.

**Traction so far.** Live on mainnet since 2026-10-04 with every flow proven with real funds. Usage is public at /stats (currently our own tests; outside users are counted separately). **[Update with any users, feedback or posts before submitting.]**

**Go-to-market.**
1. Meet builders where they ask: answer the funding and spend-limit threads on GitHub, and offer doc additions for Tempo's "Getting funds" page and the mpp.dev agent quickstart.
2. Ship where agents live: the MCP server for Claude, Cursor and Codex (one-line `npx` install next), plus a shareable funding link (`/fuel?to=<agent>`) anyone can pay from any chain.
3. Partner with MPP gateways and services (Locus, Orthogonal, Tempo's own gateway): when a payment fails for lack of funds, point the 402 response at a Pitstop fuel link.
4. Build in public on X (@pitstop_agents) with live usage numbers.

**Business model.** A 0.1% LI.FI integrator fee on every fuel route, from the web app and from agent refills, shown in every quote. Next: fleet dashboards and alerting for teams running many agents (subscription), and a hosted refill service for agents that can't keep a home wallet.

**Competition.** Tempo Wallet and MPP Credits give keys and card funding; Pitstop works with them and adds cross-chain fuel, browser setup, auto-refill and monitoring. Agent-wallet platforms (Coinbase, Crossmint, Privy, Kite) are custodial or not Tempo-native. Other Tempo spend-limit projects we found are testnet-only and don't fund from other chains.
