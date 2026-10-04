const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
/** Base58 for Solana signatures (what explorers and LI.FI expect). */
export function base58(bytes: Uint8Array) {
  const digits: number[] = []
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = ''
  for (const byte of bytes) {
    if (byte !== 0) break
    out += '1'
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]!]
  return out
}

/** USDC and SOL balances of a Solana wallet, in base units, read through the Pitstop Worker. */
export async function solanaBalances(owner: string): Promise<{ usdc: bigint; sol: bigint }> {
  const res = await fetch(`/api/solana/balance/${owner}`)
  const body = (await res.json()) as { usdc?: string; sol?: string; error?: string }
  if (!res.ok || body.usdc == null || body.sol == null) throw new Error(body.error ?? 'Couldn’t read the Solana balance')
  return { usdc: BigInt(body.usdc), sol: BigInt(body.sol) }
}
