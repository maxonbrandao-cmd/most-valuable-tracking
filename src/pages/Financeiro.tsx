import { FormEvent, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../context'

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Financeiro() {
  const { state, addTransacao } = useStore()
  const user = state.users.find((u) => u.id === state.sessionUserId)!
  const [type, setType] = useState<'receita' | 'despesa'>('despesa')
  const [category, setCategory] = useState('Combustível')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const tot = useMemo(() => {
    const receitas = state.transacoes.filter((t) => t.type === 'receita').reduce((a, t) => a + t.amount, 0)
    const despesas = state.transacoes.filter((t) => t.type === 'despesa').reduce((a, t) => a + t.amount, 0)
    return { receitas, despesas, saldo: receitas - despesas }
  }, [state.transacoes])

  if (user.role !== 'dono') return <Navigate to="/" replace />

  function submit(e: FormEvent) {
    e.preventDefault()
    addTransacao({
      type,
      category,
      description,
      amount: Number(amount) || 0,
      date,
    })
    setDescription('')
    setAmount('')
  }

  return (
    <div>
      <div className="grid-cards">
        <div className="card">
          <div className="label">Receitas</div>
          <div className="value">{brl(tot.receitas)}</div>
        </div>
        <div className="card">
          <div className="label">Despesas</div>
          <div className="value">{brl(tot.despesas)}</div>
        </div>
        <div className="card">
          <div className="label">Saldo</div>
          <div className="value">{brl(tot.saldo)}</div>
        </div>
        <div className="card">
          <div className="label">Lançamentos</div>
          <div className="value">{state.transacoes.length}</div>
        </div>
      </div>
      <div className="row">
        <form className="card grow" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>Novo lançamento</h3>
          <label className="field">
            <span>Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value as 'receita' | 'despesa')}>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
          </label>
          <label className="field">
            <span>Categoria</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Entrega</option>
              <option>Combustível</option>
              <option>Manutenção</option>
              <option>Salário</option>
              <option>Outros</option>
            </select>
          </label>
          <label className="field">
            <span>Descrição</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </label>
          <label className="field">
            <span>Valor</span>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn btn-gold" type="submit">Lançar</button>
        </form>
        <div className="card grow" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Extrato</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {state.transacoes.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    <span className={t.type === 'receita' ? 'badge b-ok' : 'badge b-bad'}>{t.type}</span>
                  </td>
                  <td>{t.category}</td>
                  <td>{t.description}</td>
                  <td>{brl(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
