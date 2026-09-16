import { supabase } from './supabase'

export type DeliveryStatus =
  | 'pendente'
  | 'aceito'
  | 'coletado'
  | 'em_rota'
  | 'chegou'
  | 'entregue'
  | 'nao_entregue'
  | 'cancelado'

export type DeliveryRecord = {
  id: string
  company_id: string
  code: string
  client_id: string
  driver_id: string | null
  origin_address: string
  origin_postal_code: string | null
  destination_address: string
  destination_postal_code: string | null
  value: number
  driver_payout: number
  notes: string | null
  status: DeliveryStatus
  scheduled_at: string | null
  accepted_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  created_at: string
}

export type DeliveryInput = {
  clientId: string
  driverId: string
  originAddress: string
  originPostalCode: string
  destinationAddress: string
  destinationPostalCode: string
  value: string
  driverPayout: string
  notes: string
}

export type DeliveryClient = {
  id: string
  name: string
  company_name: string | null
  active: boolean
}

export type DeliveryDriver = {
  id: string
  name: string
  plate: string | null
  active: boolean
}

export type DeliveryHistory = {
  id: number
  delivery_id: string
  status: DeliveryStatus
  note: string | null
  created_at: string
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

function parseError(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

function optional(value: string) {
  const normalized = value.trim()
  return normalized || null
}

export async function listDeliveries(companyId: string) {
  const { data, error } = await db()
    .from('deliveries')
    .select('id, company_id, code, client_id, driver_id, origin_address, origin_postal_code, destination_address, destination_postal_code, value, driver_payout, notes, status, scheduled_at, accepted_at, picked_up_at, delivered_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  parseError(error, 'Não foi possível carregar as entregas.')
  return (data ?? []) as DeliveryRecord[]
}

export async function listDeliveryOptions(companyId: string) {
  const [clientsResult, driversResult] = await Promise.all([
    db().from('clients').select('id, name, company_name, active').eq('company_id', companyId).order('name'),
    db().from('drivers').select('id, name, plate, active').eq('company_id', companyId).order('name'),
  ])

  parseError(clientsResult.error, 'Não foi possível carregar os clientes.')
  parseError(driversResult.error, 'Não foi possível carregar os pilotos.')
  return {
    clients: (clientsResult.data ?? []) as DeliveryClient[],
    drivers: (driversResult.data ?? []) as DeliveryDriver[],
  }
}

export async function saveDelivery(companyId: string, input: DeliveryInput, id?: string) {
  const payload = {
    company_id: companyId,
    client_id: input.clientId,
    driver_id: optional(input.driverId),
    origin_address: input.originAddress.trim(),
    origin_postal_code: optional(input.originPostalCode.replace(/\D/g, '')),
    destination_address: input.destinationAddress.trim(),
    destination_postal_code: optional(input.destinationPostalCode.replace(/\D/g, '')),
    value: Number(input.value.replace(',', '.')) || 0,
    driver_payout: Number(input.driverPayout.replace(',', '.')) || 0,
    notes: optional(input.notes),
  }

  const query = id
    ? db().from('deliveries').update(payload).eq('id', id).eq('company_id', companyId)
    : db().from('deliveries').insert({ ...payload, status: 'pendente' })
  const { error } = await query
  parseError(error, 'Não foi possível salvar a entrega.')
}

export async function changeDeliveryStatus(deliveryId: string, status: DeliveryStatus) {
  const { error } = await db().rpc('set_delivery_status', {
    p_delivery_id: deliveryId,
    p_status: status,
  })
  parseError(error, 'Não foi possível alterar o status.')
}

export async function listDeliveryHistory(companyId: string, deliveryId: string) {
  const { data, error } = await db()
    .from('delivery_status_history')
    .select('id, delivery_id, status, note, created_at')
    .eq('company_id', companyId)
    .eq('delivery_id', deliveryId)
    .order('created_at', { ascending: false })

  parseError(error, 'Não foi possível carregar o histórico.')
  return (data ?? []) as DeliveryHistory[]
}

export const deliveryStatusLabel: Record<DeliveryStatus, string> = {
  pendente: 'Pendente',
  aceito: 'Aceito',
  coletado: 'Coletado',
  em_rota: 'Em rota',
  chegou: 'Chegou',
  entregue: 'Entregue',
  nao_entregue: 'Não entregue',
  cancelado: 'Cancelado',
}

export const allDeliveryStatuses = Object.keys(deliveryStatusLabel) as DeliveryStatus[]

export function statusBadge(status: DeliveryStatus) {
  if (status === 'entregue') return 'badge b-ok'
  if (status === 'em_rota' || status === 'coletado' || status === 'chegou') return 'badge b-blue'
  if (status === 'pendente' || status === 'aceito') return 'badge b-warn'
  return 'badge b-off'
}
