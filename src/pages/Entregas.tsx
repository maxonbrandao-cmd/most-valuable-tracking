import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../context'
import { supabase } from '../lib/supabase'
import { addressFromCep, formatCep, lookupCep } from '../lib/cep'
import {
  allDeliveryStatuses,
  changeDeliveryStatus,
  deliveryStatusLabel,
  listDeliveries,
  listDeliveryHistory,
  listDeliveryOptions,
  saveDelivery,
  statusBadge,
  type DeliveryClient,
  type DeliveryDriver,
  type DeliveryHistory,
  type DeliveryInput,
  type DeliveryRecord,
  type DeliveryStatus,
} from '../lib/entregas'

import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'

import type { LatLngExpression } from 'leaflet'

import {
  formatPositionTime,
  listDeliveryLatestPosition,
  subscribeToDeliveryGps,
  type GpsPosition,
} from '../lib/rastreamento'

import 'leaflet/dist/leaflet.css'

const emptyForm: DeliveryInput = {
  clientId: '',
  driverId: '',
  originAddress: '',
  originPostalCode: '',
  destinationAddress: '',
  destinationPostalCode: '',
  value: '0',
  driverPayout: '0',
  notes: '',
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function RecenterDeliveryMap({
  center,
}: {
  center: LatLngExpression
}) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 15), {
      animate: true,
    })
  }, [center, map])

  return null
}

const pilotTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  pendente: ['pendente', 'aceito', 'coletado'],
  aceito: ['aceito', 'coletado', 'cancelado'],
  coletado: ['coletado', 'em_rota', 'cancelado'],
  em_rota: ['em_rota', 'chegou', 'entregue', 'nao_entregue'],
  chegou: ['chegou', 'entregue', 'nao_entregue'],
  entregue: ['entregue'],
  nao_entregue: ['nao_entregue', 'em_rota'],
  cancelado: ['cancelado'],
}

