import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../context'
import { listDeliveries, type DeliveryRecord } from '../lib/entregas'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

function imageExtension(file: File) {
  const typeExtension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  return typeExtension[file.type] ?? ''
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a assinatura.')), 'image/png')
  })
}

export default function CanhotoNovo() {
  const { state } = useStore()
  const user = state.users.find(item => item.id === state.sessionUserId)!
  const companyId = user.companyId
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasSignature = useRef(false)
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  const [deliveryId, setDeliveryId] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverDocument, setReceiverDocument] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!companyId) throw new Error('Usuário sem empresa vinculada.')
        const result = await listDeliveries(companyId)
        if (!cancelled) {
          const open = result.filter(row => !['entregue', 'cancelado'].includes(row.status))
          setDeliveries(open)
          setDeliveryId(open[0]?.id ?? '')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar as entregas.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [companyId])

  function pointerPosition(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    canvas.setPointerCapture(event.pointerId)
    const point = pointerPosition(event)
    const context = canvas.getContext('2d')
    if (!context) return
    drawing.current = true
    hasSignature.current = true
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const point = pointerPosition(event)
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function clearSignature() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    hasSignature.current = false
  }

  function selectPhoto(file?: File) {
    setPhoto(file ?? null)
    if (!file) { setPhotoPreview(''); return }
    if (!imageExtension(file)) {
      setError('Use uma imagem JPG, PNG ou WEBP para anexar ao comprovante.')
      setPhoto(null)
      setPhotoPreview('')
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || !deliveryId || !companyId || !isSupabaseConfigured) return
    if (!receiverName.trim()) { setError('Informe quem recebeu a entrega.'); return }
    setSaving(true)
    setError('')
    const uploadedPaths: string[] = []
    const selectedDelivery = deliveries.find(row => row.id === deliveryId)
    try {
      if (!selectedDelivery) throw new Error('Selecione uma entrega disponível.')
      let photoPath: string | null = null
      let signaturePath: string | null = null
      const timestamp = Date.now()
      if (photo) {
        photoPath = `${companyId}/${deliveryId}/canhoto-${timestamp}.${imageExtension(photo)}`
        const { error: uploadError } = await supabase.storage.from('delivery-proofs').upload(photoPath, photo, { contentType: photo.type, upsert: false })
        if (uploadError) throw uploadError
        uploadedPaths.push(photoPath)
      }
      if (canvasRef.current && hasSignature.current) {
        const signature = await canvasBlob(canvasRef.current)
        signaturePath = `${companyId}/${deliveryId}/assinatura-${timestamp}.png`
        const { error: uploadError } = await supabase.storage.from('delivery-proofs').upload(signaturePath, signature, { contentType: 'image/png', upsert: false })
        if (uploadError) throw uploadError
        uploadedPaths.push(signaturePath)
      }

      const { error: registerError } = await supabase.rpc('register_delivery_proof', {
        p_delivery_id: deliveryId,
        p_receiver_name: receiverName.trim(),
        p_receiver_document: receiverDocument.trim() || null,
        p_notes: notes.trim() || null,
        p_lat: null,
        p_lng: null,
        p_canhoto_photo_path: photoPath,
        p_package_photo_path: null,
        p_signature_path: signaturePath,
        p_delivered_at: new Date().toISOString(),
      })
      if (registerError) throw registerError
      navigate('/canhotos')
    } catch (err) {
      if (uploadedPaths.length) await supabase.storage.from('delivery-proofs').remove(uploadedPaths)
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o canhoto.')
    } finally {
      setSaving(false)
    }
  }

  if (user.role === 'cliente') return <Navigate to="/canhotos" replace />

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 600 }}>
      <h3 style={{ marginTop: 0 }}>Registrar canhoto</h3>
      <p className="muted">O comprovante será salvo junto às entregas e aparecerá na lista de canhotos do site.</p>
      {loading ? <p role="status">Carregando entregas...</p> : <>
        <label className="field">
          <span>Entrega</span>
          <select value={deliveryId} onChange={event => setDeliveryId(event.target.value)} required disabled={!deliveries.length}>
            {deliveries.map(row => <option key={row.id} value={row.id}>{row.code} · {row.destination_address}</option>)}
          </select>
        </label>
        {!deliveries.length && <p className="muted">Não há entregas disponíveis para registrar canhoto.</p>}
      </>}
      <label className="field"><span>Recebido por</span><input value={receiverName} onChange={event => setReceiverName(event.target.value)} required /></label>
      <label className="field"><span>Documento de quem recebeu (opcional)</span><input value={receiverDocument} onChange={event => setReceiverDocument(event.target.value)} /></label>
      <label className="field"><span>Observações</span><textarea value={notes} onChange={event => setNotes(event.target.value)} /></label>
      <label className="field"><span>Foto do canhoto</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => selectPhoto(event.target.files?.[0])} /></label>
      {photoPreview && <img className="preview" src={photoPreview} alt="Prévia da foto do canhoto" />}
      <div className="field">
        <span>Assinatura do recebedor (opcional)</span>
        <canvas ref={canvasRef} width={900} height={240} className="sig-box" style={{ width: '100%', height: 160, cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} />
        <button type="button" className="btn btn-inline" onClick={clearSignature}>Limpar assinatura</button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <button className="btn btn-gold" type="submit" disabled={loading || saving || !deliveries.length}>{saving ? 'Salvando...' : 'Salvar canhoto e finalizar entrega'}</button>
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => navigate('/canhotos')}>Voltar</button>
    </form>
  )
}
