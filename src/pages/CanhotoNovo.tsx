import { FormEvent, PointerEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../context'
import { visibleEntregas } from '../lib/scope'

export default function CanhotoNovo() {
  const { state, addCanhoto } = useStore()
  const user = state.users.find((u) => u.id === state.sessionUserId)!
  const navigate = useNavigate()
  const abertas = visibleEntregas(state, user).filter((e) => e.status !== 'entregue' && e.status !== 'cancelado')
  const [entregaId, setEntregaId] = useState(abertas[0]?.id ?? '')
  const [receiverName, setReceiverName] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const resize = () => {
      const r = c.getBoundingClientRect()
      c.width = r.width * 2
      c.height = r.height * 2
      ctx.scale(2, 2)
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
    }
    resize()
  }, [])

  function pos(ev: PointerEvent<HTMLCanvasElement>) {
    const r = ev.currentTarget.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }

  function down(ev: PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = ev.currentTarget.getContext('2d')
    const p = pos(ev)
    ctx?.beginPath()
    ctx?.moveTo(p.x, p.y)
  }
  function move(ev: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = ev.currentTarget.getContext('2d')
    const p = pos(ev)
    ctx?.lineTo(p.x, p.y)
    ctx?.stroke()
  }
  function up() {
    drawing.current = false
  }

  function onPhoto(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!entregaId) return
    addCanhoto({
      entregaId,
      receiverName,
      notes,
      photoDataUrl: photo,
      signatureDataUrl: canvasRef.current?.toDataURL('image/png') ?? '',
    })
    navigate('/canhotos')
  }

  if (user.role === 'cliente') {
    return <p>Apenas a empresa e o piloto registram canhotos.</p>
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Registrar canhoto</h3>
      <label className="field">
        <span>Entrega</span>
        <select value={entregaId} onChange={(e) => setEntregaId(e.target.value)} required>
          {abertas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.destination} · {x.origin}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Recebido por</span>
        <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required />
      </label>
      <label className="field">
        <span>Observações</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="field">
        <span>Foto do canhoto / pacote</span>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      {photo ? <img className="preview" src={photo} alt="Prévia" /> : null}
      <div className="field">
        <span>Assinatura do recebedor</span>
        <canvas
          ref={canvasRef}
          className="sig-box"
          style={{ width: '100%' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>
      <button className="btn btn-gold" type="submit" disabled={!abertas.length}>
        Salvar e marcar como entregue
      </button>
    </form>
  )
}
