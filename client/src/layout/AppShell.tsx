import { Link, Outlet, useLocation } from 'react-router-dom'
import { SiteNav } from './SiteNav'

export function AppShell() {
  const { pathname } = useLocation()
  const isPlay = pathname.startsWith('/play')

  return (
    <div className={`app-shell${isPlay ? ' is-play' : ''}`}>
      {!isPlay && (
        <header className="site-header">
          <Link to="/" className="brand site-brand">
            Speak Scroll
          </Link>
          <SiteNav />
        </header>
      )}
      <Outlet />
    </div>
  )
}
