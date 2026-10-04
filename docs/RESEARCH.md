# Market research: MPP volume and agent-funding pain (2026-10-04)

Read-only research. Sources are linked; items marked *unverified* could not be confirmed.

## MPP volume
- **MPPscan, last 7 days:** 263,260 transactions, $4,009 volume, 10,518 unique senders, 187 recipients. That is about $570/day at about $0.015 per payment ([mppscan.com](https://www.mppscan.com/)). Coverage may include Base and Celo as well as Tempo (*unverified*).
- **Bot-heavy activity:** unique senders per 3.5 h bucket dropped from about 3,500 to about 500 on 2026-10-02 07:30 UTC. Volume spikes are rare.
- **Dune:** no public Tempo/MPP dashboard found. Dune has a curated table, `payments.agentic_payments` (MPP charge and session on Tempo, plus x402) ([docs](https://docs.dune.com/data-catalog/curated/payments/agentic-payments)).
- **agenteconomy.to:** 46,078 session events and 1,857 payers through about 2026-09-23, roughly +3% in 6 weeks ([link](https://agenteconomy.to/tempo-mpp)).
- **mpp.dev registry:** 137 services. 134 accept `tempo`, 10 accept `stripe`, 1 accepts `evm`. Intents: 140 `charge`, 7 `session`.
- **Measuring on-chain:**
  - Charges are TIP-20 `transferWithMemo` calls whose memo starts with `keccak256("mpp")[0..3]` and version `0x01` (wevm/mppx `src/tempo/Attribution.ts`).
  - Sessions go through the precompile `0x4d50500000000000000000000000000000000000`.
  - The MPP docs recommended OUSD from 2026-09-29 ([tempoxyz/mpp#1029](https://github.com/tempoxyz/mpp/pull/1029)).

## Funding pain (GitHub; Discord not accessible)
- [wevm/mppx disc. #739](https://github.com/wevm/mppx/discussions/739): "Create tempo mainnet wallet and add funds…" The CLI funds testnet only. 0 replies.
- [wevm/mppx#598](https://github.com/wevm/mppx/issues/598): "0 PathUSD but $2 USDC.e". Payment fails because the wallet holds the wrong token.
- [tempoxyz/mpp#840](https://github.com/tempoxyz/mpp/issues/840): a merchant charged in NANOUSD, which no one could acquire.
- [wevm/mppx#284](https://github.com/wevm/mppx/issues/284): payments delivered by a bridge or solver fail verification.
- [tempoxyz/docs#148](https://github.com/tempoxyz/docs/issues/148): faucet funds the EOA while the passkey account shows 0 ("high user drop-off").
- **Spend limits** are already pitched by third parties ([#239](https://github.com/wevm/mppx/discussions/239), [#907](https://github.com/wevm/mppx/discussions/907), [#916](https://github.com/wevm/mppx/discussions/916)). Tempo has an open funding-policies PR for access keys ([tempoxyz/accounts#842](https://github.com/tempoxyz/accounts/pull/842)).
- **How users are told to fund:**
  - Dune, Nansen and Tempo's SKILL.md all send users to `tempo wallet fund`, a card onramp.
  - Tempo's "Getting funds" page lists Stargate, CCIP, Squid, Relay, Across and Bungee. LI.FI is not listed ([docs](https://tempo.xyz/developers/docs/guide/getting-funds)).

## Implications
1. Position Pitstop as "fund from the chain you already hold, never stall on a 0 balance", not as a volume play.
2. Target MCP and agent builders first: Nansen, Dune and APIbase users on Claude, Cursor and Codex.
3. Draft doc PRs and answers: Tempo "Getting funds", mpp.dev agent quickstart, mppx #739 and #598. Post only with approval.
4. Deliver the token the service charges in (USDC.e, OUSD, pathUSD), and watch accounts#842.
5. The differentiator is cross-chain refill plus protocol-enforced limits as a bundle, not spend caps alone.
