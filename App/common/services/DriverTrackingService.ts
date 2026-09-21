import supabase from '@/config/SupabaseConfig';

export interface DriverLocation {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
}

/**
 * Obtener última ubicación del conductor desde Supabase booking_tracking table
 */
export const getLatestTrackingPoint = async (
  bookingId: string
): Promise<DriverLocation | null> => {
  try {
    const { data, error } = await supabase
      .from('booking_tracking')
      .select('lat, lng, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.warn('[DriverTracking] Supabase error:', error.message);
      return null;
    }

    if (data) {
      return {
        lat: data.lat,
        lng: data.lng,
        timestamp: new Date(data.created_at).getTime()
      };
    }

    return null;
  } catch (error: any) {
    console.error('[DriverTracking] Error getting latest point:', error);
    return null;
  }
};

/**
 * Escuchar cambios en tiempo real en la tabla booking_tracking de Supabase
 * Esta es la FUNCIÓN PRINCIPAL para recibir actualizaciones de ubicación del conductor
 */
export const subscribeToDriverTracking = (
  bookingId: string,
  onLocationUpdate: (location: DriverLocation) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    const channel = supabase
      .channel(`tracking_${bookingId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: bookingId },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reserva_tracking',
          filter: `id_reserva=eq.${bookingId}`
        },
        (payload) => {
          const record = payload.new;
          const location: DriverLocation = {
            lat: record.lat,
            lng: record.lng,
            timestamp: new Date(record.created_at).getTime(),
            accuracy: record.accuracy
          };
          
          console.log('[DriverTracking] Supabase realtime update:', location);
          onLocationUpdate(location);
        }
      )
      .subscribe((status) => {
        console.log('[DriverTracking] Subscription status:', status);
        if (status === 'SUBSCRIPTION_ERROR') {
          onError?.(new Error('Failed to subscribe to driver tracking'));
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (error: any) {
    console.error('[DriverTracking] Subscription setup error:', error);
    onError?.(error);
    return () => {};
  }
};

/**
 * Calcular distancia entre dos puntos en kilómetros
 */
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calcula distancia y ETA usando Haversine (sin API externa).
 * Aplica factor urbano 1.35 para compensar distancia lineal vs. calles reales.
 * Velocidad promedio 25 km/h (tráfico urbano Bogotá).
 */
export const calcEtaLocal = (
  driverLat: number,
  driverLng: number,
  pickupLat: number,
  pickupLng: number
): { distanceKm: number; etaMin: number } => {
  const linearKm = calculateDistance(driverLat, driverLng, pickupLat, pickupLng);
  const distanceKm = Math.round(linearKm * 1.35 * 100) / 100; // factor urbano
  const etaMin = Math.max(1, Math.ceil((distanceKm / 25) * 60));
  return { distanceKm, etaMin };
};

/** Alias exportado con la firma estándar para uso en pantallas. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return calculateDistance(lat1, lng1, lat2, lng2);
}

export type DistanceEtaState = 'VERY_CLOSE' | 'NORMAL' | 'FAR';

export interface DistanceEtaResult {
  distanciaTexto: string;
  etaTexto: string;
  estado: DistanceEtaState;
}

/**
 * Formatea distancia y ETA con factores urbanos variables por rango.
 * Recibe la distancia lineal en km (sin factor urbano aplicado).
 *
 * Rangos de factor urbano y velocidad:
 *   < 1 km  → factor 1.50, velocidad 15 km/h  (calles muy cortas, muchas esquinas)
 *   1–5 km  → factor 1.35, velocidad 25 km/h  (tráfico urbano estándar)
 *   > 5 km  → factor 1.25, velocidad 35 km/h  (empieza a haber arterias / vías rápidas)
 *
 * Estados especiales:
 *   VERY_CLOSE : distancia lineal < 200 m → texto fijo, ETA 1 min
 *   FAR        : distancia ajustada > 15 km → ETA redondeada a múltiplos de 5 min
 */
export function formatDistanceAndEta(linearKm: number): DistanceEtaResult {
  if (linearKm < 0.2) {
    return {
      distanciaTexto: 'Conductor muy cerca',
      etaTexto: '1 min',
      estado: 'VERY_CLOSE',
    };
  }

  let urbanFactor: number;
  let speedKmh: number;

  if (linearKm < 1) {
    urbanFactor = 1.5;
    speedKmh = 15;
  } else if (linearKm <= 5) {
    urbanFactor = 1.35;
    speedKmh = 25;
  } else {
    urbanFactor = 1.25;
    speedKmh = 35;
  }

  const adjustedKm = linearKm * urbanFactor;
  const rawMin = (adjustedKm / speedKmh) * 60;

  const distanciaTexto = adjustedKm < 1
    ? `${Math.round(adjustedKm * 1000)} m`
    : `${adjustedKm.toFixed(1)} km`;

  if (adjustedKm > 15) {
    const roundedMin = Math.ceil(rawMin / 5) * 5;
    const h = Math.floor(roundedMin / 60);
    const m = roundedMin % 60;
    const etaTexto = h > 0
      ? (m > 0 ? `~${h}h ${m}m` : `~${h}h`)
      : `~${roundedMin} min`;
    return { distanciaTexto, etaTexto, estado: 'FAR' };
  }

  return {
    distanciaTexto,
    etaTexto: `${Math.max(1, Math.round(rawMin))} min`,
    estado: 'NORMAL',
  };
}

/**
 * Obtener ETA usando Mapbox Directions API
 */
export const getEstimatedTime = async (
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mapboxToken: string
): Promise<{ distance: number; duration: number } | null> => {
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${originLng},${originLat};${destLng},${destLat}?` +
      `access_token=${mapboxToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // convertir a km
        duration: Math.ceil(route.duration / 60) // convertir a minutos
      };
    }

    return null;
  } catch (error: any) {
    console.error('[DriverTracking] Error calculating ETA:', error);
    return null;
  }
};
