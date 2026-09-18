import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useBookingDriverPosition } from '@/hooks/useBookingDriverPosition';
import { formatDistanceAndEta, haversineKm } from '@/common/services/DriverTrackingService';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';

const ACCENT = '#00E5FF';
const PICKUP = '#00E5FF';
const DROP = '#E91E63';

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
  trip_distance?: number | string | null;
  distance?: number | string | null;
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
  /** Ajusta textos: cliente vs conductor */
  role?: 'customer' | 'driver';
};

/**
 * Barra de progreso del viaje para el banner:
 * - ACCEPTED: carrito avanza hacia el punto de recogida
 * - ARRIVED: carrito al 100% en recogida
 * - STARTED / otp verificado: carrito avanza hacia el destino
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
      return { lat: dropLat, lng: dropLng, kind: 'drop' as const };
    }
    if (pickupLat == null || pickupLng == null) return null;
    return { lat: pickupLat, lng: pickupLng, kind: 'pickup' as const };
  }, [phase, pickupLat, pickupLng, dropLat, dropLng]);

  const remainingKm = useMemo(() => {
    if (phase === 'at_pickup') return 0;
    if (!driverPosition || !target) return null;
    return haversineKm(driverPosition.lat, driverPosition.lng, target.lat, target.lng);
  }, [driverPosition, target, phase]);

  // Longitud del tramo pickup→destino (misma métrica haversine que remaining).
  // Evita mezclar trip_distance (ruta vial) con distancia lineal → progreso falso ~50%.
  const dropSegmentKm = useMemo(() => {
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return null;
    return Math.max(haversineKm(pickupLat, pickupLng, dropLat, dropLng), 0.12);
  }, [pickupLat, pickupLng, dropLat, dropLng]);

  const phaseKey = `${booking?.id || ''}:${phase}`;
  const [approachBaselineKm, setApproachBaselineKm] = useState<number | null>(null);

  useEffect(() => {
    setApproachBaselineKm(null);
  }, [phaseKey]);

  useEffect(() => {
    if (phase !== 'to_pickup' || remainingKm == null || remainingKm < 0.02) return;
    setApproachBaselineKm((prev) => {
      if (prev == null) return Math.max(remainingKm, 0.15);
      // Solo amplía si se aleja (desvío), nunca reduce
      if (remainingKm > prev * 1.12) return remainingKm;
      return prev;
    });
  }, [phase, remainingKm]);

  const progress = useMemo(() => {
    if (phase === 'at_pickup') return 1;
    if (remainingKm == null) return null;

    if (phase === 'to_drop') {
      const total = dropSegmentKm;
      if (total == null || total <= 0) return null;
      // Al arrancar, remaining ≈ distancia pickup→drop → progreso cerca de 0
      return Math.min(1, Math.max(0, 1 - remainingKm / total));
    }

    if (approachBaselineKm == null || approachBaselineKm <= 0) return null;
    return Math.min(1, Math.max(0, 1 - remainingKm / approachBaselineKm));
  }, [phase, remainingKm, dropSegmentKm, approachBaselineKm]);

  const meta = useMemo(() => {
    if (phase === 'at_pickup') {
      return {
        label: role === 'driver' ? 'En el punto de encuentro' : 'En el punto de recogida',
        detail: role === 'driver' ? 'Esperando código' : 'Confirma el código para iniciar',
      };
    }
    if (remainingKm == null) {
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
    const { distanciaTexto, etaTexto } = formatDistanceAndEta(remainingKm);
    return {
      label:
        phase === 'to_drop'
          ? 'Hacia el destino'
          : role === 'driver'
            ? 'Hacia el cliente'
            : 'Hacia la recogida',
      detail: `${distanciaTexto} · ~${etaTexto}`,
    };
  }, [phase, remainingKm, role]);

  const [trackW, setTrackW] = useState(0);
  const carX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const indeterminate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (progress != null || trackW <= 0) {
      indeterminate.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(indeterminate, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(indeterminate, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, trackW, indeterminate]);

  useEffect(() => {
    if (trackW <= 0) return;
    const carSize = 22;
    const maxX = Math.max(0, trackW - carSize);
    if (progress == null) {
      // Indeterminado: oscila en el centro
      const mid = maxX * 0.35;
      const range = maxX * 0.3;
      const id = indeterminate.addListener(({ value }) => {
        carX.setValue(mid + value * range);
      });
      return () => indeterminate.removeListener(id);
    }
    Animated.timing(carX, {
      toValue: maxX * progress,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, trackW, carX, indeterminate]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  const endColor = phase === 'to_drop' ? DROP : PICKUP;
  const fillOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

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
          {progress != null && trackW > 0 ? (
            <Animated.View
              style={[
                styles.trackFill,
                {
                  width: Math.max(4, trackW * progress),
                  backgroundColor: endColor,
                  opacity: fillOpacity,
                },
              ]}
            />
          ) : (
            <Animated.View style={[styles.trackFillSoft, { opacity: fillOpacity }]} />
          )}
          <Animated.View
            style={[
              styles.carChip,
              { transform: [{ translateX: carX }] },
            ]}
          >
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
  trackFillSoft: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,229,255,0.35)',
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
