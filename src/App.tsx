import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { StoreContext } from './context'
import { loadState, saveState, uid } from './store'
import type { AppState, Canhoto, Entrega, Role, Transacao, User } from './types'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import Login from './pages/Login'
import Layout from './pages/Layout'
import Dashboard from './pages/Dashboard'
import Tracking from './pages/Tracking'
import Entregas from './pages/Entregas'
import Programacoes from './pages/Programacoes'
import Canhotos from './pages/Canhotos'
import CanhotoNovo from './pages/CanhotoNovo'
import Financeiro from './pages/Financeiro'
import Cadastros from './pages/Cadastros'
import Usuarios from './pages/Usuarios'

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    const t = setInterval(() => {
      setState((prev) => ({
        ...prev,
        pilotos: prev.pilotos.map((p) => {
          if (p.status === 'offline') return p
          const jitter = p.status === 'em_rota' ? 0.00045 : 0.00008
          return {
            ...p,
            lat: p.lat + (Math.random() - 0.5) * jitter,
            lng: p.lng + (Math.random() - 0.5) * jitter,
            lastUpdate: new Date().toISOString(),
          }
        }),
      }))
    }, 2500)
    return () => clearInterval(t)
  }, [])

  const loadAuthenticatedProfile = useCallback(async (userId: string, email: string) => {
    if (!supabase) return 'Supabase não configurado. Verifique o arquivo .env.local.'

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, company_id, role, full_name, client_id, driver_id, active')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return 'Usuário autenticado, mas sem perfil vinculado à empresa.'
    }

    if (!profile.active) return 'Este usuário está inativo.'

    const allowedRoles: Role[] = ['dono', 'cliente', 'piloto']
    if (!allowedRoles.includes(profile.role as Role)) return 'Perfil de acesso inválido.'

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .maybeSingle()

    const authenticatedUser: User = {
      id: profile.user_id,
      name: profile.full_name,
      email,
      role: profile.role as Role,
      companyId: profile.company_id,
      companyName: company?.name,
      clientId: profile.client_id ?? undefined,
      pilotoId: profile.driver_id ?? undefined,
    }

    setState((current) => ({
      ...current,
      users: [...current.users.filter((user) => user.id !== authenticatedUser.id), authenticatedUser],
      sessionUserId: authenticatedUser.id,
    }))

    return null
  }, [])

  useEffect(() => {
    let active = true

    async function restoreSession() {
      if (!supabase) {
        if (active) {
          setState((current) => ({ ...current, sessionUserId: null }))
          setAuthReady(true)
        }
        return
      }

      const { data, error } = await supabase.auth.getSession()
      if (!active) return

      if (error || !data.session) {
        setState((current) => ({ ...current, sessionUserId: null }))
      } else {
        const message = await loadAuthenticatedProfile(
          data.session.user.id,
          data.session.user.email ?? '',
        )
        if (message) {
          await supabase.auth.signOut()
          setState((current) => ({ ...current, sessionUserId: null }))
        }
      }

      if (active) setAuthReady(true)
    }

    void restoreSession()

    const { data } = supabase?.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        setState((current) => ({ ...current, sessionUserId: null }))
      }
    }) ?? { data: { subscription: null } }

    return () => {
      active = false
      data.subscription?.unsubscribe()
    }
  }, [loadAuthenticatedProfile])

  const login = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      return 'Supabase não configurado. Verifique o arquivo .env.local e reinicie o servidor.'
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error || !data.user) {
      return 'E-mail ou senha inválidos.'
    }

    const message = await loadAuthenticatedProfile(data.user.id, data.user.email ?? email.trim())
    if (message) await supabase.auth.signOut()
    return message
  }, [loadAuthenticatedProfile])

  const logout = useCallback(() => {
    if (supabase) void supabase.auth.signOut()
    setState((s) => ({ ...s, sessionUserId: null }))
  }, [])

  const updatePilotoGps = useCallback((pilotoId: string, lat: number, lng: number) => {
    setState((s) => ({
      ...s,
      pilotos: s.pilotos.map((p) =>
        p.id === pilotoId
          ? { ...p, lat, lng, lastUpdate: new Date().toISOString(), status: 'em_rota' }
          : p,
      ),
    }))
  }, [])

  const setEntregaStatus = useCallback((id: string, status: Entrega['status']) => {
    setState((s) => ({
      ...s,
      entregas: s.entregas.map((e) =>
        e.id === id
          ? {
              ...e,
              status,
              deliveredAt: status === 'entregue' ? new Date().toISOString() : e.deliveredAt,
            }
          : e,
      ),
    }))
  }, [])

  const addCanhoto = useCallback((canhoto: Omit<Canhoto, 'id' | 'createdAt'>) => {
    setState((s) => {
      const next: Canhoto = { ...canhoto, id: uid('k'), createdAt: new Date().toISOString() }
      const entrega = s.entregas.find((e) => e.id === canhoto.entregaId)
      const transacoes = [...s.transacoes]
      if (entrega) {
        transacoes.unshift({
          id: uid('t'),
          type: 'receita',
          category: 'Entrega',
          description: `Canhoto ${next.id} — ${canhoto.receiverName}`,
          amount: entrega.value,
          date: new Date().toISOString().slice(0, 10),
          entregaId: entrega.id,
        })
      }
      return {
        ...s,
        canhotos: [next, ...s.canhotos],
        transacoes,
        entregas: s.entregas.map((e) =>
          e.id === canhoto.entregaId
            ? { ...e, status: 'entregue', deliveredAt: new Date().toISOString() }
            : e,
        ),
      }
    })
  }, [])

  const addTransacao = useCallback((tx: Omit<Transacao, 'id'>) => {
    setState((s) => ({ ...s, transacoes: [{ ...tx, id: uid('t') }, ...s.transacoes] }))
  }, [])

  const addEntrega = useCallback((e: Omit<Entrega, 'id' | 'createdAt'>) => {
    setState((s) => ({
      ...s,
      entregas: [{ ...e, id: uid('e'), createdAt: new Date().toISOString() }, ...s.entregas],
    }))
  }, [])

  const ctx = useMemo(
    () => ({ state, login, logout, updatePilotoGps, setEntregaStatus, addCanhoto, addTransacao, addEntrega }),
    [state, login, logout, updatePilotoGps, setEntregaStatus, addCanhoto, addTransacao, addEntrega],
  )

  const session = state.users.find((u) => u.id === state.sessionUserId) ?? null

  if (!authReady) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand">
            <div className="brand-mark">M</div>
            <div>
              <h1>Most Valuable Tracking</h1>
              <p>Conectando com segurança...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <StoreContext.Provider value={ctx}>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route element={session ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rastreio" element={<Tracking />} />
          <Route path="/entregas" element={<Entregas />} />
          <Route path="/programacoes" element={<Programacoes />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/canhotos" element={<Canhotos />} />
          <Route path="/canhotos/novo" element={<CanhotoNovo />} />
          <Route path="/financeiro" element={<Financeiro />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
      </Routes>
    </StoreContext.Provider>
  )
}

