import { useEffect, useRef, useState } from 'react'
import { CHAIN_NAMES, shortAddress, switchToBase, useWallet, walletLabel } from './wallet'

const LINKS = [
  { href: '/fuel', label: 'Fuel' },
  { href: '/guard', label: 'Guard' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docs', label: 'Docs' },
]

/** Pitstop mark: a P whose bowl is a fuel gauge. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#FFD400" />
      <rect x="15" y="12" width="9" height="40" rx="1.5" fill="#111" />
      <path d="M24 16.5h7a11.5 11.5 0 0 1 0 23h-7" fill="none" stroke="#111" strokeWidth="9" />
      <path d="M31 28 38.5 20.5" stroke="#111" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="31" cy="28" r="3.2" fill="#111" />
    </svg>
  )
}

export function Header({ path }: { path: string }) {
  return (
    <header className="topbar">
      <div className="shell">
        <a href="/" className="brand" aria-label="Pitstop home">
          <LogoMark size={28} />
          Pitstop
        </a>
        <nav className="nav" aria-label="Pages">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <ConnectButton />
      </div>
    </header>
  )
}

/** Header wallet control: pills for connected wallets, a sheet to connect or disconnect. */
function ConnectButton() {
  const w = useWallet()
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<'base' | 'solana'>('base')
  const [error, setError] = useState<string>()

  useEffect(() => {
    const onOpen = (e: Event) => {
      setTab((e as CustomEvent<'base' | 'solana'>).detail ?? 'base')
      setError(undefined)
      dialog.current?.showModal()
    }
    window.addEventListener('pitstop:connect', onOpen)
    return () => window.removeEventListener('pitstop:connect', onOpen)
  }, [])

  const open = (t: 'base' | 'solana') => {
    setTab(t)
    setError(undefined)
    dialog.current?.showModal()
  }
  const run = async (fn: () => Promise<void>) => {
    setError(undefined)
    try {
      await fn()
      dialog.current?.close()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/rejected|denied/i.test(msg) ? 'You rejected the request in your wallet.' : msg.split('\n')[0])
    }
  }
  const chainName = w.evm ? CHAIN_NAMES[w.evm.chainId] : undefined
  const wrongChain = w.evm && !chainName

  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        {w.evm && (
          <button className="wallet-pill" onClick={() => open('base')} title={walletLabel(w.evm.wallet)}>
            {w.evm.wallet.icon ? <img src={w.evm.wallet.icon} alt="" /> : <span className="chain" />}
            {shortAddress(w.evm.account)}
            <span className="muted">· {chainName ?? 'other network'}</span>
          </button>
        )}
        {w.solana && (
          <button className="wallet-pill" onClick={() => open('solana')} title={`${w.solana.wallet.name} (Solana)`}>
            {w.solana.wallet.icon ? <img src={w.solana.wallet.icon} alt="" /> : <span className="chain sol" />}
            {shortAddress(w.solana.address)}
          </button>
        )}
        {!w.evm && !w.solana && (
          <button className="primary small-btn" onClick={() => open('base')}>
            Connect wallet
          </button>
        )}
      </div>

      <dialog ref={dialog} className="sheet" aria-labelledby="connect-title">
        <div className="sheet-body">
          <div className="row">
            <h2 id="connect-title" style={{ font: '800 26px/1 var(--display)', textTransform: 'uppercase' }}>
              Connect
            </h2>
            <span className="spacer" />
            <button className="ghost small-btn" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === 'base'} onClick={() => setTab('base')}>
              EVM
            </button>
            <button role="tab" aria-selected={tab === 'solana'} onClick={() => setTab('solana')}>
              Solana
            </button>
          </div>

          {tab === 'base' ? (
            w.evm ? (
              <div className="wallet-list">
                <div className="kv"><span>Wallet</span><span>{walletLabel(w.evm.wallet)}</span></div>
                <div className="kv"><span>Address</span><code>{w.evm.account}</code></div>
                <div className="kv"><span>Network</span><span>{chainName ?? `Chain ${w.evm.chainId} (not supported)`}</span></div>
                <div className="row">
                  {wrongChain && (
                    <button className="primary small-btn" onClick={() => run(() => switchToBase(w.evm!.wallet.provider))}>
                      Switch to Base
                    </button>
                  )}
                  <button className="ghost small-btn" onClick={() => w.disconnect('evm')}>
                    Disconnect
                  </button>
                </div>
              </div>
            ) : w.evmWallets.length ? (
              <div className="wallet-list">
                {w.evmWallets.map((wallet) => (
                  <button key={wallet.uuid} className="wallet-row" onClick={() => run(() => w.connectEvm(wallet))}>
                    {wallet.icon ? <img src={wallet.icon} alt="" /> : <span className="ph" />}
                    {walletLabel(wallet)}
                    <span className="tag">{wallet.rdns}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                No EVM wallet found. Install <a href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a> or{' '}
                <a href="https://metamask.io" target="_blank" rel="noreferrer">MetaMask</a> and reload.
              </p>
            )
          ) : w.solana ? (
            <div className="wallet-list">
              <div className="kv"><span>Wallet</span><span>{w.solana.wallet.name}</span></div>
              <div className="kv"><span>Address</span><code>{w.solana.address}</code></div>
              <div className="row">
                <button className="ghost small-btn" onClick={() => w.disconnect('solana')}>
                  Disconnect
                </button>
              </div>
            </div>
          ) : w.solWallets.length ? (
            <div className="wallet-list">
              {w.solWallets.map((info) => (
                <button key={info.name} className="wallet-row" onClick={() => run(() => w.connectSolana(info))}>
                  {info.icon ? <img src={info.icon} alt="" /> : <span className="ph" />}
                  {info.name}
                  <span className="tag">solana</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">
              No Solana wallet found. Install <a href="https://phantom.com" target="_blank" rel="noreferrer">Phantom</a> or use{' '}
              <a href="https://metamask.io" target="_blank" rel="noreferrer">MetaMask</a> with Solana enabled, then reload.
            </p>
          )}

          <p className="small muted">Pitstop never sees your keys. Every transaction is signed in your wallet.</p>
          {error && <p className="note bad">{error}</p>}
        </div>
      </dialog>
    </>
  )
}
