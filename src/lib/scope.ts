import type { AppState, User } from '../types'

export function visibleEntregas(state: AppState, user: User) {
  if (user.role === 'cliente' && user.clientId) {
    return state.entregas.filter((e) => e.clientId === user.clientId)
  }
  if (user.role === 'piloto' && user.pilotoId) {
    return state.entregas.filter((e) => e.pilotoId === user.pilotoId)
  }
  return state.entregas
}

export function visiblePilotos(state: AppState, user: User) {
  if (user.role === 'cliente' && user.clientId) {
    const ids = new Set(
      state.entregas
        .filter((e) => e.clientId === user.clientId && e.status !== 'entregue' && e.status !== 'cancelado')
        .map((e) => e.pilotoId),
    )
    return state.pilotos.filter((p) => ids.has(p.id))
  }
  if (user.role === 'piloto' && user.pilotoId) {
    return state.pilotos.filter((p) => p.id === user.pilotoId)
  }
  return state.pilotos
}

export function statusLabel(s: string) {
  const map: Record<string, string> = {
    pendente: 'Pendente',
    coletado: 'Coletado',
    em_rota: 'Em rota',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
    disponivel: 'Disponível',
    offline: 'Offline',
  }
  return map[s] ?? s
}

export function badgeClass(s: string) {
  if (s === 'entregue' || s === 'disponivel') return 'badge b-ok'
  if (s === 'em_rota' || s === 'coletado') return 'badge b-blue'
  if (s === 'pendente') return 'badge b-warn'
  if (s === 'cancelado' || s === 'offline') return 'badge b-off'
  return 'badge'
}
