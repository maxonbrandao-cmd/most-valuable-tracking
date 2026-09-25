import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../context'
import {
  financialToday, financialCatalog, financialEntries, parseFinancialAmount,
  saveFinancialEntry, saveFinancialCategory,
  type FinancialEntry, type FinancialCategory, type FinancialStatus, type FinancialType,
} from '../lib/financeiro'
import './Financeiro.css'

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const displayDate = (value: string) => value.split('-').reverse().join('/')
const statusNames = { pago: 'Pago', pendente: 'Pendente', cancelado: 'Cancelado' }
type Draft = { type: FinancialType; status: FinancialStatus; category: string; description: string; amount: string; date: string; due: string }
const emptyDraft = (): Draft => ({ type: 'despesa', status: 'pago', category: '', description: '', amount: '', date: financialToday(), due: '' })

function FinancialPanel({ companyId }: { companyId: string }) {
  const initialDate = financialToday()
  const [from, setFrom] = useState(initialDate.slice(0, 7) + '-01')
  const [to, setTo] = useState(initialDate)
  const [typeFilter, setTypeFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [categoryFilter, setCategoryFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<FinancialEntry[]>([])
  const [categories, setCategories] = useState<FinancialCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [limit, setLimit] = useState(10)
  const [view, setView] = useState<'extrato' | 'categorias'>('extrato')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FinancialEntry | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [categoryEditing, setCategoryEditing] = useState<FinancialCategory | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const saveLock = useRef(false)
  const validPeriod = !!from && !!to && from <= to

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setRows([])
    async function load() {
      if (!validPeriod) { setLoading(false); return }
      try {
        const [catalog, entries] = await Promise.all([financialCatalog(), financialEntries(companyId, from, to)])
        if (!cancelled) { setCategories(catalog.categories); setRows(entries) }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Não foi possível carregar o financeiro.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [companyId, from, to, validPeriod, revision])
  useEffect(() => { setLimit(10) }, [from, to, typeFilter, statusFilter, categoryFilter, search])
  useEffect(() => { if (formOpen) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [formOpen, editing?.id])

  const filtered = useMemo(() => rows.filter(row =>
    (typeFilter === 'todos' || row.type === typeFilter) &&
    (statusFilter === 'todos' || row.status === statusFilter) &&
    (categoryFilter === 'todos' || row.category === categoryFilter) &&
    `${row.description} ${row.category}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')),
  ), [rows, typeFilter, statusFilter, categoryFilter, search])
  const totals = filtered.reduce((acc, row) => {
    if (row.status !== 'cancelado') acc[row.type] += Math.round(Number(row.amount) * 100)
    return acc
  }, { receita: 0, despesa: 0 })
  const filterCategories = Array.from(new Set([...categories.map(c => c.name), ...rows.map(r => r.category)])).sort((a,b) => a.localeCompare(b, 'pt-BR'))

  function openForm(row?: FinancialEntry) {
    setError(''); setMessage(''); setEditing(row || null)
    setDraft(row ? { type: row.type, status: row.status, category: row.category, description: row.description, amount: Number(row.amount).toFixed(2).replace('.', ','), date: row.transaction_date, due: row.due_date || '' }
      : { ...emptyDraft(), category: categories.find(c => c.active)?.name || '' })
    setFormOpen(true)
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (saveLock.current) return
    setError(''); setMessage('')
    try {
      const amount = parseFinancialAmount(draft.amount)
      if (!draft.description.trim() || !draft.date || !draft.category) throw new Error('Preencha descrição, data e categoria.')
      saveLock.current = true; setBusy(true)
      await saveFinancialEntry({ type: draft.type, status: draft.status, category: draft.category, description: draft.description.trim(), amount,
        transaction_date: draft.date, due_date: draft.due || null }, editing)
      setMessage('Lançamento salvo no Supabase.')
      setFormOpen(false); setEditing(null); setRevision(v => v + 1)
    } catch (e: any) { setError(e?.message || 'Não foi possível salvar o lançamento.') }
    finally { saveLock.current = false; setBusy(false) }
  }
  async function categorySave(e?: FormEvent, original = categoryEditing, active = categoryEditing?.active ?? true) {
    e?.preventDefault()
    if (saveLock.current) return
    setError(''); setMessage(''); saveLock.current = true; setBusy(true)
    try {
      await saveFinancialCategory(e ? categoryName : original?.name || '', original, active)
      setCategoryName(''); setCategoryEditing(null); setCategoryFilter('todos')
      setMessage('Categoria atualizada. Os lançamentos foram preservados.'); setRevision(v => v + 1)
    } catch (e: any) { setError(e?.message || 'Não foi possível salvar a categoria.') }
    finally { saveLock.current = false; setBusy(false) }
  }
  return <div className="finance-page">
    <div className="finance-header"><div><h3>Financeiro</h3><p className="muted">Lançamentos e categorias da empresa no Supabase.</p></div>
      <div className="finance-actions">
        <button type="button" className="btn btn-ghost" disabled={busy || loading} onClick={() => setRevision(v => v + 1)}>Atualizar</button>
        <button type="button" className="btn btn-gold" disabled={busy || loading || formOpen} onClick={() => openForm()}>Novo lançamento</button>
      </div>
    </div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {message && <div className="notice notice-ok" role="status">{message}</div>}
    <div className="finance-actions" aria-label="Seções do financeiro">
      {([['extrato','Extrato'], ['categorias','Categorias']] as const).map(([key,label]) =>
        <button key={key} type="button" className={view === key ? 'btn btn-gold' : 'btn btn-ghost'} aria-pressed={view === key}
          disabled={busy || formOpen} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {formOpen && <form ref={formRef} className="card finance-panel" onSubmit={save}>
      <h3>{editing ? 'Editar lançamento' : 'Novo lançamento'}</h3>
      {editing?.source === 'delivery' && <p className="muted">Receita gerada por entrega. O tipo permanece Receita para preservar o vínculo; os demais campos podem ser ajustados.</p>}
      <fieldset disabled={busy}><div className="finance-form-grid">
        <label className="field"><span>Tipo</span><select value={draft.type} disabled={editing?.source === 'delivery'} onChange={e=>setDraft({...draft,type:e.target.value as FinancialType})}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label>
        <label className="field"><span>Status</span><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as FinancialStatus})}>{Object.entries(statusNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field"><span>Categoria</span><select required value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}><option value="">Selecione</option>{categories.filter(c=>c.active || c.name === editing?.category).map(c=><option key={c.id} value={c.name}>{c.name}{c.active?'':' (inativa)'}</option>)}</select></label>
        <label className="field finance-wide"><span>Descrição</span><input required value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
        <label className="field"><span>Valor (R$)</span><input required inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label>
        <label className="field"><span>Data do lançamento</span><input required type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label>
        <label className="field"><span>Vencimento (opcional)</span><input type="date" value={draft.due} onChange={e=>setDraft({...draft,due:e.target.value})}/></label>
      </div></fieldset>
      <div className="finance-actions"><button type="submit" className="btn btn-gold" disabled={busy}>{busy?'Salvando...':'Salvar lançamento'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>setFormOpen(false)}>Cancelar edição</button></div>
    </form>}
    {view === 'extrato' && <>
      <div className="card finance-filters">
        <label className="field"><span>De</span><input type="date" value={from} disabled={busy || formOpen} onChange={e=>setFrom(e.target.value)}/></label>
        <label className="field"><span>Até</span><input type="date" value={to} disabled={busy || formOpen} onChange={e=>setTo(e.target.value)}/></label>
        <label className="field"><span>Buscar descrição ou categoria</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar lançamento"/></label>
        <label className="field"><span>Tipo</span><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="todos">Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></select></label>
        <label className="field"><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="todos">Todos</option>{Object.entries(statusNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field"><span>Categoria</span><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="todos">Todas</option>{filterCategories.map(name=><option key={name}>{name}</option>)}</select></label>
      </div>
      {!validPeriod && <div className="notice notice-error">Informe um período válido, com a data inicial anterior ou igual à final.</div>}
      <div className="finance-summary">{[['Receitas',brl(totals.receita/100),'finance-income'],['Despesas',brl(totals.despesa/100),'finance-expense'],['Saldo previsto',brl((totals.receita-totals.despesa)/100),''],['Lançamentos',String(filtered.length),'']].map(([label,value,cls])=><div className="card" key={label}><div className="label">{label}</div><div className={`value ${cls}`}>{loading || error ? '—' : value}</div></div>)}</div>
      <p className="muted">Totais dos filtros aplicados, excluindo cancelados. O saldo previsto inclui pendências; filtre por Pago para consultar apenas valores pagos.</p>
      <div className="card finance-panel"><h3>Extrato</h3>
        {loading ? <p role="status">Carregando lançamentos...</p> : error ? <p>Atualize a consulta após resolver o erro acima.</p> : !filtered.length ? <p className="finance-empty">Nenhum lançamento encontrado neste período e filtros.</p> : <>
          <div className="finance-table-wrap"><table className="table finance-table"><thead><tr><th>Data</th><th>Descrição</th><th>Tipo / categoria</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{filtered.slice(0,limit).map(row=><tr key={row.id}>
            <td>{displayDate(row.transaction_date)}{row.due_date && <div className="muted">Vence {displayDate(row.due_date)}</div>}</td>
            <td className="finance-description">{row.description}<div className="muted">{row.source==='delivery'?'Gerado por entrega':row.local_import_key?'Importado após revisão':'Manual'}</div></td>
            <td><span className={row.type==='receita'?'badge b-ok':'badge b-bad'}>{row.type==='receita'?'Receita':'Despesa'}</span><div>{row.category}</div></td>
            <td>{statusNames[row.status]}</td><td className="finance-money">{brl(Number(row.amount))}</td>
            <td><button type="button" className="btn btn-ghost btn-small" disabled={busy || formOpen} onClick={()=>openForm(row)}>Editar</button></td>
          </tr>)}</tbody></table></div>
          <div className="finance-pagination"><span className="muted">Exibindo {Math.min(limit,filtered.length)} de {filtered.length}</span>{limit<filtered.length && <button type="button" className="btn btn-inline" onClick={()=>setLimit(v=>v+10)}>Mostrar mais</button>}</div>
        </>}
      </div>
    </>}
    {view === 'categorias' && <div className="card finance-panel">
      <h3>Gerenciar categorias</h3><p className="muted">Renomear atualiza também os lançamentos da categoria. Inativar impede novos usos e preserva o histórico.</p>
      <form onSubmit={e=>void categorySave(e)}><label className="field"><span>{categoryEditing?'Novo nome da categoria':'Nova categoria'}</span><input required maxLength={80} disabled={busy} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/></label><div className="finance-actions" style={{marginTop:12}}><button className="btn btn-gold" disabled={busy || loading} type="submit">{categoryEditing?'Salvar nome':'Adicionar categoria'}</button>{categoryEditing && <button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>{setCategoryEditing(null);setCategoryName('')}}>Cancelar</button>}</div></form>
      <div className="finance-category-list">{categories.map(c=><div className="finance-category-item" key={c.id}><span>{c.name}{!c.active?' (inativa)':''}</span><div className="finance-actions"><button type="button" className="btn btn-ghost btn-small" disabled={busy || loading} onClick={()=>{setCategoryEditing(c);setCategoryName(c.name)}}>Renomear</button><button type="button" className="btn btn-ghost btn-small" disabled={busy || loading} onClick={()=>void categorySave(undefined,c,!c.active)}>{c.active?'Inativar':'Reativar'}</button></div></div>)}</div>
    </div>}
  </div>
}
export default function Financeiro() {
  const { state } = useStore()
  const user = state.users.find(item=>item.id===state.sessionUserId)
  if (user?.role !== 'dono') return <Navigate to="/" replace />
  if (!user.companyId) return <div className="notice notice-error">Seu acesso não está vinculado a uma empresa.</div>
  return <FinancialPanel key={`${user.id}:${user.companyId}`} companyId={user.companyId} />
}
