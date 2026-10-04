import {
  authorizeAgentKey,
  DAY_SECONDS,
  FUEL_TOKENS,
  generateAccessKey,
  getAgentKeyRecipients,
  pickFeeToken,
  revokeAgentKey,
  TEMPO_TOKENS,
  updateAgentLimit,
  type FuelTokenSymbol,
  type GeneratedAccessKey,
} from '@pitstop/sdk'
import { useEffect, useMemo, useState } from 'react'
import { SERVICES } from './services'
import { isAddress, parseUnits, type Address, type Hex } from 'viem'
import { Account, WebAuthnP256 } from 'viem/tempo'
import {
  AddressField,
  AgentBoard,
  CopyButton,
  cleanDecimal,
  countdown,
  decimalValue,
  owners,
  ownerWallet,
  savedKey,
  savedLimit,
  savedOwner,
  savedToken,
  short,
  tokenLabel,
  usd,
  useAgent,
  type OwnerCredential,
} from './ui'

const txLink = (hash: Hex) => `https://explore.tempo.xyz/tx/${hash}`
const EXPIRY_DAYS = ['1', '7', '30', '90', '365']
/** Services ticked by default when the owner limits who the agent may pay. */
const DEFAULT_PAYEES = ['Nansen', 'Codex', 'Tempo MPP gateway']
const SERVICE_LIST = Object.entries(SERVICES).map(([address, s]) => ({ address, ...s }))
const nameOf = (a: string) => SERVICES[a.toLowerCase()]?.name
const keyFromLink = new URLSearchParams(window.location.search).get('key')

/** Saves text as a file in the browser's downloads. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/** The daily limit last set for a key on this device, as text for the input. */
function limitText(key: string) {
  const known = isAddress(key) ? savedLimit.get(key) : undefined
  return known != null ? usd(known, known < 1_000_000n ? 4 : 2).replace(/\.?0+$/, '') : '5'
}

