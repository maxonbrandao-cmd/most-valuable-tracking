import type { AppState, User } from './types'

const KEY = 'mvt-state-v1'

const SP = { lat: -23.55052, lng: -46.633308 }

function nowIso() {
  return new Date().toISOString()
}

export const seed: AppState = {
  sessionUserId: null,
  users: [
    {
      id: 'u-dono',
      name: 'Carla Mendes',
      email: 'dono@mvt.app',
      password: '1234',
      role: 'dono',
    },
    {
      id: 'u-cli',
      name: 'Rafael Costa',
      email: 'cliente@mvt.app',
      password: '1234',
      role: 'cliente',
      clientId: 'c1',
    },
    {
      id: 'u-pil',
      name: 'João Almeida',
      email: 'piloto@mvt.app',
      password: '1234',
      role: 'piloto',
      pilotoId: 'p1',
    },
  ],
  clientes: [
    { id: 'c1', name: 'Rafael Costa', company: 'Farmácia Vida+', phone: '(11) 98811-2200' },
    { id: 'c2', name: 'Marina Souza', company: 'Ateliê Maré', phone: '(11) 97720-1100' },
    { id: 'c3', name: 'Pedro Lima', company: 'TechParts', phone: '(11) 96630-4400' },
  ],
  pilotos: [
    {
      id: 'p1',
      name: 'João Almeida',
      phone: '(11) 99111-0001',
      plate: 'MVT-1A23',
      status: 'em_rota',
      lat: SP.lat + 0.012,
      lng: SP.lng - 0.008,
      lastUpdate: nowIso(),
    },
    {
      id: 'p2',
      name: 'Bruno Silva',
      phone: '(11) 99111-0002',
      plate: 'MVT-2B45',
      status: 'em_rota',
      lat: SP.lat - 0.018,
      lng: SP.lng + 0.014,
      lastUpdate: nowIso(),
    },
    {
      id: 'p3',
      name: 'Ana Ribeiro',
      phone: '(11) 99111-0003',
      plate: 'MVT-3C67',
      status: 'disponivel',
      lat: SP.lat + 0.004,
      lng: SP.lng + 0.02,
      lastUpdate: nowIso(),
    },
    {
      id: 'p4',
      name: 'Diego Santos',
      phone: '(11) 99111-0004',
      plate: 'MVT-4D89',
      status: 'offline',
      lat: SP.lat - 0.03,
      lng: SP.lng - 0.02,
      lastUpdate: nowIso(),
    },
  ],
  entregas: [
    {
      id: 'e1',
      clientId: 'c1',
      pilotoId: 'p1',
      origin: 'Rua Augusta, 1500 — Consolação',
      destination: 'Av. Paulista, 900 — Bela Vista',
      destLat: SP.lat + 0.008,
      destLng: SP.lng + 0.004,
      value: 28.5,
      status: 'em_rota',
      createdAt: nowIso(),
    },
    {
      id: 'e2',
      clientId: 'c2',
      pilotoId: 'p2',
      origin: 'Moema — Al. dos Nhambiquaras',
      destination: 'Vila Mariana — Rua Domingos de Morais',
      destLat: SP.lat - 0.02,
      destLng: SP.lng + 0.01,
      value: 35,
      status: 'em_rota',
      createdAt: nowIso(),
    },
    {
      id: 'e3',
      clientId: 'c1',
      pilotoId: 'p3',
      origin: 'Centro — Rua Direita',
      destination: 'Pinheiros — Rua dos Pinheiros',
      destLat: SP.lat + 0.002,
      destLng: SP.lng - 0.025,
      value: 42,
      status: 'pendente',
      createdAt: nowIso(),
    },
    {
      id: 'e4',
      clientId: 'c3',
      pilotoId: 'p1',
      origin: 'Itaim Bibi',
      destination: 'Brooklin — Av. Santo Amaro',
      destLat: SP.lat - 0.025,
      destLng: SP.lng - 0.01,
      value: 55,
      status: 'entregue',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      deliveredAt: new Date(Date.now() - 83000000).toISOString(),
    },
  ],
  canhotos: [
    {
      id: 'k1',
      entregaId: 'e4',
      receiverName: 'Luciana Prado',
      notes: 'Recebido no térreo, documento conferido.',
      photoDataUrl: '',
      signatureDataUrl: '',
      createdAt: new Date(Date.now() - 83000000).toISOString(),
    },
  ],
  transacoes: [
    {
      id: 't1',
      type: 'receita',
      category: 'Entrega',
      description: 'Entrega e4 — TechParts',
      amount: 55,
      date: new Date(Date.now() - 83000000).toISOString().slice(0, 10),
      entregaId: 'e4',
    },
    {
      id: 't2',
      type: 'despesa',
      category: 'Combustível',
      description: 'Abastecimento frota — posto Ipiranga',
      amount: 180,
      date: new Date(Date.now() - 43200000).toISOString().slice(0, 10),
    },
    {
      id: 't3',
      type: 'despesa',
      category: 'Manutenção',
      description: 'Troca de pneu — MVT-2B45',
      amount: 220,
      date: new Date(Date.now() - 172800000).toISOString().slice(0, 10),
    },
    {
      id: 't4',
      type: 'receita',
      category: 'Entrega',
      description: 'Pacote mensal Farmácia Vida+',
      amount: 890,
      date: new Date().toISOString().slice(0, 10),
    },
  ],
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(seed)
    return { ...structuredClone(seed), ...JSON.parse(raw) }
  } catch {
    return structuredClone(seed)
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function login(state: AppState, email: string, password: string): User | null {
  const user = state.users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
  )
  return user ?? null
}
