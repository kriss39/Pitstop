import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Guard } from './Guard'
import './index.css'

const isGuard = window.location.pathname.startsWith('/guard')

function Nav() {
  return (
    <nav className="nav" aria-label="Pages">
      <a href="/" aria-current={!isGuard ? 'page' : undefined}>Fuel</a>
      <a href="/guard" aria-current={isGuard ? 'page' : undefined}>Guard</a>
    </nav>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Nav />
    {isGuard ? <Guard /> : <App />}
  </StrictMode>,
)