export function Guard() {
  const [cred, setCred] = useState<OwnerCredential | undefined>(savedOwner)
  const [list, setList] = useState<OwnerCredential[]>(owners.list)
  const [justCreated, setJustCreated] = useState(false)
  const [importText, setImportText] = useState('')
  const [keyAddr, setKeyAddr] = useState(() => keyFromLink ?? (cred ? savedKey.get(ownerWallet(cred)) : undefined) ?? '')
  const [showRestore, setShowRestore] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [token, setToken] = useState<FuelTokenSymbol>(() => savedToken.get(keyAddr))
  const [limit, setLimit] = useState(() => limitText(keyAddr))
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ text: string; hash: Hex }>()
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  // A key made in this browser. Held in memory only: never stored, never sent anywhere.
  const [newKey, setNewKey] = useState<GeneratedAccessKey>()
  const [keySaved, setKeySaved] = useState(false)
  const [handoff, setHandoff] = useState<'mcp' | 'env'>('mcp')
  const [reveal, setReveal] = useState(false)

  const owner = useMemo(() => (cred ? Account.fromWebAuthnP256(cred) : undefined), [cred])
  const walletOptions = useMemo(() => list.map((o) => ({ id: o.id, address: ownerWallet(o) })), [list])
  const wallet = owner?.address as Address | undefined
  const keyOk = isAddress(keyAddr)
  // Each key remembers the token it was scoped to on this device.
  useEffect(() => {
    if (keyOk) setToken(savedToken.get(keyAddr))
  }, [keyAddr, keyOk])
  const agent = useAgent(wallet, keyOk ? keyAddr : undefined, true, token)
  const status = agent.status
  const limitNum = decimalValue(limit)
  const limitOk = Number.isFinite(limitNum) && limitNum > 0 && limitNum <= 1000
  const daysNum = Number(days)
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365
  // Tempo fees are paid in a stablecoin the wallet holds (USDCe first, else the largest balance).
  const feeToken = agent.balances ? pickFeeToken(agent.balances) : undefined
  const hasGas = !!feeToken
  const expired = !!status?.authorized && !status.revoked && status.expiry * 1000 < Date.now()
  const active = status?.authorized && !status.revoked && !expired
  // A revoked or expired key can't be used again; the owner needs a new one.
  const deadKey = !!status?.revoked || expired

  // Who the key may pay: anyone, or only the ticked services (Tempo enforces it on-chain).
  const [onlyPicked, setOnlyPicked] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(SERVICE_LIST.filter((s) => DEFAULT_PAYEES.includes(s.name)).map((s) => s.address)))
  const [extraPayee, setExtraPayee] = useState('')
  const recipients = onlyPicked ? [...picked, ...(isAddress(extraPayee) ? [extraPayee.toLowerCase()] : [])].map((a) => a as Address) : undefined
  const [currentPayees, setCurrentPayees] = useState<Address[] | null>()
  useEffect(() => {
    setCurrentPayees(undefined)
    if (!active || !wallet || !keyOk) return
    let live = true
    getAgentKeyRecipients({ wallet, key: keyAddr as Address }).then(
      (r) => live && setCurrentPayees(r ?? null),
      () => {},
    )
    return () => {
      live = false
    }
  }, [active, wallet, keyAddr, keyOk, done])

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

  /** Makes `next` the active owner wallet (or none) and loads what this device knows about its agent key. */
  function switchTo(next: OwnerCredential | undefined, key?: string) {
    if (next) owners.setActive(next.id)
    setList(owners.list())
    setCred(next)
    const k = key ?? (next ? savedKey.get(ownerWallet(next)) : undefined) ?? ''
    setKeyAddr(k)
    setLimit(limitText(k))
    setJustCreated(false)
    setConfirmRemove(false)
    setConfirmRevoke(false)
    setShowRestore(false)
    setDone(undefined)
    setError(undefined)
    setNewKey(undefined)
  }

  const createKeyHere = () => {
    const k = generateAccessKey()
    setNewKey(k)
    setKeyAddr(k.address)
    setLimit(limitText(k.address))
    setKeySaved(false)
    setReveal(false)
  }

  const createPasskey = () =>
    run(async () => {
      // Number the passkeys so they can be told apart in the passkey manager.
      const c = await WebAuthnP256.createCredential({ label: list.length ? `Pitstop owner ${list.length + 1}` : 'Pitstop owner' })
      const next = { id: c.id, publicKey: c.publicKey, createdAt: new Date().toISOString().slice(0, 10) }
      owners.add(next)
      // A brand-new wallet has no key yet, unless the page was opened from an agent's link.
      switchTo(next, list.length ? '' : (keyFromLink ?? ''))
      setJustCreated(true)
    })

  const removeOwner = () => {
    owners.remove(cred!.id)
    switchTo(owners.active())
  }

  const importPasskey = () =>
    run(async () => {
      const parsed = JSON.parse(importText) as Partial<OwnerCredential>
      if (typeof parsed.id !== 'string' || typeof parsed.publicKey !== 'string' || !parsed.publicKey.startsWith('0x'))
        throw new Error('Paste the backup exactly as it was shown when the passkey was created.')
      const next = { id: parsed.id, publicKey: parsed.publicKey as Hex, createdAt: parsed.createdAt }
      owners.add(next)
      switchTo(next)
      setImportText('')
    })

  const authorize = () =>
    run(async () => {
      const hash = await authorizeAgentKey({
        feeToken,
        owner: owner!,
        key: { address: keyAddr as Address, type: 'p256' },
        token: TEMPO_TOKENS[token],
        limit: parseUnits(limit, 6),
        recipients,
        expiry: Math.floor(Date.now() / 1000) + daysNum * DAY_SECONDS,
      })
      savedKey.set(keyAddr, wallet!)
      savedLimit.set(keyAddr, parseUnits(limit, 6))
      savedToken.set(keyAddr, token)
      setDone({ text: `Key authorized: up to ${limit} ${token} a day for ${days} days.`, hash })
      await agent.refresh()
    })

  const changeLimit = () =>
    run(async () => {
      const hash = await updateAgentLimit({ owner: owner!, key: keyAddr as Address, token: TEMPO_TOKENS[token], limit: parseUnits(limit, 6), feeToken })
      savedKey.set(keyAddr, wallet!)
      savedLimit.set(keyAddr, parseUnits(limit, 6))
      setDone({ text: `Daily limit set to ${limit} ${token}.`, hash })
      await agent.refresh()
    })

  const revoke = () =>
    run(async () => {
      const hash = await revokeAgentKey({ owner: owner!, key: keyAddr as Address, feeToken })
      setDone({ text: 'Key revoked. The agent can no longer spend from this wallet.', hash })
      await agent.refresh()
    })

  const limitUnits = limitOk ? parseUnits(limit, 6) : undefined
  const knownLimit = keyOk ? savedLimit.get(keyAddr) : undefined

  // One button, whose job depends on what's missing.
  const madeHere = !!newKey && keyAddr.toLowerCase() === newKey.address.toLowerCase()
  const agentEnv = { AGENT_WALLET: wallet ?? '', PITSTOP_AGENT_KEY: newKey?.privateKey ?? '', AGENT_TOKEN: token }
  const handoffText =
    handoff === 'env'
      ? Object.entries(agentEnv).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
      : JSON.stringify({ mcpServers: { pitstop: { command: 'node', args: ['/path/to/pitstop/packages/mcp/dist/index.js'], env: { ...agentEnv, PITSTOP_DIR: '/path/to/.pitstop' } } } }, null, 2)
  const hidden = newKey ? `${newKey.privateKey.slice(0, 6)}${'•'.repeat(20)}${newKey.privateKey.slice(-4)}` : ''
  const handoffShown = reveal || !newKey ? handoffText : handoffText.replace(newKey.privateKey, hidden)

  const cta = !cred
    ? { label: 'Create owner passkey', onClick: createPasskey }
    : agent.balances != null && !hasGas
      ? { label: 'Fuel the wallet first', onClick: () => window.location.assign(`/fuel?to=${wallet}`) }
      : !keyOk
        ? { label: 'Enter the agent key', disabled: true }
        : deadKey
          ? { label: expired ? 'This key expired' : 'This key is revoked', disabled: true }
          : !limitOk
            ? { label: 'Enter a daily limit', disabled: true }
            : !active && recipients && recipients.length === 0
              ? { label: 'Pick at least one service', disabled: true }
            : madeHere && !keySaved && !active
              ? { label: 'Give the key to your agent first', disabled: true }
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
            <span className="swap-label">{cred ? 'Owner wallet' : 'Owner passkey'}</span>
            {cred && list.length > 1 ? (
              <label className="chip-select small">
                <span className="sr-only">Switch owner wallet</span>
                <select value={cred.id} onChange={(e) => switchTo(list.find((o) => o.id === e.target.value))} disabled={busy}>
                  {walletOptions.map((o, i) => (
                    <option key={o.id} value={o.id}>
                      Wallet {i + 1} · {short(o.address)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              cred && <span className="swap-ok">✓ Ready</span>
            )}
          </div>
          {!cred ? (
            <>
              <p className="swap-text">
                Your passkey (Touch ID, Face ID or a security key) owns the agent’s wallet. No seed phrase, and nothing for Pitstop to store.
              </p>
              {!showRestore && (
                <button className="link-btn" onClick={() => setShowRestore(true)}>I already have one: restore from backup</button>
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
              <div className="owner-actions">
                <button className="link-btn" onClick={createPasskey} disabled={busy}>+ New wallet</button>
                <button className="link-btn" onClick={() => setShowRestore((v) => !v)} disabled={busy}>Restore a wallet</button>
                <button className="link-btn danger-link" onClick={() => setConfirmRemove(true)} disabled={busy}>Remove from this device</button>
              </div>
              {confirmRemove && (
                <div className="note warn remove-box" role="alertdialog" aria-label="Remove this wallet from this device">
                  <p>
                    <b>This only removes {short(wallet!)} from this browser.</b> The wallet and its money stay on Tempo, the passkey stays
                    in your passkey manager, and {active ? 'the agent key keeps working until you revoke it or it expires' : 'nothing changes on-chain'}.
                    To bring it back, restore it from the backup.
                  </p>
                  {(active || (agent.balance ?? 0n) > 0n) && (
                    <p className="bad-text">
                      {active ? 'Its agent key is still active. Revoke it first if you’re done with this agent. ' : ''}
                      {(agent.balance ?? 0n) > 0n ? `It still holds $${usd(agent.balance!)}.` : ''}
                    </p>
                  )}
                  <div className="row">
                    <CopyButton text={JSON.stringify(cred)} label="Copy backup first" />
                    <button className="danger solid small-btn" onClick={removeOwner}>Remove</button>
                    <button className="ghost small-btn" onClick={() => setConfirmRemove(false)}>Cancel</button>
                  </div>
                </div>
              )}
              <details>
                <summary>Backup for another device (no secrets inside)</summary>
                <p className="small muted">Browsers don’t return a passkey’s public key later, so save this to find your wallet on another device.</p>
                <code className="block">{JSON.stringify(cred)}</code>
                <div className="row"><CopyButton text={JSON.stringify(cred)} label="Copy backup" /></div>
              </details>
            </>
          )}
          {showRestore && (
            <>
              <textarea id="import" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='Paste the backup: {"id":"…","publicKey":"0x…"}' />
              <div className="row">
                <button className="ghost small-btn" onClick={importPasskey} disabled={busy || !importText}>Restore</button>
                <button className="link-btn" onClick={() => setShowRestore(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>

        {cred && (
          <>
            <div className="swap-box">
              <div className="swap-top">
                <span className="swap-label">Agent key</span>
                {keyOk && keyAddr === keyFromLink && !madeHere && <span className="swap-ok">Filled from your agent’s link</span>}
                {madeHere && <span className="swap-ok">Created in this browser</span>}
              </div>
              <AddressField label="Key" value={keyAddr} onChange={setKeyAddr} placeholder="Agent key address (0x…)" />
              {keyOk && keyAddr === keyFromLink && !madeHere && (
                <small className="link-note">
                  Check this matches what your agent printed: <code>{keyAddr}</code>
                </small>
              )}
              {(!keyOk || deadKey) && !madeHere && (
                <div className="key-paths">
                  <button className="primary small-btn" onClick={createKeyHere} disabled={busy}>Create a key here</button>
                  <p className="swap-text small">
                    Or let the agent make its own, so its secret never leaves its machine: run <code>pnpm key</code> there, or ask the agent
                    for its <code>guard_link</code>. The link opens this page with the key filled in.
                  </p>
                </div>
              )}
              {madeHere && (
                <div className="handoff">
                  <div className="handoff-head">
                    <b>Give this to your agent</b>
                    <div className="seg" role="radiogroup" aria-label="Format">
                      <button role="radio" aria-checked={handoff === 'mcp'} onClick={() => setHandoff('mcp')}>Claude / Cursor</button>
                      <button role="radio" aria-checked={handoff === 'env'} onClick={() => setHandoff('env')}>.env file</button>
                    </div>
                  </div>
                  <p className="swap-text small">
                    {handoff === 'mcp'
                      ? 'Paste into the agent’s .mcp.json, with the path to Pitstop on that machine.'
                      : 'Put these lines in the .env file next to the agent. Pitstop’s SDK reads PITSTOP_AGENT_KEY.'}
                  </p>
                  <code className="block">{handoffShown}</code>
                  <div className="row">
                    <CopyButton text={handoffText} label="Copy" />
                    {handoff === 'env' && (
                      <button className="ghost small-btn" onClick={() => download('pitstop-agent.env', handoffText)}>Download .env</button>
                    )}
                    <button className="link-btn" onClick={() => setReveal((v) => !v)}>{reveal ? 'Hide key' : 'Show key'}</button>
                  </div>
                  <p className="note warn small">
                    This is the agent’s secret key. Whoever has it can spend up to the daily limit until you revoke it. Pitstop doesn’t keep a
                    copy, and it’s gone when you leave this page. After pasting it on the agent’s machine, copy something else to clear your
                    clipboard, and delete the downloaded file once it’s moved.
                  </p>
                  <label className="check">
                    <input type="checkbox" checked={keySaved} onChange={(e) => setKeySaved(e.target.checked)} />
                    I’ve given it to my agent
                  </label>
                </div>
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
                  onChange={(e) => setLimit(cleanDecimal(e.target.value))}
                  placeholder="0"
                  aria-label="Daily limit"
                />
                <div className="swap-pickers">
                  <label className="chip-select">
                    <span className="sr-only">Token the agent may spend</span>
                    <select value={token} onChange={(e) => setToken(e.target.value as FuelTokenSymbol)} disabled={busy || !!active}>
                      {FUEL_TOKENS.map((t) => (
                        <option key={t} value={t}>{tokenLabel(t)}</option>
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
                {active ? `Scoped to ${tokenLabel(token)}. Tempo fees count toward the limit.` : `per day, in ${tokenLabel(token)} only. Tempo fees count too, so leave a little room.`}
              </span>
            </div>

            <div className="swap-box">
              <div className="swap-top">
                <span className="swap-label">Who can it pay?</span>
                {!active && (
                  <div className="seg small-seg" role="radiogroup" aria-label="Who the agent may pay">
                    <button role="radio" aria-checked={!onlyPicked} onClick={() => setOnlyPicked(false)}>Any service</button>
                    <button role="radio" aria-checked={onlyPicked} onClick={() => setOnlyPicked(true)}>Only these</button>
                  </div>
                )}
              </div>
              {active ? (
                <p className="swap-text small">
                  {currentPayees === undefined
                    ? 'Reading from Tempo…'
                    : currentPayees === null
                      ? 'Any service. To limit it, authorize a new key with “Only these”.'
                      : `Only: ${currentPayees.map((a) => nameOf(a) ?? short(a)).join(', ')}. Tempo refuses payments to anyone else.`}
                </p>
              ) : !onlyPicked ? (
                <p className="swap-text small">The agent can pay any address, up to its daily limit.</p>
              ) : (
                <>
                  <p className="swap-text small">Tempo will refuse a payment to anyone not ticked, even within the limit.</p>
                  <div className="payees">
                    {SERVICE_LIST.map((s) => (
                      <label key={s.address} className="check payee" title={s.note}>
                        <input
                          type="checkbox"
                          checked={picked.has(s.address)}
                          onChange={(e) =>
                            setPicked((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(s.address)
                              else next.delete(s.address)
                              return next
                            })
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                  <input
                    className="swap-agent"
                    value={extraPayee}
                    onChange={(e) => setExtraPayee(e.target.value.trim())}
                    placeholder="Another payee address (optional, 0x…)"
                    spellCheck={false}
                    aria-label="Another payee address"
                  />
                  {extraPayee !== '' && !isAddress(extraPayee) && <small className="note bad">That isn’t a valid 0x address.</small>}
                </>
              )}
            </div>
          </>
        )}

        {!limitOk && limit !== '' && <p className="note bad">The daily limit must be between 0 and 1000.</p>}
        {cred && agent.balances != null && !hasGas && <p className="note warn">The wallet pays Tempo fees in stablecoins, so fuel it first ($5 or more on the Fuel page; a few cents of it covers fees).</p>}

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
        {deadKey && (
          <p className="swap-foot">
            {expired ? 'This key reached its end date.' : 'A revoked key stays revoked.'} Create a new key above, or run{' '}
            <code>pnpm key --new</code> on the agent’s machine, then authorize it.
          </p>
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
            <span className="swap-label">{madeHere ? 'Done. Restart the agent with the config above, and it can pay.' : 'Last step, on the agent’s machine'}</span>
            {!madeHere && <code className="block">AGENT_WALLET={wallet}</code>}
            <div className="row">
              {!madeHere && <CopyButton text={`AGENT_WALLET=${wallet}`} />}
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
