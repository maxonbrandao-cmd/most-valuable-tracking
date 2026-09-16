import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  listClients,
  saveClient,
  setClientActive,
  type ClientInput,
  type ClientRecord,
} from '../lib/cadastros'

const emptyForm: ClientInput = {
  name: '',
  companyName: '',
  document: '',
  email: '',
  phone: '',
  active: true,
}

export default function ClientesCadastro({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<ClientRecord[]>([])
  const [form, setForm] = useState<ClientInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await listClients(companyId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void reload()
  }, [reload])

  function startNew() {
    setEditingId(undefined)
    setForm(emptyForm)
    setMessage('')
    setError('')
    setShowForm(true)
  }

  function startEdit(row: ClientRecord) {
    setEditingId(row.id)
    setForm({
      name: row.name,
      companyName: row.company_name ?? '',
      document: row.document ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      active: row.active,
    })
    setMessage('')
    setError('')
    setShowForm(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveClient(companyId, form, editingId)
      setMessage(editingId ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      setShowForm(false)
      setEditingId(undefined)
      setForm(emptyForm)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o cliente.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row: ClientRecord) {
    setError('')
    setMessage('')
    try {
      await setClientActive(companyId, row.id, !row.active)
      setMessage(row.active ? 'Cliente inativado.' : 'Cliente reativado.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o cliente.')
    }
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h3>Clientes</h3>
          <p className="muted">Empresas e pessoas que contratam as entregas. O acesso ao portal será vinculado separadamente.</p>
        </div>
        <button className="btn btn-gold btn-inline" type="button" onClick={startNew}>Novo cliente</button>
      </div>

      {message ? <div className="notice notice-ok">{message}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}

      {showForm ? (
        <form className="card cadastro-form" onSubmit={submit}>
          <h3>{editingId ? 'Editar cliente' : 'Novo cliente'}</h3>
          <div className="form-grid">
            <label className="field">
              <span>Nome do responsável</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="field">
              <span>Empresa / nome fantasia</span>
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </label>
            <label className="field">
              <span>CPF / CNPJ</span>
              <input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="check-field">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Cliente ativo
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-gold btn-inline" type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <div className="card table-card">
        {loading ? <p className="muted">Carregando clientes...</p> : (
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th>Documento</th><th>Contato</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.company_name || row.name}</strong>{row.company_name ? <div className="muted">{row.name}</div> : null}</td>
                  <td>{row.document || '—'}</td>
                  <td>{row.phone || row.email || '—'}{row.phone && row.email ? <div className="muted">{row.email}</div> : null}</td>
                  <td><span className={row.active ? 'badge b-ok' : 'badge b-off'}>{row.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td><div className="table-actions"><button className="btn btn-ghost btn-small" onClick={() => startEdit(row)}>Editar</button><button className="btn btn-ghost btn-small" onClick={() => void toggleActive(row)}>{row.active ? 'Inativar' : 'Reativar'}</button></div></td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={5} className="muted">Nenhum cliente cadastrado.</td></tr> : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
