import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../context'
import { supabase } from '../lib/supabase'
import {
  listDeliveryOptions,
  type DeliveryClient,
  type DeliveryDriver,
} from '../lib/entregas'

type ProgramacaoTab = 'recorrentes' | 'postos'

type Row = {
  id: string
  name: string
  client_id: string
  default_driver_id: string | null
  origin_address: string
  destination_address: string
  weekdays: number[]
  start_date: string
  end_date: string | null
  scheduled_time: string
  runs_per_day: number
  active: boolean
}

type FixedPostRow = {
    id: string
    client_id: string
    name: string
    start_date: string
    end_date: string | null
    weekdays: number[]
    start_time: string
    end_time: string
    active: boolean
    notes: string | null
  }

type FixedPostAssignmentRow = {
  fixed_post_id: string
  driver_id: string
  active: boolean
  company_id: string
  start_date: string
  end_date: string | null
}

type RepeatType =
  | 'everyday'
  | 'weekdays'
  | 'weekly'
  | 'custom'

type EndMode = 'never' | 'date'

const days = [
  { value: '1', short: 'Seg', full: 'Segunda' },
  { value: '2', short: 'Ter', full: 'Terça' },
  { value: '3', short: 'Qua', full: 'Quarta' },
  { value: '4', short: 'Qui', full: 'Quinta' },
  { value: '5', short: 'Sex', full: 'Sexta' },
  { value: '6', short: 'Sáb', full: 'Sábado' },
  { value: '7', short: 'Dom', full: 'Domingo' },
]

function todayIso() {
  const now = new Date()
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000,
  )

  return local.toISOString().slice(0, 10)
}

function weekdayFromDate(date: string) {
  if (!date) return '1'

  const parsed = new Date(`${date}T12:00:00`)
  const jsDay = parsed.getDay()

  // JS: domingo = 0
  // ISO: segunda = 1 ... domingo = 7
  return jsDay === 0 ? '7' : String(jsDay)
}

function formatDate(date: string | null) {
  if (!date) return 'Sem término'

  return new Intl.DateTimeFormat('pt-BR').format(
    new Date(`${date}T12:00:00`),
  )
}

function formatTime(time: string) {
  return time?.slice(0, 5) || '--:--'
}

function describeWeekdays(weekdays: number[]) {
  const normalized = [...weekdays].sort((a, b) => a - b)

  if (
    normalized.length === 7 &&
    normalized.every((value, index) => value === index + 1)
  ) {
    return 'Todos os dias'
  }

  if (
    normalized.length === 5 &&
    normalized.every((value, index) => value === index + 1)
  ) {
    return 'Segunda a sexta'
  }

  return normalized
    .map(
      value =>
        days.find(day => Number(day.value) === value)?.short,
    )
    .filter(Boolean)
    .join(', ')
}

