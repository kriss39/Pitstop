import { Component, type ReactNode } from 'react'

/** Shows a short message instead of a blank page if a page throws while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="page">
        <h1 className="title">Something went wrong</h1>
        <p className="lede">This page hit an error. Nothing was sent from your wallet. Reload to try again.</p>
        <p className="small muted">{this.state.error.message}</p>
        <div className="row">
          <button className="signal-btn" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </main>
    )
  }
}
