import { useEffect, useState, type FormEvent } from 'react'
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
  origin_address: string | null
  drivers: { id: string; name: string }[]
  requests: { id: string; code: string; status: string; driver_name: string | null; created_at: string }[]
}

type RequestForm = { origin: string; originCep: string; destination: string; destinationCep: string; recipient: string; phone: string; notes: string }
const emptyRequest: RequestForm = { origin: '', originCep: '', destination: '', destinationCep: '', recipient: '', phone: '', notes: '' }

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
  const [requestError, setRequestError] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [form, setForm] = useState<RequestForm>(emptyRequest)
  const [submitting, setSubmitting] = useState(false)
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
  async function submitRequest(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !selectedPost || submitting) return
    setSubmitting(true)
    setRequestError('')
    try {
      const { error: requestError } = await supabase.rpc('request_fixed_post_delivery', {
        p_fixed_post_id: selectedPost.id,
        p_origin_address: form.origin.trim(),
        p_origin_postal_code: form.originCep.replace(/\D/g, ''),
        p_destination_address: form.destination.trim(),
        p_destination_postal_code: form.destinationCep.replace(/\D/g, ''),
        p_recipient_name: form.recipient.trim(),
        p_recipient_phone: form.phone.trim(),
        p_notes: form.notes.trim(),
      })
      if (requestError) throw requestError
      setSelectedPost(null)
      setForm(emptyRequest)
      setRequestMessage('Solicitação enviada. A empresa confirmará a corrida e informará o piloto designado.')
      setRevision(value => value + 1)
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'Não foi possível solicitar a corrida. Tente novamente.')
    } finally { setSubmitting(false) }
  }
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
                {post.active && <button type="button" className="btn btn-gold btn-inline" onClick={() => {
                  setSelectedPost(post)
                  setForm({ ...emptyRequest, origin: post.origin_address || '' })
                  setRequestError('')
                }}>Solicitar corrida avulsa</button>}
                {post.requests?.length > 0 && <div className="programacao-section">
                  <strong>Corridas deste posto</strong>
                  {post.requests.map(request => <p className="muted" key={request.id}>
                    {request.code} · {request.status === 'pendente' && !request.driver_name ? 'Aguardando confirmação e piloto' : request.status.replace('_', ' ')}
                    {request.driver_name ? ` · Piloto: ${request.driver_name}` : ''}
                  </p>)}
                </div>}
                <div className="programacao-card-footer">
                  <span><small>Início</small><strong>{formatDate(post.start_date)}</strong></span>
                  <span><small>Término</small><strong>{formatDate(post.end_date)}</strong></span>
                </div>
              </article>
            ))}
          </div>
        )}
      {requestMessage && <div className="notice" role="status">{requestMessage}<button type="button" className="btn btn-inline" onClick={() => setRequestMessage('')}>Fechar</button></div>}
      {selectedPost && <div className="card" role="dialog" aria-modal="true" aria-labelledby="request-title" style={{ position: 'fixed', zIndex: 1000, inset: '8% 5%', overflow: 'auto', maxWidth: 680, margin: 'auto', padding: 24, boxShadow: '0 12px 48px #0005' }}>
        <h3 id="request-title">Solicitar corrida · {selectedPost.name}</h3>
        <p className="muted">A origem veio do endereço do posto, mas você pode alterar. A empresa confirmará a corrida e designará um piloto.</p>
        <form onSubmit={submitRequest} className="cadastro-form">
          <label className="field"><span>Endereço de coleta</span><input required value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} /></label>
          <label className="field"><span>CEP da coleta</span><input inputMode="numeric" value={form.originCep} onChange={e => setForm({ ...form, originCep: e.target.value })} /></label>
          <label className="field"><span>Endereço de entrega</span><input required value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} /></label>
          <label className="field"><span>CEP da entrega</span><input inputMode="numeric" value={form.destinationCep} onChange={e => setForm({ ...form, destinationCep: e.target.value })} /></label>
          <label className="field"><span>Nome de quem recebe</span><input value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} /></label>
          <label className="field"><span>Telefone de quem recebe</span><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="field"><span>Observações</span><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          {requestError && <div className="notice notice-error" role="alert">{requestError}</div>}
          <div className="form-actions"><button className="btn btn-gold" disabled={submitting}>{submitting ? 'Enviando...' : 'Enviar solicitação'}</button><button type="button" className="btn btn-inline" disabled={submitting} onClick={() => setSelectedPost(null)}>Cancelar</button></div>
        </form>
      </div>}
    </div>
  )
}
