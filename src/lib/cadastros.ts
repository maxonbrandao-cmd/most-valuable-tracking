import { supabase } from './supabase'

export type ClientRecord = {
  id: string
  company_id: string
  name: string
  company_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  active: boolean
}

export type ClientInput = {
  name: string
  companyName: string
  document: string
  email: string
  phone: string
  active: boolean
}

export type DriverStatus = 'disponivel' | 'em_rota' | 'offline' | 'inativo'

export type DriverRecord = {
  id: string
  company_id: string
  name: string
  phone: string | null
  document: string | null
  plate: string | null
  vehicle_description: string | null
  status: DriverStatus
  active: boolean
}

export type DriverInput = {
  name: string
  phone: string
  document: string
  plate: string
  vehicleDescription: string
  status: DriverStatus
  active: boolean
}

function client() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

function optional(value: string) {
  const normalized = value.trim()
  return normalized || null
}

function databaseError(error: { code?: string; message?: string } | null) {
  if (!error) return null
  if (error.code === '23505') return new Error('Já existe um cadastro com esse documento ou placa.')
  if (error.code === '23503') return new Error('O cadastro está vinculado a outro registro e não pode ser alterado dessa forma.')
  return new Error(error.message || 'Não foi possível salvar o cadastro.')
}

export async function listClients(companyId: string) {
  const { data, error } = await client()
    .from('clients')
    .select('id, company_id, name, company_name, document, email, phone, active')
    .eq('company_id', companyId)
    .order('name')

  const parsed = databaseError(error)
  if (parsed) throw parsed
  return (data ?? []) as ClientRecord[]
}

export async function saveClient(companyId: string, input: ClientInput, id?: string) {
  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    company_name: optional(input.companyName),
    document: optional(input.document),
    email: optional(input.email),
    phone: optional(input.phone),
    active: input.active,
  }

  const query = id
    ? client().from('clients').update(payload).eq('id', id).eq('company_id', companyId)
    : client().from('clients').insert(payload)
  const { error } = await query
  const parsed = databaseError(error)
  if (parsed) throw parsed
}

export async function setClientActive(companyId: string, id: string, active: boolean) {
  const { error } = await client()
    .from('clients')
    .update({ active })
    .eq('id', id)
    .eq('company_id', companyId)
  const parsed = databaseError(error)
  if (parsed) throw parsed
}

export async function listDrivers(companyId: string) {
  const { data, error } = await client()
    .from('drivers')
    .select('id, company_id, name, phone, document, plate, vehicle_description, status, active')
    .eq('company_id', companyId)
    .order('name')

  const parsed = databaseError(error)
  if (parsed) throw parsed
  return (data ?? []) as DriverRecord[]
}

export async function saveDriver(companyId: string, input: DriverInput, id?: string) {
  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    phone: optional(input.phone),
    document: optional(input.document),
    plate: optional(input.plate)?.toUpperCase() ?? null,
    vehicle_description: optional(input.vehicleDescription),
    status: input.active ? (input.status === 'inativo' ? 'offline' : input.status) : 'inativo',
    active: input.active,
  }

  const query = id
    ? client().from('drivers').update(payload).eq('id', id).eq('company_id', companyId)
    : client().from('drivers').insert(payload)
  const { error } = await query
  const parsed = databaseError(error)
  if (parsed) throw parsed
}

export async function setDriverActive(companyId: string, row: DriverRecord, active: boolean) {
  const { error } = await client()
    .from('drivers')
    .update({ active, status: active && row.status === 'inativo' ? 'offline' : active ? row.status : 'inativo' })
    .eq('id', row.id)
    .eq('company_id', companyId)
  const parsed = databaseError(error)
  if (parsed) throw parsed
}
