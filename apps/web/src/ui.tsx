import {
  FUEL_TOKENS,
  getAgentKeyStatus,
  getBalance,
  getRecentSpends,
  TEMPO_TOKENS,
  totalUsd,
  type AgentKeyStatus,
  type FuelTokenSymbol,
  type Spend,
} from '@pitstop/sdk'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { formatUnits, isAddress, type Address, type Hex } from 'viem'
import { Account } from 'viem/tempo'

export const APP_URL = 'https://fuel.pitstopgas.workers.dev'
export const BOT_HANDLE = 'pitstop_alert_bot'

export const usd = (v: bigint, dp = 2) => Number(formatUnits(v, 6)).toFixed(dp)
/** Dollars with 4 decimals under $1, so a nearly used-up limit never rounds up to a cent. */
export const money = (v: bigint) => usd(v, v < 1_000_000n ? 4 : 2)
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

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

export function PanelHead({ num, title, children }: { num?: string; title: string; children?: ReactNode }) {
  return (
    <div className="panel-head">
      {num && <span className="num">{num}</span>}
      <h2>{title}</h2>
      {children && <span className="spacer" />}
      {children}
    </div>
  )
}

/** An address shown as a short chip; clicking "change" turns it back into an input. */
export function AddressField({ label, value, onChange, placeholder = '0x…' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ok = isAddress(value)
  const [edit, setEdit] = useState(!ok)
  if (edit || !ok)
    return (
      <input
        className="swap-agent"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        onBlur={() => isAddress(value) && setEdit(false)}
        spellCheck={false}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={edit && ok}
      />
    )
  return (
    <button className="link-btn agent-chip" onClick={() => setEdit(true)} title={`Change ${label.toLowerCase()}`}>
      {label} <code>{short(value)}</code> · change
    </button>
  )
}

/** Below one cent the key can't pay even the cheapest MPP call. */
const USED_UP = 10_000n

export type KeyView = {
  flag: Flag
  label: string
  /** Daily limit: as set on this device, or estimated from what's left plus spends this period. */
  limit?: bigint
  limitEstimated?: boolean
  spentInPeriod?: bigint
  cells?: { total: number; left: number }
}

/** Turns on-chain key state (plus recent spends) into a flag, a label and a meter. */
export function describeKey(status: AgentKeyStatus | undefined, spends: Spend[] | undefined, knownLimit?: bigint): KeyView {
  if (!status) return { flag: 'none', label: 'No key' }
  if (status.revoked) return { flag: 'black', label: 'Revoked' }
  if (!status.authorized) return { flag: 'none', label: 'Not authorized' }
  if (status.expiry * 1000 < Date.now()) return { flag: 'chequered', label: 'Expired' }

  const periodStart = status.periodEnd ? status.periodEnd - 86_400 : undefined
  const spentInPeriod =
    spends && periodStart ? spends.filter((s) => s.time >= periodStart).reduce((sum, s) => sum + s.amount, 0n) : undefined
  const estimated = spentInPeriod != null ? status.remaining + spentInPeriod : undefined
  const limit = knownLimit != null && knownLimit >= status.remaining ? knownLimit : estimated
  const limitEstimated = limit != null && limit === estimated && knownLimit == null

  let cells: KeyView['cells']
  if (limit && limit > 0n) {
    // One cell per cent for small demo limits; otherwise 20 equal cells.
    const total = limit <= 200_000n ? Math.max(1, Math.round(Number(limit) / 10_000)) : 20
    const left = Math.max(0, Math.min(total, Math.floor((Number(status.remaining) / Number(limit)) * total + 1e-9)))
    cells = { total, left }
  }

  const base = { limit, limitEstimated, spentInPeriod, cells }
  if (status.remaining < USED_UP) return { flag: 'red', label: 'Limit used — blocked', ...base }
  if (limit && Number(status.remaining) / Number(limit) <= 0.2) return { flag: 'yellow', label: 'Near limit', ...base }
  return { flag: 'green', label: 'Active', ...base }
}

export function countdown(toUnix?: number) {
  if (!toUnix) return '–'
  const s = Math.max(0, toUnix - Math.floor(Date.now() / 1000))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

export type AgentData = {
  /** Token the key is scoped to; limits and spends are read for it. */
  token: FuelTokenSymbol
  balance?: bigint
  status?: AgentKeyStatus
  spends?: Spend[]
  loading: boolean
  error?: string
  refresh: () => Promise<void>
}

/** Live view of an agent wallet and (optionally) its access key. */
export function useAgent(wallet?: string, key?: string, withSpends = false, token: FuelTokenSymbol = 'USDCe'): AgentData {
  const [data, setData] = useState<Omit<AgentData, 'refresh'>>({ token, loading: false })
  const refresh = useCallback(async () => {
    if (!wallet || !isAddress(wallet)) return setData({ token, loading: false })
    setData((d) => ({ ...d, loading: true, error: undefined }))
    try {
      const [balances, status, spends] = await Promise.all([
        getBalance({ address: wallet as Address }),
        key && isAddress(key) ? getAgentKeyStatus({ wallet: wallet as Address, key: key as Address, token: TEMPO_TOKENS[token] }) : undefined,
        withSpends ? getRecentSpends({ wallet: wallet as Address, token: TEMPO_TOKENS[token] }).catch(() => undefined) : undefined,
      ])
      setData({ token, balance: totalUsd(balances), status, spends, loading: false })
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: e instanceof Error ? e.message.split('\n')[0] : String(e) }))
    }
  }, [wallet, key, withSpends, token])
  useEffect(() => void refresh(), [refresh])
  return { ...data, refresh }
}

