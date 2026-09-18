import { GetTripDistance, GetDistance } from "../other/GeoFunctions";
import { settings } from '@/scripts/settings';
import { FareCalculator } from "../actions/FareCalculator";
import { isNearAirport } from "../utils/airports";
import { DEFAULT_UMBRAL_INTERMUNICIPAL_KM } from "../../constants/fare";
import { colors } from "@/scripts/theme";
import supabase from "@/config/SupabaseConfig";
import { getLocalTrackingBackup, clearLocalTrackingBackup } from "@/common/services/driverLocationTask";

export const MAIN_COLOR = colors.TAXIPRIMARY;

export const appConsts = {
  needEmergemcy: true,
  hasMultiDrop: true,
  makePending: false,
  hasOptions: false,
  checkWallet: true,
  acceptWithAmount: false,
  hasStartOtp: true,
  canCall: true,
  showBookingOptions: false,
  captureBookingImage: false,
};

export const saveAddresses = async (booking: any, driverLocation: any) => {
  // Guardamos la dirección de destino como lugar reciente en Supabase
  try {
    await supabase.from('favorite_places' as any).upsert({
      user_id: booking.customer,
      name: booking.drop?.add || 'Destino reciente',
      description: booking.drop?.add || '',
      latitude: driverLocation.lat,
      longitude: driverLocation.lng,
      is_favorite: false,
    } as any);
  } catch {}
};

export const checkSearchPhrase = (_str: string) => '';

// Convierte un epoch en ms (número o string numérico) o un timestamp ISO a ms.
// Devuelve null si el valor no representa un instante válido y positivo.
const toEpochMs = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return isFinite(n) && n > 0 ? n : null;
  }
  const t = new Date(s).getTime();
  return isFinite(t) && t > 0 ? t : null;
};

// Resuelve el instante de inicio del viaje priorizando la fuente PERSISTIDA en
// BD (`trip_start_time`, ISO) sobre `startTime` (ref en memoria del componente,
// que se reinicia a 0 si la pantalla se remonta durante el viaje —app en
// segundo plano, bloqueo de pantalla, viaje largo— y hacía que `total_trip_time`
// diera ~0). Devuelve 0 si no hay ninguna fuente confiable; el llamador
// reintenta con el lapso real de `booking_tracking`.
export const resolveTripStartMs = (booking: any): number =>
  toEpochMs(booking?.trip_start_time) ?? toEpochMs(booking?.startTime) ?? 0;


const MAX_GPS_SPEED_KMH = 160;
const MAX_ACCURACY_M = 50;
const MIN_STEP_M = 8;

type TrackingPoint = { lat: number; lng: number; ts: number; accuracy: number | null };

const parseQuotedDistanceKm = (raw: any): number => {
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : 0;
};

/** Solo puntos entre inicio y fin de viaje, sin jitter ni saltos imposibles. */
export const filterBillableTracking = (
  rows: any[] | null | undefined,
  tripStartMs: number,
  tripEndMs: number,
): TrackingPoint[] => {
  if (!rows?.length || tripStartMs <= 0) return [];

  const inWindow: TrackingPoint[] = [];
  for (const row of rows) {
    const ts = toEpochMs(row?.created_at);
    if (!ts || ts < tripStartMs || ts > tripEndMs) continue;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const acc = row.accuracy == null ? null : Number(row.accuracy);
    if (acc != null && isFinite(acc) && acc > MAX_ACCURACY_M) continue;
    inWindow.push({ lat, lng, ts, accuracy: acc });
  }

  const kept: TrackingPoint[] = [];
  for (const p of inWindow) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(p);
      continue;
    }
    const stepM = GetDistance(last.lat, last.lng, p.lat, p.lng) * 1000;
    if (stepM < MIN_STEP_M) continue;
    const dtSec = Math.max((p.ts - last.ts) / 1000, 1);
    const maxM = (MAX_GPS_SPEED_KMH * 1000 / 3600) * dtSec;
    if (stepM > maxM) continue;
    kept.push(p);
  }
  return kept;
};

