import {
  createWalletClient,
  erc20Abi,
  type Account as ViemAccount,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { tempo } from 'viem/chains'
import { Account, Actions, P256 } from 'viem/tempo'
import { createTempoClient, tempoTransport } from './client.js'
import { TEMPO_TOKENS } from './tokens.js'

/** Tempo mainnet with fees paid in USDCe, the token Pitstop delivers. */
export const tempoWithFees = tempo.extend({ feeToken: TEMPO_TOKENS.USDCe })

export const DAY_SECONDS = 86_400

/** Public description of an access key: enough to authorize or look it up. */
export type AccessKeyRef = { address: Address; type: 'p256' | 'secp256k1' | 'webAuthn' }

export type GeneratedAccessKey = AccessKeyRef & { privateKey: Hex }

/**
 * Creates a new P256 access key for an agent. The private key never leaves the
 * agent's machine; only `address` and `type` go to the owner for authorization.
 */
export function generateAccessKey(): GeneratedAccessKey {
  const privateKey = P256.randomPrivateKey()
  return { privateKey, address: Account.fromP256(privateKey).address, type: 'p256' }
}

/** Rebuilds an access key from its private key (e.g. from the PITSTOP_AGENT_KEY env variable). */
export function accessKeyFromPrivateKey(privateKey: Hex): GeneratedAccessKey {
  return { privateKey, address: Account.fromP256(privateKey).address, type: 'p256' }
}

/** The agent's signer: acts for `wallet` through its access key, within the key's limits. */
export function agentAccount(privateKey: Hex, wallet: Address) {
  return Account.fromP256(privateKey, { access: wallet })
}

function walletClient(account: ViemAccount, rpcUrls?: readonly string[]) {
  return createWalletClient({ account, chain: tempoWithFees, transport: tempoTransport(rpcUrls) })
}

export type AuthorizeAgentKeyParameters = {
  /** The wallet's root account, e.g. a passkey account from `Account.fromWebAuthnP256`. */
  owner: ViemAccount
  key: AccessKeyRef
  /** Max spend per period, in base units of `token`. */
  limit: bigint
  /** Defaults to USDCe. */
  token?: Address
  /** Limit period in seconds. Defaults to one day. */
  periodSeconds?: number
  /** Unix seconds after which the key stops working. */
  expiry: number
  client?: PublicClient
}

/** Owner signs once: the agent key may spend up to `limit` of `token` per period until `expiry`. */
export async function authorizeAgentKey(params: AuthorizeAgentKeyParameters): Promise<Hex> {
  const { owner, key, limit, token = TEMPO_TOKENS.USDCe, periodSeconds = DAY_SECONDS, expiry } = params
  const hash = await Actions.accessKey.authorize(walletClient(owner), {
    accessKey: { address: key.address, type: key.type },
    expiry,
    limits: [{ token, limit, period: periodSeconds }],
  } as never)
  await waitOk(hash, params.client)
  return hash
}

export async function revokeAgentKey(params: { owner: ViemAccount; key: Address; client?: PublicClient }): Promise<Hex> {
  const hash = await Actions.accessKey.revoke(walletClient(params.owner), { accessKey: params.key } as never)
  await waitOk(hash, params.client)
  return hash
}

export async function updateAgentLimit(params: {
  owner: ViemAccount
  key: Address
  limit: bigint
  token?: Address
  client?: PublicClient
}): Promise<Hex> {
  const hash = await Actions.accessKey.updateLimit(walletClient(params.owner), {
    accessKey: params.key,
    token: params.token ?? TEMPO_TOKENS.USDCe,
    limit: params.limit,
  } as never)
  await waitOk(hash, params.client)
  return hash
}

export type AgentKeyStatus = {
  authorized: boolean
  revoked: boolean
  expiry: number
  spendPolicy: 'limited' | 'unlimited'
  remaining: bigint
  /** Unix seconds when the current period's limit resets, if known. */
  periodEnd?: number
}

/** Reads a key's on-chain state for `wallet`. `authorized` is false for keys never authorized. */
export async function getAgentKeyStatus(params: {
  wallet: Address
  key: Address
  token?: Address
  client?: PublicClient
}): Promise<AgentKeyStatus> {
  const client = params.client ?? createTempoClient()
  const token = params.token ?? TEMPO_TOKENS.USDCe
  const meta = await Actions.accessKey.getMetadata(client as never, { account: params.wallet, accessKey: params.key })
  const authorized = meta.expiry > 0n
  const limit = authorized
    ? await Actions.accessKey.getRemainingLimit(client as never, { account: params.wallet, accessKey: params.key, token })
    : { remaining: 0n, periodEnd: undefined }
  return {
    authorized,
    revoked: meta.isRevoked,
    expiry: Number(meta.expiry),
    spendPolicy: meta.spendPolicy,
    remaining: limit.remaining,
    periodEnd: limit.periodEnd != null ? Number(limit.periodEnd) : undefined,
  }
}

/** Sends a TIP-20 transfer from the agent (through its access key). Fails if it exceeds the key's limit. */
export async function agentTransfer(params: {
  account: ViemAccount
  to: Address
  amount: bigint
  token?: Address
  client?: PublicClient
}): Promise<Hex> {
  const hash = await walletClient(params.account).writeContract({
    address: params.token ?? TEMPO_TOKENS.USDCe,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [params.to, params.amount],
  })
  await waitOk(hash, params.client)
  return hash
}

async function waitOk(hash: Hex, client?: PublicClient) {
  const receipt = await (client ?? createTempoClient()).waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Tempo transaction ${hash} reverted`)
}
