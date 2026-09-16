import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import ClientesCadastro from '../components/ClientesCadastro'
import PilotosCadastro from '../components/PilotosCadastro'
import { useStore } from '../context'

export default function Cadastros() {
  const { state } = useStore()
  const user = state.users.find((item) => item.id === state.sessionUserId)!
  const [tab, setTab] = useState<'clientes' | 'pilotos'>('clientes')

  if (user.role !== 'dono') return <Navigate to="/" replace />
  if (!user.companyId) return <div className="notice notice-error">Usuário sem empresa vinculada.</div>

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Cadastros">
        <button className={tab === 'clientes' ? 'tab active' : 'tab'} onClick={() => setTab('clientes')}>Clientes</button>
        <button className={tab === 'pilotos' ? 'tab active' : 'tab'} onClick={() => setTab('pilotos')}>Pilotos</button>
      </div>
      {tab === 'clientes' ? <ClientesCadastro companyId={user.companyId} /> : <PilotosCadastro companyId={user.companyId} />}
    </div>
  )
}