export default function Programacoes() {
  const { state } = useStore()

  const user = state.users.find(
    item => item.id === state.sessionUserId,
  )!

  const [activeTab, setActiveTab] = useState<ProgramacaoTab>('recorrentes')

  const cid = user.companyId

  const [rows, setRows] = useState<Row[]>([])
  const [fixedPosts, setFixedPosts] = useState<FixedPostRow[]>([])
  const [fixedPostAssignments, setFixedPostAssignments] =
    useState<FixedPostAssignmentRow[]>([])
  const [assignmentsError, setAssignmentsError] = useState('')
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [postEndMode, setPostEndMode] = useState<EndMode>('never')

  const [postForm, setPostForm] = useState({
    name: '',
    client: '',
    start: todayIso(),
    end: '',
    startTime: '08:00',
    endTime: '18:00',
    week: ['1', '2', '3', '4', '5'],
    drivers: [] as string[],
    notes: '',
    })

  const [clients, setClients] = useState<DeliveryClient[]>([])
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])

  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null)

  const [repeatType, setRepeatType] =
    useState<RepeatType>('weekdays')

  const [endMode, setEndMode] =
    useState<EndMode>('never')

  const [f, setF] = useState({
    name: '',
    client: '',
    driver: '',
    origin: '',
    destination: '',
    start: todayIso(),
    end: '',
    time: '09:00',
    qty: '1',
    week: ['1', '2', '3', '4', '5'],
  })

  async function load() {
    if (!supabase || !cid) return

    const [r, p, o, a] = await Promise.all([
      supabase
        .from('delivery_schedules')
        .select(
          `
            id,
            name,
            client_id,
            default_driver_id,
            origin_address,
            destination_address,
            weekdays,
            start_date,
            end_date,
            scheduled_time,
            runs_per_day,
            active
          `,
        )
        .eq('company_id', cid)
        .order('created_at', { ascending: false }),

      supabase
        .from('fixed_posts')
        .select(
          `
            id,
            client_id,
            name,
            start_date,
            end_date,
            weekdays,
            start_time,
            end_time,
            active,
            notes
          `,
        )
        .eq('company_id', cid)
        .order('created_at', { ascending: false }),

      listDeliveryOptions(cid),
      supabase
        .from('fixed_post_assignments')
        .select('fixed_post_id, driver_id, active, company_id, start_date, end_date')
        .eq('company_id', cid)
        .eq('active', true),
    ])

    if (r.error) throw r.error
    if (p.error) throw p.error

    setRows((r.data as Row[]) || [])
    setFixedPosts((p.data as FixedPostRow[]) || [])

    setClients(o.clients)
    setDrivers(o.drivers)
    setFixedPostAssignments(a.error ? [] : (a.data as FixedPostAssignmentRow[]) || [])
    setAssignmentsError(
      a.error ? 'Não foi possível carregar os pilotos alocados.' : '',
    )
  }

  useEffect(() => {
    void load().catch(e =>
      setErr(
        e instanceof Error
          ? e.message
          : 'Não foi possível carregar as programações.',
      ),
    )
  }, [])

  const selectedClient = useMemo(
    () =>
      clients.find(client => client.id === f.client),
    [clients, f.client],
  )

  const assignedDriverNamesByPost = useMemo(() => {
    const driverNames = new Map(drivers.map(driver => [driver.id, driver.name]))
    const assignmentsByPost = new Map<string, Map<string, string>>()

    for (const assignment of fixedPostAssignments) {
      if (!assignment.active || assignment.company_id !== cid) continue

      let assignedDrivers = assignmentsByPost.get(assignment.fixed_post_id)
      if (!assignedDrivers) {
        assignedDrivers = new Map<string, string>()
        assignmentsByPost.set(assignment.fixed_post_id, assignedDrivers)
      }
      assignedDrivers.set(
        assignment.driver_id,
        driverNames.get(assignment.driver_id) || 'Piloto não encontrado',
      )
    }

    return new Map(
      Array.from(assignmentsByPost, ([postId, assignedDrivers]) => [
        postId,
        Array.from(assignedDrivers.values()).join(', '),
      ]),
    )
  }, [fixedPostAssignments, drivers, cid])

  if (user.role !== 'dono') {
    return <Navigate to="/entregas" replace />
  }

  function applyRepeatType(type: RepeatType) {
    setRepeatType(type)

    if (type === 'everyday') {
      setF(current => ({
        ...current,
        week: ['1', '2', '3', '4', '5', '6', '7'],
      }))
      return
    }

    if (type === 'weekdays') {
      setF(current => ({
        ...current,
        week: ['1', '2', '3', '4', '5'],
      }))
      return
    }

    if (type === 'weekly') {
      setF(current => ({
        ...current,
        week: [weekdayFromDate(current.start)],
      }))
      return
    }

    // Personalizado mantém os dias que já estavam selecionados.
  }

  function changeStartDate(value: string) {
    setF(current => ({
      ...current,
      start: value,
      week:
        repeatType === 'weekly'
          ? [weekdayFromDate(value)]
          : current.week,
    }))
  }

  function toggleWeekday(value: string) {
    setF(current => {
      const exists = current.week.includes(value)

      return {
        ...current,
        week: exists
          ? current.week.filter(day => day !== value)
          : [...current.week, value].sort(
              (a, b) => Number(a) - Number(b),
            ),
      }
    })
  }

  function togglePostWeekday(value: string) {
    setPostForm(current => {
      const exists = current.week.includes(value)

      return {
        ...current,
        week: exists
          ? current.week.filter(day => day !== value)
          : [...current.week, value].sort(
              (a, b) => Number(a) - Number(b),
            ),
      }
    })
  }

  function togglePostDriver(driverId: string) {
    setPostForm(current => {
      const exists = current.drivers.includes(driverId)

      return {
        ...current,
        drivers: exists
          ? current.drivers.filter(id => id !== driverId)
          : [...current.drivers, driverId],
      }
    })
  }

  function resetForm() {
    setRepeatType('weekdays')
    setEndMode('never')

    setF({
      name: '',
      client: '',
      driver: '',
      origin: '',
      destination: '',
      start: todayIso(),
      end: '',
      time: '09:00',
      qty: '1',
      week: ['1', '2', '3', '4', '5'],
    })
  }

  async function save(e: FormEvent) {
    e.preventDefault()

    if (!supabase || !cid || saving) return

    setErr('')
    setMsg('')

    if (f.week.length === 0) {
      setErr('Selecione pelo menos um dia da semana.')
      return
    }

    if (endMode === 'date' && !f.end) {
      setErr('Informe a data de término da programação.')
      return
    }

    if (
      endMode === 'date' &&
      f.end &&
      f.end < f.start
    ) {
      setErr(
        'A data de término não pode ser anterior à data de início.',
      )
      return
    }

    const qty = Number(f.qty)

    if (!Number.isInteger(qty) || qty < 1) {
      setErr('Informe uma quantidade válida de corridas por dia.')
      return
    }

    setSaving(true)

    try {
      const r = await supabase
        .from('delivery_schedules')
        .insert({
          company_id: cid,
          name: f.name.trim(),
          client_id: f.client,
          default_driver_id: f.driver || null,
          origin_address: f.origin.trim(),
          destination_address: f.destination.trim(),
          weekdays: f.week.map(Number),
          start_date: f.start,
          end_date:
            endMode === 'never'
              ? null
              : f.end,
          scheduled_time: f.time,
          runs_per_day: qty,
        })
        .select('id')
        .single()

      if (r.error) throw r.error

      const g = await supabase.rpc(
        'generate_schedule_deliveries',
        {
          p_schedule_id: r.data.id,
          p_from_date: f.start,
        },
      )

      if (g.error) throw g.error

      const created = Number(g.data || 0)

      setMsg(
        created === 1
          ? 'Programação criada. 1 corrida foi gerada.'
          : `Programação criada. ${created} corridas foram geradas.`,
      )

      resetForm()
      await load()
    } catch (e: any) {
        console.error('Erro ao salvar programação:', e)

        setErr(
          e?.message ||
          e?.details ||
          e?.hint ||
          'Não foi possível salvar a programação.'
        )
      } finally {
      setSaving(false)
    }
  }

  async function toggleFixedPost(post: FixedPostRow) {
    if (!supabase || !cid || updatingPostId) return

    setErr('')
    setMsg('')
    setUpdatingPostId(post.id)

    try {
      const result = await supabase
        .from('fixed_posts')
        .update({ active: !post.active })
        .eq('company_id', cid)
        .eq('id', post.id)
        .select('id, active')
        .single()

      if (result.error) throw result.error
      if (!result.data) throw new Error('Não foi possível atualizar o posto fixo.')

      const updatedPost = result.data
      setFixedPosts(current =>
        current.map(item =>
          item.id === updatedPost.id
            ? { ...item, active: updatedPost.active }
            : item,
        ),
      )
      setMsg(
        updatedPost.active
          ? 'Posto fixo reativado com sucesso.'
          : 'Posto fixo pausado com sucesso.',
      )
    } catch (e: any) {
      setErr(e?.message || 'Não foi possível atualizar o posto fixo.')
    } finally {
      setUpdatingPostId(null)
    }
  }

  function cancelPostEdit() {
    if (saving) return
    setEditingPostId(null)
    setPostEndMode('never')
    setPostForm({
      name: '', client: '', start: todayIso(), end: '',
      startTime: '08:00', endTime: '18:00',
      week: ['1', '2', '3', '4', '5'], drivers: [], notes: '',
    })
    setErr('')
    setMsg('')
  }

  function editFixedPost(post: FixedPostRow) {
    if (saving || updatingPostId || assignmentsError) return
    setEditingPostId(post.id)
    setPostEndMode(post.end_date ? 'date' : 'never')
    setPostForm({
      name: post.name,
      client: post.client_id,
      start: post.start_date,
      end: post.end_date || '',
      startTime: post.start_time.slice(0, 5),
      endTime: post.end_time.slice(0, 5),
      week: post.weekdays.map(String),
      drivers: Array.from(new Set(fixedPostAssignments
        .filter(a => a.company_id === cid && a.fixed_post_id === post.id && a.active)
        .map(a => a.driver_id))),
      notes: post.notes || '',
    })
    setErr('')
    setMsg('')
    document.getElementById('fixed-post-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function saveFixedPostEdit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !cid || !editingPostId || saving || updatingPostId) return
    setErr('')
    setMsg('')
    if (!postForm.name.trim()) {
      setErr('Informe o nome do posto.')
      return
    }

    if (!postForm.client) {
      setErr('Selecione o cliente / parceiro.')
      return
    }

    if (postForm.week.length === 0) {
      setErr('Selecione pelo menos um dia de atendimento.')
      return
    }

    if (postForm.drivers.length === 0) {
      setErr('Selecione pelo menos um piloto.')
      return
    }

    if (postForm.endTime <= postForm.startTime) {
      setErr('O fim do expediente deve ser posterior ao início.')
      return
    }

    if (postEndMode === 'date' && !postForm.end) {
      setErr('Informe a data final do posto.')
      return
    }

    if (
      postEndMode === 'date' &&
      postForm.end &&
      postForm.end < postForm.start
    ) {
      setErr('A data final não pode ser anterior à data de início.')
      return
    }


    setSaving(true)
    let postSaved = false
    try {
      // Read current allocations again so retrying a partial save does not duplicate them.
      const current = await supabase.from('fixed_post_assignments')
        .select('fixed_post_id, driver_id, active, company_id, start_date, end_date')
        .eq('company_id', cid).eq('fixed_post_id', editingPostId)
      if (current.error) throw current.error
      const existing = (current.data || []) as FixedPostAssignmentRow[]
      const endDate = postEndMode === 'never' ? null : postForm.end
      const result = await supabase.from('fixed_posts').update({
        name: postForm.name.trim(), client_id: postForm.client,
        start_date: postForm.start, end_date: endDate,
        start_time: postForm.startTime, end_time: postForm.endTime,
        weekdays: postForm.week.map(Number), notes: postForm.notes.trim() || null,
      }).eq('company_id', cid).eq('id', editingPostId).select('id').single()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Posto fixo não encontrado.')
      postSaved = true

      // Preserve the post's active/paused status and reuse existing driver links.
      for (const driverId of new Set(postForm.drivers)) {
        const links = existing.filter(a => a.driver_id === driverId)
        const values = { active: true, start_date: postForm.start, end_date: endDate }
        if (links.length > 0) {
          const hasActive = links.some(a => a.active)
          const updated = await supabase.from('fixed_post_assignments')
            .update(values).eq('company_id', cid).eq('fixed_post_id', editingPostId)
            .eq('driver_id', driverId).eq('active', hasActive).select('driver_id')
          if (updated.error) throw updated.error
          if (!updated.data?.length) throw new Error('Não foi possível atualizar a alocação do piloto.')
        } else {
          const inserted = await supabase.from('fixed_post_assignments').insert({
            ...values, company_id: cid, fixed_post_id: editingPostId, driver_id: driverId,
          }).select('driver_id').single()
          if (inserted.error) throw inserted.error
        }
      }
      const removed = Array.from(new Set(existing
        .filter(a => a.active && !postForm.drivers.includes(a.driver_id))
        .map(a => a.driver_id)))
      if (removed.length > 0) {
        const deactivated = await supabase.from('fixed_post_assignments')
          .update({ active: false }).eq('company_id', cid).eq('fixed_post_id', editingPostId)
          .eq('active', true).in('driver_id', removed).select('driver_id')
        if (deactivated.error) throw deactivated.error
        if (!removed.every(id => deactivated.data?.some(a => a.driver_id === id))) {
          throw new Error('Não foi possível remover todas as alocações selecionadas.')
        }
      }
      await load()
      setEditingPostId(null)
      setPostEndMode('never')
      setPostForm({
        name: '', client: '', start: todayIso(), end: '',
        startTime: '08:00', endTime: '18:00',
        week: ['1', '2', '3', '4', '5'], drivers: [], notes: '',
      })
      setMsg('Posto fixo atualizado com sucesso.')
    } catch (e: any) {
      const detail = e?.message || 'Não foi possível salvar a edição.'
      setErr(postSaved
        ? `Os dados do posto foram salvos, mas a atualização não foi concluída. Confira os pilotos e tente salvar novamente. ${detail}`
        : detail)
      if (postSaved) {
        try { await load() } catch { /* Keep the original save error visible. */ }
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveFixedPost(e: FormEvent) {
    e.preventDefault()

    if (!supabase || !cid || saving) return

    setErr('')
    setMsg('')

    if (!postForm.name.trim()) {
      setErr('Informe o nome do posto.')
      return
    }

    if (!postForm.client) {
      setErr('Selecione o cliente / parceiro.')
      return
    }

    if (postForm.week.length === 0) {
      setErr('Selecione pelo menos um dia de atendimento.')
      return
    }

    if (postForm.drivers.length === 0) {
      setErr('Selecione pelo menos um piloto.')
      return
    }

    if (postForm.endTime <= postForm.startTime) {
      setErr('O fim do expediente deve ser posterior ao início.')
      return
    }

    if (postEndMode === 'date' && !postForm.end) {
      setErr('Informe a data final do posto.')
      return
    }

    if (
      postEndMode === 'date' &&
      postForm.end &&
      postForm.end < postForm.start
    ) {
      setErr('A data final não pode ser anterior à data de início.')
      return
    }

    setSaving(true)

    try {
      const postResult = await supabase
        .from('fixed_posts')
        .insert({
          company_id: cid,
          client_id: postForm.client,
          name: postForm.name.trim(),
          start_date: postForm.start,
          end_date:
            postEndMode === 'never'
              ? null
              : postForm.end,
          weekdays: postForm.week.map(Number),
          start_time: postForm.startTime,
          end_time: postForm.endTime,
          active: true,
          notes: postForm.notes.trim() || null,
        })
        .select('id')
        .single()

      if (postResult.error) throw postResult.error

      const assignments = postForm.drivers.map(driverId => ({
        company_id: cid,
        fixed_post_id: postResult.data.id,
        driver_id: driverId,
        start_date: postForm.start,
        end_date:
          postEndMode === 'never'
            ? null
            : postForm.end,
        active: true,
      }))

      const assignmentResult = await supabase
        .from('fixed_post_assignments')
        .insert(assignments)

      if (assignmentResult.error) {
        // Evita deixar um posto sem pilotos caso a segunda etapa falhe.
        await supabase
          .from('fixed_posts')
          .delete()
          .eq('id', postResult.data.id)

        throw assignmentResult.error
      }

      setPostEndMode('never')

      setPostForm({
        name: '',
        client: '',
        start: todayIso(),
        end: '',
        startTime: '08:00',
        endTime: '18:00',
        week: ['1', '2', '3', '4', '5'],
        drivers: [],
        notes: '',
      })

      setMsg('Posto fixo criado com sucesso.')

      await load()
    } catch (e: any) {
      console.error('Erro ao criar posto fixo:', e)

      setErr(
        e?.message ||
          e?.details ||
          e?.hint ||
          'Não foi possível criar o posto fixo.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="programacoes-page">
      <div className="section-heading programacoes-heading">
        <div>
          <h3>Programações</h3>
          <p className="muted">
            Organize corridas recorrentes sem precisar cadastrá-las
            manualmente todos os dias.
          </p>
        </div>
      </div>

      {msg && (
        <div className="notice notice-ok">
          {msg}
        </div>
      )}

      {err && (
        <div className="notice notice-error">
          {err}
        </div>
      )}

    <div className="programacoes-tabs">
        <button
            type="button"
            className={`programacoes-tab ${
            activeTab === 'recorrentes' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('recorrentes')}
        >
            <strong>Corridas recorrentes</strong>
            <small>Entregas geradas automaticamente</small>
        </button>

        <button
            type="button"
            className={`programacoes-tab ${
            activeTab === 'postos' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('postos')}
        >
            <strong>Postos fixos</strong>
            <small>Pilotos alocados em clientes</small>
        </button>
        </div>

    {activeTab === 'recorrentes' && (
    <>
      <form
        className="card cadastro-form programacao-form"
        onSubmit={save}
      >
        <div className="programacao-form-header">
          <div>
            <h3>Nova programação</h3>
            <p className="muted">
              Defina cliente, rota e frequência da corrida.
            </p>
          </div>

          <span className="badge b-blue">
            Recorrente
          </span>
        </div>


        <div className="form-grid">
          <label className="field">
            <span>Nome da programação</span>

            <input
              required
              placeholder="Ex.: Coleta diária Farmácia Central"
              value={f.name}
              onChange={e =>
                setF({
                  ...f,
                  name: e.target.value,
                })
              }
            />
          </label>

          <label className="field">
            <span>Cliente</span>

            <select
              required
              value={f.client}
              onChange={e =>
                setF({
                  ...f,
                  client: e.target.value,
                })
              }
            >
              <option value="">
                Selecione
              </option>

              {clients.map(client => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.company_name ||
                    client.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field form-span-2">
            <span>Coleta</span>

            <input
              required
              placeholder="Endereço de coleta"
              value={f.origin}
              onChange={e =>
                setF({
                  ...f,
                  origin: e.target.value,
                })
              }
            />
          </label>

          <label className="field form-span-2">
            <span>Entrega</span>

            <input
              required
              placeholder="Endereço de entrega"
              value={f.destination}
              onChange={e =>
                setF({
                  ...f,
                  destination: e.target.value,
                })
              }
            />
          </label>

          <label className="field">
            <span>Piloto padrão</span>

            <select
              value={f.driver}
              onChange={e =>
                setF({
                  ...f,
                  driver: e.target.value,
                })
              }
            >
              <option value="">
                Distribuir depois
              </option>

              {drivers.map(driver => (
                <option
                  key={driver.id}
                  value={driver.id}
                >
                  {driver.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Corridas por dia</span>

            <input
              type="number"
              min="1"
              step="1"
              required
              value={f.qty}
              onChange={e =>
                setF({
                  ...f,
                  qty: e.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="programacao-section">
          <div className="programacao-section-title">
            <div>
              <strong>Repetição</strong>
              <p className="muted">
                Escolha em quais dias esta corrida acontece.
              </p>
            </div>
          </div>

          <div className="repeat-options">
            <button
              type="button"
              className={
                repeatType === 'everyday'
                  ? 'repeat-option active'
                  : 'repeat-option'
              }
              onClick={() =>
                applyRepeatType('everyday')
              }
            >
              <strong>Todos os dias</strong>
              <small>Segunda a domingo</small>
            </button>

            <button
              type="button"
              className={
                repeatType === 'weekdays'
                  ? 'repeat-option active'
                  : 'repeat-option'
              }
              onClick={() =>
                applyRepeatType('weekdays')
              }
            >
              <strong>Segunda a sexta</strong>
              <small>Dias úteis</small>
            </button>

            <button
              type="button"
              className={
                repeatType === 'weekly'
                  ? 'repeat-option active'
                  : 'repeat-option'
              }
              onClick={() =>
                applyRepeatType('weekly')
              }
            >
              <strong>Semanal</strong>
              <small>Mesmo dia toda semana</small>
            </button>

            <button
              type="button"
              className={
                repeatType === 'custom'
                  ? 'repeat-option active'
                  : 'repeat-option'
              }
              onClick={() =>
                applyRepeatType('custom')
              }
            >
              <strong>Personalizado</strong>
              <small>Escolher os dias</small>
            </button>
          </div>

          {repeatType === 'custom' && (
            <div className="weekday-selector">
              {days.map(day => {
                const checked =
                  f.week.includes(day.value)

                return (
                  <button
                    key={day.value}
                    type="button"
                    title={day.full}
                    className={
                      checked
                        ? 'weekday-button active'
                        : 'weekday-button'
                    }
                    onClick={() =>
                      toggleWeekday(day.value)
                    }
                  >
                    {day.short}
                  </button>
                )
              })}
            </div>
          )}

          {repeatType === 'weekly' && (
            <div className="programacao-info">
              A programação será repetida toda semana no mesmo
              dia da data de início.
            </div>
          )}
        </div>

        <div className="programacao-section">
          <div className="programacao-section-title">
            <div>
              <strong>Período e horário</strong>
              <p className="muted">
                Defina quando a programação começa e se possui
                uma data final.
              </p>
            </div>
          </div>

          <div className="programacao-period-grid">
            <label className="field">
              <span>Início</span>

              <input
                type="date"
                required
                value={f.start}
                onChange={e =>
                  changeStartDate(e.target.value)
                }
              />
            </label>

            <label className="field">
              <span>Horário</span>

              <input
                type="time"
                required
                value={f.time}
                onChange={e =>
                  setF({
                    ...f,
                    time: e.target.value,
                  })
                }
              />
            </label>
          </div>

          <div className="programacao-end">
            <span className="programacao-label">
              Término
            </span>

            <div className="end-options">
              <label
                className={
                  endMode === 'never'
                    ? 'end-option active'
                    : 'end-option'
                }
              >
                <input
                  type="radio"
                  name="schedule-end"
                  checked={endMode === 'never'}
                  onChange={() =>
                    setEndMode('never')
                  }
                />

                <div>
                  <strong>Nunca</strong>
                  <small>
                    A programação continua ativa até ser pausada.
                  </small>
                </div>
              </label>

              <label
                className={
                  endMode === 'date'
                    ? 'end-option active'
                    : 'end-option'
                }
              >
                <input
                  type="radio"
                  name="schedule-end"
                  checked={endMode === 'date'}
                  onChange={() =>
                    setEndMode('date')
                  }
                />

                <div>
                  <strong>Em uma data</strong>
                  <small>
                    Encerrar automaticamente.
                  </small>
                </div>
              </label>
            </div>

            {endMode === 'date' && (
              <label className="field programacao-end-date">
                <span>Data final</span>

                <input
                  type="date"
                  required
                  min={f.start}
                  value={f.end}
                  onChange={e =>
                    setF({
                      ...f,
                      end: e.target.value,
                    })
                  }
                />
              </label>
            )}
          </div>
        </div>

        <div className="programacao-preview">
          <div>
            <span>Resumo</span>

            <strong>
              {f.name || 'Nova programação'}
            </strong>
          </div>

          <div className="programacao-preview-items">
            <span>
              📅 {describeWeekdays(f.week.map(Number))}
            </span>

            <span>
              🕘 {formatTime(f.time)}
            </span>

            <span>
              🔁 {f.qty || '1'} corrida
              {Number(f.qty) === 1 ? '' : 's'}/dia
            </span>

            <span>
              🏁{' '}
              {endMode === 'never'
                ? 'Sem término'
                : f.end
                  ? `Até ${formatDate(f.end)}`
                  : 'Informe o término'}
            </span>
          </div>

          {selectedClient && (
            <small className="muted">
              Cliente:{' '}
              {selectedClient.company_name ||
                selectedClient.name}
            </small>
          )}
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-gold btn-inline"
            disabled={saving}
          >
            {saving
              ? 'Criando...'
              : 'Criar programação'}
          </button>
        </div>
      </form>

      <div className="section-heading programacoes-list-heading">
        <div>
          <h3>Programações recorrentes</h3>

          <p className="muted">
            {rows.length === 0
              ? 'Nenhuma programação cadastrada.'
              : `${rows.length} programação${
                  rows.length === 1 ? '' : 'ões'
                } cadastrada${
                  rows.length === 1 ? '' : 's'
                }.`}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card programacoes-empty">
          <strong>
            Nenhuma programação recorrente
          </strong>

          <p className="muted">
            Crie sua primeira programação usando o formulário
            acima.
          </p>
        </div>
      ) : (
        <div className="programacoes-list">
          {rows.map(row => (
            <article
              key={row.id}
              className="card programacao-card"
            >
              <div className="programacao-card-header">
                <div>
                  <strong className="programacao-card-name">
                    {row.name}
                  </strong>

                  <span className="muted">
                    {describeWeekdays(row.weekdays)} •{' '}
                    {formatTime(row.scheduled_time)}
                  </span>
                </div>

                <span
                  className={
                    row.active
                      ? 'badge b-ok'
                      : 'badge b-off'
                  }
                >
                  {row.active
                    ? 'Ativa'
                    : 'Pausada'}
                </span>
              </div>

              <div className="programacao-route">
                <div className="programacao-route-point">
                  <span className="programacao-route-dot start" />

                  <div>
                    <small>COLETA</small>
                    <strong>
                      {row.origin_address}
                    </strong>
                  </div>
                </div>

                <div className="programacao-route-line" />

                <div className="programacao-route-point">
                  <span className="programacao-route-dot end" />

                  <div>
                    <small>ENTREGA</small>
                    <strong>
                      {row.destination_address}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="programacao-card-footer">
                <span>
                  <small>Início</small>
                  <strong>
                    {formatDate(row.start_date)}
                  </strong>
                </span>

                <span>
                  <small>Término</small>
                  <strong>
                    {formatDate(row.end_date)}
                  </strong>
                </span>

                <span>
                  <small>Frequência</small>
                  <strong>
                    {row.runs_per_day} corrida
                    {row.runs_per_day === 1
                      ? ''
                      : 's'}
                    /dia
                  </strong>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
    )}
            {activeTab === 'postos' && (
            <>
            <form
  className="card cadastro-form programacao-form"
  id="fixed-post-form"
  onSubmit={editingPostId ? saveFixedPostEdit : saveFixedPost}
>
  <div className="programacao-form-header">
    <div>
      <h3>{editingPostId ? 'Editar posto fixo' : 'Novo posto fixo'}</h3>
      <p className="muted">
        Aloque pilotos a um cliente em dias e horários definidos.
      </p>
    </div>

    <span className="badge b-blue">Posto fixo</span>
  </div>

  <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
  <div className="form-grid">
    <label className="field">
      <span>Nome do posto</span>
      <input
        required
        placeholder="Ex.: Auto Peças ABC"
        value={postForm.name}
        onChange={e =>
          setPostForm({
            ...postForm,
            name: e.target.value,
          })
        }
      />
    </label>

    <label className="field">
      <span>Cliente / parceiro</span>
      <select
        required
        value={postForm.client}
        onChange={e =>
          setPostForm({
            ...postForm,
            client: e.target.value,
          })
        }
      >
        <option value="">Selecione</option>

        {clients.map(client => (
          <option key={client.id} value={client.id}>
            {client.company_name || client.name}
          </option>
        ))}
      </select>
    </label>
  </div>

  <div className="programacao-section">
    <div className="programacao-section-title">
      <div>
        <strong>Dias de atendimento</strong>
        <p className="muted">
          Selecione os dias em que o posto estará ativo.
        </p>
      </div>
    </div>

    <div className="weekday-selector">
      {days.map(day => {
        const checked = postForm.week.includes(day.value)

        return (
          <button
            key={day.value}
            type="button"
            title={day.full}
            className={
              checked
                ? 'weekday-button active'
                : 'weekday-button'
            }
            onClick={() => togglePostWeekday(day.value)}
          >
            {day.short}
          </button>
        )
      })}
    </div>
  </div>

  <div className="programacao-section">
    <div className="programacao-section-title">
      <div>
        <strong>Período e horário</strong>
        <p className="muted">
          Defina o período de alocação dos pilotos.
        </p>
      </div>
    </div>

    <div className="programacao-period-grid">
      <label className="field">
        <span>Data de início</span>
        <input
          type="date"
          required
          value={postForm.start}
          onChange={e =>
            setPostForm({
              ...postForm,
              start: e.target.value,
            })
          }
        />
      </label>

      <label className="field">
        <span>Início do expediente</span>
        <input
          type="time"
          required
          value={postForm.startTime}
          onChange={e =>
            setPostForm({
              ...postForm,
              startTime: e.target.value,
            })
          }
        />
      </label>

      <label className="field">
        <span>Fim do expediente</span>
        <input
          type="time"
          required
          value={postForm.endTime}
          onChange={e =>
            setPostForm({
              ...postForm,
              endTime: e.target.value,
            })
          }
        />
      </label>
    </div>

    <div className="programacao-end">
      <span className="programacao-label">Término</span>

      <div className="end-options">
        <label
          className={
            postEndMode === 'never'
              ? 'end-option active'
              : 'end-option'
          }
        >
          <input
            type="radio"
            name="post-end"
            checked={postEndMode === 'never'}
            onChange={() => setPostEndMode('never')}
          />

          <div>
            <strong>Nunca</strong>
            <small>
              O posto permanece ativo até ser pausado.
            </small>
          </div>
        </label>

        <label
          className={
            postEndMode === 'date'
              ? 'end-option active'
              : 'end-option'
          }
        >
          <input
            type="radio"
            name="post-end"
            checked={postEndMode === 'date'}
            onChange={() => setPostEndMode('date')}
          />

          <div>
            <strong>Em uma data</strong>
            <small>Encerrar automaticamente.</small>
          </div>
        </label>
      </div>

      {postEndMode === 'date' && (
        <label className="field programacao-end-date">
          <span>Data final</span>
          <input
            type="date"
            required
            min={postForm.start}
            value={postForm.end}
            onChange={e =>
              setPostForm({
                ...postForm,
                end: e.target.value,
              })
            }
          />
        </label>
      )}
    </div>
  </div>

  <div className="programacao-section">
    <div className="programacao-section-title">
      <div>
        <strong>Pilotos alocados</strong>
        <p className="muted">
          Selecione um ou mais pilotos para este posto.
        </p>
      </div>
    </div>

    <div className="weekday-selector">
      {drivers.map(driver => {
        const checked =
          postForm.drivers.includes(driver.id)

        return (
          <button
            key={driver.id}
            type="button"
            className={
              checked
                ? 'weekday-button active'
                : 'weekday-button'
            }
            onClick={() =>
              togglePostDriver(driver.id)
            }
          >
            {driver.name}
          </button>
        )
      })}
    </div>
  </div>

  <label className="field">
    <span>Observações</span>
    <textarea
      placeholder="Informações adicionais sobre o posto..."
      value={postForm.notes}
      onChange={e =>
        setPostForm({
          ...postForm,
          notes: e.target.value,
        })
      }
    />
  </label>

  <div className="form-actions">
    <button
    type="submit"
    className="btn btn-gold btn-inline"
    disabled={saving}
    >
    {saving ? 'Salvando...' : editingPostId ? 'Salvar alterações' : 'Criar posto fixo'}
    </button>
    {editingPostId && (
      <button type="button" className="btn btn-inline" disabled={saving} onClick={cancelPostEdit}>
        Cancelar edição
      </button>
    )}
  </div>
  </fieldset>
</form>

    <div className="section-heading programacoes-list-heading">

      <div>

        <h3>Postos fixos</h3>

        <p className="muted">
          {fixedPosts.length === 0
            ? 'Nenhum posto fixo cadastrado.'
            : `${fixedPosts.length} posto${
                fixedPosts.length === 1 ? '' : 's'
              } cadastrado${
                fixedPosts.length === 1 ? '' : 's'
              }.`}
        </p>
      </div>
    </div>

    {fixedPosts.length === 0 ? (
      <div className="card programacoes-empty">
        <strong>Nenhum posto fixo</strong>

        <p className="muted">
          Os postos fixos cadastrados aparecerão aqui.
        </p>
      </div>
    ) : (
      <div className="programacoes-list">
        {fixedPosts.map(post => (
          <article
            key={post.id}
            className="card programacao-card"
          >
            <div className="programacao-card-header">
              <div>
                <strong className="programacao-card-name">
                  {post.name}
                </strong>

                <span className="muted">
                  {describeWeekdays(post.weekdays)} •{' '}
                  {formatTime(post.start_time)} às{' '}
                  {formatTime(post.end_time)}
                </span>
              </div>

              <span
                className={
                  post.active
                    ? 'badge b-ok'
                    : 'badge b-off'
                }
              >
                {post.active ? 'Ativo' : 'Pausado'}
              </span>
            </div>

            <div className="programacao-section">
              <strong>Pilotos alocados</strong>
              <p className="muted">
                {assignmentsError ||
                  assignedDriverNamesByPost.get(post.id) ||
                  'Nenhum piloto alocado.'}
              </p>
            </div>

            <div className="programacao-card-footer">
              <span>
                <small>Início</small>
                <strong>
                  {formatDate(post.start_date)}
                </strong>
              </span>

              <span>
                <small>Término</small>
                <strong>
                  {formatDate(post.end_date)}
                </strong>
              </span>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-inline"
                disabled={saving || updatingPostId !== null || !!assignmentsError}
                onClick={() => editFixedPost(post)}>
                Editar posto
              </button>
              <button
                type="button"
                className="btn btn-gold btn-inline"
                disabled={saving || updatingPostId !== null}
                aria-label={`${post.active ? 'Pausar' : 'Reativar'} posto ${post.name}`}
                onClick={() => void toggleFixedPost(post)}
              >
                {updatingPostId === post.id
                  ? 'Salvando...'
                  : post.active ? 'Pausar posto' : 'Reativar posto'}
              </button>
            </div>
          </article>
        ))}
      </div>
    )}
  </>
)}
    </div>
  )
}
