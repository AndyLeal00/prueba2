import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  useColorScheme,
  Platform,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Animated,
} from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { Ionicons, AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useSelector } from "react-redux";
import { RootState } from "@/common/store";
import supabase from "@/config/SupabaseConfig";
import { isNearAirport } from "@/common/utils/airports";
import { API_KEY } from "@/config/AppConfig";
import * as Animatable from "react-native-animatable";
import { LinearGradient } from "expo-linear-gradient";
import CustomAlert, { AlertButton } from '@/components/CustomAlert';

const { width, height } = Dimensions.get("window");
const GOOGLE_MAPS_APIKEY_PROD = API_KEY;
const VEHICLE_OPTIONS = [
  { id: 1, image: require("@/assets/images/TREAS-E.png"), label: "T+Plus Especial", description: "Servicio Especial" },
  { id: 2, image: require("@/assets/images/TREAS-X.png"), label: "T+Plus Particular", description: "Vehiculo Particular" },
  { id: 3, image: require("@/assets/images/TREAS-Van.png"), label: "T+Plus Van", description: "Van 11 Pax" },
  { id: 4, image: require("@/assets/images/TREAS-T.png"), label: "T+Plus Taxi", description: "Taxi" },
];

// Mapeo de nombre DB → id local de VEHICLE_OPTIONS
const VEHICLE_NAME_TO_ID: Record<string, number> = {
  "T+Plus Especial": 1,
  "T+Plus Particular": 2,
  "T+Plus Van": 3,
  "T+Plus Taxi": 4,
};

type VehiclePriceCfg = {
  base: number; perKm: number; perMin: number; minFare: number;
  deltaAeropuerto: number; deltaProgramado: number;
};

// Fallback mientras carga la DB (valores del Excel)
const VEHICLE_PRICE_CONFIG_DEFAULT: Record<number, VehiclePriceCfg> = {
  1: { base: 10800, perKm: 660, perMin: 600, minFare: 19200, deltaAeropuerto: 12000, deltaProgramado: 4800 },
  2: { base: 4800,  perKm: 540, perMin: 460, minFare: 8400,  deltaAeropuerto: 12000, deltaProgramado: 4800 },
  3: { base: 30000, perKm: 390, perMin: 1400, minFare: 54000, deltaAeropuerto: 12000, deltaProgramado: 4800 },
  4: { base: 4920,  perKm: 540, perMin: 426, minFare: 8880,  deltaAeropuerto: 12000, deltaProgramado: 4800 },
};

const roundTo50 = (value: number) => {
  const remainder = value % 100;
  if (remainder > 0 && remainder <= 49) return value - remainder + 50;
  if (remainder >= 50) return value - remainder + 100;
  return value;
};

const formatCOP = (value: number) => `$ ${Math.round(value).toLocaleString("es-CO")}`;

const getMapZoomLevel = (originPoint: Location | null, destinationPoint: Location | null) => {
  if (!originPoint || !destinationPoint) return 13;

  const latDiff = Math.abs(originPoint.latitude - destinationPoint.latitude);
  const lngDiff = Math.abs(originPoint.longitude - destinationPoint.longitude);
  const maxDiff = Math.max(latDiff, lngDiff);

  if (maxDiff < 0.02) return 14.8;
  if (maxDiff < 0.05) return 13.8;
  if (maxDiff < 0.12) return 12.8;
  if (maxDiff < 0.25) return 11.8;
  return 10.8;
};

interface Location {
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
}

interface Stop {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
}

interface RecentTrip {
  id: string;
  origin_title: string;
  destination_title: string;
  created_at: string;
  distance?: number;
  duration?: number;
  origin_lat?: number;
  origin_lng?: number;
  destination_lat?: number;
  destination_lng?: number;
}

const TripPreviewScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const colorScheme = useColorScheme();
  const user = useSelector((state: RootState) => state.auth.user);
  const profile = useSelector((state: RootState) => state.auth.profile);

  // Obtener parámetros preseleccionados de la navegación
  const preselectedDestination = route.params?.preselectedDestination;
  const vehicleType = route.params?.vehicleType;

  // Estados para ubicaciones
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(preselectedDestination || null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [selectedVehicleType, setSelectedVehicleType] = useState<number | null>(vehicleType ?? null);
  const [showOriginMapPicker, setShowOriginMapPicker] = useState(false);
  const [showRouteMapModal, setShowRouteMapModal] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<"origin" | "destination">("origin");
  const [originMapRegion, setOriginMapRegion] = useState<Region>({
    latitude: 4.711,
    longitude: -74.0721,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });
  const [originMapPin, setOriginMapPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeDistance, setRouteDistance] = useState<string>("");
  const [routeDuration, setRouteDuration] = useState<string>("");
  const [routeDistanceKm, setRouteDistanceKm] = useState<number>(0);
  const [routeDurationMin, setRouteDurationMin] = useState<number>(0);
  const [vehiclePriceConfig, setVehiclePriceConfig] = useState<Record<number, VehiclePriceCfg>>(VEHICLE_PRICE_CONFIG_DEFAULT);

  // Estados para modales
  const [showStopsModal, setShowStopsModal] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info' | 'confirm'>('error');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);
  const showAlert = (type: 'success' | 'error' | 'warning' | 'info' | 'confirm', title: string, message: string, buttons?: AlertButton[]) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons || [{ text: 'OK', onPress: () => setAlertVisible(false) }]);
    setAlertVisible(true);
  };
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [stopInput, setStopInput] = useState("");

  // Refs para autocomplete
  const originRef = useRef(null);
  const destinationRef = useRef(null);
  const stopRef = useRef(null);
  const previewCameraRef = useRef<any>(null);
  const routeCameraRef = useRef<any>(null);
  const mapPickerRef = useRef<MapView>(null);

  const styles = colorScheme === "dark" ? darkStyles : lightStyles;
  const isDark = colorScheme === "dark";
  // Detección automática aeropuerto por coordenadas (Haversine + 40 aeropuertos Colombia).
  const hasAirportFee =
    !!(origin && (origin as any).latitude != null &&
       isNearAirport((origin as any).latitude, (origin as any).longitude)) ||
    !!(destination && (destination as any).latitude != null &&
       isNearAirport((destination as any).latitude, (destination as any).longitude));

  const vehiclePriceRanges = useMemo(() => {
    const stopFees = stops.length > 0 ? stops.length * 2500 : 0;

    return VEHICLE_OPTIONS.reduce((acc, vehicle) => {
      const cfg = vehiclePriceConfig[vehicle.id];
      if (!cfg) return acc;

      const airportFee = hasAirportFee ? cfg.deltaAeropuerto : 0;
      const distanceComponent = routeDistanceKm * cfg.perKm;
      const timeComponent = routeDurationMin * cfg.perMin;
      const rawEstimate = cfg.base + distanceComponent + timeComponent + airportFee + stopFees;
      const driverPrice = Math.ceil(Math.max(rawEstimate, cfg.minFare) / 100) * 100;
      // Precio cliente = conductor ÷ 0.8 (conductor recibe 80%)
      const clientPrice = Math.ceil(driverPrice / 0.8 / 100) * 100;

      acc[vehicle.id] = { min: driverPrice, max: clientPrice };
      return acc;
    }, {} as Record<number, { min: number; max: number }>);
  }, [routeDistanceKm, routeDurationMin, hasAirportFee, stops.length, vehiclePriceConfig]);

  const selectedPriceRange =
    selectedVehicleType && vehiclePriceRanges[selectedVehicleType]
      ? vehiclePriceRanges[selectedVehicleType]
      : null;
  const cheapestVehicleId = useMemo(() => {
    const entries = Object.entries(vehiclePriceRanges);
    if (!entries.length) return null;

    return Number(entries.reduce((best, current) => {
      return current[1].min < best[1].min ? current : best;
    })[0]);
  }, [vehiclePriceRanges]);
  const routeCenter = useMemo(() => {
    if (!origin || !destination) return null;

    return [
      (origin.longitude + destination.longitude) / 2,
      (origin.latitude + destination.latitude) / 2,
    ] as [number, number];
  }, [origin, destination]);
  const routeZoomLevel = useMemo(() => getMapZoomLevel(origin, destination), [origin, destination]);
  const routeGeoJSON = useMemo(() => {
    if (routeCoordinates.length > 1) {
      return {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: routeCoordinates.map((point) => [point.longitude, point.latitude]),
        },
        properties: {},
      };
    }

    if (origin && destination) {
      return {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [origin.longitude, origin.latitude],
            [destination.longitude, destination.latitude],
          ],
        },
        properties: {},
      };
    }

    return null;
  }, [routeCoordinates, origin, destination]);

  // Cargar tarifas dinámicas desde car_types en Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('car_types')
          .select('name,base_price,price_per_km,rate_per_hour,min_fare,delta_aeropuerto,delta_aeropuerto_prog')
          .eq('is_active', true);
        if (error || !data?.length) return;
        const cfg: Record<number, VehiclePriceCfg> = { ...VEHICLE_PRICE_CONFIG_DEFAULT };
        data.forEach((car: any) => {
          const id = VEHICLE_NAME_TO_ID[car.name];
          if (id) {
            cfg[id] = {
              base: parseFloat(car.base_price) || 0,
              perKm: parseFloat(car.price_per_km) || 0,
              perMin: parseFloat(car.rate_per_hour) || 0,
              minFare: parseFloat(car.min_fare) || 0,
              deltaAeropuerto: parseFloat(car.delta_aeropuerto) || 0,
              deltaProgramado: parseFloat(car.delta_aeropuerto_prog) || 0,
            };
          }
        });
        setVehiclePriceConfig(cfg);
      } catch (e) {
        console.warn('[TripPreview] Error cargando tarifas:', e);
      }
    })();
  }, []);

  // Animated glow for continue button
  const btnGlow = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(btnGlow, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(btnGlow, { toValue: 0.3, duration: 1400, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  // Cargar viajes recientes al montar
  useEffect(() => {
    fetchRecentTrips();
  }, [profile?.id, user?.id]);

  // Autollenado del punto de partida con ubicacion actual
  useEffect(() => {
    autoFillOriginFromCurrentLocation();
  }, []);

  // Obtener ruta real con Google Directions API
  useEffect(() => {
    if (origin && destination) {
      fetchDirections();
    } else {
      setRouteCoordinates([]);
      setRouteDistance("");
      setRouteDuration("");
      setRouteDistanceKm(0);
      setRouteDurationMin(0);
    }
  }, [origin, destination]);

  // Decodificar polyline encoded de Google Directions API
  const decodePolyline = (encoded: string): { latitude: number; longitude: number }[] => {
    const coordinates: { latitude: number; longitude: number }[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
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

      coordinates.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return coordinates;
  };

  // Obtener direcciones reales de Google Directions API
  const fetchDirections = async () => {
    if (!origin || !destination) return;

    try {
      const originStr = `${origin.latitude},${origin.longitude}`;
      const destinationStr = `${destination.latitude},${destination.longitude}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&key=${GOOGLE_MAPS_APIKEY_PROD}`;

      const response = await fetch(url);
      const json = await response.json();

      if (json.status === "OK" && json.routes?.length > 0) {
        const route = json.routes[0];
        const points = route.overview_polyline?.points;
        
        if (points) {
          const decodedCoordinates = decodePolyline(points);
          setRouteCoordinates(decodedCoordinates);
        }

        // Extraer distancia y duración
        if (route.legs?.length > 0) {
          const leg = route.legs[0];
          setRouteDistance(leg.distance?.text || "");
          setRouteDuration(leg.duration?.text || "");
          setRouteDistanceKm((leg.distance?.value || 0) / 1000);
          setRouteDurationMin((leg.duration?.value || 0) / 60);
        }
      } else {
        console.warn("Directions API error:", json.status, json.error_message);
        // Fallback a línea recta si falla la API
        setRouteCoordinates([
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: destination.latitude, longitude: destination.longitude },
        ]);
        setRouteDistanceKm(0);
        setRouteDurationMin(0);
      }
    } catch (error) {
      console.error("Error fetching directions:", error);
      // Fallback a línea recta
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      ]);
      setRouteDistanceKm(0);
      setRouteDurationMin(0);
    }
  };

  // Función para obtener viajes recientes de Supabase
  const fetchRecentTrips = async () => {
    const userId = user?.id || profile?.id;
    console.log("🔍 [RecentTrips] userId:", userId);
    if (!userId) {
      console.log("⚠️ [RecentTrips] No userId, abortando");
      return;
    }

    try {
      setLoading(true);

      // Leer config directamente
      const extra = require("expo-constants").default?.expoConfig?.extra || {};
      const baseUrl = extra.SUPABASE_URL;
      const anonKey = extra.SUPABASE_PUBLISHABLE_KEY || extra.SUPABASE_ANON_KEY;

      if (!baseUrl || !anonKey) {
        console.error("❌ [RecentTrips] Config no disponible");
        return;
      }

      // Leer JWT del usuario directamente de AsyncStorage (evita supabase.auth.getSession que cuelga)
      const AsyncStorageLib = require("@react-native-async-storage/async-storage").default;
      let accessToken = anonKey;
      try {
        const projectRef = extra.SUPABASE_PROJECT_REF || 'unknown-project';
        const stored = await AsyncStorageLib.getItem(`tmasplus_auth_session_${projectRef}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          const jwt = parsed?.access_token || parsed?.currentSession?.access_token;
          if (jwt) {
            accessToken = jwt;
            console.log("🔍 [RecentTrips] JWT leído de AsyncStorage OK");
          } else {
            console.log("⚠️ [RecentTrips] JWT no encontrado en sesión guardada, usando anon key");
          }
        } else {
          console.log("⚠️ [RecentTrips] Sin sesión en AsyncStorage");
        }
      } catch (e: any) {
        console.log("⚠️ [RecentTrips] Error leyendo AsyncStorage:", e?.message);
      }

      console.log("🔍 [RecentTrips] Haciendo fetch...");

      // Fetch directo a PostgREST
      const fetchUrl = `${baseUrl}/rest/v1/bookings?select=id,customer_id,pickup_location,destination_location,drop_location,pickup_address,drop_address,created_at,distance,duration,status&customer_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=5`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(fetchUrl, {
        method: "GET",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log("🔍 [RecentTrips] HTTP status:", response.status);

      if (!response.ok) {
        const errText = await response.text();
        console.error("❌ [RecentTrips] HTTP", response.status, errText.substring(0, 300));
        return;
      }

      const data = await response.json();
      console.log("🔍 [RecentTrips] Registros:", data?.length ?? 0);

      if (!data || data.length === 0) {
        console.log("⚠️ [RecentTrips] 0 resultados para customer_id:", userId);
        return;
      }

      console.log("🔍 [RecentTrips] Primer registro:", JSON.stringify(data[0]).substring(0, 400));

      const normalizedTrips: RecentTrip[] = data.map((trip: any) => {
        const pickup = typeof trip.pickup_location === "string"
          ? JSON.parse(trip.pickup_location) : trip.pickup_location;
        const dest = typeof trip.destination_location === "string"
          ? JSON.parse(trip.destination_location) : trip.destination_location;
        const drop = trip.drop_location
          ? (typeof trip.drop_location === "string" ? JSON.parse(trip.drop_location) : trip.drop_location)
          : dest;

        return {
          id: trip.id,
          origin_title: pickup?.address || "Origen",
          destination_title: (drop?.address || dest?.address) || "Destino",
          created_at: trip.created_at,
          distance: trip.distance,
          duration: trip.duration,
          origin_lat: pickup?.lat != null ? Number(pickup.lat) : undefined,
          origin_lng: pickup?.lng != null ? Number(pickup.lng) : undefined,
          destination_lat: (drop?.lat ?? dest?.lat) != null ? Number(drop?.lat ?? dest?.lat) : undefined,
          destination_lng: (drop?.lng ?? dest?.lng) != null ? Number(drop?.lng ?? dest?.lng) : undefined,
        };
      });

      console.log("✅ [RecentTrips] Viajes cargados:", normalizedTrips.length);
      setRecentTrips(normalizedTrips);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.error("❌ [RecentTrips] Timeout 8s - Supabase no responde");
      } else {
        console.error("❌ [RecentTrips] Exception:", error?.message || error);
      }
    } finally {
      setLoading(false);
    }
  };

  const getAddressLabel = async (latitude: number, longitude: number) => {
    try {
      const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
      const first = reverse?.[0];
      if (!first) return "Mi ubicacion actual";

      const composed = [
        first.name,
        first.street,
        first.district,
        first.city,
      ]
        .filter(Boolean)
        .join(", ");

      return composed || "Mi ubicacion actual";
    } catch (error) {
      return "Mi ubicacion actual";
    }
  };

  const autoFillOriginFromCurrentLocation = async () => {
    if (origin) return;

    try {
      setIsGettingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const latitude = current.coords.latitude;
      const longitude = current.coords.longitude;
      const title = await getAddressLabel(latitude, longitude);

      setOrigin({ latitude, longitude, title, description: "Ubicacion en tiempo real" });
      setOriginMapRegion({
        latitude,
        longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      setOriginMapPin({ latitude, longitude });
    } catch (error) {
      console.log("Error al obtener ubicacion actual:", error);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const openMapPicker = async (target: "origin" | "destination") => {
    setMapPickerTarget(target);

    const selectedPoint = target === "origin" ? origin : destination;
    const fallbackPoint = target === "origin" ? destination : origin;

    if (selectedPoint) {
      setOriginMapRegion({
        latitude: selectedPoint.latitude,
        longitude: selectedPoint.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      setOriginMapPin({ latitude: selectedPoint.latitude, longitude: selectedPoint.longitude });
    } else if (fallbackPoint) {
      setOriginMapRegion({
        latitude: fallbackPoint.latitude,
        longitude: fallbackPoint.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      setOriginMapPin({ latitude: fallbackPoint.latitude, longitude: fallbackPoint.longitude });
    } else {
      // Si no hay punto seleccionado, centrar en ubicación actual del usuario
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          setOriginMapRegion({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          });
        }
      } catch (error) {
        console.log("Error al obtener ubicación para el mapa:", error);
      }
    }

    setShowOriginMapPicker(true);
  };

  const centerMapOnUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert('warning', 'Permisos requeridos', 'Se necesita acceso a la ubicación para centrar el mapa.');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const region = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      };

      setOriginMapRegion(region);

      // Animar la cámara al punto si el ref está disponible
      if (mapPickerRef.current) {
        mapPickerRef.current.animateToRegion(region, 500);
      }
    } catch (error) {
      console.log("Error al centrar mapa en ubicación actual:", error);
      showAlert('error', 'Error', 'No se pudo obtener tu ubicación actual');
    }
  };

  const confirmMapSelection = async () => {
    if (!originMapPin) {
      showAlert('info', 'Selecciona un punto', mapPickerTarget === 'origin' ? 'Toca el mapa para definir el punto de partida.' : 'Toca el mapa para definir el destino.');
      return;
    }

    const title = await getAddressLabel(originMapPin.latitude, originMapPin.longitude);
    const payload = {
      latitude: originMapPin.latitude,
      longitude: originMapPin.longitude,
      title,
      description: "Seleccionado en mapa",
    };

    if (mapPickerTarget === "origin") {
      setOrigin(payload);
    } else {
      setDestination(payload);
    }

    setShowOriginMapPicker(false);
  };

  // Manejar selección de ubicación
  const handleLocationSelect = (
    data: any,
    details: any,
    type: "origin" | "destination" | "stop"
  ) => {
    if (!details?.geometry?.location) {
      showAlert('error', 'No se pudo leer la ubicacion', 'Intenta seleccionar otra sugerencia.');
      return;
    }

    const { lat, lng } = details.geometry.location;
    const location = {
      latitude: lat,
      longitude: lng,
      title: data.description,
    };

    if (type === "origin") {
      setOrigin(location);
    } else if (type === "destination") {
      setDestination(location);
    } else if (type === "stop") {
      if (selectedStopIndex !== null) {
        const newStops = [...stops];
        newStops[selectedStopIndex] = {
          ...location,
          id: `stop_${selectedStopIndex}`,
        };
        setStops(newStops);
        setShowStopsModal(false);
        setStopInput("");
      }
    }
  };

  // Agregar nueva parada
  const handleAddStop = () => {
    if (stops.length < 2) {
      setStops([...stops, { id: `stop_${stops.length}`, latitude: 0, longitude: 0, title: "" }]);
    }
  };

  // Eliminar parada
  const handleRemoveStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  // Ir a viaje reciente
  const handleRecentTripSelect = async (trip: RecentTrip) => {
    // Obtener coordenadas del viaje reciente si es necesario
    navigation.getParent()?.navigate("BookingS", {
      origin: {
        title: trip.origin_title,
        latitude: trip.origin_lat ?? 0,
        longitude: trip.origin_lng ?? 0,
      },
      destination: {
        title: trip.destination_title,
        latitude: trip.destination_lat ?? 0,
        longitude: trip.destination_lng ?? 0,
      },
      type: null,
    });
  };

  // Validar y continuar
  const handleContinue = () => {
    if (!origin || !destination) {
      showAlert("warning", "Faltan datos", "Por favor selecciona origen y destino");
      return;
    }

    if (!selectedVehicleType) {
      showAlert("warning", "Selecciona vehículo", "Elige un tipo de vehículo para continuar");
      return;
    }

    // Preparar stops para pasar a BookingScreen
    const stopsData = stops.filter((stop) => stop.title); // Solo incluir paradas con ubicación seleccionada

    navigation.getParent()?.navigate("BookingS", {
      origin,
      destination,
      stops: stopsData.length > 0 ? stopsData : undefined,
      type: selectedVehicleType ?? null,
      estimatedMinFare: selectedPriceRange?.min,
      estimatedMaxFare: selectedPriceRange?.max,
    });
  };

  // Renderizar parada
  const renderStop = (stop: Stop, index: number) => (
    <View key={stop.id} style={styles.stopContainer}>
      <View style={styles.stopHeader}>
        <Text style={styles.stopLabel}>Parada {index + 1}</Text>
        <TouchableOpacity onPress={() => handleRemoveStop(index)}>
          <Ionicons name="close-circle" size={20} color="#E91E63" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.stopInput}
        onPress={() => {
          setSelectedStopIndex(index);
          setShowStopsModal(true);
        }}
      >
        <AntDesign name="plus" size={20} color="#00E5FF" />
        <Text style={styles.stopInputText}>
          {stop.title || `Selecciona parada ${index + 1}`}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Renderizar viaje reciente
  const renderRecentTrip = (trip: RecentTrip, index: number) => {
    const tripDate = new Date(trip.created_at);
    const now = new Date();
    const diffTime = Math.abs(Number(now) - Number(tripDate));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let timeText = "Hace poco";
    if (diffDays === 1) timeText = "Ayer";
    else if (diffDays < 7) timeText = `Hace ${diffDays} días`;
    else if (diffDays < 30) timeText = `Hace ${Math.floor(diffDays / 7)} semanas`;
    else timeText = `Hace ${Math.floor(diffDays / 30)} meses`;

    return (
      <Animatable.View
        key={trip.id}
        animation="fadeInUp"
        duration={500}
        delay={index * 70}
        useNativeDriver
      >
        <TouchableOpacity
          style={styles.recentTripCard}
          onPress={() => handleRecentTripSelect(trip)}
        >
          <View style={styles.tripIconContainer}>
            <Ionicons name="location" size={16} color="#00E5FF" />
          </View>
          <View style={styles.tripInfoContainer}>
            <Text style={styles.tripOrigin} numberOfLines={1}>
              {trip.origin_title}
            </Text>
            <View style={styles.tripArrow}>
              <View style={styles.arrowLine} />
              <Ionicons name="arrow-forward" size={12} color={colorScheme === "dark" ? "rgba(0,229,255,0.4)" : "#90A4AE"} />
              <View style={styles.arrowLine} />
            </View>
            <Text style={styles.tripDestination} numberOfLines={1}>
              {trip.destination_title}
            </Text>
          </View>
          <Text style={styles.tripTime}>{timeText}</Text>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderSuggestionRow = (data: any) => {
    const mainText = data?.structured_formatting?.main_text || data?.description || "Ubicacion";
    const secondaryText = data?.structured_formatting?.secondary_text || "Seleccionar direccion";

    return (
      <View style={styles.suggestionRow}>
        <View style={styles.suggestionIconWrap}>
          <Ionicons name="location-outline" size={16} color="#00E5FF" />
        </View>
        <View style={styles.suggestionTextWrap}>
          <Text style={styles.suggestionMainText} numberOfLines={1}>
            {mainText}
          </Text>
          <Text style={styles.suggestionSecondaryText} numberOfLines={1}>
            {secondaryText}
          </Text>
        </View>
        <Ionicons name="arrow-forward-circle-outline" size={18} color="#00E5FF" />
      </View>
    );
  };

  const getVehicleEtaLabel = (vehicleId: number) => {
    const baseMinutes = Math.max(Math.round(routeDurationMin || 0), 8);
    const offsets: Record<number, number> = {
      1: 4,
      2: 1,
      3: 6,
      4: 0,
    };
    return `${baseMinutes + (offsets[vehicleId] || 0)} min`;
  };

  const getVehicleBadge = (vehicleId: number) => {
    if (vehicleId === cheapestVehicleId) return "Mas economico";
    if (vehicleId === 2) return "Popular";
    if (vehicleId === 3) return "Mas amplio";
    if (vehicleId === 1) return "Premium";
    return null;
  };
  const selectedVehicleEta = selectedVehicleType ? getVehicleEtaLabel(selectedVehicleType) : null;
  const selectedVehicleBadge = selectedVehicleType ? getVehicleBadge(selectedVehicleType) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90} style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#020E18" : "#E8F8FE"} />
      <FlatList
        data={[{ id: "trip-preview-content" }]}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.screenContentContainer}
        renderItem={() => (
          <>
            {/* Header with gradient */}
            <LinearGradient
              colors={isDark ? ["#020E18", "#051A26", "#0A2436"] : ["#E8F8FE", "#F0FBFF", "#F5F9FB"]}
              style={styles.headerGradient}
            >
              <Animatable.View animation="slideInDown" duration={400} style={styles.header}>
                <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.goBack()}>
                  <Ionicons name="arrow-back" size={22} color={isDark ? "#00E5FF" : "#051A26"} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                  <Text style={styles.headerTitle}>¿A dónde vas?</Text>
                  <Text style={styles.headerSubtitle}>Configura tu viaje</Text>
                </View>
                <View style={{ width: 40 }} />
              </Animatable.View>
            </LinearGradient>

            {/* Main Content */}
            <Animatable.View animation="fadeIn" duration={500} style={styles.contentContainer}>
          {/* Origin Input */}
          <Animatable.View animation="fadeInUp" duration={450} delay={100} useNativeDriver>
            <View style={[styles.inputSection, styles.glassCard, { zIndex: 30 }]}> 
              <View style={styles.sectionLabelRow}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionLabel}>Punto de partida</Text>
              </View>
              {origin ? (
                <TouchableOpacity
                  style={[styles.selectedLocation, { backgroundColor: colorScheme === "dark" ? "rgba(0,229,255,0.06)" : "rgba(0,229,255,0.06)" }]}
                  onPress={() => setOrigin(null)}
                >
                  <Ionicons name="location-sharp" size={20} color="#00E5FF" />
                  <Text style={styles.selectedLocationText}>{origin.title}</Text>
                  <Ionicons name="close" size={16} color={colorScheme === "dark" ? "rgba(255,255,255,0.4)" : "#90A4AE"} />
                </TouchableOpacity>
              ) : (
                <View style={styles.originInputRow}>
                  <View style={styles.originAutocompleteWrap}>
                    <GooglePlacesAutocomplete
                      ref={originRef}
                      enablePoweredByContainer={false}
                      placeholder="Donde estas..."
                      minLength={3}
                      debounce={400}
                      keyboardShouldPersistTaps="always"
                      fetchDetails
                      onPress={(data, details) => handleLocationSelect(data, details, "origin")}
                      renderRow={renderSuggestionRow}
                      query={{
                        key: GOOGLE_MAPS_APIKEY_PROD,
                        language: "es",
                        components: "country:co",
                      }}
                      styles={autoCompleteStyles(colorScheme)}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.locationIconButton}
                    onPress={autoFillOriginFromCurrentLocation}
                    disabled={isGettingLocation}
                  >
                    {isGettingLocation ? (
                      <ActivityIndicator size="small" color="#00E5FF" />
                    ) : (
                      <Ionicons name="locate" size={20} color="#00E5FF" />
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.originActionsRow}>
                <TouchableOpacity
                  style={styles.originActionButton}
                  onPress={autoFillOriginFromCurrentLocation}
                  disabled={isGettingLocation}
                >
                  <Ionicons name="radio" size={16} color="#00E5FF" />
                  <Text style={styles.originActionText}>Ubicacion en tiempo real</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.originActionButton} onPress={() => openMapPicker("origin")}>
                  <Ionicons name="map" size={16} color="#00E5FF" />
                  <Text style={styles.originActionText}>Elegir en mapa</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.recentTripsInlineSection}>
                <View style={styles.sectionLabelRow}>
                  <Ionicons name="time-outline" size={14} color="#00E5FF" />
                  <Text style={styles.sectionLabel}>Viajes recientes</Text>
                </View>
                {loading ? (
                  <ActivityIndicator size="large" color="#00E5FF" />
                ) : recentTrips.length > 0 ? (
                  recentTrips.map((item, index) => renderRecentTrip(item, index))
                ) : (
                  <Text style={styles.noTripsText}>No hay viajes recientes</Text>
                )}
              </View>
            </View>
          </Animatable.View>

          {/* Destination Input */}
          <Animatable.View animation="fadeInUp" duration={450} delay={150} useNativeDriver>
            <View style={[styles.inputSection, styles.glassCard, { zIndex: 20 }]}> 
              <View style={styles.sectionLabelRow}>
                <View style={[styles.sectionDot, { backgroundColor: "#E91E63" }]} />
                <Text style={styles.sectionLabel}>Destino</Text>
              </View>
              {destination ? (
                <TouchableOpacity
                  style={[styles.selectedLocation, { backgroundColor: colorScheme === "dark" ? "rgba(255,107,107,0.06)" : "rgba(255,107,107,0.06)" }]}
                  onPress={() => setDestination(null)}
                >
                  <Ionicons name="location-sharp" size={20} color="#E91E63" />
                  <Text style={styles.selectedLocationText}>{destination.title}</Text>
                  <Ionicons name="close" size={16} color={colorScheme === "dark" ? "rgba(255,255,255,0.4)" : "#90A4AE"} />
                </TouchableOpacity>
              ) : (
                <GooglePlacesAutocomplete
                  ref={destinationRef}
                  enablePoweredByContainer={false}
                  placeholder="Hacia dónde quieres ir..."
                  minLength={3}
                  debounce={400}
                  keyboardShouldPersistTaps="always"
                  fetchDetails
                  onPress={(data, details) => handleLocationSelect(data, details, "destination")}
                  renderRow={renderSuggestionRow}
                  query={{
                    key: GOOGLE_MAPS_APIKEY_PROD,
                    language: "es",
                    components: "country:co",
                  }}
                  styles={autoCompleteStyles(colorScheme)}
                />
              )}
            </View>
          </Animatable.View>

          {/* Stops */}
          {stops.length > 0 && (
            <Animatable.View animation="fadeInUp" duration={450} delay={200} useNativeDriver>
              <View style={[styles.stopsSection, styles.glassCard]}>
                <Text style={styles.sectionLabel}>Paradas adicionales</Text>
                {stops.map((stop, index) => renderStop(stop, index))}
              </View>
            </Animatable.View>
          )}

          {/* Auto Map Preview */}
          {origin && destination && (
            <Animatable.View animation="fadeInUp" duration={500} delay={220} useNativeDriver>
              <View style={[styles.mapPreviewSection, styles.glassCard]}>
                <View style={styles.mapPreviewHeader}>
                  <View>
                    <Text style={styles.sectionLabel}>Vista del mapa</Text>
                    <Text style={styles.mapPreviewHint}>Ruta precargada automaticamente</Text>
                  </View>
                  {routeDistance && routeDuration && (
                    <View style={styles.routeInfo}>
                      <View style={styles.routeInfoItem}>
                        <Ionicons name="resize-outline" size={14} color="#00E5FF" />
                        <Text style={styles.routeInfoText}>{routeDistance}</Text>
                      </View>
                      <View style={styles.routeInfoItem}>
                        <Ionicons name="time-outline" size={14} color="#00E5FF" />
                        <Text style={styles.routeInfoText}>{routeDuration}</Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.mapPreview}>
                  <MapView
                    style={{ width: width - 68, height: 200 }}
                    provider={PROVIDER_GOOGLE}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    region={origin && destination ? {
                      latitude: (origin.latitude + destination.latitude) / 2,
                      longitude: (origin.longitude + destination.longitude) / 2,
                      latitudeDelta: Math.max(Math.abs(origin.latitude - destination.latitude) * 1.6, 0.025),
                      longitudeDelta: Math.max(Math.abs(origin.longitude - destination.longitude) * 1.6, 0.025),
                    } : {
                      latitude: origin?.latitude ?? 4.711,
                      longitude: origin?.longitude ?? -74.0721,
                      latitudeDelta: 0.04,
                      longitudeDelta: 0.04,
                    }}
                  >
                    <Marker
                      coordinate={{ latitude: origin.latitude, longitude: origin.longitude }}
                      pinColor="#00E5FF"
                    />
                    <Marker
                      coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
                      pinColor="#E91E63"
                    />
                    {routeCoordinates.length > 0 && (
                      <Polyline
                        coordinates={routeCoordinates}
                        strokeColor="#00E5FF"
                        strokeWidth={5}
                        geodesic
                      />
                    )}
                  </MapView>
                </View>

                <View style={styles.quickEditRow}>
                  <TouchableOpacity style={styles.quickEditButton} onPress={() => openMapPicker("origin")}>
                    <Ionicons name="create-outline" size={16} color="#00E5FF" />
                    <Text style={styles.quickEditButtonText}>Cambiar partida</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.quickEditButton} onPress={() => openMapPicker("destination")}>
                    <Ionicons name="create-outline" size={16} color="#00E5FF" />
                    <Text style={styles.quickEditButtonText}>Cambiar destino</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.routeButton} onPress={() => setShowRouteMapModal(true)}>
                  <Ionicons name="navigate" size={17} color={colorScheme === "dark" ? "#00E5FF" : "#051A26"} />
                  <Text style={styles.routeButtonText}>Ver mi recorrido</Text>
                </TouchableOpacity>
              </View>
            </Animatable.View>
          )}

          {/* Add Stop Button */}
          {stops.length < 2 && (
            <Animatable.View animation="fadeInUp" duration={450} delay={250} useNativeDriver>
              <TouchableOpacity style={styles.addStopButton} onPress={handleAddStop}>
                <Ionicons name="add-circle" size={20} color="#00E5FF" />
                <Text style={styles.addStopText}>Añadir parada adicional ({stops.length}/2)</Text>
              </TouchableOpacity>
            </Animatable.View>
          )}

          {/* Vehicle Types Section */}
          {origin && destination && (
            <Animatable.View animation="fadeInUp" duration={450} delay={310} useNativeDriver>
              <View style={[styles.vehicleTypesSection, styles.glassCard]}>
                <Text style={styles.sectionLabel}>Selecciona tipo de vehiculo</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.vehicleTypesScroll}
                >
                  {VEHICLE_OPTIONS.map((vehicle, index) => {
                    const isSelected = selectedVehicleType === vehicle.id;
                    return (
                      <Animatable.View
                        key={vehicle.id}
                        animation="fadeInUp"
                        duration={500}
                        delay={310 + index * 70}
                        useNativeDriver
                      >
                        <TouchableOpacity
                          style={[
                            styles.vehicleButton,
                            isSelected && styles.vehicleButtonSelected,
                          ]}
                          onPress={() => setSelectedVehicleType(vehicle.id)}
                        >
                          <Image
                            source={vehicle.image}
                            style={{ width: 50, height: 50 }}
                            resizeMode="contain"
                          />
                          <Text style={styles.vehicleButtonText}>{vehicle.label}</Text>
                          <Text style={styles.vehicleDescription}>{vehicle.description}</Text>
                          <Text style={styles.vehicleEtaText}>{getVehicleEtaLabel(vehicle.id)}</Text>
                          <Text style={styles.vehiclePriceRangeText}>
                            {formatCOP(vehiclePriceRanges[vehicle.id]?.min || 0)} - {formatCOP(vehiclePriceRanges[vehicle.id]?.max || 0)}
                          </Text>
                          {getVehicleBadge(vehicle.id) && (
                            <View style={styles.vehicleBadge}>
                              <Text style={styles.vehicleBadgeText}>{getVehicleBadge(vehicle.id)}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animatable.View>
                    );
                  })}
                </ScrollView>

                {selectedPriceRange && (
                  <View style={styles.selectedFareCard}>
                    <Text style={styles.selectedFareLabel}>Rango estimado</Text>
                    <Text style={styles.selectedFareValue}>
                      {formatCOP(selectedPriceRange.min)} - {formatCOP(selectedPriceRange.max)}
                    </Text>
                    <View style={styles.selectedFareMetaRow}>
                      <View style={styles.selectedFarePill}>
                        <Ionicons name="time-outline" size={13} color="#00E5FF" />
                        <Text style={styles.selectedFarePillText}>{selectedVehicleEta}</Text>
                      </View>
                      {selectedVehicleBadge && (
                        <View style={styles.selectedFarePill}>
                          <Ionicons name="flash-outline" size={13} color="#00E5FF" />
                          <Text style={styles.selectedFarePillText}>{selectedVehicleBadge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.selectedFareHint}>Puedes cambiar el tipo de vehículo en cualquier momento.</Text>
                  </View>
                )}
              </View>
            </Animatable.View>
          )}

          {/* Continue Button */}
          <Animatable.View animation="fadeInUp" duration={450} delay={330} useNativeDriver>
            <Animated.View style={{ shadowColor: "#00E5FF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: btnGlow, shadowRadius: 16, elevation: 10 }}>
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  { opacity: origin && destination && selectedVehicleType ? 1 : 0.4 },
                ]}
                onPress={handleContinue}
                disabled={!origin || !destination || !selectedVehicleType}
              >
                <LinearGradient
                  colors={["#00E5FF", "#00B8D4"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.continueGradient}
                >
                  <MaterialCommunityIcons name="rocket-launch" size={22} color="#051A26" />
                  <Text style={styles.continueButtonText}>Iniciar viaje</Text>
                  <Ionicons name="arrow-forward" size={20} color="#051A26" />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </Animatable.View>
            </Animatable.View>
          </>
        )}
      />

      {/* Modal for Stop Selection */}
      <Modal visible={showStopsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colorScheme === "dark" ? "#0A2436" : "#F5F9FB" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Parada {selectedStopIndex !== null ? selectedStopIndex + 1 : ""}</Text>
              <TouchableOpacity onPress={() => setShowStopsModal(false)}>
                <Ionicons name="close" size={24} color={colorScheme === "dark" ? "#FFFFFF" : "#051A26"} />
              </TouchableOpacity>
            </View>

            <GooglePlacesAutocomplete
              ref={stopRef}
              enablePoweredByContainer={false}
              placeholder="Buscar ubicación..."
              minLength={3}
              debounce={400}
              keyboardShouldPersistTaps="always"
              fetchDetails
              onPress={(data, details) => handleLocationSelect(data, details, "stop")}
              renderRow={renderSuggestionRow}
              query={{
                key: GOOGLE_MAPS_APIKEY_PROD,
                language: "es",
                components: "country:co",
              }}
              styles={autoCompleteStyles(colorScheme)}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showOriginMapPicker} animationType="slide">
        <View style={styles.mapPickerContainer}>
          <View style={styles.mapPickerHeader}>
            <TouchableOpacity onPress={() => setShowOriginMapPicker(false)}>
              <Ionicons name="close" size={24} color={colorScheme === "dark" ? "#FFFFFF" : "#051A26"} />
            </TouchableOpacity>
            <Text style={styles.mapPickerTitle}>
              {mapPickerTarget === "origin" ? "Selecciona punto de partida" : "Selecciona destino"}
            </Text>
            <TouchableOpacity onPress={confirmMapSelection}>
              <Text style={styles.mapPickerConfirm}>Confirmar</Text>
            </TouchableOpacity>
          </View>

          <MapView
            ref={mapPickerRef}
            style={styles.mapPickerMap}
            initialRegion={originMapRegion}
            showsUserLocation={true}
            showsMyLocationButton={false}
            followsUserLocation={false}
            onPress={(event) => {
              const coordinate = event.nativeEvent.coordinate;
              setOriginMapPin({
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
              });
            }}
            onRegionChangeComplete={(region) => setOriginMapRegion(region)}
          >
            {originMapPin && <Marker coordinate={originMapPin} />}
          </MapView>

          <TouchableOpacity style={styles.myLocationButton} onPress={centerMapOnUserLocation}>
            <Ionicons name="locate" size={24} color="#00E5FF" />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={showRouteMapModal} animationType="slide">
        <View style={styles.mapPickerContainer}>
          <View style={styles.mapPickerHeader}>
            <TouchableOpacity onPress={() => setShowRouteMapModal(false)}>
              <Ionicons name="close" size={24} color={colorScheme === "dark" ? "#FFFFFF" : "#051A26"} />
            </TouchableOpacity>
            <Text style={styles.mapPickerTitle}>Tu recorrido</Text>
            <View style={{ width: 55 }} />
          </View>

          {origin && destination && (
            <MapView
              style={styles.mapPickerMap}
              provider={PROVIDER_GOOGLE}
              showsUserLocation={false}
              showsMyLocationButton={false}
              region={{
                latitude: (origin.latitude + destination.latitude) / 2,
                longitude: (origin.longitude + destination.longitude) / 2,
                latitudeDelta: Math.max(Math.abs(origin.latitude - destination.latitude) * 1.6, 0.025),
                longitudeDelta: Math.max(Math.abs(origin.longitude - destination.longitude) * 1.6, 0.025),
              }}
            >
              <Marker coordinate={{ latitude: origin.latitude, longitude: origin.longitude }} pinColor="#00E5FF" />
              <Marker coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} pinColor="#E91E63" />
              {routeCoordinates.length > 0 && (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor="#00E5FF"
                  strokeWidth={5}
                  geodesic
                />
              )}
            </MapView>
          )}
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
    </KeyboardAvoidingView>
  );
};

// Auto-complete styles based on color scheme
const autoCompleteStyles = (colorScheme: string | null | undefined) =>
  StyleSheet.create({
    container: {
      flex: 0,
    },
    textInput: {
      backgroundColor: colorScheme === "dark" ? "rgba(8, 38, 56, 0.8)" : "rgba(255, 255, 255, 0.92)",
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: colorScheme === "dark" ? "#FFFFFF" : "#051A26",
      borderWidth: 1,
      borderColor: colorScheme === "dark" ? "rgba(0, 229, 255, 0.2)" : "rgba(0, 229, 255, 0.25)",
    },
    listView: {
      backgroundColor: colorScheme === "dark" ? "rgba(8, 38, 56, 0.95)" : "rgba(255, 255, 255, 0.98)",
      borderRadius: 14,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colorScheme === "dark" ? "rgba(0, 229, 255, 0.18)" : "rgba(0, 229, 255, 0.2)",
      shadowColor: "#00E5FF",
      shadowOpacity: colorScheme === "dark" ? 0.12 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    row: {
      backgroundColor: "transparent",
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    description: {
      color: colorScheme === "dark" ? "rgba(255,255,255,0.7)" : "#37474F",
    },
    separator: {
      height: 0,
    },
  });

// Light Styles
const lightStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E8F8FE",
  },
  screenContentContainer: {
    paddingBottom: 40,
  },
  headerGradient: {
    paddingTop: Platform.OS === "ios" ? 50 : StatusBar.currentHeight ?? 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingBottom: 18,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#051A26",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#00838F",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.22)",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#00B8D4",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  inputSection: {
    marginBottom: 14,
  },
  originInputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  originAutocompleteWrap: {
    flex: 1,
  },
  locationIconButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    backgroundColor: "#F5F9FB",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.35)",
    shadowColor: "#00B8D4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  originActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
    marginTop: 14,
  },
  originActionButton: {
    flexGrow: 1,
    flexBasis: "48%",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.3)",
    backgroundColor: "rgba(0, 229, 255, 0.06)",
  },
  originActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00838F",
    marginLeft: 8,
    flexShrink: 1,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00E5FF",
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#051A26",
    letterSpacing: 0.3,
  },
  selectedLocation: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(0, 229, 255, 0.06)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.25)",
  },
  selectedLocationText: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 14,
    color: "#051A26",
    fontWeight: "600",
  },
  stopsSection: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 229, 255, 0.1)",
  },
  stopContainer: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: "#F5F9FB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.15)",
  },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stopLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#546E7A",
  },
  stopInput: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F5F9FB",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.35)",
  },
  stopInputText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#00838F",
    fontWeight: "500",
  },
  addStopButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
    backgroundColor: "rgba(0, 229, 255, 0.04)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.25)",
    borderStyle: "dashed",
  },
  addStopText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#00838F",
  },
  continueButton: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 24,
  },
  continueGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 18,
    gap: 10,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#051A26",
    letterSpacing: 0.5,
  },
  recentTripsSection: {
    marginTop: 20,
  },
  recentTripsInlineSection: {
    marginTop: 16,
  },
  recentTripCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginVertical: 5,
    backgroundColor: "#F5F9FB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.15)",
    borderLeftWidth: 4,
    borderLeftColor: "#00E5FF",
    shadowColor: "#00B8D4",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tripIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  tripInfoContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  tripOrigin: {
    fontSize: 13,
    fontWeight: "700",
    color: "#051A26",
  },
  tripArrow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  arrowLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: "rgba(0, 229, 255, 0.25)",
  },
  tripDestination: {
    fontSize: 12,
    fontWeight: "500",
    color: "#546E7A",
  },
  tripTime: {
    fontSize: 11,
    color: "#00838F",
    fontWeight: "600",
  },
  vehicleTypesSection: {
    marginVertical: 24,
  },
  vehicleTypesScroll: {
    marginTop: 12,
  },
  vehicleButton: {
    alignItems: "center",
    marginRight: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#F5F9FB",
    borderWidth: 2,
    borderColor: "rgba(0, 229, 255, 0.15)",
    shadowColor: "#00B8D4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  vehicleButtonSelected: {
    borderColor: "#00E5FF",
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    shadowOpacity: 0.15,
    elevation: 4,
  },
  vehicleButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#051A26",
    marginTop: 8,
  },
  vehicleDescription: {
    fontSize: 11,
    color: "#546E7A",
    marginTop: 4,
  },
  vehicleEtaText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#051A26",
  },
  vehiclePriceRangeText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#00838F",
  },
  vehicleBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0, 229, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.25)",
  },
  vehicleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#00838F",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedFareCard: {
    marginTop: 14,
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectedFareLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00838F",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedFareValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: "#051A26",
  },
  selectedFareHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#546E7A",
  },
  selectedFareMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  selectedFarePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(5, 26, 38, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.14)",
  },
  selectedFarePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#051A26",
  },
  mapboxOriginMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#00E676",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  mapboxDestinationMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E91E63",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  noTripsText: {
    fontSize: 14,
    color: "#90A4AE",
    textAlign: "center",
    paddingVertical: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(5, 26, 38, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 22,
    maxHeight: "80%",
    backgroundColor: "#F5F9FB",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  suggestionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  suggestionTextWrap: {
    flex: 1,
    marginHorizontal: 10,
  },
  suggestionMainText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#051A26",
  },
  suggestionSecondaryText: {
    marginTop: 2,
    fontSize: 11,
    color: "#546E7A",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#051A26",
  },
  mapPickerContainer: {
    flex: 1,
    backgroundColor: "#F5F9FB",
  },
  mapPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 229, 255, 0.15)",
  },
  mapPickerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#051A26",
  },
  mapPickerConfirm: {
    fontSize: 15,
    fontWeight: "800",
    color: "#00838F",
  },
  mapPickerMap: {
    flex: 1,
  },
  myLocationButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F5F9FB",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00B8D4",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  mapPreviewSection: {
    marginBottom: 16,
  },
  mapPreviewHeader: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  routeInfo: {
    gap: 6,
  },
  routeInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  routeInfoText: {
    fontSize: 12,
    color: "#00838F",
    fontWeight: "700",
  },
  mapPreviewHint: {
    fontSize: 12,
    color: "#546E7A",
    fontWeight: "500",
  },
  mapPreview: {
    width: "100%",
    height: 200,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.15)",
    alignItems: "center",
  },
  quickEditRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  quickEditButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.3)",
    borderRadius: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(0, 229, 255, 0.04)",
  },
  quickEditButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#00838F",
  },
  routeButton: {
    marginTop: 12,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.3)",
    backgroundColor: "rgba(0, 229, 255, 0.06)",
  },
  routeButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#051A26",
  },
});

// Dark Styles
const darkStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020E18",
  },
  screenContentContainer: {
    paddingBottom: 40,
  },
  headerGradient: {
    paddingTop: Platform.OS === "ios" ? 50 : StatusBar.currentHeight ?? 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingBottom: 18,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.25)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(0, 229, 255, 0.6)",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  glassCard: {
    backgroundColor: "rgba(8, 38, 56, 0.75)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.15)",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  inputSection: {
    marginBottom: 14,
  },
  originInputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  originAutocompleteWrap: {
    flex: 1,
  },
  locationIconButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    backgroundColor: "rgba(0, 229, 255, 0.06)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.3)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  originActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
    marginTop: 14,
  },
  originActionButton: {
    flexGrow: 1,
    flexBasis: "48%",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.2)",
    backgroundColor: "rgba(0, 229, 255, 0.04)",
  },
  originActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00E5FF",
    marginLeft: 8,
    flexShrink: 1,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00E5FF",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  selectedLocation: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(0, 229, 255, 0.06)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  selectedLocationText: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  stopsSection: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 229, 255, 0.08)",
  },
  stopContainer: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: "rgba(8, 38, 56, 0.6)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.1)",
  },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stopLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
  },
  stopInput: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(2, 14, 24, 0.9)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.3)",
  },
  stopInputText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#00E5FF",
    fontWeight: "500",
  },
  addStopButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
    backgroundColor: "rgba(0, 229, 255, 0.03)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.18)",
    borderStyle: "dashed",
  },
  addStopText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#00E5FF",
  },
  continueButton: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 24,
  },
  continueGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 18,
    gap: 10,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#051A26",
    letterSpacing: 0.5,
  },
  recentTripsSection: {
    marginTop: 20,
  },
  recentTripsInlineSection: {
    marginTop: 16,
  },
  recentTripCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginVertical: 5,
    backgroundColor: "rgba(0, 229, 255, 0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.1)",
    borderLeftWidth: 4,
    borderLeftColor: "#00E5FF",
  },
  tripIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.15)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  tripInfoContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  tripOrigin: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tripArrow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  arrowLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: "rgba(0, 229, 255, 0.12)",
  },
  tripDestination: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
  },
  tripTime: {
    fontSize: 11,
    color: "rgba(0, 229, 255, 0.55)",
    fontWeight: "600",
  },
  vehicleTypesSection: {
    marginVertical: 24,
  },
  vehicleTypesScroll: {
    marginTop: 12,
  },
  vehicleButton: {
    alignItems: "center",
    marginRight: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "rgba(8, 38, 56, 0.7)",
    borderWidth: 2,
    borderColor: "rgba(0, 229, 255, 0.1)",
  },
  vehicleButtonSelected: {
    borderColor: "#00E5FF",
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  vehicleButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 8,
  },
  vehicleDescription: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 4,
  },
  vehicleEtaText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  vehiclePriceRangeText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#00E5FF",
  },
  vehicleBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0, 229, 255, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.20)",
  },
  vehicleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#00E5FF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedFareCard: {
    marginTop: 14,
    backgroundColor: "rgba(0, 229, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectedFareLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(0, 229, 255, 0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedFareValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  selectedFareHint: {
    marginTop: 4,
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
  },
  selectedFareMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  selectedFarePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.14)",
  },
  selectedFarePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  mapboxOriginMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#00E676",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  mapboxDestinationMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E91E63",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  noTripsText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    paddingVertical: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(1, 6, 10, 0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 22,
    maxHeight: "80%",
    backgroundColor: "#0A2436",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  suggestionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.15)",
  },
  suggestionTextWrap: {
    flex: 1,
    marginHorizontal: 10,
  },
  suggestionMainText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  suggestionSecondaryText: {
    marginTop: 2,
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  mapPickerContainer: {
    flex: 1,
    backgroundColor: "#020E18",
  },
  mapPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 229, 255, 0.1)",
    backgroundColor: "rgba(5, 26, 38, 0.95)",
  },
  mapPickerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  mapPickerConfirm: {
    fontSize: 15,
    fontWeight: "800",
    color: "#00E5FF",
  },
  mapPickerMap: {
    flex: 1,
  },
  myLocationButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(8, 38, 56, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.25)",
  },
  mapPreviewSection: {
    marginBottom: 16,
  },
  mapPreviewHeader: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  routeInfo: {
    gap: 6,
  },
  routeInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  routeInfoText: {
    fontSize: 12,
    color: "rgba(0, 229, 255, 0.7)",
    fontWeight: "700",
  },
  mapPreviewHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "500",
  },
  mapPreview: {
    width: "100%",
    height: 200,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.12)",
    alignItems: "center",
  },
  quickEditRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  quickEditButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.2)",
    borderRadius: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(0, 229, 255, 0.03)",
  },
  quickEditButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#00E5FF",
  },
  routeButton: {
    marginTop: 12,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "rgba(0, 229, 255, 0.2)",
    backgroundColor: "rgba(0, 229, 255, 0.06)",
  },
  routeButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#00E5FF",
  },
});

export default TripPreviewScreen;

