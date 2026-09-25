type ScheduledDelivery = {
  status: string
  started_at: string | null
  scheduled_at: string | null
  schedule_date: string | null
}

export function deliveryDay(value: string | Date): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function deliverySections<T extends ScheduledDelivery>(rows: T[], today: string) {
  const current: T[] = [], upcoming: T[] = [], previous: T[] = []
  for (const row of rows) {
    const day = row.schedule_date || (row.scheduled_at ? deliveryDay(row.scheduled_at) : '')
    if (row.started_at || row.status !== 'pendente' || !day || day === today) current.push(row)
    else if (day > today) upcoming.push(row)
    else previous.push(row)
  }
  upcoming.sort((a, b) => {
    const dayA = a.schedule_date || (a.scheduled_at ? deliveryDay(a.scheduled_at) : '')
    const dayB = b.schedule_date || (b.scheduled_at ? deliveryDay(b.scheduled_at) : '')
    return dayA.localeCompare(dayB) || (a.scheduled_at || '').localeCompare(b.scheduled_at || '')
  })
  return [
    { title: 'Hoje e em andamento', rows: current, empty: 'Nenhuma corrida para hoje ou em andamento.' },
    { title: 'Próximas corridas', rows: upcoming, empty: 'Nenhuma corrida futura programada.' },
    { title: 'Pendentes anteriores', rows: previous, empty: '' },
  ].filter(section => section.title !== 'Pendentes anteriores' || section.rows.length > 0)
}
