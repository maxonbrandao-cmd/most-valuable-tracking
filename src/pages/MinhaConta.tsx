import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../context'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export default function MinhaConta() {
  const { state } = useStore()
  const user = state.users.find(item => item.id === state.sessionUserId)
  const currentEmail = user?.email ?? ''
  const [email, setEmail] = useState(user?.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isSupabaseConfigured) {
        setEmailError('Supabase não está configurado neste ambiente.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase.auth.getUser()
      if (!cancelled) {
        if (error) setEmailError('Não foi possível carregar os dados da conta. Entre novamente e tente outra vez.')
        else if (data.user?.email) setEmail(data.user.email)
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (user?.role !== 'dono') return <Navigate to="/" replace />

  async function changeEmail(event: FormEvent) {
    event.preventDefault()
    if (savingEmail || !isSupabaseConfigured) return
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setEmailError('Informe o novo e-mail.')
      return
    }
    if (normalized === currentEmail.trim().toLowerCase()) {
      setEmailError('Informe um e-mail diferente do atual.')
      return
    }
    setSavingEmail(true)
    setEmailError('')
    setEmailMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ email: normalized })
      if (error) throw error
      setEmailMessage('Pedido enviado. Confirme a alteração pelos links enviados aos e-mails solicitados pelo Supabase. O novo endereço só valerá depois da confirmação.')
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Não foi possível solicitar a troca do e-mail.')
    } finally {
      setSavingEmail(false)
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (savingPassword || !isSupabaseConfigured) return
    const strongEnough = newPassword.length >= 8 && /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword)
    if (!strongEnough) {
      setPasswordError('Use pelo menos 8 caracteres, incluindo letra maiúscula, minúscula, número e símbolo.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }
    setSavingPassword(true)
    setPasswordError('')
    setPasswordMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage('Senha alterada com sucesso.')
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Não foi possível alterar a senha. Entre novamente e tente outra vez.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h3>Minha conta</h3>
          <p className="muted">Atualize o e-mail de acesso e a senha do responsável.</p>
        </div>
      </div>

      {loading ? <p role="status">Carregando sua conta...</p> : (
        <div className="account-settings">
          <form className="card cadastro-form" onSubmit={changeEmail}>
            <h4>E-mail de acesso</h4>
            <p className="muted">E-mail atual: {currentEmail}</p>
            <label className="field">
              <span>Novo e-mail</span>
              <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
            </label>
            {emailError && <div className="notice notice-error" role="alert">{emailError}</div>}
            {emailMessage && <div className="notice notice-ok" role="status">{emailMessage}</div>}
            <button className="btn btn-gold" disabled={savingEmail}>{savingEmail ? 'Enviando...' : 'Alterar e-mail'}</button>
          </form>

          <form className="card cadastro-form" onSubmit={changePassword}>
            <h4>Senha</h4>
            <p className="muted">Crie uma senha com pelo menos 8 caracteres, incluindo letra maiúscula, minúscula, número e símbolo.</p>
            <label className="field">
              <span>Nova senha</span>
              <input type="password" autoComplete="new-password" required value={newPassword} onChange={event => setNewPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Confirme a nova senha</span>
              <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
            </label>
            {passwordError && <div className="notice notice-error" role="alert">{passwordError}</div>}
            {passwordMessage && <div className="notice notice-ok" role="status">{passwordMessage}</div>}
            <button className="btn btn-gold" disabled={savingPassword}>{savingPassword ? 'Salvando...' : 'Alterar senha'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
