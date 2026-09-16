import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../context'

const links = [
  { to: '/', label: 'Início', roles: ['dono', 'cliente', 'piloto'] },
  { to: '/rastreio', label: 'Rastreio GPS', roles: ['dono', 'cliente', 'piloto'] },
  { to: '/entregas', label: 'Entregas', roles: ['dono', 'cliente', 'piloto'] },
  { to: '/programacoes', label: 'Programações', roles: ['dono'] },
  { to: '/cadastros', label: 'Cadastros', roles: ['dono'] },
  { to: '/canhotos', label: 'Canhotos', roles: ['dono', 'piloto'] },
  { to: '/financeiro', label: 'Financeiro', roles: ['dono'] },
]

export default function Layout() {
  const { state, logout } = useStore()
  const user = state.users.find((u) => u.id === state.sessionUserId)!
  const visible = links.filter((l) => l.roles.includes(user.role))

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">M</div>
          <div>
            <h1>MVT</h1>
            <p>Most Valuable Tracking</p>
          </div>
        </div>
        {visible.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            {l.label}
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={logout}>Sair</button>
      </aside>
      <div>
        <main className="main">
          <div className="topbar">
            <div>
              <h2>Olá, {user.name.split(' ')[0]}</h2>
              <p className="muted">
                {user.role === 'dono' && 'Visão da empresa — frota, canhotos e caixa'}
                {user.role === 'cliente' && 'Acompanhe suas entregas e o piloto em tempo real'}
                {user.role === 'piloto' && 'Rotas, GPS e registro de canhoto'}
              </p>
            </div>
            <div className="user-chip">
              <span>{user.companyName ? `${user.companyName} · ${user.role}` : user.role}</span>
              <button className="btn btn-ghost hidden-desktop" onClick={logout}>Sair</button>
            </div>
          </div>
          <Outlet />
        </main>
        <nav className="bottom-nav">
          {visible.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label.split(' ')[0]}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

