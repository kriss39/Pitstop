import type { EIP1193Provider } from 'viem'

declare global {
  const __DEFAULT_AGENT__: string
  const __LIFI_INTEGRATOR__: string
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export {}
