import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export const isSupabaseConfigured = Boolean(url && key)

const nativeStorage = {
  getItem: (storageKey: string) => SecureStore.getItemAsync(storageKey),
  setItem: (storageKey: string, value: string) =>
    SecureStore.setItemAsync(storageKey, value),
  removeItem: (storageKey: string) =>
    SecureStore.deleteItemAsync(storageKey),
}

const webStorage = {
  getItem: async (storageKey: string) => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(storageKey)
  },
  setItem: async (storageKey: string, value: string) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, value)
  },
  removeItem: async (storageKey: string) => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(storageKey)
  },
}

const storage = Platform.OS === 'web' ? webStorage : nativeStorage

export const supabase = createClient(
  url || 'https://invalid.supabase.co',
  key || 'invalid',
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
)