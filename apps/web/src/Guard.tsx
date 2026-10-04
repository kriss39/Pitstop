import { authorizeAgentKey, DAY_SECONDS, revokeAgentKey, updateAgentLimit } from '@pitstop/sdk'
import { useMemo, useState } from 'react'
import { isAddress, parseUnits, type Address, type Hex } from 'viem'
import { Account, WebAuthnP256 } from 'viem/tempo'
import { AgentBoard, CopyButton, describeKey, PanelHead, savedKey, savedLimit, short, usd, useAgent } from './ui'

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

export function Guard() {
  const [cred, setCred] = useState<OwnerCredential | undefined>(loadOwner)
  const [justCreated, setJustCreated] = useState(false)
  const [importText, setImportText] = useState('')
  const [keyAddr, setKeyAddr] = useState(() => new URLSearchParams(window.location.search).get('key') ?? savedKey.get() ?? '')
  const [limit, setLimit] = useState('5')
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ text: string; hash: Hex }>()
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const owner = useMemo(() => (cred ? Account.fromWebAuthnP256(cred) : undefined), [cred])
  const wallet = owner?.address as Address | undefined
  const keyOk = isAddress(keyAddr)
  const agent = useAgent(wallet, keyOk ? keyAddr : undefined, true)
  const status = agent.status
  const view = describeKey(status, agent.spends, keyOk ? savedLimit.get(keyAddr) : undefined)
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
        limit: parseUnits(limit, 6),
        expiry: Math.floor(Date.now() / 1000) + daysNum * DAY_SECONDS,
      })
      savedKey.set(keyAddr)
      savedLimit.set(keyAddr, parseUnits(limit, 6))
      setDone({ text: `Key authorized: up to ${limit} USDCe a day for ${days} days.`, hash })
      await agent.refresh()
    })

  const changeLimit = () =>
    run(async () => {
      const hash = await updateAgentLimit({ owner: owner!, key: keyAddr as Address, limit: parseUnits(limit, 6) })
      savedKey.set(keyAddr)
      savedLimit.set(keyAddr, parseUnits(limit, 6))
      setDone({ text: `Daily limit set to ${limit} USDCe.`, hash })
      await agent.refresh()
    })

  const revoke = () =>
    run(async () => {
      const hash = await revokeAgentKey({ owner: owner!, key: keyAddr as Address })
      setDone({ text: 'Key revoked. The agent can no longer spend from this wallet.', hash })
      await agent.refresh()
    })

  return (
    <main className="page">
      <header className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="eyebrow">02 · Guard</p>
        <h1 className="title">Keep your agent on a leash</h1>
        <p className="lede">
          Your passkey owns the agent’s wallet. The agent only gets a spending key with three controls: a daily
          <b> limit</b>, the <b>scope</b> of USDCe it may spend, and an <b>expiry</b>. Tempo enforces them on-chain; the agent can’t change them.
        </p>
      </header>

      {cred && keyOk && status && <AgentBoard data={agent} keyAddress={keyAddr} />}

      <section className="panel">
        <PanelHead num="1" title="Owner passkey" />
        {!cred ? (
          <>
            <p>
              A passkey works like Face ID for this wallet: no seed phrase, and nothing for Pitstop to store. Its public key becomes the
              address of your agent’s guarded wallet.
            </p>
            <p className="small muted">Your device will ask for Touch ID, Face ID, your screen lock or a security key.</p>
            <div className="row">
              <button className="primary" onClick={createPasskey} disabled={busy}>
                Create owner passkey
              </button>
            </div>
            <details>
              <summary>I already have one: restore from backup</summary>
              <textarea id="import" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"id":"…","publicKey":"0x…"}' />
              <div className="row">
                <button className="ghost small-btn" onClick={importPasskey} disabled={busy || !importText}>
                  Restore
                </button>
              </div>
            </details>
          </>
        ) : (
          <>
            {justCreated && (
              <p className="note ok">
                Owner passkey created. It’s saved in your device’s passkey manager (for example iCloud Keychain or Google Password Manager).
              </p>
            )}
            <div className="kv"><span>Passkey</span><span>Pitstop owner{cred.createdAt && ` · created ${cred.createdAt}`}</span></div>
            <div className="kv"><span>Guarded wallet</span><code>{wallet}</code></div>
            <div className="kv">
              <span>Fuel</span>
              <span>
                ${agent.balance != null ? usd(agent.balance) : '…'} · <a href={`/fuel?to=${wallet}`}>Fuel this wallet</a>
              </span>
            </div>
            {!hasGas && agent.balance != null && (
              <p className="note warn">The wallet pays Tempo fees in USDCe. Fuel it with 1–2 USDC before authorizing a key.</p>
            )}
            <p className="note warn small">
              This passkey is the only owner of the wallet. If you lose it, you can’t change limits or revoke the key, so keep it in a synced
              passkey manager and keep only small balances here.
            </p>
            <details>
              <summary>Backup for another device (no secrets inside)</summary>
              <p className="small muted">
                Browsers don’t return a passkey’s public key later, so save this to find your wallet on another device. It contains no
                private key.
              </p>
              <code className="block">{JSON.stringify(cred)}</code>
              <div className="row"><CopyButton text={JSON.stringify(cred)} label="Copy backup" /></div>
            </details>
          </>
        )}
      </section>

      {cred && (
        <section className="panel">
          <PanelHead num="2" title="Agent key" />
          <label className="field">
            <span>Agent key address (printed by <code>pnpm key</code> on the agent’s machine)</span>
            <input id="key" value={keyAddr} onChange={(e) => setKeyAddr(e.target.value.trim())} spellCheck={false} placeholder="0x…" />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Daily limit (USDCe)</span>
              <input id="limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(',', '.'))} />
            </label>
            <label className="field">
              <span>Expires in (days)</span>
              <input id="days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} disabled={!!active} />
            </label>
          </div>
          <p className="small muted">Tempo fees for the agent’s payments come out of the same daily limit, so leave a small buffer.</p>

          <div className="row">
            {!active && (
              <button className="primary" onClick={authorize} disabled={busy || !keyOk || !limitOk || !daysOk || !hasGas}>
                Authorize with passkey
              </button>
            )}
            {active && (
              <>
                <button className="primary" onClick={changeLimit} disabled={busy || !limitOk || !hasGas}>
                  Set daily limit to {limit}
                </button>
                {!confirmRevoke ? (
                  <button className="danger" onClick={() => setConfirmRevoke(true)} disabled={busy || !hasGas}>
                    Revoke key (permanent)
                  </button>
                ) : (
                  <button className="danger solid" onClick={revoke} disabled={busy}>
                    Confirm: revoke {short(keyAddr)}
                  </button>
                )}
              </>
            )}
            <button className="ghost" onClick={() => void agent.refresh()} disabled={busy}>
              Refresh
            </button>
          </div>
          {!limitOk && <p className="note bad">Daily limit must be between 0 and 1000.</p>}
          {!daysOk && <p className="note bad">Expiry must be 1 to 365 whole days.</p>}
          {view.flag === 'black' && <p className="small muted">A revoked key stays revoked. Run <code>pnpm key --new</code> on the agent’s machine and authorize the new key.</p>}
        </section>
      )}

      {cred && keyOk && active && (
        <section className="panel">
          <PanelHead num="3" title="On the agent’s machine" />
          <p className="small muted">Point the agent at its guarded wallet, then let it pay MPP services:</p>
          <code className="block">AGENT_WALLET={wallet}</code>
          <div className="row">
            <CopyButton text={`AGENT_WALLET=${wallet}`} />
            <a className="btn ghost small-btn" href={`/dashboard?wallet=${wallet}&key=${keyAddr}`}>
              Open dashboard
            </a>
          </div>
        </section>
      )}

      {done && (
        <p className="note ok" role="status">
          {done.text}{' '}
          <a href={txLink(done.hash)} target="_blank" rel="noreferrer">
            Tempo explorer ↗
          </a>
        </p>
      )}
      {error && <p className="note bad" role="alert">{error}</p>}
    </main>
  )
}
