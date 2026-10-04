import { CONTACT_EMAIL, REPO_URL, X_HANDLE, X_URL } from './basics'

/** Site-wide footer: a help and feedback line, then the page links. */
export function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="help-band">
        <div>
          <b>Need help, or have an idea?</b>
          <p>
            Questions, bugs and feedback are all welcome. Write to{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Pitstop`}>{CONTACT_EMAIL}</a> or reach us on{' '}
            <a href={X_URL} target="_blank" rel="noreferrer">X @{X_HANDLE}</a>. We’re always open, and we read every message.
          </p>
        </div>
        <a className="btn" href={`mailto:${CONTACT_EMAIL}?subject=Pitstop%20feedback`}>Send feedback</a>
        </div>
      </div>
      <div className="shell footer-row">
        <span>Pitstop · fuel and spending limits for AI agents · built on Tempo and LI.FI</span>
        <span className="row" style={{ gap: 16 }}>
          <a href="/fuel">Fuel</a>
          <a href="/guard">Guard</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/docs">Docs</a>
          <a href="/stats">Stats</a>
          <a href={X_URL} target="_blank" rel="noreferrer">X @{X_HANDLE}</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>Email</a>
        </span>
      </div>
    </footer>
  )
}
