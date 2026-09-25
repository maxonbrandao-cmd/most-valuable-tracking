import type { ExpoConfig } from 'expo/config'

const isDev = process.env.APP_VARIANT === 'development'

const config: ExpoConfig = {
  name: isDev ? 'MVT Piloto Teste' : 'MVT Piloto',
  slug: 'mvt-piloto',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',

  scheme: isDev
    ? 'mvtpilototeste'
    : 'mvtpiloto',

  ios: {
    supportsTablet: false,

    bundleIdentifier: isDev
      ? 'com.maxempresa.mvtpiloto.dev'
      : 'com.maxempresa.mvtpiloto',

    infoPlist: {
      UIBackgroundModes: [
        'location',
      ],
    },
  },

  android: {
    package: isDev
      ? 'com.maxempresa.mvtpiloto.dev'
      : 'com.maxempresa.mvtpiloto',

    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'RECEIVE_BOOT_COMPLETED',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ],
  },

  plugins: [
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'O MVT usa sua localização para acompanhar as entregas enquanto você trabalha.',

        locationAlwaysAndWhenInUsePermission:
          'O MVT usa sua localização durante as entregas, inclusive com a tela bloqueada.',

        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],

    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
      },
    ],

    [
      'expo-image-picker',
      {
        cameraPermission:
          'O MVT usa a câmera para fotografar comprovantes de entrega.',
        photosPermission:
          'O MVT acessa suas fotos para anexar comprovantes de entrega.',
        microphonePermission: false,
      },
    ],
  ],

  extra: {
    appVariant: isDev
      ? 'development'
      : 'production',

    eas: {
      projectId:
        'e0d44507-cc07-4967-928a-36018d54087a',
    },
  },

  owner: 'maxbrandaos-team',
}

export default config
