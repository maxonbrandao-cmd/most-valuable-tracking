import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../context'
import { supabase } from '../lib/supabase'

type Attendance = {
  id: string
  fixed_post_id: string
  post_name: string
  driver_id: string
  driver_name: string
  client_name: string
  service_date: string
  checked_in_at: string
  checked_out_at: string | null
}
type StatusFilter = 'todos' | 'abertos' | 'encerrados'

function today() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function time(value: string) {
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function CompanyAttendancePanel() {
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState<StatusFilter>('todos')
  const [result, setResult] = useState<{ date: string; rows: Attendance[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [visibleCount, setVisibleCount] = useState(10)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setResult(null)
    setVisibleCount(10)
    async function load() {
      if (!date) { setLoading(false); return }
      try {
        const { data, error: queryError } = await supabase.rpc('list_company_fixed_post_attendances', { p_date: date })
        if (queryError) throw queryError
        if (!Array.isArray(data)) throw new Error('Resposta inválida ao consultar os atendimentos.')
        if (!cancelled) setResult({ date, rows: data as Attendance[] })
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Não foi possível carregar os atendimentos.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [date, revision])

  const rows = result?.date === date ? result.rows : []
  const filtered = rows.filter(row => status === 'todos' || (status === 'abertos' ? !row.checked_out_at : !!row.checked_out_at))
  const ready = !!date && !loading && !error && result?.date === date
  const openCount = rows.filter(row => !row.checked_out_at).length

  return <div className="programacoes-page">
    <div className="section-heading">
      <div><h3>Atendimentos dos postos</h3><p className="muted">Acompanhe os registros de entrada e saída dos pilotos.</p></div>
      <button type="button" className="btn btn-inline" disabled={loading || !date} onClick={() => setRevision(v => v + 1)}>Atualizar</button>
    </div>
    <div className="card">
      <div className="form-grid">
        <label className="field"><span>Data da entrada</span>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="field"><span>Status</span>
          <select value={status} onChange={e => { setStatus(e.target.value as StatusFilter); setVisibleCount(10) }}>
            <option value="todos">Todos</option><option value="abertos">Em andamento</option><option value="encerrados">Encerrados</option>
          </select>
        </label>
      </div>
      <p className="muted">Horários de Brasília. A data considera o dia do check-in, mesmo quando a saída ocorre no dia seguinte.</p>
    </div>
    {!date ? <p>Selecione uma data para consultar.</p>
      : error ? <div className="notice notice-error" role="alert">{error}</div>
      : !ready ? <p role="status">Carregando atendimentos...</p>
      : <>
        <p role="status">{rows.length} registros • {openCount} em andamento • {rows.length - openCount} encerrados</p>
        {!filtered.length ? <div className="card"><p>Nenhum atendimento encontrado para esta data e status.</p></div>
          : <div className="programacoes-list">{filtered.slice(0, visibleCount).map(row => <article key={row.id} className="card programacao-card">
            <div className="programacao-card-header">
              <div><strong className="programacao-card-name">{row.driver_name}</strong><p className="muted">{row.client_name} • {row.post_name}</p></div>
              <span className={row.checked_out_at ? 'badge b-ok' : 'badge b-blue'}>{row.checked_out_at ? 'Encerrado' : 'Em andamento'}</span>
            </div>
            <div className="programacao-card-footer">
              <span><small>Entrada</small><strong>{time(row.checked_in_at)}</strong></span>
              <span><small>Saída</small><strong>{row.checked_out_at ? time(row.checked_out_at) : 'Ainda não registrada'}</strong></span>
            </div>
          </article>)}</div>}
        {filtered.length > visibleCount && <button type="button" className="btn btn-inline" onClick={() => setVisibleCount(v => v + 10)}>
          Mostrar mais ({filtered.length - visibleCount} restantes)
        </button>}
      </>}
  </div>
}
export default function AtendimentosPostos() {
  const { state } = useStore()
  const user = state.users.find(item => item.id === state.sessionUserId)
  if (user?.role !== 'dono') return <Navigate to="/" replace />
  if (!user.companyId) return <div className="notice notice-error">Seu acesso não está vinculado a uma empresa.</div>
  return <CompanyAttendancePanel key={`${user.id}:${user.companyId}`} />
}
