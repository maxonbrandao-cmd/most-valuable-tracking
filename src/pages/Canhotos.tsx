import { Link } from 'react-router-dom'
import { useStore } from '../context'
import { visibleEntregas } from '../lib/scope'

export default function Canhotos() {
  const { state } = useStore()
  const user = state.users.find((u) => u.id === state.sessionUserId)!
  const entregas = visibleEntregas(state, user)
  const ids = new Set(entregas.map((e) => e.id))
  const rows = user.role === 'dono' ? state.canhotos : state.canhotos.filter((k) => ids.has(k.entregaId))

  return (
    <div>
      {user.role !== 'cliente' && (
        <div style={{ marginBottom: 12 }}>
          <Link className="btn btn-gold" to="/canhotos/novo" style={{ width: 'auto', display: 'inline-block' }}>
            Novo canhoto
          </Link>
        </div>
      )}
      <div className="row">
        {rows.map((k) => {
          const e = state.entregas.find((x) => x.id === k.entregaId)
          return (
            <div className="card grow" key={k.id} style={{ maxWidth: 420 }}>
              <strong>{k.receiverName}</strong>
              <p className="muted">{e?.destination}</p>
              <p className="muted">{new Date(k.createdAt).toLocaleString('pt-BR')}</p>
              {k.notes && <p>{k.notes}</p>}
              {k.photoDataUrl ? <img className="preview" src={k.photoDataUrl} alt="Foto do canhoto" /> : <p className="muted">Sem foto anexada</p>}
              {k.signatureDataUrl ? (
                <div>
                  <div className="muted" style={{ margin: '8px 0 4px' }}>Assinatura</div>
                  <img className="preview" src={k.signatureDataUrl} alt="Assinatura" style={{ background: '#fff', maxHeight: 90 }} />
                </div>
              ) : null}
            </div>
          )
        })}
        {!rows.length && <p className="muted">Nenhum canhoto registrado ainda.</p>}
      </div>
    </div>
  )
}
