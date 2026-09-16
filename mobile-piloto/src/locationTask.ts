import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import * as SecureStore from 'expo-secure-store'

import { supabase } from './supabase'

const ACTIVE_DELIVERY_KEY = 'mvt-active-delivery-id'

export const LOCATION_TASK_NAME = 'mvt-background-location'

type LocationTaskData = {
  locations: Location.LocationObject[]
}

TaskManager.defineTask<LocationTaskData>(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data?.locations?.length) return

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return

  for (const position of data.locations) {
    const { coords, timestamp } = position
  
    if (
      coords.latitude == null ||
      coords.longitude == null ||
      !Number.isFinite(coords.latitude) ||
      !Number.isFinite(coords.longitude)
    ) {
      console.warn('GPS ignorado: coordenadas inválidas', coords)
      continue
    }
  
    console.log('Enviando GPS:', {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading,
    })

    const activeDeliveryId =
      await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY)

    console.log('Entrega ativa do GPS:', activeDeliveryId)
  


    const { error: sendError } = await supabase.rpc('register_gps_position', {
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_accuracy: coords.accuracy ?? null,
      p_speed: coords.speed ?? null,
      p_heading: coords.heading ?? null,
      p_altitude: coords.altitude ?? null,
      p_captured_at: new Date(timestamp).toISOString(),
      p_delivery_id: activeDeliveryId,
    })
  
    if (sendError) {
      console.warn('Falha ao enviar GPS:', sendError)
    }
  }
})

export async function setActiveDeliveryId(deliveryId: string) {
  await SecureStore.setItemAsync(
    ACTIVE_DELIVERY_KEY,
    deliveryId,
  )
}

export async function clearActiveDeliveryId() {
  await SecureStore.deleteItemAsync(
    ACTIVE_DELIVERY_KEY,
  )
}

export async function isTracking() {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
}

export async function startTracking() {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (foreground.status !== 'granted') {
    throw new Error('Autorize a localização durante o uso do aplicativo.')
  }

  const background = await Location.requestBackgroundPermissionsAsync()
  if (background.status !== 'granted') {
    throw new Error('Nas configurações do celular, permita a localização o tempo todo.')
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 25,
    deferredUpdatesInterval: 30000,
    deferredUpdatesDistance: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: 'MVT — rastreamento ativo',
      notificationBody: 'Sua posição está sendo enviada durante a jornada.',
      notificationColor: '#f5a623',
      killServiceOnDestroy: false,
    },
  })
}

export async function stopTracking() {
  if (await isTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
  }
}

