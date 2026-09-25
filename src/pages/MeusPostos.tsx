import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../context'
import { supabase } from '../lib/supabase'

type Post = {
  id: string
  name: string
  weekdays: number[]
  start_date: string
  end_date: string | null
  start_time: string
  end_time: string
  active: boolean
  drivers: { id: string; name: string }[]
}

const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function formatDate(value: string | null) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem término'
}

export default function MeusPostos() {
  const { state } = useStore()
  const user = state.users.find(item => item.id === state.sessionUserId)
  const userId = user?.id
  const companyId = user?.companyId
  const clientId = user?.clientId
  const role = user?.role
  const [result, setResult] = useState<{ owner: string; rows: Post[] } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const owner = `${userId}:${companyId}:${clientId}`

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError('')
    setLoading(true)

    async function load() {
      if (role !== 'cliente' || !companyId || !clientId) {
        setLoading(false)
        return
      }
      try {
        const { data, error: loadError } = await supabase.rpc('list_my_fixed_posts')
        if (loadError) throw loadError
        if (!Array.isArray(data)) throw new Error('Resposta inválida ao carregar os postos.')
        if (!cancelled) setResult({ owner, rows: data as Post[] })
      } catch {
        if (!cancelled) setError('Não foi possível carregar seus postos. Tente novamente ou contate a empresa responsável.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [owner, companyId, clientId, role, revision])

  if (role !== 'cliente') return <Navigate to="/" replace />
  if (!companyId || !clientId) {
    return <div className="notice notice-error">Seu acesso ainda não está vinculado a um cliente. Entre em contato com a empresa responsável.</div>
  }

  const rows = result?.owner === owner ? result.rows : []
  return (
    <div className="programacoes-page">
      <div className="section-heading">
        <div>
          <h3>Pilotos Fixos</h3>
          <p className="muted">Consulte os dias, horários e pilotos alocados aos seus postos fixos.</p>
        </div>
        <button type="button" className="btn btn-inline" disabled={loading}
          onClick={() => setRevision(value => value + 1)}>
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>
      {error ? <div className="notice notice-error" role="alert">{error}</div>
        : loading || result?.owner !== owner ? <p role="status">Carregando seus postos...</p>
        : rows.length === 0 ? (
          <div className="card programacoes-empty">
            <strong>Nenhum posto fixo vinculado</strong>
            <p className="muted">Quando a empresa cadastrar um posto para você, ele aparecerá aqui.</p>
          </div>
        ) : (
          <div className="programacoes-list">
            {rows.map(post => (
              <article key={post.id} className="card programacao-card">
                <div className="programacao-card-header">
                  <div>
                    <strong className="programacao-card-name">{post.name}</strong>
                    <span className="muted">
                      {[...post.weekdays].sort((a, b) => a - b).map(day => days[day - 1]).join(', ')}
                      {' • '}{post.start_time.slice(0, 5)} às {post.end_time.slice(0, 5)}
                    </span>
                  </div>
                  <span className={post.active ? 'badge b-ok' : 'badge b-off'}>
                    {post.active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>
                <div className="programacao-section">
                  <strong>Pilotos alocados</strong>
                  <p className="muted">{post.drivers.map(driver => driver.name).join(', ') || 'Nenhum piloto alocado.'}</p>
                </div>
                <div className="programacao-card-footer">
                  <span><small>Início</small><strong>{formatDate(post.start_date)}</strong></span>
                  <span><small>Término</small><strong>{formatDate(post.end_date)}</strong></span>
                </div>
              </article>
            ))}
          </div>
        )}
    </div>
  )
}
