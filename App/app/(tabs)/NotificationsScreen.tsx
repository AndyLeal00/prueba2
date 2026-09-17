import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  RefreshControl, ActivityIndicator, Animated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import BookingRealtimeService from '@/common/services/BookingRealtimeService';
import supabase from '@/config/SupabaseConfig';
import { useBookingRequestTimer } from '@/hooks/useBookingRequestTimer';

const REQUEST_STATUSES = new Set(['NEW', 'PENDING']);

const autoCancelExpiredBooking = async (booking: any) => {
  try {
    const payload: any = {
      status: 'CANCELLED',
      observations: 'Solicitud vencida por tiempo de espera',
      customer_status: `${booking.customer || ''}_CANCELLED`,
      driver_status: booking.driver ? `${booking.driver}_CANCELLED` : null,
    };
    await (supabase as any).from('bookings_v2_mobile' as any).update(payload).eq('id', booking.id);
  } catch (e) {
    console.warn('[Notifications] auto-cancel error', e);
  }
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: any; description: string }> = {
  PENDING: { label: 'Buscando conductor', color: '#FFFFFF', icon: 'search-outline', description: 'Estamos buscando el mejor conductor para ti.' },
  ACCEPTED: { label: 'Conductor en camino', color: '#00E5FF', icon: 'car-sport-outline', description: 'Tu conductor está en camino al punto de encuentro.' },
  ARRIVED: { label: 'Conductor llegó', color: '#00E676', icon: 'location-outline', description: 'Tu conductor ha llegado. Presenta tu código OTP.' },
  STARTED: { label: 'Viaje en curso', color: '#00E676', icon: 'navigate-circle-outline', description: 'Tu viaje está en progreso.' },
  IN_PROGRESS: { label: 'Viaje en curso', color: '#00E676', icon: 'navigate-circle-outline', description: 'Tu viaje está en progreso.' },
  TRIP_STARTED: { label: 'Viaje en curso', color: '#00E676', icon: 'navigate-circle-outline', description: 'Tu viaje está en progreso.' },
  COMPLETE: { label: 'Viaje finalizado', color: '#4CAF50', icon: 'checkmark-circle-outline', description: 'Tu viaje ha finalizado correctamente.' },
  CANCELLED: { label: 'Viaje cancelado', color: '#E91E63', icon: 'close-circle-outline', description: 'El viaje ha sido cancelado.' },
  NEW: { label: 'Reserva creada', color: '#00E5FF', icon: 'calendar-outline', description: 'Tu reserva ha sido creada correctamente.' },
};

const ACTIVE_STATUSES = ['PENDING', 'ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED', 'NEW'];
export const MAX_ACTIVE_IMMEDIATE_TRIPS = 2;
export const MAX_ACTIVE_SCHEDULED_TRIPS = 5;

