import { FormEvent, useState } from 'react'
import { useStore } from '../context'

export default function Login() {
  const { login } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      setErr(await login(email, password))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <h1>Most Valuable Tracking</h1>
            <p>Motofrete · GPS · canhotos · financeiro</p>
          </div>
        </div>
        <h2>Entrar</h2>
        <p className="muted">Entre com o usuário cadastrado para sua empresa.</p>
        <label className="field">
          <span>E-mail</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {err ? <div className="err">{err}</div> : null}
        <button className="btn btn-gold" type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Acessar painel'}
        </button>
        <div className="accounts">Acesso protegido pelo Supabase Auth.</div>
      </form>
    </div>
  )
}
