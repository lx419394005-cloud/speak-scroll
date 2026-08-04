import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: '首页', end: true },
  { to: '/play', label: '开玩' },
  { to: '/leaderboard', label: '排行榜' },
  { to: '/how-to', label: '玩法' },
]

export function SiteNav() {
  return (
    <nav className="site-nav" aria-label="主导航">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `site-nav-link${isActive ? ' active' : ''}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
