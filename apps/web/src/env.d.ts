import type { VersionedTransaction } from '@solana/web3.js'
import type { EIP1193Provider } from 'viem'

type PhantomPublicKey = { toString(): string }

/** The parts of Phantom's injected Solana provider that Pitstop uses. */
type PhantomSolana = {
  isPhantom?: boolean
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>
  signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }>
  on(event: 'accountChanged', cb: (pk: PhantomPublicKey | null) => void): void
  removeListener?(event: 'accountChanged', cb: (pk: PhantomPublicKey | null) => void): void
  disconnect?(): Promise<void>
}

declare global {
  const __DEFAULT_AGENT__: string
  const __LIFI_INTEGRATOR__: string
  interface Window {
    ethereum?: EIP1193Provider
    phantom?: { solana?: PhantomSolana }
  }
}

export {}
