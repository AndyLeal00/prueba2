import { useEffect } from 'react';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootState } from '@/common/store/store';
import supabase, { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import {
  startDriverLocationTracking,
  stopDriverLocationTracking,
} from '@/common/services/driverLocationTask';

const ACTIVE_STATUSES = ['ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED'];

// Watchdog anti-kill: si el foreground service muere silenciosamente en OEMs
// agresivos (MIUI, EMUI, ColorOS), `hasStartedLocationUpdatesAsync` puede
// seguir devolviendo true pero ya no llegan puntos. Cada WATCHDOG_INTERVAL_MS
// verificamos el timestamp del último insert; si excede WATCHDOG_GAP_MS con
// booking activo, forzamos stop+start para revivir el service.
const WATCHDOG_INTERVAL_MS = 30_000;
const WATCHDOG_GAP_MS = 60_000;
const LAST_INSERT_KEY = 'driver_tracking_last_insert';

function pickUserType(user: any, profile: any): string {
  return String(
    profile?.user_type ||
      user?.usertype ||
      user?.user_type ||
      user?.userType ||
      user?.user_metadata?.usertype ||
      user?.user_metadata?.user_type ||
      user?.user_metadata?.userType ||
      '',
  )
    .trim()
    .toLowerCase();
}

// bookings.driver_id referencia users.id (tabla pública), no auth_id.
// La sesión restaurada en cold start solo trae el SupabaseUser, así que hay
// que resolver el id público vía OR sobre id/auth_id como hace index.tsx:976.
async function resolveDriverPublicId(
  candidates: string[],
  headers: Record<string, string>,
): Promise<string | null> {
  for (const c of candidates) {
    if (!c) continue;
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?or=(id.eq.${c},auth_id.eq.${c})&select=id&limit=1`,
        { headers },
      );
      if (r.ok) {
        const rows = await r.json();
        if (rows?.[0]?.id) return rows[0].id;
      }
    } catch (e) {
      console.error('[GlobalDriverTracking] resolve users.id error:', e);
    }
  }
  return null;
}

export function useGlobalDriverTracking() {
  const user = useSelector((state: RootState) => (state as any).auth?.user as any);
  const profile = useSelector((state: RootState) => (state as any).auth?.profile as any);

  const userType = pickUserType(user, profile);
  const isDriver = userType === 'driver';
  const idCandidates: string[] = [
    user?.id,
    user?.auth_id,
    profile?.id,
    profile?.auth_id,
    user?.user_metadata?.id,
  ].filter(Boolean);
  const candidatesKey = idCandidates.join('|');
  const online = Boolean(profile?.driver_active_status ?? user?.driver_active_status ?? user?.driverActiveStatus);

  // Available vehicles publish in foreground; active trips retain the native background task.
  useEffect(() => {
    if (!isDriver || !online) return;
    let disposed = false;
    let watcher: Location.LocationSubscription | null = null;
    let inFlight = false;
    let starting = false;
    let lastPublished = 0;
    const start = async () => {
      if (watcher || starting || disposed || AppState.currentState !== 'active') return;
      starting = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted' || disposed) return;
        const next = await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:10000,distanceInterval:0}, async point => {
          if (disposed || inFlight || AppState.currentState !== 'active' || Date.now()-lastPublished<5000) return;
          inFlight = true;
          try {
            const {error} = await (supabase as any).schema('booking_v2').rpc('record_vehicle_position', {
              p_lat:point.coords.latitude,p_lng:point.coords.longitude,p_accuracy:point.coords.accuracy,
              p_recorded_at:new Date(point.timestamp).toISOString(),p_booking_id:null,
            });
            if(error) console.warn('[VehicleMap] GPS not saved:',error.message);
            else lastPublished = Date.now();
          } catch(error) { console.warn('[VehicleMap] GPS request failed:',error); }
          finally { inFlight = false; }
        });
        if (disposed || AppState.currentState !== 'active') next.remove(); else watcher = next;
      } catch(error) { console.warn('[VehicleMap] Foreground GPS unavailable:',error); }
      finally { starting = false; }
    };
    void start();
    const subscription = AppState.addEventListener('change',state => {
      if(state === 'active') void start(); else {watcher?.remove();watcher=null;}
    });
    return () => {disposed=true;watcher?.remove();subscription.remove();};
  }, [isDriver, online, candidatesKey]);

  useEffect(() => {
    console.log('[GlobalDriverTracking] userType="' + userType + '" isDriver=' + isDriver + ' candidates=' + idCandidates.length + ' [' + candidatesKey + ']');
    if (!isDriver || idCandidates.length === 0) {
      stopDriverLocationTracking();
      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let publicDriverId: string | null = null;
    let currentActiveBookingId: string | null = null;

    const reevaluate = async () => {
      if (cancelled) return;
      try {
        const headers = await getSupabaseAuthHeaders();
        if (!publicDriverId) {
          publicDriverId = await resolveDriverPublicId(idCandidates, headers);
          if (cancelled) return;
          if (!publicDriverId) {
            console.error('[GlobalDriverTracking] could not resolve users.id from', idCandidates);
            return;
          }
          console.log('[GlobalDriverTracking] resolved publicDriverId =', publicDriverId);
        }

        const statuses = ACTIVE_STATUSES.map(s => `"${s}"`).join(',');
        const url = `${SUPABASE_URL}/rest/v1/bookings_v2_mobile?driver_id=eq.${publicDriverId}&status=in.(${statuses})&order=created_at.desc&limit=1&select=id,status`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          console.error('[GlobalDriverTracking] bookings query failed:', resp.status, await resp.text());
          return;
        }
        const rows = await resp.json();
        if (cancelled) return;

        const activeBookingId: string | undefined = rows?.[0]?.id;
        currentActiveBookingId = activeBookingId ?? null;
        console.log('[GlobalDriverTracking] bookings query rows:', rows?.length ?? 0, rows?.[0] ?? 'none');
        if (activeBookingId) {
          console.log('[GlobalDriverTracking] active booking found:', activeBookingId, rows[0].status);
          const ok = await startDriverLocationTracking(activeBookingId, publicDriverId);
          if (!ok) {
            // No es un error: startDriverLocationTracking devuelve false cuando aún
            // faltan permisos/consentimiento de ubicación en segundo plano (en cuyo
            // caso ya se disparó la pantalla de divulgación) o cuando el usuario los
            // negó. El único fallo real (startLocationUpdatesAsync lanza) ya se
            // registra con console.error dentro de driverLocationTask. Aquí solo
            // avisamos —si fuera error, este hook lo repetiría cada 15s (poll).
            console.warn('[GlobalDriverTracking] tracking no iniciado: permisos/consentimiento de ubicación en segundo plano pendientes');
          }
        } else {
          await stopDriverLocationTracking();
        }
      } catch (e) {
        console.error('[GlobalDriverTracking] reevaluate exception:', e);
      }
    };

    reevaluate();

    const setupChannel = async () => {
      if (cancelled) return;
      if (!publicDriverId) return;
      channel = supabase
        .channel(`driver-active-bookings-${publicDriverId}`)
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `driver_id=eq.${publicDriverId}`,
          },
          () => {
            reevaluate();
          },
        )
        .subscribe(status => {
          console.log('[GlobalDriverTracking] realtime subscription status:', status);
        });
    };

    const pollInterval = setInterval(() => {
      if (channel === null && publicDriverId) setupChannel();
      reevaluate();
    }, 15000);

    // Watchdog anti-kill: detecta gaps prolongados sin puntos GPS y fuerza
    // restart del foreground service. Muchas veces `hasStartedLocationUpdatesAsync`
    // sigue reportando true tras un kill silencioso del OEM — el único signal
    // fiable es la ausencia de inserts recientes.
    const watchdogInterval = setInterval(async () => {
      if (cancelled) return;
      if (!currentActiveBookingId || !publicDriverId) return;
      try {
        const raw = await AsyncStorage.getItem(LAST_INSERT_KEY);
        if (!raw) {
          // Sin ningún punto insertado aún: puede ser normal en los primeros
          // segundos tras aceptar. No forzamos restart.
          return;
        }
        const last = JSON.parse(raw) as { lat: number; lng: number; time: number };
        const gap = Date.now() - (last?.time ?? 0);
        if (gap > WATCHDOG_GAP_MS) {
          console.warn(
            '[GlobalDriverTracking] watchdog: gap de ' + Math.round(gap / 1000) +
            's sin puntos GPS con booking activo ' + currentActiveBookingId +
            ' — forzando stop+start del tracking',
          );
          await stopDriverLocationTracking();
          await startDriverLocationTracking(currentActiveBookingId, publicDriverId);
          // Registrar el gap en BD para auditoría posterior. Best effort:
          // si la tabla notification_events aún no existe (feature futura),
          // el error se ignora y no rompe el flujo del watchdog.
          try {
            await supabase.from('notification_events' as any).insert({
              user_id: publicDriverId,
              event_type: 'tracking_gap',
              booking_id: currentActiveBookingId,
            } as any);
          } catch {
            // tabla no existe todavía o inserción bloqueada por RLS — ignorar
          }
        }
      } catch (e) {
        console.warn('[GlobalDriverTracking] watchdog exception:', e);
      }
    }, WATCHDOG_INTERVAL_MS);

    setupChannel();

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearInterval(watchdogInterval);
      if (channel) supabase.removeChannel(channel);
      stopDriverLocationTracking();
    };
  }, [isDriver, candidatesKey]);
}
