import { encodeAbiParameters, type Address, type Hex } from 'viem'

/** Diamond calldata shaped like LI.FI's startBridgeTokensViaAcross: BridgeData first, facet data after. */
export function bridgeCalldata(
  receiver: Address,
  { destinationChainId = 4217n, hasDestinationCall = false, extra = '0x' as Hex } = {},
): Hex {
  const args = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { type: 'bytes32' }, { type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'address' },
          { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'bool' },
        ],
      },
      { type: 'bytes' },
    ],
    [
      [
        `0x${'11'.repeat(32)}`, 'across', 'pitstop', '0x0000000000000000000000000000000000000000',
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', receiver, 4_982_500n, destinationChainId, false, hasDestinationCall,
      ],
      extra,
    ],
  )
  return `0x1794958f${args.slice(2)}`
}
