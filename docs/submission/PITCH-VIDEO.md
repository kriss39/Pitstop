# Presentation video (target 2:30, hard limit 3:00)

Judges watch this first. One person on camera (or voice over slides), plain English, short sentences. About 330 spoken words. Read the **Say** lines; the **Show** lines are what's on screen.

Before recording: open https://fuel.pitstopgas.workers.dev in a clean browser window (dark mode), close other tabs, set the screen to 1920×1080, and put the README proof table and a terminal ready in other windows.

---

### 0:00–0:15 · Cold open: the agent gets stopped

**Show:** terminal running `pnpm demo`. Codex and Nansen lines print "paid … → 200" one after another, then a red `BLOCKED by the guard: SpendingLimitExceeded`. (Or the landing page's hero board, which replays the same thing.)

**Say:**
> This is an AI agent paying for data, a cent at a time, on Tempo. Call after call goes through. Then one is refused, not by my code, by the blockchain itself. That's Pitstop.

### 0:15–0:45 · The problem

**Show:** mpp.dev service list scrolling (Anthropic, OpenAI, Dune, Nansen…), then two GitHub threads side by side: *"How are you stopping your agent from overspending?"* (wevm/mppx #239) and *"Create Tempo mainnet wallet and add funds"* (wevm/mppx #739, no replies).

**Say:**
> Agents can now pay for over 130 APIs per call, with no account and no card, using MPP on Tempo. But builders keep asking two questions. How do I get money onto Tempo, when my money is on Solana, Base or Ethereum? And how do I stop my agent from spending all of it? Today the answers are manual bridging and code nobody watches.

### 0:45–1:25 · What Pitstop does

**Show:** the landing page "What Pitstop does" cards, then quick cuts: Fuel swap card with the itemized costs, Guard with the daily limit and "Who can it pay?", the Dashboard, a Telegram alert on a phone.

**Say:**
> Pitstop is the pit crew for AI agents. Fuel: pay with USDC, ETH or SOL from the chain your money is on, and it lands in the agent's Tempo wallet in about two seconds through LI.FI, with every fee shown before you sign. Guard: your passkey owns the wallet, and the agent gets its own key with a daily limit, one token, an end date, and if you want, a list of the only services it may pay. Tempo enforces all of it. Watch: a live dashboard and Telegram alerts. And Refill: the agent tops itself up, or asks for fuel from Claude or Cursor through our MCP server.

### 1:25–1:50 · Proof

**Show:** README "Proof on mainnet" table, click one LI.FI Scan link and one Tempo explorer link; then the /stats page.

**Say:**
> This all runs on mainnet today, with real money. Fuel from Base and Solana, agent payments to Nansen and Codex, the limit refusing the fifth call, a revoked key, auto-refill, and a refuel triggered from Claude. Every transfer is counted live on our stats page. It's open source, with tests and CI.

### 1:50–2:15 · Why it matters, and the business

**Show:** a simple slide: "Tempo gives the keys. Pitstop is the crew around them." Under it: "0.1% on every fuel route · fleet dashboards next".

**Say:**
> Tempo already gives wallets limited keys. Pitstop makes them usable: set up in the browser, fuelled from any chain, and watched. We earn 0.1% on every fuel route, from the web and from agent refills. Next come fleet dashboards for teams running many agents, and hosted refills.

### 2:15–2:30 · Close

**Show:** the hero of the landing page with the URL, the X handle and the logo.

**Say:**
> [Your name], building Pitstop. Give your agent a budget, not your wallet. fuel.pitstopgas.workers.dev.

---

**Optional founder line** (add at 2:15 if you have a strong one, 1 sentence): why *you* care about this, e.g. you run agents yourself and hit both problems.

**Checklist:** under 3:00 · captions on · no music louder than the voice · the blocked call is visible in the first 15 seconds · the URL is on screen at the end.
