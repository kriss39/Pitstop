import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { numberToHex, type Address, type Chain, type EIP1193Provider } from 'viem'
import { base } from 'viem/chains'
import { base58 } from './solana'

/** An injected EVM wallet announced through EIP-6963 (one entry per extension). */
export type EvmWalletInfo = { uuid: string; name: string; icon: string; rdns: string; provider: EIP1193Provider }

type AnnounceEvent = CustomEvent<{ info: Omit<EvmWalletInfo, 'provider'>; provider: EIP1193Provider }>

const SOLANA_MAINNET = 'solana:mainnet'

/** The Wallet Standard features Pitstop uses on Solana (Phantom, MetaMask, Solflare, Backpack…). */
type SolanaFeatures = {
  'standard:connect': { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> }
  'standard:disconnect'?: { disconnect(): Promise<void> }
  'standard:events'?: { on(event: 'change', cb: (props: { accounts?: readonly WalletAccount[] }) => void): () => void }
  'solana:signAndSendTransaction': {
    signAndSendTransaction(
      ...inputs: { account: WalletAccount; transaction: Uint8Array; chain: string }[]
    ): Promise<readonly { signature: Uint8Array }[]>
  }
}
const features = (w: Wallet) => w.features as unknown as SolanaFeatures

/** A Solana wallet registered through the Wallet Standard. */
export type SolanaWalletInfo = { name: string; icon: string; wallet: Wallet }

const isSolanaWallet = (w: Wallet) =>
  w.chains.includes(SOLANA_MAINNET) && 'standard:connect' in w.features && 'solana:signAndSendTransaction' in w.features

type WalletState = {
  /** EVM wallets found in this browser. */
  evmWallets: EvmWalletInfo[]
  evm?: { wallet: EvmWalletInfo; account: Address; chainId: number }
  /** Solana wallets found in this browser (Wallet Standard). */
  solWallets: SolanaWalletInfo[]
  solana?: { wallet: SolanaWalletInfo; account: WalletAccount; address: string }
  connectEvm: (wallet: EvmWalletInfo) => Promise<void>
  connectSolana: (wallet: SolanaWalletInfo) => Promise<void>
  /** Signs and sends a serialized Solana transaction with the connected wallet; returns the base58 signature. */
  sendSolanaTransaction: (transaction: Uint8Array) => Promise<string>
  disconnect: (kind: 'evm' | 'solana') => void
}

const WalletContext = createContext<WalletState | undefined>(undefined)
const LAST_EVM = 'pitstop.wallet.evm'
const LAST_SOL = 'pitstop.wallet.solana'

function remember(key: string, value?: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}
function recall(key: string) {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}


/** Discovers injected wallets (EIP-6963 for EVM, Wallet Standard for Solana) and tracks the connected accounts. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [evmWallets, setEvmWallets] = useState<EvmWalletInfo[]>([])
  const [evm, setEvm] = useState<WalletState['evm']>()
  const [solana, setSolana] = useState<WalletState['solana']>()
  const [solWallets, setSolWallets] = useState<SolanaWalletInfo[]>([])

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
    remember(LAST_EVM, wallet.rdns)
    return true
  }, [])

  // Reconnect silently to the wallet used last time, if it still grants access.
  useEffect(() => {
    if (evm) return
    const rdns = recall(LAST_EVM)
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

  // Wallet Standard: list Solana wallets now and as more register.
  useEffect(() => {
    const registry = getWallets()
    const sync = () =>
      setSolWallets(registry.get().filter(isSolanaWallet).map((wallet) => ({ name: wallet.name, icon: wallet.icon, wallet })))
    sync()
    const offRegister = registry.on('register', sync)
    const offUnregister = registry.on('unregister', sync)
    return () => {
      offRegister()
      offUnregister()
    }
  }, [])

  const attachSolana = useCallback(async (info: SolanaWalletInfo, silent: boolean) => {
    const { accounts } = await features(info.wallet)['standard:connect'].connect(silent ? { silent: true } : undefined)
    const account = accounts.find((a) => a.chains.includes(SOLANA_MAINNET)) ?? accounts[0]
    if (!account) return false
    setSolana({ wallet: info, account, address: account.address })
    remember(LAST_SOL, info.name)
    return true
  }, [])

  // Reconnect silently to the Solana wallet used last time.
  useEffect(() => {
    if (solana) return
    const name = recall(LAST_SOL)
    const info = solWallets.find((w) => w.name === name)
    if (info) void attachSolana(info, true).catch(() => {})
  }, [solWallets, solana, attachSolana])

  // Follow account switches in the connected Solana wallet.
  useEffect(() => {
    const events = solana && features(solana.wallet.wallet)['standard:events']
    if (!events || !solana) return
    return events.on('change', ({ accounts }) => {
      if (!accounts) return
      const account = accounts[0]
      setSolana((cur) => (cur && account ? { ...cur, account, address: account.address } : undefined))
    })
  }, [solana?.wallet])

  const value = useMemo<WalletState>(
    () => ({
      evmWallets,
      evm,
      solWallets,
      solana,
      connectEvm: async (wallet) => {
        await attach(wallet, true)
      },
      connectSolana: async (info) => {
        if (!(await attachSolana(info, false))) throw new Error(`${info.name} returned no Solana account.`)
      },
      sendSolanaTransaction: async (transaction) => {
        if (!solana) throw new Error('Connect a Solana wallet first.')
        const [out] = await features(solana.wallet.wallet)['solana:signAndSendTransaction'].signAndSendTransaction({
          account: solana.account,
          transaction,
          chain: SOLANA_MAINNET,
        })
        if (!out) throw new Error('The wallet returned no signature.')
        return base58(out.signature)
      },
      disconnect: (kind) => {
        if (kind === 'evm') {
          setEvm(undefined)
          remember(LAST_EVM)
        } else {
          if (solana) void features(solana.wallet.wallet)['standard:disconnect']?.disconnect().catch(() => {})
          setSolana(undefined)
          remember(LAST_SOL)
        }
      },
    }),
    [evmWallets, evm, solWallets, solana, attach, attachSolana],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export const BASE_CHAIN_ID = 8453

/** Asks the wallet to switch networks, adding the network first if the wallet doesn't know it. */
export async function switchChain(provider: EIP1193Provider, chain: Chain) {
  const chainId = numberToHex(chain.id)
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    })
  }
}

export const switchToBase = (provider: EIP1193Provider) => switchChain(provider, base)

/** Names of the EVM networks Pitstop can fuel from. */
export const CHAIN_NAMES: Record<number, string> = {
  8453: 'Base',
  42161: 'Arbitrum',
  10: 'Optimism',
  1: 'Ethereum',
  137: 'Polygon',
  43114: 'Avalanche',
  5042: 'Arc',
}

/** Opens the connect sheet from anywhere on the page. */
export function openConnect(tab: 'base' | 'solana' = 'base') {
  window.dispatchEvent(new CustomEvent('pitstop:connect', { detail: tab }))
}

/** Phantom also announces an EVM provider; label it so single-wallet users aren't confused. */
export const walletLabel = (w: EvmWalletInfo) => (w.rdns === 'app.phantom' ? 'Phantom (Base)' : w.name)
