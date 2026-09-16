import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '../context'
import {
  formatPositionTime,
  listDriverTrack,
  listLatestGpsPositions,
  listTrackingDrivers,
  positionAgeMinutes,
  positionState,
  subscribeToGps,
  type GpsPosition,
  type TrackingDriver,
} from '../lib/rastreamento'

const DEFAULT_CENTER: LatLngExpression = [-26.9078, -48.6618]

function RecenterMap({ center }: { center: LatLngExpression }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 14), { animate: true })
  }, [center, map])
  return null
}

function speedLabel(speed: number | null) {
  if (speed == null || speed < 0) return '—'
  return `${Math.round(speed * 3.6)} km/h`
}

export default function Tracking() {
  const { state } = useStore()
  const session = state.users.find((user) => user.id === state.sessionUserId)
  const companyId = session?.companyId
  const [drivers, setDrivers] = useState<TrackingDriver[]>([])
  const [positions, setPositions] = useState<GpsPosition[]>([])
  const [track, setTrack] = useState<GpsPosition[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const positionsByDriver = useMemo(
    () => new Map(positions.map((position) => [position.driver_id, position])),
    [positions],
  )

  const selectedDriver = drivers.find((driver) => driver.id === selectedId) ?? null
  const selectedPosition = selectedDriver ? positionsByDriver.get(selectedDriver.id) : undefined
  const visiblePositions = positions.filter((position) => drivers.some((driver) => driver.id === position.driver_id))
  const onlineCount = visiblePositions.filter((position) => positionAgeMinutes(position.captured_at) <= 2).length
  const inRouteCount = drivers.filter((driver) => driver.status === 'em_rota').length

  const center = useMemo<LatLngExpression>(() => {
    if (selectedPosition) return [selectedPosition.latitude, selectedPosition.longitude]
    if (visiblePositions[0]) return [visiblePositions[0].latitude, visiblePositions[0].longitude]
    return DEFAULT_CENTER
  }, [selectedPosition, visiblePositions])

  const loadLatest = useCallback(async () => {
    if (!companyId) return
    try {
      const [nextDrivers, nextPositions] = await Promise.all([
        listTrackingDrivers(companyId),
        listLatestGpsPositions(companyId),
      ])
      setDrivers(nextDrivers)
      setPositions(nextPositions)
      setSelectedId((current) => current ?? nextDrivers[0]?.id ?? null)
      setUpdatedAt(new Date())
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível atualizar o mapa.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void loadLatest()
  }, [loadLatest])

  useEffect(() => {
    if (!companyId) return
    const unsubscribe = subscribeToGps(companyId, () => void loadLatest())
    const timer = window.setInterval(() => void loadLatest(), 60_000)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [companyId, loadLatest])

  useEffect(() => {
    if (!companyId || !selectedId) {
      setTrack([])
      return
    }
    void listDriverTrack(companyId, selectedId)
      .then(setTrack)
      .catch((trackError) => setError(trackError instanceof Error ? trackError.message : 'Falha ao carregar trajeto.'))
  }, [companyId, selectedId, positions])

  if (!companyId) {
    return <div className="card"><p className="gps-error">Usuário sem empresa vinculada.</p></div>
  }

  return (
    <section className="gps-page">
      <div className="gps-header">
        <div>
          <h1>Rastreio GPS</h1>
          <p>Posição dos pilotos e trajeto das últimas 8 horas.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void loadLatest()} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar mapa'}
        </button>
      </div>

      <div className="gps-summary">
        <div className="gps-stat"><span>Pilotos ativos</span><strong>{drivers.length}</strong></div>
        <div className="gps-stat"><span>GPS online</span><strong>{onlineCount}</strong></div>
        <div className="gps-stat"><span>Em rota</span><strong>{inRouteCount}</strong></div>
        <div className="gps-stat"><span>Última atualização</span><strong>{updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}</strong></div>
      </div>

      {!!error && <div className="gps-error-banner">{error}</div>}

      <div className="gps-workspace">
        <aside className="gps-drivers">
          <div className="gps-panel-title">
            <strong>Pilotos</strong>
            <span>{drivers.length}</span>
          </div>
          {drivers.length === 0 && !loading && (
            <div className="gps-empty-small">Nenhum piloto ativo encontrado.</div>
          )}
          {drivers.map((driver) => {
            const position = positionsByDriver.get(driver.id)
            const stateInfo = positionState(position)
            return (
              <button
                key={driver.id}
                className={`gps-driver-card${driver.id === selectedId ? ' selected' : ''}`}
                onClick={() => setSelectedId(driver.id)}
              >
                <span className="gps-driver-dot" style={{ backgroundColor: stateInfo.color }} />
                <span className="gps-driver-main">
                  <strong>{driver.name}</strong>
                  <small>{driver.plate || driver.vehicle_description || 'Veículo não informado'}</small>
                  <small>{formatPositionTime(position?.captured_at)}</small>
                </span>
                <span className={`gps-state ${stateInfo.className}`}>{stateInfo.label}</span>
              </button>
            )
          })}
        </aside>

        <div className="gps-map-card">
          <MapContainer center={center} zoom={13} className="gps-map" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <RecenterMap center={center} />
            {track.length > 1 && (
              <Polyline
                positions={track.map((point) => [point.latitude, point.longitude] as [number, number])}
                pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75 }}
              />
            )}
            {visiblePositions.map((position) => {
              const driver = drivers.find((item) => item.id === position.driver_id)
              const stateInfo = positionState(position)
              return (
                <CircleMarker
                  key={`${position.driver_id}-${position.id}`}
                  center={[position.latitude, position.longitude]}
                  radius={driver?.id === selectedId ? 11 : 8}
                  pathOptions={{ color: '#ffffff', weight: 3, fillColor: stateInfo.color, fillOpacity: 1 }}
                  eventHandlers={{ click: () => setSelectedId(position.driver_id) }}
                >
                  <Popup>
                    <strong>{driver?.name ?? 'Piloto'}</strong><br />
                    {driver?.plate ?? 'Sem placa'}<br />
                    Velocidade: {speedLabel(position.speed)}<br />
                    Atualização: {formatPositionTime(position.captured_at)}
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>

          {visiblePositions.length === 0 && !loading && (
            <div className="gps-map-empty">
              <strong>Nenhuma posição recebida</strong>
              <span>Quando o piloto iniciar o rastreamento no aplicativo, ele aparecerá aqui.</span>
            </div>
          )}
        </div>
      </div>

      {selectedDriver && (
        <div className="gps-detail-card">
          <div><span>Piloto</span><strong>{selectedDriver.name}</strong></div>
          <div><span>Veículo</span><strong>{selectedDriver.plate || selectedDriver.vehicle_description || 'Não informado'}</strong></div>
          <div><span>Velocidade</span><strong>{speedLabel(selectedPosition?.speed ?? null)}</strong></div>
          <div><span>Precisão</span><strong>{selectedPosition?.accuracy != null ? `${Math.round(selectedPosition.accuracy)} m` : '—'}</strong></div>
          <div><span>Pontos no trajeto</span><strong>{track.length}</strong></div>
          <div><span>Última posição</span><strong>{formatPositionTime(selectedPosition?.captured_at)}</strong></div>
        </div>
      )}
    </section>
  )
}

