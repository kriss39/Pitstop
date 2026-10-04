import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Dashboard } from './Dashboard'
import { Docs } from './Docs'
import { ErrorBoundary } from './ErrorBoundary'
import { Footer } from './Footer'
import { Fuel } from './Fuel'
import { Guard } from './Guard'
import { Header } from './Header'
import './index.css'
import { Landing } from './Landing'
import { WalletProvider } from './wallet'

const path = window.location.pathname
const search = new URLSearchParams(window.location.search)

// Older funding links point at /?to=0x…; they still open the fuel page.
function Page() {
  if (path.startsWith('/fuel') || (path === '/' && search.has('to'))) return <Fuel />
  if (path.startsWith('/guard')) return <Guard />
  if (path.startsWith('/dashboard')) return <Dashboard />
  if (path.startsWith('/docs')) return <Docs />
  return <Landing />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <Header path={path === '/' && search.has('to') ? '/fuel' : path} />
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>
      <Footer />
    </WalletProvider>
  </StrictMode>,
)
