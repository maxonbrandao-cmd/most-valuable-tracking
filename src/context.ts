import { createContext, useContext } from 'react'
import type { AppState, Canhoto, Entrega, Transacao } from './types'

export type StoreCtx = {
  state: AppState
  login: (email: string, password: string) => Promise<string | null>
  logout: () => void
  updatePilotoGps: (pilotoId: string, lat: number, lng: number) => void
  setEntregaStatus: (id: string, status: Entrega['status']) => void
  addCanhoto: (canhoto: Omit<Canhoto, 'id' | 'createdAt'>) => void
  addTransacao: (tx: Omit<Transacao, 'id'>) => void
  addEntrega: (e: Omit<Entrega, 'id' | 'createdAt'>) => void
}

export const StoreContext = createContext<StoreCtx | null>(null)

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('Store fora do provider')
  return ctx
}
