import {
  authorizeAgentKey,
  DAY_SECONDS,
  getAgentKeyStatus,
  getBalance,
  revokeAgentKey,
  totalUsd,
  updateAgentLimit,
  type AgentKeyStatus,
} from '@pitstop/sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatUnits, isAddress, parseUnits, type Address, type Hex } from 'viem'
import { Account, WebAuthnP256 } from 'viem/tempo'

/** The owner's passkey reference. Public data: the private key stays in the authenticator. */
type OwnerCredential = { id: string; publicKey: Hex }

const STORE_KEY = 'pitstop.owner.v1'

function loadOwner(): OwnerCredential | undefined {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as OwnerCredential) : undefined
  } catch {
    return undefined
  }
}
function saveOwner(cred: OwnerCredential) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cred))
  } catch {
    // Storage blocked: the page still works for this session.
  }
}

const usd = (v: bigint, dp = 2) => Number(formatUnits(v, 6)).toFixed(dp)
const date = (t?: number) => (t ? new Date(t * 1000).toLocaleString() : '–')
const txLink = (hash: Hex) => `https://explore.tempo.xyz/tx/${hash}`

export function Guard() {
  const [cred, setCred] = useState<OwnerCredential | undefined>(loadOwner)
  const [importText, setImportText] = useState('')
  const [keyAddr, setKeyAddr] = useState(() => new URLSearchParams(window.location.search).get('key') ?? '')
  const [limit, setLimit] = useState('5')
  const [days, setDays] = useState('30')
  const [balance, setBalance] = useState<bigint>()
  const [status, setStatus] = useState<AgentKeyStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ text: string; hash: Hex }>()
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const owner = useMemo(() => (cred ? Account.fromWebAuthnP256(cred) : undefined), [cred])
  const wallet = owner?.address as Address | undefined
  const keyOk = isAddress(keyAddr)
  const limitNum = Number(limit)
  const limitOk = Number.isFinite(limitNum) && limitNum > 0 && limitNum <= 1000
  const daysNum = Number(days)
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365
  const hasGas = balance != null && balance > 0n

  const refresh = useCallback(async () => {
    if (!wallet) return
    try {
      setBalance(totalUsd(await getBalance({ address: wallet })))
      setStatus(keyOk ? await getAgentKeyStatus({ wallet, key: keyAddr as Address }) : undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : String(e))
    }
  }, [wallet, keyAddr, keyOk])

  useEffect(() => void refresh(), [refresh])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    setDone(undefined)
    try {
      await fn()
    } catch (e) {
      const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e)
      setError(/NotAllowedError|cancel|abort/i.test(msg) ? 'The passkey prompt was cancelled.' : msg.split('\n')[0])
    } finally {
      setBusy(false)
      setConfirmRevoke(false)
    }
  }

  const createPasskey = () =>
    run(async () => {
      const c = await WebAuthnP256.createCredential({ label: 'Pitstop owner' })
      const next = { id: c.id, publicKey: c.publicKey }
      saveOwner(next)
      setCred(next)
    })

  const importPasskey = () =>
    run(async () => {
      const parsed = JSON.parse(importText) as Partial<OwnerCredential>
      if (typeof parsed.id !== 'string' || typeof parsed.publicKey !== 'string' || !parsed.publicKey.startsWith('0x'))
        throw new Error('Paste the backup JSON exactly as shown when the passkey was created.')
      const next = { id: parsed.id, publicKey: parsed.publicKey as Hex }
      saveOwner(next)
      setCred(next)
    })

  const authorize = () =>
    run(async () => {
      const hash = await authorizeAgentKey({
        owner: owner!,
        key: { address: keyAddr as Address, type: 'p256' },
        limit: parseUnits(limit, 6),
        expiry: Math.floor(Date.now() / 1000) + daysNum * DAY_SECONDS,
      })
      setDone({ text: `Key authorized: up to ${limit} USDCe per day for ${days} days.`, hash })
      await refresh()
    })

  const changeLimit = () =>
    run(async () => {
      const hash = await updateAgentLimit({ owner: owner!, key: keyAddr as Address, limit: parseUnits(limit, 6) })
      setDone({ text: `Daily limit set to ${limit} USDCe.`, hash })
      await refresh()
    })

  const revoke = () =>
    run(async () => {
      const hash = await revokeAgentKey({ owner: owner!, key: keyAddr as Address })
      setDone({ text: 'Key revoked. The agent can no longer spend.', hash })
      await refresh()
    })

  return (
    <main className="page">
      <header className="top">
        <p className="eyebrow">Pitstop · Guard</p>
        <h1>Keep your agent on a leash</h1>
        <p className="lede">
          Your passkey owns the agent's wallet. The agent gets a key that can spend only up to a daily limit, until it expires.
          You can revoke it at any time.
        </p>
      </header>

      <section className="panel">
        <h2 className="h2">1. Owner passkey</h2>
        {!cred ? (
          <>
            <p className="muted">
              Creates a passkey on this device (Touch ID, Face ID or a security key). Its public key defines the guarded wallet
              address.
            </p>
            <div className="row">
              <button className="primary" onClick={createPasskey} disabled={busy}>Create passkey</button>
            </div>
            <details>
              <summary className="muted">Restore from backup</summary>
              <div className="field">
                <textarea id="import" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"id":"…","publicKey":"0x…"}' />
                <div className="row"><button onClick={importPasskey} disabled={busy || !importText}>Restore</button></div>
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="kv">
              <span>Guarded wallet</span>
              <code className="mono">{wallet}</code>
            </div>
            <div className="kv">
              <span>Balance</span>
              <span>{balance != null ? `$${usd(balance)}` : '…'} · <a href={`/?to=${wallet}`}>Fuel this wallet</a></span>
            </div>
            {!hasGas && balance != null && (
              <small className="warn">The wallet needs a little USDCe to pay Tempo fees. Fuel it first (1–2 USDC is plenty).</small>
            )}
            <details>
              <summary className="muted">Backup (public data, keep it with your notes)</summary>
              <code className="mono block">{JSON.stringify(cred)}</code>
              <small className="muted">The passkey itself stays in your device. This only lets the page find it again.</small>
            </details>
          </>
        )}
      </section>

      {cred && (
        <section className="panel">
          <h2 className="h2">2. Agent key</h2>
          <label className="field">
            <span>Agent key address (from <code>pnpm key</code> on the agent machine)</span>
            <input id="key" value={keyAddr} onChange={(e) => setKeyAddr(e.target.value.trim())} spellCheck={false} placeholder="0x…" />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Daily limit (USDCe)</span>
              <input id="limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(',', '.'))} />
            </label>
            <label className="field">
              <span>Expires in (days)</span>
              <input id="days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
          </div>

          {keyOk && status && (
            <div className="status">
              <div className="kv"><span>State</span><strong>{status.revoked ? 'Revoked' : status.authorized ? 'Active' : 'Not authorized'}</strong></div>
              {status.authorized && !status.revoked && (
                <>
                  <div className="kv"><span>Left today</span><span>{usd(status.remaining)} USDCe</span></div>
                  <div className="kv"><span>Resets</span><span>{date(status.periodEnd)}</span></div>
                  <div className="kv"><span>Expires</span><span>{date(status.expiry)}</span></div>
                </>
              )}
            </div>
          )}

          <div className="row">
            {(!status?.authorized || status.revoked) && (
              <button className="primary" onClick={authorize} disabled={busy || !keyOk || !limitOk || !daysOk || !hasGas}>
                Authorize with passkey
              </button>
            )}
            {status?.authorized && !status.revoked && (
              <>
                <button onClick={changeLimit} disabled={busy || !limitOk || !hasGas}>Set daily limit to {limit}</button>
                {!confirmRevoke ? (
                  <button className="danger" onClick={() => setConfirmRevoke(true)} disabled={busy || !hasGas}>Revoke key</button>
                ) : (
                  <button className="danger solid" onClick={revoke} disabled={busy}>Confirm revoke</button>
                )}
              </>
            )}
            <button onClick={() => void refresh()} disabled={busy}>Refresh</button>
          </div>
          {!limitOk && <small className="warn">Daily limit must be between 0 and 1000.</small>}
          {!daysOk && <small className="warn">Expiry must be 1 to 365 whole days.</small>}
        </section>
      )}

      {cred && keyOk && status?.authorized && !status.revoked && (
        <section className="panel">
          <h2 className="h2">3. On the agent machine</h2>
          <p className="muted">Add the wallet to the agent's <code>.env</code>, then let it spend:</p>
          <code className="mono block">AGENT_WALLET={wallet}</code>
          <code className="mono block">pnpm spend 1</code>
        </section>
      )}

      {done && (
        <p className="ok-note" role="status">
          {done.text} <a href={txLink(done.hash)} target="_blank" rel="noreferrer">Tempo Explorer</a>
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
