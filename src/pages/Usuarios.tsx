import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  createCompanyUser,
  resetCompanyUserPassword,
  type UserRole,
} from '../lib/usuarios'

type ProfileRow = {
  user_id: string
  full_name: string
  phone: string | null
  role: 'dono' | 'cliente' | 'piloto'
  client_id: string | null
  driver_id: string | null
  active: boolean
}

type ClientRow = {
  id: string
  name: string
  company_name: string | null
  active: boolean
}

type DriverRow = {
  id: string
  name: string
  plate: string | null
  active: boolean
}

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  role: 'piloto' as UserRole,
  clientId: '',
  driverId: '',
}

export default function Usuarios() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])

  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const clientMap = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients])
  const driverMap = useMemo(() => new Map(availableDrivers.map((item) => [item.id, item])), [drivers])
  const [changingUserId, setChangingUserId] = useState<string | null>(null)

  const [editingUserId, setEditingUserId] = useState<string | null>(null)

  const [passwordUser, setPasswordUser] =
    useState<ProfileRow | null>(null)

  const [newPassword, setNewPassword] =
    useState('')

  const [changingPassword, setChangingPassword] =
    useState(false)

  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    clientId: '',
    driverId: '',
  })

  const linkedDriverIds = useMemo(
    () =>
      new Set(
        profiles
          .filter((profile) => profile.driver_id)
          .map((profile) => profile.driver_id as string),
      ),
    [profiles],
  )
  
  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          driver.active &&
          !linkedDriverIds.has(driver.id),
      ),
    [drivers, linkedDriverIds],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [profilesResult, clientsResult, driversResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, phone, role, client_id, driver_id, active')
          .order('full_name'),

        supabase
          .from('clients')
          .select('id, name, company_name, active')
          .eq('active', true)
          .order('name'),

        supabase
          .from('drivers')
          .select('id, name, plate, active')
          .order('name'),
      ])

      if (profilesResult.error) throw profilesResult.error
      if (clientsResult.error) throw clientsResult.error
      if (driversResult.error) throw driversResult.error

      setProfiles((profilesResult.data ?? []) as ProfileRow[])
      setClients((clientsResult.data ?? []) as ClientRow[])
      setDrivers((driversResult.data ?? []) as DriverRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os usuários.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function submit(event: FormEvent) {
    event.preventDefault()
  
    setSaving(true)
    setError('')
    setMessage('')
  
    try {
      const passwordOk =
        form.password.length >= 8 &&
        /[a-z]/.test(form.password) &&
        /[A-Z]/.test(form.password) &&
        /[0-9]/.test(form.password) &&
        /[^A-Za-z0-9]/.test(form.password)
  
      if (!passwordOk) {
        throw new Error(
          'A senha deve ter 8 caracteres e incluir maiúscula, minúscula, número e símbolo.',
        )
      }
  
      await createCompanyUser({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        role: form.role,
        clientId:
          form.role === 'cliente'
            ? form.clientId
            : undefined,
        driverId:
          form.role === 'piloto'
            ? form.driverId
            : undefined,
      })
  
      setMessage('Usuário criado com sucesso.')
      setForm(emptyForm)
      setShowForm(false)
  
      await reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível criar o usuário.',
      )
    } finally {
      setSaving(false)
    }
  }

  function roleLabel(role: ProfileRow['role']) {
    if (role === 'dono') return 'Dono'
    if (role === 'cliente') return 'Cliente'
    return 'Piloto'
  }

  function linkedTo(profile: ProfileRow) {
    if (profile.role === 'cliente' && profile.client_id) {
      const client = clientMap.get(profile.client_id)
      return client?.company_name || client?.name || 'Cliente'
    }

    if (profile.role === 'piloto' && profile.driver_id) {
      const driver = driverMap.get(profile.driver_id)

      if (!driver) return 'Piloto'

      return driver.plate ? `${driver.name} · ${driver.plate}` : driver.name
    }

    return '—'
  }

  async function toggleUserActive(profile: ProfileRow) {
    const nextActive = !profile.active
    const action = nextActive ? 'ativar' : 'desativar'
  
    if (
      !window.confirm(
        `Deseja realmente ${action} o usuário "${profile.full_name}"?`,
      )
    ) {
      return
    }
  
    setChangingUserId(profile.user_id)
    setError('')
    setMessage('')
  
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          active: nextActive,
        })
        .eq('user_id', profile.user_id)
  
      if (profileError) {
        throw profileError
      }
  
      if (
        profile.role === 'piloto' &&
        profile.driver_id
      ) {
        const { error: driverError } = await supabase
          .from('drivers')
          .update({
            active: nextActive,
          })
          .eq('id', profile.driver_id)
  
        if (driverError) {
          throw driverError
        }
      }
  
      setMessage(
        nextActive
          ? 'Usuário ativado com sucesso.'
          : 'Usuário desativado com sucesso.',
      )
  
      await reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível alterar o usuário.',
      )
    } finally {
      setChangingUserId(null)
    }
  }

  function startEdit(profile: ProfileRow) {
    setEditingUserId(profile.user_id)
    setShowForm(false)
    setMessage('')
    setError('')
  
    setEditForm({
      fullName: profile.full_name,
      phone: profile.phone ?? '',
      clientId: profile.client_id ?? '',
      driverId: profile.driver_id ?? '',
    })
  }
  
  function cancelEdit() {
    setEditingUserId(null)
  
    setEditForm({
      fullName: '',
      phone: '',
      clientId: '',
      driverId: '',
    })
  }
  
  async function saveEdit(event: FormEvent) {
    event.preventDefault()
  
    if (!editingUserId) return
  
    const profile = profiles.find(
      (item) => item.user_id === editingUserId,
    )
  
    if (!profile) return
  
    if (
      profile.role === 'cliente' &&
      !editForm.clientId
    ) {
      setError('Selecione o cliente vinculado.')
      return
    }
  
    if (
      profile.role === 'piloto' &&
      !editForm.driverId
    ) {
      setError('Selecione o piloto vinculado.')
      return
    }
  
    setSaving(true)
    setError('')
    setMessage('')
  
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.fullName.trim(),
          phone: editForm.phone.trim() || null,
  
          client_id:
            profile.role === 'cliente'
              ? editForm.clientId
              : null,
  
          driver_id:
            profile.role === 'piloto'
              ? editForm.driverId
              : null,
        })
        .eq('user_id', editingUserId)
  
      if (updateError) {
        throw updateError
      }
  
      setMessage('Usuário atualizado com sucesso.')
  
      cancelEdit()
  
      await reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar o usuário.',
      )
    } finally {
      setSaving(false)
    }
  }

  const editingProfile =
  profiles.find(
    (profile) =>
      profile.user_id === editingUserId,
  ) ?? null

