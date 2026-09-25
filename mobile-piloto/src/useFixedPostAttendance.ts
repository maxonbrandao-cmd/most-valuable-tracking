import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type FixedPost = {
  id: string; name: string; client_name: string; active: boolean
  weekdays: number[]; start_date: string; end_date: string | null
  start_time: string; end_time: string
}
export type Attendance = {
  id: string; fixed_post_id: string; post_name: string; service_date: string
  checked_in_at: string; checked_out_at: string | null
}
export function useFixedPostAttendance() {
  const [posts, setPosts] = useState<FixedPost[]>([])
  const [records, setRecords] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    async function load() {
      try {
        const [p, a] = await Promise.all([
          supabase.rpc('list_my_driver_fixed_posts'),
          supabase.rpc('list_my_fixed_post_attendances'),
        ])
        if (p.error) throw p.error
        if (a.error) throw a.error
        if (!Array.isArray(p.data) || !Array.isArray(a.data)) throw new Error('Resposta inválida.')
        if (!cancelled) {
          setPosts(p.data as FixedPost[])
          setRecords(a.data as Attendance[])
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Não foi possível carregar os atendimentos.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [revision])
  async function record(postId: string, action: 'check_in' | 'check_out') {
    if (lock.current || loading) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error: saveError } = await supabase.rpc('record_my_fixed_post_attendance', {
        p_post_id: postId, p_action: action,
      })
      if (saveError) throw saveError
      if (mounted.current) {
        setMessage('Registro confirmado.')
        setRevision(value => value + 1)
      }
    } catch (e: any) {
      if (mounted.current) setError(e?.message || 'Não foi possível registrar o atendimento.')
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return { posts, records, loading, busy, error, message, record,
    refresh: () => { setMessage(''); setRevision(value => value + 1) } }
}
export function attendanceTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
export function attendanceToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
