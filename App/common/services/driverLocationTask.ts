import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getSafeSession } from '@/config/SupabaseConfig';
import {
  getBackgroundLocationConsent,
  requestBackgroundLocationDisclosure,
} from '@/common/services/backgroundLocationConsent';

export const DRIVER_LOCATION_TASK = 'tmasplus-driver-location-task';

const ACTIVE_BOOKING_KEY = 'driver_tracking_active_booking_id';
const ACTIVE_DRIVER_KEY = 'driver_tracking_active_driver_id';
const LAST_INSERT_KEY = 'driver_tracking_last_insert';
// Respaldo local — resiliencia si el POST a booking_tracking falla por red
// durante el viaje. Se reconcilia con el servidor al finalizar (ver
// `getLocalTrackingBackup`/`clearLocalTrackingBackup`, usados por
// `addActualsToBooking` en `common/other/sharedFunctions.ts`). NO reemplaza
// el posteo en tiempo real — el cliente sigue viendo al conductor en vivo
// igual que antes, esto es solo respaldo.
const LOCAL_BACKUP_PREFIX = 'driver_tracking_local_backup_';
const MAX_LOCAL_BACKUP_POINTS = 500;

const MIN_DISTANCE_METERS = 15;
const SAFETY_INTERVAL_MS = 8000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// AsyncStorage es el puente entre el hook (UI) y la task (proceso de fondo).
// La task no tiene acceso a hooks ni a estado de React, así que los IDs activos
// se persisten aquí cuando empieza el tracking y se leen en cada batch del OS.
TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[driverLocationTask] task error:', error);
    return;
  }
  if (!data) {
    console.log('[driverLocationTask] callback fired with no data');
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) {
    console.log('[driverLocationTask] callback fired with empty locations');
    return;
  }
  console.log('[driverLocationTask] received', locations.length, 'location(s)');

  let bookingId: string | null = null;
  let driverId: string | null = null;
  try {
    [bookingId, driverId] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_BOOKING_KEY),
      AsyncStorage.getItem(ACTIVE_DRIVER_KEY),
    ]);
  } catch (e) {
    console.warn('[driverLocationTask] AsyncStorage read failed:', e);
    return;
  }

  if (!bookingId || !driverId) {
    console.log('[driverLocationTask] no active session in AsyncStorage, skipping insert');
    return;
  }

  const latest = locations[locations.length - 1];
  const { latitude: lat, longitude: lng, accuracy } = latest.coords;

  let lastInsert: { lat: number; lng: number; time: number } | null = null;
  try {
    const raw = await AsyncStorage.getItem(LAST_INSERT_KEY);
    if (raw) lastInsert = JSON.parse(raw);
  } catch {}

  if (lastInsert) {
    const distMoved = haversineMeters(lastInsert.lat, lastInsert.lng, lat, lng);
    const elapsed = Date.now() - lastInsert.time;
    if (distMoved < MIN_DISTANCE_METERS && elapsed < SAFETY_INTERVAL_MS) {
      console.log(
        '[driverLocationTask] throttled (dist=' +
          distMoved.toFixed(1) +
          'm, elapsed=' +
          elapsed +
          'ms)',
      );
      return;
    }
  }

  // Guardar en el respaldo local ANTES de intentar la red — así el punto
  // sobrevive aunque el POST de abajo falle (sin señal, timeout, etc.).
  try {
    const backupKey = LOCAL_BACKUP_PREFIX + bookingId;
    const raw = await AsyncStorage.getItem(backupKey);
    const arr: Array<{ lat: number; lng: number; accuracy: number | null; ts: number }> = raw
      ? JSON.parse(raw)
      : [];
    arr.push({ lat, lng, accuracy: accuracy ?? null, ts: Date.now() });
    if (arr.length > MAX_LOCAL_BACKUP_POINTS) {
      arr.splice(0, arr.length - MAX_LOCAL_BACKUP_POINTS);
    }
    await AsyncStorage.setItem(backupKey, JSON.stringify(arr));
  } catch (e) {
    console.warn('[driverLocationTask] error guardando respaldo local:', e);
  }

  // V2 requires the driver's session and resolves profile/vehicle IDs server-side.
  const session = await getSafeSession();
  if (!session?.access_token) return;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_vehicle_position`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Profile': 'booking_v2',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      p_booking_id: bookingId,
      p_lat: lat,
      p_lng: lng,
      p_accuracy: accuracy ?? null,
      p_recorded_at: new Date(latest.timestamp).toISOString(),
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('[driverLocationTask] insert failed:', resp.status, body);
    return;
  }

  console.log(
    '[driverLocationTask] insert OK lat=' + lat.toFixed(5) + ' lng=' + lng.toFixed(5),
  );

  try {
    await AsyncStorage.setItem(
      LAST_INSERT_KEY,
      JSON.stringify({ lat, lng, time: Date.now() }),
    );
  } catch {}
});

/**
 * Lee el respaldo local de puntos GPS de un viaje (buffer en el teléfono,
 * independiente de lo que haya llegado o no al servidor). Usado por
 * `addActualsToBooking` para reconciliar huecos de red al finalizar.
 */
export async function getLocalTrackingBackup(
  bookingId: string,
): Promise<Array<{ lat: number; lng: number; accuracy: number | null; ts: number }>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_BACKUP_PREFIX + bookingId);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[driverLocationTask] error leyendo respaldo local:', e);
    return [];
  }
}

/** Borra el respaldo local de un viaje — llamar tras reconciliar/subir. */
export async function clearLocalTrackingBackup(bookingId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(LOCAL_BACKUP_PREFIX + bookingId);
  } catch (e) {
    console.warn('[driverLocationTask] error borrando respaldo local:', e);
  }
}

/**
 * Solicita el permiso de ubicación en segundo plano. Debe llamarse SOLO
 * después de que el usuario haya aceptado la Prominent Disclosure
 * (ver DriverLocationDisclosureGate). El cuadro del sistema aparece así
 * inmediatamente después de la pantalla de divulgación, como exige Google.
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch (e) {
    console.warn('[driverLocationTask] requestBackgroundLocationPermission error:', e);
    return false;
  }
}

async function ensurePermissions(): Promise<boolean> {
  const fg = await Location.getForegroundPermissionsAsync();
  let fgStatus = fg.status;
  if (fgStatus !== 'granted') {
    const req = await Location.requestForegroundPermissionsAsync();
    fgStatus = req.status;
  }
  if (fgStatus !== 'granted') {
    console.warn('[driverLocationTask] foreground location denied');
    return false;
  }

  // Prominent Disclosure: nunca solicitamos ubicación en segundo plano si el
  // conductor no ha aceptado antes la pantalla de divulgación. Si no hay
  // consentimiento (p. ej. tocó "Ahora no"), pedimos que se vuelva a mostrar
  // la divulgación justo ahora que se necesita, en lugar de bloquearlo.
  let consentUserId: string | null = null;
  try {
    const session = await getSafeSession();
    consentUserId = session?.user?.id ?? null;
  } catch {}

  const consent = await getBackgroundLocationConsent(consentUserId);
  if (consent !== 'granted') {
    console.warn('[driverLocationTask] sin consentimiento de ubicación en segundo plano — se solicita la divulgación');
    requestBackgroundLocationDisclosure();
    return false;
  }

  const bg = await Location.getBackgroundPermissionsAsync();
  let bgStatus = bg.status;
  if (bgStatus !== 'granted') {
    const req = await Location.requestBackgroundPermissionsAsync();
    bgStatus = req.status;
  }
  if (bgStatus !== 'granted') {
    console.warn('[driverLocationTask] background location denied — tracking will die when app backgrounds');
    return false;
  }

  return true;
}

let activeSession: { bookingId: string; driverId: string } | null = null;

export async function startDriverLocationTracking(
  bookingId: string,
  driverId: string,
): Promise<boolean> {
  if (!bookingId || !driverId) return false;

  if (
    activeSession &&
    activeSession.bookingId === bookingId &&
    activeSession.driverId === driverId
  ) {
    const stillRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    if (stillRunning) return true;
  }

  const ok = await ensurePermissions();
  if (!ok) return false;

  await AsyncStorage.multiSet([
    [ACTIVE_BOOKING_KEY, bookingId],
    [ACTIVE_DRIVER_KEY, driverId],
  ]);
  await AsyncStorage.removeItem(LAST_INSERT_KEY);

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  if (alreadyRunning) {
    activeSession = { bookingId, driverId };
    return true;
  }

  try {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      // distanceInterval eliminado: el filtro de distancia del OS bloqueaba las
      // actualizaciones cuando el conductor estaba quieto (o en emulador con mock GPS
      // estático). El throttle de distancia/tiempo ya lo maneja el task internamente.
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'T+Plus está compartiendo tu ubicación',
        notificationBody: 'Tu pasajero puede ver tu ubicación mientras el viaje esté activo.',
        notificationColor: '#0099CC',
      },
    });
    console.log('[driverLocationTask] startLocationUpdatesAsync OK for booking', bookingId);
  } catch (e) {
    console.error('[driverLocationTask] startLocationUpdatesAsync threw:', e);
    return false;
  }

  activeSession = { bookingId, driverId };
  return true;
}

export async function stopDriverLocationTracking(): Promise<void> {
  if (!activeSession) {
    const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(
      () => false,
    );
    if (!running) return;
  }
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    if (running) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch (e) {
    console.warn('[driverLocationTask] stop failed:', e);
  }
  activeSession = null;
  try {
    await AsyncStorage.multiRemove([ACTIVE_BOOKING_KEY, ACTIVE_DRIVER_KEY, LAST_INSERT_KEY]);
  } catch {}
}