const editAvailableDrivers = drivers.filter(
  (driver) => {
    if (!editingProfile) {
      return false
    }

    const isCurrentDriver =
      editingProfile.driver_id === driver.id

    const linkedToAnotherUser =
      profiles.some(
        (profile) =>
          profile.user_id !==
            editingProfile.user_id &&
          profile.driver_id === driver.id,
      )

    return (
      isCurrentDriver ||
      (
        driver.active &&
        !linkedToAnotherUser
      )
    )
  },
)

{editingProfile ? (
  <form
    className="card cadastro-form"
    onSubmit={saveEdit}
  >
    <h3>
      Editar usuário — {editingProfile.full_name}
    </h3>

    <div className="form-grid">
      <label className="field">
        <span>Nome</span>

        <input
          type="text"
          value={editForm.fullName}
          required
          onChange={(e) =>
            setEditForm({
              ...editForm,
              fullName: e.target.value,
            })
          }
        />
      </label>

      <label className="field">
        <span>Telefone</span>

        <input
          type="tel"
          value={editForm.phone}
          onChange={(e) =>
            setEditForm({
              ...editForm,
              phone: e.target.value,
            })
          }
        />
      </label>

      <label className="field">
        <span>Tipo de usuário</span>

        <input
          type="text"
          value={roleLabel(editingProfile.role)}
          disabled
        />
      </label>

      {editingProfile.role === 'piloto' ? (
        <label className="field">
          <span>Piloto vinculado</span>

          <select
            value={editForm.driverId}
            required
            onChange={(e) =>
              setEditForm({
                ...editForm,
                driverId: e.target.value,
              })
            }
          >
            <option value="">
              Selecione o piloto
            </option>

            {editAvailableDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
                {driver.plate ? ` · ${driver.plate}` : ''}
                {!driver.active ? ' · Inativo' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {editingProfile.role === 'cliente' ? (
        <label className="field">
          <span>Cliente vinculado</span>

          <select
            value={editForm.clientId}
            required
            onChange={(e) =>
              setEditForm({
                ...editForm,
                clientId: e.target.value,
              })
            }
          >
            <option value="">
              Selecione o cliente
            </option>

            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company_name || client.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>

    <div className="form-actions">
      <button
        className="btn btn-gold btn-inline"
        type="submit"
        disabled={saving}
      >
        {saving ? 'Salvando...' : 'Salvar alterações'}
      </button>

      <button
        className="btn btn-ghost"
        type="button"
        disabled={saving}
        onClick={cancelEdit}
      >
        Cancelar
      </button>
    </div>
  </form>
) : null}

async function saveNewPassword(
  event: FormEvent,
) {
  event.preventDefault()

  if (!passwordUser) return

  const passwordOk =
    newPassword.length >= 8 &&
    /[a-z]/.test(newPassword) &&
    /[A-Z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword)

  if (!passwordOk) {
    setError(
      'A senha deve ter 8 caracteres e incluir maiúscula, minúscula, número e símbolo.',
    )
    return
  }

  setChangingPassword(true)
  setError('')
  setMessage('')

  try {
    await resetCompanyUserPassword(
      passwordUser.user_id,
      newPassword,
    )

    setMessage(
      `Senha de ${passwordUser.full_name} alterada com sucesso.`,
    )

    setPasswordUser(null)
    setNewPassword('')
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Não foi possível redefinir a senha.',
    )
  } finally {
    setChangingPassword(false)
  }
}

return (
  <div>
    <div className="section-heading">
      <div>
        <h3>Usuários</h3>
        <p className="muted">Controle quem pode acessar o sistema.</p>
      </div>

      <button
        className="btn btn-gold btn-inline"
        type="button"
        onClick={() => {
          cancelEdit()
          setShowForm((value) => !value)
        }}
      >
        {showForm ? 'Cancelar' : '+ Novo usuário'}
      </button>
    </div>

    {message ? (
      <div className="notice notice-ok">
        {message}
      </div>
    ) : null}

    {error ? (
      <div className="notice notice-error">
        {error}
      </div>
    ) : null}

    {showForm ? (
      <form
        className="card cadastro-form"
        onSubmit={submit}
      >
        <h3>Novo usuário</h3>

        <div className="form-grid">
          {/* aqui ficam nome, e-mail, telefone, senha, tipo e vínculo */}
        </div>

        <div className="form-actions">
          <button
            className="btn btn-gold btn-inline"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Criando...' : 'Criar usuário'}
          </button>

          <button
            className="btn btn-ghost"
            type="button"
            disabled={saving}
            onClick={() => {
              setShowForm(false)
              setForm(emptyForm)
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    ) : null}

{passwordUser ? (
  <form
    className="card cadastro-form"
    onSubmit={saveNewPassword}
  >
    <h3>
      Redefinir senha — {passwordUser.full_name}
    </h3>

    <label className="field">
      <span>Nova senha</span>

      <input
        type="password"
        value={newPassword}
        required
        minLength={8}
        autoComplete="new-password"
        onChange={(e) => setNewPassword(e.target.value)}
      />

      <div className="form-hint muted">
        Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.
      </div>
    </label>

    <div className="form-actions">
      <button
        className="btn btn-gold btn-inline"
        type="submit"
        disabled={changingPassword}
      >
        {changingPassword ? 'Alterando...' : 'Alterar senha'}
      </button>

      <button
        className="btn btn-ghost"
        type="button"
        disabled={changingPassword}
        onClick={() => {
          setPasswordUser(null)
          setNewPassword('')
        }}
      >
        Cancelar
      </button>
    </div>
  </form>
) : null}


      <div className="card table-card">
        {loading ? (
          <p className="muted">Carregando usuários...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Vinculado a</th>
                <th>Telefone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.user_id}>
                  <td data-label="Nome"><strong>{profile.full_name}</strong></td>
                  <td data-label="Tipo">{roleLabel(profile.role)}</td>
                  <td data-label="Vínculo">{linkedTo(profile)}</td>
                  <td data-label="Telefone">{profile.phone || '—'}</td>
                  <td data-label="Status">
                    <span className={`badge ${profile.active ? 'b-ok' : 'b-off'}`}>
                      {profile.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td data-label="Ações">
                    <div className="table-actions">
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        onClick={() => startEdit(profile)}
                      >
                        Editar
                      </button>

                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        onClick={() => {
                          setPasswordUser(profile)
                          setNewPassword('')
                          setError('')
                          setMessage('')
                        }}
                      >
                        Redefinir senha
                      </button>

                      {profile.role !== 'dono' ? (
                        <button
                          className="btn btn-ghost btn-small"
                          type="button"
                          disabled={
                            changingUserId === profile.user_id
                          }
                          onClick={() =>
                            void toggleUserActive(profile)
                          }
                        >
                          {changingUserId === profile.user_id
                            ? 'Aguarde...'
                            : profile.active
                              ? 'Desativar'
                              : 'Ativar'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {!profiles.length ? (
                <tr>
                  <td colSpan={6} className="muted">Nenhum usuário encontrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}