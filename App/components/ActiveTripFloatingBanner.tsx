import React, { useCallback, useMemo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';
import {
  useActiveTripBanner,
  activeTripTitle,
  isImmediateBookingType,
  isReservationBookingType,
  isWaitingAcceptanceStatus,
  type ActiveTripBannerBooking,
} from '@/hooks/useActiveTripBanner';
import TripProgressLoader from '@/components/TripProgressLoader';
import WaitingAcceptanceLoader from '@/components/WaitingAcceptanceLoader';

const ACCENT = '#00E5FF';
const ACTIVE_GREEN = '#00E676';

function truncateAddress(value?: string, max = 36): string {
  const text = String(value || '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatReservationWhen(booking: ActiveTripBannerBooking): string | null {
  if (!isReservationBookingType(booking.booking_type as string)) return null;
  const raw =
    (booking.booking_date as string) ||
    (booking.trip_date as string) ||
    (booking.scheduled_at as string) ||
    '';
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'p. m.' : 'a. m.';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${h}:${m} ${ampm}`;
}

/** Busca el navigator que declare la ruta (stack raíz con ReservationTrip, etc.). */
function findNavigatorWithRoute(navigation: any, routeName: string): any | null {
  let current = navigation;
  let depth = 0;
  while (current && depth < 8) {
    const names = current.getState?.()?.routeNames as string[] | undefined;
    if (names?.includes(routeName)) return current;
    current = current.getParent?.();
    depth += 1;
  }
  return null;
}

export type BannerVariant = 'default' | 'profile' | 'list' | 'driverGo';
export type BannerTripFilter = 'all' | 'immediate' | 'reservation';

type BannerCardProps = {
  booking: ActiveTripBannerBooking;
  isDriver: boolean;
  stackNavigation: any;
  variant?: BannerVariant;
};

function BannerCard({ booking, isDriver, stackNavigation, variant = 'default' }: BannerCardProps) {
  const isProfile = variant === 'profile';
  const isList = variant === 'list';
  const isDriverGo = variant === 'driverGo';
  const isCompact = isProfile || isList || isDriverGo;

  const counterpartName = useMemo(() => {
    if (isDriver) {
      return String(booking.customer_name || 'Cliente').trim() || 'Cliente';
    }
    return String(booking.driver_name || 'Conductor').trim() || 'Conductor';
  }, [booking.customer_name, booking.driver_name, isDriver]);

  const photoUri = useMemo(() => {
    const uri = String(
      booking.counterpart_photo ||
        (isDriver ? booking.customer_image : booking.driver_image) ||
        '',
    ).trim();
    if (
      uri.startsWith('http') ||
      uri.startsWith('file:') ||
      uri.startsWith('content:')
    ) {
      return uri;
    }
    return null;
  }, [booking.counterpart_photo, booking.customer_image, booking.driver_image, isDriver]);

  const pickup = truncateAddress(
    (booking.pickup_address as string) || undefined,
    isDriverGo ? 26 : isProfile ? 28 : 34,
  );
  const dropoff = truncateAddress(
    (booking.drop_address as string) || undefined,
    isDriverGo ? 26 : isProfile ? 28 : 34,
  );
  const whenLabel = formatReservationWhen(booking);

  const openTrip = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      // ignore
    }

    const routeName = isDriver ? 'ReservationTrip' : 'CustomerActiveTrip';
    const params = isDriver
      ? { reservation: booking }
      : { bookingId: booking.id, booking };

    const target =
      findNavigatorWithRoute(stackNavigation, routeName) || stackNavigation;

    try {
      target.navigate(routeName, params);
    } catch (e) {
      console.warn('[ActiveTripBanner] navigate failed', routeName, e);
    }
  }, [booking, isDriver, stackNavigation]);

  const statusTitle = activeTripTitle(booking);
  const isWaiting = !isDriver && isWaitingAcceptanceStatus(booking.status);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isProfile && styles.cardProfile,
        isList && styles.cardList,
        isDriverGo && styles.cardDriverGo,
        isWaiting && styles.cardWaiting,
      ]}
      onPress={openTrip}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${statusTitle}. Abrir detalle del viaje`}
    >
      <View style={styles.topRow}>
        {isWaiting ? (
          <WaitingAcceptanceLoader />
        ) : photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={12} color={ACCENT} />
          </View>
        )}
        <View style={styles.topMeta}>
          <View style={styles.statusRow}>
            <View style={[styles.greenDot, isWaiting && styles.waitingDot]} />
            <Text {...FIXED_TEXT_PROPS} style={styles.title} numberOfLines={1}>
              {statusTitle}
            </Text>
          </View>
          {!isWaiting ? (
            <Text {...FIXED_TEXT_PROPS} style={styles.personName} numberOfLines={1}>
              {counterpartName}
            </Text>
          ) : (
            <Text {...FIXED_TEXT_PROPS} style={styles.waitingHint} numberOfLines={1}>
              Buscando conductor cercano…
            </Text>
          )}
          {whenLabel && !isWaiting ? (
            <Text {...FIXED_TEXT_PROPS} style={styles.whenTxt} numberOfLines={1}>
              {whenLabel}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={14} color={ACCENT} />
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

      {!isWaiting ? (
        <TripProgressLoader
          booking={booking}
          compact={isCompact}
          role={isDriver ? 'driver' : 'customer'}
        />
      ) : null}
    </TouchableOpacity>
  );
}

function filterBookings(
  bookings: ActiveTripBannerBooking[],
  tripFilter: BannerTripFilter,
): ActiveTripBannerBooking[] {
  if (tripFilter === 'immediate') {
    return bookings.filter((b) => isImmediateBookingType(b.booking_type as string));
  }
  if (tripFilter === 'reservation') {
    return bookings.filter((b) => isReservationBookingType(b.booking_type as string));
  }
  return bookings;
}

type Props = {
  stackNavigation: any;
  hidden?: boolean;
  /** En Perfil: recuadro compacto, no de lado a lado. */
  variant?: BannerVariant;
  /**
   * Conductor en tabs distintas de GO: solo inmediatos.
   * Cliente: ambos (`all`).
   */
  tripFilter?: BannerTripFilter;
};

/**
 * Aviso flotante compacto (1 viaje). Debe montarse DENTRO del slot `tabBar`.
 */
export default function ActiveTripFloatingBanner({
  stackNavigation,
  hidden,
  variant = 'profile',
  tripFilter = 'all',
}: Props) {
  const { bookings, isDriver, hasActiveTrip } = useActiveTripBanner();

  const booking = useMemo(() => {
    const filtered = filterBookings(bookings, tripFilter);
    return filtered[0] ?? null;
  }, [bookings, tripFilter]);

  if (hidden || !hasActiveTrip || !booking || !stackNavigation) return null;

  return (
    <View
      style={[styles.wrap, variant === 'profile' && styles.wrapProfile]}
      pointerEvents="box-none"
    >
      <BannerCard
        booking={booking}
        isDriver={isDriver}
        stackNavigation={stackNavigation}
        variant={variant}
      />
    </View>
  );
}

/** Card reutilizable para fijar el viaje activo arriba de Inmediatos/Reservas. */
export function ActiveTripBannerCard({
  booking,
  isDriver,
  stackNavigation,
  compact,
}: BannerCardProps & { compact?: boolean }) {
  return (
    <View style={compact ? styles.listWrap : undefined}>
      <BannerCard
        booking={booking}
        isDriver={isDriver}
        stackNavigation={stackNavigation}
        variant="list"
      />
    </View>
  );
}

type StackProps = {
  stackNavigation: any;
  maxItems?: number;
  tripFilter?: BannerTripFilter;
};

/**
 * Lista de viajes activos en GO desconectado (máx. 4), encima del modal.
 */
export function ActiveTripBannerStack({
  stackNavigation,
  maxItems = 4,
  tripFilter = 'all',
}: StackProps) {
  const { bookings, isDriver } = useActiveTripBanner();

  const items = useMemo(() => {
    return filterBookings(bookings, tripFilter).slice(0, maxItems);
  }, [bookings, tripFilter, maxItems]);

  if (!stackNavigation || items.length === 0) return null;

  return (
    <View style={styles.stackWrap} pointerEvents="box-none">
      {items.map((booking) => (
        <BannerCard
          key={booking.id}
          booking={booking}
          isDriver={isDriver}
          stackNavigation={stackNavigation}
          variant={isDriver ? 'driverGo' : 'profile'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 6,
    zIndex: 60,
    elevation: 60,
  },
  wrapProfile: {
    alignSelf: 'center',
    width: '78%',
    maxWidth: 320,
    marginHorizontal: 0,
  },
  stackWrap: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  listWrap: {
    marginBottom: 8,
  },
  card: {
    backgroundColor: 'rgba(8, 32, 44, 0.94)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 229, 255, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 340,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardProfile: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(5, 26, 38, 0.92)',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  cardDriverGo: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(5, 26, 38, 0.94)',
    width: '68%',
    maxWidth: 268,
    alignSelf: 'center',
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  cardList: {
    borderRadius: 12,
    maxWidth: undefined,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  topMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACTIVE_GREEN,
  },
  waitingDot: {
    backgroundColor: ACCENT,
  },
  title: {
    flex: 1,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  waitingHint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '600',
  },
  whenTxt: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  cardWaiting: {
    borderColor: 'rgba(0,229,255,0.45)',
  },
  routeBlock: {
    gap: 3,
    paddingLeft: 2,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routeDotStart: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  routeDotEnd: {
    backgroundColor: '#E91E63',
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  routeTxt: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '500',
  },
});
