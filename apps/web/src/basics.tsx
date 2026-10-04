import { useState, type ReactNode } from 'react'

// Small shared pieces with no SDK or wallet code, so light pages (landing, header, footer)
// don't pull in the whole Tempo stack.

/** How a token is named on screen: USDC.e and pathUSD as their issuers write them. */
export const tokenLabel = (symbol: string) => (symbol === 'USDCe' ? 'USDC.e' : symbol === 'PathUSD' ? 'pathUSD' : symbol)

export const APP_URL = 'https://fuel.pitstopgas.workers.dev'

/** The mainnet demo agent: its wallet, key and $0.05 daily limit, as a dashboard link. */
export const DEMO_DASHBOARD = '/dashboard?wallet=0x9Bd4984986D273ee27077C42Fe63dFB712b50bC0&key=0xd2a1B1a5c8cd78A31F95E9b41Dd7c1Eb92900074&limit=0.05'

export const BOT_HANDLE = 'pitstop_alert_bot'

export const X_HANDLE = 'pitstop_agents'

export const CONTACT_EMAIL = 'pitstop.agents@gmail.com'

export const X_URL = `https://x.com/${X_HANDLE}`
export const REPO_URL = 'https://github.com/kriss39/pitstop'

/** Racing-flag status vocabulary. */
export type Flag = 'green' | 'yellow' | 'red' | 'black' | 'chequered' | 'none'

export function FlagChip({ flag, children }: { flag: Flag; children: ReactNode }) {
  return (
    <span className={`flag flag-${flag}`}>
      <i aria-hidden />
      {children}
    </span>
  )
}

/** Segmented meter: lit cells are what's left, dim cells are spent. */
export function FuelCells({ total, left }: { total: number; left: number }) {
  return (
    <div className="cells" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={left} aria-label={`${left} of ${total} left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < left ? 'on' : 'spent'} />
      ))}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', className = 'ghost small-btn' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => {},
        )
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