const BookingCard = ({
  booking,
  index,
  isDriver,
  scheduledIndex,
  onBookingExpired,
}: {
  booking: any;
  index: number;
  isDriver: boolean;
  scheduledIndex?: number;
  onBookingExpired: (id: string) => void;
}) => {
  const nav = useNavigation<any>();
  const isScheduled = booking?.booking_type === 'reservation';
  const isRequestStatus = REQUEST_STATUSES.has(booking?.status);

  const { timeRemaining, isExpired, formatTime } = useBookingRequestTimer({
    expiresAt: (!isScheduled && isRequestStatus) ? (booking?.request_expires_at ?? null) : null,
    createdAt: (!isScheduled && isRequestStatus) ? (booking?.created_at ?? null) : null,
    onExpired: () => {
      if (!isScheduled && booking?.status !== 'CANCELLED') {
        autoCancelExpiredBooking(booking);
        onBookingExpired(booking.id);
      }
    },
  });

  const status = booking?.status;
  const isCancelled = status === 'CANCELLED';
  const isTimerExpired = !isScheduled && isExpired && isRequestStatus;
  const effectiveStatus = isTimerExpired ? 'CANCELLED' : status;
  const statusCfg = effectiveStatus ? STATUS_MAP[effectiveStatus] : null;
  const price = booking?.trip_cost || booking?.estimate || booking?.price || 0;
  const otp = booking?.otp_code || booking?.otp || booking?.verification_code;
  const reference = booking?.reference || booking?.id?.toString().slice(0, 8).toUpperCase() || '—';
  const isActionDisabled = isScheduled ? isCancelled : (isTimerExpired || isCancelled);

  const scheduledDateStr = isScheduled && booking?.booking_date
    ? new Date(booking.booking_date).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const badgeLabel = isDriver
    ? 'Viaje activo'
    : isScheduled
      ? `Programado ${(scheduledIndex ?? index) + 1} de ${MAX_ACTIVE_SCHEDULED_TRIPS}`
      : `Viaje ${index + 1} de ${MAX_ACTIVE_IMMEDIATE_TRIPS}`;

  return (
    <Animatable.View
      key={booking.id}
      animation="fadeInUp"
      duration={350}
      delay={index * 80}
      useNativeDriver
    >
      <View style={[
        st.tripCard,
        isScheduled && st.tripCardScheduled,
        isActionDisabled && st.tripCardExpired,
      ]}>
        {/* Trip header: code + index */}
        <View style={st.tripHeader}>
          <View style={st.tripHeaderLeft}>
            <View style={[st.tripBadge, isScheduled && st.tripBadgeScheduled]}>
              {isScheduled && <Ionicons name="calendar" size={10} color="#00E676" style={{ marginRight: 4 }} />}
              <Text style={[st.tripBadgeTxt, isScheduled && st.tripBadgeTxtScheduled]}>
                {badgeLabel}
              </Text>
            </View>
            <Text style={st.tripRefLabel}>Código del viaje</Text>
            <Text style={[st.tripRefValue, isActionDisabled && { color: 'rgba(255,255,255,0.4)' }]}>
              {reference}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {statusCfg && (
              <View style={[st.statusPill, { borderColor: statusCfg.color, backgroundColor: `${statusCfg.color}1A` }]}>
                <Ionicons name={statusCfg.icon} size={14} color={statusCfg.color} />
                <Text style={[st.statusPillTxt, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
            )}
            {/* Countdown timer — solo para inmediatos en NEW/PENDING */}
            {!isScheduled && isRequestStatus && !isExpired && (
              <View style={st.timerPill}>
                <Ionicons name="time-outline" size={12} color={timeRemaining <= 60 ? '#FF5252' : '#FFFFFF'} />
                <Text style={[st.timerTxt, timeRemaining <= 60 && { color: '#FF5252' }]}>
                  {formatTime()}
                </Text>
              </View>
            )}
            {/* Fecha programada — solo para programados */}
            {isScheduled && scheduledDateStr && (
              <View style={st.scheduledDatePill}>
                <Ionicons name="calendar-outline" size={12} color="#00E676" />
                <Text style={st.scheduledDateTxt}>{scheduledDateStr}</Text>
              </View>
            )}
            {isActionDisabled && (
              <View style={st.expiredPill}>
                <Ionicons name="ban-outline" size={12} color="#E91E63" />
                <Text style={st.expiredTxt}>
                  {isCancelled && !isTimerExpired ? 'Cancelado' : 'Solicitud vencida'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Route */}
        {(booking?.pickup_address || booking?.drop_address) && (
          <View style={st.routeBlock}>
            {!!booking?.pickup_address && (
              <View style={st.routeRow}>
                <View style={[st.routeDot, { backgroundColor: '#00E676' }]} />
                <Text style={st.routeTxt} numberOfLines={1}>{booking.pickup_address}</Text>
              </View>
            )}
            {!!booking?.drop_address && (
              <View style={st.routeRow}>
                <View style={[st.routeDot, { backgroundColor: '#E91E63' }]} />
                <Text style={st.routeTxt} numberOfLines={1}>{booking.drop_address}</Text>
              </View>
            )}
          </View>
        )}

        {/* Info grid */}
        <View style={st.infoGrid}>
          {price > 0 && (
            <View style={st.infoItem}>
              <Ionicons name="cash-outline" size={14} color="#00E676" />
              <Text style={st.infoLabel}>Valor</Text>
              <Text style={[st.infoValue, { color: '#00E676' }]}>$ {Number(price).toLocaleString('es-CO')}</Text>
            </View>
          )}
          {!!otp && (
            <View style={st.infoItem}>
              <Ionicons name="key-outline" size={14} color="#00E5FF" />
              <Text style={st.infoLabel}>OTP</Text>
              <Text style={[st.infoValue, { color: '#00E5FF', letterSpacing: 2 }]}>{String(otp)}</Text>
            </View>
          )}
          {!!booking?.payment_mode && (
            <View style={st.infoItem}>
              <Ionicons name="wallet-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={st.infoLabel}>Pago</Text>
              <Text style={st.infoValue}>{String(booking.payment_mode).toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Counterparty */}
        {isDriver
          ? !!booking?.customer_name && (
              <View style={st.driverRow}>
                <Ionicons name="person-circle-outline" size={18} color="#00E5FF" />
                <Text style={st.driverTxt} numberOfLines={1}>{booking.customer_name}</Text>
              </View>
            )
          : !!booking?.driver_name && (
              <View style={st.driverRow}>
                <Ionicons name="person-circle-outline" size={18} color="#00E5FF" />
                <Text style={st.driverTxt} numberOfLines={1}>
                  {booking.driver_name}
                  {booking?.plate_number ? `  ·  ${booking.plate_number}` : ''}
                </Text>
              </View>
            )}

        {/* Cancelled / expired message */}
        {isActionDisabled && (
          <View style={st.expiredMessage}>
            <Ionicons name="alert-circle-outline" size={16} color="#E91E63" />
            <Text style={st.expiredMessageTxt}>
              {isCancelled && !isTimerExpired
                ? 'Este viaje fue cancelado.'
                : 'Esta solicitud venció. No fue aceptada en los 5 minutos permitidos.'}
            </Text>
          </View>
        )}

        {/* Action */}
        <TouchableOpacity
          style={[st.detailBtn, isScheduled && st.detailBtnScheduled, isActionDisabled && st.detailBtnDisabled]}
          onPress={() => {
            if (isActionDisabled) return;
            isDriver
              ? nav.navigate('ReservationTrip', { reservation: booking })
              : nav.navigate('CustomerActiveTrip', { bookingId: booking.id, booking });
          }}
          activeOpacity={isActionDisabled ? 1 : 0.85}
          disabled={isActionDisabled}
        >
          <Ionicons
            name={isActionDisabled ? 'ban-outline' : 'eye-outline'}
            size={18}
            color={isActionDisabled ? 'rgba(255,255,255,0.3)' : (isScheduled ? '#051A26' : '#051A26')}
          />
          <Text style={[st.detailBtnTxt, isScheduled && st.detailBtnTxtScheduled, isActionDisabled && st.detailBtnTxtDisabled]}>
            {isActionDisabled ? 'Solicitud cancelada' : 'Ver viaje en detalle'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animatable.View>
  );
};

const NotificationsScreen = () => {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;

  const userTypeRaw = String(
    profile?.user_type ||
      user?.usertype ||
      user?.user_type ||
      user?.userType ||
      user?.user_metadata?.usertype ||
      user?.user_metadata?.user_type ||
      user?.user_metadata?.userType ||
      ''
  )
    .trim()
    .toLowerCase();
  const isDriver = userTypeRaw === 'driver';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const ringAnim = useRef(new Animated.Value(0)).current;
  const lastStatusMapRef = useRef<Record<string, string>>({});

  const customerId = user?.id || user?.auth_id;

  const resolveUserId = useCallback(async () => {
    try {
      const headers = await getSupabaseAuthHeaders();
      const candidates = [user?.id, user?.auth_id].filter(Boolean);
      for (const c of candidates) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/users?or=(id.eq.${c},auth_id.eq.${c})&select=id&limit=1`, { headers });
        if (r.ok) {
          const rows = await r.json();
          if (rows?.[0]?.id) return rows[0].id;
        }
      }
    } catch {}
    return customerId;
  }, [user?.id, user?.auth_id, customerId]);

  const fetchActiveBookings = useCallback(async () => {
    try {
      const uid = await resolveUserId();
      if (!uid) { setActiveBookings([]); setLoading(false); return; }
      const headers = await getSupabaseAuthHeaders();
      const statuses = ACTIVE_STATUSES.map(s => `"${s}"`).join(',');
      const customerLimit = MAX_ACTIVE_IMMEDIATE_TRIPS + MAX_ACTIVE_SCHEDULED_TRIPS;
      // Para conductor NO es una cuota de negocio (a diferencia del cliente) — es
      // solo un techo práctico de fetch. Antes estaba en `limit=1`, por lo que
      // un conductor con varios servicios asignados (ej. reservas programadas)
      // solo veía el más reciente.
      const driverLimit = 30;
      const url = isDriver
        ? `${SUPABASE_URL}/rest/v1/bookings_v2_mobile?driver_id=eq.${uid}&status=in.(${statuses})&order=created_at.desc&limit=${driverLimit}&select=*`
        : `${SUPABASE_URL}/rest/v1/bookings_v2_mobile?customer=eq.${uid}&status=in.(${statuses})&order=created_at.desc&limit=${customerLimit}&select=*`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) { setLoading(false); return; }
      const rows = await resp.json();
      setActiveBookings(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('[Notifications] fetch error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDriver, resolveUserId]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveBookings();
      // Polling cada 5 s para reflejar cancelaciones o cambios externos
      const interval = setInterval(fetchActiveBookings, 5000);
      return () => clearInterval(interval);
    }, [fetchActiveBookings])
  );

  // Realtime subscriptions for each active booking
  useEffect(() => {
    const ids = activeBookings.map((b) => b?.id).filter(Boolean);
    if (ids.length === 0) return;
    const unsubs: Array<() => void> = [];
    ids.forEach((id) => {
      try {
        BookingRealtimeService.subscribeToBookingUpdates(id, (updated) => {
          setActiveBookings((prev) =>
            prev
              .map((b) => (b.id === id ? { ...b, ...updated } : b))
              // Si el status ya no es activo, mantenerlo visible brevemente
              // pero el próximo poll lo eliminará
          );
        });
        unsubs.push(() => { try { BookingRealtimeService.unsubscribe(`booking-${id}`); } catch {} });
      } catch (e) {
        console.warn('[Notifications] subscribe error', e);
      }
    });
    return () => { unsubs.forEach((u) => u()); };
  }, [activeBookings.map((b) => b?.id).join('|')]);

  // Haptic + voice feedback on any booking status change
  useEffect(() => {
    let changed = false;
    const nextMap: Record<string, string> = {};
    for (const b of activeBookings) {
      if (!b?.id) continue;
      nextMap[b.id] = b.status;
      const prev = lastStatusMapRef.current[b.id];
      if (prev && prev !== b.status) {
        changed = true;
        const cfg = STATUS_MAP[b.status];
        if (cfg) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Speech.speak(`Estado del viaje: ${cfg.label}`, { language: 'es-CO', pitch: 1.0, rate: 1.0 });
        }
      }
    }
    lastStatusMapRef.current = nextMap;
    if (changed) {
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [activeBookings, ringAnim]);

  const onRefresh = () => { setRefreshing(true); fetchActiveBookings(); };

  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;
  const ringRotate = ringAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '20deg'] });

  const immediateBookings = isDriver
    ? activeBookings
    : activeBookings.filter(b => b.booking_type === 'immediate' || !b.booking_type);
  const scheduledBookings = isDriver
    ? []
    : activeBookings.filter(b => b.booking_type === 'reservation');

  const immediateCount = immediateBookings.length;
  const scheduledCount = scheduledBookings.length;
  const activeCount = isDriver ? activeBookings.length : immediateCount;
  const atLimit = immediateCount >= MAX_ACTIVE_IMMEDIATE_TRIPS;
  const remainingSlots = Math.max(0, MAX_ACTIVE_IMMEDIATE_TRIPS - immediateCount);
  const scheduledAtLimit = scheduledCount >= MAX_ACTIVE_SCHEDULED_TRIPS;
  const scheduledRemaining = Math.max(0, MAX_ACTIVE_SCHEDULED_TRIPS - scheduledCount);

  const handleBookingExpired = useCallback((bookingId: string) => {
    // Marcar como CANCELLED inmediatamente; el próximo poll lo eliminará de la lista
    setActiveBookings((prev) =>
      prev.map((b) => b.id === bookingId ? { ...b, status: 'CANCELLED' } : b)
    );
  }, []);

  return (
    <View style={st.root}>
      <View style={[st.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={st.backBtn} onPress={() => nav.goBack()} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Animated.View style={{ transform: [{ rotate: ringRotate }] }}>
            <Ionicons name="notifications" size={22} color="#00E5FF" />
          </Animated.View>
          <Text style={st.headerTitle}>Notificaciones</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16, paddingTop: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={st.loadingWrap}>
            <ActivityIndicator color="#00E5FF" size="large" />
            <Text style={st.loadingTxt}>Cargando notificaciones...</Text>
          </View>
        ) : (
          <>
            {/* ── Cuota inmediatos ── */}
            {!isDriver && immediateCount > 0 && (
              <Animatable.View animation="fadeInDown" duration={300} useNativeDriver>
                <View style={[st.quotaCard, atLimit && st.quotaCardLimit]}>
                  <View style={st.quotaRow}>
                    <Ionicons
                      name={atLimit ? 'alert-circle' : 'flash'}
                      size={20}
                      color={atLimit ? '#FFFFFF' : '#00E5FF'}
                    />
                    <Text style={st.quotaTitle}>Viajes inmediatos activos</Text>
                    <View style={[st.quotaBadge, atLimit && { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: '#FFFFFF' }]}>
                      <Text style={[st.quotaBadgeTxt, atLimit && { color: '#FFFFFF' }]}>
                        {immediateCount} / {MAX_ACTIVE_IMMEDIATE_TRIPS}
                      </Text>
                    </View>
                  </View>
                  <View style={st.quotaDots}>
                    {Array.from({ length: MAX_ACTIVE_IMMEDIATE_TRIPS }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          st.quotaDot,
                          i < immediateCount
                            ? { backgroundColor: atLimit ? '#FFFFFF' : '#00E5FF', borderColor: atLimit ? '#FFFFFF' : '#00E5FF' }
                            : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.25)' },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={st.quotaDesc}>
                    {atLimit
                      ? `Límite alcanzado. Máximo ${MAX_ACTIVE_IMMEDIATE_TRIPS} viajes inmediatos activos.`
                      : `Puedes solicitar ${remainingSlots} viaje${remainingSlots === 1 ? '' : 's'} inmediato${remainingSlots === 1 ? '' : 's'} más.`}
                  </Text>
                </View>
              </Animatable.View>
            )}

            {/* ── Cuota programados (siempre visible para clientes) ── */}
            {!isDriver && (
              <Animatable.View animation="fadeInDown" duration={300} delay={60} useNativeDriver>
                <View style={[st.quotaCard, st.quotaCardScheduled, scheduledAtLimit && st.quotaCardScheduledLimit]}>
                  <View style={st.quotaRow}>
                    <Ionicons
                      name={scheduledAtLimit ? 'alert-circle' : 'calendar'}
                      size={20}
                      color={scheduledAtLimit ? '#FFFFFF' : '#00E676'}
                    />
                    <Text style={[st.quotaTitle, { color: '#FFF' }]}>Viajes programados activos</Text>
                    <View style={[st.quotaBadge, st.quotaBadgeScheduled, scheduledAtLimit && { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: '#FFFFFF' }]}>
                      <Text style={[st.quotaBadgeTxt, { color: scheduledAtLimit ? '#FFFFFF' : '#00E676' }]}>
                        {scheduledCount} / {MAX_ACTIVE_SCHEDULED_TRIPS}
                      </Text>
                    </View>
                  </View>
                  <View style={st.quotaDots}>
                    {Array.from({ length: MAX_ACTIVE_SCHEDULED_TRIPS }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          st.quotaDot,
                          i < scheduledCount
                            ? { backgroundColor: scheduledAtLimit ? '#FFFFFF' : '#00E676', borderColor: scheduledAtLimit ? '#FFFFFF' : '#00E676' }
                            : { backgroundColor: 'transparent', borderColor: 'rgba(0,230,118,0.25)' },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[st.quotaDesc, { color: 'rgba(255,255,255,0.75)' }]}>
                    {scheduledAtLimit
                      ? `Límite alcanzado. Máximo ${MAX_ACTIVE_SCHEDULED_TRIPS} viajes programados activos.`
                      : scheduledCount === 0
                        ? `Puedes tener hasta ${MAX_ACTIVE_SCHEDULED_TRIPS} viajes programados activos al mismo tiempo.`
                        : `Te quedan ${scheduledRemaining} cupo${scheduledRemaining === 1 ? '' : 's'} de viaje${scheduledRemaining === 1 ? '' : 's'} programado${scheduledRemaining === 1 ? '' : 's'}.`}
                  </Text>
                </View>
              </Animatable.View>
            )}

            {/* Limit-reached alert banner (inmediatos) */}
            {!isDriver && atLimit && (
              <Animatable.View animation="fadeIn" duration={300} useNativeDriver>
                <View style={st.limitAlert}>
                  <Ionicons name="warning" size={20} color="#FFFFFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={st.limitAlertTitle}>Límite de inmediatos alcanzado</Text>
                    <Text style={st.limitAlertDesc}>
                      Solo puedes tener {MAX_ACTIVE_IMMEDIATE_TRIPS} viajes inmediatos activos. Finaliza o cancela uno para crear otro.
                    </Text>
                  </View>
                </View>
              </Animatable.View>
            )}

            {/* ── Lista inmediatos ── */}
            {immediateBookings.length > 0 && (
              <>
                {!isDriver && (
                  <View style={st.sectionHeader}>
                    <Ionicons name="flash" size={14} color="#00E5FF" />
                    <Text style={st.sectionHeaderTxt}>Inmediatos</Text>
                  </View>
                )}
                {immediateBookings.map((b, idx) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    index={idx}
                    isDriver={isDriver}
                    onBookingExpired={handleBookingExpired}
                  />
                ))}
              </>
            )}

            {/* ── Lista programados ── */}
            {scheduledBookings.length > 0 && (
              <>
                <View style={st.sectionHeader}>
                  <Ionicons name="calendar" size={14} color="#00E676" />
                  <Text style={[st.sectionHeaderTxt, { color: '#00E676' }]}>Programados</Text>
                </View>
                {scheduledBookings.map((b, idx) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    index={immediateBookings.length + idx}
                    isDriver={isDriver}
                    scheduledIndex={idx}
                    onBookingExpired={handleBookingExpired}
                  />
                ))}
              </>
            )}

            {/* Empty state */}
            {activeBookings.length === 0 && (
              <View style={st.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={56} color="rgba(255,255,255,0.25)" />
                <Text style={st.emptyTitle}>
                  {isDriver ? 'Sin viajes activos' : 'Sin notificaciones activas'}
                </Text>
                <Text style={st.emptyDesc}>
                  {isDriver
                    ? 'No tienes un viaje aceptado en este momento. Cuando aceptes uno, aparecerá aquí.'
                    : `No tienes viajes en curso.\n⚡ Hasta ${MAX_ACTIVE_IMMEDIATE_TRIPS} inmediatos · 📅 Hasta ${MAX_ACTIVE_SCHEDULED_TRIPS} programados.`}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default NotificationsScreen;

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(5,26,38,0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', letterSpacing: -0.3 },

  loadingWrap: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingTxt: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },

  // Quota card
  quotaCard: {
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  quotaCardLimit: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  quotaTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFF' },
  quotaBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.18)', borderWidth: 1, borderColor: '#00E5FF',
  },
  quotaBadgeTxt: { fontSize: 12, fontWeight: '800', color: '#00E5FF', letterSpacing: 0.5 },
  quotaDots: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quotaDot: { flex: 1, height: 8, borderRadius: 4, borderWidth: 1 },
  quotaDesc: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 17 },

  // Limit alert
  limitAlert: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 14, padding: 12, marginBottom: 12,
  },
  limitAlertTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  limitAlertDesc: { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },

  // Trip card
  tripCard: {
    backgroundColor: 'rgba(10,46,61,0.5)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
    borderRadius: 18, padding: 14, marginBottom: 12,
  },
  tripHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  tripHeaderLeft: { flex: 1 },
  tripBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)',
    marginBottom: 6,
  },
  tripBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#00E5FF', letterSpacing: 0.4 },
  tripRefLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  tripRefValue: { fontSize: 18, fontWeight: '800', color: '#FFF', letterSpacing: 2, marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  statusPillTxt: { fontSize: 11, fontWeight: '700' },

  routeBlock: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 10, gap: 6, marginBottom: 10,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeTxt: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)' },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  infoItem: {
    flexGrow: 1, flexBasis: '30%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  infoLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  infoValue: { fontSize: 13, color: '#FFF', fontWeight: '700', marginTop: 2 },

  driverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 10, marginBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,229,255,0.15)',
  },
  driverTxt: { flex: 1, fontSize: 13, color: '#FFF', fontWeight: '600' },

  detailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 14, backgroundColor: '#00E5FF',
  },
  detailBtnTxt: { fontSize: 14, fontWeight: '700', color: '#051A26' },
  detailBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  detailBtnTxtDisabled: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },

  tripCardExpired: { opacity: 0.75, borderColor: 'rgba(233,30,99,0.3)' },
  tripCardScheduled: {
    borderColor: 'rgba(0,230,118,0.35)',
    backgroundColor: 'rgba(0,51,25,0.35)',
  },
  tripBadgeScheduled: {
    backgroundColor: 'rgba(0,230,118,0.15)',
    borderColor: 'rgba(0,230,118,0.4)',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  tripBadgeTxtScheduled: { color: '#00E676' },
  scheduledDatePill: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(0,230,118,0.15)', borderWidth: 1, borderColor: 'rgba(0,230,118,0.4)',
  },
  scheduledDateTxt: { fontSize: 11, fontWeight: '700', color: '#00E676' },
  detailBtnScheduled: { backgroundColor: '#00E676' },
  detailBtnTxtScheduled: { color: '#051A26' },
  quotaCardScheduled: {
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderColor: 'rgba(0,230,118,0.3)',
  },
  quotaCardScheduledLimit: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.45)',
  },
  quotaBadgeScheduled: {
    backgroundColor: 'rgba(0,230,118,0.18)',
    borderColor: '#00E676',
  },
  sectionHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    marginBottom: 6, marginTop: 4, paddingHorizontal: 4,
  },
  sectionHeaderTxt: { fontSize: 11, fontWeight: '800', color: '#00E5FF', letterSpacing: 0.8, textTransform: 'uppercase' as const },

  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  timerTxt: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  expiredPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(233,30,99,0.15)', borderWidth: 1, borderColor: 'rgba(233,30,99,0.45)',
  },
  expiredTxt: { fontSize: 11, fontWeight: '800', color: '#E91E63' },

  expiredMessage: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 10, padding: 10,
    marginBottom: 10, borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)',
  },
  expiredMessageTxt: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 17 },

  emptyWrap: { paddingVertical: 80, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', marginTop: 8 },
  emptyDesc: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center',
    paddingHorizontal: 30, lineHeight: 18,
  },
});
