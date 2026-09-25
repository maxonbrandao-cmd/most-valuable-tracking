import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFixedPostAttendance, attendanceTime, attendanceToday } from './useFixedPostAttendance'

const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const date = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sem término'
export default function FixedPostAttendance() {
  const { posts, records, loading, busy, error, message, record, refresh } = useFixedPostAttendance()
  const open = records.find(a => !a.checked_out_at)
  const today = attendanceToday()
  return <View style={styles.section}>
    <Text style={styles.title}>Meus postos fixos</Text>
    <Pressable accessibilityRole="button" disabled={loading || busy} onPress={refresh} style={styles.button}><Text>Atualizar postos</Text></Pressable>
    {!!message && <Text style={styles.text}>{message}</Text>}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.text}>Carregando atendimentos...</Text> : <>
      {open && <View style={styles.card}>
        <Text style={styles.title}>Em atendimento: {open.post_name}</Text>
        <Text style={styles.text}>Entrada: {attendanceTime(open.checked_in_at)}</Text>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void record(open.fixed_post_id, 'check_out')}>
          <Text>{busy ? 'Registrando...' : 'Registrar saída (check-out)'}</Text>
        </Pressable>
      </View>}
      {!posts.length && !error && <Text style={styles.text}>Nenhum posto fixo vinculado.</Text>}
      {posts.map(post => {
        const done = records.some(a => a.fixed_post_id === post.id && a.service_date === today)
        const disabled = busy || !!open || !post.active || !!error
        return <View key={`${post.id}:${post.start_date}:${post.end_date}`} style={styles.card}>
          <Text style={styles.title}>{post.name}</Text><Text style={styles.text}>{post.client_name}</Text>
          <Text style={styles.text}>{post.active ? 'Ativo' : 'Pausado'} • {[...post.weekdays].sort((a,b)=>a-b).map(day=>days[day-1]).join(', ')}</Text>
          <Text style={styles.text}>{post.start_time.slice(0,5)} às {post.end_time.slice(0,5)}</Text>
          <Text style={styles.text}>Alocação: {date(post.start_date)} — {date(post.end_date)}</Text>
          {done ? <Text style={styles.text}>Atendimento de hoje já registrado.</Text> : <Pressable accessibilityRole="button"
            disabled={disabled} style={[styles.button, disabled && styles.disabled]} onPress={() => void record(post.id, 'check_in')}>
            <Text>{busy ? 'Registrando...' : 'Registrar entrada (check-in)'}</Text>
          </Pressable>}
        </View>
      })}
      <Text style={styles.title}>Registros dos últimos 30 dias</Text>
      {records.map(a => <View key={a.id} style={styles.card}>
        <Text style={styles.text}>{a.post_name}</Text>
        <Text style={styles.text}>Entrada: {attendanceTime(a.checked_in_at)}</Text>
        <Text style={styles.text}>Saída: {a.checked_out_at ? attendanceTime(a.checked_out_at) : 'Em aberto'}</Text>
      </View>)}
    </>}
  </View>
}
const styles = StyleSheet.create({
  section: { marginVertical: 16, gap: 12 },
  card: { padding: 14, backgroundColor: '#172436', borderRadius: 12, gap: 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  text: { color: '#e2e8f0' }, error: { color: '#fca5a5' },
  button: { padding: 12, backgroundColor: '#e7bc5a', borderRadius: 8, alignItems: 'center' },
  disabled: { opacity: 0.45 },
})