/** Pit Board card for an agent: what's left today, in big numerals, plus the flag. */
export function AgentBoard({ data, keyAddress, tag = 'P1' }: { data: AgentData; keyAddress?: string; tag?: string }) {
  const view = describeKey(data.status, data.spends, keyAddress ? savedLimit.get(keyAddress) : undefined)
  const cls = view.flag === 'red' ? 'board blocked' : view.flag === 'black' ? 'board revoked' : 'board'
  return (
    <div className={cls} aria-live="polite">
      <div className="board-top">
        <span className="board-tag">{tag} · Agent</span>
        <FlagChip flag={view.flag}>{view.label}</FlagChip>
      </div>
      <div>
        <div className="board-big">${data.status ? money(data.status.remaining) : '–'}</div>
        <div className="board-label">
          {data.token} left today{view.limit != null && ` · of ${view.limitEstimated ? '≈' : ''}$${money(view.limit)}`}
        </div>
      </div>
      {view.cells && <FuelCells {...view.cells} />}
      <div className="board-foot">
        <span>
          Fuel <b>${data.balance != null ? usd(data.balance) : '–'}</b>
        </span>
        <span>
          Resets in <b>{countdown(data.status?.periodEnd)}</b>
        </span>
        <span>
          Key expires in <b>{countdown(data.status?.expiry)}</b>
        </span>
        {keyAddress && (
          <span>
            Key <b>{short(keyAddress)}</b>
          </span>
        )}
      </div>
    </div>
  )
}

/** Remembers each wallet's agent key on this device, so Guard and the dashboard can find it. */
export const savedKey = {
  get(wallet?: string): string | undefined {
    if (!wallet) return undefined
    try {
      return localStorage.getItem(`pitstop.agentKey.${wallet.toLowerCase()}`) ?? undefined
    } catch {
      return undefined
    }
  },
  set(key: string, wallet: string) {
    try {
      localStorage.setItem(`pitstop.agentKey.${wallet.toLowerCase()}`, key)
    } catch {
      // ignore
    }
  },
}

