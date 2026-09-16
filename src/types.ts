export type Role = 'dono' | 'cliente' | 'piloto'

export type PilotoStatus = 'disponivel' | 'em_rota' | 'offline'

export type EntregaStatus =
  | 'pendente'
  | 'coletado'
  | 'em_rota'
  | 'entregue'
  | 'cancelado'

export interface User {
  id: string
  name: string
  email: string
  password?: string
  role: Role
  companyId?: string
  companyName?: string
  pilotoId?: string
  clientId?: string
}

export interface Piloto {
  id: string
  name: string
  phone: string
  plate: string
  status: PilotoStatus
  lat: number
  lng: number
  lastUpdate: string
}

export interface Cliente {
  id: string
  name: string
  company: string
  phone: string
}

export interface Entrega {
  id: string
  clientId: string
  pilotoId: string
  origin: string
  destination: string
  destLat: number
  destLng: number
  value: number
  status: EntregaStatus
  createdAt: string
  deliveredAt?: string
}

export interface Canhoto {
  id: string
  entregaId: string
  receiverName: string
  notes: string
  photoDataUrl: string
  signatureDataUrl: string
  createdAt: string
}

export interface Transacao {
  id: string
  type: 'receita' | 'despesa'
  category: string
  description: string
  amount: number
  date: string
  entregaId?: string
}

export interface AppState {
  users: User[]
  sessionUserId: string | null
  pilotos: Piloto[]
  clientes: Cliente[]
  entregas: Entrega[]
  canhotos: Canhoto[]
  transacoes: Transacao[]
}
