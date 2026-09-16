import { useEffect, useState } from 'react'

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './src/supabase'
import {
  clearActiveDeliveryId,
  isTracking,
  setActiveDeliveryId,
  startTracking,
  stopTracking,
} from './src/locationTask'

import * as Notifications from 'expo-notifications'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

type PilotProfile = {
  full_name: string
  role: string
  active: boolean
  driver_id: string | null
}

type DeliveryStatus =
  | 'pendente'
  | 'aceito'
  | 'coletado'
  | 'em_rota'
  | 'chegou'
  | 'entregue'
  | 'nao_entregue'
  | 'cancelado'

type PilotDelivery = {
  id: string
  code: string
  driver_id: string | null
  origin_address: string
  destination_address: string
  status: DeliveryStatus
  created_at: string
}

function confirmBackgroundPermission() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Localização em segundo plano',
      'Na próxima tela, escolha permitir o tempo todo. Isso mantém o GPS ativo durante as entregas, inclusive com a tela bloqueada.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    )
  })
}

async function notifyNewDelivery(delivery: PilotDelivery) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nova entrega disponível',
      body: `Entrega ${delivery.code} foi atribuída a você.`,
      data: {
        deliveryId: delivery.id,
      },
    },
    trigger:
      Platform.OS === 'android'
        ? {
            channelId: 'deliveries',
          }
        : null,
  })
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<PilotProfile | null>(null)
  const [email, setEmail] = useState('piloto1@maxempresa.com.br')
  const [password, setPassword] = useState('')
  const [tracking, setTracking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [deliveries, setDeliveries] = useState<PilotDelivery[]>([])
  const [activeDeliveryId, setActiveDeliveryState] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const permission = await Notifications.getPermissionsAsync()
  
      if (permission.status !== 'granted') {
        await Notifications.requestPermissionsAsync()
      }
  
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('deliveries', {
          name: 'Novas entregas',
          importance: Notifications.AndroidImportance.HIGH,
        })
      }
    })()
  }, [])

  useEffect(() => {
    if (!profile?.driver_id) return
  
    const driverId = profile.driver_id
  
    const channel = supabase
      .channel(`pilot-deliveries-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
        },
        async (payload) => {
          const delivery = payload.new as PilotDelivery | undefined
  
          if (!delivery || delivery.driver_id !== driverId) {
            return
          }
  
          const isNewDelivery = payload.eventType === 'INSERT'
  
          await loadDeliveries(driverId)
  
          if (isNewDelivery) {
            await notifyNewDelivery(delivery)
          }
        },
      )
      .subscribe()
  
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile?.driver_id])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setTracking(false)
      return
    }

    void Promise.all([
      supabase
        .from('profiles')
        .select('full_name, role, active, driver_id')
        .eq('user_id', session.user.id)
        .single(),
      isTracking(),
    ]).then(async ([profileResult, activeTracking]) => {
      if (profileResult.error) {
        setMessage(profileResult.error.message)
      } else {
        const nextProfile = profileResult.data as PilotProfile
      
        setProfile(nextProfile)
      
        if (nextProfile.driver_id) {
          await loadDeliveries(nextProfile.driver_id)
        }
      }
      
      setTracking(activeTracking)
    })
  }, [session])

  async function changeStatus(
    delivery: PilotDelivery,
    status: DeliveryStatus,
  ) {
    setLoading(true)
    setMessage('')
  
    try {
      const { error } = await supabase.rpc('set_delivery_status', {
        p_delivery_id: delivery.id,
        p_status: status,
      })
  
      if (error) throw error
  
      if (
        ['aceito', 'coletado', 'em_rota', 'chegou'].includes(status)
      ) {
        await setActiveDeliveryId(delivery.id)
        setActiveDeliveryState(delivery.id)
  
        console.log('Entrega definida como ativa:', delivery.id)
      }
  
      if (
        ['entregue', 'nao_entregue', 'cancelado'].includes(status)
      ) {
        await clearActiveDeliveryId()
        setActiveDeliveryState(null)
  
        console.log('Entrega ativa encerrada.')
      }
  
      if (profile?.driver_id) {
        await loadDeliveries(profile.driver_id)
      }
  
      setMessage(`Entrega ${delivery.code} atualizada.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a entrega.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadDeliveries(driverId: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        id,
        code,
        driver_id,
        origin_address,
        destination_address,
        status,
        created_at
      `)
      .eq('driver_id', driverId)
      .in('status', [
        'pendente',
        'aceito',
        'coletado',
        'em_rota',
        'chegou',
      ])
      .order('created_at', { ascending: false })
  
    if (error) {
      setMessage(error.message)
      return
    }
  
    setDeliveries((data ?? []) as PilotDelivery[])
  }

  async function login() {
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) setMessage('E-mail ou senha inválidos.')
    setLoading(false)
  }

  async function toggleTracking() {
    setLoading(true)
    setMessage('')
    try {
      if (tracking) {
        await stopTracking()
        setTracking(false)
        setMessage('Rastreamento encerrado.')
      } else {
        if (!(await confirmBackgroundPermission())) return
        await startTracking()
        setTracking(true)
        setMessage('Rastreamento iniciado com sucesso.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar o rastreamento.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await stopTracking()
    await supabase.auth.signOut()
  }

  if (loading && !session) {
    return <View style={styles.center}><ActivityIndicator color="#f5a623" size="large" /></View>
  }

  if (!session) { 
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.card}>
              <View style={styles.brandRow}>
                <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
                <View><Text style={styles.title}>MVT Piloto</Text><Text style={styles.subtitle}>Most Valuable Tracking</Text></View>
              </View>
              <Text style={styles.heading}>Entrar</Text>
              {!isSupabaseConfigured && <Text style={styles.error}>Configure o arquivo .env antes de iniciar.</Text>}
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <Text style={styles.label}>Senha</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
              {!!message && <Text style={styles.error}>{message}</Text>}
              <Pressable style={styles.primaryButton} onPress={login} disabled={loading || !isSupabaseConfigured}>
                {loading ? <ActivityIndicator color="#101827" /> : <Text style={styles.primaryText}>Acessar</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
          <View><Text style={styles.title}>MVT Piloto</Text><Text style={styles.subtitle}>Jornada de trabalho</Text></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{profile?.full_name ?? 'Piloto'}</Text>
          <Text style={styles.subtitle}>{session.user.email}</Text>
          {profile && (profile.role !== 'piloto' || !profile.driver_id || !profile.active) && (
            <Text style={styles.error}>Este usuário não possui um piloto ativo vinculado.</Text>
          )}
        </View>

        <View style={[styles.statusCard, tracking ? styles.statusOn : styles.statusOff]}>
              <Text style={styles.statusLabel}>
                {tracking ? 'GPS ATIVO' : 'GPS DESLIGADO'}
              </Text>

              <Text style={styles.statusText}>
                {tracking
                  ? 'A posição continuará sendo enviada com a tela bloqueada e enquanto outros aplicativos estiverem abertos.'
                  : 'Inicie o rastreamento ao começar a jornada.'}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.heading}>Minhas entregas</Text>

              {!deliveries.length ? (
                <Text style={styles.subtitle}>
                  Nenhuma entrega pendente ou em andamento.
                </Text>
              ) : null}

              {deliveries.map((delivery) => (
                <View key={delivery.id} style={styles.deliveryCard}>
                  <View style={styles.deliveryHeader}>
                    <Text style={styles.deliveryCode}>
                      {delivery.code}
                    </Text>

                    <Text style={styles.deliveryStatus}>
                      {delivery.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.deliveryLabel}>Coleta</Text>
                  <Text style={styles.deliveryAddress}>
                    {delivery.origin_address}
                  </Text>

                  <Text style={styles.deliveryLabel}>Entrega</Text>
                  <Text style={styles.deliveryAddress}>
                    {delivery.destination_address}
                  </Text>

                  {activeDeliveryId === delivery.id ? (
                    <Text style={styles.activeDelivery}>
                      ● ENTREGA ATIVA NO GPS
                    </Text>
                  ) : null}

                  {delivery.status === 'pendente' ? (
                    <Pressable
                      style={styles.deliveryButton}
                      onPress={() => void changeStatus(delivery, 'aceito')}
                    >
                      <Text style={styles.primaryText}>Aceitar entrega</Text>
                    </Pressable>
                  ) : null}

                  {delivery.status === 'aceito' ? (
                    <Pressable
                      style={styles.deliveryButton}
                      onPress={() => void changeStatus(delivery, 'coletado')}
                    >
                      <Text style={styles.primaryText}>Pedido coletado</Text>
                    </Pressable>
                  ) : null}

                  {delivery.status === 'coletado' ? (
                    <Pressable
                      style={styles.deliveryButton}
                      onPress={() => void changeStatus(delivery, 'em_rota')}
                    >
                      <Text style={styles.primaryText}>Iniciar rota</Text>
                    </Pressable>
                  ) : null}

                  {delivery.status === 'em_rota' ? (
                    <Pressable
                      style={styles.deliveryButton}
                      onPress={() => void changeStatus(delivery, 'chegou')}
                    >
                      <Text style={styles.primaryText}>Cheguei ao destino</Text>
                    </Pressable>
                  ) : null}

                  {delivery.status === 'chegou' ? (
                    <Pressable
                      style={styles.deliveryButton}
                      onPress={() => void changeStatus(delivery, 'entregue')}
                    >
                      <Text style={styles.primaryText}>Confirmar entrega</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
       
        {!!message && <Text style={message.includes('sucesso') || message.includes('encerrado') ? styles.success : styles.error}>{message}</Text>}

        <Pressable
          style={[styles.primaryButton, tracking && styles.stopButton]}
          onPress={toggleTracking}
          disabled={loading || !profile?.driver_id || profile?.role !== 'piloto'}
        >
          {loading ? <ActivityIndicator color="#101827" /> : <Text style={styles.primaryText}>{tracking ? 'Parar rastreamento' : 'Iniciar rastreamento'}</Text>}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={logout}>
          <Text style={styles.secondaryText}>Sair</Text>
        </Pressable>

        <Text style={styles.footnote}>O rastreamento para se o aplicativo for encerrado à força pelo usuário ou pelo sistema.</Text>
        </ScrollView>
    </SafeAreaView>
  )
}

const colors = { bg: '#07111f', card: '#152440', text: '#f6f8fc', muted: '#91a8ce', accent: '#f5a623' }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  page: {
    flexGrow: 1,
    padding: 24,
    gap: 18,
  },
  card: { width: '100%', borderRadius: 24, padding: 22, gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: '#294064' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logo: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091326' },
  logoText: { color: colors.accent, fontSize: 22, fontWeight: '900' },
  title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14 },
  heading: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 5 },
  label: { color: colors.muted, fontSize: 13, marginTop: 6 },
  input: { height: 52, borderRadius: 13, paddingHorizontal: 14, color: colors.text, backgroundColor: '#09152b', borderWidth: 1, borderColor: '#243c63' },
  primaryButton: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, paddingHorizontal: 18, marginTop: 8 },
  stopButton: { backgroundColor: '#ff6577' },
  primaryText: { color: '#101827', fontSize: 16, fontWeight: '900' },
  secondaryButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#36517a' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  statusCard: { borderRadius: 24, padding: 24, borderWidth: 1, gap: 10 },
  statusOn: { backgroundColor: '#103b32', borderColor: '#2ba783' },
  statusOff: { backgroundColor: '#272b3e', borderColor: '#4a526c' },
  statusLabel: { color: colors.text, fontSize: 24, fontWeight: '900' },
  statusText: { color: '#c9d7ee', fontSize: 15, lineHeight: 22 },
  error: { color: '#ff7384', fontSize: 14, lineHeight: 20 },
  success: { color: '#4ad6a7', fontSize: 14, lineHeight: 20 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 'auto' },
  deliveryCard: { borderRadius: 16, padding: 16, gap: 7, backgroundColor: '#09152b', borderWidth: 1, borderColor: '#294064', marginTop: 10,},
  deliveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  deliveryCode: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  
  deliveryStatus: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  
  deliveryLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  
  deliveryAddress: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
    
  deliveryButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 10,
  },
  
  activeDelivery: {
    color: '#4ad6a7',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
})
