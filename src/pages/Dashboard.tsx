import { Link } from 'react-router-dom'
import { useStore } from '../context'
import { visibleEntregas } from '../lib/scope'

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Dashboard() {
  const { state } = useStore()
  const user = state.users.find((u) => u.id === state.sessionUserId)!
  const entregas = visibleEntregas(state, user)
  const ativos = state.pilotos.filter((p) => p.status !== 'offline').length
  const emRota = entregas.filter((e) => e.status === 'em_rota' || e.status === 'coletado').length
  const hoje = new Date().toISOString().slice(0, 10)
  const receitas = state.transacoes.filter((t) => t.type === 'receita').reduce((a, t) => a + t.amount, 0)
  const despesas = state.transacoes.filter((t) => t.type === 'despesa').reduce((a, t) => a + t.amount, 0)

  return (
    <div>
      <div className="grid-cards">
        <div className="card">
          <div className="label">Pilotos no mapa</div>
          <div className="value">{ativos}</div>
          <div className="hint">{state.pilotos.length} na frota</div>
        </div>
        <div className="card">
          <div className="label">Entregas ativas</div>
          <div className="value">{emRota}</div>
          <div className="hint">{entregas.filter((e) => e.status === 'pendente').length} pendentes</div>
        </div>
        <div className="card">
          <div className="label">Canhotos</div>
          <div className="value">{state.canhotos.length}</div>
          <div className="hint">Comprovantes digitais</div>
        </div>
        {user.role === 'dono' ? (
          <div className="card">
            <div className="label">Saldo do período</div>
            <div className="value">{brl(receitas - despesas)}</div>
            <div className="hint">Atualizado {hoje}</div>
          </div>
        ) : (
          <div className="card">
            <div className="label">Suas entregas</div>
            <div className="value">{entregas.length}</div>
            <div className="hint">Filtradas pelo seu perfil</div>
          </div>
        )}
      </div>
      <div className="row">
        <div className="card grow">
          <h3 style={{ marginTop: 0 }}>Próximos passos</h3>
          <p className="muted">Abra o mapa para ver os motoboys. No celular do piloto, o GPS real também pode ser enviado.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn btn-gold" to="/rastreio" style={{ width: 'auto' }}>Abrir rastreio</Link>
            {user.role !== 'cliente' && (
              <Link className="btn btn-ghost" to="/canhotos/novo">Registrar canhoto</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
