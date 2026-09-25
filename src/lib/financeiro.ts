import { supabase } from './supabase'

export type FinancialType = 'receita' | 'despesa'
export type FinancialStatus = 'pendente' | 'pago' | 'cancelado'
export type FinancialEntry = {
  id: string; company_id: string; type: FinancialType; status: FinancialStatus
  source: string; category: string; description: string; amount: number
  transaction_date: string; due_date: string | null; updated_at: string
  local_import_key: string | null; delivery_id: string | null
}
export type FinancialCategory = { id: string; name: string; active: boolean; updated_at: string }
export type FinancialInput = {
  type: FinancialType; status: FinancialStatus; category: string; description: string
  amount: number; transaction_date: string; due_date: string | null; local_import_key?: string | null
}
export function financialToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function parseFinancialAmount(text: string) {
  const normalized = text.trim().replace(/\s/g, '')
  const value = normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Informe um valor positivo, por exemplo 150,50.')
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) throw new Error('Valor inválido ou acima do limite permitido.')
  return amount
}
export async function financialCatalog() {
  const { data, error } = await supabase.rpc('prepare_financial_catalog')
  if (error) throw error
  return data as { categories: FinancialCategory[]; imported: string[] }
}
export async function financialEntries(companyId: string, from: string, to: string) {
  const rows: FinancialEntry[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('financial_transactions')
      .select('id,company_id,type,status,source,category,description,amount,transaction_date,due_date,updated_at,local_import_key,delivery_id')
      .eq('company_id', companyId).gte('transaction_date', from).lte('transaction_date', to)
      .order('transaction_date', { ascending: false }).order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...((data || []) as FinancialEntry[]))
    if (!data || data.length < 500) return rows
  }
}
export async function saveFinancialEntry(input: FinancialInput, original?: FinancialEntry | null) {
  const { data, error } = await supabase.rpc('save_financial_entry', {
    p_entry: input, p_id: original?.id ?? null, p_expected: original?.updated_at ?? null,
  })
  if (error) throw error
  return data as FinancialEntry
}
export async function saveFinancialCategory(name: string, original?: FinancialCategory | null, active = true) {
  const { error } = await supabase.rpc('save_financial_category', {
    p_name: name.trim(), p_id: original?.id ?? null, p_active: active, p_expected: original?.updated_at ?? null,
  })
  if (error) throw error
}
