import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Platform, ActivityIndicator, Dimensions, Keyboard, KeyboardAvoidingView,
  TouchableWithoutFeedback, Animated, PanResponder, Pressable, Image,
  LayoutAnimation, UIManager, Modal,
} from 'react-native';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootState } from '@/common/store';
import { API_KEY, getMapboxAccessToken } from '@/config/AppConfig';
import supabase, { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { FareCalculator } from '@/common/actions/FareCalculator';
import { isNearAirport } from '@/common/utils/airports';
import { DEFAULT_UMBRAL_INTERMUNICIPAL_KM } from '@/constants/fare';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { getGoogleMapStyle, GoogleMapTheme } from '@/config/googleMapsDarkStyle';
import { RouteMapPin, ROUTE_PIN_WIDTH, ROUTE_PIN_HEIGHT } from '@/components/RouteMapPin';
import {
  CLIENT_ORIGIN_MARKER_IMAGE,
  CLIENT_DEST_MARKER_IMAGE,
} from '@/components/ClientOriginMapMarker';

const { width: SW, height: SH } = Dimensions.get('window');
const RECENT_SEARCHES_KEY = 'tmasplus_recent_destination_searches';
const MAX_RECENT_SEARCHES = 4;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateChipSelect = () => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

const GOOGLE_MAPS_KEY = API_KEY;

type VehicleType = {
  key: string;
  label: string;
  icon: 'car-sport' | 'car' | 'bus' | 'car-outline';
  description: string;
  /** URL de imagen desde car_types.image (DB) */
  imageUri: string;
};

const VEHICLE_ICON_MAP: Record<string, VehicleType['icon']> = {
  ConfortPlus: 'car-sport',
  XPlus:       'car',
  VanPlus:     'bus',
  TaxiPlus:    'car-outline',
};

/** Orden fijo en UI; categorías nuevas de la DB se agregan al final (scroll horizontal). */
const VEHICLE_DISPLAY_ORDER = ['XPlus', 'ConfortPlus', 'VanPlus', 'TaxiPlus'] as const;

/** Ancho de card: caben ~4 visibles; la 5ª+ se alcanza con scroll a la derecha. */
const VEHICLE_CARD_GAP = 8;
const VEHICLE_ROW_H_PAD = 0;
const VEHICLE_CARD_W = Math.floor(
  (SW - 32 - VEHICLE_ROW_H_PAD * 2 - VEHICLE_CARD_GAP * 3) / 4,
);

// Fallback mientras Supabase carga — sin descripción/imagen hasta que llegue de car_types
const DEFAULT_VEHICLE_TYPES: VehicleType[] = [
  { key: 'XPlus',       label: 'XPlus',       icon: 'car',        description: '', imageUri: '' },
  { key: 'ConfortPlus', label: 'ConfortPlus', icon: 'car-sport',  description: '', imageUri: '' },
  { key: 'VanPlus',     label: 'VanPlus',     icon: 'bus',        description: '', imageUri: '' },
  { key: 'TaxiPlus',    label: 'TaxiPlus',    icon: 'car-outline',description: '', imageUri: '' },
];

/** Fallback local si car_types.image está vacío */
const VEHICLE_CATEGORY_IMAGES: Record<string, any> = {
  XPlus: require('@/assets/images/TREAS-X.png'),
  ConfortPlus: require('@/assets/images/TREAS-E.png'),
  TaxiPlus: require('@/assets/images/TREAS-T.png'),
  VanPlus: require('@/assets/images/TREAS-Van.png'),
};

/** Logos pago (logo.dev) */
const NEQUI_LOGO_URI = 'https://img.logo.dev/nequi.com.co?token=pk_c_F6FSsGSaKey4lkmcDLNw';
const DAVIPLATA_LOGO_URI = 'https://img.logo.dev/daviplata.com?token=pk_c_F6FSsGSaKey4lkmcDLNw';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ROUTE_LINE_BLUE = '#00E5FF';
const WHEEL_ITEM_H = 40;

const formatScheduledLabel = (d: Date) => {
  const day = d.getDate();
  const month = MONTHS_ES[d.getMonth()];
  const year = d.getFullYear();
  let h = d.getHours();
  const mins = d.getMinutes();
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${day} de ${month} ${year} a las ${h}:${String(mins).padStart(2, '0')} ${ampm}`;
};

const buildDayOptions = (from: Date, count = 60) => {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

type WheelColProps = {
  data: { key: string; label: string }[];
  index: number;
  onChange: (index: number) => void;
  width?: number | string;
};

function WheelColumn({ data, index, onChange, width }: WheelColProps) {
  const ref = useRef<ScrollView>(null);
  const ready = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: false });
      ready.current = true;
    }, 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    ref.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: true });
  }, [index]);

  return (
    <View style={{ width: width as any, height: WHEEL_ITEM_H * 5, overflow: 'hidden' }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H * 2 }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
          const clamped = Math.max(0, Math.min(data.length - 1, i));
          if (clamped !== index) onChange(clamped);
        }}
      >
        {data.map((item, i) => (
          <View key={item.key} style={st.wheelItem}>
            <Text style={[st.wheelItemTxt, i === index && st.wheelItemTxtOn]} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const DEFAULT_VEHICLE_RATES: Record<string, any> = {
  ConfortPlus: { base_fare:24125, base_fare_inter:48250,  rate_per_unit_distance:660,   rate_per_unit_distance_inter:1320, rate_per_hour:600,  rate_per_hour_inter:1200, min_fare:19200, min_fare_inter:38400,  delta_aeropuerto:12000, delta_aeropuerto_prog:5000, convenience_fees:0, convenience_fee_type:'flat', umbral_intermunicipal_km:29 },
  XPlus:       { base_fare:11791, base_fare_inter:23582,  rate_per_unit_distance:16.80, rate_per_unit_distance_inter:34,   rate_per_hour:460,  rate_per_hour_inter:920,  min_fare:8400,  min_fare_inter:16800,  delta_aeropuerto:12000, delta_aeropuerto_prog:5000, convenience_fees:0, convenience_fee_type:'flat', umbral_intermunicipal_km:29 },
  VanPlus:     { base_fare:55807, base_fare_inter:111614, rate_per_unit_distance:390,   rate_per_unit_distance_inter:780,  rate_per_hour:1400, rate_per_hour_inter:2800, min_fare:54000, min_fare_inter:108000, delta_aeropuerto:12000, delta_aeropuerto_prog:5000, convenience_fees:0, convenience_fee_type:'flat', umbral_intermunicipal_km:29 },
  TaxiPlus:    { base_fare:14307, base_fare_inter:28614,  rate_per_unit_distance:540,   rate_per_unit_distance_inter:1080, rate_per_hour:426,  rate_per_hour_inter:852,  min_fare:8880,  min_fare_inter:17760,  delta_aeropuerto:12000, delta_aeropuerto_prog:5000, convenience_fees:0, convenience_fee_type:'flat', umbral_intermunicipal_km:29 },
};

const COLOMBIA_CENTER = { latitude: 4.6097, longitude: -74.0817, latitudeDelta: 0.08, longitudeDelta: 0.06 };
const MAP_MIN_ZOOM = 14;
const MAP_MAX_ZOOM = 18;
const MAP_REGION_DELTA = 0.012;
/** Zoom más abierto al mostrar origen en la franja del formulario */
const MAP_FORM_DELTA = 0.028;
/** Zoom más cercano al ubicar punto en el mapa */
const MAP_LOCATE_DELTA = 0.0045;

type FavoritePlace = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  type_address: string | null;
};

type RecentDestination = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
};

type PlaceSuggestion = {
  place_id: string;
  description: string;
};

const FAVORITE_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  Casa: { icon: 'home', color: '#00E5FF' },
  Trabajo: { icon: 'briefcase', color: '#FFFFFF' },
  Gimnasio: { icon: 'dumbbell', color: '#00E5FF' },
  Supermercado: { icon: 'cart', color: '#00E676' },
  Parque: { icon: 'tree', color: '#69F0AE' },
  Escuela: { icon: 'school', color: '#00E5FF' },
  Restaurante: { icon: 'silverware-fork-knife', color: '#E91E63' },
  Otro: { icon: 'map-marker-radius', color: '#FFFFFF' },
};

const generateUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const generateReference = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < 6; i++) ref += chars.charAt(Math.floor(Math.random() * chars.length));
  return ref;
};

/* ─────────── SCREEN ─────────── */
const CreateReservationScreen = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;

  const params = (route.params || {}) as any;
  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;

  /* ── Keyboard animated refs ── */
  const scrollViewRef = useRef<ScrollView>(null);
  const keyboardOffsetAnim = useRef(new Animated.Value(0)).current;
  const mapKeyboardOffsetAnim = useRef(new Animated.Value(0)).current;
  // Altura real del teclado. Antes el panel se subia -200 fijos, sin mirar el
  // teclado ni el alto de pantalla, y eso se sumaba al KeyboardAvoidingView que
  // ya estaba levantando el contenido: doble compensacion. El panel acababa
  // montado sobre el header y la lista de sugerencias se quedaba sin sitio.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  /* ── Map / Location refs ── */
  const mapRef = useRef<MapView>(null);
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);
  const sessionTokenOrigin = useRef<string | null>(null);
  const sessionTokenDest = useRef<string | null>(null);
  // Timestamp hasta el cual se ignoran pan-completes (animaciones programáticas
  // disparan varios onRegionChangeComplete; un flag booleano de un solo uso no basta).
  const programmaticMoveUntilRef = useRef(0);
  const markProgrammaticMove = useCallback((durationMs = 1000) => {
    programmaticMoveUntilRef.current = Date.now() + durationMs;
  }, []);
  const isProgrammaticMove = useCallback(
    () => Date.now() < programmaticMoveUntilRef.current,
    [],
  );

  const [myLat, setMyLat] = useState(COLOMBIA_CENTER.latitude);
  const [myLng, setMyLng] = useState(COLOMBIA_CENTER.longitude);
  // true solo cuando el GPS real resolvió — evita sesgar el autocompletado al
  // centro del país (valor inicial de myLat/myLng) antes de tener la ubicación.
  const [hasMyLocation, setHasMyLocation] = useState(false);
  const [origin, setOrigin] = useState<any>(params.origin || null);
  const [destination, setDestination] = useState<any>(params.destination || null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  // 'search' = hoja de direcciones; 'locate' = fijar punto moviendo el mapa
  const [sheetMode, setSheetMode] = useState<'search' | 'locate'>('search');
  // 'form' = asignar ruta expandido; 'route' = resumen compacto tras trazar
  const [panelView, setPanelView] = useState<'form' | 'route'>('form');
  const [locateTarget, setLocateTarget] = useState<'origin' | 'destination' | null>(null);
  const [activeField, setActiveField] = useState<'origin' | 'destination' | null>('destination');
  const [originInputText, setOriginInputText] = useState(params.origin?.title || '');
  const [destInputText, setDestInputText] = useState(params.destination?.title || '');
  const [liveLocateAddress, setLiveLocateAddress] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Centro pendiente al mover el mapa en modo locate
  const pendingCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [confirmingPin, setConfirmingPin] = useState(false);
  const preferFormRef = useRef(false);
  const locateGeocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Altura aprox. de la hoja "Tu ruta" para encuadrar el trazado encima del modal */
  const ROUTE_SHEET_PAD = 340;
  /** El form cubre ~78% → el pin de origen debe quedar en la franja superior visible */
  const FORM_SHEET_PAD = Math.round(SH * 0.78);
  /** Modal de detalles: altura por defecto y expandida al hacer scroll */
  const DETAILS_SHEET_COLLAPSED = Math.round(SH * 0.72);
  const DETAILS_SHEET_EXPANDED = Math.round(SH * 0.90);
  const DETAILS_SHEET_PAD = DETAILS_SHEET_COLLAPSED;

  const [carType, setCarType] = useState<string>(params.carType || 'ConfortPlus');
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>(DEFAULT_VEHICLE_TYPES);
  const [tripType, setTripType] = useState<'Ida' | 'Ida y Vuelta'>('Ida');
  const [serviceType, setServiceType] = useState<'immediate' | 'reservation'>('immediate');
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDayIdx, setPickerDayIdx] = useState(0);
  const [pickerHourIdx, setPickerHourIdx] = useState(0);
  const [pickerMinIdx, setPickerMinIdx] = useState(0);
  const [pickerAmPmIdx, setPickerAmPmIdx] = useState(0);
  const dayOptions = useRef(buildDayOptions(new Date())).current;
  const hourOptions = useRef(
    Array.from({ length: 12 }, (_, i) => ({ key: `h${i}`, label: String(i + 1) })),
  ).current;
  const minOptions = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      key: `m${i}`,
      label: String(i * 5).padStart(2, '0'),
    })),
  ).current;
  const ampmOptions = useRef([
    { key: 'am', label: 'a.m.' },
    { key: 'pm', label: 'p.m.' },
  ]).current;
  const [observations, setObservations] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'nequi' | 'daviplata'>('cash');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const detailsHeightAnim = useRef(new Animated.Value(DETAILS_SHEET_COLLAPSED)).current;
  const detailsExpandLock = useRef(false);
  const detailsExpandedRef = useRef(false);

  /* ── Calculated values ── */
  const [distance, setDistance] = useState(params.distance || 0);
  const [duration, setDuration] = useState(params.duration || 0);
  const [driverPrice, setDriverPrice] = useState(params.driverPrice || 0);
  const [clientPrice, setClientPrice] = useState(params.clientPrice || 0);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleRates, setVehicleRates] = useState<Record<string, any>>(DEFAULT_VEHICLE_RATES);

  /* ── UI state ── */
  const [step, setStep] = useState<'map' | 'details'>(params.origin ? 'details' : 'map');
  const [mapTheme] = useState<GoogleMapTheme>('dark');
  const [mapDragging, setMapDragging] = useState(false);

  /* ── Favorite places + recent destinations ── */
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(false);
  const customerName = [
    profile?.first_name || user?.first_name || user?.user_metadata?.first_name || user?.user_metadata?.nombre || '',
    profile?.last_name || user?.last_name || user?.user_metadata?.last_name || user?.user_metadata?.apellido || '',
  ].filter(Boolean).join(' ') || profile?.email?.split('@')[0] || user?.email?.split('@')[0] || 'Cliente';

  /* ── Auto-detect current location ── */
  useEffect(() => {
    if (params.origin) return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (cancelled) return;
        setMyLat(loc.coords.latitude);
        setMyLng(loc.coords.longitude);
        setHasMyLocation(true);

        let addr = 'Mi ubicación actual';
        try {
          const resp = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.coords.latitude},${loc.coords.longitude}&key=${GOOGLE_MAPS_KEY}&language=es`,
          );
          const data = await resp.json();
          addr = data.results?.[0]?.formatted_address || addr;
        } catch {}

        if (cancelled) return;
        setOrigin({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          title: addr,
        });
        setOriginInputText(addr);
        markProgrammaticMove(1200);
        mapRef.current?.animateToRegion(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA },
          800,
        );
        setActiveField('destination');
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [params.origin, markProgrammaticMove]);

  /* Ya no hace falta re-sincronizar autocomplete: TextInput controlado por estado */

  /* ── Cargar vehículos y tarifas desde car_types ── */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('car_types')
          .select('name,description,image,base_price,base_price_inter,price_per_km,price_per_km_inter,rate_per_hour,rate_per_hour_inter,valor_hora,min_fare,min_fare_inter,delta_aeropuerto,delta_aeropuerto_prog,convenience_fee,convenience_fee_type,umbral_intermunicipal_km')
          .eq('is_active', true)
          .order('created_at', { ascending: true });
        if (error || !data?.length) return;

        const rates: Record<string, any> = {};
        const types: VehicleType[] = [];

        data.forEach((car: any) => {
          rates[car.name] = {
            base_fare:                   parseFloat(car.base_price) || 0,
            base_fare_inter:             parseFloat(car.base_price_inter) || 0,
            rate_per_unit_distance:      parseFloat(car.price_per_km) || 0,
            rate_per_unit_distance_inter:parseFloat(car.price_per_km_inter) || 0,
            rate_per_hour:               parseFloat(car.rate_per_hour) || 0,
            rate_per_hour_inter:         parseFloat(car.rate_per_hour_inter) || 0,
            valor_hora:                  parseFloat(car.valor_hora) || 0,
            min_fare:                    parseFloat(car.min_fare) || 0,
            min_fare_inter:              parseFloat(car.min_fare_inter) || 0,
            delta_aeropuerto:            parseFloat(car.delta_aeropuerto) || 0,
            delta_aeropuerto_prog:       parseFloat(car.delta_aeropuerto_prog) || 0,
            convenience_fees:            parseFloat(car.convenience_fee) || 0,
            convenience_fee_type:        car.convenience_fee_type || 'flat',
            umbral_intermunicipal_km:    parseFloat(car.umbral_intermunicipal_km) || 29,
          };
          types.push({
            key: car.name,
            label: car.name,
            icon: VEHICLE_ICON_MAP[car.name] ?? 'car',
            description: String(car.description ?? '').trim(),
            imageUri: String(car.image ?? '').trim(),
          });
        });

        // Orden estable: conocidos primero; categorías nuevas al final (created_at).
        const known = VEHICLE_DISPLAY_ORDER
          .map((name) => types.find((t) => t.key === name))
          .filter((t): t is VehicleType => !!t);
        const unknown = types.filter(
          (t) => !(VEHICLE_DISPLAY_ORDER as readonly string[]).includes(t.key),
        );

        setVehicleRates(rates);
        setVehicleTypes([...known, ...unknown]);
        setCarType(prev => (prev && rates[prev] ? prev : known[0]?.key ?? unknown[0]?.key ?? ''));
      } catch (e) {
        console.warn('[CreateReservation] Error cargando tarifas:', e);
      }
    })();
  }, []);

  /* ── Load favorite places from Supabase ── */
  useEffect(() => {
    (async () => {
      const authId = user?.id || user?.auth_id || profile?.auth_id || profile?.id;
      if (!authId) return;
      try {
        const headers = await getSupabaseAuthHeaders(true);
        const userUrl = `${SUPABASE_URL}/rest/v1/users?or=(auth_id.eq.${encodeURIComponent(authId)},id.eq.${encodeURIComponent(authId)})&select=id&limit=1`;
        const userResp = await fetch(userUrl, { headers });
        if (!userResp.ok) return;
        const userRows = await userResp.json();
        const uid = userRows?.[0]?.id;
        if (!uid) return;
        const favUrl = `${SUPABASE_URL}/rest/v1/favorite_places?user_id=eq.${encodeURIComponent(uid)}&is_favorite=eq.true&order=usage_count.desc,created_at.desc&limit=5`;
        const favResp = await fetch(favUrl, { headers });
        if (!favResp.ok) return;
        const rows = await favResp.json();
        setFavoritePlaces(rows || []);
      } catch (e) { console.warn('[CreateReservation] loadFavorites error:', e); }
    })();
  }, [user, profile]);

  /* ── Destinos recientes = últimas búsquedas (AsyncStorage, máx 4) ── */
  useEffect(() => {
    (async () => {
      setLoadingRecents(true);
      try {
        const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (!raw) {
          setRecentDestinations([]);
          return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentDestinations(parsed.slice(0, MAX_RECENT_SEARCHES));
        }
      } catch (e) {
        console.warn('[CreateReservation] loadRecents error:', e);
      } finally {
        setLoadingRecents(false);
      }
    })();
  }, []);

  const pushRecentSearch = useCallback(async (place: RecentDestination) => {
    try {
      const next = [
        place,
        ...recentDestinations.filter(
          r => !(r.latitude === place.latitude && r.longitude === place.longitude),
        ),
      ].slice(0, MAX_RECENT_SEARCHES);
      setRecentDestinations(next);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {}
  }, [recentDestinations]);

  const handleSelectFavorite = (place: FavoritePlace) => {
    preferFormRef.current = false;
    const loc = {
      latitude: place.latitude,
      longitude: place.longitude,
      title: place.description,
    };
    setDestination(loc);
    setDestInputText(place.description);
    sessionTokenDest.current = null;
    setPlaceSuggestions([]);
    setSheetMode('search');
    setLocateTarget(null);
    pushRecentSearch({
      id: place.id || `fav-${Date.now()}`,
      title: place.description,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    Keyboard.dismiss();
    markProgrammaticMove(1200);
  };

  const handleSelectRecent = (place: RecentDestination) => {
    preferFormRef.current = false;
    setDestination({
      latitude: place.latitude,
      longitude: place.longitude,
      title: place.title,
    });
    setDestInputText(place.title);
    sessionTokenDest.current = null;
    setPlaceSuggestions([]);
    setSheetMode('search');
    setLocateTarget(null);
    pushRecentSearch(place);
    Keyboard.dismiss();
    markProgrammaticMove(1200);
  };

  /* ── Keyboard listener for smooth animation ── */
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowSub = Keyboard.addListener(showEvent, (e: any) => {
      const kbHeight = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(kbHeight);
      // Step 2 animation
      Animated.timing(keyboardOffsetAnim, {
        toValue: -30,
        duration: 220,
        useNativeDriver: true,
      }).start();
      // Step 1: el KeyboardAvoidingView ya hace el grueso del trabajo. Aqui
      // solo se ajusta un poco, acotado, para que el panel nunca se salga por
      // arriba ni tape el header.
      Animated.timing(mapKeyboardOffsetAnim, {
        toValue: -Math.min(kbHeight * 0.22, 70),
        duration: 220,
        useNativeDriver: true,
      }).start();
    });

    const keyboardHideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      // Step 2 animation
      Animated.timing(keyboardOffsetAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
      // Step 1 animation (search panel back down)
      Animated.timing(mapKeyboardOffsetAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      keyboardShowSub.remove();
      keyboardHideSub.remove();
    };
  }, [keyboardOffsetAnim, mapKeyboardOffsetAnim]);

  const calculateRoute = async () => {
    if (!origin?.latitude || !destination?.latitude) return;
    setCalculating(true);
    try {
      const token = getMapboxAccessToken();
      if (!token) throw new Error('No Mapbox token');

      const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      const res = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`, {
        params: { geometries: 'geojson', overview: 'full', access_token: token },
      });

      const route = res?.data?.routes?.[0];
      if (!route) return;

      setDistance(route.distance / 1000);
      setDuration(route.duration / 60);

      if (route.geometry?.coordinates?.length) {
        setRouteCoords(route.geometry.coordinates.map((c: [number, number]) => ({ latitude: c[1], longitude: c[0] })));
      }
    } catch (e) {
      console.error('Route calc error:', e);
    } finally {
      setCalculating(false);
    }
  };

  // Recalcula precio cada vez que cambia distancia, tiempo, vehículo o tarifas.
  // Separado de calculateRoute para que funcione aunque Supabase cargue después de Mapbox.
  useEffect(() => {
    if (!distance || !duration) return;
    const rates = vehicleRates[carType] ?? Object.values(vehicleRates)[0];
    if (!rates) return;

    const mult = tripType === 'Ida y Vuelta' ? 2 : 1;
    // Detección automática aeropuerto por coords (Haversine + 40 aeropuertos Colombia).
    const oAir = origin && (origin as any).latitude != null
      ? isNearAirport((origin as any).latitude, (origin as any).longitude) : null;
    const dAir = destination && (destination as any).latitude != null
      ? isNearAirport((destination as any).latitude, (destination as any).longitude) : null;
    const isAirport = !!(oAir || dAir);
    const isScheduled = serviceType === 'reservation';
    const isIntermunicipal = distance > (rates.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);

    const { totalCost, clientTotal } = FareCalculator(
      distance * mult,
      duration * 60 * mult,
      rates,
      null,
      2,
      { isAirport, isScheduled, isIntermunicipal },
    );

    setDriverPrice(totalCost);
    setClientPrice(clientTotal);
  }, [distance, duration, carType, vehicleRates, tripType, serviceType, origin, destination]);

  /** Rango de precio por categoría (mismo cálculo que el pill de método de pago). */
  const vehicleFareRanges = useMemo(() => {
    const empty: Record<string, { low: number; high: number }> = {};
    if (!distance || !duration) return empty;

    const mult = tripType === 'Ida y Vuelta' ? 2 : 1;
    const oAir = origin && (origin as any).latitude != null
      ? isNearAirport((origin as any).latitude, (origin as any).longitude) : null;
    const dAir = destination && (destination as any).latitude != null
      ? isNearAirport((destination as any).latitude, (destination as any).longitude) : null;
    const isAirport = !!(oAir || dAir);
    const isScheduled = serviceType === 'reservation';

    const ranges: Record<string, { low: number; high: number }> = {};
    Object.keys(vehicleRates).forEach((key) => {
      const rates = vehicleRates[key];
      if (!rates) return;
      const isIntermunicipal = distance > (rates.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);
      const { totalCost, clientTotal } = FareCalculator(
        distance * mult,
        duration * 60 * mult,
        rates,
        null,
        2,
        { isAirport, isScheduled, isIntermunicipal },
      );
      ranges[key] = { low: totalCost, high: clientTotal };
    });
    return ranges;
  }, [distance, duration, vehicleRates, tripType, serviceType, origin, destination]);

  useEffect(() => {
    if (!origin?.latitude || !destination?.latitude) {
      setRouteCoords([]);
      setDistance(0);
      setDuration(0);
      return;
    }
    calculateRoute();
  }, [origin, destination, tripType]);


  /* ── Geocode helper ── */
  const reverseGeocode = useCallback(async (latitude: number, longitude: number, fallback: string) => {
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}&language=es`,
      );
      const data = await resp.json();
      return data.results?.[0]?.formatted_address || fallback;
    } catch {
      return fallback;
    }
  }, []);

  /** Texto de la fila "Ubicar en el mapa" según foco / campos vacíos */
  const locateMapLabel = (() => {
    if (activeField === 'origin') return 'Ubicar en el mapa punto inicio';
    if (activeField === 'destination') return 'Ubicar en mapa punto destino';
    if (!originInputText.trim() && !destInputText.trim()) return 'Ubicar en mapa punto inicio';
    if (!destInputText.trim()) return 'Ubicar en mapa Punto destino';
    if (!originInputText.trim()) return 'Ubicar en el mapa punto inicio';
    return 'Ubicar en mapa punto destino';
  })();

  const resolveLocateTarget = useCallback((): 'origin' | 'destination' => {
    if (activeField === 'origin' || activeField === 'destination') return activeField;
    if (!originInputText.trim() && !destInputText.trim()) return 'origin';
    if (!destInputText.trim()) return 'destination';
    if (!originInputText.trim()) return 'origin';
    return 'destination';
  }, [activeField, originInputText, destInputText]);

  const openLocateOnMap = useCallback((forced?: 'origin' | 'destination') => {
    const target = forced || resolveLocateTarget();
    Keyboard.dismiss();
    setPlaceSuggestions([]);
    setLocateTarget(target);
    setSheetMode('locate');
    pendingCenterRef.current = null;

    const existing = target === 'origin' ? origin : destination;
    const fallbackLat = hasMyLocation ? myLat : (origin?.latitude ?? COLOMBIA_CENTER.latitude);
    const fallbackLng = hasMyLocation ? myLng : (origin?.longitude ?? COLOMBIA_CENTER.longitude);
    const lat = existing?.latitude ?? fallbackLat;
    const lng = existing?.longitude ?? fallbackLng;
    const initialAddr = existing?.title
      || (target === 'origin' ? originInputText : destInputText)
      || (hasMyLocation ? 'Mi ubicación actual' : 'Ubicación en el mapa');

    setLiveLocateAddress(initialAddr);
    pendingCenterRef.current = { latitude: lat, longitude: lng };

    markProgrammaticMove(1200);
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: MAP_LOCATE_DELTA, longitudeDelta: MAP_LOCATE_DELTA },
      500,
    );
  }, [
    resolveLocateTarget, origin, destination, hasMyLocation, myLat, myLng,
    originInputText, destInputText, markProgrammaticMove,
  ]);

  const exitLocateToSearch = useCallback((focus?: 'origin' | 'destination') => {
    // Volver al formulario de edición (NO a "Tu ruta")
    preferFormRef.current = true;
    setSheetMode('search');
    setLocateTarget(null);
    setMapDragging(false);
    setPanelView('form');
    setPlaceSuggestions([]);
    if (focus) setActiveField(focus);
    setTimeout(() => {
      if (focus === 'origin') originInputRef.current?.focus?.();
      else if (focus === 'destination') destInputRef.current?.focus?.();
    }, 160);
  }, []);

  /** Confirma el centro del mapa (solo en modo locate). */
  const confirmMapPin = useCallback(async () => {
    if (sheetMode !== 'locate' || !locateTarget || confirmingPin || !mapRef.current) return;

    setConfirmingPin(true);
    try {
      let center = pendingCenterRef.current;
      if (!center) {
        try {
          const cam: any = await mapRef.current.getCamera();
          if (cam?.center?.latitude != null) {
            center = { latitude: cam.center.latitude, longitude: cam.center.longitude };
          }
        } catch {}
      }
      if (!center) return;

      const fallback = locateTarget === 'origin' ? 'Punto de recogida' : 'Punto de destino';
      const addr = liveLocateAddress?.trim()
        || await reverseGeocode(center.latitude, center.longitude, fallback);
      const loc = { latitude: center.latitude, longitude: center.longitude, title: addr };

      const willHaveBoth = locateTarget === 'origin'
        ? !!destination?.latitude
        : !!origin?.latitude;

      if (locateTarget === 'origin') {
        setOrigin(loc);
        setOriginInputText(addr);
      } else {
        setDestination(loc);
        setDestInputText(addr);
        pushRecentSearch({
          id: `map-${Date.now()}`,
          title: addr,
          latitude: center.latitude,
          longitude: center.longitude,
        });
      }

      pendingCenterRef.current = null;
      setMapDragging(false);
      setSheetMode('search');
      setLocateTarget(null);
      setPlaceSuggestions([]);

      if (willHaveBoth) {
        preferFormRef.current = false;
        // La vista "route" se activa cuando distance > 0 (efecto abajo)
      } else {
        preferFormRef.current = true;
        setPanelView('form');
        setActiveField(locateTarget === 'origin' ? 'destination' : 'origin');
      }
      markProgrammaticMove(1500);
    } finally {
      setConfirmingPin(false);
    }
  }, [
    sheetMode, locateTarget, confirmingPin, liveLocateAddress,
    reverseGeocode, destination, origin, markProgrammaticMove, pushRecentSearch,
  ]);

  const fitRouteInVisibleMap = useCallback(() => {
    if (!mapRef.current || !origin?.latitude || !destination?.latitude) return;
    markProgrammaticMove(1600);
    const points = [
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    ];
    if (routeCoords.length > 4) {
      const mid = routeCoords[Math.floor(routeCoords.length / 2)];
      if (mid) points.push(mid);
    }
    mapRef.current.fitToCoordinates(points, {
      edgePadding: {
        top: Math.max(topPad + 64, 90),
        right: 44,
        bottom: ROUTE_SHEET_PAD + Math.max(insets.bottom, 8),
        left: 44,
      },
      animated: true,
    });
  }, [origin, destination, routeCoords, markProgrammaticMove, topPad, insets.bottom]);

  /* ── Encuadre dinámico cuando hay ruta y estamos en vista resumen ── */
  useEffect(() => {
    if (sheetMode !== 'search' || panelView !== 'route') return;
    if (step !== 'map') return;
    if (!origin?.latitude || !destination?.latitude) return;
    const timer = setTimeout(() => {
      fitRouteInVisibleMap();
    }, 280);
    return () => clearTimeout(timer);
  }, [
    origin?.latitude, origin?.longitude,
    destination?.latitude, destination?.longitude,
    routeCoords, sheetMode, panelView, step, fitRouteInVisibleMap,
  ]);

  /* Encuadre al abrir modal de detalles (trazado visible arriba) */
  useEffect(() => {
    if (step !== 'details') return;
    if (!origin?.latitude || !destination?.latitude) return;
    const sheetH = detailsExpanded ? DETAILS_SHEET_EXPANDED : DETAILS_SHEET_COLLAPSED;
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      markProgrammaticMove(1600);
      const points = [
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      ];
      if (routeCoords.length > 4) {
        const mid = routeCoords[Math.floor(routeCoords.length / 2)];
        if (mid) points.push(mid);
      }
      mapRef.current.fitToCoordinates(points, {
        edgePadding: {
          top: Math.max(topPad + 56, 80),
          right: 40,
          bottom: sheetH,
          left: 40,
        },
        animated: true,
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [step, detailsExpanded, origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, routeCoords, markProgrammaticMove, topPad]);

  /* En formulario: origen visible y más alejado, por encima del modal */
  useEffect(() => {
    if (step !== 'map') return;
    if (sheetMode !== 'search' || panelView !== 'form') return;
    if (!origin?.latitude) return;
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      markProgrammaticMove(1200);
      if (destination?.latitude) {
        mapRef.current.fitToCoordinates(
          [
            { latitude: origin.latitude, longitude: origin.longitude },
            { latitude: destination.latitude, longitude: destination.longitude },
          ],
          {
            edgePadding: {
              top: Math.max(topPad + 48, 72),
              right: 48,
              bottom: FORM_SHEET_PAD,
              left: 48,
            },
            animated: true,
          },
        );
      } else {
        // Centro un poco al sur del pin → el marcador queda más arriba en la franja visible
        const offsetLat = MAP_FORM_DELTA * 0.38;
        mapRef.current.animateToRegion(
          {
            latitude: origin.latitude - offsetLat,
            longitude: origin.longitude,
            latitudeDelta: MAP_FORM_DELTA,
            longitudeDelta: MAP_FORM_DELTA,
          },
          650,
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    step, sheetMode, panelView, origin?.latitude, origin?.longitude,
    destination?.latitude, destination?.longitude, markProgrammaticMove, topPad,
  ]);

  /* Al confirmar ambas direcciones y calcular → vista resumen (salvo si el usuario quiere editar) */
  useEffect(() => {
    if (step !== 'map') return;
    if (sheetMode !== 'search') return;
    if (preferFormRef.current) return;
    if (origin?.latitude && destination?.latitude && distance > 0 && !calculating) {
      setPanelView('route');
      setPlaceSuggestions([]);
      Keyboard.dismiss();
    }
  }, [origin?.latitude, destination?.latitude, distance, calculating, sheetMode, step]);

  const fetchSuggestions = useCallback((text: string, field: 'origin' | 'destination') => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (!text || text.trim().length < 2) {
      setPlaceSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }
    setLoadingSuggestions(true);
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const tokenRef = field === 'origin' ? sessionTokenOrigin : sessionTokenDest;
        if (!tokenRef.current) tokenRef.current = generateUID();
        const params = new URLSearchParams({
          input: text.trim(),
          key: GOOGLE_MAPS_KEY,
          language: 'es',
          components: 'country:co',
          sessiontoken: tokenRef.current,
        });
        if (hasMyLocation) {
          params.set('location', `${myLat},${myLng}`);
          params.set('radius', '30000');
        }
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
        );
        const data = await res.json();
        const preds = Array.isArray(data?.predictions) ? data.predictions : [];
        setPlaceSuggestions(
          preds.slice(0, 6).map((p: any) => ({
            place_id: p.place_id,
            description: p.description,
          })),
        );
      } catch {
        setPlaceSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 280);
  }, [hasMyLocation, myLat, myLng]);

  const applyPlace = useCallback((loc: { latitude: number; longitude: number; title: string }, type: 'origin' | 'destination') => {
    preferFormRef.current = false;
    if (type === 'origin') {
      setOrigin(loc);
      setOriginInputText(loc.title);
      sessionTokenOrigin.current = null;
      setActiveField('destination');
    } else {
      setDestination(loc);
      setDestInputText(loc.title);
      sessionTokenDest.current = null;
      setActiveField(null);
      pushRecentSearch({
        id: `search-${Date.now()}`,
        title: loc.title,
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    }
    setPlaceSuggestions([]);
    setSheetMode('search');
    setLocateTarget(null);
    markProgrammaticMove(1500);
    Keyboard.dismiss();
  }, [pushRecentSearch, markProgrammaticMove]);

  const selectSuggestion = useCallback(async (item: PlaceSuggestion, type: 'origin' | 'destination') => {
    try {
      const tokenRef = type === 'origin' ? sessionTokenOrigin : sessionTokenDest;
      const params = new URLSearchParams({
        place_id: item.place_id,
        fields: 'geometry,formatted_address',
        key: GOOGLE_MAPS_KEY,
        language: 'es',
        sessiontoken: tokenRef.current || '',
      });
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
      );
      const data = await res.json();
      const result = data?.result;
      const lat = result?.geometry?.location?.lat;
      const lng = result?.geometry?.location?.lng;
      if (lat == null || lng == null) return;
      const title = result?.formatted_address || item.description;
      applyPlace({ latitude: lat, longitude: lng, title }, type);
    } catch (e) {
      console.warn('[CreateReservation] place details error:', e);
    }
  }, [applyPlace]);

  const clearOriginField = () => {
    setOrigin(null);
    setOriginInputText('');
    setRouteCoords([]);
    setDistance(0);
    setDuration(0);
    setPanelView('form');
    setActiveField('origin');
    setPlaceSuggestions([]);
    originInputRef.current?.focus?.();
  };

  const clearDestField = () => {
    setDestination(null);
    setDestInputText('');
    setRouteCoords([]);
    setDistance(0);
    setDuration(0);
    setPanelView('form');
    setActiveField('destination');
    setPlaceSuggestions([]);
    destInputRef.current?.focus?.();
  };

  /* ── Center on my location / encuadrar ruta ── */
  const centerOnMe = () => {
    if (!mapRef.current) return;
    if (
      (step === 'details' || (sheetMode === 'search' && panelView === 'route'))
      && origin?.latitude && destination?.latitude
    ) {
      if (step === 'details') {
        markProgrammaticMove(1600);
        const points = [
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: destination.latitude, longitude: destination.longitude },
        ];
        if (routeCoords.length > 4) {
          const mid = routeCoords[Math.floor(routeCoords.length / 2)];
          if (mid) points.push(mid);
        }
        mapRef.current.fitToCoordinates(points, {
          edgePadding: {
            top: Math.max(topPad + 56, 80),
            right: 40,
            bottom: DETAILS_SHEET_PAD,
            left: 40,
          },
          animated: true,
        });
      } else {
        fitRouteInVisibleMap();
      }
      return;
    }
    if (!myLat) return;
    const delta = sheetMode === 'locate' ? MAP_LOCATE_DELTA : MAP_REGION_DELTA;
    markProgrammaticMove(1000);
    mapRef.current.animateToRegion(
      { latitude: myLat, longitude: myLng, latitudeDelta: delta, longitudeDelta: delta },
      600,
    );
    if (sheetMode === 'locate') {
      pendingCenterRef.current = { latitude: myLat, longitude: myLng };
      reverseGeocode(myLat, myLng, 'Mi ubicación actual').then(setLiveLocateAddress);
    }
  };

  /* ── Zoom controls ── */
  const handleZoomIn = () => {
    if (!mapRef.current) return;
    markProgrammaticMove(500);
    mapRef.current.getCamera().then((cam: any) => {
      const zoom = cam.zoom ?? 15;
      const next = Math.min(MAP_MAX_ZOOM, zoom + 1);
      mapRef.current?.animateCamera({ zoom: next, center: cam.center }, { duration: 300 });
    });
  };

  const handleZoomOut = () => {
    if (!mapRef.current) return;
    markProgrammaticMove(500);
    mapRef.current.getCamera().then((cam: any) => {
      const zoom = cam.zoom ?? 15;
      const next = Math.max(MAP_MIN_ZOOM, zoom - 1);
      mapRef.current?.animateCamera({ zoom: next, center: cam.center }, { duration: 300 });
    });
  };

  const handleMapRegionChange = useCallback(() => {
    if (sheetMode === 'locate') setMapDragging(true);
  }, [sheetMode]);

  const handleMapRegionChangeComplete = useCallback((region: { latitude: number; longitude: number }) => {
    setMapDragging(false);
    if (isProgrammaticMove()) return;
    if (sheetMode !== 'locate' || !locateTarget) return;
    pendingCenterRef.current = { latitude: region.latitude, longitude: region.longitude };
    if (locateGeocodeTimer.current) clearTimeout(locateGeocodeTimer.current);
    locateGeocodeTimer.current = setTimeout(async () => {
      const addr = await reverseGeocode(region.latitude, region.longitude,
        locateTarget === 'origin' ? 'Punto de recogida' : 'Punto de destino');
      setLiveLocateAddress(addr);
    }, 350);
  }, [sheetMode, locateTarget, isProgrammaticMove, reverseGeocode]);

  const mapStyle = getGoogleMapStyle(mapTheme);

  const inLocateMode = sheetMode === 'locate' && !!locateTarget;
  // En modo ubicar solo el pin central; el otro punto NO se muestra
  const showOriginMarker = !!origin?.latitude && !inLocateMode;
  const showDestMarker = !!destination?.latitude && !inLocateMode;
  const showClearOrigin = activeField === 'origin' && !!originInputText.trim() && sheetMode === 'search' && panelView === 'form';
  const showClearDest = activeField === 'destination' && !!destInputText.trim() && sheetMode === 'search' && panelView === 'form';
  const hasConfirmedRoute = !!(origin?.latitude && destination?.latitude && distance > 0 && !calculating);
  const hasConfirmedRouteRef = useRef(hasConfirmedRoute);
  hasConfirmedRouteRef.current = hasConfirmedRoute;
  // Controles del mapa: locate, resumen de ruta, o modal de detalles
  const showMapFloatingControls =
    (step === 'details' && !detailsExpanded)
    || inLocateMode
    || (step === 'map' && sheetMode === 'search' && panelView === 'route');
  const mapControlsBottom = step === 'details'
    ? (detailsExpanded ? DETAILS_SHEET_EXPANDED : DETAILS_SHEET_COLLAPSED) + 12
    : inLocateMode
      ? 300
      : (ROUTE_SHEET_PAD + Math.max(insets.bottom, 8) + 16);

  const openFormToEdit = useCallback((field: 'origin' | 'destination') => {
    preferFormRef.current = true;
    setStep('map');
    setSheetMode('search');
    setPanelView('form');
    setActiveField(field);
    setPlaceSuggestions([]);
    setTimeout(() => {
      if (field === 'origin') originInputRef.current?.focus?.();
      else destInputRef.current?.focus?.();
    }, 160);
  }, []);

  /** Desde detalles → modal Asigna tu ruta con foco en el campo */
  const editAddressFromDetails = useCallback((field: 'origin' | 'destination') => {
    openFormToEdit(field);
  }, [openFormToEdit]);

  const openSchedulePicker = useCallback(() => {
    const base = scheduledDate && scheduledDate.getTime() > Date.now()
      ? scheduledDate
      : new Date(Date.now() + 60 * 60 * 1000);
    const dayStart = new Date(base);
    dayStart.setHours(0, 0, 0, 0);
    let dIdx = dayOptions.findIndex(d => d.getTime() === dayStart.getTime());
    if (dIdx < 0) dIdx = 0;
    let h = base.getHours();
    const isPm = h >= 12;
    h = h % 12;
    if (h === 0) h = 12;
    const m = Math.round(base.getMinutes() / 5) * 5 % 60;
    setPickerDayIdx(dIdx);
    setPickerHourIdx(h - 1);
    setPickerMinIdx(Math.floor(m / 5));
    setPickerAmPmIdx(isPm ? 1 : 0);
    setShowDatePicker(true);
  }, [scheduledDate, dayOptions]);

  const previewPickerDate = useCallback(() => {
    const day = dayOptions[pickerDayIdx] || dayOptions[0];
    let hour = pickerHourIdx + 1;
    if (pickerAmPmIdx === 0) {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
    const mins = pickerMinIdx * 5;
    const d = new Date(day);
    d.setHours(hour, mins, 0, 0);
    return d;
  }, [dayOptions, pickerDayIdx, pickerHourIdx, pickerMinIdx, pickerAmPmIdx]);

  const confirmSchedulePicker = useCallback(() => {
    let d = previewPickerDate();
    const minOk = new Date(Date.now() + 5 * 60 * 1000);
    if (d.getTime() < minOk.getTime()) d = minOk;
    setScheduledDate(d);
    setShowDatePicker(false);
  }, [previewPickerDate]);

  const setDetailsSheetExpanded = useCallback((expand: boolean) => {
    if (detailsExpandLock.current || detailsExpandedRef.current === expand) return;
    detailsExpandLock.current = true;
    detailsExpandedRef.current = expand;
    setDetailsExpanded(expand);
    Animated.spring(detailsHeightAnim, {
      toValue: expand ? DETAILS_SHEET_EXPANDED : DETAILS_SHEET_COLLAPSED,
      useNativeDriver: false,
      friction: 9,
      tension: 68,
    }).start(() => {
      detailsExpandLock.current = false;
    });
  }, [detailsHeightAnim]);

  const setDetailsSheetExpandedRef = useRef(setDetailsSheetExpanded);
  setDetailsSheetExpandedRef.current = setDetailsSheetExpanded;

  const handleDetailsScroll = useCallback((e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    if (y > 28) setDetailsSheetExpandedRef.current(true);
    else if (y <= 2) setDetailsSheetExpandedRef.current(false);
  }, []);

  useEffect(() => {
    if (step !== 'details') {
      detailsExpandedRef.current = false;
      setDetailsExpanded(false);
      detailsHeightAnim.setValue(DETAILS_SHEET_COLLAPSED);
      detailsExpandLock.current = false;
    }
  }, [step, detailsHeightAnim]);

  const detailsSheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -28) setDetailsSheetExpandedRef.current(true);
        else if (g.dy > 28) setDetailsSheetExpandedRef.current(false);
      },
    }),
  ).current;
  const showSuggestions = placeSuggestions.length > 0 || loadingSuggestions;
  const activeSuggestField = activeField === 'origin' || activeField === 'destination' ? activeField : 'destination';

  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        if (!hasConfirmedRouteRef.current) return;
        if (g.dy > 40) {
          preferFormRef.current = false;
          setPanelView('route');
          Keyboard.dismiss();
          setPlaceSuggestions([]);
        } else if (g.dy < -40) {
          preferFormRef.current = true;
          setPanelView('form');
        }
      },
    }),
  ).current;


  const canContinue = !!origin && !!destination && distance > 0 && !calculating;
  const canSubmit = canContinue && !saving;

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

  const isUuid = (value?: string | null) => {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  };

  const resolveCustomerId = async (): Promise<string> => {
    const candidates = [user?.auth_id, user?.id, profile?.auth_id, profile?.id]
      .map((value) => String(value || '').trim())
      .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);

    if (candidates.length === 0) {
      throw new Error('No se pudo resolver el usuario cliente.');
    }

    const headers = await getSupabaseAuthHeaders();

    // 1) Buscar coincidencia directa en users.id
    for (const candidate of candidates) {
      if (!isUuid(candidate)) continue;

      const byIdUrl = `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(candidate)}&select=id&limit=1`;
      const byIdResp = await fetch(byIdUrl, { method: 'GET', headers });
      const byIdData = await byIdResp.json();

      if (Array.isArray(byIdData) && byIdData.length > 0 && byIdData[0]?.id) {
        return byIdData[0].id;
      }
    }

    // 2) Si no existe en id, buscar por auth_id
    for (const candidate of candidates) {
      if (!isUuid(candidate)) continue;

      const byAuthIdUrl = `${SUPABASE_URL}/rest/v1/users?auth_id=eq.${encodeURIComponent(candidate)}&select=id&limit=1`;
      const byAuthResp = await fetch(byAuthIdUrl, { method: 'GET', headers });
      const byAuthData = await byAuthResp.json();

      if (Array.isArray(byAuthData) && byAuthData.length > 0 && byAuthData[0]?.id) {
        return byAuthData[0].id;
      }
    }

    throw new Error('No se encontró el perfil del cliente en users.');
  };

  /* ── Submit reservation ── */
  const handleSubmit = async () => {
    if (!origin || !destination) { showAlert('error', 'Error', 'Selecciona origen y destino.'); return; }
    if (distance <= 0) { showAlert('error', 'Error', 'No se pudo calcular la ruta.'); return; }
    if (serviceType === 'reservation' && !scheduledDate) {
      showAlert('error', 'Fecha requerida', 'Selecciona la fecha y hora del servicio programado.');
      return;
    }
    setSaving(true);
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const userId = await resolveCustomerId();

      const bookingDateToUse = serviceType === 'reservation' && scheduledDate ? scheduledDate : new Date();

      const body = {
        booking_type: serviceType,
        status: 'PENDING',
        customer_status: 'SEARCHING',
        reference: generateReference(),
        booking_date: bookingDateToUse.toISOString(),
        customer: userId,
        customer_id: userId,
        customer_name: customerName,
        customer_email: user?.email || '',
        customer_contact: user?.mobile || '',
        customer_token: user?.pushToken || user?.push_token || '',
        pickup_address: origin?.title || 'Origen',
        pickup_lat: origin?.latitude,
        pickup_lng: origin?.longitude,
        pickup_location: JSON.stringify({ lat: origin?.latitude, lng: origin?.longitude, address: origin?.title }),
        drop_address: destination?.title || 'Destino',
        drop_lat: destination?.latitude,
        drop_lng: destination?.longitude,
        destination_location: JSON.stringify({ lat: destination?.latitude, lng: destination?.longitude, address: destination?.title }),
        drop_location: JSON.stringify({ lat: destination?.latitude, lng: destination?.longitude, address: destination?.title }),
        distance: parseFloat(distance.toFixed(2)),
        duration: Math.round(duration),
        trip_type: tripType,
        car_type: carType,
        estimate: clientPrice || 0,
        price: clientPrice || 0,
        trip_cost: driverPrice || 0,
        driver_share: driverPrice || 0,
        // Piso de cobro (car_types.min_fare de la categoría elegida) para el
        // trigger `calculate_total_cost`. Ver [[22-plan-fix-bug-min-fare]].
        min_fare_snapshot: vehicleRates?.[carType]?.min_fare || 0,
        payment_mode: paymentMode,
        prepaid: false,
        observations: observations || null,
      };
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const [created] = await resp.json();
      console.log('✅ SERVICIO CREADO EN BD:', { 
        reference: created?.reference, 
        booking_type: created?.booking_type, 
        status: created?.status,
        driver: created?.driver,
        id: created?.id 
      });
      showAlert('success', '¡Reserva Creada!',
        `Tu reserva ${created?.reference || ''} ha sido enviada.\nTe notificaremos cuando un conductor la acepte.`,
        [{ text: 'Ver estado del viaje', onPress: () => { 
          setAlertVisible(false); 
          nav.navigate('CustomerActiveTrip', { bookingId: created?.id, booking: created }); 
        } }],
      );
    } catch (e: any) {
      const raw = String(e?.message || 'Error desconocido');
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.message || parsed?.details || raw;
      } catch {}
      showAlert('error', 'Error al crear reserva', `No se pudo crear la reserva. ${detail}`);
      console.error('CreateReservation error:', e);
    } finally {
      setSaving(false);
    }
  };

  /* ══════════════════ RENDER ══════════════════ */
  return (
    <View style={st.root}>
      <KeyboardAvoidingView
        style={{ flex: 1, position: 'relative' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
          {/* Map siempre visible (también detrás del modal de detalles) */}
          <View style={st.mapContainer}>
            <MapView
              key={`reservation-map-${mapTheme}-poi-mute`}
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              customMapStyle={mapStyle}
              showsUserLocation={!showOriginMarker}
              showsMyLocationButton={false}
              showsCompass={false}
              rotateEnabled
              initialRegion={{ latitude: myLat, longitude: myLng, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA }}
              zoomControlEnabled={false}
              loadingEnabled
              loadingIndicatorColor="#00E5FF"
              onRegionChange={handleMapRegionChange}
              onRegionChangeComplete={handleMapRegionChangeComplete}
            >
              {showOriginMarker && (
                <Marker
                  coordinate={{ latitude: origin.latitude, longitude: origin.longitude }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={CLIENT_ORIGIN_MARKER_IMAGE}
                  tracksViewChanges={false}
                  zIndex={2}
                />
              )}
              {showDestMarker && (
                <Marker
                  coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={CLIENT_DEST_MARKER_IMAGE}
                  tracksViewChanges={false}
                  zIndex={3}
                />
              )}
              {routeCoords.length > 1 && !inLocateMode && (
                <>
                  {/* Borde azul del trazo */}
                  <Polyline
                    coordinates={routeCoords}
                    strokeColor={ROUTE_LINE_BLUE}
                    strokeWidth={8}
                    lineJoin="round"
                    lineCap="round"
                    zIndex={1}
                  />
                  <Polyline
                    coordinates={routeCoords}
                    strokeColor="#00E676"
                    strokeWidth={5}
                    lineJoin="round"
                    lineCap="round"
                    zIndex={2}
                  />
                  {/* Punta inicio: bolita blanca con borde azul */}
                  <Marker
                    coordinate={routeCoords[0]}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                    zIndex={4}
                  >
                    <View style={st.routeEndpointStart} />
                  </Marker>
                  {/* Punta fin: bolita roja con borde azul */}
                  <Marker
                    coordinate={routeCoords[routeCoords.length - 1]}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                    zIndex={5}
                  >
                    <View style={st.routeEndpointEnd} />
                  </Marker>
                </>
              )}
            </MapView>

            {inLocateMode && step === 'map' && (
              <View pointerEvents="none" style={st.centerPinWrap}>
                <RouteMapPin variant={locateTarget!} lifted={mapDragging} />
              </View>
            )}

            <LinearGradient
              pointerEvents="none"
              colors={['rgba(5,26,38,0.72)', 'rgba(5,26,38,0.28)', 'rgba(5,26,38,0)']}
              locations={[0, 0.55, 1]}
              style={[st.mapTopFade, { height: topPad + 52 }]}
            />

            <TouchableOpacity
              style={[st.mapBackBtn, { top: topPad }]}
              onPress={() => {
                if (step === 'details') {
                  setStep('map');
                  preferFormRef.current = false;
                  setPanelView('route');
                  return;
                }
                if (inLocateMode) exitLocateToSearch(locateTarget || undefined);
                else if (panelView === 'form' && hasConfirmedRoute) {
                  preferFormRef.current = false;
                  setPanelView('route');
                } else nav.goBack();
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>

            {showMapFloatingControls && (
              <>
                <View style={[st.leftMapControls, { bottom: mapControlsBottom }]}>
                  {/* Modo día/noche deshabilitado para el cliente — mapa siempre en noche */}
                  {/*
                  <TouchableOpacity
                    style={st.mapCtrlBtn}
                    onPress={() => setMapTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={mapTheme === 'dark' ? 'moon' : 'sunny'}
                      size={20}
                      color="#00E5FF"
                    />
                  </TouchableOpacity>
                  */}
                  <TouchableOpacity style={st.mapCtrlBtn} onPress={handleZoomIn} activeOpacity={0.8}>
                    <Ionicons name="add" size={20} color="#00E5FF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={st.mapCtrlBtn} onPress={handleZoomOut} activeOpacity={0.8}>
                    <Ionicons name="remove" size={20} color="#00E5FF" />
                  </TouchableOpacity>
                </View>
                <View style={[st.rightMapControls, { bottom: mapControlsBottom }]}>
                  <TouchableOpacity style={st.mapCtrlBtn} onPress={centerOnMe} activeOpacity={0.8}>
                    <Ionicons name="locate" size={22} color="#00E5FF" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {step === 'map' && sheetMode === 'search' && panelView === 'route' && (
              <View style={[st.mapHintWrap, { top: topPad + 4 }]} pointerEvents="none">
                <View style={st.mapHintPill}>
                  <Ionicons name="information-circle-outline" size={13} color="#00E5FF" />
                  <Text style={st.mapHintText} numberOfLines={1}>
                    Edita direcciones o ubica en el mapa para editar
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ─── Hoja SEARCH: form / resumen (solo step map) ─── */}
          {step === 'map' && sheetMode === 'search' && panelView === 'route' && (
            <View style={[st.routeSheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View {...sheetPanResponder.panHandlers}>
                <View style={st.sheetHandle} />
              </View>
              <Text style={st.panelTitle}>Mi Viaje</Text>
              <TouchableOpacity style={st.routeAddrRow} onPress={() => openFormToEdit('origin')} activeOpacity={0.8}>
                <View style={[st.inputDot, { backgroundColor: '#00E676' }]} />
                <Text style={st.routeAddrTxt} numberOfLines={2}>{origin?.title || 'Origen'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.routeAddrRow} onPress={() => openFormToEdit('destination')} activeOpacity={0.8}>
                <View style={[st.inputDot, { backgroundColor: '#E91E63' }]} />
                <Text style={st.routeAddrTxt} numberOfLines={2}>{destination?.title || 'Destino'}</Text>
              </TouchableOpacity>
              <View style={st.routeSummary}>
                <View style={st.routeChip}><Ionicons name="speedometer-outline" size={14} color="#00E5FF" /><Text style={st.routeChipTxt}>{distance.toFixed(1)} km</Text></View>
                <View style={st.routeChip}><Ionicons name="time-outline" size={14} color="#00E5FF" /><Text style={st.routeChipTxt}>{Math.round(duration)} min</Text></View>
              </View>
              <TouchableOpacity
                style={[st.continueBtn, !canContinue && { opacity: 0.45 }]}
                disabled={!canContinue}
                onPress={() => { Keyboard.dismiss(); setStep('details'); }}
                activeOpacity={0.85}
              >
                <Text style={st.continueTxt}>Continuar</Text>
                <Ionicons name="arrow-forward" size={20} color="#051A26" />
              </TouchableOpacity>
            </View>
          )}

          {step === 'map' && sheetMode === 'search' && panelView === 'form' && (
          <Animated.View
            style={[
              st.searchPanel,
              { transform: [{ translateY: mapKeyboardOffsetAnim }], paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <View {...sheetPanResponder.panHandlers}>
              <View style={st.sheetHandle} />
            </View>
            <Text style={st.panelTitle}>Asigna tu ruta</Text>
            <Text style={st.panelSubtitle}>
              {hasConfirmedRoute ? 'Desliza abajo para ver el trazado' : 'Ingresa tu dirección de destino'}
            </Text>

            {/* Origen */}
            <View style={st.fieldWrap}>
              <View style={st.inputIconWrap}><View style={[st.inputDot, { backgroundColor: '#00E676' }]} /></View>
              <TextInput
                ref={originInputRef}
                style={st.addrInput}
                placeholder="¿Dónde te recogemos?"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={originInputText}
                onFocus={() => {
                  if (!sessionTokenOrigin.current) sessionTokenOrigin.current = generateUID();
                  setActiveField('origin');
                  if (originInputText.trim().length >= 2) fetchSuggestions(originInputText, 'origin');
                }}
                onChangeText={(t) => {
                  setOriginInputText(t);
                  setActiveField('origin');
                  setPanelView('form');
                  fetchSuggestions(t, 'origin');
                }}
              />
              {showClearOrigin && (
                <Pressable style={st.clearFieldBtn} onPress={clearOriginField} hitSlop={12}>
                  <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.7)" />
                </Pressable>
              )}
            </View>

            <View style={st.connectLine}>
              <View style={st.connectDash} /><View style={st.connectDash} /><View style={st.connectDash} />
            </View>

            {/* Destino */}
            <View style={st.fieldWrap}>
              <View style={st.inputIconWrap}><View style={[st.inputDot, { backgroundColor: '#E91E63' }]} /></View>
              <TextInput
                ref={destInputRef}
                style={st.addrInput}
                placeholder="¿A dónde vas?"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={destInputText}
                onFocus={() => {
                  if (!sessionTokenDest.current) sessionTokenDest.current = generateUID();
                  setActiveField('destination');
                  if (destInputText.trim().length >= 2) fetchSuggestions(destInputText, 'destination');
                }}
                onChangeText={(t) => {
                  setDestInputText(t);
                  setActiveField('destination');
                  setPanelView('form');
                  fetchSuggestions(t, 'destination');
                }}
              />
              {showClearDest && (
                <Pressable style={st.clearFieldBtn} onPress={clearDestField} hitSlop={12}>
                  <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.7)" />
                </Pressable>
              )}
            </View>

            {/* Lista scrolleable: sugerencias o recientes */}
            <ScrollView
              style={st.listScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={st.recentsTitle}>
                {showSuggestions ? 'Sugerencias' : 'Búsquedas destinos recientes'}
              </Text>
              {showSuggestions ? (
                loadingSuggestions ? (
                  <ActivityIndicator size="small" color="#00E5FF" style={{ marginVertical: 12 }} />
                ) : (
                  placeSuggestions.map(item => (
                    <TouchableOpacity
                      key={item.place_id}
                      style={st.recentRow}
                      onPress={() => selectSuggestion(item, activeSuggestField)}
                      activeOpacity={0.75}
                    >
                      <View style={st.recentIcon}>
                        <Ionicons name="search-outline" size={18} color="#00E5FF" />
                      </View>
                      <Text style={st.recentTxt} numberOfLines={2}>{item.description}</Text>
                    </TouchableOpacity>
                  ))
                )
              ) : loadingRecents ? (
                <ActivityIndicator size="small" color="#00E5FF" style={{ marginVertical: 12 }} />
              ) : recentDestinations.length === 0 ? (
                <Text style={st.recentsEmpty}>No hay destinos recientes</Text>
              ) : (
                recentDestinations.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={st.recentRow}
                    onPress={() => handleSelectRecent(item)}
                    activeOpacity={0.75}
                  >
                    <View style={st.recentIcon}>
                      <Ionicons name="time-outline" size={18} color="#00E5FF" />
                    </View>
                    <Text style={st.recentTxt} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={st.locateMapRow} onPress={() => openLocateOnMap()} activeOpacity={0.8}>
              <View style={st.locateMapIcon}>
                <Ionicons name="map-outline" size={20} color="#051A26" />
              </View>
              <Text style={st.locateMapTxt} numberOfLines={1}>{locateMapLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            {favoritePlaces.length > 0 && !showSuggestions && (
              <View style={st.favoritesSection}>
                <View style={st.favoritesHeader}>
                  <Ionicons name="star" size={12} color="#00E5FF" />
                  <Text style={st.favoritesTitle}>Tus lugares favoritos</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={st.favoritesRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {favoritePlaces.map(place => {
                    const typeInfo = place.type_address ? FAVORITE_TYPE_ICONS[place.type_address] : null;
                    return (
                      <TouchableOpacity
                        key={place.id}
                        style={st.favoriteChip}
                        onPress={() => handleSelectFavorite(place)}
                        activeOpacity={0.75}
                      >
                        <View style={[st.favoriteChipIcon, { borderColor: typeInfo?.color || '#00E5FF' }]}>
                          {typeInfo ? (
                            <MaterialCommunityIcons name={typeInfo.icon as any} size={16} color={typeInfo.color} />
                          ) : (
                            <Ionicons name="location" size={14} color="#00E5FF" />
                          )}
                        </View>
                        <View style={st.favoriteChipText}>
                          <Text style={st.favoriteChipName} numberOfLines={1}>{place.name}</Text>
                          <Text style={st.favoriteChipAddr} numberOfLines={1}>{place.description}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {calculating && (
              <View style={st.routeSummary}>
                <ActivityIndicator size="small" color="#00E5FF" />
                <Text style={st.routeSummaryTxt}>Calculando ruta...</Text>
              </View>
            )}

            <TouchableOpacity
              style={[st.continueBtn, !canContinue && { opacity: 0.45 }]}
              disabled={!canContinue}
              onPress={() => { Keyboard.dismiss(); setStep('details'); }}
              activeOpacity={0.85}
            >
              <Text style={st.continueTxt}>Continuar</Text>
              <Ionicons name="arrow-forward" size={20} color="#051A26" />
            </TouchableOpacity>
          </Animated.View>
          )}

          {/* ─── Hoja LOCATE (fijar punto en mapa) ─── */}
          {step === 'map' && inLocateMode && (
          <View style={[st.locateSheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={st.sheetHandle} />
            <Text style={st.locateSheetTitle}>
              {locateTarget === 'origin' ? 'Ubica el punto de inicio' : 'Ubica el punto de destino'}
            </Text>
            <Text style={st.locateSheetSub}>Arrastra el mapa para mover la ubicación</Text>
            <TouchableOpacity
              style={st.locateAddressCard}
              onPress={() => exitLocateToSearch(locateTarget || undefined)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={locateTarget === 'origin' ? 'navigate-circle' : 'flag'}
                size={18}
                color={locateTarget === 'origin' ? '#00E676' : '#E91E63'}
              />
              <Text style={st.locateAddressTxt} numberOfLines={2}>
                {liveLocateAddress || 'Buscando dirección...'}
              </Text>
              <Ionicons name="create-outline" size={16} color="#00E5FF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.confirmPinBtnInSheet, confirmingPin && st.confirmPinBtnDisabled]}
              onPress={confirmMapPin}
              activeOpacity={0.85}
              disabled={confirmingPin}
            >
              {confirmingPin ? (
                <ActivityIndicator size="small" color="#333333" />
              ) : (
                <Text style={st.confirmPinTxt}>
                  {locateTarget === 'origin' ? 'Confirmar punto inicio' : 'Confirmar Destino'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          )}

          {/* ─── Modal DETALLES DE RESERVA (mapa con trazado visible arriba) ─── */}
          {step === 'details' && (
            <Animated.View
              style={[
                st.detailsSheet,
                {
                  height: detailsHeightAnim,
                  paddingBottom: Math.max(insets.bottom, 8),
                },
              ]}
            >
              <View style={st.detailsSheetInner}>
                <View {...detailsSheetPan.panHandlers}>
                  <View style={st.sheetHandle} />
                  <Text style={st.detailsSheetTitle}>Detalles De Reserva</Text>
                </View>

                <ScrollView
                  ref={scrollViewRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={st.detailsContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  bounces
                  nestedScrollEnabled
                  onScroll={handleDetailsScroll}
                  scrollEventThrottle={16}
                >
                  {/* Ruta compacta */}
                  <View style={st.glassCard}>
                    <TouchableOpacity
                      style={st.routeCardRow}
                      onPress={() => editAddressFromDetails('origin')}
                      activeOpacity={0.75}
                    >
                      <View style={[st.routeCardDot, { backgroundColor: '#00E676' }]} />
                      <Text style={st.routeCardAddr}>{origin?.title || 'Origen'}</Text>
                      <Ionicons name="create-outline" size={15} color="#00E5FF" />
                    </TouchableOpacity>
                    <View style={st.routeCardLine} />
                    <TouchableOpacity
                      style={st.routeCardRow}
                      onPress={() => editAddressFromDetails('destination')}
                      activeOpacity={0.75}
                    >
                      <View style={[st.routeCardDot, { backgroundColor: '#E91E63' }]} />
                      <Text style={st.routeCardAddr}>{destination?.title || 'Destino'}</Text>
                      <Ionicons name="create-outline" size={15} color="#00E5FF" />
                    </TouchableOpacity>
                    <View style={st.routeCardMeta}>
                      <Text style={st.routeCardMetaTxt}>{distance.toFixed(1)} km</Text>
                      <Text style={st.routeCardMetaTxt}>·</Text>
                      <Text style={st.routeCardMetaTxt}>{Math.round(duration)} min</Text>
                    </View>
                  </View>

                  {/* Tipo De Servicio */}
                  <Text style={st.label}>Tipo De Servicio</Text>
                  <View style={st.segRow}>
                    <TouchableOpacity
                      style={[st.segItem, serviceType === 'immediate' && st.segItemOn]}
                      onPress={() => { animateChipSelect(); setServiceType('immediate'); }}
                      activeOpacity={0.85}
                    >
                      <BlurView intensity={serviceType === 'immediate' ? 28 : 18} tint="dark" style={st.segBlur} />
                      <View style={st.segInner}>
                        <View style={st.segIconWrap}>
                          <Ionicons name="flash" size={17} color="#051A26" />
                        </View>
                        <Text style={[st.segTxt, serviceType === 'immediate' && st.segTxtOn]} numberOfLines={1}>
                          Inmediato
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.segItem, serviceType === 'reservation' && st.segItemOn]}
                      onPress={() => { animateChipSelect(); setServiceType('reservation'); }}
                      activeOpacity={0.85}
                    >
                      <BlurView intensity={serviceType === 'reservation' ? 28 : 18} tint="dark" style={st.segBlur} />
                      <View style={st.segInner}>
                        <View style={st.segIconWrap}>
                          <Ionicons name="calendar" size={17} color="#051A26" />
                        </View>
                        <Text style={[st.segTxt, serviceType === 'reservation' && st.segTxtOn]} numberOfLines={1}>
                          Programar Viaje
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  {serviceType === 'reservation' && (
                    <TouchableOpacity
                      style={st.datePickerBtn}
                      onPress={openSchedulePicker}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#00E5FF" />
                      <Text style={st.datePickerTxt}>
                        {scheduledDate
                          ? formatScheduledLabel(scheduledDate)
                          : 'Seleccionar fecha y hora'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                  )}

                  {/* Tipo De Recorrido (debajo de servicio) */}
                  <Text style={st.label}>Tipo De Recorrido</Text>
                  <View style={st.segRow}>
                    <TouchableOpacity
                      style={[st.segItem, tripType === 'Ida' && st.segItemOn]}
                      onPress={() => { animateChipSelect(); setTripType('Ida'); }}
                      activeOpacity={0.85}
                    >
                      <BlurView intensity={tripType === 'Ida' ? 28 : 18} tint="dark" style={st.segBlur} />
                      <View style={st.segInner}>
                        <View style={st.segIconWrap}>
                          <Ionicons name="arrow-forward" size={17} color="#051A26" />
                        </View>
                        <Text style={[st.segTxt, tripType === 'Ida' && st.segTxtOn]}>Ida</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.segItem, tripType === 'Ida y Vuelta' && st.segItemOn]}
                      onPress={() => { animateChipSelect(); setTripType('Ida y Vuelta'); }}
                      activeOpacity={0.85}
                    >
                      <BlurView intensity={tripType === 'Ida y Vuelta' ? 28 : 18} tint="dark" style={st.segBlur} />
                      <View style={st.segInner}>
                        <View style={st.segIconWrap}>
                          <Ionicons name="swap-horizontal" size={17} color="#051A26" />
                        </View>
                        <Text style={[st.segTxt, tripType === 'Ida y Vuelta' && st.segTxtOn]} numberOfLines={1}>
                          Ida Y Vuelta
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Vehículo de preferencia */}
                  <Text style={st.label}>Selecciona Vehiculo De Preferencia</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={st.vehicleRow}
                  >
                    {vehicleTypes.map(v => {
                      const active = carType === v.key;
                      const fare = vehicleFareRanges[v.key];
                      const desc = v.description;
                      const imgSource = v.imageUri
                        ? { uri: v.imageUri }
                        : VEHICLE_CATEGORY_IMAGES[v.key] || null;
                      return (
                        <TouchableOpacity
                          key={v.key}
                          style={[st.vehicleBtn, active && st.vehicleBtnActive]}
                          onPress={() => setCarType(v.key)}
                          activeOpacity={0.8}
                        >
                          <BlurView intensity={active ? 30 : 16} tint="dark" style={st.segBlur} />
                          <View style={st.vehicleBtnInner}>
                            {imgSource ? (
                              <Image
                                source={imgSource}
                                style={[st.vehicleImg, active && st.vehicleImgActive]}
                                resizeMode="contain"
                              />
                            ) : (
                              <Ionicons name={v.icon} size={22} color={active ? '#00E5FF' : 'rgba(255,255,255,0.5)'} />
                            )}
                            <Text style={[st.vehicleTxt, active && st.vehicleTxtActive]} numberOfLines={1}>
                              {v.label}
                            </Text>
                            <Text
                              style={[st.vehicleDesc, active && st.vehicleDescActive]}
                              numberOfLines={2}
                            >
                              {desc || ' '}
                            </Text>
                            {fare ? (
                              <View style={[st.vehiclePricePill, active && st.vehiclePricePillActive]}>
                                <Text
                                  style={st.vehiclePriceTxt}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.6}
                                >
                                  {`$ ${fare.low.toLocaleString('es-CO')} – $ ${fare.high.toLocaleString('es-CO')}`}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Observaciones */}
                  <Text style={st.label}>Observaciones (Opcional)</Text>
                  <View style={st.obsGlass}>
                    <BlurView intensity={18} tint="dark" style={st.segBlur} />
                    <TextInput
                      style={st.obsInput}
                      placeholder="Instrucciones adicionales..."
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      value={observations}
                      onChangeText={setObservations}
                      multiline
                      maxLength={500}
                    />
                  </View>
                  <View style={{ height: 12 }} />
                </ScrollView>

                {/* Footer fijo: precio + pago + crear */}
                <View style={st.detailsFooter}>
                  <View style={st.footerInner}>
                      <View style={st.payHeaderRow}>
                        <Text style={st.footerLabel}>Selecciona Método De Pago</Text>
                        <View style={st.pricePill}>
                          <Text style={st.pricePillTxt}>
                            $ {(driverPrice || 0).toLocaleString('es-CO')}
                          </Text>
                          <Text style={st.pricePillSep}>–</Text>
                          <Text style={st.pricePillTxt}>
                            $ {(clientPrice || 0).toLocaleString('es-CO')}
                          </Text>
                        </View>
                      </View>

                    <View style={st.segRow}>
                      {([
                        {
                          key: 'cash' as const,
                          label: 'Efectivo',
                          accent: '#16A34A',
                          logo: null as string | null,
                          icon: 'cash-outline' as const,
                        },
                        {
                          key: 'nequi' as const,
                          label: 'Nequi',
                          accent: '#E6007E',
                          logo: NEQUI_LOGO_URI,
                          icon: 'phone-portrait-outline' as const,
                        },
                        {
                          key: 'daviplata' as const,
                          label: 'Daviplata',
                          accent: '#ED1C24',
                          logo: DAVIPLATA_LOGO_URI,
                          icon: 'wallet-outline' as const,
                        },
                      ]).map((m) => {
                        const selected = paymentMode === m.key;
                        return (
                          <TouchableOpacity
                            key={m.key}
                            style={[
                              st.paySeg,
                              { flex: selected ? 2.4 : 1 },
                              selected && { borderColor: m.accent },
                            ]}
                            onPress={() => { animateChipSelect(); setPaymentMode(m.key); }}
                            activeOpacity={0.85}
                          >
                            <BlurView intensity={selected ? 32 : 16} tint="dark" style={st.segBlur} />
                            <View style={st.paySegInner}>
                              <View style={[st.payIconBox, selected && { borderColor: m.accent }]}>
                                {m.logo ? (
                                  <Image source={{ uri: m.logo }} style={st.payLogo} resizeMode="contain" />
                                ) : (
                                  <Ionicons name={m.icon} size={17} color={m.accent} />
                                )}
                              </View>
                              {selected && (
                                <Text style={[st.paySegTxt, { color: m.accent }]} numberOfLines={1}>
                                  {m.label}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TouchableOpacity
                      style={[st.submitBtn, !canSubmit && { opacity: 0.5 }]}
                      onPress={handleSubmit}
                      disabled={!canSubmit}
                      activeOpacity={0.85}
                    >
                      {saving ? (
                        <ActivityIndicator color="#051A26" size="small" />
                      ) : (
                        <>
                          <Ionicons name="send" size={16} color="#051A26" />
                          <Text style={st.submitTxt}>Crear Reserva con {carType}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}
      </KeyboardAvoidingView>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={st.schedOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
          <View style={[st.schedSheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={st.sheetHandle} />
            <Text style={st.schedTitle}>Programar Viaje</Text>
            <Text style={st.schedPreview}>{formatScheduledLabel(previewPickerDate())}</Text>

            <View style={st.wheelWrap}>
              <View style={st.wheelHighlight} pointerEvents="none" />
              <WheelColumn
                width="42%"
                index={pickerDayIdx}
                onChange={setPickerDayIdx}
                data={dayOptions.map((d, i) => ({
                  key: `d${i}`,
                  label: `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()].slice(0, 3)}.`,
                }))}
              />
              <WheelColumn
                width="16%"
                index={pickerHourIdx}
                onChange={setPickerHourIdx}
                data={hourOptions}
              />
              <Text style={st.wheelColon}>:</Text>
              <WheelColumn
                width="16%"
                index={pickerMinIdx}
                onChange={setPickerMinIdx}
                data={minOptions}
              />
              <WheelColumn
                width="18%"
                index={pickerAmPmIdx}
                onChange={setPickerAmPmIdx}
                data={ampmOptions}
              />
            </View>

            <View style={st.schedActions}>
              <TouchableOpacity style={st.schedCancelBtn} onPress={() => setShowDatePicker(false)} activeOpacity={0.8}>
                <Text style={st.schedCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.schedConfirmBtn} onPress={confirmSchedulePicker} activeOpacity={0.85}>
                <Text style={st.schedConfirmTxt}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertVisible}
        type={alertType}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onDismiss={() => setAlertVisible(false)}
      />
    </View>
  );
};

export default CreateReservationScreen;

/* ────────────── STYLES ────────────── */
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, zIndex: 30,
    backgroundColor: 'rgba(5,26,38,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  mapBackBtn: {
    position: 'absolute', left: 16, zIndex: 40,
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(5,26,38,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', letterSpacing: -0.3 },

  mapContainer: { flex: 1, position: 'relative', overflow: 'visible' },
  // Punta del pin (tip) anclada al centro exacto del mapa
  centerPinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: ROUTE_PIN_WIDTH,
    height: ROUTE_PIN_HEIGHT,
    marginLeft: -ROUTE_PIN_WIDTH / 2,
    marginTop: -ROUTE_PIN_HEIGHT,
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
  },
  mapTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  panelTitle: {
    fontSize: 20, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, marginBottom: 4,
    textAlign: 'center',
  },
  panelSubtitle: {
    fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.45)', marginBottom: 16,
    textAlign: 'center',
  },
  leftMapControls: {
    position: 'absolute',
    left: 16,
    bottom: 120,
    gap: 10,
    zIndex: 15,
    elevation: 15,
  },
  rightMapControls: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    gap: 10,
    zIndex: 15,
    elevation: 15,
  },
  mapCtrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(5,26,38,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  /* ═══ Relocating UI (overlay sobre el mapa) ═══ */
  relocatingBanner: {
    position: 'absolute', top: 14, left: 14, right: 14,
    backgroundColor: 'rgba(0,229,255,0.95)',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 10,
  },
  relocatingText: {
    flex: 1, color: '#051A26', fontSize: 13, fontWeight: '700',
  },
  cancelRelocateBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(5,26,38,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  mapHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 35,
  },
  mapHintPill: {
    height: 32,
    maxWidth: '78%',
    backgroundColor: 'rgba(5,26,38,0.88)',
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  mapHintText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  searchPanel: {
    backgroundColor: '#051A26',
    paddingHorizontal: 16, paddingTop: 10,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '16%',
    zIndex: 40,
    elevation: 40,
  },
  routeSheet: {
    backgroundColor: '#051A26',
    paddingHorizontal: 16, paddingTop: 10,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 40,
  },
  routeAddrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(10,46,61,0.85)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.28)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  routeAddrTxt: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
  fieldWrap: {
    position: 'relative',
    marginBottom: 0,
  },
  addrInput: {
    height: 46,
    fontSize: 13,
    fontWeight: '500',
    color: '#FFF',
    backgroundColor: 'rgba(10,46,61,0.85)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.38)',
    paddingLeft: 36,
    paddingRight: 42,
    paddingVertical: 10,
    textAlign: 'left',
  },
  listScroll: {
    flexGrow: 1,
    flexShrink: 1,
    marginTop: 10,
    maxHeight: SH * 0.28,
  },
  markerPad: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 6,
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  clearFieldBtn: {
    position: 'absolute',
    right: 10,
    top: 14,
    zIndex: 50,
    elevation: 50,
  },
  recentsSection: {
    marginTop: 14,
    flexShrink: 1,
  },
  recentsList: {
    // Panel alto: caben los 5 recientes sin ScrollView (evita VirtualizedList nested)
  },
  recentsTitle: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 2,
  },
  recentsEmpty: {
    fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingVertical: 10, paddingHorizontal: 4,
  },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'transparent',
  },
  recentIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,229,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  recentTxt: {
    flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: '500',
  },
  locateMapRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 8, marginBottom: 4,
    paddingVertical: 12, paddingHorizontal: 4,
    backgroundColor: 'rgba(10,46,61,0.55)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
  },
  locateMapIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  locateMapTxt: {
    flex: 1, fontSize: 14, fontWeight: '600', color: '#FFFFFF',
  },
  locateSheet: {
    backgroundColor: '#051A26',
    paddingHorizontal: 16, paddingTop: 10,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 45,
    elevation: 45,
  },
  locateSheetTitle: {
    fontSize: 18, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 4,
  },
  locateSheetSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 14,
  },
  locateAddressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(10,46,61,0.85)',
    borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(0,229,255,0.35)',
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 12,
  },
  locateAddressTxt: {
    flex: 1, fontSize: 13, color: '#FFF', fontWeight: '500',
  },
  confirmPinBtnInSheet: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  confirmPinBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPinBtnDisabled: {
    opacity: 0.7,
  },
  confirmPinTxt: {
    color: '#333333',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  inputIconWrap: { position: 'absolute', left: 14, top: 15, zIndex: 20 },
  inputDot: { width: 10, height: 10, borderRadius: 5 },
  connectLine: { marginLeft: 18, height: 16, justifyContent: 'space-between' },
  connectDash: { width: 2, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1 },
  routeSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.1)',
  },
  favoritesSection: {
    marginTop: 10,
  },
  favoritesHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 2,
  },
  favoritesTitle: {
    fontSize: 11, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.8, textTransform: 'uppercase',
  },
  favoritesRow: {
    gap: 8, paddingRight: 4,
  },
  favoriteChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, maxWidth: 220,
    backgroundColor: 'rgba(10,46,61,0.72)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  favoriteChipIcon: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.06)',
  },
  favoriteChipText: {
    flexShrink: 1,
  },
  favoriteChipName: {
    fontSize: 12, fontWeight: '700', color: '#FFF', maxWidth: 160,
  },
  favoriteChipAddr: {
    fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1, maxWidth: 160,
  },
  routeSummaryTxt: { fontSize: 13, color: '#00E5FF', fontWeight: '600' },
  routeChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeChipTxt: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 20, backgroundColor: '#00E5FF',
    marginBottom: 20,
  },
  continueTxt: { fontSize: 17, fontWeight: '700', color: '#051A26' },

  detailsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#051A26',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    zIndex: 50,
    elevation: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  detailsSheetInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  detailsSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  detailsContent: {
    paddingBottom: 8,
  },
  detailsSection: {
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.15,
    marginBottom: 8,
    marginTop: 14,
  },
  glassCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  routeCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.18)',
  },
  routeCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeCardDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 4,
  },
  routeCardLine: {
    width: 2,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: 3.5,
    marginVertical: 4,
  },
  routeCardAddr: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  routeCardMeta: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  routeCardMetaTxt: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  /* Segmented liquid-glass */
  segRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segItem: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  segItemOn: {
    borderColor: 'rgba(0,229,255,0.55)',
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  segBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  segInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  segIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segTxt: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  segTxtOn: {
    color: '#00E5FF',
  },
  /* legacy dyn (kept if referenced) */
  dynRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dynChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, paddingHorizontal: 8, borderRadius: 14, backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1.5, borderColor: 'rgba(0,229,255,0.18)', overflow: 'hidden' },
  dynChipWide: { flex: 3, backgroundColor: 'rgba(0,229,255,0.14)', borderColor: '#00E5FF' },
  dynChipNarrow: { flex: 2 },
  dynIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  dynIconBoxOn: { borderColor: 'rgba(5,26,38,0.2)' },
  dynChipTxt: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  vehicleRow: {
    flexDirection: 'row',
    gap: VEHICLE_CARD_GAP,
    paddingRight: 4,
  },
  vehicleBtn: {
    width: VEHICLE_CARD_W,
    minHeight: 118,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  vehicleBtnActive: {
    borderColor: 'rgba(0,229,255,0.55)',
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  vehicleBtnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  vehicleImg: {
    width: 52,
    height: 36,
    marginTop: 0,
    opacity: 0.95,
  },
  vehicleImgActive: {
    opacity: 1,
  },
  vehicleTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 1,
  },
  vehicleTxtActive: {
    color: '#00E5FF',
  },
  vehicleDesc: {
    fontSize: 8,
    fontWeight: '500',
    lineHeight: 10,
    minHeight: 20, // siempre 2 líneas → precios alineados
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  vehicleDescActive: {
    color: 'rgba(0,229,255,0.72)',
  },
  vehiclePricePill: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.35)',
    maxWidth: '100%',
  },
  vehiclePricePillActive: {
    backgroundColor: 'rgba(0,229,255,0.18)',
    borderColor: 'rgba(0,229,255,0.5)',
  },
  vehiclePriceTxt: {
    fontSize: 8,
    fontWeight: '700',
    color: '#00E5FF',
    textAlign: 'center',
  },
  tripRow: { flexDirection: 'row', gap: 10 },
  tripBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1.5, borderColor: 'rgba(0,229,255,0.16)',
  },
  tripBtnActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF' },
  tripTxt: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  tripTxtActive: { color: '#051A26' },
  obsGlass: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    minHeight: 56,
  },
  obsInput: {
    minHeight: 56,
    padding: 12,
    fontSize: 13,
    color: '#FFF',
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
  },
  detailsFooter: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  footerInner: {
    gap: 8,
    paddingBottom: 2,
  },
  footerLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.15,
  },
  payHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  pricePillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00E5FF',
  },
  pricePillSep: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(0,229,255,0.55)',
  },
  paySeg: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  paySegInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 6,
  },
  payIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payLogo: {
    width: 20,
    height: 20,
  },
  paySegTxt: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(10,46,61,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.14)',
    overflow: 'hidden',
  },
  payChipWide: { flex: 3 },
  payChipNarrow: { flex: 1 },
  payChipTxt: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 14, backgroundColor: '#00E5FF',
    marginTop: 2,
  },
  submitTxt: { fontSize: 14, fontWeight: '700', color: '#051A26' },
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 6 },
  userTxt: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  datePickerTxt: { flex: 1, fontSize: 13, fontWeight: '600', color: '#FFF' },

  routeEndpointStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: ROUTE_LINE_BLUE,
  },
  routeEndpointEnd: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E91E63',
    borderWidth: 2.5,
    borderColor: ROUTE_LINE_BLUE,
  },

  schedOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  schedSheet: {
    backgroundColor: '#051A26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
  },
  schedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  schedPreview: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00E5FF',
    textAlign: 'center',
    marginBottom: 12,
  },
  wheelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: WHEEL_ITEM_H * 5,
    marginBottom: 14,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: WHEEL_ITEM_H * 2,
    height: WHEEL_ITEM_H,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  wheelItem: {
    height: WHEEL_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  wheelItemTxt: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  wheelItemTxtOn: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  wheelColon: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginHorizontal: 2,
  },
  schedActions: {
    flexDirection: 'row',
    gap: 10,
  },
  schedCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  schedCancelTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  schedConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#00E5FF',
  },
  schedConfirmTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#051A26',
  },

  /* ═══ Mini Map Preview ═══ */
  miniMapContainer: {
    marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18,
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
  },
  miniMapHeader: {
    marginBottom: 10,
  },
  miniMapTitle: {
    fontSize: 13, fontWeight: '700', color: '#00E5FF', letterSpacing: 0.5, textTransform: 'uppercase',
  },
  miniMap: {
    borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,229,255,0.15)',
    shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  expandMapBtn: {
    padding: 8, borderRadius: 10,
    backgroundColor: 'rgba(0,229,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  
  /* 🆕 Drag Hint */
  dragHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, borderRadius: 10,
    backgroundColor: 'rgba(0,229,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  dragHintText: {
    fontSize: 12, color: '#00E5FF', fontWeight: '500',
  },
  
  /* ═══ Expanded Map Modal ═══ */
  expandedMapContainer: {
    flex: 1, backgroundColor: '#051A26',
  },
  expandedMapHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    backgroundColor: 'rgba(5,26,38,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  expandedMapHeaderRelocating: {
    backgroundColor: 'rgba(5,26,38,0.95)',
    borderBottomColor: 'rgba(0,229,255,0.25)',
    borderBottomWidth: 2,
  },
  expandedMapTitle: {
    fontSize: 20, fontWeight: '800', color: '#00FF7F', letterSpacing: 0.5, textShadowColor: 'rgba(0,255,127,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  dragInstructions: {
    fontSize: 12, color: 'rgba(0,229,255,0.7)', fontWeight: '600', marginTop: 4,
  },
  dragInstructionsActive: {
    color: '#00FF7F', fontWeight: '700', fontSize: 13, textShadowColor: 'rgba(0,255,127,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4,
  },
  expandedMap: {
    flex: 1,
  },
  expandedMapFooter: {
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 20,
    backgroundColor: 'rgba(5,26,38,0.95)',
    borderTopWidth: 1, borderTopColor: 'rgba(0,229,255,0.1)',
  },
  expandedMapCloseBtn: {
    paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: 'rgba(233,30,99,0.9)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.5)',
  },
  expandedMapCloseBtnText: {
    fontSize: 16, fontWeight: '700', color: '#FFF', letterSpacing: 0.3,
  },
});

