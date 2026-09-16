import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Platform, Dimensions, Modal, ScrollView,
} from 'react-native';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { RootState } from '@/common/store';
import { selectDriverOnline } from '@/components/DriverBottomNav';
import { invokeDriverGoActivate, invokeDriverGoDeactivate } from '@/common/utils/driverGoBridge';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';
import { useAppDispatch } from '@/common/store/hooks';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { updateDriverNotification, notifyNewBooking } from '@/hooks/DriverNotificationService';
import { fetchMemberships } from '@/common/reducers/membershipSlice';
import { toCanonicalCarType } from '@/common/utils/carType';
import { formatBookingFareRange, getBookingFareRange } from '@/constants/fare';
import { API_KEY } from '@/config/AppConfig';
import { GOOGLE_MAPS_DARK_STYLE } from '@/config/googleMapsDarkStyle';

const IMMEDIATE_RANGE_KM = 3;
const ROUTE_LINE_BLUE = '#00E5FF';

const BG_IMAGE = require('../../assets/images/bg.png');

type LatLng = { latitude: number; longitude: number };

const decodePolyline = (encoded: string): LatLng[] => {
  const coordinates: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
};

const sendPushNotification = async (token: string, title: string, body: string) => {
  if (!token) return;
  try {
    await fetch('https://us-central1-treasupdate.cloudfunctions.net/sendNotification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title, body }),
    });
  } catch (e) {
    console.error('Push notification error:', e);
  }
};

