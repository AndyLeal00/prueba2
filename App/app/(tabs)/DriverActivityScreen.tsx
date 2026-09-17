import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Platform, Animated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { useDriverNavBottomPad, useIsDriverUser } from '@/components/DriverBottomNav';

const isUuid = (value?: string | null) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const BG_IMAGE = require('../../assets/images/bg.png');

type Reservation = {
  id: string;
  reference: string;
  booking_type: string;
  trip_type: string;
  customer_name: string;
  customer_contact: string;
  customer_token: string;
  pickup_address: string;
  drop_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  booking_date: string;
  driver_share: number;
  estimate: number;
  price: number;
  distance: number;
  duration: number;
  status: string;
  payment_mode: string;
  observations: string | null;
  customer: string;
  customer_id: string;
  car_type: string;
};

type TypeFilter = 'todos' | 'inmediatos' | 'reservas';

const formatDate = (ts: string) => {
  const d = new Date(ts);
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const fmtMoney = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;


const FloatingEmptyIcon = ({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -10, duration: 2000, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [translateY]);
  return (
    <Animated.View style={[st.emptyIconWrap, { transform: [{ translateY }] }]}>
      <Ionicons name={name} size={44} color="#00E5FF" />
    </Animated.View>
  );
};

const DriverActivityScreen = () => {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const isDriverUser = useIsDriverUser();
  const driverNavPad = useDriverNavBottomPad();
  const topPad = Platform.OS === 'android' ? Math.max(insets.top, 10) + 8 : 10;
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos');
  const [completas, setCompletas] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dayFilter, setDayFilter] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const driverIdRef = useRef<string | null>(null);

  // Resuelve el PK users.id del conductor autenticado (mismo patrón que
  // DriverActiveReservationsScreen) — necesario para filtrar SOLO sus viajes.
  const resolveDriverId = useCallback(async (): Promise<string | null> => {
    if (driverIdRef.current) return driverIdRef.current;
    const candidates = [user?.id, user?.auth_id, profile?.id, profile?.auth_id]
      .map((value) => String(value || '').trim())
      .filter((value, index, array) => isUuid(value) && array.indexOf(value) === index);
    if (candidates.length === 0) return null;

    const headers = await getSupabaseAuthHeaders();
    for (const candidate of candidates) {
      const url = `${SUPABASE_URL}/rest/v1/users?or=(id.eq.${candidate},auth_id.eq.${candidate})&select=id&limit=1`;
      const res = await fetch(url, { headers });
      const data = res.ok ? await res.json() : [];
      if (Array.isArray(data) && data[0]?.id) {
        driverIdRef.current = data[0].id;
        return data[0].id;
      }
    }
    return null;
  }, [user?.id, user?.auth_id, profile?.id, profile?.auth_id]);

  const fetchReservations = useCallback(async () => {
    try {
      const headers = await getSupabaseAuthHeaders();
      const driverId = await resolveDriverId();
      if (!driverId) {
        console.warn('📡 [DriverActivity] No se pudo resolver driver_id — no se muestran viajes');
        setCompletas([]);
        return;
      }

      // SOLO los viajes de ESTE conductor — antes traía COMPLETE de todos los
      // conductores del sistema sin filtrar, causando que se vieran/tocaran
      // viajes ajenos con precios distintos.
      const completasUrl = `${SUPABASE_URL}/rest/v1/bookings_v2_mobile?driver_id=eq.${encodeURIComponent(driverId)}&status=eq.COMPLETE&order=created_at.desc&limit=200`;
      console.log('📡 [DriverActivity] Fetching completed trips for driver', driverId);
      const completasRes = await fetch(completasUrl, { headers });
      console.log('📡 [DriverActivity] Response Status:', completasRes.status);
      if (completasRes.ok) {
        const data = await completasRes.json();
        console.log('📡 [DriverActivity] Total completed trips:', data?.length || 0);
        setCompletas(data || []);
      } else {
        const errorText = await completasRes.text();
        console.error('📡 [DriverActivity] Error:', errorText);
      }
    } catch (e) {
      console.error('DriverActivity fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolveDriverId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchReservations();
    }, [fetchReservations])
  );

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  const typeFiltered = useMemo(() => (
    typeFilter === 'todos' ? completas
      : typeFilter === 'inmediatos' ? completas.filter((b: Reservation) => b.booking_type === 'immediate')
      : completas.filter((b: Reservation) => b.booking_type === 'reservation')
  ), [completas, typeFilter]);

  const earnings = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const day = { total: 0, count: 0 };
    const week = { total: 0, count: 0 };
    const month = { total: 0, count: 0 };
    for (const b of typeFiltered) {
      const ts = b.booking_date ? new Date(b.booking_date) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      const amount = Number(b.estimate || b.price || 0);
      if (isSameDay(ts, now)) { day.total += amount; day.count += 1; }
      if (ts >= weekStart && ts <= now) { week.total += amount; week.count += 1; }
      if (ts.getMonth() === now.getMonth() && ts.getFullYear() === now.getFullYear()) {
        month.total += amount; month.count += 1;
      }
    }
    return { day, week, month };
  }, [typeFiltered]);

  const currentData = useMemo(() => {
    if (!dayFilter) return typeFiltered;
    return typeFiltered.filter((b: Reservation) => {
      const ts = b.booking_date ? new Date(b.booking_date) : null;
      return !!ts && !isNaN(ts.getTime()) && isSameDay(ts, dayFilter);
    });
  }, [typeFiltered, dayFilter]);

  const dayFilterTotal = useMemo(() => {
    if (!dayFilter) return 0;
    return currentData.reduce((sum, b) => sum + Number(b.estimate || b.price || 0), 0);
  }, [currentData, dayFilter]);

  const onPickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'set' && selectedDate) {
      setDayFilter(selectedDate);
      if (Platform.OS === 'ios') setShowPicker(false);
    } else if (event.type === 'dismissed') {
      setShowPicker(false);
    }
  };

  const handleViewDetail = (reservation: Reservation) => {
    nav.navigate('ReservationDetail', { reservation });
  };

  const renderCompletaItem = ({ item, index }: { item: Reservation; index: number }) => (
    <Animatable.View animation="fadeInUp" duration={400} delay={index * 50} useNativeDriver>
      <TouchableOpacity style={st.miniCard} onPress={() => handleViewDetail(item)} activeOpacity={0.8}>
        <View style={st.miniLeft}>
          <Ionicons name="checkmark-circle" size={20} color="#00E676" />
          <View style={st.miniInfo}>
            <Text style={st.miniRef}>{item.reference}</Text>
            <Text style={st.miniClient} numberOfLines={1}>{item.customer_name}</Text>
          </View>
        </View>
        <View style={st.miniRight}>
          <Text style={st.miniDate}>{formatDate(item.booking_date)}</Text>
          <Text style={st.miniPrice}>$ {(item.estimate || item.price)?.toLocaleString('es-CO')}</Text>
        </View>
      </TouchableOpacity>
    </Animatable.View>
  );

  const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
    <View style={st.emptyWrap}>
      <FloatingEmptyIcon name={icon as any} />
      <Text style={st.emptyText}>{text}</Text>
    </View>
  );


  return (
    <View style={st.root}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image source={BG_IMAGE} style={st.bgImage} resizeMode="cover" />
        <View style={st.bgOverlay} />
      </View>

      {/* Header */}
      <View style={[st.header, { paddingTop: topPad }]}>
        {!isDriverUser ? (
          <TouchableOpacity style={st.backBtn} onPress={() => nav.goBack()} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
        ) : null}
        <View style={[st.headerTitleWrap, isDriverUser && st.headerTitleWrapDriver]}>
          {isDriverUser ? <Text style={st.headerEyebrow}>T+plus</Text> : null}
          <Text style={st.headerTitle}>Mis Viajes</Text>
        </View>
        <TouchableOpacity
          style={st.refreshHeaderBtn}
          onPress={() => { setRefreshing(true); fetchReservations(); }}
          activeOpacity={0.75}
        >
          <Ionicons name="refresh" size={20} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      {/* Type filter - Inmediatos vs Reservas */}
      <View style={st.typeFilterBar}>
        {([
          { key: 'todos' as TypeFilter, label: 'Todos', icon: 'list-outline' as const },
          { key: 'inmediatos' as TypeFilter, label: 'Inmediatos', icon: 'flash-outline' as const },
          { key: 'reservas' as TypeFilter, label: 'Reservas', icon: 'calendar-outline' as const },
        ]).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[st.typeFilterItem, typeFilter === f.key && st.typeFilterItemActive]}
            onPress={() => setTypeFilter(f.key)}
            activeOpacity={0.75}
          >
            <Ionicons name={f.icon} size={14} color={typeFilter === f.key ? '#051A26' : 'rgba(255,255,255,0.5)'} />
            <Text style={[st.typeFilterLabel, typeFilter === f.key && st.typeFilterLabelActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Earnings summary */}
      <Animatable.View animation="fadeInUp" duration={400} useNativeDriver style={st.earningsCard}>
        <View style={st.earningsHeader}>
          <Ionicons name="wallet-outline" size={16} color="#00E5FF" />
          <Text style={st.earningsTitle}>Balance de ganancias</Text>
        </View>
        <View style={st.earningsRow}>
          <View style={st.earnBlock}>
            <Text style={st.earnLabel}>Hoy</Text>
            <Text style={st.earnAmount} numberOfLines={1}>{fmtMoney(earnings.day.total)}</Text>
            <Text style={st.earnCount} numberOfLines={1}>
              {earnings.day.count} {earnings.day.count === 1 ? 'viaje' : 'viajes'}
            </Text>
          </View>
          <View style={st.earnDivider} />
          <View style={st.earnBlock}>
            <Text style={st.earnLabel}>Semana</Text>
            <Text style={st.earnAmount} numberOfLines={1}>{fmtMoney(earnings.week.total)}</Text>
            <Text style={st.earnCount} numberOfLines={1}>
              {earnings.week.count} {earnings.week.count === 1 ? 'viaje' : 'viajes'}
            </Text>
          </View>
          <View style={st.earnDivider} />
          <View style={st.earnBlock}>
            <Text style={st.earnLabel}>Mes</Text>
            <Text style={st.earnAmount} numberOfLines={1}>{fmtMoney(earnings.month.total)}</Text>
            <Text style={st.earnCount} numberOfLines={1}>
              {earnings.month.count} {earnings.month.count === 1 ? 'viaje' : 'viajes'}
            </Text>
          </View>
        </View>
      </Animatable.View>

      {/* Day search + Completadas tab */}
      <View style={st.tabBar}>
        <View style={[st.tabItem, st.tabItemActive]}>
          <Text style={[st.tabLabel, st.tabLabelActive]}>Completadas</Text>
          {currentData.length > 0 && (
            <View style={[st.tabBadge, st.tabBadgeActive]}>
              <Text style={st.tabBadgeTxt}>{currentData.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={st.daySearchBtn}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="search-outline" size={14} color="#00E5FF" />
          <Text style={st.daySearchTxt} numberOfLines={1}>
            {dayFilter ? formatDate(dayFilter.toISOString()) : 'Buscar por día'}
          </Text>
          {dayFilter && (
            <TouchableOpacity
              style={st.clearDayBtn}
              onPress={() => setDayFilter(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      {dayFilter && (
        <View style={st.dayTotalRow}>
          <Ionicons name="calendar-outline" size={14} color="#00E5FF" />
          <Text style={st.dayTotalTxt}>
            Total del día: <Text style={st.dayTotalAmount}>{fmtMoney(dayFilterTotal)}</Text>
          </Text>
        </View>
      )}

      {showPicker && (
        <DateTimePicker
          value={dayFilter || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          onChange={onPickerChange}
        />
      )}

      {/* Content */}
      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text style={st.loadingTxt}>Cargando reservas...</Text>
        </View>
      ) : (
        <FlatList
          data={currentData}
          keyExtractor={item => item.id}
          renderItem={renderCompletaItem}
          contentContainerStyle={[st.list, { paddingBottom: isDriverUser ? driverNavPad + 24 : insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              text="No hay reservas completadas aún."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchReservations(); }}
              tintColor="#00E5FF"
              colors={['#00E5FF']}
            />
          }
        />
      )}
    </View>
  );
};

export default DriverActivityScreen;

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.34 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,26,38,0.78)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(5,26,38,0.85)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  backBtnSpacer: {
    width: 40,
    height: 40,
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitleWrapDriver: {
    flex: 1,
    paddingHorizontal: 0,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00E5FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', letterSpacing: -0.3 },
  refreshHeaderBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  /* Type filter */
  typeFilterBar: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, gap: 8,
    backgroundColor: 'rgba(5,26,38,0.9)',
  },
  typeFilterItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, borderRadius: 10, gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  typeFilterItemActive: {
    backgroundColor: '#00E5FF', borderColor: '#00E5FF',
  },
  typeFilterLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  typeFilterLabelActive: { color: '#051A26', fontWeight: '700' },
  /* Earnings */
  earningsCard: {
    marginHorizontal: 20, marginTop: 12, padding: 14, borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.55)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.18)',
  },
  earningsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  earningsTitle: { fontSize: 13, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.3 },
  earningsRow: { flexDirection: 'row', alignItems: 'stretch' },
  earnBlock: { flex: 1, alignItems: 'center', paddingHorizontal: 2, minWidth: 0 },
  earnDivider: { width: 1, backgroundColor: 'rgba(0,229,255,0.12)' },
  earnLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  earnAmount: { fontSize: 14, fontWeight: '800', color: '#FFF', letterSpacing: -0.3, flexShrink: 0 },
  earnCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
    flexShrink: 0,
  },
  /* Day search */
  daySearchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8,
    borderRadius: 12, backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)', maxWidth: 200,
  },
  daySearchTxt: { fontSize: 12, fontWeight: '600', color: '#00E5FF', flexShrink: 1 },
  clearDayBtn: {
    width: 18, height: 18, borderRadius: 9, marginLeft: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dayTotalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 22, paddingBottom: 6,
  },
  dayTotalTxt: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  dayTotalAmount: { color: '#00E676', fontWeight: '700' },
  /* Tab bar */
  tabBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: 'rgba(5,26,38,0.9)',
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tabItemActive: {
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)',
  },
  tabLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  tabLabelActive: { color: '#00E5FF', fontWeight: '700' },
  tabBadge: {
    marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabBadgeActive: { backgroundColor: '#00E5FF' },
  tabBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#051A26' },
  /* Loading */
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 14 },
  /* List */
  list: { paddingHorizontal: 20, paddingTop: 12 },
  /* Activa card */
  card: {
    overflow: 'hidden', borderRadius: 22, padding: 18, marginBottom: 16,
    backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
  },
  cardGlow: {
    position: 'absolute', top: -30, left: -30, width: 160, height: 160,
    borderRadius: 80, backgroundColor: 'rgba(0,229,255,0.06)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  refBadge: {
    backgroundColor: 'rgba(0,229,255,0.1)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
  },
  refTxt: { fontSize: 11, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusAccepted: { backgroundColor: 'rgba(0,230,118,0.15)' },
  statusStarted: { backgroundColor: 'rgba(255,214,0,0.15)' },
  statusTxt: { fontSize: 10, fontWeight: '800', color: '#00E676', letterSpacing: 0.5 },
  clientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  clientName: { fontSize: 15, fontWeight: '600', color: '#FFF', marginLeft: 8, flex: 1 },
  todayBadge: {
    backgroundColor: '#00E5FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  todayTxt: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  dtRow: { flexDirection: 'row', marginBottom: 10, gap: 16 },
  dtItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dtTxt: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  routeBlock: { marginBottom: 10 },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00E676', marginRight: 10 },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E91E63', marginRight: 10 },
  routeLine: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 3.5, marginVertical: 2 },
  routeAddr: { fontSize: 13, color: 'rgba(255,255,255,0.8)', flex: 1, fontWeight: '500' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: {
    flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, paddingVertical: 8, marginHorizontal: 3,
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.08)',
  },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontSize: 12, color: '#FFF', fontWeight: '700', marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  detailBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, gap: 6,
    backgroundColor: 'rgba(0,229,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  detailBtnTxt: { fontSize: 13, fontWeight: '700', color: '#00E5FF' },
  startBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, gap: 6, backgroundColor: '#00E5FF',
  },
  startBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  startBtnTxt: { fontSize: 14, fontWeight: '800', color: '#051A26' },
  startBtnTxtDisabled: { color: 'rgba(255,255,255,0.3)' },
  notYetTxt: { fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 6 },
  /* Mini card */
  miniCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderRadius: 16, marginBottom: 10,
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.1)',
  },
  miniLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  miniInfo: { marginLeft: 10, flex: 1 },
  miniRef: { fontSize: 12, fontWeight: '700', color: '#00E5FF' },
  miniClient: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  miniRight: { alignItems: 'flex-end' },
  miniDate: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  miniPrice: { fontSize: 13, fontWeight: '700', color: '#FFF', marginTop: 2 },
  /* Empty */
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,46,61,0.75)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
    shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22,
    shadowRadius: 18, elevation: 6, marginBottom: 18,
  },
  emptyText: {
    fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.6)', textAlign: 'center',
    fontWeight: '500', paddingHorizontal: 30,
  },
});


