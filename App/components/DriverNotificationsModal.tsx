import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import {
  listServiceNotices,
  markNoticeTaken,
  upsertTakenReservationGhost,
  formatCountdown,
  type ServiceNotice,
} from '@/common/services/driverServiceNotices';

const ACCENT = '#00E5FF';
const GREEN = '#00E676';

type TabKey = 'services' | 'news';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenBookingDetail: (booking: any, opts?: { taken?: boolean; expiresAt?: number }) => void;
  onAcceptBooking?: (booking: any) => void;
};

type EnrichedNotice = ServiceNotice & {
  available: boolean | null;
  liveBooking?: any | null;
};

/**
 * Modal de campanita del conductor:
 * - Notificaciones servicios (inmediatos + programados)
 * - Noticias (placeholder)
 */
const DriverNotificationsModal: React.FC<Props> = ({
  visible,
  onClose,
  onOpenBookingDetail,
}) => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('services');
  const [loading, setLoading] = useState(false);
  const [notices, setNotices] = useState<EnrichedNotice[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 640,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onCloseRef.current();
    });
  }, [translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 100 || g.vy > 0.85) {
            dismiss();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 4,
            }).start();
          }
        },
      }),
    [dismiss, translateY],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await listServiceNotices();
      const headers = await getSupabaseAuthHeaders();
      const enriched: EnrichedNotice[] = [];

      for (const n of raw.slice(0, 40)) {
        let available: boolean | null = null;
        let liveBooking: any = n.bookingSnapshot || null;
        let takenExpiresAt = n.takenExpiresAt ?? null;
        try {
          const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(n.bookingId)}&select=*&limit=1`;
          const res = await fetch(url, { headers });
          if (res.ok) {
            const rows = await res.json();
            const row = Array.isArray(rows) ? rows[0] : null;
            liveBooking = row || liveBooking;
            if (row) {
              const st = String(row.status || '').toUpperCase();
              const hasDriver = Boolean(String(row.driver || row.driver_id || '').trim());
              const open =
                (st === 'NEW' || st === 'PENDING') && !hasDriver;
              available = open;
              if (!open) {
                // Ambos (reserva e inmediato) permanecen 3 min en notificaciones.
                // markNoticeTaken NO reinicia el contador si ya existía.
                const marked = await markNoticeTaken(n.bookingId);
                takenExpiresAt = marked?.takenExpiresAt ?? takenExpiresAt;
                // Solo reservas: fantasma en tab Reservas
                if (n.bookingType === 'reservation') {
                  await upsertTakenReservationGhost(row);
                }
              }
            } else {
              available = false;
              const marked = await markNoticeTaken(n.bookingId);
              takenExpiresAt = marked?.takenExpiresAt ?? takenExpiresAt;
            }
          }
        } catch {
          available = null;
        }
        // Si el TTL ya venció, no mostrar
        if (takenExpiresAt && takenExpiresAt <= Date.now()) continue;
        enriched.push({ ...n, available, liveBooking, takenExpiresAt });
      }
      setNotices(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(0);
    refresh();
    const t = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      // Quitar del listado las que ya cumplieron 3 min
      setNotices((prev) => prev.filter((n) => !n.takenExpiresAt || n.takenExpiresAt > now));
    }, 1000);
    return () => clearInterval(t);
  }, [visible, refresh, translateY]);

  const availableCount = useMemo(
    () => notices.filter((n) => n.available === true).length,
    [notices],
  );

  const renderNotice = ({ item }: { item: EnrichedNotice }) => {
    const isAvail = item.available === true;
    const isTaken = item.available === false;
    const booking = item.liveBooking || item.bookingSnapshot || { id: item.bookingId };
    const kindLabel = item.bookingType === 'reservation' ? 'Programado' : 'Inmediato';
    const msLeft =
      isTaken && item.takenExpiresAt
        ? Math.max(0, item.takenExpiresAt - nowTick)
        : 0;

    return (
      <View style={[styles.card, isTaken && styles.cardTaken]}>
        <View style={styles.cardTop}>
          <View style={[styles.kindPill, item.bookingType === 'reservation' ? styles.kindRes : styles.kindImm]}>
            <Ionicons
              name={item.bookingType === 'reservation' ? 'calendar' : 'flash'}
              size={11}
              color={item.bookingType === 'reservation' ? '#FFB300' : ACCENT}
            />
            <Text {...FIXED_TEXT_PROPS} style={styles.kindTxt}>{kindLabel}</Text>
          </View>
          <View style={[styles.statusPill, isAvail ? styles.statusOk : styles.statusNo]}>
            <Text {...FIXED_TEXT_PROPS} style={[styles.statusTxt, isAvail ? styles.statusOkTxt : styles.statusNoTxt]}>
              {isAvail ? 'Disponible' : isTaken ? 'No disponible' : '…'}
            </Text>
          </View>
        </View>

        <Text {...FIXED_TEXT_PROPS} style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text {...FIXED_TEXT_PROPS} style={styles.body} numberOfLines={2}>{item.body}</Text>
        {!!item.reference && (
          <Text {...FIXED_TEXT_PROPS} style={styles.ref}>Ref: {item.reference}</Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.detailBtn}
            activeOpacity={0.85}
            onPress={() =>
              onOpenBookingDetail(
                {
                  ...booking,
                  booking_type:
                    booking?.booking_type ||
                    (item.bookingType === 'reservation' ? 'reservation' : 'immediate'),
                  ...(isTaken
                    ? { __taken: true, __expiresAt: item.takenExpiresAt || 0 }
                    : {}),
                },
                {
                  taken: isTaken,
                  // Usar el expiresAt persistido — nunca reiniciar con Date.now()
                  expiresAt: isTaken ? (item.takenExpiresAt || undefined) : undefined,
                },
              )
            }
          >
            <Ionicons name="eye-outline" size={14} color={ACCENT} />
            <Text {...FIXED_TEXT_PROPS} style={styles.detailBtnTxt}>Ver detalle</Text>
          </TouchableOpacity>
          {isTaken ? (
            <Text {...FIXED_TEXT_PROPS} style={styles.takenHint}>
              {msLeft > 0
                ? `Ya la tomó otro · ${formatCountdown(msLeft)}`
                : 'Ya la tomó otro conductor'}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={dismiss}>
      <View style={[styles.overlay, { paddingTop: insets.top + 28 }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismiss} accessibilityLabel="Cerrar notificaciones" />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={styles.bellOrb}>
                  <Ionicons name="notifications" size={16} color="#001824" />
                </View>
                <Text {...FIXED_TEXT_PROPS} style={styles.headerTitle}>Notificaciones</Text>
              </View>
              <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={10}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === 'services' && styles.tabActive]}
              onPress={() => setTab('services')}
            >
              <Ionicons name="car-sport" size={14} color={tab === 'services' ? ACCENT : 'rgba(255,255,255,0.5)'} />
              <Text {...FIXED_TEXT_PROPS} style={[styles.tabTxt, tab === 'services' && styles.tabTxtActive]}>
                Notificaciones servicios
              </Text>
              {availableCount > 0 ? (
                <View style={[styles.badge, availableCount > 99 && styles.badgeWide]}>
                  <Text {...FIXED_TEXT_PROPS} style={styles.badgeTxt}>{availableCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'news' && styles.tabActive]}
              onPress={() => setTab('news')}
            >
              <Ionicons name="newspaper-outline" size={14} color={tab === 'news' ? ACCENT : 'rgba(255,255,255,0.5)'} />
              <Text {...FIXED_TEXT_PROPS} style={[styles.tabTxt, tab === 'news' && styles.tabTxtActive]}>
                Noticias
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'services' ? (
            loading ? (
              <View style={styles.empty}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : (
              <FlatList
                data={notices}
                keyExtractor={(n) => n.id}
                renderItem={renderNotice}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="notifications-off-outline" size={40} color="rgba(0,229,255,0.3)" />
                    <Text {...FIXED_TEXT_PROPS} style={styles.emptyTitle}>Sin notificaciones de servicios</Text>
                    <Text {...FIXED_TEXT_PROPS} style={styles.emptySub}>
                      Aquí verás inmediatos y reservas programadas nuevas.
                    </Text>
                  </View>
                }
              />
            )
          ) : (
            <View style={styles.empty}>
              <Ionicons name="newspaper-outline" size={40} color="rgba(0,229,255,0.3)" />
              <Text {...FIXED_TEXT_PROPS} style={styles.emptyTitle}>No hay noticias disponibles por el momento</Text>
              <Text {...FIXED_TEXT_PROPS} style={styles.emptySub}>
                Cuando el sistema envíe novedades, aparecerán aquí.
              </Text>
              <Text style={{ opacity: 0, height: 0 }}>{nowTick}</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    minHeight: '68%',
    backgroundColor: '#051A26',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 8,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'visible',
  },
  tabActive: {
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderColor: 'rgba(0,229,255,0.35)',
  },
  tabTxt: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  tabTxtActive: { color: ACCENT },
  badge: {
    position: 'absolute',
    top: -5,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#051A26',
  },
  badgeWide: { minWidth: 26, paddingHorizontal: 5 },
  badgeTxt: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  list: { paddingHorizontal: 14, paddingBottom: 24, gap: 8 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.18)',
    padding: 12,
    gap: 6,
  },
  cardTaken: {
    opacity: 0.72,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kindImm: { backgroundColor: 'rgba(0,229,255,0.12)' },
  kindRes: { backgroundColor: 'rgba(255,179,0,0.12)' },
  kindTxt: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusOk: { backgroundColor: 'rgba(0,230,118,0.15)' },
  statusNo: { backgroundColor: 'rgba(255,255,255,0.08)' },
  statusTxt: { fontSize: 10, fontWeight: '700' },
  statusOkTxt: { color: GREEN },
  statusNoTxt: { color: 'rgba(255,255,255,0.45)' },
  title: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  body: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 16 },
  ref: { color: ACCENT, fontSize: 11, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.28)',
  },
  detailBtnTxt: { color: ACCENT, fontSize: 12, fontWeight: '700' },
  takenHint: {
    color: 'rgba(255,138,128,0.95)',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: { color: '#FFF', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', lineHeight: 17 },
});

export default DriverNotificationsModal;
