import { Navigate } from 'react-router-dom'
import { useStore } from '../context'
import { useFixedPostAttendance, attendanceTime, attendanceToday } from '../lib/useFixedPostAttendance'

const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const date = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sem término'

function AttendancePanel() {
  const { posts, records, loading, busy, error, message, record, refresh } = useFixedPostAttendance()
  const open = records.find(a => !a.checked_out_at)
  const today = attendanceToday()
  return <div className="programacoes-page">
    <div className="section-heading">
      <div><h3>Meus postos fixos</h3><p className="muted">Consulte suas alocações e registre a entrada e a saída do atendimento.</p></div>
      <button type="button" className="btn btn-inline" disabled={loading || busy} onClick={refresh}>Atualizar</button>
    </div>
    {message && <div className="notice notice-ok" role="status">{message}</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {loading ? <p role="status">Carregando atendimentos...</p> : <>
      {open && <div className="card">
        <h3>Atendimento em aberto — {open.post_name}</h3>
        <p>Entrada: {attendanceTime(open.checked_in_at)}</p>
        <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void record(open.fixed_post_id, 'check_out')}>
          {busy ? 'Registrando...' : 'Registrar saída (check-out)'}
        </button>
      </div>}
      {!posts.length && !error && <p>Nenhum posto fixo vinculado.</p>}
      <div className="programacoes-list">{posts.map(post => {
        const done = records.some(a => a.fixed_post_id === post.id && a.service_date === today)
        return <article key={`${post.id}:${post.start_date}:${post.end_date}`} className="card programacao-card">
          <div className="programacao-card-header">
            <div><strong className="programacao-card-name">{post.name}</strong><p>{post.client_name}</p></div>
            <span className={post.active ? 'badge b-ok' : 'badge b-off'}>{post.active ? 'Ativo' : 'Pausado'}</span>
          </div>
          <p>{[...post.weekdays].sort((a,b) => a-b).map(day => days[day-1]).join(', ')} • {post.start_time.slice(0,5)} às {post.end_time.slice(0,5)}</p>
          <p>Alocação: {date(post.start_date)} — {date(post.end_date)}</p>
          {done ? <p>Atendimento de hoje já registrado.</p> : <button type="button" className="btn btn-gold"
            disabled={busy || !!open || !post.active || !!error} onClick={() => void record(post.id, 'check_in')}>
            {busy ? 'Registrando...' : 'Registrar entrada (check-in)'}
          </button>}
        </article>
      })}</div>
      <h3>Registros dos últimos 30 dias</h3>
      {!records.length && !error && <p>Nenhum atendimento registrado.</p>}
      {records.map(a => <div key={a.id} className="card">
        <strong>{a.post_name}</strong>
        <p>Entrada: {attendanceTime(a.checked_in_at)}</p>
        <p>Saída: {a.checked_out_at ? attendanceTime(a.checked_out_at) : 'Em aberto'}</p>
      </div>)}
    </>}
  </div>
}
export default function MeusPostosPiloto() {
  const { state } = useStore()
  const user = state.users.find(item => item.id === state.sessionUserId)
  if (user?.role !== 'piloto') return <Navigate to="/" replace />
  if (!user.companyId || !user.pilotoId) return <div className="notice notice-error">Seu acesso não está vinculado a um piloto. Contate a empresa.</div>
  return <AttendancePanel key={`${user.id}:${user.companyId}:${user.pilotoId}`} />
}
