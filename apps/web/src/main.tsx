import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { Footer } from './Footer'
import { Header } from './Header'
import './index.css'
import { Landing } from './Landing'

// Each page loads its own code when opened, so the landing page stays light.
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })))
const Docs = lazy(() => import('./Docs').then((m) => ({ default: m.Docs })))
const Fuel = lazy(() => import('./Fuel').then((m) => ({ default: m.Fuel })))
const Guard = lazy(() => import('./Guard').then((m) => ({ default: m.Guard })))
const StatsPage = lazy(() => import('./Stats').then((m) => ({ default: m.StatsPage })))
import { WalletProvider } from './wallet'

const path = window.location.pathname

const TITLES: [string, string][] = [
  ['/fuel', 'Fuel an agent'],
  ['/guard', 'Agent spending limits'],
  ['/dashboard', 'Agent dashboard'],
  ['/docs', 'Docs'],
  ['/stats', 'Live usage'],
]
const title = TITLES.find(([p]) => path.startsWith(p))?.[1]
if (title) document.title = `${title} · Pitstop`
const search = new URLSearchParams(window.location.search)

// Older funding links point at /?to=0x…; they still open the fuel page.
function Page() {
  if (path.startsWith('/fuel') || (path === '/' && search.has('to'))) return <Fuel />
  if (path.startsWith('/guard')) return <Guard />
  if (path.startsWith('/dashboard')) return <Dashboard />
  if (path.startsWith('/docs')) return <Docs />
  if (path.startsWith('/stats')) return <StatsPage />
  return <Landing />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <Header path={path === '/' && search.has('to') ? '/fuel' : path} />
      <ErrorBoundary>
        <Suspense fallback={<main className="page" aria-busy="true" />}>
          <Page />
        </Suspense>
      </ErrorBoundary>
      <Footer />
    </WalletProvider>
  </StrictMode>,
)
