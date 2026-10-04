import { authorizeAgentKey, DAY_SECONDS, FUEL_TOKENS, revokeAgentKey, TEMPO_TOKENS, updateAgentLimit, type FuelTokenSymbol } from '@pitstop/sdk'
import { useEffect, useMemo, useState } from 'react'
import { isAddress, parseUnits, type Address, type Hex } from 'viem'
import { Account, WebAuthnP256 } from 'viem/tempo'
import { AddressField, AgentBoard, CopyButton, countdown, savedKey, savedLimit, savedToken, short, usd, useAgent } from './ui'

/** The owner's passkey reference. Public data: the private key stays in the authenticator. */
type OwnerCredential = { id: string; publicKey: Hex; createdAt?: string }

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

const txLink = (hash: Hex) => `https://explore.tempo.xyz/tx/${hash}`
const EXPIRY_DAYS = ['1', '7', '30', '90', '365']
const keyFromLink = new URLSearchParams(window.location.search).get('key')

export function Guard() {
  const [cred, setCred] = useState<OwnerCredential | undefined>(loadOwner)
  const [justCreated, setJustCreated] = useState(false)
  const [importText, setImportText] = useState('')
  const [keyAddr, setKeyAddr] = useState(() => keyFromLink ?? savedKey.get() ?? '')
  const [showRestore, setShowRestore] = useState(false)
  const [token, setToken] = useState<FuelTokenSymbol>(() => savedToken.get(keyAddr))
  const [limit, setLimit] = useState(() => {
    const known = keyAddr && isAddress(keyAddr) ? savedLimit.get(keyAddr) : undefined
    return known != null ? usd(known, known < 1_000_000n ? 4 : 2).replace(/\.?0+$/, '') : '5'
  })
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ text: string; hash: Hex }>()
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const owner = useMemo(() => (cred ? Account.fromWebAuthnP256(cred) : undefined), [cred])
  const wallet = owner?.address as Address | undefined
  const keyOk = isAddress(keyAddr)
  // Each key remembers the token it was scoped to on this device.
  useEffect(() => {
    if (keyOk) setToken(savedToken.get(keyAddr))
  }, [keyAddr, keyOk])
  const agent = useAgent(wallet, keyOk ? keyAddr : undefined, true, token)
  const status = agent.status
  const limitNum = Number(limit)
  const limitOk = Number.isFinite(limitNum) && limitNum > 0 && limitNum <= 1000
  const daysNum = Number(days)
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365
  const hasGas = agent.balance != null && agent.balance > 0n
  const active = status?.authorized && !status.revoked

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    setDone(undefined)
    try {
      await fn()
    } catch (e) {
      const msg = e instanceof Error ? ((e as Error & { shortMessage?: string }).shortMessage ?? e.message) : String(e)
      setError(/NotAllowedError|cancel|abort/i.test(msg) ? 'The passkey prompt was cancelled. Nothing changed.' : msg.split('\n')[0])
    } finally {
      setBusy(false)
      setConfirmRevoke(false)
    }
  }

  const createPasskey = () =>
    run(async () => {
      const c = await WebAuthnP256.createCredential({ label: 'Pitstop owner' })
      const next = { id: c.id, publicKey: c.publicKey, createdAt: new Date().toISOString().slice(0, 10) }
      saveOwner(next)
      setCred(next)
      setJustCreated(true)
    })

  const importPasskey = () =>
    run(async () => {
      const parsed = JSON.parse(importText) as Partial<OwnerCredential>
      if (typeof parsed.id !== 'string' || typeof parsed.publicKey !== 'string' || !parsed.publicKey.startsWith('0x'))
        throw new Error('Paste the backup exactly as it was shown when the passkey was created.')
      const next = { id: parsed.id, publicKey: parsed.publicKey as Hex, createdAt: parsed.createdAt }
      saveOwner(next)
      setCred(next)
    })

  const authorize = () =>
    run(async () => {
      const hash = await authorizeAgentKey({
        owner: owner!,
        key: { address: keyAddr as Address, type: 'p256' },
        token: TEMPO_TOKENS[token],
        limit: parseUnits(limit, 6),
        expiry: Math.floor(Date.now() / 1000) + daysNum * DAY_SECONDS,
      })
      savedKey.set(keyAddr)
      savedLimit.set(keyAddr, parseUnits(limit, 6))
      savedToken.set(keyAddr, token)
      setDone({ text: `Key authorized: up to ${limit} ${token} a day for ${days} days.`, hash })
      await agent.refresh()
    })

  const changeLimit = () =>
    run(async () => {
      const hash = await updateAgentLimit({ owner: owner!, key: keyAddr as Address, token: TEMPO_TOKENS[token], limit: parseUnits(limit, 6) })
      savedKey.set(keyAddr)
      savedLimit.set(keyAddr, parseUnits(limit, 6))
      setDone({ text: `Daily limit set to ${limit} ${token}.`, hash })
      await agent.refresh()
    })

  const revoke = () =>
    run(async () => {
      const hash = await revokeAgentKey({ owner: owner!, key: keyAddr as Address })
      setDone({ text: 'Key revoked. The agent can no longer spend from this wallet.', hash })
      await agent.refresh()
    })

  const limitUnits = limitOk ? parseUnits(limit, 6) : undefined
  const knownLimit = keyOk ? savedLimit.get(keyAddr) : undefined

  // One button, whose job depends on what's missing.
  const cta = !cred
    ? { label: 'Create owner passkey', onClick: createPasskey }
    : agent.balance != null && !hasGas
      ? { label: 'Fuel the wallet first', onClick: () => window.location.assign(`/fuel?to=${wallet}`) }
      : !keyOk
        ? { label: 'Enter the agent key', disabled: true }
        : status?.revoked
          ? { label: 'This key is revoked', disabled: true }
          : !limitOk
            ? { label: 'Enter a daily limit', disabled: true }
            : !active
              ? { label: 'Authorize with passkey', onClick: authorize, disabled: !daysOk || !status }
              : limitUnits === knownLimit
                ? { label: `Limit is ${limit} ${token} a day`, disabled: true }
                : { label: `Set limit to ${limit} ${token} a day`, onClick: changeLimit }

  return (
    <main className="page fuel-page">
      <header className="rise fuel-head">
        <h1 className="title">Put your agent on a leash</h1>
        <p className="lede">A daily limit, one token and an expiry. Tempo enforces them, and the agent can’t change them.</p>
      </header>

      {cred && keyOk && status?.authorized && <AgentBoard data={agent} keyAddress={keyAddr} />}

      <section className="swap rise d1" aria-label="Guard">
        <div className="swap-box">
          <div className="swap-top">
            <span className="swap-label">Owner passkey</span>
            {cred && <span className="swap-ok">✓ Ready</span>}
          </div>
          {!cred ? (
            <>
              <p className="swap-text">
                Your passkey (Touch ID, Face ID or a security key) owns the agent’s wallet. No seed phrase, and nothing for Pitstop to store.
              </p>
              {!showRestore ? (
                <button className="link-btn" onClick={() => setShowRestore(true)}>I already have one: restore from backup</button>
              ) : (
                <>
                  <textarea id="import" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"id":"…","publicKey":"0x…"}' />
                  <div className="row">
                    <button className="ghost small-btn" onClick={importPasskey} disabled={busy || !importText}>Restore</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="swap-line">
                <span>Wallet <code>{short(wallet!)}</code></span>
                <CopyButton text={wallet!} label="copy" className="link-btn" />
                <span>· ${agent.balance != null ? usd(agent.balance) : '…'}</span>
                <a className="link-btn" href={`/fuel?to=${wallet}`}>· fuel</a>
              </div>
              {justCreated && <p className="note ok small">Passkey created and saved in your device’s passkey manager.</p>}
              <details>
                <summary>Backup for another device (no secrets inside)</summary>
                <p className="small muted">Browsers don’t return a passkey’s public key later, so save this to find your wallet on another device.</p>
                <code className="block">{JSON.stringify(cred)}</code>
                <div className="row"><CopyButton text={JSON.stringify(cred)} label="Copy backup" /></div>
              </details>
            </>
          )}
        </div>

        {cred && (
          <>
            <div className="swap-box">
              <div className="swap-top">
                <span className="swap-label">Agent key</span>
                {keyOk && keyAddr === keyFromLink && <span className="swap-ok">Filled from your agent’s link</span>}
              </div>
              <AddressField label="Key" value={keyAddr} onChange={setKeyAddr} placeholder="Agent key address (0x…)" />
              {!keyOk && (
                <p className="swap-text small">
                  Your agent makes this key itself, so you never see its secret. Run <code>pnpm key</code> on the agent’s machine, or ask the
                  agent for its <code>guard_link</code>. It prints a link that opens this page with the key filled in.
                </p>
              )}
              {keyAddr !== '' && !keyOk && <small className="note bad">That isn’t a valid 0x address.</small>}
            </div>

            <div className="swap-box">
              <div className="swap-top">
                <span className="swap-label">Daily limit</span>
                {active && <span className="swap-sub">Expires in {countdown(status?.expiry)}</span>}
              </div>
              <div className="swap-row">
                <input
                  id="limit"
                  className="swap-amount"
                  inputMode="decimal"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value.replace(',', '.'))}
                  placeholder="0"
                  aria-label="Daily limit"
                />
                <div className="swap-pickers">
                  <label className="chip-select">
                    <span className="sr-only">Token the agent may spend</span>
                    <select value={token} onChange={(e) => setToken(e.target.value as FuelTokenSymbol)} disabled={busy || !!active}>
                      {FUEL_TOKENS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  {!active && (
                    <label className="chip-select">
                      <span className="sr-only">Expires in</span>
                      <select value={days} onChange={(e) => setDays(e.target.value)} disabled={busy}>
                        {EXPIRY_DAYS.map((d) => (
                          <option key={d} value={d}>{d === '1' ? '1 day' : `${d} days`}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <span className="swap-sub">
                {active ? `Scoped to ${token}. Tempo fees count toward the limit.` : `per day, in ${token} only. Tempo fees count too, so leave a little room.`}
              </span>
            </div>
          </>
        )}

        {!limitOk && limit !== '' && <p className="note bad">The daily limit must be between 0 and 1000.</p>}
        {cred && agent.balance != null && !hasGas && <p className="note warn">The wallet pays Tempo fees in stablecoins. Fuel it with $1–2 first.</p>}

        <button className="signal-btn swap-cta" onClick={cta.onClick} disabled={busy || cta.disabled}>
          {busy ? 'Waiting for your passkey…' : cta.label}
        </button>

        {active && (
          <div className="swap-alt">
            {!confirmRevoke ? (
              <button className="link-btn danger-link" onClick={() => setConfirmRevoke(true)} disabled={busy || !hasGas}>
                Revoke this key
              </button>
            ) : (
              <button className="danger solid small-btn" onClick={revoke} disabled={busy}>
                Confirm: revoke {short(keyAddr)} for good
              </button>
            )}
          </div>
        )}
        {status?.revoked && (
          <p className="swap-foot">A revoked key stays revoked. Run <code>pnpm key --new</code> on the agent’s machine and authorize the new key.</p>
        )}
        <p className="swap-foot">
          {cred
            ? 'This passkey is the only owner of the wallet. Keep it in a synced passkey manager and keep balances small.'
            : 'Your device asks for Touch ID, Face ID, your screen lock or a security key.'}
        </p>
      </section>

      {cred && keyOk && active && (
        <section className="swap next-step">
          <div className="swap-box">
            <span className="swap-label">Last step, on the agent’s machine</span>
            <code className="block">AGENT_WALLET={wallet}</code>
            <div className="row">
              <CopyButton text={`AGENT_WALLET=${wallet}`} />
              <a className="btn ghost small-btn" href={`/dashboard?wallet=${wallet}&key=${keyAddr}`}>Open dashboard</a>
            </div>
          </div>
        </section>
      )}

      {done && (
        <p className="note ok" role="status">
          {done.text}{' '}
          <a href={txLink(done.hash)} target="_blank" rel="noreferrer">Tempo explorer ↗</a>
        </p>
      )}
      {error && <p className="note bad" role="alert">{error}</p>}
    </main>
  )
}