export default function Entregas() {
  const { state } = useStore()
  const user = state.users.find((item) => item.id === state.sessionUserId)!
  const companyId = user.companyId
  const [rows, setRows] = useState<DeliveryRecord[]>([])
  const [clients, setClients] = useState<DeliveryClient[]>([])
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])
  const [form, setForm] = useState<DeliveryInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingId, setChangingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [historyDelivery, setHistoryDelivery] = useState<DeliveryRecord | null>(null)
  const [history, setHistory] = useState<DeliveryHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState<'origin' | 'destination' | ''>('')
  const [trackingDelivery, setTrackingDelivery] =useState<DeliveryRecord | null>(null)
  const [trackingPosition, setTrackingPosition] =  useState<GpsPosition | null>(null)
  const [trackingLoading, setTrackingLoading] =  useState(false)
  const [trackingError, setTrackingError] =  useState('')
  const [searchCode, setSearchCode] = useState('')
  const [driverFilter, setDriverFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const clientMap = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients])
  const driverMap = useMemo(() => new Map(drivers.map((item) => [item.id, item])), [drivers])

  function localDateKey(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const filteredRows = useMemo(() => {
  const code = searchCode.trim().toLowerCase()

  return rows.filter((row) => {
    const matchesCode =
      !code || row.code.toLowerCase().includes(code)

    const matchesDriver =
      !driverFilter || row.driver_id === driverFilter

    // Data da corrida programada; se não existir,
    // usa a data de criação.
    const deliveryDate =
      row.scheduled_at ?? row.created_at

    const matchesDate =
      !dateFilter ||
      localDateKey(deliveryDate) === dateFilter

    return (
      matchesCode &&
      matchesDriver &&
      matchesDate
    )
  })
}, [rows, searchCode, driverFilter, dateFilter])

 async function openTracking(row: DeliveryRecord) {
  setTrackingDelivery(row)
  setTrackingLoading(true)
  setTrackingError('')
  setTrackingPosition(null)

  try {
    const position = await listDeliveryLatestPosition(row.id)
    setTrackingPosition(position)
  } catch (err) {
    setTrackingError(
      err instanceof Error
        ? err.message
        : 'Não foi possível localizar o piloto.',
    )
  } finally {
    setTrackingLoading(false)
  }
}

const reload = useCallback(async () => {
  if (!companyId) return

  setLoading(true)
  setError('')

  try {
    const [deliveries, options] = await Promise.all([
      listDeliveries(companyId),
      listDeliveryOptions(companyId),
    ])

    setRows(deliveries)
    setClients(options.clients)
    setDrivers(options.drivers)
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Não foi possível carregar as entregas.',
    )
  } finally {
    setLoading(false)
  }
}, [companyId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!trackingDelivery) return

    const unsubscribe = subscribeToDeliveryGps(
      trackingDelivery.id,
      (position) => {
        setTrackingPosition(position)
        setTrackingError('')
      },
    )
    return unsubscribe
  }, [trackingDelivery])

  useEffect(() => {
    const realtimeClient = supabase
    if (!realtimeClient || !companyId) return
    const channel = realtimeClient
      .channel(`deliveries:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries', filter: `company_id=eq.${companyId}` },
        () => void reload(),
      )
      .subscribe()

    return () => {
      void realtimeClient.removeChannel(channel)
    }
  }, [companyId, reload])

  function startNew() {
    const firstClient = clients.find((item) => item.active)
    setForm({ ...emptyForm, clientId: firstClient?.id ?? '' })
    setEditingId(undefined)
    setShowForm(true)
    setMessage('')
    setError('')
  }

  function startEdit(row: DeliveryRecord) {
    setForm({
      clientId: row.client_id,
      driverId: row.driver_id ?? '',
      originAddress: row.origin_address,
      originPostalCode: row.origin_postal_code ?? '',
      destinationAddress: row.destination_address,
      destinationPostalCode: row.destination_postal_code ?? '',
      value: String(row.value),
      driverPayout: String(row.driver_payout),
      notes: row.notes ?? '',
    })
    setEditingId(row.id)
    setShowForm(true)
    setMessage('')
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!companyId) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await saveDelivery(companyId, form, editingId)
      setMessage(editingId ? 'Entrega atualizada.' : 'Entrega criada e registrada no histórico.')
      setShowForm(false)
      setEditingId(undefined)
      setForm(emptyForm)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a entrega.')
    } finally {
      setSaving(false)
    }
  }

  async function searchCep(kind: 'origin' | 'destination') {
    const value = kind === 'origin' ? form.originPostalCode : form.destinationPostalCode
    setCepLoading(kind)
    setError('')
    try {
      const result = await lookupCep(value)
      const address = addressFromCep(result)
      setForm((current) => kind === 'origin'
        ? { ...current, originPostalCode: result.cep, originAddress: address }
        : { ...current, destinationPostalCode: result.cep, destinationAddress: address })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível consultar o CEP.')
    } finally {
      setCepLoading('')
    }
  }

  async function setStatus(row: DeliveryRecord, status: DeliveryStatus) {
    setChangingId(row.id)
    setMessage('')
    setError('')
    try {
      await changeDeliveryStatus(row.id, status)
      setMessage(`Entrega ${row.code}: status alterado para ${deliveryStatusLabel[status]}.`)
      await reload()
      if (historyDelivery?.id === row.id) await openHistory({ ...row, status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o status.')
    } finally {
      setChangingId('')
    }
  }

  async function openHistory(row: DeliveryRecord) {
    if (!companyId) return
    setHistoryDelivery(row)
    setHistoryLoading(true)
    setError('')
    try {
      setHistory(await listDeliveryHistory(companyId, row.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.')
    } finally {
      setHistoryLoading(false)
    }
  }

  if (!companyId) return <div className="notice notice-error">Usuário sem empresa vinculada.</div>

  const availableClients = clients.filter((item) => item.active || item.id === form.clientId)
  const availableDrivers = drivers.filter((item) => item.active || item.id === form.driverId)

  return (
    <div>
      <div className="section-heading">
        <div>
          <h3>Entregas</h3>
          <p className="muted">Operação compartilhada e histórico de status em tempo real.</p>
        </div>
        {user.role === 'dono' ? (
          <button className="btn btn-gold btn-inline" type="button" onClick={startNew} disabled={!clients.some((item) => item.active)}>Nova entrega</button>
        ) : null}
      </div>

      {user.role === 'dono' && !clients.some((item) => item.active) ? (
        <div className="notice notice-error">Cadastre pelo menos um cliente ativo antes de criar uma entrega.</div>
      ) : null}
      {message ? <div className="notice notice-ok">{message}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}

      {showForm && user.role === 'dono' ? (
        <form className="card cadastro-form" onSubmit={submit}>
          <h3>{editingId ? 'Editar entrega' : 'Nova entrega'}</h3>
          <div className="form-grid">
            <label className="field">
              <span>Cliente</span>
              <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
                <option value="">Selecione</option>
                {availableClients.map((item) => <option key={item.id} value={item.id}>{item.company_name || item.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Piloto</span>
              <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                <option value="">Ainda não atribuído</option>
                {availableDrivers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.plate ? ` · ${item.plate}` : ''}</option>)}
              </select>
            </label>
            <label className="field">
              <span>CEP da coleta (opcional)</span>
              <div className="cep-row">
                <input
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={form.originPostalCode}
                  onChange={(e) => setForm({ ...form, originPostalCode: formatCep(e.target.value) })}
                />
                <button className="btn btn-ghost cep-button" type="button" onClick={() => void searchCep('origin')} disabled={cepLoading !== ''}>
                  {cepLoading === 'origin' ? 'Buscando...' : 'Buscar CEP'}
                </button>
              </div>
            </label>
            <label className="field form-span-2">
              <span>Endereço de coleta</span>
              <input placeholder="Digite diretamente ou busque pelo CEP; acrescente número e complemento" value={form.originAddress} onChange={(e) => setForm({ ...form, originAddress: e.target.value })} required />
            </label>
            <label className="field">
              <span>CEP da entrega (opcional)</span>
              <div className="cep-row">
                <input
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={form.destinationPostalCode}
                  onChange={(e) => setForm({ ...form, destinationPostalCode: formatCep(e.target.value) })}
                />
                <button className="btn btn-ghost cep-button" type="button" onClick={() => void searchCep('destination')} disabled={cepLoading !== ''}>
                  {cepLoading === 'destination' ? 'Buscando...' : 'Buscar CEP'}
                </button>
              </div>
            </label>
            <label className="field form-span-2">
              <span>Endereço de entrega</span>
              <input placeholder="Digite diretamente ou busque pelo CEP; acrescente número e complemento" value={form.destinationAddress} onChange={(e) => setForm({ ...form, destinationAddress: e.target.value })} required />
            </label>
            <label className="field">
              <span>Valor cobrado (R$)</span>
              <input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
            </label>
            <label className="field">
              <span>Repasse ao piloto (R$)</span>
              <input type="number" min="0" step="0.01" value={form.driverPayout} onChange={(e) => setForm({ ...form, driverPayout: e.target.value })} />
            </label>
            <label className="field form-span-2">
              <span>Observações</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <p className="muted form-hint">A busca usa o CEP para preencher a rua, o bairro e a cidade. Confira e acrescente o número e o complemento antes de salvar.</p>
          <div className="form-actions">
            <button className="btn btn-gold btn-inline" type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar entrega'}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <div className="card delivery-filters">
  <label className="filter-field">
    <span>Código da corrida</span>

    <input
      type="search"
      placeholder="Ex.: COR-00123"
      value={searchCode}
      onChange={(event) =>
        setSearchCode(event.target.value)
      }
    />
  </label>

  <label className="filter-field">
    <span>Motorista</span>

    <select
      value={driverFilter}
      onChange={(event) =>
        setDriverFilter(event.target.value)
      }
    >
      <option value="">Todos os motoristas</option>

      {drivers.map((driver) => (
        <option
          key={driver.id}
          value={driver.id}
        >
          {driver.name}
          {driver.plate
            ? ` · ${driver.plate}`
            : ''}
        </option>
      ))}
    </select>
  </label>

  <label className="filter-field">
    <span>Data</span>

    <input
      type="date"
      value={dateFilter}
      onChange={(event) =>
        setDateFilter(event.target.value)
      }
    />
  </label>

  <button
    type="button"
    className="btn btn-ghost"
    onClick={() => {
      setSearchCode('')
      setDriverFilter('')
      setDateFilter('')
    }}
  >
    Limpar filtros
  </button>
</div>

      <div className="card table-card">
        {loading ? <p className="muted">Carregando entregas...</p> : (
          <table className="table">
            <thead>
              <tr><th>Código</th><th>Cliente</th><th>Rota</th><th>Piloto</th><th>Valor</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const client = clientMap.get(row.client_id)
                const driver = row.driver_id ? driverMap.get(row.driver_id) : undefined
                const statuses = user.role === 'piloto' ? pilotTransitions[row.status] : allDeliveryStatuses
                return (
                  <tr key={row.id}>
                    <td data-label="Código"><strong>{row.code}</strong><div className="muted">{dateTime(row.created_at)}</div></td>
                    <td data-label="Cliente">{client?.company_name || client?.name || 'Cliente'}</td>
                    <td data-label="Rota"><div>{row.origin_address}</div><div className="route-arrow">→ {row.destination_address}</div></td>
                    <td data-label="Piloto">{driver?.name || 'Não atribuído'}{driver?.plate ? <div className="muted">{driver.plate}</div> : null}</td>
                    <td data-label="Valor">{brl(row.value)}{row.driver_payout ? <div className="muted">Repasse {brl(row.driver_payout)}</div> : null}</td>
                    <td data-label="Status" className="status-cell">
                      {user.role === 'cliente' ? (
                        <span className={statusBadge(row.status)}>{deliveryStatusLabel[row.status]}</span>
                      ) : (
                        <select className="status-select" value={row.status} disabled={changingId === row.id} onChange={(e) => void setStatus(row, e.target.value as DeliveryStatus)}>
                          {statuses.map((status) => <option key={status} value={status}>{deliveryStatusLabel[status]}</option>)}
                        </select>
                      )}
                    </td>
                    <td data-label="Ações" className="actions-cell">
                      <div className="table-actions"><button className="btn btn-ghost btn-small" type="button" onClick={() => void openHistory(row)}>
            Histórico
          </button>

                          {user.role === 'cliente' &&
                          row.driver_id &&
                          ['aceito', 'coletado', 'em_rota', 'chegou'].includes(row.status) ? (
                            <button
                              className="btn btn-gold btn-small"
                              type="button"
                              onClick={() => void openTracking(row)}
                            >
                              Acompanhar piloto
                            </button>
                          ) : null}

                          {user.role === 'dono' ? (
                            <button className="btn btn-ghost btn-small" type="button" onClick={() => startEdit(row)}>
            Editar
          </button>
                          ) : null}
                        </div>
                    </td>
                  </tr>
                )
              })}
              {!filteredRows.length ? <tr><td colSpan={7} className="muted">Nenhuma entrega encontrada com os filtros selecionados.</td></tr> : null}
            </tbody>
          </table>
        )}
      </div>
      {user.role === 'cliente' && trackingDelivery ? (
  <div className="card gps-detail-card">
    <div className="section-heading">
      <div>
        <h3>Acompanhar entrega · {trackingDelivery.code}</h3>

        <p className="muted">
          {trackingDelivery.origin_address}
          {' → '}
          {trackingDelivery.destination_address}
        </p>
      </div>

      <button
        className="btn btn-ghost btn-small"
        type="button"
        onClick={() => {
          setTrackingDelivery(null)
          setTrackingPosition(null)
          setTrackingError('')
        }}
      >
        Fechar
      </button>
    </div>

    {trackingLoading ? (
      <p className="muted">
        Localizando piloto...
      </p>
    ) : null}

    {trackingError ? (
      <div className="notice notice-error">
        {trackingError}
      </div>
    ) : null}

    {!trackingLoading && !trackingPosition ? (
      <div className="notice">
        O piloto ainda não enviou uma posição GPS para esta entrega.
      </div>
    ) : null}

    {trackingPosition ? (
      <>
        <div
          style={{
            height: '420px',
            overflow: 'hidden',
            borderRadius: '12px',
          }}
        >
          <MapContainer
            center={[
              trackingPosition.latitude,
              trackingPosition.longitude,
            ]}
            zoom={15}
            style={{
              width: '100%',
              height: '100%',
            }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <RecenterDeliveryMap
              center={[
                trackingPosition.latitude,
                trackingPosition.longitude,
              ]}
            />

            <CircleMarker
              center={[
                trackingPosition.latitude,
                trackingPosition.longitude,
              ]}
              radius={10}
              pathOptions={{
                color: '#ffffff',
                weight: 3,
                fillColor: '#22c55e',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>Piloto da sua entrega</strong>
                <br />

                Última atualização:{' '}
                {formatPositionTime(
                  trackingPosition.captured_at,
                )}
              </Popup>
            </CircleMarker>
          </MapContainer>
        </div>

        <div
          className="gps-summary"
          style={{ marginTop: '16px' }}
        >
          <div className="gps-stat">
            <span>Status</span>
            <strong>
              {deliveryStatusLabel[trackingDelivery.status]}
            </strong>
          </div>

          <div className="gps-stat">
            <span>Última posição</span>
            <strong>
              {formatPositionTime(
                trackingPosition.captured_at,
              )}
            </strong>
          </div>

          <div className="gps-stat">
            <span>Precisão</span>
            <strong>
              {trackingPosition.accuracy != null
                ? `${Math.round(
                    trackingPosition.accuracy,
                  )} m`
                : '—'}
            </strong>
          </div>
        </div>
      </>
    ) : null}
  </div>
) : null}
      {historyDelivery ? (
        <div className="card history-card">
          <div className="section-heading">
            <div><h3>Histórico · {historyDelivery.code}</h3><p className="muted">Todos os eventos registrados no banco.</p></div>
            <button className="btn btn-ghost btn-small" onClick={() => setHistoryDelivery(null)}>Fechar</button>
          </div>
          {historyLoading ? <p className="muted">Carregando histórico...</p> : (
            <div className="history-list">
              {history.map((item) => (
                <div className="history-item" key={item.id}>
                  <span className={statusBadge(item.status)}>{deliveryStatusLabel[item.status]}</span>
                  <div><strong>{dateTime(item.created_at)}</strong>{item.note ? <div className="muted">{item.note}</div> : null}</div>
                </div>
              ))}
              {!history.length ? <p className="muted">Nenhum evento registrado.</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
