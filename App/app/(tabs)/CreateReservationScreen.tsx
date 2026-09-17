import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  Platform, ActivityIndicator, Dimensions, Keyboard, KeyboardAvoidingView,
  TouchableWithoutFeedback, Animated,
} from 'react-native';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import axios from 'axios';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { RootState } from '@/common/store';
import { API_KEY, getMapboxAccessToken } from '@/config/AppConfig';
import supabase, { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { FareCalculator } from '@/common/actions/FareCalculator';
import { isNearAirport } from '@/common/utils/airports';
import { DEFAULT_UMBRAL_INTERMUNICIPAL_KM } from '@/constants/fare';
import { LinearGradient } from 'expo-linear-gradient';
import { getGoogleMapStyle, GoogleMapTheme } from '@/config/googleMapsDarkStyle';
import { CLIENT_ORIGIN_MARKER_IMAGE, CLIENT_ORIGIN_PIN_SIZE } from '@/components/ClientOriginMapMarker';

const { width: SW } = Dimensions.get('window');

const GOOGLE_MAPS_KEY = API_KEY;

type VehicleType = { key: string; label: string; icon: 'car-sport' | 'car' | 'bus' | 'car-outline' };

const VEHICLE_ICON_MAP: Record<string, VehicleType['icon']> = {
  ConfortPlus: 'car-sport',
  XPlus:       'car',
  VanPlus:     'bus',
  TaxiPlus:    'car-outline',
};

// Fallback mientras Supabase carga — valores reales de car_types
const DEFAULT_VEHICLE_TYPES: VehicleType[] = [
  { key: 'ConfortPlus', label: 'ConfortPlus', icon: 'car-sport' },
  { key: 'XPlus',       label: 'XPlus',       icon: 'car'       },
  { key: 'VanPlus',     label: 'VanPlus',     icon: 'bus'       },
  { key: 'TaxiPlus',    label: 'TaxiPlus',    icon: 'car-outline'},
];

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

type FavoritePlace = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  type_address: string | null;
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
  const originAutoRef = useRef<any>(null);
  const destAutoRef = useRef<any>(null);
  const sessionTokenOrigin = useRef<string | null>(null);
  const sessionTokenDest = useRef<string | null>(null);
  const programmaticMoveRef = useRef(false);
  const geocodeSeqRef = useRef(0);

  const [myLat, setMyLat] = useState(COLOMBIA_CENTER.latitude);
  const [myLng, setMyLng] = useState(COLOMBIA_CENTER.longitude);
  // true solo cuando el GPS real resolvió — evita sesgar el autocompletado al
  // centro del país (valor inicial de myLat/myLng) antes de tener la ubicación.
  const [hasMyLocation, setHasMyLocation] = useState(false);
  const [origin, setOrigin] = useState<any>(params.origin || null);
  const [destination, setDestination] = useState<any>(params.destination || null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [relocatingMarker, setRelocatingMarker] = useState<'origin' | 'destination' | null>(null);
  const [tempMarkerCoord, setTempMarkerCoord] = useState<{ latitude: number; longitude: number } | null>(null);

  /* ── Trip details ── */
  const [carType, setCarType] = useState<string>(params.carType || DEFAULT_VEHICLE_TYPES[0].key);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>(DEFAULT_VEHICLE_TYPES);
  const [tripType, setTripType] = useState<'Ida' | 'Ida y Vuelta'>('Ida');
  const [serviceType, setServiceType] = useState<'immediate' | 'reservation'>('immediate');
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [observations, setObservations] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'nequi' | 'daviplata'>('cash');

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
  const [mapTheme, setMapTheme] = useState<GoogleMapTheme>('dark');
  const [mapDragging, setMapDragging] = useState(false);

  /* ── Favorite places ── */
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);

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
        // El autocomplete puede montarse después del GPS: reintentar setAddressText
        const applyText = () => originAutoRef.current?.setAddressText?.(addr);
        applyText();
        setTimeout(applyText, 250);
        setTimeout(applyText, 800);

        programmaticMoveRef.current = true;
        mapRef.current?.animateToRegion(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA },
          800,
        );
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [params.origin]);

  /* Si el origen ya está en estado, sincronizar el input al montar el paso mapa */
  useEffect(() => {
    if (step !== 'map' || !origin?.title) return;
    const apply = () => originAutoRef.current?.setAddressText?.(origin.title);
    apply();
    const t = setTimeout(apply, 200);
    return () => clearTimeout(t);
  }, [step, origin?.title]);

  /* ── Cargar vehículos y tarifas desde car_types ── */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('car_types')
          .select('name,base_price,base_price_inter,price_per_km,price_per_km_inter,rate_per_hour,rate_per_hour_inter,valor_hora,min_fare,min_fare_inter,delta_aeropuerto,delta_aeropuerto_prog,convenience_fee,convenience_fee_type,umbral_intermunicipal_km')
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
          });
        });

        setVehicleRates(rates);
        setVehicleTypes(types);
        setCarType(prev => (prev && rates[prev] ? prev : types[0]?.key ?? ''));
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

  const handleSelectFavorite = (place: FavoritePlace) => {
    setDestination({
      latitude: place.latitude,
      longitude: place.longitude,
      title: place.description,
    });
    destAutoRef.current?.setAddressText(place.description);
    sessionTokenDest.current = null;
    Keyboard.dismiss();
    mapRef.current?.animateToRegion(
      { latitude: place.latitude, longitude: place.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      600,
    );
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

  /* ── Enfoque del mapa: solo centrar al elegir destino (el origen lo controla el pin fijo). ── */
  useEffect(() => {
    if (!mapRef.current || routeCoords.length > 2 || !destination?.latitude) return;
    programmaticMoveRef.current = true;
    mapRef.current.animateToRegion(
      { latitude: destination.latitude, longitude: destination.longitude, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA },
      600,
    );
  }, [destination?.latitude, destination?.longitude, routeCoords.length]);

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

  useEffect(() => {
    if (!origin?.latitude || !destination?.latitude) {
      setRouteCoords([]);
      setDistance(0);
      setDuration(0);
      return;
    }
    calculateRoute();
  }, [origin, destination, tripType]);


  /* ── Origen fijo al centro: mover el mapa, no el pin ── */
  const updateOriginFromCenter = useCallback(async (latitude: number, longitude: number) => {
    const seq = ++geocodeSeqRef.current;
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}&language=es`,
      );
      const data = await resp.json();
      if (seq !== geocodeSeqRef.current) return;
      const addr = data.results?.[0]?.formatted_address || 'Punto de recogida';
      setOrigin({ latitude, longitude, title: addr });
      originAutoRef.current?.setAddressText(addr);
    } catch {
      if (seq !== geocodeSeqRef.current) return;
      setOrigin({ latitude, longitude, title: 'Punto de recogida' });
    }
  }, []);

  const handleDestinationPress = () => {
    setRelocatingMarker('destination');
    setTempMarkerCoord(null);
  };

  const handleMapPress = async (e: any) => {
    if (relocatingMarker !== 'destination') return;

    const { coordinate } = e.nativeEvent;
    setTempMarkerCoord(coordinate);

    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinate.latitude},${coordinate.longitude}&key=${GOOGLE_MAPS_KEY}&language=es`,
      );
      const data = await resp.json();
      const addr = data.results?.[0]?.formatted_address || 'Nueva ubicación';

      setDestination({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        title: addr,
      });
      destAutoRef.current?.setAddressText(addr);
    } catch {
      setDestination({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        title: 'Nueva ubicación (Destino)',
      });
      destAutoRef.current?.setAddressText('Nueva ubicación (Destino)');
    } finally {
      setRelocatingMarker(null);
      setTempMarkerCoord(null);
    }
  };

  /* ── Animar mapa cuando aparece la ruta ── */
  useEffect(() => {
    if (routeCoords.length > 2) {
      // Pequeño delay para que el polyline ya esté renderizado
      const timer = setTimeout(() => {
        if (mapRef.current) {
          programmaticMoveRef.current = true;
          mapRef.current.fitToCoordinates(routeCoords, {
            edgePadding: { top: 200, right: 50, bottom: 280, left: 50 },
            animated: true,
          });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [routeCoords]);

  /* ── Place selection (same as CustomerMap) ── */
  const handleLocationSelect = (data: any, details: any, type: 'origin' | 'destination') => {
    if (!details?.geometry?.location) return;
    const { lat, lng } = details.geometry.location;
    const loc = { latitude: lat, longitude: lng, title: data.description };
    if (type === 'origin') {
      setOrigin(loc);
      originAutoRef.current?.setAddressText(data.description);
      sessionTokenOrigin.current = null;
      programmaticMoveRef.current = true;
    } else {
      setDestination(loc);
      destAutoRef.current?.setAddressText(data.description);
      sessionTokenDest.current = null;
      programmaticMoveRef.current = true;
    }
    Keyboard.dismiss();
    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA }, 600);
  };

  /* ── Marker drag end → reverse geocode ── */
  const handleMarkerDragEnd = async (e: any, type: 'origin' | 'destination') => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}&language=es`,
      );
      const data = await resp.json();
      const addr = data.results?.[0]?.formatted_address || 'Ubicación seleccionada';
      const loc = { latitude, longitude, title: addr };
      if (type === 'origin') {
        setOrigin(loc);
        originAutoRef.current?.setAddressText(addr);
      } else {
        setDestination(loc);
        destAutoRef.current?.setAddressText(addr);
      }
    } catch {
      const loc = { latitude, longitude, title: 'Ubicación seleccionada' };
      if (type === 'origin') setOrigin(loc);
      else setDestination(loc);
    } finally {
      setRelocatingMarker(null); // 🆕 Clear dragging state
    }
  };
  
  // 🆕 Handle drag start - visual feedback
  const handleMarkerDragStart = (type: 'origin' | 'destination') => {
    setRelocatingMarker(type);
  };

  /* ── Center on my location ── */
  const centerOnMe = () => {
    if (!mapRef.current || !myLat) return;
    programmaticMoveRef.current = true;
    mapRef.current.animateToRegion(
      { latitude: myLat, longitude: myLng, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA },
      600,
    );
    updateOriginFromCenter(myLat, myLng);
  };

  /* ── Zoom controls ── */
  const handleZoomIn = () => {
    if (!mapRef.current) return;
    programmaticMoveRef.current = true;
    mapRef.current.getCamera().then((cam: any) => {
      const zoom = cam.zoom ?? 15;
      const next = Math.min(MAP_MAX_ZOOM, zoom + 1);
      mapRef.current?.animateCamera({ zoom: next, center: cam.center }, { duration: 300 });
    });
  };

  const handleZoomOut = () => {
    if (!mapRef.current) return;
    programmaticMoveRef.current = true;
    mapRef.current.getCamera().then((cam: any) => {
      const zoom = cam.zoom ?? 15;
      const next = Math.max(MAP_MIN_ZOOM, zoom - 1);
      mapRef.current?.animateCamera({ zoom: next, center: cam.center }, { duration: 300 });
    });
  };

  const handleMapRegionChange = useCallback(() => {
    setMapDragging(true);
  }, []);

  const handleMapRegionChangeComplete = useCallback((region: { latitude: number; longitude: number }) => {
    setMapDragging(false);
    if (programmaticMoveRef.current) {
      programmaticMoveRef.current = false;
      return;
    }
    if (!hasMyLocation && !params.origin) return;
    updateOriginFromCenter(region.latitude, region.longitude);
  }, [hasMyLocation, params.origin, updateOriginFromCenter]);

  const mapStyle = getGoogleMapStyle(mapTheme);


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
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/bookings_v2_mobile`, {
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

  /* ── Google Places styles ── */
  const gpStyles = {
    container: { flex: 0, zIndex: 1000, backgroundColor: 'transparent' },
    textInputContainer: { backgroundColor: 'transparent' },
    textInput: {
      height: 50, fontSize: 15, fontWeight: '500' as const,
      color: '#FFF', backgroundColor: 'rgba(10,46,61,0.85)',
      borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(0,229,255,0.38)',
      // Izquierda para el punto; derecha simétrica. Evita textAlign center:
      // en Android el caret queda pegado a la derecha con placeholder vacío.
      paddingLeft: 36, paddingRight: 36, paddingVertical: 10,
      textAlign: 'left' as const,
    },
    listView: {
      backgroundColor: 'rgba(5,26,38,0.98)', borderRadius: 14,
      borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)',
      marginTop: 4,
      maxHeight: keyboardHeight > 0
        ? Math.max(140, Math.min(250, Dimensions.get('window').height - keyboardHeight - 300))
        : 250,
      marginHorizontal: 0,
      elevation: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    row: { backgroundColor: 'rgba(10,46,61,0.6)', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,229,255,0.1)' },
    separator: { display: 'none' as const },
    description: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500' as const },
    poweredContainer: { display: 'none' as const },
  };

  /* ══════════════════ RENDER ══════════════════ */
  return (
    <View style={st.root}>
      {/* Header solo en detalles; en mapa el back flota sobre el mapa */}
      {step === 'details' && (
        <View style={[st.header, { paddingTop: topPad }]}>
          <TouchableOpacity
            style={st.backBtn}
            onPress={() => (!params.origin ? setStep('map') : nav.goBack())}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Detalles de Reserva</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      {/* ════ STEP 1: MAP ════ */}
      {step === 'map' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          {/* Map */}
          <View style={st.mapContainer}>
            <MapView
              key={`reservation-map-${mapTheme}`}
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              customMapStyle={mapStyle}
              showsUserLocation
              showsMyLocationButton={false}
              showsCompass={false}
              rotateEnabled
              initialRegion={{ latitude: myLat, longitude: myLng, latitudeDelta: MAP_REGION_DELTA, longitudeDelta: MAP_REGION_DELTA }}
              zoomControlEnabled={false}
              loadingEnabled
              loadingIndicatorColor="#00E5FF"
              onPress={handleMapPress}
              onRegionChange={handleMapRegionChange}
              onRegionChangeComplete={handleMapRegionChangeComplete}
            >
              {destination && relocatingMarker !== 'destination' && (
                <Marker
                  coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
                  title="🚩 Destino"
                  description={destination.title}
                  draggable
                  onPress={handleDestinationPress}
                  onDragStart={() => handleMarkerDragStart('destination')}
                  onDragEnd={e => handleMarkerDragEnd(e, 'destination')}
                >
                  <View style={{
                    backgroundColor: '#E91E63',
                    borderRadius: 50,
                    padding: 8,
                    borderWidth: 3,
                    borderColor: '#FFFFFF',
                    shadowColor: '#E91E63',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.7,
                    shadowRadius: 8,
                    elevation: 10,
                  }}>
                    <Ionicons name="flag" size={18} color="#FFFFFF" style={{ fontWeight: '900' }} />
                  </View>
                </Marker>
              )}
              {/* 🆕 Marcador temporal mientras se reubica */}
              {relocatingMarker && tempMarkerCoord && (
                <Marker
                  coordinate={tempMarkerCoord}
                  title={relocatingMarker === 'origin' ? '✓ Nuevo Origen' : '✓ Nuevo Destino'}
                  opacity={0.9}
                >
                  <View style={{
                    backgroundColor: relocatingMarker === 'origin' ? '#00FF88' : '#FF8800',
                    borderRadius: 50,
                    padding: 8,
                    borderWidth: 2.5,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.6,
                    shadowRadius: 4,
                    elevation: 8,
                  }}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ fontWeight: '800' }} />
                  </View>
                </Marker>
              )}
              {routeCoords.length > 1 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#00E676"
                  strokeWidth={6}
                  lineJoin="round"
                  lineCap="round"
                />
              )}
            </MapView>

            {/* Pin de recogida fijo al centro — se mueve el mapa, no el icono */}
            <View pointerEvents="none" style={st.centerPinWrap}>
              <View style={st.centerPinGlow}>
                <Image
                  source={CLIENT_ORIGIN_MARKER_IMAGE}
                  style={{ width: CLIENT_ORIGIN_PIN_SIZE, height: CLIENT_ORIGIN_PIN_SIZE }}
                  resizeMode="contain"
                />
              </View>
              {mapDragging && <View style={st.centerPinDot} />}
            </View>

            {/* Degradado suave oscuro superior hasta el botón volver */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(5,26,38,0.72)', 'rgba(5,26,38,0.28)', 'rgba(5,26,38,0)']}
              locations={[0, 0.55, 1]}
              style={[st.mapTopFade, { height: topPad + 52 }]}
            />

            <TouchableOpacity
              style={[st.mapBackBtn, { top: topPad }]}
              onPress={() => nav.goBack()}
              activeOpacity={0.75}
            >
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>

            {/* Controles izquierda: tema + zoom */}
            <View style={st.leftMapControls}>
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
              <TouchableOpacity style={st.mapCtrlBtn} onPress={handleZoomIn} activeOpacity={0.8}>
                <Ionicons name="add" size={20} color="#00E5FF" />
              </TouchableOpacity>
              <TouchableOpacity style={st.mapCtrlBtn} onPress={handleZoomOut} activeOpacity={0.8}>
                <Ionicons name="remove" size={20} color="#00E5FF" />
              </TouchableOpacity>
            </View>

            {/* Controles derecha: ubicación */}
            <View style={st.rightMapControls}>
              <TouchableOpacity style={st.mapCtrlBtn} onPress={centerOnMe} activeOpacity={0.8}>
                <Ionicons name="locate" size={22} color="#00E5FF" />
              </TouchableOpacity>
            </View>

            {/* 🆕 Banner de instrucciones cuando se está reubicando */}
            {relocatingMarker === 'destination' && (
              <View style={st.relocatingBanner}>
                <Ionicons name="hand-left-outline" size={18} color="#00E5FF" />
                <Text style={st.relocatingText}>
                  Toca el mapa para ubicar el destino
                </Text>
                <TouchableOpacity onPress={() => setRelocatingMarker(null)} style={st.cancelRelocateBtn}>
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}

            {!relocatingMarker && (
              <View style={[st.mapHintWrap, { top: topPad + 4 }]} pointerEvents="none">
                <View style={st.mapHintPill}>
                  <Ionicons name="information-circle-outline" size={13} color="#00E5FF" />
                  <Text style={st.mapHintText} numberOfLines={1}>
                    {destination
                      ? 'Mueve el mapa para ajustar recogida · toca destino para reubicar'
                      : 'Mueve el mapa para elegir tu punto de recogida'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Search panel - Animated */}
          <Animated.View
            style={[
              st.searchPanel,
              {
                transform: [
                  {
                    translateY: mapKeyboardOffsetAnim,
                  },
                ],
              },
            ]}
          >
            {/* Título dentro de la tarjeta inferior */}
            <Text style={st.panelTitle}>Asigna tu ruta</Text>
            <Text style={st.panelSubtitle}>Ingresa tu dirección de destino</Text>

            {/* Origin input */}
            <View style={{ zIndex: 20 }}>
              <View style={st.inputIconWrap}><View style={[st.inputDot, { backgroundColor: '#00E676' }]} /></View>
              <GooglePlacesAutocomplete
                ref={originAutoRef}
                placeholder="¿Dónde te recogemos?"
                fetchDetails
                minLength={2}
                debounce={150}
                enablePoweredByContainer={false}
                nearbyPlacesAPI="GooglePlacesSearch"
                onPress={(data, details) => handleLocationSelect(data, details, 'origin')}
                query={{
                  key: GOOGLE_MAPS_KEY,
                  language: 'es',
                  components: 'country:co',
                  // Sesgo por ubicación: prioriza resultados cerca del usuario
                  // (radio 30 km) solo cuando el GPS real ya resolvió. Bias
                  // suave — no excluye destinos lejanos (viajes intermunicipales).
                  ...(hasMyLocation ? { location: `${myLat},${myLng}`, radius: 30000 } : {}),
                  sessiontoken: sessionTokenOrigin.current,
                }}
                styles={gpStyles}
                textInputProps={{
                  placeholderTextColor: 'rgba(255,255,255,0.4)',
                  onFocus: () => { if (!sessionTokenOrigin.current) sessionTokenOrigin.current = generateUID(); },
                  onBlur: () => { if (!origin) sessionTokenOrigin.current = null; },
                  editable: true,
                }}
              />
            </View>

            {/* Connecting dots */}
            <View style={st.connectLine}>
              <View style={st.connectDash} /><View style={st.connectDash} /><View style={st.connectDash} />
            </View>

            {/* Destination input */}
            <View style={{ zIndex: 15 }}>
              <View style={st.inputIconWrap}><View style={[st.inputDot, { backgroundColor: '#E91E63' }]} /></View>
              <GooglePlacesAutocomplete
                ref={destAutoRef}
                placeholder="¿A dónde vas?"
                fetchDetails
                minLength={2}
                debounce={150}
                enablePoweredByContainer={false}
                nearbyPlacesAPI="GooglePlacesSearch"
                onPress={(data, details) => handleLocationSelect(data, details, 'destination')}
                query={{
                  key: GOOGLE_MAPS_KEY,
                  language: 'es',
                  components: 'country:co',
                  // Mismo sesgo por ubicación que el origen (ver comentario arriba).
                  ...(hasMyLocation ? { location: `${myLat},${myLng}`, radius: 30000 } : {}),
                  sessiontoken: sessionTokenDest.current,
                }}
                styles={gpStyles}
                textInputProps={{
                  placeholderTextColor: 'rgba(255,255,255,0.4)',
                  onFocus: () => { if (!sessionTokenDest.current) sessionTokenDest.current = generateUID(); },
                  onBlur: () => { if (!destination) sessionTokenDest.current = null; },
                  editable: true,
                }}
              />
            </View>

            {/* Favorite places chips */}
            {favoritePlaces.length > 0 && (
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

            {/* Route summary chips */}
            {calculating && (
              <View style={st.routeSummary}>
                <ActivityIndicator size="small" color="#00E5FF" />
                <Text style={st.routeSummaryTxt}>Calculando ruta...</Text>
              </View>
            )}
            {!calculating && distance > 0 && (
              <View style={st.routeSummary}>
                <View style={st.routeChip}><Ionicons name="speedometer-outline" size={14} color="#00E5FF" /><Text style={st.routeChipTxt}>{distance.toFixed(1)} km</Text></View>
                <View style={st.routeChip}><Ionicons name="time-outline" size={14} color="#00E5FF" /><Text style={st.routeChipTxt}>{Math.round(duration)} min</Text></View>
              </View>
            )}

            {/* Continue button */}
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
        </KeyboardAvoidingView>
      )}

      {/* ════ STEP 2: DETAILS ════ */}
      {step === 'details' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          enabled={Platform.OS === 'ios'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              ref={scrollViewRef}
              style={{ flex: 1 }}
              contentContainerStyle={[st.detailsContent, { paddingBottom: insets.bottom + 200 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              bounces={false}
              overScrollMode="never"
              removeClippedSubviews={true}
              scrollEventThrottle={16}
              decelerationRate="fast"
              nestedScrollEnabled={false}
            >
          {/* Route summary card */}
          <Animatable.View animation="fadeInUp" duration={250} delay={0} useNativeDriver>
            <View style={st.routeCard}>
              <TouchableOpacity style={st.routeCardRow} onPress={() => !params.origin && setStep('map')} activeOpacity={!params.origin ? 0.7 : 1}>
                <View style={[st.routeCardDot, { backgroundColor: '#00E676' }]} />
                <Text style={st.routeCardAddr} numberOfLines={1}>{origin?.title}</Text>
                {!params.origin && <Ionicons name="create-outline" size={14} color="#00E5FF" style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
              <View style={st.routeCardLine} />
              <TouchableOpacity style={st.routeCardRow} onPress={() => setStep('map')} activeOpacity={0.7}>
                <View style={[st.routeCardDot, { backgroundColor: '#E91E63' }]} />
                <Text style={st.routeCardAddr} numberOfLines={1}>{destination?.title}</Text>
                <Ionicons name="create-outline" size={14} color="#00E5FF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              <View style={st.routeCardMeta}>
                <Text style={st.routeCardMetaTxt}>{distance.toFixed(1)} km</Text>
                <Text style={st.routeCardMetaTxt}>•</Text>
                <Text style={st.routeCardMetaTxt}>{Math.round(duration)} min</Text>
              </View>
            </View>
          </Animatable.View>

          {/* Service type */}
          <Animatable.View animation="fadeInUp" duration={250} delay={0} useNativeDriver>
            <Text style={st.label}>Tipo de Servicio</Text>
            <View style={st.tripRow}>
              <TouchableOpacity
                style={[st.tripBtn, serviceType === 'immediate' && st.tripBtnActive]}
                onPress={() => setServiceType('immediate')}
                activeOpacity={0.8}
              >
                <Ionicons name="flash" size={20} color={serviceType === 'immediate' ? '#051A26' : 'rgba(255,255,255,0.6)'} />
                <Text style={[st.tripTxt, serviceType === 'immediate' && st.tripTxtActive]}>Inmediato</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.tripBtn, serviceType === 'reservation' && st.tripBtnActive]}
                onPress={() => setServiceType('reservation')}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar" size={20} color={serviceType === 'reservation' ? '#051A26' : 'rgba(255,255,255,0.6)'} />
                <Text style={[st.tripTxt, serviceType === 'reservation' && st.tripTxtActive]}>Programado</Text>
              </TouchableOpacity>
            </View>
            {serviceType === 'reservation' && (
              <TouchableOpacity
                style={st.datePickerBtn}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={18} color="#00E5FF" />
                <Text style={st.datePickerTxt}>
                  {scheduledDate
                    ? scheduledDate.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Seleccionar fecha y hora'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
          </Animatable.View>

          {/* Vehicle type */}
          <Animatable.View animation="fadeInUp" duration={250} delay={0} useNativeDriver>
            <Text style={st.label}>Tipo de Vehículo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.vehicleRow}>
              {vehicleTypes.map(v => (
                <TouchableOpacity
                  key={v.key}
                  style={[st.vehicleBtn, carType === v.key && st.vehicleBtnActive]}
                  onPress={() => setCarType(v.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={v.icon} size={24} color={carType === v.key ? '#051A26' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[st.vehicleTxt, carType === v.key && st.vehicleTxtActive]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animatable.View>

          {/* Trip type */}
          <Animatable.View animation="fadeInUp" duration={250} delay={20} useNativeDriver>
            <Text style={st.label}>Tipo de Recorrido</Text>
            <View style={st.tripRow}>
              {(['Ida', 'Ida y Vuelta'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[st.tripBtn, tripType === t && st.tripBtnActive]}
                  onPress={() => setTripType(t)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={t === 'Ida' ? 'arrow-forward-circle' : 'repeat'} size={20} color={tripType === t ? '#051A26' : 'rgba(255,255,255,0.6)'} />
                  <Text style={[st.tripTxt, tripType === t && st.tripTxtActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animatable.View>

          {/* Prices */}
          <Animatable.View animation="fadeInUp" duration={250} delay={80} useNativeDriver>
            <Text style={st.label}>
              Valor Estimado ⚡ (Dinámico)
            </Text>
            <View style={st.priceRow}>
              <View style={st.priceCard}>
                <Text style={st.priceLbl}>Desde</Text>
                <Text style={st.priceAmt}>$ {(driverPrice || 0).toLocaleString('es-CO')}</Text>
              </View>
              <View style={st.priceCard}>
                <Text style={st.priceLbl}>Hasta</Text>
                <Text style={st.priceAmt}>$ {(clientPrice || 0).toLocaleString('es-CO')}</Text>
              </View>
            </View>
          </Animatable.View>

          {/* Observations */}
          <Animatable.View animation="fadeInUp" duration={250} delay={100} useNativeDriver>
            <Text style={st.label}>Observaciones (opcional)</Text>
            <TextInput
              style={st.obsInput}
              placeholder="Instrucciones adicionales..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={observations}
              onChangeText={setObservations}
              multiline
              maxLength={500}
            />
          </Animatable.View>

          {/* Payment method selector */}
          <Animatable.View animation="fadeInUp" duration={250} delay={120} useNativeDriver>
            <Text style={st.label}>Método de Pago</Text>
            <View style={st.payMethodRow}>
              {[
                { key: 'cash' as const, label: 'Efectivo', icon: 'cash-outline' as const },
                { key: 'nequi' as const, label: 'Nequi', icon: 'phone-portrait-outline' as const },
                { key: 'daviplata' as const, label: 'Daviplata', icon: 'wallet-outline' as const },
              ].map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    st.payMethodBtn,
                    paymentMode === m.key && st.payMethodBtnActive,
                  ]}
                  onPress={() => setPaymentMode(m.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={m.icon}
                    size={20}
                    color={paymentMode === m.key ? '#051A26' : '#00E5FF'}
                  />
                  <Text
                    style={[
                      st.payMethodTxt,
                      paymentMode === m.key && st.payMethodTxtActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animatable.View>

          {/* Submit */}
          <Animatable.View animation="fadeInUp" duration={250} delay={140} useNativeDriver>
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
                  <Ionicons name="send" size={20} color="#051A26" />
                  <Text style={st.submitTxt}>Crear Reserva</Text>
                </>
              )}
            </TouchableOpacity>
          </Animatable.View>

          <View style={st.userRow}>
            <Ionicons name="person-circle-outline" size={16} color="rgba(255,255,255,0.35)" />
            <Text style={st.userTxt}>Reservando como: {customerName}</Text>
          </View>
              </ScrollView>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}

      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="datetime"
        minimumDate={new Date()}
        locale="es_CO"
        onConfirm={(date) => { setScheduledDate(date); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
      />

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

  mapContainer: { flex: 1, position: 'relative' },
  centerPinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -CLIENT_ORIGIN_PIN_SIZE / 2,
    marginTop: -CLIENT_ORIGIN_PIN_SIZE,
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
  },
  centerPinGlow: {
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 10,
  },
  centerPinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 6,
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
    zIndex: 30,
    elevation: 30,
  },
  rightMapControls: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    gap: 10,
    zIndex: 30,
    elevation: 30,
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
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -60,
    borderTopWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
    overflow: 'hidden',
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
    marginTop: 12,
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

  detailsContent: { paddingHorizontal: 20, paddingTop: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#00E5FF', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  routeCard: {
    padding: 16, borderRadius: 18,
    backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.14)',
  },
  routeCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeCardDot: { width: 10, height: 10, borderRadius: 5 },
  routeCardLine: { width: 2, height: 14, backgroundColor: 'rgba(255,255,255,0.12)', marginLeft: 4 },
  routeCardAddr: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  routeCardMeta: { flexDirection: 'row', gap: 6, marginTop: 12, justifyContent: 'center' },
  routeCardMetaTxt: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  editRouteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(0,229,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.15)',
  },
  editRouteTxt: { fontSize: 12, fontWeight: '600', color: '#00E5FF' },
  vehicleRow: { gap: 10, paddingVertical: 4 },
  vehicleBtn: {
    width: (SW - 70) / 4, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.15)',
  },
  vehicleBtnActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF' },
  vehicleTxt: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  vehicleTxtActive: { color: '#051A26' },
  tripRow: { flexDirection: 'row', gap: 12 },
  tripBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.15)',
  },
  tripBtnActive: { backgroundColor: '#00E5FF', borderColor: '#00E5FF' },
  tripTxt: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  tripTxtActive: { color: '#051A26' },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
  },
  infoVal: { flex: 1, fontSize: 14, fontWeight: '500', color: '#FFF' },
  priceRow: { flexDirection: 'row', gap: 12 },
  priceCard: {
    flex: 1, paddingVertical: 16, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center',
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
  },
  priceLbl: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 6 },
  priceAmt: { fontSize: 18, fontWeight: '700', color: '#00E5FF' },
  obsInput: {
    minHeight: 80, padding: 16, borderRadius: 16, fontSize: 14, color: '#FFF',
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
    textAlignVertical: 'top',
  },
  payMethodRow: {
    flexDirection: 'row', gap: 10, marginTop: 8,
  },
  payMethodBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.48)', borderWidth: 1.5, borderColor: 'rgba(0,229,255,0.18)',
  },
  payMethodBtnActive: {
    backgroundColor: '#00E5FF', borderColor: '#00E5FF',
  },
  payMethodTxt: {
    fontSize: 12, fontWeight: '600', color: '#00E5FF',
  },
  payMethodTxtActive: {
    color: '#051A26',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 24, paddingVertical: 16, borderRadius: 20, backgroundColor: '#00E5FF',
  },
  submitTxt: { fontSize: 16, fontWeight: '700', color: '#051A26' },
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 10 },
  userTxt: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)',
  },
  datePickerTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#FFF' },

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

