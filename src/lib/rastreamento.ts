import { supabase } from './supabase'

export type TrackingDriver = {
  id: string
  company_id: string
  name: string
  plate: string | null
  vehicle_description: string | null
  status: 'disponivel' | 'em_rota' | 'offline' | 'inativo'
  active: boolean
  last_position_at: string | null
}

export type GpsPosition = {
  id: number | string
  company_id: string
  driver_id: string
  delivery_id: string | null
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  altitude: number | null
  captured_at: string
  created_at: string
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

function check(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

export async function listTrackingDrivers(companyId: string) {
  const { data, error } = await db()
    .from('drivers')
    .select('id, company_id, name, plate, vehicle_description, status, active, last_position_at')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name')

  check(error, 'Não foi possível carregar os pilotos.')
  return (data ?? []) as TrackingDriver[]
}

export async function listLatestGpsPositions(companyId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db()
    .from('gps_positions')
    .select('id, company_id, driver_id, delivery_id, latitude, longitude, accuracy, speed, heading, altitude, captured_at, created_at')
    .eq('company_id', companyId)
    .gte('captured_at', since)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('captured_at', { ascending: false })
    .limit(1000)

  check(error, 'Não foi possível carregar as posições GPS.')

  const latest = new Map<string, GpsPosition>()
  for (const row of (data ?? []) as GpsPosition[]) {
    if (!latest.has(row.driver_id)) latest.set(row.driver_id, row)
  }
  return [...latest.values()]
}

export async function listDriverTrack(companyId: string, driverId: string) {
  const since = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db()
    .from('gps_positions')
    .select('id, company_id, driver_id, delivery_id, latitude, longitude, accuracy, speed, heading, altitude, captured_at, created_at')
    .eq('company_id', companyId)
    .eq('driver_id', driverId)
    .gte('captured_at', since)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('captured_at', { ascending: true })
    .limit(500)

  check(error, 'Não foi possível carregar o trajeto do piloto.')
  return (data ?? []) as GpsPosition[]
}

export async function listDeliveryLatestPosition(deliveryId: string) {
  const { data, error } = await db()
    .from('gps_positions')
    .select(
      'id, company_id, driver_id, delivery_id, latitude, longitude, accuracy, speed, heading, altitude, captured_at, created_at',
    )
    .eq('delivery_id', deliveryId)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  check(error, 'Não foi possível localizar o piloto.')

  return data as GpsPosition | null
}

export function subscribeToDeliveryGps(
  deliveryId: string,
  onPosition: (position: GpsPosition) => void,
) {
  const channel = db()
    .channel(`delivery-gps-${deliveryId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'gps_positions',
        filter: `delivery_id=eq.${deliveryId}`,
      },
      (payload) => {
        onPosition(payload.new as GpsPosition)
      },
    )
    .subscribe()

  return () => {
    void db().removeChannel(channel)
  }
}

export function subscribeToGps(companyId: string, onChange: () => void) {
  const channel = db()
    .channel(`gps-panel-${companyId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'gps_positions',
        filter: `company_id=eq.${companyId}`,
      },
      onChange,
    )
    .subscribe()

  return () => {
    void db().removeChannel(channel)
  }
}

export function positionAgeMinutes(capturedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(capturedAt).getTime()) / 60000))
}

export function positionState(position?: GpsPosition) {
  if (!position) return { label: 'Sem GPS', className: 'gps-offline', color: '#64748b' }
  const age = positionAgeMinutes(position.captured_at)
  if (age <= 2) return { label: 'Online', className: 'gps-online', color: '#22c55e' }
  if (age <= 10) return { label: 'Sinal antigo', className: 'gps-warning', color: '#f59e0b' }
  return { label: 'Offline', className: 'gps-offline', color: '#64748b' }
}

export function formatPositionTime(value?: string) {
  if (!value) return 'Nenhuma posição recebida'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

