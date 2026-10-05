# @getpitstop/sdk

Fuel AI agents on [Tempo](https://tempo.xyz) from any chain, and cap what they can spend.

- **Fuel:** quote and run a [LI.FI](https://li.fi) route from Base, Solana, Ethereum, Arbitrum and more to an agent's Tempo wallet. Routes that don't end at the agent, send a different amount or token, or use another contract are rejected.
- **Guard:** authorize, update and revoke Tempo Account Keychain access keys with a periodic spending limit, one token, an expiry and an optional list of allowed recipients. Tempo enforces the limit on-chain.
- **Refill:** top an agent up from a small home wallet when its balance drops below a threshold.
- **Pay:** `agentAccount` signs MPP payments with the agent's access key, ready for [mppx](https://github.com/wevm/mppx).

```sh
npm install @getpitstop/sdk viem
```

## Check an agent's key and pay an MPP service

```ts
import { accessKeyFromPrivateKey, agentAccount, getAgentKeyStatus, getBalance, TEMPO_TOKENS, totalUsd } from '@getpitstop/sdk'
import { Mppx, tempo } from 'mppx/client'

const wallet = '0x…'   // the agent's Tempo wallet
const key = '0x…'      // the access key's private key, never logged or shared

const account = agentAccount(key, wallet)
const status = await getAgentKeyStatus({ wallet, key: accessKeyFromPrivateKey(key).address, token: TEMPO_TOKENS.USDCe })
console.log(status.remaining, 'left until', status.periodEnd)
console.log(totalUsd(await getBalance({ address: wallet })), 'in the wallet')

const mppx = Mppx.create({ methods: [tempo({ account })], polyfill: false })
const res = await mppx.fetch('https://api.example.com/paid-endpoint')
```

A payment over the limit fails on-chain with `SpendingLimitExceeded`, and costs nothing.

## Quote a fuel route

```ts
import { fuelQuote } from '@getpitstop/sdk'

const quote = await fuelQuote({
  fromChain: 8453,                                         // Base
  fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  fromAmount: 5_000_000n,                                  // 5 USDC
  fromAddress: '0x…',
  toAddress: '0x…',                                        // the agent on Tempo
})
```

`executeFuel` sends it from a viem wallet, and `waitForFuel` follows it until it lands.

Node helpers (keystore for agent keys and home wallets) are in `@getpitstop/sdk/node`.

Full docs, the web app and the MCP server: https://github.com/kriss39/pitstop · https://fuel.pitstopgas.workers.dev

MIT
