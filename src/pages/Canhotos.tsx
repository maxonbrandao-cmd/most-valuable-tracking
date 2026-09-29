import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../context'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type Proof = {
  id: string
  delivery_id: string
  receiver_name: string
  receiver_document: string | null
  notes: string | null
  canhoto_photo_path: string | null
  package_photo_path: string | null
  signature_path: string | null
  delivered_at: string
  created_at: string
}

type Delivery = {
  id: string
  code: string
  destination_address: string
  origin_address: string
}

type ProofCard = Proof & {
  delivery?: Delivery
  photoUrl: string | null
  packageUrl: string | null
  signatureUrl: string | null
}

async function signedUrl(path: string | null) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('delivery-proofs').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

function dateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

export default function Canhotos() {
  const { state } = useStore()
  const user = state.users.find(item => item.id === state.sessionUserId)!
  const [rows, setRows] = useState<ProofCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase não está configurado neste ambiente.')
      const { data: proofs, error: proofError } = await supabase
        .from('delivery_proofs')
        .select('id, delivery_id, receiver_name, receiver_document, notes, canhoto_photo_path, package_photo_path, signature_path, delivered_at, created_at')
        .order('created_at', { ascending: false })
      if (proofError) throw proofError

      const proofRows = (proofs ?? []) as Proof[]
      const deliveryIds = [...new Set(proofRows.map(proof => proof.delivery_id))]
      const deliveriesById = new Map<string, Delivery>()
      if (deliveryIds.length) {
        const { data: deliveries, error: deliveryError } = await supabase
          .from('deliveries')
          .select('id, code, destination_address, origin_address')
          .in('id', deliveryIds)
        if (deliveryError) throw deliveryError
        for (const delivery of (deliveries ?? []) as Delivery[]) deliveriesById.set(delivery.id, delivery)
      }

      const cards = await Promise.all(proofRows.map(async proof => ({
        ...proof,
        delivery: deliveriesById.get(proof.delivery_id),
        photoUrl: await signedUrl(proof.canhoto_photo_path),
        packageUrl: await signedUrl(proof.package_photo_path),
        signatureUrl: await signedUrl(proof.signature_path),
      })))
      setRows(cards)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os canhotos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load, revision])

  return (
    <div>
      <div className="section-heading">
        <div>
          <h3>Canhotos</h3>
          <p className="muted">Comprovantes enviados pelo app do piloto e pelo site.</p>
        </div>
        <button type="button" className="btn btn-inline" disabled={loading} onClick={() => setRevision(value => value + 1)}>
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {user.role !== 'cliente' && <div style={{ marginBottom: 12 }}>
        <Link className="btn btn-gold" to="/canhotos/novo" style={{ width: 'auto', display: 'inline-block' }}>Registrar canhoto</Link>
      </div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {loading && <p role="status">Carregando canhotos...</p>}
      {!loading && !error && !rows.length && <p className="muted">Nenhum canhoto registrado ainda.</p>}

      <div className="row">
        {rows.map(proof => (
          <article className="card grow" key={proof.id} style={{ maxWidth: 460 }}>
            <strong>{proof.receiver_name}</strong>
            <p className="muted">Corrida {proof.delivery?.code ?? '—'} · {proof.delivery?.destination_address ?? 'Endereço indisponível'}</p>
            <p className="muted">Finalizada em {dateTime(proof.delivered_at)}</p>
            {proof.receiver_document && <p className="muted">Documento: {proof.receiver_document}</p>}
            {proof.notes && <p>{proof.notes}</p>}
            {proof.photoUrl ? <img className="preview" src={proof.photoUrl} alt="Foto do canhoto" /> : <p className="muted">Sem foto do canhoto anexada.</p>}
            {proof.packageUrl && <div><div className="muted" style={{ margin: '8px 0 4px' }}>Foto do pacote</div><img className="preview" src={proof.packageUrl} alt="Foto do pacote" /></div>}
            {proof.signatureUrl && <div><div className="muted" style={{ margin: '8px 0 4px' }}>Assinatura</div><img className="preview" src={proof.signatureUrl} alt="Assinatura do recebedor" style={{ background: '#fff', maxHeight: 100 }} /></div>}
          </article>
        ))}
      </div>
    </div>
  )
}