export const addActualsToBooking = async (
  booking: any,
  // Contexto que FareCalculator necesita y que NO se puede derivar de la fila
  // `bookings` (hoy no existen columnas is_scheduled/is_protocol/tolls_total/
  // parking en BD — ver [[21-calculo-tarifa]] deuda técnica). El llamador debe
  // pasarlo explícito si aplica (ej. ReservationTripScreen siempre isScheduled=true).
  extraFareContext: { isScheduled?: boolean; isProtocol?: boolean; tollsTotal?: number; parking?: number } = {}
) => {
  console.log('Inicio de addActualsToBooking con booking:', booking);

  const end_time = new Date();

  // ⏱️ Inicio del viaje. Fuente autoritativa: `trip_start_time` en BD. El
  // objeto en memoria es un route param estático que NO se refresca tras el
  // UPDATE de STARTED, y `startTime` (ref del componente) se reinicia a 0 si la
  // pantalla se remonta durante el viaje —app en segundo plano, bloqueo de
  // pantalla, viaje largo—; ambos hacían que `total_trip_time` diera ~0 (y con
  // tiempo 0 el FareCalculator no recalculaba por tiempo). Si todo falla, más
  // abajo se reintenta con el lapso real de `booking_tracking`.
  let dbTripStart: string | null = null;
  try {
    const { data: startRow } = await supabase
      .from('bookings')
      .select('trip_start_time, distance')
      .eq('id', booking.id)
      .maybeSingle();
    dbTripStart = (startRow as any)?.trip_start_time ?? null;
    if ((startRow as any)?.distance != null && booking.distance == null) {
      booking.distance = (startRow as any).distance;
    }
  } catch (e) {
    console.warn('[addActualsToBooking] no se pudo leer trip_start_time de BD:', e);
  }

  const startMs = toEpochMs(dbTripStart) ?? resolveTripStartMs(booking);
  let totalTimeTaken = startMs > 0
    ? Math.abs(Math.round((end_time.getTime() - startMs) / 1000))
    : 0;

  // bookings.trip_end_time es `timestamp with time zone` — un string "H:M:S"
  // sin padding ni fecha no es un timestamptz válido y Postgres rechaza el
  // UPDATE completo (silenciado por el catch de abajo). Usar ISO.
  booking.trip_end_time = end_time.toISOString();
  booking.endTime = end_time.getTime();
  booking.total_trip_time = totalTimeTaken;

  if (!settings.prepaid) {
    // ── PISO AL MÍNIMO COTIZADO ─────────────────────────────────────────
    // Mínimo del rango que se le mostró/cotizó al cliente al crear la reserva
    // (`trip_cost` = `driver_share` = `totalCost` al momento del quote).
    // El recálculo real al finalizar el viaje puede SUBIR este valor si el
    // servicio resultó más largo en kilómetros o tiempo, pero NUNCA puede
    // bajarlo: aunque el viaje se haya quedado corto (no se llegó al destino)
    // o la ruta real dé un precio menor, el cliente paga como mínimo lo
    // cotizado. Invariante: precio_final >= mínimo_del_rango_cotizado.
    const quotedMinFare =
      parseFloat(booking.trip_cost) ||
      parseFloat(booking.driver_share) ||
      0;
    // Nota: `price`/`estimate` (lo que lee CustomerActiveTripScreen.tsx) se
    // popula UNA sola vez al crear la reserva con el máximo del rango
    // (`clientPrice`, con margen) y nunca se recalculaba acá — quedaba
    // desalineado del precio real del conductor. Ahora, al finalizar,
    // cliente y conductor reciben el MISMO valor final (ver `finalClientCost`
    // abajo) — no hace falta un piso propio del lado cliente, hereda el de
    // `finalCost`.

    // Leer tarifas desde Supabase car_types (fuente única de verdad)
    let rates: any = {};
    const carTypeName =
      booking.carType ||
      booking.car_type ||
      booking.category ||
      booking.vehicle_type ||
      null;
    if (carTypeName) {
      const { data: carTypeRows } = await supabase
        .from('car_types')
        .select('*')
        .eq('name', carTypeName)
        .eq('is_active', true)
        .limit(1);

      if (carTypeRows?.length) {
        const ct: any = carTypeRows[0];
        rates = {
          rate_per_unit_distance:     parseFloat(ct.price_per_km)       || 0,
          rate_per_unit_distance_inter: parseFloat(ct.price_per_km_inter) || 0,
          rate_per_hour:              parseFloat(ct.rate_per_hour)       || 0,
          rate_per_hour_inter:        parseFloat(ct.rate_per_hour_inter) || 0,
          valor_hora:                 parseFloat(ct.valor_hora)          || 0,
          base_fare:                  parseFloat(ct.base_price)          || 0,
          base_fare_inter:            parseFloat(ct.base_price_inter)    || 0,
          min_fare:                   parseFloat(ct.min_fare)            || 0,
          min_fare_inter:             parseFloat(ct.min_fare_inter)      || 0,
          delta_aeropuerto:           parseFloat(ct.delta_aeropuerto)    || 0,
          delta_aeropuerto_prog:      parseFloat(ct.delta_aeropuerto_prog) || 0,
          convenience_fees:           parseFloat(ct.convenience_fee)     || 0,
          convenience_fee_type:       ct.convenience_fee_type            || 'flat',
        };
      } else {
        console.warn('[addActualsToBooking] car_types no encontrado para:', carTypeName);
      }
    } else {
      console.warn('[addActualsToBooking] booking sin car_type/carType');
    }

    // Reconciliación con el respaldo local (buffer en el teléfono, ver
    // `driverLocationTask.ts`). El tracking en tiempo real es la fuente
    // principal (el cliente ya lo vio en vivo); esto solo rellena huecos si
    // hubo caídas de red. Insertamos ÚNICAMENTE los puntos que faltan en el
    // servidor (dedup por coordenada): el respaldo local guarda TODOS los
    // puntos —incluidos los que sí se subieron—, así que reinsertar el buffer
    // completo (como hacía la comparación por conteo `local > server+1`)
    // DUPLICABA/TRIPLICABA la ruta y por tanto los km recorridos.
    // Ver [[13-servicio-driver-tracking]].
    try {
      const localBackup = await getLocalTrackingBackup(booking.id);
      if (localBackup.length > 0) {
        const { data: serverPts } = await supabase
          .from('booking_tracking' as any)
          .select('lat, lng')
          .eq('booking_id', booking.id);
        // El mismo punto capturado llega al servidor con OTRO `created_at` (lo
        // pone la BD al insertar), pero con idéntico lat/lng — así que la
        // coordenada redondeada (~0.1 m) es la clave de deduplicado, no el
        // tiempo.
        const coordKey = (lat: any, lng: any) =>
          `${Number(lat).toFixed(6)}|${Number(lng).toFixed(6)}`;
        const serverKeys = new Set(
          (serverPts || []).map((p: any) => coordKey(p.lat, p.lng))
        );
        const missing = localBackup.filter(
          (p) => !serverKeys.has(coordKey(p.lat, p.lng))
        );
        if (missing.length > 0) {
          console.warn(
            `[addActualsToBooking] Reconciliando ${missing.length} punto(s) faltante(s) ` +
            `(respaldo local ${localBackup.length} pts, servidor ${serverPts?.length ?? 0} pts).`
          );
          const rows = missing.map((p) => ({
            booking_id: booking.id,
            driver_id: booking.driver || booking.driver_id || null,
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            // Preservar el instante real de captura, no el de la subida —
            // si no, todos los puntos reconciliados caerían con el mismo
            // created_at (ahora) y arruinarían el orden cronológico que usa
            // el cálculo de distancia.
            created_at: new Date(p.ts).toISOString(),
          }));
          const { error: reconcileError } = await supabase
            .from('booking_tracking' as any)
            .insert(rows as any);
          if (reconcileError) {
            console.error('[addActualsToBooking] error subiendo respaldo local:', reconcileError);
          }
        }
      }
      await clearLocalTrackingBackup(booking.id);
    } catch (e) {
      console.warn('[addActualsToBooking] error reconciliando respaldo local:', e);
    }

    // Tracking desde Supabase. `booking_tracking` no tiene columna `timestamp`
    // (solo `created_at`/`updated_at` — ver `App/supabase/BBDDRemota.sql`).
    // El select/order anterior por `timestamp` fallaba en PostgREST (columna
    // inexistente); el error no se chequeaba, así que `trackingRows` quedaba
    // undefined y `distance` siempre daba 0 sin ningún error visible.
    const { data: trackingRows, error: trackingError } = await supabase
      .from('booking_tracking' as any)
      .select('lat, lng, created_at, accuracy')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true });

    if (trackingError) {
      console.error('[addActualsToBooking] error leyendo booking_tracking:', trackingError);
    }


    const tripEndMs = end_time.getTime();
    const billablePoints = filterBillableTracking(trackingRows, startMs, tripEndMs);

    if (totalTimeTaken <= 0 && billablePoints.length >= 2) {
      const firstTs = billablePoints[0].ts;
      const lastTs = billablePoints[billablePoints.length - 1].ts;
      if (lastTs > firstTs) {
        totalTimeTaken = Math.round((lastTs - firstTs) / 1000);
        booking.total_trip_time = totalTimeTaken;
        console.warn(
          `[addActualsToBooking] total_trip_time recuperado del GPS en ventana de viaje: ${totalTimeTaken}s`
        );
      }
    }

    const trackingVal: Record<string, any> = {};
    billablePoints.forEach((p, i) => {
      trackingVal[`p${i}`] = { lat: p.lat, lng: p.lng, status: 'STARTED' };
    });

    const res = await GetTripDistance(trackingVal);
    let distance = settings.convert_to_mile ? res.distance / 1.609344 : res.distance;

    const quotedDistanceKm = parseQuotedDistanceKm(booking.distance);
    const gpsTooSparse = billablePoints.length < 3;
    const gpsNearZero = !isFinite(distance) || distance < 0.2;
    if (quotedDistanceKm > 0 && (gpsTooSparse || gpsNearZero)) {
      console.warn(
        `[addActualsToBooking] GPS de viaje insuficiente ` +
        `(puntos=${billablePoints.length}, km=${distance}). Se usa distancia cotizada ${quotedDistanceKm} km.`
      );
      distance = quotedDistanceKm;
    }

    // Detección por coords (Haversine + 40 aeropuertos Colombia).
    // booking.pickup / booking.drop traen { lat, lng } desde el INSERT original.
    const pickupLat = parseFloat(booking.pickup?.lat ?? booking.pickup_lat);
    const pickupLng = parseFloat(booking.pickup?.lng ?? booking.pickup_lng);
    const dropLat = parseFloat(booking.drop?.lat ?? booking.drop_lat);
    const dropLng = parseFloat(booking.drop?.lng ?? booking.drop_lng);
    // Aeropuerto: origen o destino ≤1 km de un punto en airports.json
    // → suma car_types.delta_aeropuerto (fallback 12k).
    const oAir = !isNaN(pickupLat) && !isNaN(pickupLng) ? isNearAirport(pickupLat, pickupLng) : null;
    const dAir = !isNaN(dropLat) && !isNaN(dropLng) ? isNearAirport(dropLat, dropLng) : null;
    const isAirport = !!(oAir || dAir);
    if (isAirport) {
      console.log('[addActualsToBooking] Delta aeropuerto ON:', oAir || dAir, {
        pickup: [pickupLat, pickupLng],
        drop: [dropLat, dropLng],
      });
    }

    // Reserva programada: booking_type reservation / bookLater / caller.
    const bookingType = String(booking.booking_type || booking.bookingType || '').toLowerCase();
    const isScheduledResolved =
      extraFareContext.isScheduled === true ||
      booking.bookLater === true ||
      bookingType.includes('reserv');

    const isIntermunicipal = distance > DEFAULT_UMBRAL_INTERMUNICIPAL_KM;

    const { totalCost, grandTotal, convenience_fees } = FareCalculator(
      distance,
      totalTimeTaken,
      rates,
      null,
      settings.decimal,
      {
        isAirport,
        isIntermunicipal,
        ...extraFareContext,
        isScheduled: isScheduledResolved,
      }
    );

    console.log('Tarifas calculadas:', { totalCost, grandTotal, convenience_fees });

    // Aplicar el piso: el precio final del servicio nunca queda por debajo del
    // mínimo cotizado. Si el recálculo real es mayor (viaje más largo), se
    // cobra el recálculo; si es menor (viaje corto / no se llegó al destino),
    // se cobra el mínimo cotizado.
    const finalCost = Math.max(totalCost, quotedMinFare);
    const floorApplied = finalCost > totalCost;
    if (floorApplied) {
      console.log(
        `[addActualsToBooking] Piso aplicado (conductor): recalculado ${totalCost} < mínimo cotizado ${quotedMinFare}. Se cobra el mínimo cotizado ${finalCost}.`
      );
    }

    // Precio al finalizar: mismo valor para cliente y conductor (sin margen
    // de rango). El piso ya está en finalCost.
    const finalClientCost = finalCost;

    booking.drop = { add: booking.drop?.add, lat: booking.drop?.lat, lng: booking.drop?.lng };
    booking.dropAddress = booking.drop.add;
    booking.trip_cost = finalCost;
    booking.price = finalClientCost;
    booking.estimate = finalClientCost;
    booking.distance = parseFloat(distance).toFixed(settings.decimal);
    // Si se aplicó el piso, conservar la comisión cotizada originalmente para
    // que el total tampoco baje; si el recálculo mandó, usar la recalculada.
    booking.convenience_fees = floorApplied
      ? (parseFloat(booking.convenience_fees) || convenience_fees)
      : convenience_fees;
    booking.driver_share = finalCost;
    booking.coords = res.coords;
  }

  // Actualizar en Supabase
  try {
    await supabase
      .from('bookings')
      .update({
        trip_cost:        booking.trip_cost,
        driver_share:     booking.driver_share,
        // `price` es el campo que realmente lee la pantalla del cliente
        // (`booking.price || booking.estimate`) y `estimate` el fallback —
        // ninguno de los dos se tocaba acá antes, quedaban con la
        // cotización original de creación para siempre. Ahora ambos
        // reflejan el precio cliente final (conductor + margen 25%, con su
        // propio piso — ver arriba), consistente con `trip_cost`.
        price:            booking.price,
        estimate:         booking.estimate,
        convenience_fees: booking.convenience_fees,
        distance:         booking.distance,
        trip_end_time:    booking.trip_end_time,
        total_trip_time:  booking.total_trip_time,
        drop_lat:         booking.drop?.lat,
        drop_lng:         booking.drop?.lng,
        drop_address:     booking.drop?.add,
        coords:           booking.coords,
        status:           booking.status,
        driver_status:    booking.driver_status,
        customer_status:  booking.customer_status,
      } as any)
      .eq('id', booking.id);
    console.log('Reserva actualizada en Supabase.');
  } catch (error) {
    console.error('Error al actualizar la reserva en Supabase:', error);
  }

  return booking;
};

export const updateDriverQueue = (booking: any) => booking;

export const driverQueue = false;
