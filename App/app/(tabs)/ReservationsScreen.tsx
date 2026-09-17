import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { useCustomerNavBottomPad } from '@/components/CustomerBottomNav';

const BG_IMAGE = require('../../assets/images/bg.png');
const PAGE_SIZE = 50;

const formatDate = (ts: string) => {
  const d = new Date(ts);
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatTime = (ts: string) => {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
};

type Reservation = any;
type TabKey = 'PENDING' | 'ACCEPTED' | 'COMPLETE' | 'CANCELLED';
type DateFilter = 'all' | 'today' | 'week' | 'month';

const STATUS_CONFIG: Record<string, { color: string; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }> = {
  PENDING:   { color: '#00E5FF', icon: 'time',                   label: 'Pendiente' },
  NEW:       { color: '#00E5FF', icon: 'time',                   label: 'Pendiente' },
  SEARCHING: { color: '#00E5FF', icon: 'search',                 label: 'Buscando' },
  ACCEPTED:  { color: '#00E676', icon: 'checkmark-circle',       label: 'Aceptada' },
  STARTED:   { color: '#FF9800', icon: 'car',                    label: 'En camino' },
  ARRIVED:   { color: '#FF9800', icon: 'location',               label: 'Llegó' },
  COMPLETE:  { color: '#00B0FF', icon: 'checkmark-done-circle',  label: 'Completada' },
  PAID:      { color: '#00B0FF', icon: 'card',                   label: 'Pagada' },
  CANCELLED: { color: '#E91E63', icon: 'close-circle',           label: 'Cancelada' },
};

const TAB_STATUSES: Record<TabKey, string[]> = {
  PENDING:   ['PENDING', 'NEW', 'SEARCHING'],
  ACCEPTED:  ['ACCEPTED', 'STARTED', 'ARRIVED'],
  COMPLETE:  ['COMPLETE', 'PAID'],
  CANCELLED: ['CANCELLED'],
};

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all',   label: 'Todo' },
  { key: 'today', label: 'Hoy' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

interface TabState {
  data: Reservation[];
  offset: number;
  hasMore: boolean;
  loading: boolean;
  initialized: boolean;
}

const makeEmpty = (): TabState => ({
  data: [], offset: 0, hasMore: true, loading: false, initialized: false,
});

const getDateFrom = (df: DateFilter): string | null => {
  if (df === 'all') return null;
  const now = new Date();
  if (df === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (df === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
};

// ─── Card ────────────────────────────────────────────────────────────────────

const ReservationCard = React.memo(({ item, onPress }: { item: Reservation; onPress: () => void }) => {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING;
  return (
    <TouchableOpacity style={styles.resCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.resCardGlow} />
      <View style={styles.resCardHeader}>
        <View style={styles.refBadge}>
          <Text style={styles.refTxt}>{item.reference}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.color }]}>
          <Ionicons name={cfg.icon} size={12} color="#051A26" />
          <Text style={styles.statusTxt}>{cfg.label}</Text>
        </View>
      </View>

      <View style={styles.resRouteBlock}>
        <View style={styles.resRouteRow}>
          <View style={[styles.resDot, { backgroundColor: '#00E676' }]} />
          <Text style={styles.resAddr} numberOfLines={1}>{item.pickup_address}</Text>
        </View>
        <View style={styles.resRouteLine} />
        <View style={styles.resRouteRow}>
          <View style={[styles.resDot, { backgroundColor: '#E91E63' }]} />
          <Text style={styles.resAddr} numberOfLines={1}>{item.drop_address}</Text>
        </View>
      </View>

      <View style={styles.resMetaRow}>
        <View style={styles.resMeta}>
          <Ionicons name="calendar-outline" size={13} color="#00E5FF" />
          <Text style={styles.resMetaTxt}>{formatDate(item.booking_date)}</Text>
        </View>
        <View style={styles.resMeta}>
          <Ionicons name="time-outline" size={13} color="#00E5FF" />
          <Text style={styles.resMetaTxt}>{formatTime(item.booking_date)}</Text>
        </View>
        <View style={styles.resMeta}>
          <Ionicons name={item.trip_type === 'Ida' ? 'arrow-forward' : 'repeat'} size={13} color="#00E5FF" />
          <Text style={styles.resMetaTxt}>{item.trip_type}</Text>
        </View>
      </View>

      {['ACCEPTED', 'STARTED', 'ARRIVED'].includes(item.status) && item.driver_name && (
        <View style={styles.resDriverRow}>
          <Ionicons name="car" size={14} color="#00E676" />
          <Text style={styles.resDriverTxt}>
            {item.driver_name}{item.plate_number ? ` • ${item.plate_number}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.resFooter}>
        <Text style={styles.resPriceTxt}>
          $ {(item.driver_share ?? item.price)?.toLocaleString('es-CO')} – $ {(item.estimate ?? item.price)?.toLocaleString('es-CO')}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
      </View>
    </TouchableOpacity>
  );
});

// ─── Floating empty icon ──────────────────────────────────────────────────────

const FloatingEmptyIcon = ({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -10, duration: 2000, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0,   duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [translateY]);
  return (
    <Animated.View style={[styles.emptyIconWrap, { transform: [{ translateY }] }]}>
      <Ionicons name={name} size={44} color="#00E5FF" />
    </Animated.View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────

const ReservationsScreen = () => {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user    = useSelector((s: RootState) => s.auth.user)    as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;
  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;
  const navBottomPad = useCustomerNavBottomPad();
  const bottomPad = navBottomPad + 20;

  // profile.id = users.id (UUID interno guardado en bookings.customer)
  // user.auth_id = Supabase Auth UUID (distinto al anterior, no se usa en bookings)
  const userId = profile?.id ?? user?.id;

  const [activeTab, setActiveTab] = useState<TabKey>('PENDING');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [tabStates, setTabStates] = useState<Record<TabKey, TabState>>({
    PENDING:   makeEmpty(),
    ACCEPTED:  makeEmpty(),
    COMPLETE:  makeEmpty(),
    CANCELLED: makeEmpty(),
  });

  // tracks which tabs have completed at least one successful load (avoids tabStates in effect deps)
  const initializedRef = useRef<Partial<Record<TabKey, boolean>>>({});

  // ── fetch one page for a tab ────────────────────────────────────────────
  const fetchPage = useCallback(async (
    tab: TabKey,
    offset: number,
    df: DateFilter,
    append: boolean,
  ) => {
    if (!userId) return;

    setTabStates(prev => ({
      ...prev,
      [tab]: { ...prev[tab], loading: true },
    }));

    try {
      const headers = await getSupabaseAuthHeaders();
      const statuses = TAB_STATUSES[tab].join(',');
      const dateFrom = getDateFrom(df);

      // La tabla bookings usa las columnas `customer` y `driver` (sin _id).
      // Incluimos ambas para que el historial funcione tanto para cliente como para conductor.
      const orFilter = [
        `customer.eq.${userId}`,
        `driver.eq.${userId}`,
      ].join(',');

      let url =
        `${SUPABASE_URL}/rest/v1/bookings_v2_mobile` +
        `?or=(${orFilter})` +
        `&status=in.(${statuses})` +
        `&order=booking_date.desc` +
        `&limit=${PAGE_SIZE}` +
        `&offset=${offset}`;

      if (dateFrom) url += `&booking_date=gte.${encodeURIComponent(dateFrom)}`;

      console.log('[Reservas] userId:', userId, '| tab:', tab, '| df:', df);
      console.log('[Reservas] url:', url);

      const res = await fetch(url, { headers });
      console.log('[Reservas] status:', res.status, '| ok:', res.ok);
      if (!res.ok) {
        const errBody = await res.text();
        console.warn('Reservations fetch error:', res.status, errBody);
        // No marcamos `initialized: true` para permitir reintentos (focus / refresh).
        setTabStates(prev => ({
          ...prev,
          [tab]: { ...prev[tab], loading: false },
        }));
        return;
      }

      const data: Reservation[] = await res.json();

      initializedRef.current[tab] = true;
      setTabStates(prev => ({
        ...prev,
        [tab]: {
          data:        append ? [...prev[tab].data, ...data] : data,
          offset:      offset + data.length,
          hasMore:     data.length === PAGE_SIZE,
          loading:     false,
          initialized: true,
        },
      }));
    } catch (e) {
      console.error('fetchPage error:', e);
      // No marcamos `initialized: true` para permitir reintentos.
      setTabStates(prev => ({
        ...prev,
        [tab]: { ...prev[tab], loading: false },
      }));
    }
  }, [userId]);

  // ── load more when user reaches the end ────────────────────────────────
  const loadMore = useCallback(() => {
    const s = tabStates[activeTab];
    if (s.loading || !s.hasMore) return;
    fetchPage(activeTab, s.offset, dateFilter, true);
  }, [activeTab, dateFilter, tabStates, fetchPage]);

  // ── switch tab → load if not yet initialized ───────────────────────────
  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    if (!initializedRef.current[tab]) {
      fetchPage(tab, 0, dateFilter, false);
    }
  }, [dateFilter, fetchPage]);

  // ── date filter change → reset all tabs, reload active ─────────────────
  const handleDateFilter = useCallback((df: DateFilter) => {
    setDateFilter(df);
    const reset: Record<TabKey, TabState> = {
      PENDING:   makeEmpty(),
      ACCEPTED:  makeEmpty(),
      COMPLETE:  makeEmpty(),
      CANCELLED: makeEmpty(),
    };
    initializedRef.current = {};
    setTabStates(reset);
    fetchPage(activeTab, 0, df, false);
  }, [activeTab, fetchPage]);

  // ── pull-to-refresh ─────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPage(activeTab, 0, dateFilter, false);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, dateFilter, fetchPage]);

  // ── initial load on focus ───────────────────────────────────────────────
  // Incluimos `userId` en deps para reintentar cuando el perfil llega tarde desde Redux.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (!initializedRef.current[activeTab]) {
        fetchPage(activeTab, 0, dateFilter, false);
      }
    }, [activeTab, dateFilter, fetchPage, userId])
  );

  const currentTab = tabStates[activeTab];

  const TABS: { key: TabKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'PENDING',   label: 'Pendientes', icon: 'time-outline' },
    { key: 'ACCEPTED',  label: 'Aceptadas',  icon: 'checkmark-circle-outline' },
    { key: 'COMPLETE',  label: 'Completas',  icon: 'checkmark-done-circle-outline' },
    { key: 'CANCELLED', label: 'Canceladas', icon: 'close-circle-outline' },
  ];

  const EMPTY_LABELS: Record<TabKey, string> = {
    PENDING:   'No tienes reservas pendientes.',
    ACCEPTED:  'No tienes reservas aceptadas.',
    COMPLETE:  'No tienes viajes completados.',
    CANCELLED: 'No tienes reservas canceladas.',
  };

  return (
    <View style={styles.root}>
      {/* Fondo */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image source={BG_IMAGE} style={styles.bgImage} resizeMode="cover" />
        <View style={styles.bgOverlay} />
        <View style={styles.glowTopRight} />
        <View style={styles.glowBottomLeft} />
      </View>

      {/* Header — sin botón volver: esta pantalla es destino del tab bar */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Tus Reservas</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map(tab => {
          const count = tabStates[tab.key].data.length;
          const hasMore = tabStates[tab.key].hasMore;
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleTabChange(tab.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={isActive ? '#051A26' : 'rgba(255,255,255,0.5)'}
              />
              <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>{tab.label}</Text>
              {tabStates[tab.key].initialized && count > 0 && (
                <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                  <Text style={[styles.tabCountTxt, isActive && styles.tabCountTxtActive]}>
                    {count}{hasMore ? '+' : ''}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Filtro por fecha */}
      <View style={styles.dateFilterRow}>
        <Ionicons name="calendar" size={14} color="rgba(0,229,255,0.6)" style={{ marginRight: 6 }} />
        {DATE_FILTERS.map(df => (
          <TouchableOpacity
            key={df.key}
            style={[styles.dateChip, dateFilter === df.key && styles.dateChipActive]}
            onPress={() => handleDateFilter(df.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.dateChipTxt, dateFilter === df.key && styles.dateChipTxtActive]}>
              {df.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Lista */}
      {!currentTab.initialized && currentTab.loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#00E5FF" />
        </View>
      ) : (
        <FlatList
          data={currentTab.data}
          keyExtractor={item => item.id}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#00E5FF"
              colors={['#00E5FF']}
            />
          }
          renderItem={({ item }) => (
            <ReservationCard
              item={item}
              onPress={() => nav.navigate('ReservationDetail', { reservation: item })}
            />
          )}
          ListFooterComponent={
            currentTab.loading && currentTab.data.length > 0 ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#00E5FF" />
                <Text style={styles.footerLoaderTxt}>Cargando más...</Text>
              </View>
            ) : currentTab.hasMore && currentTab.data.length > 0 ? null : (
              currentTab.data.length > 0 ? (
                <Text style={styles.footerEnd}>
                  {currentTab.data.length} registro{currentTab.data.length !== 1 ? 's' : ''} en total
                </Text>
              ) : null
            )
          }
          ListEmptyComponent={
            <Animatable.View animation="fadeInUp" duration={480} useNativeDriver style={styles.sectionBlock}>
              <View style={styles.emptyCard}>
                <View style={styles.cardGlow} />
                <FloatingEmptyIcon name={TABS.find(t => t.key === activeTab)?.icon || 'time-outline'} />
                <Text style={styles.emptyText}>
                  {dateFilter !== 'all'
                    ? `Sin resultados en el período seleccionado.`
                    : EMPTY_LABELS[activeTab]}
                </Text>
                {activeTab === 'PENDING' && dateFilter === 'all' && (
                  <TouchableOpacity
                    style={styles.viewAllBtn}
                    activeOpacity={0.8}
                    onPress={() => nav.navigate('CreateReservation')}
                  >
                    <Text style={styles.viewAllText}>Crear nueva reserva</Text>
                    <Ionicons name="arrow-forward" size={15} color="#00E5FF" />
                  </TouchableOpacity>
                )}
              </View>
            </Animatable.View>
          }
        />
      )}
    </View>
  );
};

export default ReservationsScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.34 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,26,38,0.78)' },
  glowTopRight: {
    position: 'absolute', top: -70, right: -70, width: 260, height: 260,
    borderRadius: 130, backgroundColor: 'rgba(0,229,255,0.08)',
  },
  glowBottomLeft: {
    position: 'absolute', bottom: 80, left: -90, width: 320, height: 320,
    borderRadius: 160, backgroundColor: 'rgba(0,188,212,0.05)',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(5,26,38,0.82)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },
  headerSpacer: { width: 40 },

  // Tabs
  tabsScroll: { flexGrow: 0 },
  tabsContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
  },
  tabActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF' },
  tabTxt: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  tabTxtActive: { color: '#051A26' },
  tabCount: {
    minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.2)', paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: 'rgba(5,26,38,0.25)' },
  tabCountTxt: { fontSize: 10, fontWeight: '700', color: '#00E5FF' },
  tabCountTxtActive: { color: '#051A26' },

  // Date filter
  dateFilterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 8, gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,229,255,0.08)',
  },
  dateChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.1)',
  },
  dateChipActive: { backgroundColor: 'rgba(0,229,255,0.15)', borderColor: 'rgba(0,229,255,0.5)' },
  dateChipTxt: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  dateChipTxtActive: { color: '#00E5FF' },

  // List
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14 },
  sectionBlock: { marginBottom: 28 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footerLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  footerLoaderTxt: { fontSize: 12, color: '#00E5FF', fontWeight: '600' },
  footerEnd: { textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', paddingVertical: 18 },

  // Empty
  emptyCard: {
    overflow: 'hidden', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 20,
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
    alignItems: 'center',
  },
  cardGlow: {
    position: 'absolute', top: -30, left: -30, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(0,229,255,0.06)',
  },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(10,46,61,0.75)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 18,
    elevation: 6, marginBottom: 18,
  },
  emptyText: {
    fontSize: 16, lineHeight: 23, color: 'rgba(255,255,255,0.72)',
    textAlign: 'center', marginBottom: 18, fontWeight: '500',
  },
  viewAllBtn: {
    width: '100%', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,229,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.18)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  viewAllText: { fontSize: 13, fontWeight: '700', color: '#00E5FF', marginRight: 8, letterSpacing: 0.2 },

  // Card
  resCard: {
    overflow: 'hidden', borderRadius: 18, padding: 16, marginBottom: 14,
    backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
  },
  resCardGlow: {
    position: 'absolute', top: -30, right: -30, width: 120, height: 120,
    borderRadius: 60, backgroundColor: 'rgba(0,229,255,0.05)',
  },
  resCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  refBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,229,255,0.12)' },
  refTxt: { fontSize: 11, fontWeight: '700', color: '#00E5FF' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusTxt: { fontSize: 10, fontWeight: '700', color: '#051A26' },
  resRouteBlock: { marginBottom: 10, paddingLeft: 2 },
  resRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resDot: { width: 8, height: 8, borderRadius: 4 },
  resRouteLine: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.12)', marginLeft: 3.5 },
  resAddr: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  resMetaRow: { flexDirection: 'row', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  resMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resMetaTxt: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  resDriverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: 'rgba(0,230,118,0.1)', borderWidth: 1, borderColor: 'rgba(0,230,118,0.2)',
  },
  resDriverTxt: { fontSize: 12, fontWeight: '600', color: '#00E676' },
  resFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resPriceTxt: { fontSize: 13, fontWeight: '700', color: '#00E5FF' },
});
