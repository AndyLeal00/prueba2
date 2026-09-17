import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';

const BG_IMAGE = require('../../assets/images/bg.png');

// Estados en los que una reserva/servicio ya fue aceptado por el conductor y
// aún no se ha completado ni cancelado. Son las "reservas activas".
const ACTIVE_STATUSES = ['ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED', 'REACHED'];

type Reservation = {
  id: string;
  reference: string;
  booking_type: string;
  trip_type: string;
  customer_name: string;
  pickup_address: string;
  drop_address: string;
  pickup_lat?: string | number;
  pickup_lng?: string | number;
  drop_lat?: string | number;
  drop_lng?: string | number;
  booking_date: string;
  estimate: number;
  price: number;
  distance: number;
  duration: number;
  status: string;
  observations: string | null;
  car_type: string;
};

const isUuid = (value?: string | null) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const formatDate = (ts: string) => {
  try {
    const d = new Date(String(ts).replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch { return ts || ''; }
};

const formatTime = (ts: string) => {
  try {
    const d = new Date(String(ts).replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'p. m.' : 'a. m.';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m}:00 ${ampm}`;
  } catch { return ts || ''; }
};

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Aceptada',
  ARRIVED: 'En el punto de recogida',
  STARTED: 'En curso',
  TRIP_STARTED: 'En curso',
  IN_PROGRESS: 'En curso',
  REACHED: 'Finalizando',
};

const statusLabel = (status: string) => STATUS_LABELS[String(status).toUpperCase()] || status;

const fmtMoney = (v: any) => {
  const n = Number(v) || 0;
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const DriverActiveReservationsScreen = () => {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const driverIdRef = useRef<string | null>(null);

  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;

  // Resuelve el PK users.id del conductor autenticado (mismo patrón que
  // DriverReservationsScreen / index.tsx). Cacheado por sesión de pantalla.
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

  const fetchActive = useCallback(async () => {
    try {
      const headers = await getSupabaseAuthHeaders();
      const driverId = await resolveDriverId();
      if (!driverId) {
        setReservations([]);
        return;
      }
      // Las columnas driver/driver_id están espejadas; filtramos por driver_id.
      const statuses = ACTIVE_STATUSES.map((s) => `"${s}"`).join(',');
      const url = `${SUPABASE_URL}/rest/v1/bookings_v2_mobile?driver_id=eq.${encodeURIComponent(driverId)}&status=in.(${statuses})&order=booking_date.asc&select=*`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn('[RESERVAS ACTIVAS] Fetch status:', res.status, await res.text());
        setReservations([]);
        return;
      }
      const data = await res.json();
      setReservations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[RESERVAS ACTIVAS] error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolveDriverId]);

  // Recargar al enfocar la pantalla + auto-refresh cada 20s mientras está visible.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchActive();
      const interval = setInterval(fetchActive, 20000);
      return () => clearInterval(interval);
    }, [fetchActive]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchActive();
  };

  const goToTrip = (item: Reservation) => {
    nav.navigate('ReservationTrip', { reservation: item });
  };

  const renderItem = ({ item, index }: { item: Reservation; index: number }) => {
    const isImmediate = item.booking_type === 'immediate';
    return (
      <Animatable.View animation="fadeInUp" duration={450} delay={index * 60} useNativeDriver>
        <View style={s.card}>
          <View style={s.cardGlow} />

          <View style={s.cardHeader}>
            <View style={s.refBadge}>
              <Text style={s.refTxt}>{item.reference}</Text>
            </View>
            <View style={[s.typeBadge, isImmediate && s.typeBadgeImmediate]}>
              <Ionicons name={isImmediate ? 'flash' : 'calendar'} size={14} color="#051A26" />
              <Text style={s.typeTxt}>{isImmediate ? 'Inmediato' : 'Reserva'}</Text>
            </View>
          </View>

          <View style={s.statusRow}>
            <View style={s.statusDot} />
            <Text style={s.statusTxt}>{statusLabel(item.status)}</Text>
          </View>

          <View style={s.clientRow}>
            <Ionicons name="person" size={16} color="#00E5FF" />
            <Text style={s.clientName}>{item.customer_name || 'Cliente'}</Text>
          </View>

          <View style={s.routeBlock}>
            <View style={s.routeRow}>
              <View style={s.dotGreen} />
              <Text style={s.routeAddr} numberOfLines={1}>{item.pickup_address || 'Origen'}</Text>
            </View>
            <View style={s.routeLine} />
            <View style={s.routeRow}>
              <View style={s.dotRed} />
              <Text style={s.routeAddr} numberOfLines={1}>{item.drop_address || 'Destino'}</Text>
            </View>
          </View>

          {item.booking_date ? (
            <View style={s.dateTimeRow}>
              <View style={s.dtItem}>
                <Ionicons name="calendar-outline" size={14} color="#00E5FF" />
                <Text style={s.dtTxt}>{formatDate(item.booking_date)}</Text>
              </View>
              <View style={s.dtItem}>
                <Ionicons name="time-outline" size={14} color="#00E5FF" />
                <Text style={s.dtTxt}>{formatTime(item.booking_date)}</Text>
              </View>
            </View>
          ) : null}

          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statLabel}>Valor</Text>
              <Text style={s.statValue}>$ {fmtMoney(item.estimate || item.price)}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Dist.</Text>
              <Text style={s.statValue}>{parseFloat(String(item.distance || 0)).toFixed(2)} km</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Tiempo</Text>
              <Text style={s.statValue}>{item.duration || 0} min</Text>
            </View>
          </View>

          <View style={s.actionsRow}>
            <TouchableOpacity
              style={s.detailBtn}
              onPress={() => nav.navigate('ReservationDetail', { reservation: item })}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={18} color="#00E5FF" />
              <Text style={s.detailTxt}>Detalle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.continueBtn}
              onPress={() => goToTrip(item)}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={18} color="#051A26" />
              <Text style={s.continueTxt}>Continuar viaje</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animatable.View>
    );
  };

  return (
    <View style={s.root}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image source={BG_IMAGE} style={s.bgImage} resizeMode="cover" />
        <View style={s.bgOverlay} />
      </View>

      <View style={[s.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reservas Activas</Text>
        <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} activeOpacity={0.75}>
          <Ionicons name="refresh" size={20} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text style={s.loadingTxt}>Cargando reservas activas...</Text>
        </View>
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="car-outline" size={60} color="rgba(0,229,255,0.3)" />
              <Text style={s.emptyTitle}>No tienes reservas activas</Text>
              <Text style={s.emptySub}>
                Aquí verás las reservas y servicios que ya aceptaste y están en curso.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00E5FF"
              colors={['#00E5FF']}
            />
          }
        />
      )}
    </View>
  );
};

export default DriverActiveReservationsScreen;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', letterSpacing: -0.3 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  list: { paddingHorizontal: 18, paddingTop: 14 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingTxt: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: 40 },
  card: {
    overflow: 'hidden', borderRadius: 20, padding: 18, marginBottom: 16,
    backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
  },
  cardGlow: {
    position: 'absolute', top: -40, right: -40, width: 140, height: 140,
    borderRadius: 70, backgroundColor: 'rgba(0,229,255,0.06)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  refBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  refTxt: { fontSize: 12, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.5 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: '#00E5FF',
  },
  typeBadgeImmediate: { backgroundColor: '#FF9500' },
  typeTxt: { fontSize: 11, fontWeight: '700', color: '#051A26' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00E676' },
  statusTxt: { fontSize: 12, fontWeight: '700', color: '#00E676', letterSpacing: 0.3, textTransform: 'uppercase' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  clientName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  routeBlock: { marginBottom: 12, paddingLeft: 4 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00E676' },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5252' },
  routeLine: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 4.5 },
  routeAddr: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  dateTimeRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dtItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dtTxt: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(5,26,38,0.6)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.08)',
  },
  statLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2 },
  statValue: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  detailBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(0,229,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  detailTxt: { fontSize: 14, fontWeight: '700', color: '#00E5FF' },
  continueBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 16, backgroundColor: '#00E5FF',
  },
  continueTxt: { fontSize: 15, fontWeight: '700', color: '#051A26' },
});
