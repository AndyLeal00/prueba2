import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { AppConfig } from '@/config/AppConfig';
import Constants from 'expo-constants';
import { setupDriverNotificationChannel } from '@/hooks/DriverNotificationService';

let firebaseMessagingModule: any = null;
try {
  // Try to require the native firebase messaging module at runtime.
  // It may not be available in Expo Go / dev builds.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  firebaseMessagingModule = require('@react-native-firebase/messaging');
} catch (e) {
  firebaseMessagingModule = null;
}

export default async function GetPushToken() {

  // No ejecutar push token flow en Expo Go (no soporta push remotas)
  if (Constants.appOwnership === 'expo') {
    console.warn('GetPushToken: running in Expo Go — skipping native push token retrieval. Use a dev client to test push.');
    return null;
  }

  let token;
  // `Device.isDevice` es false en emuladores → el flujo se saltaba y el token
  // quedaba null. Un emulador Android con Google Play SÍ puede emitir token
  // Expo/FCM, así que en desarrollo también lo permitimos (solo Android: el
  // iOS Simulator no puede obtener token de APNs). En release el guard sigue
  // exigiendo dispositivo físico.
  const allowEmulator = __DEV__ && Platform.OS === 'android';
  if (Device.isDevice || allowEmulator) {
    try {
      const Notifications = await import('expo-notifications');
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Avisos generales', importance: Notifications.AndroidImportance.HIGH, sound: 'default',
        });
      }
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      console.log('[GetPushToken] permission=', finalStatus, 'isDevice=', Device.isDevice, 'projectId=', AppConfig.expo_project_id);
      if (finalStatus !== 'granted') {
        console.warn('[GetPushToken] permiso de notificaciones no concedido:', finalStatus);
        return null;
      }
      const ref = { projectId: AppConfig.expo_project_id };
      token = (await Notifications.getExpoPushTokenAsync(ref)).data;
      console.log('[GetPushToken] Expo token obtained');
    } catch (err) {
      console.warn('GetPushToken: expo-notifications not available', err);
      return null;
    }
  } else {
    console.warn('[GetPushToken] skipped: not a physical device (iOS simulator / release emulator)');
  }

  if (Platform.OS === 'android') {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00f4f5',
        sound: 'default',
      });
      // Renombrados a *-v2 para forzar re-creación del canal en Android.
      // Los canales son INMUTABLES una vez creados en el dispositivo del
      // usuario. Como el `horn.wav` original faltaba en el bundle desde el
      // commit 1322504 (10-abril-2026), los usuarios existentes tienen los
      // canales antiguos apuntando a un archivo inexistente → silencio.
      // Con el ID nuevo, Android crea un canal nuevo con el archivo ahora
      // sí bundleado en assets/sounds/.
      //
      // Sonido oficial de la app: firstoption.mp3 (elegido 2026-08-09).
      // Se usa en los canales principales de servicio.
      await Notifications.setNotificationChannelAsync('bookings-v2', {
        name: 'Nuevos servicios',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'firstoption.mp3',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00f4f5',
      });
      await Notifications.setNotificationChannelAsync('bookings-repeat-v2', {
        name: 'Servicios pendientes',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'firstoption.mp3',
        vibrationPattern: [0, 500, 500, 500],
        lightColor: '#00f4f5',
      });

      // Persistent driver notification channel
      await setupDriverNotificationChannel();
    } catch (err) {
      console.warn('Could not set Android notification channels (expo-notifications not available):', err);
    }
  }
  return token;
}


export async function registerForPushNotificationsAsync() {
  // Prefer native FCM when available
  if (firebaseMessagingModule) {
    try {
      const messagingFactory = typeof firebaseMessagingModule === 'function' ? firebaseMessagingModule : firebaseMessagingModule.default;
      if (typeof messagingFactory === 'function') {
        const m = messagingFactory();
        await m.requestPermission();
        const token = await m.getToken();
        return token;
      }
    } catch (e) {
      console.warn('FCM messaging not available at runtime:', e);
    }
  }

  // Fallback to Expo push token
  try {
    const Notifications = await import('expo-notifications');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }
    const ref = { projectId: AppConfig.expo_project_id };
    const expoToken = (await Notifications.getExpoPushTokenAsync(ref)).data;
    return expoToken;
  } catch (e) {
    console.error('Error getting expo push token', e);
    return null;
  }
}
