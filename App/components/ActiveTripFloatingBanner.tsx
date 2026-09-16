import React, { useCallback, useMemo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';
import {
  useActiveTripBanner,
  type ActiveTripBannerBooking,
} from '@/hooks/useActiveTripBanner';

const ACCENT = '#00E5FF';
const ACTIVE_GREEN = '#00E676';
const BG = 'rgba(5, 26, 38, 0.96)';
const BORDER = 'rgba(0, 229, 255, 0.45)';

function truncateAddress(value?: string, max = 42): string {
  const text = String(value || '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

type BannerCardProps = {
  booking: ActiveTripBannerBooking;
  isDriver: boolean;
};

function BannerCard({ booking, isDriver }: BannerCardProps) {
  const navigation = useNavigation<any>();

  const counterpartName = useMemo(() => {
    if (isDriver) {
      return String(booking.customer_name || 'Cliente').trim() || 'Cliente';
    }
    return String(booking.driver_name || 'Conductor').trim() || 'Conductor';
  }, [booking.customer_name, booking.driver_name, isDriver]);

  const photoUri = useMemo(() => {
    const raw = isDriver ? booking.customer_image : booking.driver_image;
    const uri = String(raw || '').trim();
    return uri || null;
  }, [booking.customer_image, booking.driver_image, isDriver]);

  const pickup = truncateAddress(
    (booking.pickup_address as string) || undefined,
    40,
  );
  const dropoff = truncateAddress(
    (booking.drop_address as string) || undefined,
    40,
  );

  const openTrip = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      // ignore
    }

    // Desde el tabBar el navigator local es el de tabs; el stack raíz es el padre.
    const root =
      navigation.getParent?.()?.getParent?.() ||
      navigation.getParent?.() ||
      navigation;

    if (isDriver) {
      root.navigate('ReservationTrip', { reservation: booking });
    } else {
      root.navigate('CustomerActiveTrip', {
        bookingId: booking.id,
        booking,
      });
    }
  }, [booking, isDriver, navigation]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={openTrip}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="Viaje en curso. Abrir detalle del viaje"
    >
      <View style={styles.headerRow}>
        <View style={styles.statusRow}>
          <View style={styles.greenDot} />
          <Text {...FIXED_TEXT_PROPS} style={styles.title}>
            Viaje En Curso
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={ACCENT} />
      </View>

      <View style={styles.personRow}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={14} color={ACCENT} />
          </View>
        )}
        <Text {...FIXED_TEXT_PROPS} style={styles.personName} numberOfLines={1}>
          {counterpartName}
        </Text>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, styles.routeDotStart]} />
          <Text {...FIXED_TEXT_PROPS} style={styles.routeTxt} numberOfLines={1}>
            {pickup}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, styles.routeDotEnd]} />
          <Text {...FIXED_TEXT_PROPS} style={styles.routeTxt} numberOfLines={1}>
            {dropoff}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Aviso flotante compacto. Debe montarse DENTRO del slot `tabBar`
 * (junto al bottom nav) para quedar por encima del contenido de las tabs.
 */
export default function ActiveTripFloatingBanner() {
  const { booking, isDriver, hasActiveTrip } = useActiveTripBanner();

  if (!hasActiveTrip || !booking) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BannerCard booking={booking} isDriver={isDriver} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginBottom: 8,
    zIndex: 60,
    elevation: 60,
  },
  card: {
    backgroundColor: BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACTIVE_GREEN,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,229,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personName: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
  },
  routeBlock: {
    gap: 5,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  routeDotStart: {
    backgroundColor: ACTIVE_GREEN,
  },
  routeDotEnd: {
    backgroundColor: '#FF5252',
  },
  routeTxt: {
    flex: 1,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '500',
  },
});