/** The token the owner scoped a key to on this device (USDCe if never set). */
export const savedToken = {
  get(key?: string): FuelTokenSymbol {
    try {
      const v = key ? localStorage.getItem(`pitstop.token.${key.toLowerCase()}`) : null
      return (FUEL_TOKENS as readonly string[]).includes(v ?? '') ? (v as FuelTokenSymbol) : 'USDCe'
    } catch {
      return 'USDCe'
    }
  },
  set(key: string, token: FuelTokenSymbol) {
    try {
      localStorage.setItem(`pitstop.token.${key.toLowerCase()}`, token)
    } catch {
      // ignore
    }
  },
}

/** Token picker for the four stablecoins Pitstop can deliver to Tempo. */
export function TokenPicker({ value, onChange, disabled, label }: { value: FuelTokenSymbol; onChange: (t: FuelTokenSymbol) => void; disabled?: boolean; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {FUEL_TOKENS.map((t) => (
        <button key={t} role="radio" aria-checked={value === t} onClick={() => onChange(t)} disabled={disabled}>
          {t}
        </button>
      ))}
    </div>
  )
}

/** The daily limit the owner set for a key on this device (the chain only exposes what's left). */
export const savedLimit = {
  get(key: string): bigint | undefined {
    try {
      const v = localStorage.getItem(`pitstop.limit.${key.toLowerCase()}`)
      return v ? BigInt(v) : undefined
    } catch {
      return undefined
    }
  },
  set(key: string, limit: bigint) {
    try {
      localStorage.setItem(`pitstop.limit.${key.toLowerCase()}`, limit.toString())
    } catch {
      // ignore
    }
  },
}

/** An owner passkey reference. Public data: the private key never leaves the authenticator. */
export type OwnerCredential = { id: string; publicKey: Hex; createdAt?: string }

const ACTIVE_OWNER = 'pitstop.owner.v1'
const ALL_OWNERS = 'pitstop.owners.v1'

/** The guarded wallet a passkey owns. */
export const ownerWallet = (c: OwnerCredential) => Account.fromWebAuthnP256(c).address

function read<T>(k: string): T | undefined {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}
function write(k: string, v: unknown) {
  try {
    if (v === undefined) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    // Storage blocked: the page still works for this session.
  }
}

/** Owner wallets on this device. One is active; Fuel, Guard and the dashboard use it. */
export const owners = {
  list(): OwnerCredential[] {
    const all = read<OwnerCredential[]>(ALL_OWNERS)
    if (all) return all
    // Before multiple wallets, the device kept one owner and one agent key.
    const legacy = read<OwnerCredential>(ACTIVE_OWNER)
    if (!legacy) return []
    try {
      const key = localStorage.getItem('pitstop.agentKey')
      if (key) savedKey.set(key, ownerWallet(legacy))
    } catch {
      // ignore
    }
    write(ALL_OWNERS, [legacy])
    return [legacy]
  },
  active(): OwnerCredential | undefined {
    return read<OwnerCredential>(ACTIVE_OWNER)
  },
  /** Adds a wallet (or finds it again) and makes it the active one. */
  add(c: OwnerCredential) {
    const all = owners.list().filter((o) => o.id !== c.id)
    write(ALL_OWNERS, [...all, c])
    write(ACTIVE_OWNER, c)
  },
  setActive(id: string) {
    write(ACTIVE_OWNER, owners.list().find((o) => o.id === id))
  },
  /** Forgets a wallet on this device only. The wallet stays on Tempo and the passkey stays in the passkey manager. */
  remove(id: string) {
    const rest = owners.list().filter((o) => o.id !== id)
    write(ALL_OWNERS, rest)
    if (owners.active()?.id === id) write(ACTIVE_OWNER, rest[rest.length - 1])
  },
}

/** The active owner passkey on this device, if any. */
export function savedOwner(): OwnerCredential | undefined {
  owners.list() // runs the one-time migration
  return owners.active()
}
