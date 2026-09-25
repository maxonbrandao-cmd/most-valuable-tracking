import { useEffect, useState } from 'react'

import {
  ActivityIndicator,
  AppState,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { deliveryDay, deliverySections } from './src/deliverySections'
import FixedPostAttendance from './src/FixedPostAttendance'
import { isSupabaseConfigured, supabase } from './src/supabase'
import {
  clearActiveDeliveryId,
  isTracking,
  setActiveDeliveryId,
  startTracking,
  stopTracking,
} from './src/locationTask'

import {
  BarChart,
  PieChart,
} from 'react-native-gifted-charts'

import {
  Calendar,
  LocaleConfig,
} from 'react-native-calendars'

import * as Notifications from 'expo-notifications'
import * as ImagePicker from 'expo-image-picker'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

type PilotProfile = {
  company_id: string
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

type DeliveryClientInfo = {
  name: string | null
  company_name: string | null
}

function deliveryClientName(client: DeliveryClientInfo | DeliveryClientInfo[] | null | undefined) {
  const value = Array.isArray(client) ? client[0] : client
  return value?.company_name?.trim() || value?.name?.trim() || ''
}

  type PilotDelivery = {
    id: string
    code: string
    client_id: string
    driver_id: string | null
    origin_address: string
    destination_address: string
    status: DeliveryStatus
    driver_payout: number
    schedule_date: string | null
    schedule_id: string | null
    started_at: string | null
    scheduled_at: string | null
    delivered_at: string | null
    created_at: string

    clients?: DeliveryClientInfo | DeliveryClientInfo[] | null
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

LocaleConfig.locales['pt-br'] = {
  monthNames: [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ],

  monthNamesShort: [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ],

  dayNames: [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ],

  dayNamesShort: [
    'Dom',
    'Seg',
    'Ter',
    'Qua',
    'Qui',
    'Sex',
    'Sáb',
  ],

  today: 'Hoje',
}

LocaleConfig.defaultLocale = 'pt-br'



export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<PilotProfile | null>(null)
  const [email, setEmail] = useState('piloto1@maxempresa.com.br')
  const [password, setPassword] = useState('')
  const [tracking, setTracking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [deliveries, setDeliveries] = useState<PilotDelivery[]>([])
  const [today, setToday] = useState(() => deliveryDay(new Date()))
  const [showUpcoming, setShowUpcoming] = useState(false)
  const sections = deliverySections(deliveries, today)
  useEffect(() => {
    const updateDay = () => setToday(deliveryDay(new Date()))
    const timer = setInterval(updateDay, 60_000)
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') updateDay()
    })
    return () => { clearInterval(timer); subscription.remove() }
  }, [])
  const [activeDeliveryId, setActiveDeliveryState] = useState<string | null>(null)
  const [screen, setScreen] = useState<'jornada' | 'corridas'>('jornada')
  const [historyDeliveries, setHistoryDeliveries] = useState<PilotDelivery[]>([])
  const [historyStatus, setHistoryStatus] = useState<DeliveryStatus | 'todos'>('todos')
  const [historyClient, setHistoryClient] = useState('todos')
  const [historyStartDate, setHistoryStartDate] = useState('')
  const [historyEndDate, setHistoryEndDate] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end'>('start')
  const [historyVisibleCount, setHistoryVisibleCount] = useState(10)
  const [proofDelivery, setProofDelivery] = useState<PilotDelivery | null>(null)
  const [receiverName, setReceiverName] = useState('')
  const [receiverDocument, setReceiverDocument] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [proofPhoto, setProofPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [proofSaving, setProofSaving] = useState(false)

  useEffect(() => {
    setHistoryVisibleCount(10)
  }, [
    historyStartDate,
    historyEndDate,
    historyStatus,
    historyClient,
  ])

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
    const driverId = profile?.driver_id
    if (!driverId) return
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void loadDeliveries(driverId)
    })
    return () => subscription.remove()
  }, [profile?.driver_id])

  async function refreshDeliveries() {
    if (!profile?.driver_id || loading) return
    setLoading(true)
    setMessage('')
    try {
      await loadDeliveries(profile.driver_id)
    } finally { setLoading(false) }
  }

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
        .select('company_id, full_name, role, active, driver_id')
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
          await Promise.all([
            loadDeliveries(nextProfile.driver_id),
            loadHistory(nextProfile.driver_id),
          ])
        }
      }

      setTracking(activeTracking)
    })
  }, [session])

  async function startAttendance(delivery: PilotDelivery) {
    if (loading) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('start_recurring_delivery', { p_delivery_id: delivery.id })
      if (error) throw error
      await setActiveDeliveryId(delivery.id)
      setActiveDeliveryState(delivery.id)
      if (profile?.driver_id) await loadDeliveries(profile.driver_id)
      setMessage('Atendimento iniciado com sucesso. Confirme a coleta quando retirar o pedido.')
    } catch (e: any) {
      setMessage(e?.message || 'Não foi possível iniciar o atendimento.')
    } finally { setLoading(false) }
  }

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

  function openProofCapture(delivery: PilotDelivery) {
    setProofDelivery(delivery)
    setReceiverName('')
    setReceiverDocument('')
    setProofNotes('')
    setProofPhoto(null)
    setMessage('')
  }

  function closeProofCapture() {
    if (proofSaving) return
    setProofDelivery(null)
    setProofPhoto(null)
  }

  async function takeProofPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()

    if (!permission.granted) {
      Alert.alert(
        'Câmera não autorizada',
        'Permita o uso da câmera para fotografar o comprovante.',
      )
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
    })

    const photo = result.assets?.[0]
    if (!result.canceled && photo) setProofPhoto(photo)
  }

  async function chooseProofPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert(
        'Fotos não autorizadas',
        'Permita o acesso às fotos para escolher um comprovante.',
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
    })

    const photo = result.assets?.[0]
    if (!result.canceled && photo) setProofPhoto(photo)
  }

  async function saveProof() {
    if (!proofDelivery || !profile) return

    if (!receiverName.trim()) {
      Alert.alert('Informe quem recebeu', 'Digite o nome da pessoa que recebeu a entrega.')
      return
    }

    setProofSaving(true)
    setMessage('')
    let photoPath: string | null = null

    try {
      if (proofPhoto) {
        const extension =
          proofPhoto.fileName?.split('.').pop()?.toLowerCase() || 'jpg'

        photoPath = `${profile.company_id}/${proofDelivery.id}/canhoto-${Date.now()}.${extension}`

        const response = await fetch(proofPhoto.uri)
        const file = await response.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('delivery-proofs')
          .upload(photoPath, file, {
            contentType: proofPhoto.mimeType ?? 'image/jpeg',
            upsert: false,
          })

        if (uploadError) throw uploadError
      }

      const { error } = await supabase.rpc('register_delivery_proof', {
        p_delivery_id: proofDelivery.id,
        p_receiver_name: receiverName.trim(),
        p_receiver_document: receiverDocument.trim() || null,
        p_notes: proofNotes.trim() || null,
        p_lat: null,
        p_lng: null,
        p_canhoto_photo_path: photoPath,
        p_package_photo_path: null,
        p_signature_path: null,
        p_delivered_at: new Date().toISOString(),
      })

      if (error) throw error

      await clearActiveDeliveryId()
      setActiveDeliveryState(null)

      if (profile.driver_id) {
        await Promise.all([
          loadDeliveries(profile.driver_id),
          loadHistory(profile.driver_id),
        ])
      }

      setProofDelivery(null)
      setProofPhoto(null)
      setMessage(`Entrega ${proofDelivery.code} finalizada com comprovante.`)
    } catch (error) {
      if (photoPath) {
        await supabase.storage.from('delivery-proofs').remove([photoPath])
      }

      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o comprovante.',
      )
    } finally {
      setProofSaving(false)
    }
  }

  function finishWithoutProof() {
    if (!proofDelivery) return

    Alert.alert(
      'Finalizar sem comprovante?',
      'A entrega será concluída sem foto ou dados do recebedor.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => {
            const delivery = proofDelivery
            setProofDelivery(null)
            setProofPhoto(null)
            void changeStatus(delivery, 'entregue')
          },
        },
      ],
    )
  }

  async function loadDeliveries(driverId: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        id,
        code,
        client_id,
        schedule_date,
        schedule_id,
        started_at,
        scheduled_at,
        driver_payout,
        delivered_at,
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

  async function loadHistory(driverId: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        id,
        code,
        client_id,
        driver_id,
        origin_address,
        destination_address,
        status,
        driver_payout,
        schedule_date,
        schedule_id,
        started_at,
        scheduled_at,
        delivered_at,
        created_at,
        clients (
          name,
          company_name
        )
      `)
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setHistoryDeliveries(
      (data ?? []) as PilotDelivery[],
    )
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

  function localDateKey(value?: string | null) {
    if (!value) return ''

    const date = new Date(value)

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  function brl(value: number) {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  function formatDate(value?: string | null) {
    if (!value) return '—'

    return new Date(value).toLocaleDateString('pt-BR')
  }

  const historyClients = Array.from(
    new Map(
      historyDeliveries
        .filter((delivery) => delivery.client_id)
        .map((delivery) => [
          delivery.client_id,
          {
            id: delivery.client_id,
            name:
              deliveryClientName(delivery.clients),
          },
        ]),
    ).values(),
  ).map((client, index) => ({
    ...client,
    name: client.name || `Cliente sem nome (${index + 1})`,
  }))

  const filteredHistoryDeliveries =
  historyDeliveries.filter((delivery) => {
    const deliveryDate = localDateKey(
      delivery.scheduled_at ??
        delivery.delivered_at ??
        delivery.created_at,
    )

    const matchesStatus =
      historyStatus === 'todos' ||
      delivery.status === historyStatus

    const matchesClient =
      historyClient === 'todos' ||
      delivery.client_id === historyClient

    const matchesStart =
      !historyStartDate ||
      deliveryDate >= historyStartDate

    const matchesEnd =
      !historyEndDate ||
      deliveryDate <= historyEndDate

    return (
      matchesStatus &&
      matchesClient &&
      matchesStart &&
      matchesEnd
    )
  })

  const deliveredCount =
  filteredHistoryDeliveries.filter(
    (delivery) => delivery.status === 'entregue',
  ).length

  const notDeliveredCount =
    filteredHistoryDeliveries.filter(
      (delivery) =>
        delivery.status === 'nao_entregue',
    ).length

  const totalPayout =
    filteredHistoryDeliveries
      .filter(
        (delivery) =>
          delivery.status === 'entregue',
      )
      .reduce(
        (total, delivery) =>
          total + (delivery.driver_payout || 0),
        0,
      )

      const dailyChartData = Object.entries(
        filteredHistoryDeliveries.reduce<Record<string, number>>(
          (acc, delivery) => {
            const date = localDateKey(
              delivery.scheduled_at ??
                delivery.delivered_at ??
                delivery.created_at,
            )

            if (!date) {
              return acc
            }

            acc[date] = (acc[date] ?? 0) + 1

            return acc
          },
          {},
        ),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({
          value,
          label: new Date(
            `${date}T12:00:00`,
          ).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
          }),
        }))

        const payoutChartData = Object.entries(
          filteredHistoryDeliveries
            .filter(
              (delivery) =>
                delivery.status === 'entregue',
            )
            .reduce<Record<string, number>>(
              (acc, delivery) => {
                const date = localDateKey(
                  delivery.delivered_at ??
                    delivery.scheduled_at ??
                    delivery.created_at,
                )

                if (!date) {
                  return acc
                }

                acc[date] =
                  (acc[date] ?? 0) +
                  (delivery.driver_payout || 0)

                return acc
              },
              {},
            ),
        )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({
            value,
            label: new Date(
              `${date}T12:00:00`,
            ).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            }),
          }))

  const statusChartData = [
  {
    value: filteredHistoryDeliveries.filter(
      (delivery) => delivery.status === 'entregue',
    ).length,
    color: '#4ad6a7',
    text: 'Entregues',
  },
  {
    value: filteredHistoryDeliveries.filter(
      (delivery) => delivery.status === 'nao_entregue',
    ).length,
    color: '#ffb020',
    text: 'Não entregues',
  },
  {
    value: filteredHistoryDeliveries.filter(
      (delivery) => delivery.status === 'cancelado',
    ).length,
    color: '#ff6577',
    text: 'Canceladas',
  },
  {
    value: filteredHistoryDeliveries.filter(
      (delivery) =>
        ![
          'entregue',
          'nao_entregue',
          'cancelado',
        ].includes(delivery.status),
    ).length,
    color: '#6ea8ff',
    text: 'Outras',
    },
  ].filter((item) => item.value > 0)

  function openCalendar(target: 'start' | 'end') {
    setCalendarTarget(target)
    setCalendarOpen(true)
  }

  function selectCalendarDate(date: string) {
    if (calendarTarget === 'start') {
      setHistoryStartDate(date)
    } else {
      setHistoryEndDate(date)
    }

    setCalendarOpen(false)
  }

  function formatDateOnly(value: string) {
    if (!value) return ''

    const [year, month, day] = value.split('-')

    return `${day}/${month}/${year}`
  }

  const visibleHistoryDeliveries =
  filteredHistoryDeliveries.slice(
    0,
    historyVisibleCount,
  )



  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
          <View><Text style={styles.title}>MVT Piloto</Text><Text style={styles.subtitle}>Jornada de trabalho</Text></View>
        </View>

        <View style={styles.mobileTabs}>
                <Pressable
                  style={[
                    styles.mobileTab,
                    screen === 'jornada' && styles.mobileTabActive,
                  ]}
                  onPress={() => setScreen('jornada')}
                >
                  <Text
                    style={[
                      styles.mobileTabText,
                      screen === 'jornada' && styles.mobileTabTextActive,
                    ]}
                  >
                    Jornada
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.mobileTab,
                    screen === 'corridas' && styles.mobileTabActive,
                  ]}
                  onPress={() => setScreen('corridas')}
                >
                  <Text
                    style={[
                      styles.mobileTabText,
                      screen === 'corridas' && styles.mobileTabTextActive,
                    ]}
                  >
                    Minhas corridas
                  </Text>
                </Pressable>
              </View>

        {screen === 'corridas' ? (
        <View style={styles.historySection}>
          <Text style={styles.heading}>
            Minhas corridas
          </Text>

          <Text style={styles.subtitle}>
            Consulte seu histórico, repasses e resultados.
          </Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                Corridas
              </Text>

              <Text style={styles.summaryValue}>
                {filteredHistoryDeliveries.length}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                Entregues
              </Text>

              <Text style={styles.summaryValue}>
                {deliveredCount}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                Não entregues
              </Text>

              <Text style={styles.summaryValue}>
                {notDeliveredCount}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                Repasse
              </Text>

              <Text style={styles.summaryMoney}>
                {brl(totalPayout)}
              </Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.headingSmall}>
              Corridas por dia
            </Text>

            <Text style={styles.subtitle}>
              Quantidade de corridas no período filtrado.
            </Text>

            {dailyChartData.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <BarChart
                  data={dailyChartData}
                  barWidth={24}
                  spacing={18}
                  roundedTop
                  frontColor={colors.accent}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor="#294064"
                  yAxisTextStyle={{
                    color: colors.muted,
                    fontSize: 11,
                  }}
                  xAxisLabelTextStyle={{
                    color: colors.muted,
                    fontSize: 10,
                  }}
                  noOfSections={4}
                  maxValue={
                    Math.max(
                      ...dailyChartData.map(
                        (item) => item.value,
                      ),
                    ) + 1
                  }
                />
              </ScrollView>
            ) : (
              <Text style={styles.subtitle}>
                Nenhuma corrida no período.
              </Text>
            )}
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.headingSmall}>
              Repasse por dia
            </Text>

            <Text style={styles.subtitle}>
              Total recebido em corridas entregues.
            </Text>

            {payoutChartData.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <BarChart
                  data={payoutChartData}
                  barWidth={24}
                  spacing={18}
                  roundedTop
                  frontColor="#4ad6a7"
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor="#294064"
                  yAxisTextStyle={{
                    color: colors.muted,
                    fontSize: 11,
                  }}
                  xAxisLabelTextStyle={{
                    color: colors.muted,
                    fontSize: 10,
                  }}
                  noOfSections={4}
                  maxValue={
                    Math.max(
                      ...payoutChartData.map(
                        (item) => item.value,
                      ),
                    ) * 1.1
                  }
                />
              </ScrollView>
            ) : (
              <Text style={styles.subtitle}>
                Nenhum repasse no período.
              </Text>
            )}
          </View>

          <View style={styles.chartCard}>
  <Text style={styles.headingSmall}>
    Status das corridas
  </Text>

  <Text style={styles.subtitle}>
    Distribuição das corridas no período filtrado.
  </Text>

  {statusChartData.length ? (
    <>
      <View style={styles.pieWrapper}>
        <PieChart
          data={statusChartData}
          donut
          radius={95}
          innerRadius={55}
          focusOnPress
          showText
          textColor={colors.text}
          textSize={12}
          centerLabelComponent={() => (
            <View style={styles.pieCenter}>
              <Text style={styles.pieCenterValue}>
                {filteredHistoryDeliveries.length}
              </Text>

              <Text style={styles.pieCenterLabel}>
                corridas
              </Text>
            </View>
          )}
        />
      </View>

      <View style={styles.chartLegend}>
              {statusChartData.map((item) => (
                <View
                  key={item.text}
                  style={styles.legendItem}
                >
                  <View
                    style={[
                      styles.legendDot,
                      {
                        backgroundColor: item.color,
                      },
                    ]}
                  />

                  <Text style={styles.legendText}>
                    {item.text}
                  </Text>

                  <Text style={styles.legendValue}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.subtitle}>
            Nenhuma corrida no período.
          </Text>
        )}
      </View>

          <View style={[styles.card, styles.filterCard]}>
            <Text style={styles.headingSmall}>
              Filtros
            </Text>

            <Text style={styles.label}>
              Data inicial
            </Text>



            <Pressable
              style={styles.dateButton}
              onPress={() => openCalendar('start')}
            >
              <Text
                style={[
                  styles.dateButtonText,
                  !historyStartDate && styles.datePlaceholder,
                ]}
              >
                {historyStartDate
                  ? formatDateOnly(historyStartDate)
                  : 'Selecionar data inicial'}
              </Text>

              <Text style={styles.dateIcon}>
                📅
              </Text>
            </Pressable>

            <Text style={styles.label}>
              Data final
            </Text>

            <Pressable
              style={styles.dateButton}
              onPress={() => openCalendar('end')}
            >
              <Text
                style={[
                  styles.dateButtonText,
                  !historyEndDate && styles.datePlaceholder,
                ]}
              >
                {historyEndDate
                  ? formatDateOnly(historyEndDate)
                  : 'Selecionar data final'}
              </Text>

              <Text style={styles.dateIcon}>
                📅
              </Text>
            </Pressable>

            <Text style={styles.label}>
              Status
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              {[
                ['todos', 'Todos'],
                ['entregue', 'Entregues'],
                ['nao_entregue', 'Não entregues'],
                ['cancelado', 'Canceladas'],
                ['em_rota', 'Em rota'],
              ].map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[
                    styles.filterChip,
                    historyStatus === value &&
                      styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setHistoryStatus(
                      value as DeliveryStatus | 'todos',
                    )
                  }
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      historyStatus === value &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>
              Cliente
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              <Pressable
                style={[
                  styles.filterChip,
                  historyClient === 'todos' &&
                    styles.filterChipActive,
                ]}
                onPress={() =>
                  setHistoryClient('todos')
                }
              >
                <Text
                  style={[
                    styles.filterChipText,
                    historyClient === 'todos' &&
                      styles.filterChipTextActive,
                  ]}
                >
                  Todos
                </Text>
              </Pressable>

              {historyClients.map((client) => (
                <Pressable
                  key={client.id}
                  style={[
                    styles.filterChip,
                    historyClient === client.id &&
                      styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setHistoryClient(client.id)
                  }
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      historyClient === client.id &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    {client.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setHistoryStartDate('')
                setHistoryEndDate('')
                setHistoryStatus('todos')
                setHistoryClient('todos')
              }}
            >
              <Text style={styles.secondaryText}>
                Limpar filtros
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.headingSmall}>
              Histórico
            </Text>

            {!filteredHistoryDeliveries.length ? (
              <Text style={styles.subtitle}>
                Nenhuma corrida encontrada.
              </Text>
            ) : null}

            {visibleHistoryDeliveries.map(
              (delivery) => (
                <View
                  key={delivery.id}
                  style={styles.deliveryCard}
                >
                  <View style={styles.deliveryHeader}>
                    <Text style={styles.deliveryCode}>
                    {delivery.code}
                    </Text>

                    <Text style={styles.deliveryStatus}>
                      {delivery.status
                        .replace('_', ' ')
                        .toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.deliveryLabel}>
                    Cliente
                  </Text>

                  <Text style={styles.deliveryAddress}>
                    {historyClients.find(client => client.id === delivery.client_id)?.name || 'Cliente não identificado'}
                  </Text>

                  <Text style={styles.deliveryLabel}>
                    Data
                  </Text>

                  <Text style={styles.deliveryAddress}>
                    {formatDate(
                      delivery.scheduled_at ??
                        delivery.created_at,
                    )}
                  </Text>

                  <Text style={styles.deliveryLabel}>
                    Coleta
                  </Text>

                  <Text style={styles.deliveryAddress}>
                    {delivery.origin_address}
                  </Text>

                  <Text style={styles.deliveryLabel}>
                    Entrega
                  </Text>

                  <Text style={styles.deliveryAddress}>
                    {delivery.destination_address}
                  </Text>

                  <View style={styles.payoutRow}>
                    <Text style={styles.deliveryLabel}>
                      Repasse
                    </Text>

                    <Text style={styles.payoutValue}>
                      {brl(delivery.driver_payout || 0)}
                    </Text>
                  </View>
                </View>
              ),
            )}

            {historyVisibleCount <
              filteredHistoryDeliveries.length ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    setHistoryVisibleCount(
                      (current) => current + 10,
                    )
                  }
                >
                  <Text style={styles.secondaryText}>
                    Carregar mais
                  </Text>
                </Pressable>
              ) : null}
          </View>
        </View>
      ) : null}

    {screen === 'jornada' ? (
      <>
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
              {profile?.role === 'piloto' && profile.active && profile.driver_id && (
                <FixedPostAttendance key={`${session?.user.id}:${profile.driver_id}`} />
              )}
              <Text style={styles.heading}>Minhas entregas</Text>
              <Pressable style={styles.secondaryButton} disabled={loading}
                onPress={() => void refreshDeliveries()}>
                <Text style={styles.secondaryText}>{loading ? 'Atualizando...' : 'Atualizar entregas'}</Text>
              </Pressable>

              {sections.map(section => (
                <View key={section.title}>
                  {section.title === 'Próximas corridas' ? (
                    <Pressable
                      style={styles.secondaryButton}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showUpcoming }}
                      onPress={() => setShowUpcoming(current => !current)}
                    >
                      <Text style={styles.secondaryText}>
                        {showUpcoming ? 'Ocultar' : 'Mostrar'} próximas corridas ({section.rows.length})
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.heading}>{section.title} ({section.rows.length})</Text>
                  )}
                  {(section.title !== 'Próximas corridas' || showUpcoming) && <>
                  {!section.rows.length && <Text style={styles.subtitle}>{section.empty}</Text>}
                  {section.rows.map((delivery) => (
                <View key={delivery.id} style={styles.deliveryCard}>
                  <View style={styles.deliveryHeader}>
                    <Text style={styles.deliveryCode}>
                    {delivery.code}
                    </Text>

                    <Text style={styles.deliveryStatus}>
                      {delivery.schedule_id && delivery.status === 'pendente'
                        ? delivery.started_at ? 'EM ATENDIMENTO' : 'PROGRAMADA'
                        : delivery.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>

                  {(delivery.scheduled_at || delivery.schedule_date) && (
                    <Text style={styles.deliveryLabel}>
                      Programada para {delivery.scheduled_at
                        ? new Date(delivery.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                        : delivery.schedule_date?.split('-').reverse().join('/')}
                    </Text>
                  )}

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

                  {delivery.status === 'pendente' && !delivery.schedule_id ? (
                    <Pressable
                      style={styles.deliveryButton}
                      onPress={() => void changeStatus(delivery, 'aceito')}
                    >
                      <Text style={styles.primaryText}>Aceitar entrega</Text>
                    </Pressable>
                  ) : null}

                  {delivery.schedule_id && delivery.status === 'pendente' && !delivery.started_at ? (
                    <Pressable style={styles.deliveryButton} disabled={loading}
                      onPress={() => void startAttendance(delivery)}>
                      <Text style={styles.primaryText}>{loading ? 'Iniciando...' : 'Iniciar atendimento'}</Text>
                    </Pressable>
                  ) : null}

                  {delivery.status === 'aceito' || (delivery.schedule_id && delivery.status === 'pendente' && delivery.started_at) ? (
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
                      onPress={() => openProofCapture(delivery)}
                    >
                      <Text style={styles.primaryText}>Confirmar entrega</Text>
                    </Pressable>
                  ) : null}
                </View>
                  ))}
                  </>}
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

      </>
    ) : null}

        <Pressable style={styles.secondaryButton} onPress={logout}>
          <Text style={styles.secondaryText}>Sair</Text>
        </Pressable>

        <Text style={styles.footnote}>O rastreamento para se o aplicativo for encerrado à força pelo usuário ou pelo sistema.</Text>
        </ScrollView>

        <Modal
          visible={Boolean(proofDelivery)}
          transparent
          animationType="slide"
          onRequestClose={closeProofCapture}
        >
          <KeyboardAvoidingView
            style={styles.proofOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.proofModal}>
              <ScrollView
                contentContainerStyle={styles.proofContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.headingSmall}>Comprovante de entrega</Text>
                <Text style={styles.subtitle}>
                  {proofDelivery ? `Corrida ${proofDelivery.code}` : ''}
                </Text>

                <Text style={styles.label}>Recebido por</Text>
                <TextInput
                  style={styles.input}
                  value={receiverName}
                  onChangeText={setReceiverName}
                  placeholder="Nome do recebedor"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.label}>Documento (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={receiverDocument}
                  onChangeText={setReceiverDocument}
                  placeholder="CPF, RG ou outro documento"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.label}>Observações (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.proofNotes]}
                  value={proofNotes}
                  onChangeText={setProofNotes}
                  placeholder="Informações sobre a entrega"
                  placeholderTextColor={colors.muted}
                  multiline
                />

                {proofPhoto ? (
                  <Image source={{ uri: proofPhoto.uri }} style={styles.proofImage} />
                ) : null}

                <View style={styles.proofPhotoActions}>
                  <Pressable
                    style={[styles.secondaryButton, styles.proofPhotoButton]}
                    onPress={() => void takeProofPhoto()}
                    disabled={proofSaving}
                  >
                    <Text style={styles.secondaryText}>Tirar foto</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.secondaryButton, styles.proofPhotoButton]}
                    onPress={() => void chooseProofPhoto()}
                    disabled={proofSaving}
                  >
                    <Text style={styles.secondaryText}>Escolher foto</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.primaryButton}
                  onPress={() => void saveProof()}
                  disabled={proofSaving}
                >
                  <Text style={styles.primaryText}>
                    {proofSaving ? 'Salvando...' : 'Salvar comprovante e finalizar'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.secondaryButton}
                  onPress={finishWithoutProof}
                  disabled={proofSaving}
                >
                  <Text style={styles.secondaryText}>Finalizar sem comprovante</Text>
                </Pressable>

                <Pressable
                  style={styles.proofCancelButton}
                  onPress={closeProofCapture}
                  disabled={proofSaving}
                >
                  <Text style={styles.proofCancelText}>Voltar para a corrida</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
            visible={calendarOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setCalendarOpen(false)}
          >
            <View style={styles.calendarOverlay}>
              <View style={styles.calendarModal}>
                <View style={styles.calendarHeader}>
                  <View>
                    <Text style={styles.headingSmall}>
                      {calendarTarget === 'start'
                        ? 'Data inicial'
                        : 'Data final'}
                    </Text>

                    <Text style={styles.subtitle}>
                      Selecione uma data.
                    </Text>
                  </View>

                  <Pressable
                    style={styles.calendarClose}
                    onPress={() => setCalendarOpen(false)}
                  >
                    <Text style={styles.calendarCloseText}>
                      ×
                    </Text>
                  </Pressable>
                </View>

                <Calendar
                  onDayPress={(day) =>
                    selectCalendarDate(day.dateString)
                  }
                  markedDates={{
                    ...(
                      historyStartDate
                        ? {
                            [historyStartDate]: {
                              selected: true,
                              selectedColor: '#f5a623',
                            },
                          }
                        : {}
                    ),

                    ...(
                      historyEndDate
                        ? {
                            [historyEndDate]: {
                              selected: true,
                              selectedColor: '#4ad6a7',
                            },
                          }
                        : {}
                    ),
                  }}
                  theme={{
                    backgroundColor: colors.card,
                    calendarBackground: colors.card,

                    textSectionTitleColor: colors.muted,
                    dayTextColor: colors.text,
                    monthTextColor: colors.text,

                    todayTextColor: colors.accent,
                    arrowColor: colors.accent,

                    textDisabledColor: '#4a5a75',

                    selectedDayTextColor: '#101827',

                    textMonthFontWeight: '900',
                    textDayFontWeight: '600',
                    textDayHeaderFontWeight: '700',
                  }}
                />

                {(historyStartDate || historyEndDate) ? (
                  <View style={styles.calendarSelection}>
                    <Text style={styles.subtitle}>
                      Período atual
                    </Text>

                    <Text style={styles.calendarSelectionText}>
                    {historyStartDate
                      ? formatDateOnly(historyStartDate)
                      : '—'}

                    {' → '}

                    {historyEndDate
                      ? formatDateOnly(historyEndDate)
                      : '—'}
                  </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Modal>

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
  deliveryCard: { borderRadius: 14, padding: 14, gap: 1, backgroundColor: '#09152b', borderWidth: 1, borderColor: '#294064', marginTop: 10,},

  deliveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#203554',
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
    fontSize: 15,
    fontWeight: '700',
    marginTop: 15,
  },

  deliveryAddress: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 18,
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

  proofOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(3, 8, 18, 0.78)',
  },

  proofModal: {
    maxHeight: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#294064',
  },

  proofContent: {
    padding: 22,
    paddingBottom: 36,
    gap: 10,
  },

  proofNotes: {
    minHeight: 92,
    height: 92,
    paddingTop: 14,
    textAlignVertical: 'top',
  },

  proofImage: {
    width: '100%',
    height: 210,
    borderRadius: 14,
    marginTop: 4,
    backgroundColor: '#09152b',
  },

  proofPhotoActions: {
    flexDirection: 'row',
    gap: 10,
  },

  proofPhotoButton: {
    flex: 1,
  },

  proofCancelButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },

  proofCancelText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },

  filterCard: {
    gap: 10,
  },

  pieWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },

  pieCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  pieCenterValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },

  pieCenterLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },

  chartLegend: {
    gap: 10,
    marginTop: 8,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  legendText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },

  legendValue: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },

  chartCard: {
    width: '100%',
    borderRadius: 18,
    padding: 16,
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#294064',
    overflow: 'hidden',
  },

  mobileTabs: {
    flexDirection: 'row',
    backgroundColor: '#09152b',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },

  mobileTab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },

  mobileTabActive: {
    backgroundColor: colors.accent,
  },

  mobileTabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },

  mobileTabTextActive: {
    color: '#101827',
  },

  historySection: {
    gap: 16,
  },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  summaryCard: {
    width: '48%',
    minHeight: 92,
    padding: 15,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#294064',
  },

  summaryLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },

  summaryValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 5,
  },

  summaryMoney: {
    color: '#4ad6a7',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },

  headingSmall: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },

  filterChips: {
    gap: 8,
    paddingVertical: 5,
  },

  filterChip: {
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#36517a',
    backgroundColor: '#09152b',
  },

  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  filterChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  filterChipTextActive: {
    color: '#101827',
  },

  payoutRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#294064',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  payoutValue: {
    color: '#4ad6a7',
    fontSize: 16,
    fontWeight: '900',
  },

  dateButton: {
    minHeight: 52,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#09152b',
    borderWidth: 1,
    borderColor: '#243c63',
  },

  dateButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  datePlaceholder: {
    color: colors.muted,
    fontWeight: '500',
  },

  dateIcon: {
    fontSize: 18,
  },

  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  calendarModal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    padding: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#294064',
  },

  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  calendarClose: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#09152b',
  },

  calendarCloseText: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 28,
  },

  calendarSelection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#294064',
  },

  calendarSelectionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
})
