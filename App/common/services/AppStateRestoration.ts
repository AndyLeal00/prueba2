/**
 * AppStateRestoration.ts
 * Maneja la restauración del estado de viajes activos al iniciar la app
 * y valida que las notificaciones persistentes se mantengan mientras hay un viaje activo
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/config/SupabaseConfig';
import { scheduleActiveTripNotification } from './ActiveTripNotificationService';
import { showDriverActiveNotification, updateDriverNotification } from '@/hooks/DriverNotificationService';

const ACTIVE_TRIP_STORAGE_KEY = 'active_trip_id';
const DRIVER_MODE_STORAGE_KEY = 'driver_mode_active';
const DISPATCH_SYSTEM_LOG = 'restore_state_log';

interface ActiveTrip {
  bookingId: string;
  role: 'driver' | 'customer';
  status: string;
  driverName?: string;
}

/**
 * Restaura el estado de viajes activos desde AsyncStorage y valida en Supabase
 * Se llama cuando la app abre (desde el RootLayout)
 */
export const restoreAppState = async (userId: string | undefined): Promise<void> => {
  if (!userId) return;

  try {
    // 1. Obtener información de viajes activos almacenada
    const [activeTripId, driverModeActive] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_TRIP_STORAGE_KEY),
      AsyncStorage.getItem(DRIVER_MODE_STORAGE_KEY),
    ]);

    // 2. Si hay modo conductor activo, restaurar notificación persistente del conductor
    if (driverModeActive === 'true') {
      await restoreDriverModeNotification(userId);
    }

    // 3. Si hay viaje activo, validar su estado y restaurar notificación
    if (activeTripId) {
      await restoreActiveTripNotification(activeTripId, userId);
    }

    await logRestoreAction(
      `Restaurado: trip=${activeTripId || 'none'}, driverMode=${driverModeActive || 'false'}`
    );
  } catch (error) {
    console.warn('AppStateRestoration: Error restaurando estado:', error);
    await logRestoreAction(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Restaura el estado del modo conductor
 */
const restoreDriverModeNotification = async (userId: string): Promise<void> => {
  try {
    // Verificar que el conductor aún está online
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, driver_mode_active')
      .eq('id', userId)
      .single();

    if (profile?.driver_mode_active) {
      const driverName = `${profile?.first_name} ${profile?.last_name}`.trim();
      await showDriverActiveNotification(driverName);
    } else {
      // El conductor se desconectó, limpiar storage
      await AsyncStorage.removeItem(DRIVER_MODE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('AppStateRestoration: Error restaurando modo conductor:', error);
  }
};

/**
 * Restaura el estado del viaje activo del cliente o conductor
 */
const restoreActiveTripNotification = async (
  bookingId: string,
  userId: string
): Promise<void> => {
  try {
    // Obtener detalles del viaje desde Supabase
    const { data: booking, error } = await supabase
      .from('bookings_v2_mobile' as any)
      .select('*')
      .eq('id', bookingId)
      .single();

    if (error) {
      console.warn('AppStateRestoration: Viaje no encontrado:', error);
      // A temporary network/API error must not erase the active trip reference.
      return;
    }

    if (!booking) {
      await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
      return;
    }

    // Verificar si el viaje sigue activo
    const activeStatuses = [
      'ACCEPTED',
      'ARRIVED',
      'STARTED',
      'IN_PROGRESS',
      'TRIP_STARTED',
    ];

    if (!activeStatuses.includes(booking.status)) {
      // Viaje no está activo, limpiar storage
      await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
      return;
    }

    // Determinar el rol del usuario actual (driver o customer)
    const isDriver = booking.driver_id === userId;
    const role = isDriver ? ('driver' as const) : ('customer' as const);

    // Restaurar la notificación persistente
    await scheduleActiveTripNotification(booking, role);

    await logRestoreAction(
      `Notificación de viaje restaurada: ${bookingId} (${role})`
    );
  } catch (error) {
    console.warn('AppStateRestoration: Error restaurando viaje activo:', error);
  }
};

/**
 * Guarda el ID del viaje activo en AsyncStorage cuando se acepta o inicia uno
 */
export const setActiveTripId = async (bookingId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, bookingId);
    await logRestoreAction(`Viaje activo guardado: ${bookingId}`);
  } catch (error) {
    console.warn('AppStateRestoration: Error guardando viaje activo:', error);
  }
};

/**
 * Limpia el viaje activo cuando se completa
 */
export const clearActiveTripId = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
    await logRestoreAction('Viaje activo limpiado');
  } catch (error) {
    console.warn('AppStateRestoration: Error limpiando viaje activo:', error);
  }
};

/**
 * Guarda que el modo conductor está activo
 */
export const setDriverModeActive = async (active: boolean): Promise<void> => {
  try {
    if (active) {
      await AsyncStorage.setItem(DRIVER_MODE_STORAGE_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(DRIVER_MODE_STORAGE_KEY);
    }
    await logRestoreAction(`Modo conductor: ${active ? 'ACTIVADO' : 'DESACTIVADO'}`);
  } catch (error) {
    console.warn('AppStateRestoration: Error guardando modo conductor:', error);
  }
};

/**
 * Registra acciones de restauración para debugging
 */
const logRestoreAction = async (message: string): Promise<void> => {
  try {
    const logs = await AsyncStorage.getItem(DISPATCH_SYSTEM_LOG);
    const existingLogs = logs ? JSON.parse(logs) : [];
    const newLog = {
      timestamp: new Date().toISOString(),
      message,
    };
    existingLogs.push(newLog);
    // Mantener solo los últimos 50 logs
    const recentLogs = existingLogs.slice(-50);
    await AsyncStorage.setItem(DISPATCH_SYSTEM_LOG, JSON.stringify(recentLogs));
  } catch (error) {
    console.warn('AppStateRestoration: Error registrando acción:', error);
  }
};

/**
 * Obtiene los logs de restauración para debugging
 */
export const getRestorationLogs = async (): Promise<any[]> => {
  try {
    const logs = await AsyncStorage.getItem(DISPATCH_SYSTEM_LOG);
    return logs ? JSON.parse(logs) : [];
  } catch (error) {
    console.warn('AppStateRestoration: Error obteniendo logs:', error);
    return [];
  }
};

/**
 * Limpia los logs de restauración
 */
export const clearRestorationLogs = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(DISPATCH_SYSTEM_LOG);
  } catch (error) {
    console.warn('AppStateRestoration: Error limpiando logs:', error);
  }
};