type Reservation = {
  id: string;
  reference: string;
  booking_type: string;
  trip_type: string;
  customer_name: string;
  customer_contact: string;
  customer_token: string;
  pickup_address: string;
  pickup_lat?: string | number;
  pickup_lng?: string | number;
  drop_address: string;
  drop_lat?: string | number;
  drop_lng?: string | number;
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

type DriverReservationsScreenProps = {
  embedded?: boolean;
  initialTab?: 'reservations' | 'immediate';
};

const formatDate = (ts: string) => {
  try {
    const d = new Date(ts.replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch { return ts || ''; }
};

const formatTime = (ts: string) => {
  try {
    const d = new Date(ts.replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'p. m.' : 'a. m.';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  } catch { return ts || ''; }
};

const moneyFmt = (n: number) =>
  Math.round(n || 0).toLocaleString('es-CO');

const isUuid = (value?: string | null) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const toFiniteNumber = (value: any): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractLatLng = (source: any): { lat: number; lng: number } | null => {
  if (!source) return null;

  const directLat = toFiniteNumber(source.lat ?? source.latitude ?? source.pickup_lat ?? source.driver_lat);
  const directLng = toFiniteNumber(source.lng ?? source.longitude ?? source.pickup_lng ?? source.driver_lng);
  if (directLat !== null && directLng !== null) {
    return { lat: directLat, lng: directLng };
  }

  const nestedLocation = source.location || source.pickup_location;
  if (nestedLocation) {
    if (typeof nestedLocation === 'string') {
      try {
        return extractLatLng(JSON.parse(nestedLocation));
      } catch {
        return null;
      }
    }
    return extractLatLng(nestedLocation);
  }

  return null;
};

const getDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLng = toRad(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const DriverReservationsScreen = ({ embedded = false, initialTab: initialTabProp }: DriverReservationsScreenProps) => {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;
  const driverOnline = useSelector(selectDriverOnline);
  const memberships = useSelector((s: RootState) => s.memberships.memberships);

  // FK: memberships.conductor → auth.users(id). Probamos auth_id primero
  // y caemos a users.id por compatibilidad con datos legacy.
  const driverIdCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [profile?.auth_id, user?.auth_id, profile?.id, user?.id, user?.uid]
            .map((v) => (v ? String(v) : ''))
            .filter(Boolean),
        ),
      ),
    [profile?.auth_id, profile?.id, user?.auth_id, user?.id, user?.uid],
  );
  const driverConductorId = driverIdCandidates[0];
  const activeMembership = memberships.find(
    (m: any) =>
      m.status === 'ACTIVA' &&
      driverIdCandidates.includes(String(m.conductor)),
  );

  useEffect(() => {
    // Un solo fetch con el id canónico (auth_id). Disparar uno por cada
    // candidato hacía que los ids equivocados (users.id / uid) resolvieran []
    // y, al llegar de últimos, borraban la membresía buena de la cache →
    // activeMembership undefined → la app pide "renovar" teniendo membresía.
    if (driverConductorId) {
      dispatch(fetchMemberships(driverConductorId));
    }
  }, [dispatch, driverConductorId]);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [detailRouteCoords, setDetailRouteCoords] = useState<LatLng[]>([]);
  const [detailEndpoints, setDetailEndpoints] = useState<{ start: LatLng; end: LatLng } | null>(null);
  const [detailRouteLoading, setDetailRouteLoading] = useState(false);
  const [detailMarkerTracks, setDetailMarkerTracks] = useState(true);
  const [customerPhotos, setCustomerPhotos] = useState<Record<string, string>>({});
  const detailMapRef = useRef<MapView | null>(null);
  const [activeCarType, setActiveCarType] = useState<string | null>(null);

  /* ── Tab selector: Reservas vs Inmediatos ── */
  const routeInitialTab = route.params?.initialTab as 'reservations' | 'immediate' | undefined;
  const [activeTab, setActiveTab] = useState<'reservations' | 'immediate'>(
    () => initialTabProp || routeInitialTab || 'reservations',
  );
  useEffect(() => {
    const tab = initialTabProp || routeInitialTab;
    if (tab) setActiveTab(tab);
  }, [initialTabProp, routeInitialTab]);

  const wasOnlineRef = useRef(driverOnline);
  useEffect(() => {
    if (embedded && driverOnline && !wasOnlineRef.current) {
      setActiveTab('immediate');
    }
    wasOnlineRef.current = driverOnline;
  }, [driverOnline, embedded]);

  const [immediateServices, setImmediateServices] = useState<Reservation[]>([]);
  const [searchingImmediate, setSearchingImmediate] = useState(false);
  const rangeKm = IMMEDIATE_RANGE_KM;

  /* ── Live GPS del conductor (para filtro estricto de 3km) ── */
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        return;
      }
      try {
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLiveCoords({ lat: first.coords.latitude, lng: first.coords.longitude });
      } catch {
        // GPS aún sin fix; el watcher de abajo actualizará liveCoords en cuanto haya señal.
      }
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 8000 },
          loc => setLiveCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
        );
      } catch {
        setLocationDenied(true);
      }
    })();
    return () => { sub?.remove(); };
  }, []);

  /* ── IDs ya vistos para notificar solo nuevos ── */
  const seenReservationIdsRef = useRef<Set<string> | null>(null);
  const seenImmediateIdsRef = useRef<Set<string> | null>(null);
  /* ── IDs de cancelaciones ya notificadas (evita repetir en ciclos sucesivos) ── */
  const notifiedCancelledIdsRef = useRef<Set<string>>(new Set());

  /* ── Custom alert state ── */
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info' | 'confirm'>('info');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);
  const showAlert = (type: typeof alertType, title: string, message: string, buttons?: AlertButton[]) => {
    setAlertType(type); setAlertTitle(title); setAlertMessage(message);
    setAlertButtons(buttons || [{ text: 'OK', onPress: () => setAlertVisible(false) }]);
    setAlertVisible(true);
  };

  const topPad = embedded ? 8 : Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;

  const driverName = [
    profile?.first_name || user?.first_name || user?.firstName || '',
    profile?.last_name || user?.last_name || user?.lastName || '',
  ].filter(Boolean).join(' ') || 'Conductor';

  const driverCoords = liveCoords ?? extractLatLng({
    ...profile,
    ...user,
    location: user?.location || profile?.location,
  });

  const resolveDriverId = useCallback(async (): Promise<string> => {
    const candidates = [user?.auth_id, user?.id, profile?.auth_id, profile?.id]
      .map((value) => String(value || '').trim())
      .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);

    if (candidates.length === 0) {
      throw new Error('No se pudo resolver el conductor autenticado.');
    }

    const headers = await getSupabaseAuthHeaders();

    for (const candidate of candidates) {
      if (!isUuid(candidate)) continue;
      const byIdUrl = `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(candidate)}&select=id&limit=1`;
      const byIdRes = await fetch(byIdUrl, { headers });
      const byIdData = byIdRes.ok ? await byIdRes.json() : [];
      if (Array.isArray(byIdData) && byIdData.length > 0 && byIdData[0]?.id) {
        return byIdData[0].id;
      }
    }

    for (const candidate of candidates) {
      if (!isUuid(candidate)) continue;
      const byAuthUrl = `${SUPABASE_URL}/rest/v1/users?auth_id=eq.${encodeURIComponent(candidate)}&select=id&limit=1`;
      const byAuthRes = await fetch(byAuthUrl, { headers });
      const byAuthData = byAuthRes.ok ? await byAuthRes.json() : [];
      if (Array.isArray(byAuthData) && byAuthData.length > 0 && byAuthData[0]?.id) {
        return byAuthData[0].id;
      }
    }

    throw new Error('No se encontró el perfil del conductor en users.');
  }, [profile?.auth_id, profile?.id, user?.auth_id, user?.id]);

  // Los nombres entre la app del cliente (car_types.name), la del conductor
  // (cars.features.carType) y el dashboard web (cars.service_type)
  // divergieron históricamente. Usar SIEMPRE la tabla canónica compartida
  // (`common/utils/carType.ts`) en vez de reinventar una local — la tabla
  // local anterior no incluía valores reales del registro web (ej.
  // "servicio_especial"), dejando a esos conductores sin ver reservas nunca.
  // Ver [[10-deuda-tecnica]].
  const normalizeCarType = (value: any): string => toCanonicalCarType(value).toLowerCase();

  const fetchActiveCarType = useCallback(async (): Promise<string | null> => {
    try {
      const headers = await getSupabaseAuthHeaders();
      const driverId = await resolveDriverId();
      // Prioridad: service_type (columna canónica que actualiza el dashboard web)
      // Fallback: features.carType (formato legacy del móvil).
      // Este orden permite que la corrección hecha en web se refleje al conductor
      // sin backfill de BD; si en el futuro se elimina features.carType, seguirá OK.
      const url = `${SUPABASE_URL}/rest/v1/cars?driver_id=eq.${encodeURIComponent(driverId)}&is_active=eq.true&select=service_type,features,is_active&limit=1`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const row = Array.isArray(data) ? data[0] : null;
        const fromServiceType = row?.service_type;
        const fromFeatures = row?.features?.carType;
        const raw = (fromServiceType && String(fromServiceType).trim())
          || (fromFeatures && String(fromFeatures).trim())
          || '';
        if (raw) {
          setActiveCarType(raw);
          return raw;
        }
      }
    } catch (e) {
      console.warn('[carType] fetchActiveCarType error:', (e as any)?.message);
    }
    setActiveCarType(null);
    return null;
  }, [resolveDriverId]);

  useEffect(() => {
    fetchActiveCarType();
    const interval = setInterval(fetchActiveCarType, 30000);
    return () => clearInterval(interval);
  }, [fetchActiveCarType]);

  const fetchReservations = useCallback(async () => {
    try {
      const headers = await getSupabaseAuthHeaders();
      // Filtro explícito: SOLO reservas programadas
      const url = `${SUPABASE_URL}/rest/v1/bookings?booking_type=eq.reservation&status=eq.PENDING&order=booking_date.asc`;
      console.log('[RESERVAS] Trayendo reservas con filtro:', url);
      const res = await fetch(url, { headers });
      console.log(`📡 [RESERVAS] Response status: ${res.status}`);
      if (!res.ok) {
        const errText = await res.text();
        console.warn('❌ [RESERVAS] Fetch status:', res.status, errText);
        setReservations([]);
        return;
      }
      const data = await res.json();
      console.log(`✅ [RESERVAS] Encontradas ${data?.length || 0} reservas (booking_type=reservation) [tipo: ${Array.isArray(data) ? 'array' : typeof data}]`);
      if (data && data.length > 0) {
        console.log('  Ejemplos:', data.slice(0, 2).map((r: any) => ({ ref: r.reference, type: r.booking_type, status: r.status, driver: r.driver })));
      }

      const rawList: any[] = Array.isArray(data) ? data : [];
      const driverCarTypeNorm = normalizeCarType(activeCarType);
      const list: any[] = driverCarTypeNorm
        ? rawList.filter((it: any) =>
            normalizeCarType(it?.car_type || it?.carType) === driverCarTypeNorm,
          )
        : [];
      if (!driverCarTypeNorm) {
        console.log('[RESERVAS] Sin vehículo activo: no se muestran reservas.');
      } else {
        console.log(`[RESERVAS] Filtradas por carType="${activeCarType}": ${list.length}/${rawList.length}`);
      }
      const currentIds = new Set<string>(list.map((it: any) => String(it.id)));
      const previous = seenReservationIdsRef.current;
      if (previous) {
        for (const it of list) {
          if (!previous.has(String(it.id))) {
            const pickup = it.pickup_address || 'punto desconocido';
            const when = it.booking_date ? ` · ${formatDate(it.booking_date)}` : '';
            notifyNewBooking(
              '📅 Nueva reserva programada',
              `Recogida: ${pickup}${when}`,
              { bookingId: it.id, bookingType: 'reservation' },
            ).catch(() => {});
          }
        }
      }
      seenReservationIdsRef.current = currentIds;

      setReservations(list);
    } catch (e) {
      console.error('❌ Fetch reservations error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCarType]);

  /* ── Buscar servicios inmediatos disponibles ── */
  const searchImmediateServices = useCallback(async () => {
    try {
      setSearchingImmediate(true);
      const headers = await getSupabaseAuthHeaders();
      
      // Traer inmediatos recientes y filtrar en cliente para evitar perder filas
      // cuando driver/driver_id vienen null, vacíos o con formatos distintos.
      const urlImmediates = `${SUPABASE_URL}/rest/v1/bookings?booking_type=eq.immediate&limit=1000&select=*&order=created_at.desc`;
      
      console.log('🟢 [INMEDIATOS] Query:', urlImmediates);
      
      const res = await fetch(urlImmediates, { headers });
      console.log(`📡 [INMEDIATOS] Response status: ${res.status}`);
      
      const allData = res.ok ? await res.json() : [];
      console.log(`📊 [INMEDIATOS] RAW data count: ${Array.isArray(allData) ? allData.length : 'NOT ARRAY'}`);
      
      // Log EXACTAMENTE qué status tienen los primeros 15 items
      if (Array.isArray(allData) && allData.length > 0) {
        console.log('🔍 [INMEDIATOS] Primeros 15 items:', allData.slice(0, 15).map((x: any) => ({ ref: x.reference, status: x.status, id: x.id })));
      }
      
      if (!Array.isArray(allData)) {
        console.log('⚠️ ERROR: allData no es array:', typeof allData);
        setImmediateServices([]);
        return;
      }
      
      const driverCarType = normalizeCarType(activeCarType);

      if (!driverCarType) {
        console.log('[INMEDIATOS] Sin vehículo activo: no se muestran servicios.');
        setImmediateServices([]);
        return;
      }

      const filtered = allData.filter((item: any) => {
        const status = String(item?.status || '').toUpperCase();
        const isAvailableStatus = status === 'NEW' || status === 'PENDING';
        if (!isAvailableStatus) return false;

        const hasAssignedDriver = Boolean(String(item?.driver || '').trim()) || Boolean(String(item?.driver_id || '').trim());
        if (hasAssignedDriver) return false;

        const bookingCarType = normalizeCarType(item?.car_type || item?.carType);
        if (bookingCarType !== driverCarType) return false;

        // Filtro estricto: si no podemos verificar la distancia, NO mostramos.
        // Los inmediatos solo deben aparecer si el pickup está a <= 3km.
        const pickupCoords = extractLatLng(item);
        if (!pickupCoords || !driverCoords) return false;

        const distanceKm = getDistanceKm(
          driverCoords.lat,
          driverCoords.lng,
          pickupCoords.lat,
          pickupCoords.lng,
        );

        item.distance_to_pickup_km = distanceKm;
        return distanceKm <= rangeKm;
      });
      
      const newCount = filtered.filter((item: any) => item.status === 'NEW').length;
      const pendingCount = filtered.filter((item: any) => item.status === 'PENDING').length;
      
      console.log(`✅ [INMEDIATOS] Tras filtrar: NEW: ${newCount}, PENDING: ${pendingCount}, Total: ${filtered.length}, rangeKm: ${rangeKm}, driverCoords: ${driverCoords ? `${driverCoords.lat},${driverCoords.lng}` : 'N/A'}`);

      // Notificar nuevos inmediatos (que no estaban en la lista anterior)
      const currentIds = new Set<string>(filtered.map((it: any) => String(it.id)));
      const previous = seenImmediateIdsRef.current;
      if (previous) {
        for (const it of filtered as any[]) {
          if (!previous.has(String(it.id))) {
            const pickup = it.pickup_address || 'punto desconocido';
            const distTxt = typeof it.distance_to_pickup_km === 'number'
              ? ` · ${it.distance_to_pickup_km.toFixed(1)} km`
              : '';
            notifyNewBooking(
              '⚡ Nuevo servicio inmediato',
              `Recogida: ${pickup}${distTxt}`,
              { bookingId: it.id, bookingType: 'immediate' },
            ).catch(() => {});
          }
        }

        // Detectar servicios que desaparecieron porque el cliente canceló
        for (const prevId of previous) {
          if (!currentIds.has(prevId) && !notifiedCancelledIdsRef.current.has(prevId)) {
            const disappeared = allData.find((b: any) => String(b.id) === prevId);
            if (
              disappeared &&
              String(disappeared.status || '').toUpperCase() === 'CANCELLED' &&
              disappeared.cancelled_by === 'customer'
            ) {
              notifiedCancelledIdsRef.current.add(prevId);
              const customerName = disappeared.customer_name || 'El cliente';
              const reference = disappeared.reference ? ` (${disappeared.reference})` : '';
              notifyNewBooking(
                '❌ Servicio cancelado por el cliente',
                `${customerName} canceló el servicio${reference}`,
                { bookingId: disappeared.id, bookingType: 'immediate' },
              ).catch(() => {});
            }
          }
        }
      }
      seenImmediateIdsRef.current = currentIds;

      setImmediateServices(filtered);
    } catch (e) {
      console.error('❌ Search immediate services error:', e);
      setImmediateServices([]);
    } finally {
      setSearchingImmediate(false);
    }
  }, [driverCoords, rangeKm, activeCarType]);

  useEffect(() => {
    fetchReservations();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  /* ── Auto-refresh inmediatos cada 10 segundos (solo con GO activo) ── */
  useEffect(() => {
    if (!driverOnline) {
      setImmediateServices([]);
      setSearchingImmediate(false);
      return;
    }
    searchImmediateServices();
    const interval = setInterval(searchImmediateServices, 10000);
    return () => clearInterval(interval);
  }, [driverOnline, searchImmediateServices]);

  const handleAccept = async (reservation: Reservation) => {
    const isImmmediate = reservation.booking_type === 'immediate';

    // Regla de negocio: el conductor solo puede tomar servicios cuya categoría
    // coincida con la del vehículo que tiene actualmente activo.
    const driverCarTypeNorm = normalizeCarType(activeCarType);
    if (!driverCarTypeNorm) {
      showAlert(
        'warning',
        'Sin vehículo activo',
        'Debes activar un vehículo en "Mis Vehículos" antes de tomar servicios o reservas.',
        [
          { text: 'Ahora no', style: 'cancel', onPress: () => setAlertVisible(false) },
          {
            text: 'Ir a vehículos',
            onPress: () => {
              setAlertVisible(false);
              nav.navigate('Cars');
            },
          },
        ],
      );
      return;
    }
    const bookingCarTypeNorm = normalizeCarType(reservation?.car_type);
    if (bookingCarTypeNorm && bookingCarTypeNorm !== driverCarTypeNorm) {
      showAlert(
        'warning',
        'Categoría no coincide',
        `Este ${isImmmediate ? 'servicio' : 'reserva'} es para la categoría "${reservation.car_type}". Tu vehículo activo es de la categoría "${activeCarType}".`,
      );
      return;
    }

    // Bloquear toma de servicios si no hay membresía ACTIVA (regla de negocio para conductores).
    if (!activeMembership) {
      console.log('[Membership] DriverReservations.handleAccept BLOQUEADO: sin membresía activa', {
        driverIdCandidates,
        memberships: memberships.length,
      });
      showAlert(
        'warning',
        'Membresía requerida',
        'No tienes una membresía activa. Puedes ver los servicios disponibles, pero para tomarlos necesitas renovar tu membresía.',
        [
          { text: 'Ahora no', style: 'cancel', onPress: () => setAlertVisible(false) },
          {
            text: 'Renovar membresía',
            onPress: () => {
              setAlertVisible(false);
              nav.navigate('Wallet');
            },
          },
        ],
      );
      return;
    }

    const observationText = reservation.observations && String(reservation.observations).trim()
      ? `\n\nObservación del cliente: ${String(reservation.observations).trim()}`
      : '';

    showAlert('confirm',
      isImmmediate ? 'Aceptar Servicio' : 'Aceptar Reserva',
      `¿Deseas aceptar ${isImmmediate ? 'el servicio' : 'la reserva'} de ${reservation.customer_name}?\n\nOrigen: ${reservation.pickup_address}\nDestino: ${reservation.drop_address}${!isImmmediate ? `\nFecha: ${formatDate(reservation.booking_date)}\nHora: ${formatTime(reservation.booking_date)}` : ''}${observationText}`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setAlertVisible(false) },
        {
          text: 'Aceptar',
          onPress: () => { setAlertVisible(false); confirmAccept(reservation); },
        },
      ],
    );
  };

  const confirmAccept = async (reservation: Reservation) => {
    setAccepting(reservation.id);
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const isImmediate = reservation.booking_type === 'immediate';
      const driverId = await resolveDriverId();

      // First check it's still available (get without status filter, then check in code)
      const checkUrl = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${reservation.id}&booking_type=eq.${reservation.booking_type}&select=id,status`;
      const checkRes = await fetch(checkUrl, { headers });
      const checkData = await checkRes.json();

      // Validar que aún está disponible (para immediate: NEW o PENDING; para reservation: PENDING)
      const isValidStatus = isImmediate 
        ? checkData?.[0]?.status === 'NEW' || checkData?.[0]?.status === 'PENDING'
        : checkData?.[0]?.status === 'PENDING';

      if (!checkData || checkData.length === 0 || !isValidStatus) {
        showAlert('warning', 'No disponible', isImmediate 
          ? 'Este servicio ya fue aceptado por otro conductor.' 
          : 'Esta reserva ya fue aceptada por otro conductor.');
        if (isImmediate) {
          searchImmediateServices();
        } else {
          fetchReservations();
        }
        return;
      }

      // Get driver vehicle data — prefer active car, fall back to any registered car
      const carUrl = `${SUPABASE_URL}/rest/v1/cars?driver_id=eq.${encodeURIComponent(driverId)}&is_active=eq.true&select=plate,make,model,color,vehicle_number,vehicle_make,vehicle_model,vehicle_color&limit=1`;
      const carRes = await fetch(carUrl, { headers });
      const cars = await carRes.json();
      let car = cars?.[0];

      // If no active car found, try any car for this driver
      if (!car) {
        const anyCarUrl = `${SUPABASE_URL}/rest/v1/cars?driver_id=eq.${encodeURIComponent(driverId)}&select=plate,make,model,color,vehicle_number,vehicle_make,vehicle_model,vehicle_color&order=created_at.desc&limit=1`;
        const anyCarRes = await fetch(anyCarUrl, { headers });
        const anyCars = await anyCarRes.json();
        car = anyCars?.[0] || {};
      }

      // Plate fallback chain: cars.plate → cars.vehicle_number → user profile vehicle_number → user Firebase vehicleNumber
      const resolvedPlate =
        car.plate ||
        car.vehicle_number ||
        user?.vehicle_number ||
        user?.vehicleNumber ||
        null;

      // Update booking to ACCEPTED with driver info
      const updateBody = {
        status: 'ACCEPTED',
        driver: driverId,
        driver_id: driverId,
        driver_name: driverName,
        driver_contact: user?.mobile || '',
        driver_token: user?.pushToken || user?.push_token || '',
        plate_number: resolvedPlate,
        vehicle_number: resolvedPlate,
        vehicle_make: car.make || car.vehicle_make || null,
        vehicle_model: car.model || car.vehicle_model || null,
        vehicle_color: car.color || car.vehicle_color || null,
        car_model: car.model || car.vehicle_model || null,
        driver_arrived_time: new Date().toISOString(),
      };

      const updateUrl = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${reservation.id}`; // Sin filtro de status en URL
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(updateBody),
      });

      if (!updateRes.ok) {
        const err = await updateRes.text();
        throw new Error(err);
      }

      const updateData = await updateRes.json();
      const [updated] = Array.isArray(updateData) ? updateData : [updateData];
      
      // Asegurar que tenemos todos los datos necesarios (preservando datos originales)
      const completeReservation = {
        ...reservation,
        ...updated,
        status: 'ACCEPTED',
        driver: driverId,
        // Asegurar que estos campos críticos se preservan
        pickup_lat: updated?.pickup_lat || reservation.pickup_lat,
        pickup_lng: updated?.pickup_lng || reservation.pickup_lng,
        drop_lat: updated?.drop_lat || reservation.drop_lat,
        drop_lng: updated?.drop_lng || reservation.drop_lng,
        pickup_address: updated?.pickup_address || reservation.pickup_address,
        drop_address: updated?.drop_address || reservation.drop_address,
        customer_name: updated?.customer_name || reservation.customer_name,
        id: reservation.id, // Asegurar que usamos el ID original
      };
      
      console.log('✅ [CompleteReservation] Datos listos:', {
        id: completeReservation.id,
        pickup: `${completeReservation.pickup_lat}, ${completeReservation.pickup_lng}`,
        drop: `${completeReservation.drop_lat}, ${completeReservation.drop_lng}`,
      });

      // ⛔ NOTIFICACIÓN AL CLIENTE: se envía SOLO desde el servidor.
      // El Database Webhook `booking-events` → `bookingWebhookDispatcher`
      // detecta la transición a ACCEPTED y despacha el push "Conductor asignado"
      // al cliente (canal bookings-v2). Enviarlo también desde aquí (vía la
      // función legacy `treasupdate`) causaba la NOTIFICACIÓN DUPLICADA.
      // Fuente única de verdad = el dispatcher del servidor.

      // To driver (self): confirmation
      const driverToken = user?.pushToken || user?.push_token;
      if (driverToken) {
        sendPushNotification(
          driverToken,
          isImmediate ? 'Has aceptado un servicio inmediato 🚗' : 'Has aceptado una reserva 📅',
          isImmediate
            ? `Servicio ${reservation.reference} de ${reservation.customer_name}.`
            : `Reserva ${reservation.reference} de ${reservation.customer_name}. Fecha: ${formatDate(reservation.booking_date)} a las ${formatTime(reservation.booking_date)}.`,
        );
      }

      // Remove from local list
      if (isImmediate) {
        setImmediateServices(prev => prev.filter(r => r.id !== reservation.id));
      } else {
        setReservations(prev => prev.filter(r => r.id !== reservation.id));
      }

      // Update persistent notification
      updateDriverNotification(
        isImmediate ? '⚡ Servicio inmediato' : '📅 Reserva aceptada',
        isImmediate 
          ? `${reservation.customer_name} — Recogida: ${reservation.pickup_address}`
          : `${reservation.customer_name} — ${formatDate(reservation.booking_date)} a las ${formatTime(reservation.booking_date)}`,
      ).catch(() => {});

      showAlert('success',
        isImmediate ? '¡Servicio Aceptado!' : '¡Reserva Aceptada!',
        isImmediate
          ? `Has aceptado el servicio de ${reservation.customer_name}`
          : `Has aceptado la reserva de ${reservation.customer_name}`,
        [{
          text: 'Ir al viaje',
          onPress: () => { 
            setAlertVisible(false); 
            // Navegar a ReservationTripScreen con todos los datos necesarios
            console.log('✅ [NAVIGATE] Ir al viaje con:', {
              id: completeReservation.id,
              customer: completeReservation.customer_name,
              pickup: `${completeReservation.pickup_lat}, ${completeReservation.pickup_lng}`,
              drop: `${completeReservation.drop_lat}, ${completeReservation.drop_lng}`,
            });
            nav.navigate('ReservationTrip', { reservation: completeReservation }); 
          },
        }],
      );
    } catch (e: any) {
      console.error('Accept booking error:', e);
      const raw = String(e?.message || 'Error desconocido');
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.message || parsed?.details || raw;
      } catch {
        detail = raw;
      }
      showAlert('error', 'Error', `No se pudo aceptar. ${detail}`);
    } finally {
      setAccepting(null);
    }
  };

  const fmtMoney = (v: any) => {
    const n = Number(v) || 0;
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const resolveCustomerPhoto = useCallback((item: any) => {
    const id = String(item?.customer_id || item?.customer || '').trim();
    if (id && customerPhotos[id]) return customerPhotos[id];
    const direct = String(item?.customer_image || item?.profile_image || '').trim();
    if (direct.startsWith('http')) return direct;
    return null;
  }, [customerPhotos]);

  // Enrich customer profile photos for visible cards
  useEffect(() => {
    let cancelled = false;
    const list = activeTab === 'immediate' ? immediateServices : reservations;
    const ids = Array.from(
      new Set(
        list
          .map((it: any) => String(it?.customer_id || it?.customer || '').trim())
          .filter(Boolean)
          .filter((id) => !customerPhotos[id]),
      ),
    ).slice(0, 20);
    if (ids.length === 0) return;

    (async () => {
      try {
        const headers = await getSupabaseAuthHeaders();
        const next: Record<string, string> = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const url =
                `${SUPABASE_URL}/rest/v1/users` +
                `?or=(id.eq.${encodeURIComponent(id)},auth_id.eq.${encodeURIComponent(id)})` +
                `&select=id,auth_id,profile_image&limit=1`;
              const res = await fetch(url, { headers });
              if (!res.ok) return;
              const rows = await res.json();
              const u = Array.isArray(rows) ? rows[0] : null;
              const photo = String(u?.profile_image || '').trim();
              if (photo.startsWith('http')) {
                next[id] = photo;
                if (u?.id) next[String(u.id)] = photo;
                if (u?.auth_id) next[String(u.auth_id)] = photo;
              }
            } catch {}
          }),
        );
        if (!cancelled && Object.keys(next).length > 0) {
          setCustomerPhotos((prev) => ({ ...prev, ...next }));
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [activeTab, immediateServices, reservations]);

  const openServiceDetail = useCallback(async (item: any) => {
    setDetailItem(item);
    setDetailRouteCoords([]);
    setDetailEndpoints(null);
    const oLat = Number(item?.pickup_lat ?? item?.pickup?.lat);
    const oLng = Number(item?.pickup_lng ?? item?.pickup?.lng);
    const dLat = Number(item?.drop_lat ?? item?.drop?.lat);
    const dLng = Number(item?.drop_lng ?? item?.drop?.lng);
    if (!Number.isFinite(oLat) || !Number.isFinite(oLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
      return;
    }
    const start = { latitude: oLat, longitude: oLng };
    const end = { latitude: dLat, longitude: dLng };
    setDetailRouteLoading(true);

    const applyRoute = (coords: LatLng[]) => {
      if (coords.length < 2) return;
      setDetailMarkerTracks(true);
      setDetailRouteCoords(coords);
      setDetailEndpoints({
        start: coords[0],
        end: coords[coords.length - 1],
      });
      setTimeout(() => {
        detailMapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
          animated: false,
        });
        setTimeout(() => setDetailMarkerTracks(false), 500);
      }, 250);
    };

    try {
      if (API_KEY) {
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${oLat},${oLng}&destination=${dLat},${dLng}&key=${API_KEY}&language=es`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]?.overview_polyline?.points) {
          applyRoute(decodePolyline(data.routes[0].overview_polyline.points));
          return;
        }
      }
      applyRoute([start, end]);
    } catch {
      applyRoute([start, end]);
    } finally {
      setDetailRouteLoading(false);
    }
  }, []);

  const closeServiceDetail = () => {
    setDetailItem(null);
    setDetailRouteCoords([]);
    setDetailEndpoints(null);
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    try {
    const fare = getBookingFareRange(item);
    const photo = resolveCustomerPhoto(item);
    const tripLabel = item.trip_type || 'Ida';
    const distKm = parseFloat(String(item.distance || 0));
    const durationMin = Number(item.duration || 0);

    return (
    <Animatable.View animation="fadeInUp" duration={400} delay={index * 40} useNativeDriver>
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={s.cardMain}>
            <View style={s.clientRow}>
              {photo ? (
                <Image source={{ uri: photo }} style={s.avatarImg} />
              ) : (
                <View style={s.avatarFallback}>
                  <Ionicons name="person" size={16} color="#00E5FF" />
                </View>
              )}
              <View style={s.clientMeta}>
                <Text style={s.clientName} numberOfLines={1}>{item.customer_name || 'Cliente'}</Text>
                <Text style={s.tripTypeTxt} numberOfLines={1}>{tripLabel}</Text>
              </View>
            </View>

            <View style={s.routeBlock}>
              <View style={s.routeRow}>
                <View style={s.dotStart} />
                <Text style={s.routeAddr} numberOfLines={1}>{item.pickup_address || 'Origen'}</Text>
              </View>
              <View style={s.routeLine} />
              <View style={s.routeRow}>
                <View style={s.dotEnd} />
                <Text style={s.routeAddr} numberOfLines={1}>{item.drop_address || 'Destino'}</Text>
              </View>
            </View>

            <View style={s.metricsRow}>
              <View style={s.pricePill}>
                <Text style={s.pricePillTxt}>$ {moneyFmt(fare.min)}</Text>
                {!fare.isComplete && fare.max !== fare.min ? (
                  <>
                    <Text style={s.pricePillSep}>–</Text>
                    <Text style={s.pricePillTxt}>$ {moneyFmt(fare.max)}</Text>
                  </>
                ) : null}
              </View>
              <Text style={s.metricTxt}>{distKm.toFixed(1)} km</Text>
              <Text style={s.metricDot}>·</Text>
              <Text style={s.metricTxt}>{durationMin || 0} min</Text>
              {item.booking_date ? (
                <>
                  <Text style={s.metricDot}>·</Text>
                  <Text style={s.metricTxt}>{formatTime(item.booking_date)}</Text>
                </>
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            style={s.verBtn}
            onPress={() => openServiceDetail(item)}
            activeOpacity={0.85}
          >
            <Text style={s.verBtnTxt}>Ver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animatable.View>
    );
    } catch (e: any) {
      console.error(`❌ [RENDER ERROR] item #${index}:`, e?.message, JSON.stringify(item).substring(0, 200));
      return (
        <View style={{ padding: 16, margin: 8, backgroundColor: 'rgba(255,0,0,0.2)', borderRadius: 10 }}>
          <Text style={{ color: '#FF4444', fontSize: 14 }}>Error al mostrar: {item?.reference || 'desconocido'}</Text>
          <Text style={{ color: '#FF8888', fontSize: 11 }}>{e?.message}</Text>
        </View>
      );
    }
  };

  const EmptyState = () => (
    <View style={s.emptyWrap}>
      <Ionicons
        name={activeCarType ? 'calendar-outline' : 'car-outline'}
        size={60}
        color="rgba(0,229,255,0.3)"
      />
      <Text style={s.emptyTitle}>
        {activeCarType ? 'No hay reservas disponibles' : 'Activa un vehículo'}
      </Text>
      <Text style={s.emptySub}>
        {activeCarType
          ? `Solo se muestran reservas de tu categoría activa (${activeCarType}).`
          : 'Debes activar un vehículo en "Mis Vehículos" para ver reservas de tu categoría.'}
      </Text>
    </View>
  );

  return (
    <View style={[s.root, embedded && s.rootEmbedded]}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image source={BG_IMAGE} style={s.bgImage} resizeMode="cover" />
        <View style={s.bgOverlay} />
      </View>

      <View style={[s.header, embedded && s.headerEmbedded, { paddingTop: topPad }]}>
        {!embedded ? (
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
        ) : null}
        <View style={[s.headerTitleWrap, embedded && s.headerTitleWrapEmbedded]}>
          <Text
            {...FIXED_TEXT_PROPS}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(!embedded ? { adjustsFontSizeToFit: true, minimumFontScale: 0.85 } : {})}
            style={[s.headerTitle, embedded && s.headerTitleEmbedded]}
          >
            {activeTab === 'reservations' ? 'Reservas Disponibles' : 'Servicios Inmediatos'}
          </Text>
        </View>
        <View style={s.headerActions}>
          {embedded && driverOnline && (
            <TouchableOpacity
              style={s.disconnectSwitch}
              activeOpacity={0.85}
              onPress={() => invokeDriverGoDeactivate()}
            >
              <Text {...FIXED_TEXT_PROPS} style={s.disconnectSwitchLabel}>Desconectar</Text>
              <View style={s.disconnectSwitchKnob}>
                <Image
                  source={require('@/assets/images/logo-Preview-Photoroom.png')}
                  style={s.disconnectSwitchLogo}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          )}
          {activeTab === 'immediate' && !driverOnline && (
            <TouchableOpacity
              style={s.goToggleBtn}
              onPress={() => invokeDriverGoActivate()}
              activeOpacity={0.75}
            >
              <Text {...FIXED_TEXT_PROPS} style={s.goToggleText}>GO</Text>
            </TouchableOpacity>
          )}
          {(activeTab === 'reservations' || (activeTab === 'immediate' && driverOnline)) && (
          <TouchableOpacity
            style={s.refreshBtn}
            onPress={() => {
              setRefreshing(true);
              if (activeTab === 'reservations') {
                fetchReservations();
              } else {
                searchImmediateServices();
              }
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh" size={20} color="#00E5FF" />
          </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab selector */}
      <View style={[s.tabContainer, embedded && s.tabContainerEmbedded]}>
        <TouchableOpacity 
          style={[s.tab, activeTab === 'reservations' && s.tabActive]}
          onPress={() => {
            setActiveTab('reservations');
            setRefreshing(false);
          }}
        >
          <Ionicons name="calendar-outline" size={16} color={activeTab === 'reservations' ? '#00E5FF' : 'rgba(255,255,255,0.5)'} />
          <Text
            {...FIXED_TEXT_PROPS}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(!embedded ? { adjustsFontSizeToFit: true, minimumFontScale: 0.8 } : {})}
            style={[s.tabTxt, embedded && s.tabTxtEmbedded, activeTab === 'reservations' && s.tabTxtActive]}
          >
            Reservas
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[s.tab, activeTab === 'immediate' && s.tabActive]}
          onPress={() => {
            setActiveTab('immediate');
            if (driverOnline) {
              searchImmediateServices();
            }
          }}
        >
          <Ionicons name="flash-outline" size={16} color={activeTab === 'immediate' ? '#00E5FF' : 'rgba(255,255,255,0.5)'} />
          <Text
            {...FIXED_TEXT_PROPS}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(!embedded ? { adjustsFontSizeToFit: true, minimumFontScale: 0.75 } : {})}
            style={[s.tabTxt, embedded && s.tabTxtEmbedded, activeTab === 'immediate' && s.tabTxtActive]}
          >
            Inmediatos ({rangeKm}km)
          </Text>
        </TouchableOpacity>
      </View>

      {loading && activeTab === 'reservations' ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text style={s.loadingTxt}>Cargando reservas...</Text>
        </View>
      ) : (
        <FlatList
          data={activeTab === 'reservations' ? reservations : immediateServices}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingBottom: embedded ? 18 : insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            activeTab === 'reservations' ? EmptyState : (
              <View style={s.emptyWrap}>
                <Ionicons
                  name={
                    !driverOnline
                      ? 'flash-outline'
                      : !activeCarType
                        ? 'car-outline'
                        : locationDenied
                          ? 'location-outline'
                          : 'flash-outline'
                  }
                  size={60}
                  color="rgba(0,229,255,0.3)"
                />
                <Text style={s.emptyTitle}>
                  {!driverOnline
                    ? 'Inicia GO para buscar'
                    : !activeCarType
                      ? 'Activa un vehículo'
                      : locationDenied
                        ? 'Activa la ubicación'
                        : 'No hay servicios inmediatos cerca'}
                </Text>
                <Text style={s.emptySub}>
                  {!driverOnline
                    ? 'Conductor desconectado, activa GO para buscar servicios inmediatos.'
                    : !activeCarType
                      ? 'Debes activar un vehículo en "Mis Vehículos" para ver servicios de tu categoría.'
                      : locationDenied
                        ? 'Necesitamos tu ubicación para mostrarte servicios a menos de 3 km.'
                        : `Solo servicios a menos de ${rangeKm} km y de tu categoría (${activeCarType}).`}
                </Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                if (activeTab === 'reservations') {
                  fetchReservations();
                } else {
                  searchImmediateServices();
                }
              }}
              tintColor="#00E5FF"
              colors={['#00E5FF']}
            />
          }
        />
      )}

      <CustomAlert
        visible={alertVisible}
        type={alertType}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onDismiss={() => setAlertVisible(false)}
      />

      <Modal
        visible={!!detailItem}
        transparent
        animationType="fade"
        onRequestClose={closeServiceDetail}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Detalle del servicio</Text>
              <TouchableOpacity style={s.modalClose} onPress={closeServiceDetail} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>

            {detailItem ? (
              <ScrollView
                style={s.modalScroll}
                contentContainerStyle={s.modalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={s.modalBadges}>
                  <View style={[s.modalBadge, detailItem.booking_type === 'immediate' && s.modalBadgeImm]}>
                    <Ionicons
                      name={detailItem.booking_type === 'immediate' ? 'flash' : 'calendar'}
                      size={12}
                      color="#051A26"
                    />
                    <Text style={s.modalBadgeTxt}>
                      {detailItem.booking_type === 'immediate' ? 'Inmediato' : 'Reserva'}
                    </Text>
                  </View>
                  {!!detailItem.reference && (
                    <View style={s.modalBadgeCode}>
                      <Text style={s.modalBadgeCodeTxt}>{detailItem.reference}</Text>
                    </View>
                  )}
                  {!!detailItem.trip_type && (
                    <View style={s.modalBadgeTrip}>
                      <Text style={s.modalBadgeTripTxt}>{detailItem.trip_type}</Text>
                    </View>
                  )}
                </View>

                <View style={s.modalClientRow}>
                  {resolveCustomerPhoto(detailItem) ? (
                    <Image source={{ uri: resolveCustomerPhoto(detailItem)! }} style={s.modalAvatar} />
                  ) : (
                    <View style={s.modalAvatarFallback}>
                      <Ionicons name="person" size={20} color="#00E5FF" />
                    </View>
                  )}
                  <Text style={s.modalClientName}>{detailItem.customer_name || 'Cliente'}</Text>
                </View>

                <View style={s.modalMapWrap}>
                  {detailRouteLoading ? (
                    <View style={s.modalMapLoading}>
                      <ActivityIndicator color="#00E5FF" />
                    </View>
                  ) : detailRouteCoords.length > 1 && detailEndpoints ? (
                    <MapView
                      ref={detailMapRef}
                      style={StyleSheet.absoluteFillObject}
                      provider={PROVIDER_GOOGLE}
                      customMapStyle={GOOGLE_MAPS_DARK_STYLE}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                      toolbarEnabled={false}
                      onMapReady={() => {
                        detailMapRef.current?.fitToCoordinates(detailRouteCoords, {
                          edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
                          animated: false,
                        });
                      }}
                      initialRegion={{
                        latitude: (detailEndpoints.start.latitude + detailEndpoints.end.latitude) / 2,
                        longitude: (detailEndpoints.start.longitude + detailEndpoints.end.longitude) / 2,
                        latitudeDelta: Math.max(
                          Math.abs(detailEndpoints.start.latitude - detailEndpoints.end.latitude) * 1.6,
                          0.018,
                        ),
                        longitudeDelta: Math.max(
                          Math.abs(detailEndpoints.start.longitude - detailEndpoints.end.longitude) * 1.6,
                          0.018,
                        ),
                      }}
                    >
                      <Polyline
                        coordinates={detailRouteCoords}
                        strokeColor={ROUTE_LINE_BLUE}
                        strokeWidth={7}
                        lineJoin="round"
                        lineCap="round"
                        zIndex={1}
                      />
                      <Polyline
                        coordinates={detailRouteCoords}
                        strokeColor="#00E676"
                        strokeWidth={4}
                        lineJoin="round"
                        lineCap="round"
                        zIndex={2}
                      />
                      {/* Puntas en px fijos (no Circle en metros) */}
                      <Marker
                        coordinate={detailEndpoints.start}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={detailMarkerTracks}
                        zIndex={6}
                      >
                        <View style={s.tipHitbox}>
                          <View style={s.tipDotStart} />
                        </View>
                      </Marker>
                      <Marker
                        coordinate={detailEndpoints.end}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={detailMarkerTracks}
                        zIndex={7}
                      >
                        <View style={s.tipHitbox}>
                          <View style={s.tipDotEnd} />
                        </View>
                      </Marker>
                    </MapView>
                  ) : (
                    <View style={s.modalMapLoading}>
                      <Ionicons name="map-outline" size={28} color="rgba(0,229,255,0.4)" />
                    </View>
                  )}
                </View>

                <View style={s.modalRouteBlock}>
                  <View style={s.routeRow}>
                    <View style={s.dotStart} />
                    <Text style={s.modalRouteAddr}>{detailItem.pickup_address || 'Origen'}</Text>
                  </View>
                  <View style={s.routeLineTall} />
                  <View style={s.routeRow}>
                    <View style={s.dotEnd} />
                    <Text style={s.modalRouteAddr}>{detailItem.drop_address || 'Destino'}</Text>
                  </View>
                </View>

                {detailItem.booking_date ? (
                  <View style={s.modalMetaRow}>
                    <Ionicons name="calendar-outline" size={14} color="#00E5FF" />
                    <Text style={s.modalMetaTxt}>{formatDate(detailItem.booking_date)}</Text>
                    <Text style={s.metricDot}>·</Text>
                    <Ionicons name="time-outline" size={14} color="#00E5FF" />
                    <Text style={s.modalMetaTxt}>{formatTime(detailItem.booking_date)}</Text>
                  </View>
                ) : null}

                {detailItem.observations && String(detailItem.observations).trim() ? (
                  <View style={s.obsBlock}>
                    <View style={s.obsHeader}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color="#00E5FF" />
                      <Text style={s.obsLabel}>Observación del cliente</Text>
                    </View>
                    <Text style={s.obsText}>{String(detailItem.observations).trim()}</Text>
                  </View>
                ) : null}

                <View style={s.modalStatsRow}>
                  <View style={s.modalStat}>
                    <Text style={s.statLabel}>Valor</Text>
                    <Text style={s.modalStatValue} numberOfLines={1}>
                      {formatBookingFareRange(detailItem)}
                    </Text>
                  </View>
                  <View style={s.modalStat}>
                    <Text style={s.statLabel}>Km</Text>
                    <Text style={s.modalStatValue}>
                      {parseFloat(String(detailItem.distance || 0)).toFixed(1)}
                    </Text>
                  </View>
                  <View style={s.modalStat}>
                    <Text style={s.statLabel}>Tiempo</Text>
                    <Text style={s.modalStatValue}>{detailItem.duration || 0} min</Text>
                  </View>
                </View>
              </ScrollView>
            ) : null}

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.soltarBtn}
                onPress={closeServiceDetail}
                activeOpacity={0.85}
              >
                <Text style={s.soltarBtnTxt}>Soltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.acceptBtnModal, accepting === detailItem?.id && { opacity: 0.6 }]}
                onPress={() => {
                  if (!detailItem) return;
                  const item = detailItem;
                  closeServiceDetail();
                  handleAccept(item);
                }}
                disabled={!!detailItem && accepting === detailItem.id}
                activeOpacity={0.85}
              >
                {detailItem && accepting === detailItem.id ? (
                  <ActivityIndicator color="#051A26" size="small" />
                ) : (
                  <Text style={s.acceptTxt}>
                    {detailItem?.booking_type === 'immediate' ? 'Aceptar Servicio' : 'Aceptar Reserva'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default DriverReservationsScreen;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  rootEmbedded: {
    borderTopWidth: 0,
  },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,26,38,0.78)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(5,26,38,0.85)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerEmbedded: {
    paddingBottom: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#051A26',
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 8,
    minWidth: 0,
  },
  headerTitleWrapEmbedded: {
    paddingHorizontal: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  disconnectSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 118,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    paddingLeft: 10,
    paddingRight: 2,
  },
  disconnectSwitchLabel: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  disconnectSwitchKnob: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  disconnectSwitchLogo: {
    width: 18,
    height: 18,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', letterSpacing: -0.3 },
  headerTitleEmbedded: { fontSize: 16 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  goToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  goToggleBtnActive: {
    backgroundColor: '#00E5FF',
  },
  goToggleLogo: {
    width: 22,
    height: 22,
  },
  goToggleText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#051A26',
    letterSpacing: 0.4,
  },
  list: { paddingHorizontal: 14, paddingTop: 10 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingTxt: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: 40 },
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(10,46,61,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.18)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  cardMain: { flex: 1, minWidth: 0 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  avatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  clientMeta: { flex: 1, minWidth: 0 },
  clientName: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  tripTypeTxt: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  routeBlock: { marginBottom: 8, paddingLeft: 2 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dotStart: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#00E5FF',
  },
  dotEnd: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#E91E63', borderWidth: 1.5, borderColor: '#00E5FF',
  },
  routeLine: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 3.5 },
  routeLineTall: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 3.5, marginVertical: 2 },
  routeAddr: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.72)' },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  pricePillTxt: { fontSize: 10, fontWeight: '700', color: '#00E5FF' },
  pricePillSep: { fontSize: 10, fontWeight: '600', color: 'rgba(0,229,255,0.55)' },
  metricTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  metricDot: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  verBtn: {
    alignSelf: 'center',
    minWidth: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verBtnTxt: { fontSize: 12, fontWeight: '800', color: '#00E5FF' },
  acceptTxt: { fontSize: 13, fontWeight: '700', color: '#051A26' },
  obsBlock: {
    marginTop: 10, marginBottom: 4, padding: 10, borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.18)',
  },
  obsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  obsLabel: {
    fontSize: 10, fontWeight: '700', color: '#00E5FF',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  obsText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  statLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    backgroundColor: '#051A26',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.18)',
    paddingTop: 8,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalScroll: { maxHeight: Dimensions.get('window').height * 0.62 },
  modalScrollContent: { paddingHorizontal: 16, paddingBottom: 12 },
  modalBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#00E5FF',
  },
  modalBadgeImm: { backgroundColor: '#FF9500' },
  modalBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#051A26' },
  modalBadgeCode: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  modalBadgeCodeTxt: { fontSize: 10, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.4 },
  modalBadgeTrip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalBadgeTripTxt: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  modalClientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  modalAvatar: { width: 42, height: 42, borderRadius: 21 },
  modalAvatarFallback: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)',
  },
  modalClientName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFF' },
  modalMapWrap: {
    height: 190,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  modalMapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalRouteBlock: { marginBottom: 10 },
  modalRouteAddr: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 17 },
  modalMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap',
  },
  modalMetaTxt: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  modalStatsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalStat: {
    flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10,
    backgroundColor: 'rgba(5,26,38,0.6)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.08)',
  },
  modalStatValue: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  routeEndpointStart: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: '#00E5FF',
  },
  routeEndpointEnd: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#E91E63', borderWidth: 2.5, borderColor: '#00E5FF',
  },
  tipHitbox: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipDotStart: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#00E5FF',
  },
  tipDotEnd: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E91E63',
    borderWidth: 2,
    borderColor: '#00E5FF',
  },
  destMarkerSm: {
    width: 22,
    height: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  soltarBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,82,82,0.12)',
    borderWidth: 1.5,
    borderColor: '#FF5252',
  },
  soltarBtnTxt: { fontSize: 14, fontWeight: '800', color: '#FF5252' },
  acceptBtnModal: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
  },

  // Tab styles
  tabContainer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(5,26,38,0.6)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tabContainerEmbedded: {
    backgroundColor: '#051A26',
    borderBottomWidth: 0,
    borderTopWidth: 0,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderColor: 'rgba(0,229,255,0.3)',
  },
  tabTxt: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', flexShrink: 1 },
  tabTxtEmbedded: { fontSize: 12, flexShrink: 0 },
  tabTxtActive: { color: '#00E5FF', fontWeight: '700' },
});
