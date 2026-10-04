import { parseAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import { createTempoClient } from './client.js'
import { TEMPO_TOKENS } from './tokens.js'

/** Tempo's fee manager: transfers to it are network fees. */
export const TEMPO_FEE_MANAGER: Address = '0xfeEC000000000000000000000000000000000000'

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 amount)')

export type Spend = {
  to: Address
  /** Base units of the token (6 decimals). */
  amount: bigint
  kind: 'network-fee' | 'payment'
  txHash: Hex
  blockNumber: bigint
  /** Unix seconds, estimated from the block height. */
  time: number
}

/**
 * Recent outgoing token transfers from a wallet (newest first): MPP payments, transfers
 * and network fees. Looks back `blocks` blocks (~0.55 s each); public RPCs allow ~100k.
 */
export async function getRecentSpends(params: {
  wallet: Address
  token?: Address
  blocks?: bigint
  client?: PublicClient
}): Promise<Spend[]> {
  const client = params.client ?? createTempoClient()
  const head = await client.getBlock()
  const span = params.blocks ?? 100_000n
  const logs = await client.getLogs({
    address: params.token ?? TEMPO_TOKENS.USDCe,
    event: TRANSFER,
    args: { from: params.wallet },
    fromBlock: head.number > span ? head.number - span : 0n,
    toBlock: head.number,
  })
  const secondsPerBlock = 0.556
  return logs
    .map((l) => ({
      to: l.args.to!,
      amount: l.args.amount!,
      kind: (l.args.to!.toLowerCase() === TEMPO_FEE_MANAGER.toLowerCase() ? 'network-fee' : 'payment') as Spend['kind'],
      txHash: l.transactionHash!,
      blockNumber: l.blockNumber!,
      time: Number(head.timestamp) - Math.round(Number(head.number - l.blockNumber!) * secondsPerBlock),
    }))
    .reverse()
}
