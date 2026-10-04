import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Address, EIP1193Provider } from 'viem'

/** An injected EVM wallet announced through EIP-6963 (one entry per extension). */
export type EvmWalletInfo = { uuid: string; name: string; icon: string; rdns: string; provider: EIP1193Provider }

type AnnounceEvent = CustomEvent<{ info: Omit<EvmWalletInfo, 'provider'>; provider: EIP1193Provider }>

type WalletState = {
  /** EVM wallets found in this browser. */
  evmWallets: EvmWalletInfo[]
  evm?: { wallet: EvmWalletInfo; account: Address; chainId: number }
  /** Phantom's Solana provider, if installed. */
  hasPhantom: boolean
  solana?: { account: string }
  connectEvm: (wallet: EvmWalletInfo) => Promise<void>
  connectSolana: () => Promise<void>
  disconnect: (kind: 'evm' | 'solana') => void
}

const WalletContext = createContext<WalletState | undefined>(undefined)
const LAST_EVM = 'pitstop.wallet.evm'

function remember(rdns?: string) {
  try {
    if (rdns) localStorage.setItem(LAST_EVM, rdns)
    else localStorage.removeItem(LAST_EVM)
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}
function lastRdns() {
  try {
    return localStorage.getItem(LAST_EVM) ?? undefined
  } catch {
    return undefined
  }
}

/** Discovers injected wallets (EIP-6963 for EVM, Phantom for Solana) and tracks the connected accounts. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [evmWallets, setEvmWallets] = useState<EvmWalletInfo[]>([])
  const [evm, setEvm] = useState<WalletState['evm']>()
  const [solana, setSolana] = useState<WalletState['solana']>()
  const hasPhantom = Boolean(window.phantom?.solana?.isPhantom)

  // EIP-6963: each wallet extension announces itself; ask them to announce now.
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as AnnounceEvent).detail
      setEvmWallets((list) => (list.some((w) => w.uuid === info.uuid) ? list : [...list, { ...info, provider }]))
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce)
  }, [])

  // Legacy fallback for wallets that only inject window.ethereum.
  useEffect(() => {
    const timer = setTimeout(() => {
      setEvmWallets((list) =>
        list.length || !window.ethereum
          ? list
          : [{ uuid: 'injected', name: 'Browser wallet', icon: '', rdns: 'injected', provider: window.ethereum }],
      )
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  const attach = useCallback(async (wallet: EvmWalletInfo, request: boolean) => {
    const accounts = (await wallet.provider.request({ method: request ? 'eth_requestAccounts' : 'eth_accounts' })) as Address[]
    if (!accounts[0]) return false
    const chainId = Number(await wallet.provider.request({ method: 'eth_chainId' }))
    setEvm({ wallet, account: accounts[0], chainId })
    remember(wallet.rdns)
    return true
  }, [])

  // Reconnect silently to the wallet used last time, if it still grants access.
  useEffect(() => {
    if (evm) return
    const rdns = lastRdns()
    const wallet = evmWallets.find((w) => w.rdns === rdns)
    if (wallet) void attach(wallet, false).catch(() => {})
  }, [evmWallets, evm, attach])

  // Follow account and network changes in the connected EVM wallet.
  useEffect(() => {
    if (!evm) return
    const p = evm.wallet.provider
    const onAccounts = (accs: string[]) =>
      setEvm((cur) => (cur && accs[0] ? { ...cur, account: accs[0] as Address } : undefined))
    const onChain = (id: string) => setEvm((cur) => (cur ? { ...cur, chainId: Number(id) } : cur))
    p.on('accountsChanged', onAccounts)
    p.on('chainChanged', onChain)
    return () => {
      p.removeListener('accountsChanged', onAccounts)
      p.removeListener('chainChanged', onChain)
    }
  }, [evm?.wallet])

  // Phantom: reconnect if already trusted, and follow account switches.
  useEffect(() => {
    const phantom = window.phantom?.solana
    if (!phantom) return
    const onChange = (pk: { toString(): string } | null) => setSolana(pk ? { account: pk.toString() } : undefined)
    phantom.on('accountChanged', onChange)
    phantom.connect({ onlyIfTrusted: true }).then((r) => onChange(r.publicKey), () => {})
    return () => phantom.removeListener?.('accountChanged', onChange)
  }, [])

  const value = useMemo<WalletState>(
    () => ({
      evmWallets,
      evm,
      hasPhantom,
      solana,
      connectEvm: async (wallet) => {
        await attach(wallet, true)
      },
      connectSolana: async () => {
        const phantom = window.phantom?.solana
        if (!phantom?.isPhantom) throw new Error('Phantom is not installed. Install it and reload the page.')
        const r = await phantom.connect()
        setSolana({ account: r.publicKey.toString() })
      },
      disconnect: (kind) => {
        if (kind === 'evm') {
          setEvm(undefined)
          remember(undefined)
        } else {
          setSolana(undefined)
          void window.phantom?.solana?.disconnect?.()
        }
      },
    }),
    [evmWallets, evm, hasPhantom, solana, attach],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
