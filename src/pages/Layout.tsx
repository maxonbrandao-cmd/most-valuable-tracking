import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../context'

const links = [
  { to: '/', label: 'Início', roles: ['dono', 'cliente', 'piloto'] },
  { to: '/rastreio', label: 'Rastreio GPS', roles: ['dono', 'cliente', 'piloto'] },
  { to: '/entregas', label: 'Entregas', roles: ['dono', 'cliente', 'piloto'] },
  { to: '/programacoes', label: 'Programações', roles: ['dono'] },
  { to: '/cadastros', label: 'Cadastros', roles: ['dono'] },
  { to: '/usuarios', label: 'Usuários', roles: ['dono'] },
  { to: '/canhotos', label: 'Canhotos', roles: ['dono', 'piloto'] },
  { to: '/financeiro', label: 'Financeiro', roles: ['dono'] },
]

export default function Layout() {
  const { state, logout } = useStore()

  const user = state.users.find(
    (u) => u.id === state.sessionUserId,
  )!

  const visible = links.filter(
    (l) => l.roles.includes(user.role),
  )

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  function closeMobileMenu() {
    setMobileMenuOpen(false)
  }

  return (
    <div className="shell">

      {/* MENU DESKTOP */}
      <aside className="sidebar">
        <div
          className="brand"
          style={{ marginBottom: 18 }}
        >
          <div className="brand-mark">M</div>

          <div>
            <h1>MVT</h1>
            <p>Most Valuable Tracking</p>
          </div>
        </div>

        {visible.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `nav-link${isActive ? ' active' : ''}`
            }
          >
            {l.label}
          </NavLink>
        ))}

        <div style={{ flex: 1 }} />

        <button
          className="btn btn-ghost"
          type="button"
          onClick={logout}
        >
          Sair
        </button>
      </aside>

      {/* CONTEÚDO */}
      <div className="content-area">
        <main className="main">

          <div className="topbar">

            <div className="mobile-topbar">
              <button
                className="mobile-menu-button"
                type="button"
                onClick={() => setMobileMenuOpen(true)}
              >
                <span className="mobile-menu-icon">☰</span>
                <span>Menu</span>
              </button>
            </div>

            <div>
              <h2>
                Olá, {user.name.split(' ')[0]}
              </h2>

              <p className="muted">
                {user.role === 'dono' &&
                  'Visão da empresa — frota, canhotos e caixa'}

                {user.role === 'cliente' &&
                  'Acompanhe suas entregas e o piloto em tempo real'}

                {user.role === 'piloto' &&
                  'Rotas, GPS e registro de canhoto'}
              </p>
            </div>

            <div className="user-chip">
              <span>
                {user.companyName
                  ? `${user.companyName} · ${user.role}`
                  : user.role}
              </span>
            </div>
          </div>

          <Outlet />

        </main>
      </div>

      {/* FUNDO ESCURO DO MENU MOBILE */}
      {mobileMenuOpen ? (
        <button
          className="mobile-menu-overlay"
          type="button"
          aria-label="Fechar menu"
          onClick={closeMobileMenu}
        />
      ) : null}

      {/* MENU LATERAL MOBILE */}
      <aside
        className={
          mobileMenuOpen
            ? 'mobile-drawer mobile-drawer-open'
            : 'mobile-drawer'
        }
      >
        <div className="mobile-drawer-header">

          <div className="brand">
            <div className="brand-mark">M</div>

            <div>
              <h1>MVT</h1>
              <p>Most Valuable Tracking</p>
            </div>
          </div>

          <button
            className="mobile-drawer-close"
            type="button"
            aria-label="Fechar menu"
            onClick={closeMobileMenu}
          >
            ×
          </button>

        </div>

        <nav className="mobile-drawer-nav">

          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `mobile-drawer-link${
                  isActive ? ' active' : ''
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}

        </nav>

        <div className="mobile-drawer-footer">
          <div className="mobile-user-info">
            <strong>{user.name}</strong>

            <span>
              {user.companyName
                ? `${user.companyName} · ${user.role}`
                : user.role}
            </span>
          </div>

          <button
            className="btn btn-ghost"
            type="button"
            onClick={logout}
          >
            Sair
          </button>
        </div>

      </aside>

    </div>
  )
}