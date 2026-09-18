import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useBookingDriverPosition } from '@/hooks/useBookingDriverPosition';
import { formatDistanceAndEta, haversineKm } from '@/common/services/DriverTrackingService';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';

const ACCENT = '#00E5FF';
const PICKUP = '#00E5FF';
const DROP = '#E91E63';
/** Por debajo de esto se considera llegado (alineado con formatDistanceAndEta VERY_CLOSE). */
const CLOSE_KM = 0.2;

export type TripProgressPhase = 'to_pickup' | 'at_pickup' | 'to_drop';

type BookingLike = {
  id?: string;
  status?: string;
  otp_verified?: boolean;
  otp_timer_started_at?: string | null;
  pickup_lat?: number | string | null;
  pickup_lng?: number | string | null;
  drop_lat?: number | string | null;
  drop_lng?: number | string | null;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Fase del viaje: hacia recogida → en punto → hacia destino. */
export function resolveTripProgressPhase(booking?: BookingLike | null): TripProgressPhase {
  const st = String(booking?.status || '').toUpperCase();
  if (st === 'STARTED' || st === 'IN_PROGRESS' || st === 'TRIP_STARTED' || booking?.otp_verified) {
    return 'to_drop';
  }
  if (st === 'ARRIVED' || booking?.otp_timer_started_at) {
    return 'at_pickup';
  }
  return 'to_pickup';
}

type Props = {
  booking: BookingLike;
  compact?: boolean;
  role?: 'customer' | 'driver';
};

/**
 * Barra de progreso del banner.
 * Misma fuente de posición que el mapa (booking_tracking), pero sin animación
 * indeterminada: si el GPS parpadea, se mantiene el último progreso válido.
 */
const TripProgressLoader: React.FC<Props> = ({ booking, compact, role = 'customer' }) => {
  const phase = resolveTripProgressPhase(booking);
  const { driverPosition } = useBookingDriverPosition(booking?.id);

  const pickupLat = num(booking.pickup_lat);
  const pickupLng = num(booking.pickup_lng);
  const dropLat = num(booking.drop_lat);
  const dropLng = num(booking.drop_lng);

  const target = useMemo(() => {
    if (phase === 'to_drop') {
      if (dropLat == null || dropLng == null) return null;
      return { lat: dropLat, lng: dropLng };
    }
    if (pickupLat == null || pickupLng == null) return null;
    return { lat: pickupLat, lng: pickupLng };
  }, [phase, pickupLat, pickupLng, dropLat, dropLng]);

  const liveRemainingKm = useMemo(() => {
    if (phase === 'at_pickup') return 0;
    if (!driverPosition || !target) return null;
    return haversineKm(driverPosition.lat, driverPosition.lng, target.lat, target.lng);
  }, [driverPosition, target, phase]);

  const dropSegmentKm = useMemo(() => {
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return null;
    return Math.max(haversineKm(pickupLat, pickupLng, dropLat, dropLng), CLOSE_KM);
  }, [pickupLat, pickupLng, dropLat, dropLng]);

  const phaseKey = `${booking?.id || ''}:${phase}`;
  const approachBaselineRef = useRef<number | null>(null);
  const lastProgressRef = useRef(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayRemainingKm, setDisplayRemainingKm] = useState<number | null>(null);

  useEffect(() => {
    approachBaselineRef.current = null;
    lastProgressRef.current = phase === 'at_pickup' ? 1 : 0;
    setDisplayProgress(phase === 'at_pickup' ? 1 : 0);
    setDisplayRemainingKm(phase === 'at_pickup' ? 0 : null);
  }, [phaseKey, phase]);

  useEffect(() => {
    if (phase === 'at_pickup') {
      lastProgressRef.current = 1;
      setDisplayProgress(1);
      setDisplayRemainingKm(0);
      return;
    }

    // GPS ausente un momento: no reiniciar ni oscilar; conservar último valor
    if (liveRemainingKm == null) return;

    setDisplayRemainingKm(liveRemainingKm);

    // Muy cerca → progreso completo (evita carrito a mitad con “Conductor muy cerca”)
    if (liveRemainingKm <= CLOSE_KM) {
      lastProgressRef.current = 1;
      setDisplayProgress(1);
      return;
    }

    let next = 0;
    if (phase === 'to_drop') {
      const total = dropSegmentKm;
      if (total == null || total <= 0) return;
      next = 1 - liveRemainingKm / total;
    } else {
      if (approachBaselineRef.current == null) {
        approachBaselineRef.current = Math.max(liveRemainingKm, CLOSE_KM);
      } else if (liveRemainingKm > approachBaselineRef.current * 1.25) {
        // Solo ampliar en desvío claro (umbral alto para no bailar con ruido GPS)
        approachBaselineRef.current = liveRemainingKm;
      }
      next = 1 - liveRemainingKm / approachBaselineRef.current;
    }

    next = Math.min(1, Math.max(0, next));

    // Progreso monotónico suave: no retroceder por ruido GPS (salvo desvío grande)
    const prev = lastProgressRef.current;
    if (next + 0.04 < prev && liveRemainingKm > CLOSE_KM * 1.5) {
      // Retroceso real posible (se alejó); permitir bajar un poco
      next = Math.max(next, prev - 0.08);
    } else {
      next = Math.max(prev, next);
    }

    // Suavizado: no saltar de golpe
    const smoothed = prev + (next - prev) * 0.55;
    lastProgressRef.current = smoothed;
    setDisplayProgress(smoothed);
  }, [phase, liveRemainingKm, dropSegmentKm]);

  const meta = useMemo(() => {
    if (phase === 'at_pickup') {
      return {
        label: role === 'driver' ? 'En el punto de encuentro' : 'En el punto de recogida',
        detail: role === 'driver' ? 'Esperando código' : 'Confirma el código para iniciar',
      };
    }
    if (displayRemainingKm == null) {
      return {
        label:
          phase === 'to_drop'
            ? 'En camino al destino'
            : role === 'driver'
              ? 'En camino al cliente'
              : 'Conductor en camino',
        detail: 'Localizando…',
      };
    }
    const { distanciaTexto, etaTexto } = formatDistanceAndEta(displayRemainingKm);
    return {
      label:
        phase === 'to_drop'
          ? 'Hacia el destino'
          : role === 'driver'
            ? 'Hacia el cliente'
            : 'Hacia la recogida',
      detail: `${distanciaTexto} · ~${etaTexto}`,
    };
  }, [phase, displayRemainingKm, role]);

  const [trackW, setTrackW] = useState(0);
  const carX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (trackW <= 0) return;
    const carSize = 22;
    const maxX = Math.max(0, trackW - carSize);
    Animated.timing(carX, {
      toValue: maxX * displayProgress,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [displayProgress, trackW, carX]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  const endColor = phase === 'to_drop' ? DROP : PICKUP;
  const fillOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const fillWidth = trackW > 0 ? Math.max(4, trackW * displayProgress) : 4;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.labelRow}>
        <Ionicons
          name={phase === 'to_drop' ? 'navigate' : phase === 'at_pickup' ? 'location' : 'car'}
          size={11}
          color={ACCENT}
        />
        <Text {...FIXED_TEXT_PROPS} style={styles.label} numberOfLines={1}>
          {meta.label}
        </Text>
        <Text {...FIXED_TEXT_PROPS} style={styles.detail} numberOfLines={1}>
          {meta.detail}
        </Text>
      </View>

      <View style={styles.trackRow}>
        <View style={[styles.endpoint, { backgroundColor: PICKUP }]} />
        <View style={styles.track} onLayout={onTrackLayout}>
          <View style={styles.trackBg} />
          <Animated.View
            style={[
              styles.trackFill,
              {
                width: fillWidth,
                backgroundColor: endColor,
                opacity: fillOpacity,
              },
            ]}
          />
          <Animated.View style={[styles.carChip, { transform: [{ translateX: carX }] }]}>
            <FontAwesome5 name="car" size={10} color="#001824" />
          </Animated.View>
        </View>
        <View style={[styles.endpoint, { backgroundColor: endColor, borderColor: endColor }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    gap: 6,
  },
  wrapCompact: {
    marginTop: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  detail: {
    marginLeft: 'auto',
    color: 'rgba(0,229,255,0.9)',
    fontSize: 9,
    fontWeight: '600',
    maxWidth: '52%',
    textAlign: 'right',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  endpoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  track: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
    overflow: 'visible',
  },
  trackBg: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  carChip: {
    position: 'absolute',
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
});

export default TripProgressLoader;
