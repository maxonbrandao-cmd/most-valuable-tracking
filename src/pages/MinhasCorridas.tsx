import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore } from '../context'
import {
  allDeliveryStatuses,
  changeDeliveryStatus,
  deliveryStatusLabel,
  listDeliveries,
  listDeliveryHistory,
  listDeliveryOptions,
  pilotStatusActionLabel,
  deliveryPilotTransitions,
  needsDeliveryStart,
  startRecurringDelivery,
  deliveryDisplayStatus,
  statusBadge,
  type DeliveryHistory,
  type DeliveryClient,
  type DeliveryRecord,
  type DeliveryStatus,
} from '../lib/entregas'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function brl(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function dateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function localDateKey(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function startOfCurrentMonth() {
  const date = new Date()

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}-01`
}

function today() {
  return localDateKey(new Date().toISOString())
}

export default function MinhasCorridas() {
  const { state } = useStore()

  const user = state.users.find(
    (item) => item.id === state.sessionUserId,
  )!

  const companyId = user.companyId
  const driverId = user.pilotoId

  const [rows, setRows] = useState<DeliveryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [startDate, setStartDate] = useState(
    startOfCurrentMonth(),
  )

  const [clients, setClients] = useState<DeliveryClient[]>([])

  const [clientFilter, setClientFilter] = useState('')

  const [endDate, setEndDate] = useState(today())

  const [statusFilter, setStatusFilter] =
    useState<DeliveryStatus | ''>('')

  const [historyDelivery, setHistoryDelivery] =
    useState<DeliveryRecord | null>(null)

  const [history, setHistory] = useState<DeliveryHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [changingId, setChangingId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      if (!companyId || !driverId) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const [deliveries, options] = await Promise.all([
          listDeliveries(companyId),
          listDeliveryOptions(companyId),
        ])

        setRows(
          deliveries.filter(
            (delivery) =>
              delivery.driver_id === driverId,
          ),
        )

        setClients(options.clients)

      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar suas corridas.',
        )
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [companyId, driverId])

  const clientMap = useMemo(
    () =>
      new Map(
        clients.map((client) => [
          client.id,
          client,
        ]),
      ),
    [clients],
  )

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const date =
        row.scheduled_at ??
        row.delivered_at ??
        row.created_at

      const dateKey = localDateKey(date)

      const matchesClient =
        !clientFilter ||
        row.client_id === clientFilter

      const matchesStart =
        !startDate || dateKey >= startDate

      const matchesEnd =
        !endDate || dateKey <= endDate

      const matchesStatus =
        !statusFilter ||
        row.status === statusFilter

      return (
        matchesStart &&
        matchesEnd &&
        matchesStatus &&
        matchesClient
      )
    })
  }, [
    rows,
    startDate,
    endDate,
    statusFilter,
    clientFilter,
  ])

  const completedCount = useMemo(
    () =>
      filteredRows.filter(
        (row) => row.status === 'entregue',
      ).length,
    [filteredRows],
  )

  const notDeliveredCount = useMemo(
    () =>
      filteredRows.filter(
        (row) => row.status === 'nao_entregue',
      ).length,
    [filteredRows],
  )

  const cancelledCount = useMemo(
    () =>
      filteredRows.filter(
        (row) => row.status === 'cancelado',
      ).length,
    [filteredRows],
  )

  const payoutTotal = useMemo(
    () =>
      filteredRows
        .filter((row) => row.status === 'entregue')
        .reduce(
          (sum, row) =>
            sum + (row.driver_payout || 0),
          0,
        ),
    [filteredRows],
  )

  async function openHistory(
    row: DeliveryRecord,
  ) {
    if (!companyId) return

    if (historyDelivery?.id === row.id) {
      setHistoryDelivery(null)
      setHistory([])
      return
    }

    setHistoryDelivery(row)
    setHistoryLoading(true)
    setError('')

    try {
      setHistory(
        await listDeliveryHistory(
          companyId,
          row.id,
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar o histórico.',
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  async function startAttendance(row: DeliveryRecord) {
    if (changingId) return
    setChangingId(row.id)
    setError('')
    setMessage('')
    try {
      const updated = await startRecurringDelivery(row.id)
      setRows(current => current.map(item => item.id === updated.id ? updated : item))
      setMessage('Atendimento iniciado. Confirme a coleta quando retirar o pedido.')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível iniciar o atendimento.')
    } finally { setChangingId('') }
  }

  async function advanceStatus(
    row: DeliveryRecord,
    status: DeliveryStatus,
  ) {
    if (!deliveryPilotTransitions(row).includes(status)) {
      setError('Essa mudança de status não é permitida para o piloto.')
      return
    }

    setChangingId(row.id)
    setError('')
    setMessage('')

    try {
      const updated = await changeDeliveryStatus(row.id, status)

      setRows((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )

      setMessage(
        `Corrida ${row.code}: ${deliveryStatusLabel[status].toLowerCase()}.`,
      )

      if (historyDelivery?.id === row.id && companyId) {
        setHistory(
          await listDeliveryHistory(companyId, row.id),
        )
        setHistoryDelivery(updated)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a corrida.',
      )
    } finally {
      setChangingId('')
    }
  }

  if (user.role !== 'piloto') {
    return (
      <div className="notice notice-error">
        Esta tela é exclusiva para pilotos.
      </div>
    )
  }

  if (!driverId) {
    return (
      <div className="notice notice-error">
        Seu usuário não possui um piloto vinculado.
      </div>
    )
  }

  const dailyChartData = useMemo(() => {
    const totals = new Map<string, number>()

    filteredRows.forEach((row) => {
      const date =
        row.scheduled_at ??
        row.delivered_at ??
        row.created_at

      const key = localDateKey(date)

      totals.set(
        key,
        (totals.get(key) ?? 0) + 1,
      )
    })

    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({
        date: new Date(
          `${date}T12:00:00`,
        ).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }),
        total,
      }))
  }, [filteredRows])

  const statusChartData = useMemo(() => {
    return allDeliveryStatuses
      .map((status) => ({
        name: deliveryStatusLabel[status],
        value: filteredRows.filter(
          (row) => row.status === status,
        ).length,
      }))
      .filter((item) => item.value > 0)
  }, [filteredRows])

  const payoutChartData = useMemo(() => {
    const totals = new Map<string, number>()

    filteredRows
      .filter((row) => row.status === 'entregue')
      .forEach((row) => {
        const date =
          row.delivered_at ??
          row.scheduled_at ??
          row.created_at

        const key = localDateKey(date)

        totals.set(
          key,
          (totals.get(key) ?? 0) +
            (row.driver_payout || 0),
        )
      })

    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({
        date: new Date(
          `${date}T12:00:00`,
        ).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }),
        total,
      }))
  }, [filteredRows])

  return (
    <div>
      <div className="section-heading">
        <div>
          <h3>Minhas corridas</h3>

          <p className="muted">
            Acompanhe seu histórico, quantidade de
            corridas e repasses.
          </p>
        </div>
      </div>

      {message ? (
        <div className="notice notice-success">{message}</div>
      ) : null}

      {error ? (
        <div className="notice notice-error">{error}</div>
      ) : null}

      {error ? (
        <div className="notice notice-error">
          {error}
        </div>
      ) : null}

      <div className="grid-cards">
        <div className="card">
          <div className="label">
            Corridas no período
          </div>

          <div className="value">
            {filteredRows.length}
          </div>
        </div>

        <div className="card">
          <div className="label">
            Concluídas
          </div>

          <div className="value">
            {completedCount}
          </div>
        </div>

        <div className="card">
          <div className="label">
            Não entregues
          </div>

          <div className="value">
            {notDeliveredCount}
          </div>
        </div>

        <div className="card">
          <div className="label">
            Total de repasse
          </div>

          <div className="value">
            {brl(payoutTotal)}
          </div>

          <div className="hint">
            Somente corridas entregues
          </div>
        </div>
      </div>

      <div className="corridas-charts">
        <div className="card corridas-chart-card">
          <div className="chart-heading">
            <div>
              <h3>Corridas por dia</h3>

              <p className="muted">
                Quantidade de corridas no período selecionado.
              </p>
            </div>
          </div>

          {dailyChartData.length ? (
            <div className="chart-container">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart data={dailyChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.15}
                  />

                  <XAxis
                    dataKey="date"
                    tick={{
                      fill: '#93a0c0',
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fill: '#93a0c0',
                      fontSize: 12,
                    }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="total"
                    name="Corridas"
                    fill="#f5a524"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted">
              Nenhuma corrida no período.
            </p>
          )}
        </div>

        <div className="card corridas-chart-card">
          <div className="chart-heading">
            <div>
              <h3>Status das corridas</h3>

              <p className="muted">
                Distribuição das corridas filtradas.
              </p>
            </div>
          </div>

          {statusChartData.length ? (
            <div className="chart-container">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {statusChartData.map(
                      (_, index) => (
                        <Cell
                          key={index}
                          fill={
                            [
                              '#f5a524',
                              '#6ea8ff',
                              '#3dd68c',
                              '#ffb020',
                              '#ff6b7a',
                              '#8b95ae',
                            ][index % 6]
                          }
                        />
                      ),
                    )}
                  </Pie>

                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted">
              Nenhuma corrida no período.
            </p>
          )}
        </div>
      </div>

      <div className="card corridas-chart-card">
        <div className="chart-heading">
          <div>
            <h3>Repasse por dia</h3>

            <p className="muted">
              Total recebido nas corridas entregues no período.
            </p>
          </div>
        </div>

        {payoutChartData.length ? (
          <div className="chart-container">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart data={payoutChartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.15}
                />

                <XAxis
                  dataKey="date"
                  tick={{
                    fill: '#93a0c0',
                    fontSize: 12,
                  }}
                />

                <YAxis
                  tick={{
                    fill: '#93a0c0',
                    fontSize: 12,
                  }}
                />

                <Tooltip
                  formatter={(value) =>
                    brl(Number(value))
                  }
                />

                <Bar
                  dataKey="total"
                  name="Repasse"
                  fill="#3dd68c"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">
            Nenhum repasse no período.
          </p>
        )}
      </div>

      <div className="card delivery-filters">
        <label className="filter-field">
          <span>Data inicial</span>

          <input
            type="date"
            value={startDate}
            onChange={(event) =>
              setStartDate(
                event.target.value,
              )
            }
          />
        </label>

        <label className="filter-field">
          <span>Data final</span>

          <input
            type="date"
            value={endDate}
            onChange={(event) =>
              setEndDate(
                event.target.value,
              )
            }
          />
        </label>

        <label className="filter-field">
          <span>Status</span>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target
                  .value as DeliveryStatus | '',
              )
            }
          >
            <option value="">
              Todos os status
            </option>

            {allDeliveryStatuses.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {
                    deliveryStatusLabel[
                      status
                    ]
                  }
                </option>
              ),
            )}
          </select>
        </label>

        <label className="filter-field">
          <span>Cliente</span>

          <select
            value={clientFilter}
            onChange={(event) =>
              setClientFilter(event.target.value)
            }
          >
            <option value="">
              Todos os clientes
            </option>

            {clients.map((client) => (
              <option
                key={client.id}
                value={client.id}
              >
                {client.company_name || client.name}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            setStartDate(startOfCurrentMonth(),)
            setEndDate(today())
            setStatusFilter('')
            setClientFilter('')
          }}
        >
          Mês atual
        </button>
      </div>

      <div className="card table-card">
        {loading ? (
          <p className="muted">
            Carregando corridas...
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Data</th>
                <th>Rota</th>
                <th>Status</th>
                <th>Repasse</th>
                <th>Cliente</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <Fragment key={row.id}>
                  <tr key={row.id}>
                    <td data-label="Código">
                      <strong>
                        {row.code}
                      </strong>
                    </td>

                    <td data-label="Data">
                      {dateTime(
                        row.scheduled_at ??
                          row.created_at,
                      )}
                    </td>

                    <td data-label="Rota">
                      <div>
                        {row.origin_address}
                      </div>

                      <div className="route-arrow">
                        →{' '}
                        {
                          row.destination_address
                        }
                      </div>
                    </td>

                    <td data-label="Status">
                      <span
                        className={statusBadge(
                          row.status,
                        )}
                      >
                        {
                          deliveryDisplayStatus(row)
                        }
                      </span>
                    </td>

                    <td data-label="Repasse">
                      {brl(
                        row.driver_payout || 0,
                      )}
                    </td>

                    <td data-label="Cliente">
                      {clientMap.get(row.client_id)?.company_name ||
                        clientMap.get(row.client_id)?.name ||
                        'Cliente'}
                    </td>

                    <td data-label="Ações">
                      <div className="delivery-web-actions">

                        {needsDeliveryStart(row) && (
                          <button type="button" className="btn btn-gold btn-small" disabled={!!changingId}
                            onClick={() => void startAttendance(row)}>
                            {changingId === row.id ? 'Iniciando...' : 'Iniciar atendimento'}
                          </button>
                        )}
{deliveryPilotTransitions(row).map(
                          (status) => (
                            <button
                              className={
                                status === 'cancelado' ||
                                status === 'nao_entregue'
                                  ? 'btn btn-ghost btn-small'
                                  : 'btn btn-gold btn-small'
                              }
                              disabled={changingId === row.id}
                              key={status}
                              type="button"
                              onClick={() =>
                                void advanceStatus(row, status)
                              }
                            >
                              {changingId === row.id
                                ? 'Atualizando...'
                                : pilotStatusActionLabel[status] ??
                                  deliveryStatusLabel[status]}
                            </button>
                          ),
                        )}

                        <button
                          className="btn btn-ghost btn-small"
                          type="button"
                          onClick={() =>
                            void openHistory(row)
                          }
                        >
                          {historyDelivery?.id === row.id
                            ? 'Fechar histórico'
                            : 'Histórico'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {historyDelivery?.id ===
                  row.id ? (
                    <tr className="delivery-detail-row">
                      <td colSpan={6}>
                        <div className="card history-card delivery-inline-detail">
                          <div className="section-heading">
                            <div>
                              <h3>
                                Histórico ·{' '}
                                {row.code}
                              </h3>
                            </div>

                            <button
                              className="btn btn-ghost btn-small"
                              type="button"
                              onClick={() => {
                                setHistoryDelivery(
                                  null,
                                )
                                setHistory([])
                              }}
                            >
                              Fechar
                            </button>
                          </div>

                          {historyLoading ? (
                            <p className="muted">
                              Carregando histórico...
                            </p>
                          ) : (
                            <div className="history-list">
                              {history.map(
                                (item) => (
                                  <div
                                    className="history-item"
                                    key={
                                      item.id
                                    }
                                  >
                                    <span
                                      className={statusBadge(
                                        item.status,
                                      )}
                                    >
                                      {
                                        deliveryStatusLabel[
                                          item
                                            .status
                                        ]
                                      }
                                    </span>

                                    <div>
                                      <strong>
                                        {dateTime(
                                          item.created_at,
                                        )}
                                      </strong>

                                      {item.note ? (
                                        <div className="muted">
                                          {
                                            item.note
                                          }
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ),
                              )}

                              {!history.length ? (
                                <p className="muted">
                                  Nenhum evento
                                  registrado.
                                </p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}

              {!filteredRows.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="muted"
                  >
                    Nenhuma corrida encontrada
                    nesse período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="muted"
        style={{ marginTop: 12 }}
      >
        Canceladas no período:{' '}
        {cancelledCount}
      </div>
    </div>
  )
}
