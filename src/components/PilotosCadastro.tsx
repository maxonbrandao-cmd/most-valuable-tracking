import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  listDrivers,
  saveDriver,
  setDriverActive,
  type DriverInput,
  type DriverRecord,
  type DriverStatus,
} from '../lib/cadastros'

const emptyForm: DriverInput = {
  name: '', phone: '', document: '', plate: '', vehicleDescription: '', status: 'offline', active: true,
}

const statusLabels: Record<DriverStatus, string> = {
  disponivel: 'Disponível', em_rota: 'Em rota', offline: 'Offline', inativo: 'Inativo',
}

export default function PilotosCadastro({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<DriverRecord[]>([])
  const [form, setForm] = useState<DriverInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setRows(await listDrivers(companyId)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os pilotos.') }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void reload() }, [reload])

  function startNew() {
    setEditingId(undefined); setForm(emptyForm); setMessage(''); setError(''); setShowForm(true)
  }

  function startEdit(row: DriverRecord) {
    setEditingId(row.id)
    setForm({ name: row.name, phone: row.phone ?? '', document: row.document ?? '', plate: row.plate ?? '', vehicleDescription: row.vehicle_description ?? '', status: row.status, active: row.active })
    setMessage(''); setError(''); setShowForm(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      await saveDriver(companyId, form, editingId)
      setMessage(editingId ? 'Piloto atualizado.' : 'Piloto cadastrado.')
      setShowForm(false); setEditingId(undefined); setForm(emptyForm); await reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o piloto.') }
    finally { setSaving(false) }
  }

  async function toggleActive(row: DriverRecord) {
    setError(''); setMessage('')
    try {
      await setDriverActive(companyId, row, !row.active)
      setMessage(row.active ? 'Piloto inativado.' : 'Piloto reativado.')
      await reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar o piloto.') }
  }

  return (
    <div>
      <div className="section-heading">
        <div><h3>Pilotos</h3><p className="muted">Motociclistas e veículos vinculados à operação. O login do piloto será criado separadamente.</p></div>
        <button className="btn btn-gold btn-inline" type="button" onClick={startNew}>Novo piloto</button>
      </div>
      {message ? <div className="notice notice-ok">{message}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}

      {showForm ? (
        <form className="card cadastro-form" onSubmit={submit}>
          <h3>{editingId ? 'Editar piloto' : 'Novo piloto'}</h3>
          <div className="form-grid">
            <label className="field"><span>Nome completo</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label className="field"><span>Telefone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field"><span>CPF / documento</span><input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></label>
            <label className="field"><span>Placa</span><input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} /></label>
            <label className="field"><span>Moto / veículo</span><input value={form.vehicleDescription} onChange={(e) => setForm({ ...form, vehicleDescription: e.target.value })} placeholder="Honda CG 160" /></label>
            <label className="field"><span>Status inicial</span><select value={form.status} onChange={(e) => { const status = e.target.value as DriverStatus; setForm({ ...form, status, active: status === 'inativo' ? false : form.active }) }}><option value="offline">Offline</option><option value="disponivel">Disponível</option><option value="em_rota">Em rota</option><option value="inativo">Inativo</option></select></label>
            <label className="check-field"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Piloto ativo</label>
          </div>
          <div className="form-actions"><button className="btn btn-gold btn-inline" type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button><button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button></div>
        </form>
      ) : null}

      <div className="card table-card">
        {loading ? <p className="muted">Carregando pilotos...</p> : (
          <table className="table">
            <thead><tr><th>Piloto</th><th>Veículo</th><th>Contato</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong>{row.document ? <div className="muted">{row.document}</div> : null}</td>
                  <td>{row.plate || '—'}{row.vehicle_description ? <div className="muted">{row.vehicle_description}</div> : null}</td>
                  <td>{row.phone || '—'}</td>
                  <td><span className={!row.active ? 'badge b-off' : row.status === 'disponivel' ? 'badge b-ok' : row.status === 'em_rota' ? 'badge b-blue' : 'badge b-off'}>{row.active ? statusLabels[row.status] : 'Inativo'}</span></td>
                  <td><div className="table-actions"><button className="btn btn-ghost btn-small" onClick={() => startEdit(row)}>Editar</button><button className="btn btn-ghost btn-small" onClick={() => void toggleActive(row)}>{row.active ? 'Inativar' : 'Reativar'}</button></div></td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={5} className="muted">Nenhum piloto cadastrado.</td></tr> : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
