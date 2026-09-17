import { bookingV2LegacyPost } from '@/config/SupabaseConfig';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import axios from 'axios';

export async function registerForPushNotificationsAsync() {
  // Avoid trying to get expo push token inside Expo Go (not supported for remote notifications)
  if (Constants.appOwnership === 'expo') {
    console.warn('registerForPushNotificationsAsync: running in Expo Go — use a dev client to test push notifications.');
    return null;
  }
  if (Device.isDevice) {
    try {
      const Notifications = await import('expo-notifications');
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        alert('Failed to get push token for push notification!');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      // configure Android channel if needed
      if (Platform.OS === 'android') {
        try {
          // Renombrado a -v2 (mismo motivo que bookings-v2 en GetPushToken.ts):
          // los canales Android son inmutables y el 'customSound' original
          // apuntaba a horn.wav que no estaba bundleado. Forzar canal nuevo.
          // Sonido oficial: firstoption.mp3 (elegido 2026-08-09).
          await Notifications.setNotificationChannelAsync('custom-sound-v2', {
            name: 'Sonido personalizado',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#E91E63',
            sound: 'firstoption.mp3',
          });
        } catch (chErr) {
          console.warn('Could not set Android notification channel:', chErr);
        }
      }

      return token;
    } catch (err) {
      console.warn('registerForPushNotificationsAsync: expo-notifications not available or failed', err);
      return null;
    }
  } else {
    alert('Must use physical device for Push Notifications');
    return null;
  }
}

// Configure how the notification will be displayed when the app is in foreground
// Notification handler should be configured where notifications are initialized



export async function sendPushNotification(token, title, body) {
  try {
    //console.log('Sending push notification:', { token, title, body });

    const response = await bookingV2LegacyPost('https://us-central1-treasupdate.cloudfunctions.net/sendNotification', {
      token,
      title,
      body,
      sound: 'default', // Añade otros parámetros si los necesitas
    });

    if (response.status === 200) {
      //console.log('Notification sent successfully');
    } else {
      console.error('Error sending notification:', response.data);
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}
