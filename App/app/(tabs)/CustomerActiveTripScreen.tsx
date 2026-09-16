import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Platform, ScrollView,
  ActivityIndicator, RefreshControl, Linking, Clipboard, Alert, Animated, Modal, Dimensions,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StarRating from 'react-native-star-rating-widget';
import axios from 'axios';
import Mapbox, { MapboxStyles } from '@/config/MapboxConfig';
import { getMapboxAccessToken } from '@/config/AppConfig';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { useBookingDriverPosition } from '@/hooks/useBookingDriverPosition';
import { useDriverSignalHealth, getPositionAgeSeconds } from '@/hooks/useDriverSignalHealth';
import originIcon from '../../assets/images/rsz_2red_pin.png';
import destinationIcon from '../../assets/images/green_pin.png';
import driverCarIcon from '../../assets/images/track_Car.png';
import OtpCountdownNotification from '@/components/OtpCountdownNotification';
import {
  scheduleActiveTripNotification,
  cancelActiveTripNotification,
  stopBackgroundLocationUpdatesAsync,
  isActiveTripStatus,
  notifyTripStateChange,
} from '@/common/services/ActiveTripNotificationService';
import { fetchAndSyncUserRating } from '@/common/utils/userRating';
import { sendPushNotification } from '@/common/actions/NotificationService';
import { haversineKm, formatDistanceAndEta, DistanceEtaState } from '@/common/services/DriverTrackingService';
import { shareTrip } from '@/common/utils/tripShare';
import { useAnimatedDriverMarker, fitPickupAndDriver, shouldRefitCamera } from '@/hooks/useAnimatedDriverMarker';
import { useChatUnreadCount } from '@/hooks/useChatUnreadCount';
import FloatingChatModal from '@/components/FloatingChatModal';
import { formatBookingFareRange } from '@/constants/fare';

const BG_IMAGE = require('../../assets/images/bg.png');

const formatDate = (ts: string) => {
  const d = new Date(ts);
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
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

// 🆕 Map color names to hex codes
const getColorCode = (colorName: string): string => {
  const colorMap: { [key: string]: string } = {
    'blanco': '#FFFFFF',
    'blanc': '#FFFFFF',
    'white': '#FFFFFF',
    'negro': '#1A1A1A',
    'noir': '#1A1A1A',
    'black': '#1A1A1A',
    'gris': '#808080',
    'grey': '#808080',
    'gray': '#808080',
    'rojo': '#E91E63',
    'rouge': '#E91E63',
    'red': '#E91E63',
    'azul': '#2196F3',
    'bleu': '#2196F3',
    'blue': '#2196F3',
    'verde': '#4CAF50',
    'vert': '#4CAF50',
    'green': '#4CAF50',
    'amarillo': '#FFEB3B',
    'jaune': '#FFEB3B',
    'yellow': '#FFEB3B',
    'naranja': '#FF9800',
    'orange': '#FF9800',
    'plata': '#C0C0C0',
    'argent': '#C0C0C0',
    'silver': '#C0C0C0',
    'marron': '#795548',
    'brun': '#795548',
    'brown': '#795548',
    'beige': '#F5F5DC',
    'dorado': '#FFD700',
    'or': '#FFD700',
    'gold': '#FFD700',
  };
  
  const normalizedColor = colorName?.toLowerCase().trim() || '';
  return colorMap[normalizedColor] || '#999999';
};

// Formatea una duración en segundos a "Xh Ym" / "Xm Ys" para el resumen de viaje.
const formatTripDuration = (totalSeconds: number | null | undefined): string => {
  const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const CustomerActiveTripScreen = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  
  const { bookingId, booking: initialBooking } = (route.params as any) || {};

  const [booking, setBooking] = useState<any>(initialBooking);
  const [loading, setLoading] = useState(!initialBooking);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null); // 🆕 Información completa del conductor
  const [tripNotificationActive, setTripNotificationActive] = useState(false);
  const previousStatusRef = useRef(booking?.status); // 🆕 Track previous status for transitions

  // 🗺️ Live driver tracking state
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeToPickup, setRouteToPickup] = useState<any>(null);
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<string | null>(null);
  const [etaEstado, setEtaEstado] = useState<DistanceEtaState | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [map3D, setMap3D] = useState(false);
  const cameraRef = useRef<any>(null);
  const fullscreenCameraRef = useRef<any>(null);
  const lastCameraFitRef = useRef<{ lat: number; lng: number; timestamp: number } | null>(null);
  const MAPBOX_ACCESS_TOKEN = getMapboxAccessToken();

  // Estados para el modal de copiar
  const [copiedModalVisible, setCopiedModalVisible] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState('');
  const fadeAnimCopy = useRef(new Animated.Value(0)).current;
  const scaleAnimCopy = useRef(new Animated.Value(0.8)).current;
  const [cancelling, setCancelling] = useState(false);

  // Modales personalizados de cancelación
  const [confirmCancelVisible, setConfirmCancelVisible] = useState(false);
  const [successCancelVisible, setSuccessCancelVisible] = useState(false);
  const [errorCancelVisible, setErrorCancelVisible] = useState(false);

  // 🧾 Resumen de fin de viaje (distancia/tiempo/valor recalculados). Se abre
  // una sola vez cuando el estado pasa a COMPLETE — `tripSummaryShownRef` evita
  // que el polling de 1s lo reabra en cada tick.
  const [tripSummaryVisible, setTripSummaryVisible] = useState(false);
  const tripSummaryShownRef = useRef(false);

  // ⭐ Calificación del conductor
  const [driverRating, setDriverRating] = useState<number>(0);
  const [driverReview, setDriverReview] = useState<string>('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const unreadChatCount = useChatUnreadCount(
    booking?.id || bookingId,
    'customer',
    !!(booking?.id || bookingId)
  );
  const [chatVisible, setChatVisible] = useState(false);
  const fadeAnimAlert = useRef(new Animated.Value(0)).current;
  const scaleAnimAlert = useRef(new Animated.Value(0.85)).current;

  const openAlertModal = useCallback((openSetter: (v: boolean) => void) => {
    fadeAnimAlert.setValue(0);
    scaleAnimAlert.setValue(0.85);
    openSetter(true);
    Animated.parallel([
      Animated.timing(fadeAnimAlert, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scaleAnimAlert, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }),
    ]).start();
  }, [fadeAnimAlert, scaleAnimAlert]);

  const closeAlertModal = useCallback((closeSetter: (v: boolean) => void, after?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnimAlert, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(scaleAnimAlert, { toValue: 0.85, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      closeSetter(false);
      if (after) after();
    });
  }, [fadeAnimAlert, scaleAnimAlert]);

  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;

  const goHome = useCallback(() => {
    // Evita volver al flujo de crear reserva (detalle → mapa → inicio).
    if (typeof nav.reset === 'function') {
      nav.reset({ index: 0, routes: [{ name: 'HomeScreen' }] });
      return;
    }
    nav.navigate('HomeScreen');
  }, [nav]);

  // 🗺️ Helper para abrir Google Maps
  const navigateWithGoogleMaps = useCallback((latitude: number, longitude: number, label: string) => {
    if (!latitude || !longitude) {
      Alert.alert('Error', 'No hay ubicación disponible para navegar');
      return;
    }

    const url = Platform.select({
      ios: `maps://maps.apple.com/?daddr=${latitude},${longitude}&q=${encodeURIComponent(label)}`,
      android: `https://maps.google.com/maps?daddr=${latitude},${longitude}&q=${encodeURIComponent(label)}`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://maps.google.com/maps?q=${latitude},${longitude}`);
      });
    }
  }, []);

  // 🗺️ Helper para abrir Waze
  const navigateWithWaze = useCallback((latitude: number, longitude: number, label: string) => {
    if (!latitude || !longitude) {
      Alert.alert('Error', 'No hay ubicación disponible para navegar');
      return;
    }

    const url = `waze://?ll=${latitude},${longitude}&navigate=yes&q=${encodeURIComponent(label)}`;

    Linking.openURL(url).catch(() => {
      Linking.openURL('https://www.waze.com/');
    });
  }, []);

  // 🗺️ Abrir Google Maps hacia el destino
  const openGoogleMapsDropoff = useCallback(() => {
    navigateWithGoogleMaps(booking?.drop_lat, booking?.drop_lng, booking?.drop_address || 'Destino');
  }, [booking?.drop_lat, booking?.drop_lng, booking?.drop_address, navigateWithGoogleMaps]);

  // 🗺️ Abrir Waze hacia el destino
  const openWazeDropoff = useCallback(() => {
    navigateWithWaze(booking?.drop_lat, booking?.drop_lng, 'Destino');
  }, [booking?.drop_lat, booking?.drop_lng, navigateWithWaze]);

  // 🧹 Función auxiliar para limpiar números (quitar +57 para mostrar)
  const cleanNumberDisplay = useCallback((number: string) => {
    if (!number) return '';
    return number.replace(/^\+57\s?/, '').trim();
  }, []);

  // 📋 Función para copiar número sin indicativo
  const handleCopyNumber = useCallback((number: string) => {
    if (!number) return;
    
    // Procesar el número: quitar +57, espacios, etc.
    const cleanNumber = number.replace(/^\+57/, '').replace(/\s/g, '').trim();
    
    // Copiar al portapapeles
    Clipboard.setString(cleanNumber);
    
    // Mostrar modal de copiado
    setCopiedNumber(cleanNumber);
    setCopiedModalVisible(true);
    
    // Animaciones de entrada
    Animated.parallel([
      Animated.timing(fadeAnimCopy, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnimCopy, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Cerrar automáticamente después de 2 segundos
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnimCopy, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimCopy, {
          toValue: 0.8,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCopiedModalVisible(false);
      });
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  // ❌ Cancelar viaje (cliente)
  const performCancelTrip = useCallback(async () => {
    if (!booking?.id) return;
    setCancelling(true);
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const now = new Date();
      const reason = 'Cliente canceló el viaje';
      const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking.id}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'CANCELLED',
          cancelled_by: 'customer',
          cancellation_time: now.toLocaleTimeString('en-GB', { hour12: false }),
          reason,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      if (booking.driver_token) {
        sendPushNotification(
          booking.driver_token,
          'Viaje cancelado por el cliente',
          `${booking.customer_name || 'El cliente'} canceló el viaje. Reserva ${booking.reference}.`,
        ).catch(() => {});
      }

      await cancelActiveTripNotification();

      openAlertModal(setSuccessCancelVisible);
    } catch (e: any) {
      console.error('❌ [CANCEL TRIP] Error:', e);
      openAlertModal(setErrorCancelVisible);
    } finally {
      setCancelling(false);
    }
  }, [booking?.id, booking?.driver_token, booking?.customer_name, booking?.reference, openAlertModal]);

  const handleCancelTrip = useCallback(() => {
    if (cancelling) return;
    openAlertModal(setConfirmCancelVisible);
  }, [cancelling, openAlertModal]);

  // ⭐ Enviar calificación del conductor
  const handleSubmitDriverRating = useCallback(async () => {
    if (!booking?.id) return;
    if (driverRating < 1) {
      Alert.alert(
        'Calificación requerida',
        'Por favor selecciona de 1 a 5 estrellas antes de enviar.',
      );
      return;
    }
    setSubmittingRating(true);
    try {
      const headers = await getSupabaseAuthHeaders(true);

      const patchUrl = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking.id}`;
      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          driver_rating: driverRating,
          review: driverReview?.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Recalcular promedio del conductor en users.rating
      if (booking.driver_id) {
        try {
          await fetchAndSyncUserRating(booking.driver_id, 'driver', { syncToProfile: true });
        } catch (avgErr) {
          console.warn('⚠️ [RATING] No se pudo actualizar promedio del conductor:', avgErr);
        }
      }

      setBooking((prev: any) => prev ? { ...prev, driver_rating: driverRating, driver_review: driverReview?.trim() || null } : prev);
    } catch (e: any) {
      console.error('❌ [RATING] Error al enviar calificación:', e);
      Alert.alert('Error', 'No se pudo enviar tu calificación. Inténtalo de nuevo.');
    } finally {
      setSubmittingRating(false);
    }
  }, [booking?.id, booking?.driver_id, driverRating, driverReview]);

  // Fetch booking details
  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;
    try {
      const headers = await getSupabaseAuthHeaders();
      // Usar select=* para obtener todos los campos disponibles - evita errores de campos inexistentes
      const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=*`;
      console.log('🔍 [FETCH BOOKING] URL:', url);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error('🔍 [FETCH BOOKING] Response not ok:', res.status);
        const errorText = await res.text();
        console.error('🔍 [FETCH BOOKING] Error:', errorText);
        return;
      }
      const data = await res.json();
      if (data?.length > 0) {
        const newBooking = data[0];
        
        // DETAILED TIMER STATE LOG
        console.log('🔍 [BOOKING RESPONSE] otp_timer_started_at field:', {
          value: newBooking.otp_timer_started_at,
          type: typeof newBooking.otp_timer_started_at,
          isNull: newBooking.otp_timer_started_at === null,
          isUndefined: newBooking.otp_timer_started_at === undefined,
        });
        
        console.log('📥 [BOOKING UPDATE] Full timer info:', {
          otp_timer_started_at: newBooking.otp_timer_started_at,
          otp: newBooking.otp,
          otp_verified: newBooking.otp_verified,
          status: newBooking.status,
        });
        
        // Log de cambios importantes
        if (booking?.status !== newBooking.status) {
          console.log(`🔄 [STATUS CAMBIÓ] ${booking?.status} → ${newBooking.status}`);
        }
        if (booking?.driver_name !== newBooking.driver_name) {
          console.log(`👤 [CONDUCTOR ASIGNADO] ${newBooking.driver_name} - ${newBooking.plate_number}`);
        }
        if (booking?.otp_timer_started_at !== newBooking.otp_timer_started_at) {
          console.log(`⏱️ [TIMER VALUE CHANGED]`, {
            from: booking?.otp_timer_started_at,
            to: newBooking.otp_timer_started_at,
          });
        }
        setBooking(newBooking);
      }
    } catch (e) {
      console.error('Error fetching booking:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId, booking?.status, booking?.driver_name, booking?.otp_timer_started_at]);

  useFocusEffect(
    useCallback(() => {
      if (bookingId) {
        fetchBooking();
      }
    }, [bookingId, fetchBooking])
  );

  // 🆕 Fetch driver info including mobile number from users table
  const fetchDriverInfo = useCallback(async () => {
    if (!booking?.driver_id) return;
    try {
      const headers = await getSupabaseAuthHeaders();
      const url = `${SUPABASE_URL}/rest/v1/users?id=eq.${booking.driver_id}&select=*`;
      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.length > 0) {
        const driver = data[0];
        setDriverInfo(driver);
        console.log('👤 [DRIVER INFO]', { mobile: driver.mobile, vehicle_number: driver.vehicle_number, vehicle_make: driver.vehicle_make });
        
        // 🆕 Fetch full vehicle info from cars (color, make, model). Try vehicle_id first, fall back to driver_id.
        try {
          const baseFields = 'color,make,model,plate';
          const carsUrl = driver.vehicle_id
            ? `${SUPABASE_URL}/rest/v1/cars?id=eq.${driver.vehicle_id}&select=${baseFields}`
            : `${SUPABASE_URL}/rest/v1/cars?driver_id=eq.${driver.id}&is_active=eq.true&select=${baseFields}&limit=1`;
          const carsRes = await fetch(carsUrl, { headers });
          if (carsRes.ok) {
            const carsData = await carsRes.json();
            if (carsData?.length > 0) {
              const car = carsData[0];
              setDriverInfo((prev: any) => ({
                ...prev,
                vehicle_color: car.color || prev?.vehicle_color,
                vehicle_make: prev?.vehicle_make || car.make,
                vehicle_model: prev?.vehicle_model || car.model,
                vehicle_number: prev?.vehicle_number || car.plate,
              }));
              console.log('🚗 [VEHICLE INFO]', car);
            }
          }
        } catch (e) {
          console.error('Error fetching vehicle info from cars:', e);
        }
      }
    } catch (e) {
      console.error('Error fetching driver info:', e);
    }
  }, [booking?.driver_id]);

  // Fetch driver info cuando cambia el driver_id
  useEffect(() => {
    if (booking?.driver_id) {
      fetchDriverInfo();
    }
  }, [booking?.driver_id, fetchDriverInfo]);

  // 🗺️ Posición en tiempo real del conductor via hook reutilizable
  const trackingActive =
    booking?.status === 'ACCEPTED' ||
    booking?.status === 'ARRIVED' ||
    booking?.status === 'STARTED';

  const { driverPosition } = useBookingDriverPosition(
    trackingActive ? booking?.id : null
  );

  const signalHealth = useDriverSignalHealth(driverPosition);

  // Sincronizar driverPosition → driverLocation (formato {latitude, longitude} para Mapbox)
  useEffect(() => {
    if (driverPosition) {
      setDriverLocation({ latitude: driverPosition.lat, longitude: driverPosition.lng });
    }
  }, [driverPosition]);

  // Smooth marker: interpolates driverLocation changes over 700 ms instead of snapping.
  const animatedCoords = useAnimatedDriverMarker(driverLocation);

  // Heading del carro: bearing entre el penúltimo y el último punto GPS real.
  // No usamos animatedCoords porque cambia 60 veces/seg y haría temblar la rotación.
  const prevDriverPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState(0);
  useEffect(() => {
    if (!driverLocation) return;
    const prev = prevDriverPosRef.current;
    if (prev) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const toDeg = (r: number) => (r * 180) / Math.PI;
      const φ1 = toRad(prev.lat);
      const φ2 = toRad(driverLocation.latitude);
      const Δλ = toRad(driverLocation.longitude - prev.lng);
      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
      const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
      const moved = Math.hypot(
        driverLocation.latitude - prev.lat,
        driverLocation.longitude - prev.lng,
      );
      // Solo actualiza heading si el conductor se movió >5m equivalentes (~5e-5 grados).
      // Sin esto, en parado el carro gira aleatoriamente por jitter del GPS.
      if (moved > 0.00005) setDriverHeading(bearing);
    }
    prevDriverPosRef.current = { lat: driverLocation.latitude, lng: driverLocation.longitude };
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  // 🗺️ Mapbox Directions: refresca cada 25 s. Destino = pickup en ACCEPTED,
  // drop en STARTED. En ARRIVED no hay ruta (el conductor está en el punto).
  // Así el polyline también acompaña al cliente durante el viaje, no solo
  // mientras espera al conductor.
  useEffect(() => {
    if (!driverLocation) return;
    if (!MAPBOX_ACCESS_TOKEN) return;

    const status = booking?.status;
    const isAccepted = status === 'ACCEPTED';
    const isStarted = status === 'STARTED';
    if (!isAccepted && !isStarted) {
      // ARRIVED u otros estados no necesitan línea — limpia la geometría previa.
      setRouteToPickup(null);
      return;
    }

    const targetLat = Number(isStarted ? booking?.drop_lat : booking?.pickup_lat);
    const targetLng = Number(isStarted ? booking?.drop_lng : booking?.pickup_lng);
    if (isNaN(targetLat) || isNaN(targetLng)) return;

    let cancelled = false;
    const fetchRoute = async () => {
      try {
        const origin = `${driverLocation.longitude},${driverLocation.latitude}`;
        const dest = `${targetLng},${targetLat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin};${dest}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const res = await axios.get(url);
        if (cancelled) return;
        const route = res.data?.routes?.[0];
        if (!route) return;
        setRouteToPickup({ type: 'Feature', geometry: route.geometry, properties: {} });
        const minutes = Math.max(1, Math.round(route.duration / 60));
        setEstimatedTime(minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`);
        const km = route.distance / 1000;
        setEstimatedDistance(km < 1 ? `${Math.round(route.distance)} m` : `${km.toFixed(1)} km`);
        setEtaEstado('NORMAL');
      } catch (e: any) {
        console.error('Mapbox Directions error:', e?.response?.data || e?.message);
        // Haversine fallback: si la API falla el cliente igual ve distancia y ETA
        if (!cancelled && driverLocation) {
          const linearKm = haversineKm(
            driverLocation.latitude, driverLocation.longitude, targetLat, targetLng
          );
          const { distanciaTexto, etaTexto, estado } = formatDistanceAndEta(linearKm);
          setEstimatedTime(etaTexto);
          setEstimatedDistance(distanciaTexto);
          setEtaEstado(estado);
        }
      }
    };

    fetchRoute();
    const id = setInterval(fetchRoute, 25000);
    return () => { cancelled = true; clearInterval(id); };
  }, [
    driverLocation,
    booking?.status,
    booking?.pickup_lat, booking?.pickup_lng,
    booking?.drop_lat, booking?.drop_lng,
    MAPBOX_ACCESS_TOKEN,
  ]);

  // 🗺️ Fit camera a driver + target activo (pickup en ACCEPTED, drop en STARTED).
  // Throttled para no llamar fitBounds en cada frame del tween (~42×/update).
  useEffect(() => {
    if (!animatedCoords) return;
    const isStarted = booking?.status === 'STARTED';
    const targetLat = Number(isStarted ? booking?.drop_lat : booking?.pickup_lat);
    const targetLng = Number(isStarted ? booking?.drop_lng : booking?.pickup_lng);
    if (isNaN(targetLat) || isNaN(targetLng)) return;

    if (!shouldRefitCamera(lastCameraFitRef.current, animatedCoords)) return;
    lastCameraFitRef.current = { lat: animatedCoords.latitude, lng: animatedCoords.longitude, timestamp: Date.now() };

    fitPickupAndDriver(cameraRef, { lat: targetLat, lng: targetLng }, animatedCoords);
  }, [
    animatedCoords,
    booking?.status,
    booking?.pickup_lat, booking?.pickup_lng,
    booking?.drop_lat, booking?.drop_lng,
  ]);

  // 🗺️ Fit fullscreen camera when opened or driver moves.
  // The 400 ms setTimeout acts as a debounce: if animatedCoords keeps changing
  // (tween in progress), the timer resets each time and only fires once it settles.
  useEffect(() => {
    if (!mapFullscreen || !fullscreenCameraRef.current) return;
    const isStarted = booking?.status === 'STARTED';
    const targetLat = Number(isStarted ? booking?.drop_lat : booking?.pickup_lat);
    const targetLng = Number(isStarted ? booking?.drop_lng : booking?.pickup_lng);
    if (isNaN(targetLat) || isNaN(targetLng)) return;
    const timer = setTimeout(() => {
      fitPickupAndDriver(
        fullscreenCameraRef,
        { lat: targetLat, lng: targetLng },
        animatedCoords ?? driverLocation,
        [120, 80, 200, 80],
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [
    mapFullscreen,
    animatedCoords,
    booking?.status,
    booking?.pickup_lat, booking?.pickup_lng,
    booking?.drop_lat, booking?.drop_lng,
  ]);

  useEffect(() => {
    const updateTripNotification = async () => {
      if (isActiveTripStatus(booking?.status)) {
        await scheduleActiveTripNotification(booking, 'customer');
        setTripNotificationActive(true);
        
        // 🆕 Notify on state change
        if (previousStatusRef.current !== booking?.status) {
          console.log(`🔔 [NOTIFICACIÓN CLIENTE] Estado cambió: ${previousStatusRef.current} → ${booking?.status}`);
          await notifyTripStateChange(booking, 'customer', previousStatusRef.current);
          previousStatusRef.current = booking?.status;
        }
      } else {
        await cancelActiveTripNotification();
        setTripNotificationActive(false);
      }
    };

    updateTripNotification();
    return () => {
      cancelActiveTripNotification();
    };
  }, [booking?.status, booking?.id]);

  // Polling para actualizaciones (cada 1 segundo para feedback visual rápido)
  useEffect(() => {
    if (!bookingId) return;

    console.log('📡 [CustomerActiveTrip] Iniciando polling cada 1 segundo');
    const pollInterval = setInterval(() => {
      console.log('🔄 [CustomerActiveTrip] Polling...');
      fetchBooking();
    }, 1000);

    return () => {
      console.log('🛑 [CustomerActiveTrip] Deteniendo polling');
      clearInterval(pollInterval);
    };
  }, [bookingId, fetchBooking]);

  // 🧾 Abrir el resumen de fin de viaje una sola vez al completarse. El
  // conductor ya persistió distancia/tiempo/valor reales vía addActualsToBooking,
  // así que el polling ya trae `distance`, `total_trip_time` y `price` frescos.
  useEffect(() => {
    if (booking?.status === 'COMPLETE' && !tripSummaryShownRef.current) {
      tripSummaryShownRef.current = true;
      openAlertModal(setTripSummaryVisible);
      // 🔔 Notificación local de cierre — igual que ACCEPTED/ARRIVED/STARTED.
      // COMPLETE no es "active trip status", así que la disparamos aquí una vez.
      notifyTripStateChange(booking, 'customer', previousStatusRef.current).catch(() => {});
    }
  }, [booking?.status, openAlertModal]);

  // ⭐ Hidratar estado local con calificación ya guardada (si existe)
  useEffect(() => {
    if (booking?.driver_rating && driverRating === 0) {
      setDriverRating(Number(booking.driver_rating));
    }
    if (booking?.driver_review && !driverReview) {
      setDriverReview(String(booking.driver_review));
    }
  }, [booking?.driver_rating, booking?.driver_review]);

  // ⏲️ Contador de OTP - Calcular localmente cada segundo
  useEffect(() => {
    if (!booking?.otp_timer_started_at) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const startTime = new Date(booking.otp_timer_started_at).getTime();
      const now = new Date().getTime();
      const elapsed = (now - startTime) / 1000;
      const remaining = Math.max(0, 180 - elapsed);
      
      console.log(`⏰ [COUNTDOWN] elapsed: ${elapsed.toFixed(1)}s, remaining: ${remaining.toFixed(1)}s`);
      setCountdown(Math.ceil(remaining));
    };

    // Update inicial
    updateCountdown();

    // Update cada 100ms para suavidad
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [booking?.otp_timer_started_at]);




  if (loading) {
    return (
      <View style={s.root}>
        <Image source={BG_IMAGE} style={s.bgImage} />
        <View style={s.bgOverlay} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#00E5FF" />
        </View>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={s.root}>
        <View style={[s.header, { paddingTop: topPad }]}>
          <TouchableOpacity style={s.backBtn} onPress={goHome}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Mi Viaje</Text>
          <View style={s.headerSpacer} />
        </View>
        <Text style={{ color: '#FFF', textAlign: 'center', marginTop: 100 }}>No se encontraron datos del viaje</Text>
      </View>
    );
  }

  // Determinar si estamos en fase de espera de 3 minutos (conductor llegó, esperando código)
  const isWaitingForCode = booking.otp_timer_started_at && !booking.otp_verified;
  console.log('⏰ [STATUS] isWaitingForCode:', isWaitingForCode, '| timer_started_at:', booking.otp_timer_started_at, '| verified:', booking.otp_verified);

  const statusText = () => {
    if (booking.status === 'PENDING' || booking.status === 'NEW') return 'Buscando conductor...';
    if (booking.status === 'ACCEPTED' && !booking.otp_timer_started_at) return 'Viaje aceptado';
    if (booking.status === 'ACCEPTED' && booking.otp_timer_started_at) return 'Conductor ha llegado';
    if (booking.status === 'ARRIVED') return 'Conductor ha llegado';
    if (booking.status === 'IN_PROGRESS' || booking.status === 'STARTED' || booking.status === 'TRIP_STARTED') return 'Viaje en progreso';
    if (booking.status === 'COMPLETE') return '¡Viaje completado!';
    return 'Estado del viaje';
  };

  const statusIcon = () => {
    if (booking.status === 'PENDING') return 'hourglass-outline';
    if (booking.status === 'ACCEPTED') return 'car-outline';
    if (booking.status === 'COMPLETE') return 'checkmark-circle';
    return 'time-outline';
  };

  const statusColor = () => {
    if (booking.status === 'COMPLETE') return '#00E676';
    if (booking.status === 'ACCEPTED') return '#00E5FF';
    if (booking.status === 'PENDING') return '#FFB300';
    return '#00E5FF';
  };

  const driverPhotoUri = (() => {
    const candidates = [
      booking?.driver_image,
      driverInfo?.profile_image,
      booking?.driver_profile_image,
    ];
    for (const c of candidates) {
      const u = String(c || '').trim();
      if (u.startsWith('http') || u.startsWith('file:') || u.startsWith('content:')) return u;
    }
    return null;
  })();

  const showDriverPanel =
    !!booking.driver_name &&
    (booking.status === 'ACCEPTED' ||
      booking.status === 'ARRIVED' ||
      booking.status === 'STARTED' ||
      booking.status === 'IN_PROGRESS' ||
      booking.status === 'TRIP_STARTED');

  const carMarkerCoords = animatedCoords || driverLocation;

  const openCustomerChat = () => {
    setChatVisible(true);
  };

  return (
    <View style={s.root}>
      <Image source={BG_IMAGE} style={s.bgImage} />
      <View style={s.bgOverlay} />

      <View style={[s.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={goHome}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mi Viaje Activo</Text>
        <TouchableOpacity
          style={s.infoBtn}
          onPress={async () => {
            const res = await shareTrip('customer', booking, user, { estimatedTime, estimatedDistance });
            if (!res.ok && res.error === 'permission') {
              console.warn('[share] location permission denied');
            }
          }}
        >
          <Ionicons name="share-social" size={22} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={s.scroll} 
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchBooking(); }}
            tintColor="#00E5FF"
            colors={['#00E5FF']}
          />
        }
      >
        {/* 🗺️ Mapa con seguimiento en vivo del conductor */}
        {(booking?.status === 'ACCEPTED' || booking?.status === 'ARRIVED' || booking?.status === 'STARTED')
          && booking?.pickup_lat != null
          && booking?.pickup_lng != null && (
          <View style={s.mapWrapper}>
            <Mapbox.MapView
              style={StyleSheet.absoluteFillObject}
              styleURL={MapboxStyles.DARK}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <Mapbox.Camera
                ref={cameraRef}
                zoomLevel={14}
                centerCoordinate={[Number(booking.pickup_lng), Number(booking.pickup_lat)]}
                animationDuration={800}
              />

              <Mapbox.PointAnnotation
                id="cat-pickup"
                coordinate={[Number(booking.pickup_lng), Number(booking.pickup_lat)]}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={{ width: 26, height: 50 }}>
                  <Image source={originIcon} style={{ width: 26, height: 50 }} />
                </View>
              </Mapbox.PointAnnotation>

              {/* Halo del punto de recogida (punta de la ruta) */}
              <Mapbox.ShapeSource
                id="cat-pickup-halo"
                shape={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'Point',
                    coordinates: [Number(booking.pickup_lng), Number(booking.pickup_lat)],
                  },
                }}
              >
                <Mapbox.CircleLayer
                  id="cat-pickup-halo-outer"
                  style={{
                    circleRadius: 22,
                    circleColor: 'rgba(0,229,255,0.18)',
                    circleStrokeWidth: 2.5,
                    circleStrokeColor: '#00E5FF',
                    circlePitchAlignment: 'map',
                  }}
                />
                <Mapbox.CircleLayer
                  id="cat-pickup-halo-core"
                  style={{
                    circleRadius: 7,
                    circleColor: '#00E5FF',
                    circleStrokeWidth: 2,
                    circleStrokeColor: '#FFFFFF',
                    circlePitchAlignment: 'map',
                  }}
                />
              </Mapbox.ShapeSource>

              {booking?.drop_lat != null && booking?.drop_lng != null && (
                <Mapbox.PointAnnotation
                  id="cat-drop"
                  coordinate={[Number(booking.drop_lng), Number(booking.drop_lat)]}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <View style={{ width: 26, height: 50 }}>
                    <Image source={destinationIcon} style={{ width: 26, height: 50 }} />
                  </View>
                </Mapbox.PointAnnotation>
              )}

              {routeToPickup && (booking?.status === 'ACCEPTED' || booking?.status === 'STARTED') && (
                <Mapbox.ShapeSource id="cat-route-source" shape={routeToPickup}>
                  <Mapbox.LineLayer
                    id="cat-route-line"
                    style={{
                      lineColor: '#00E5FF',
                      lineWidth: 5,
                      lineCap: 'round',
                      lineJoin: 'round',
                      lineOpacity: 0.85,
                    }}
                  />
                </Mapbox.ShapeSource>
              )}

              {!!carMarkerCoords && (
                <Mapbox.MarkerView
                  id="cat-driver"
                  coordinate={[carMarkerCoords.longitude, carMarkerCoords.latitude]}
                  allowOverlap
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ rotate: `${driverHeading}deg` }],
                    }}
                  >
                    <Image source={driverCarIcon} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
                  </View>
                </Mapbox.MarkerView>
              )}
            </Mapbox.MapView>

            {/* ETA pill flotante sobre el mapa */}
            {booking?.status === 'ACCEPTED' && (
              <View style={[
                s.etaPill,
                signalHealth === 'LATE' && { borderColor: 'rgba(255,179,0,0.55)' },
                signalHealth === 'LOST' && { borderColor: 'rgba(100,120,130,0.35)' },
              ]}>
                <View style={[
                  s.etaPillIcon,
                  signalHealth === 'LATE' && { backgroundColor: '#FFB300' },
                  signalHealth === 'LOST' && { backgroundColor: '#546E7A' },
                ]}>
                  {signalHealth === 'LOST'
                    ? <Ionicons name="warning-outline" size={16} color="#ECEFF1" />
                    : <FontAwesome5 name="car" size={16} color="#001824" />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    s.etaPillLabel,
                    signalHealth === 'LATE' && { color: '#FFB300' },
                    signalHealth === 'LOST' && { color: '#78909C' },
                  ]}>
                    {signalHealth === 'LOST' ? 'Ubicación no actualizada' : 'Tu conductor en camino'}
                  </Text>
                  <Text style={[
                    s.etaPillValue,
                    signalHealth === 'LOST' && { color: '#90A4AE' },
                  ]}>
                    {signalHealth === 'LOST'
                      ? estimatedTime
                        ? `ETA aprox. ${estimatedTime}${estimatedDistance ? `  ·  ${estimatedDistance}` : ''}`
                        : driverLocation
                          ? 'Calculando ruta...'
                          : 'Reintentando...'
                      : signalHealth === 'LATE'
                        ? estimatedTime
                          ? `Última ubic. hace ${Math.round(getPositionAgeSeconds(driverPosition?.createdAt ?? null) ?? 0)}s  ·  ETA aprox. ${estimatedTime}`
                          : `Última ubicación hace ${Math.round(getPositionAgeSeconds(driverPosition?.createdAt ?? null) ?? 0)}s`
                        : estimatedTime
                          ? etaEstado === 'VERY_CLOSE'
                            ? `${estimatedDistance}  ·  ${estimatedTime}`
                            : `Llega en ${estimatedTime}${estimatedDistance ? `  ·  ${estimatedDistance}` : ''}`
                          : driverLocation
                            ? 'Calculando ruta...'
                            : 'Conectando con conductor...'}
                  </Text>
                </View>
              </View>
            )}

            {/* Botón expandir mapa */}
            <TouchableOpacity style={s.mapExpandBtn} onPress={() => setMapFullscreen(true)}>
              <Ionicons name="expand" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Status compacto + OTP + valor estimado */}
        <Animatable.View animation="fadeInUp" duration={400} key={booking.status} useNativeDriver>
          <View style={[s.statusCardCompact, { borderColor: statusColor() }]}>
            <View style={s.statusTopRow}>
              <View style={[s.statusIconWrap, { backgroundColor: `${statusColor()}22`, borderColor: `${statusColor()}55` }]}>
                <Ionicons name={statusIcon()} size={18} color={statusColor()} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.statusTextCompact}>{statusText()}</Text>
                <Text style={s.referenceTextCompact}>Ref: {booking.reference}</Text>
              </View>
              {!!booking.otp && (
                <View style={s.otpInlinePill}>
                  <MaterialCommunityIcons name="lock-check" size={14} color="#00E676" />
                  <Text style={s.otpInlineCode}>{booking.otp}</Text>
                </View>
              )}
            </View>

            <View style={s.fareRowCompact}>
              <Text style={s.priceInStatusLabel}>
                {booking.status === 'COMPLETE' ? 'Valor final liquidado' : 'Valor estimado'}
              </Text>
              <Text style={s.priceInStatusAmountCompact}>
                {formatBookingFareRange(booking)}
              </Text>
            </View>

            {!!booking.otp && !booking.otp_verified && (
              <Text style={s.otpInlineHint}>
                Comparte este código con tu conductor · Tu conductor te pedirá este código
              </Text>
            )}
            {!!booking.otp && booking.otp_verified && (
              <Text style={[s.otpInlineHint, { color: '#00E676' }]}>
                Código verificado - Viaje iniciando
              </Text>
            )}
            {tripNotificationActive ? (
              <Text style={s.notificationHintCompact}>
                Notificación activa en segundo plano. Toca para volver a esta pantalla.
              </Text>
            ) : null}
          </View>
        </Animatable.View>

        {/* Cancelar viaje - solo antes de que el conductor confirme su llegada */}
        {(() => {
          const st = booking.status;
          const driverHasArrived = st === 'ARRIVED' || !!booking.otp_timer_started_at;
          const canCancel = st !== 'COMPLETE'
            && st !== 'CANCELLED'
            && st !== 'ACCEPTED'
            && st !== 'STARTED'
            && st !== 'IN_PROGRESS'
            && st !== 'TRIP_STARTED'
            && !booking.otp_verified
            && !driverHasArrived;
          if (!canCancel) return null;
          return (
            <Animatable.View animation="fadeInUp" duration={400} useNativeDriver>
              <TouchableOpacity
                style={s.cancelTripBtn}
                activeOpacity={0.85}
                onPress={handleCancelTrip}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#FF5C7A" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#FF5C7A" />
                    <Text style={s.cancelTripBtnText}>Cancelar viaje</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animatable.View>
          );
        })()}

        {/* ⭐ Calificación del Conductor - Solo cuando el viaje está completado */}
        {booking.status === 'COMPLETE' && (
          <Animatable.View animation="fadeInUp" duration={450} useNativeDriver>
            <View style={[s.card, s.ratingCard]}>
              <View style={s.ratingHeader}>
                <Ionicons name="star" size={22} color="#FFD54F" />
                <Text style={s.ratingTitle}>Califica a tu conductor</Text>
              </View>

              {booking.driver_name ? (
                <Text style={s.ratingDriverName}>{booking.driver_name}</Text>
              ) : null}

              <Text style={s.ratingSubtitle}>
                Tu opinión nos ayuda a mejorar la experiencia
              </Text>

              <View style={s.starsRow}>
                <StarRating
                  maxStars={5}
                  starSize={42}
                  color="#FFD54F"
                  emptyColor="rgba(255,255,255,0.25)"
                  rating={driverRating}
                  onChange={(r: number) => { if (!booking.driver_rating) setDriverRating(r); }}
                />
              </View>

              {!booking.driver_rating ? (
                <>
                  <TextInput
                    style={s.ratingInput}
                    placeholder="Comentario (opcional)"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    multiline
                    numberOfLines={3}
                    value={driverReview}
                    onChangeText={setDriverReview}
                    maxLength={300}
                    editable={!submittingRating}
                  />

                  <TouchableOpacity
                    style={[
                      s.ratingSubmitBtn,
                      (driverRating < 1 || submittingRating) && s.ratingSubmitBtnDisabled,
                    ]}
                    activeOpacity={0.85}
                    onPress={handleSubmitDriverRating}
                    disabled={driverRating < 1 || submittingRating}
                  >
                    {submittingRating ? (
                      <ActivityIndicator size="small" color="#001824" />
                    ) : (
                      <>
                        <Ionicons name="send" size={16} color="#001824" />
                        <Text style={s.ratingSubmitText}>
                          {driverRating < 1 ? 'Selecciona una calificación' : 'Enviar calificación'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={s.ratingHint}>
                    1 estrella = poco satisfecho · 5 estrellas = muy satisfecho
                  </Text>
                </>
              ) : (
                <View style={s.ratingThanksBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#00E676" />
                  <Text style={s.ratingThanksText}>
                    ¡Gracias por tu calificación!
                  </Text>
                </View>
              )}
            </View>
          </Animatable.View>
        )}

        {/* Route Info compacto */}
        <Animatable.View animation="fadeInUp" duration={450} delay={40} useNativeDriver>
          <View style={[s.card, s.cardCompact]}>
            <Text style={s.sectionTitleCompact}>Detalles del Viaje</Text>

            <View style={s.routeBlockCompact}>
              <View style={s.routeItemCompact}>
                <View style={[s.dot, s.dotStart]} />
                <Text style={s.addressCompact} numberOfLines={1}>{booking.pickup_address}</Text>
              </View>
              <View style={s.routeLineCompact} />
              <View style={s.routeItemCompact}>
                <View style={[s.dot, s.dotEnd]} />
                <Text style={s.addressCompact} numberOfLines={1}>{booking.drop_address}</Text>
              </View>
            </View>

            <View style={s.metaRowCompact}>
              <View style={s.metaItemCompact}>
                <Ionicons name="calendar-outline" size={13} color="#00E5FF" />
                <Text style={s.metaTextCompact}>{formatDate(booking.booking_date)}</Text>
              </View>
              <View style={s.metaItemCompact}>
                <Ionicons name="time-outline" size={13} color="#00E5FF" />
                <Text style={s.metaTextCompact}>{formatTime(booking.booking_date)}</Text>
              </View>
              <View style={s.metaItemCompact}>
                <Ionicons name="speedometer-outline" size={13} color="#00E5FF" />
                <Text style={s.metaTextCompact}>{booking.distance?.toFixed(1)} km</Text>
              </View>
            </View>
          </View>
        </Animatable.View>

        {/* Estado de Espera - Conductor ha llegado */}
        {isWaitingForCode && (
          <Animatable.View animation="fadeIn" duration={300} useNativeDriver>
            <View style={[s.card, s.cardCompact, s.waitingCard]}>
              <View style={s.waitingContentCompact}>
                <MaterialCommunityIcons name="clock-alert" size={22} color="#FFB300" />
                <View style={{ flex: 1 }}>
                  <Text style={s.waitingTitleCompact}>Conductor Esperando</Text>
                  <Text style={s.waitingSubtextCompact}>Tu conductor ha llegado al punto de recogida. Comparte tu código OTP con el conductor</Text>
                </View>
              </View>
            </View>
          </Animatable.View>
        )}

        {/* Contador de OTP - Mostrar cuando hay timer activo y tiempo restante */}
        {countdown !== null && countdown > 0 && booking.otp_timer_started_at && (
          <Animatable.View animation="fadeInUp" duration={400} useNativeDriver>
            <View style={[s.countdownCard, s.countdownCardCompact]}>
              <View style={s.countdownContentCompact}>
                <Ionicons name="timer-outline" size={22} color="#00E5FF" />
                <Text style={s.countdownTimeCompact}>
                  {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                </Text>
                <Text style={s.countdownLabelCompact}>Código en...</Text>
              </View>
            </View>
          </Animatable.View>
        )}

        {/* Driver Info — visible mientras el viaje está activo */}
        {showDriverPanel && (
          <Animatable.View animation="fadeInUp" duration={450} delay={80} useNativeDriver>
            <View style={[s.card, s.cardCompact]}>
              <Text style={s.sectionTitleCompact}>Tu Conductor</Text>

              <View style={s.driverCard}>
                {driverPhotoUri ? (
                  <Image source={{ uri: driverPhotoUri }} style={s.driverAvatar} />
                ) : (
                  <View style={s.driverAvatarFallback}>
                    <Ionicons name="person" size={18} color="#00E5FF" />
                  </View>
                )}
                <View style={s.driverInfo}>
                  <Text style={s.driverName} numberOfLines={1}>{booking.driver_name}</Text>
                  <Text style={s.driverPlate} numberOfLines={1}>
                    {cleanNumberDisplay(driverInfo?.mobile || booking.driver_contact || 'Contacto no disponible')}
                  </Text>
                </View>
                <View style={s.actionBtnsRow}>
                  <TouchableOpacity style={s.callBtn} onPress={openCustomerChat} activeOpacity={0.75}>
                    <Ionicons name="chatbubble-ellipses" size={18} color="#00E5FF" />
                    {unreadChatCount > 0 && (
                      <View style={s.chatBadge}>
                        <Text style={s.chatBadgeText}>
                          {unreadChatCount > 99 ? '99+' : String(unreadChatCount)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.callBtn}
                    onPress={() =>
                      driverInfo?.mobile &&
                      Linking.openURL(`tel:${cleanNumberDisplay(driverInfo.mobile)}`)
                    }
                    activeOpacity={0.75}
                  >
                    <Ionicons name="call" size={18} color="#00E5FF" />
                  </TouchableOpacity>
                </View>
              </View>

              {(driverInfo?.vehicle_number || driverInfo?.vehicle_make || driverInfo?.vehicle_color || booking?.car_type) && (
                <View style={s.vehicleBoxCompact}>
                  <Text style={s.vehicleBoxTitle}>Información del Vehículo</Text>
                  <View style={s.vehicleGrid}>
                    {driverInfo?.vehicle_number ? (
                      <View style={s.vehicleCell}>
                        <Text style={s.vehicleLabel}>Placa</Text>
                        <Text style={s.vehicleValuePlate}>{driverInfo.vehicle_number}</Text>
                      </View>
                    ) : null}
                    {driverInfo?.vehicle_make ? (
                      <View style={s.vehicleCell}>
                        <Text style={s.vehicleLabel}>Marca</Text>
                        <Text style={s.vehicleValue} numberOfLines={1}>
                          {driverInfo.vehicle_make}{driverInfo.vehicle_model ? ` ${driverInfo.vehicle_model}` : ''}
                        </Text>
                      </View>
                    ) : null}
                    {driverInfo?.vehicle_color ? (
                      <View style={s.vehicleCell}>
                        <Text style={s.vehicleLabel}>Color</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: getColorCode(driverInfo.vehicle_color),
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.3)',
                            }}
                          />
                          <Text style={s.vehicleValue} numberOfLines={1}>{driverInfo.vehicle_color}</Text>
                        </View>
                      </View>
                    ) : null}
                    {booking?.car_type ? (
                      <View style={s.vehicleCell}>
                        <Text style={s.vehicleLabel}>Categoría</Text>
                        <View style={s.categoryPill}>
                          <Text style={s.categoryPillText}>{String(booking.car_type)}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}

              {booking.status !== 'COMPLETE' && (
                <View style={s.navigationBtns}>
                  <TouchableOpacity
                    style={s.navBtn}
                    onPress={openGoogleMapsDropoff}
                    disabled={!booking?.drop_lat || !booking?.drop_lng}
                  >
                    <Ionicons name="location" size={14} color="#00E5FF" />
                    <Text style={s.navBtnText}>Destino Maps</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.navBtn}
                    onPress={openWazeDropoff}
                    disabled={!booking?.drop_lat || !booking?.drop_lng}
                  >
                    <Ionicons name="pin" size={14} color="#00E5FF" />
                    <Text style={s.navBtnText}>Destino Waze</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.payContactBlock}>
                {driverInfo?.mobile && (
                  <View style={s.payContactRow}>
                    <Ionicons name="call-outline" size={15} color="#00E5FF" />
                    <Text style={s.payContactPhone}>{cleanNumberDisplay(driverInfo.mobile)}</Text>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${cleanNumberDisplay(driverInfo.mobile)}`)}
                      style={{ paddingHorizontal: 6 }}
                    >
                      <Ionicons name="call" size={16} color="#00E676" />
                    </TouchableOpacity>
                  </View>
                )}

                {booking.payment_mode && (
                  <View style={s.payModeRow}>
                    <Ionicons
                      name={
                        booking.payment_mode === 'cash'
                          ? 'cash-outline'
                          : booking.payment_mode === 'nequi'
                            ? 'phone-portrait-outline'
                            : 'wallet-outline'
                      }
                      size={15}
                      color="#00E5FF"
                    />
                    <View>
                      <Text style={s.payModeLabel}>Método de Pago</Text>
                      <Text style={s.payModeValue}>
                        {booking.payment_mode === 'cash'
                          ? 'Efectivo'
                          : booking.payment_mode === 'nequi'
                            ? 'Nequi'
                            : 'Daviplata'}
                      </Text>
                    </View>
                  </View>
                )}

                {(booking.payment_mode === 'nequi' || booking.payment_mode === 'daviplata') &&
                  (driverInfo?.mobile || booking.driver_payment_number || driverInfo?.bankAccount) && (
                    <View style={s.transferBox}>
                      <Text style={s.transferLabel}>Transferir a:</Text>
                      <View style={s.transferRow}>
                        <Text style={s.transferNumber}>
                          {cleanNumberDisplay(
                            driverInfo?.mobile ||
                              booking.driver_payment_number ||
                              driverInfo?.bankAccount ||
                              'N/A'
                          )}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            const number =
                              driverInfo?.mobile ||
                              booking.driver_payment_number ||
                              driverInfo?.bankAccount;
                            if (number) handleCopyNumber(number);
                          }}
                          style={{ paddingHorizontal: 6 }}
                        >
                          <Ionicons name="copy-outline" size={16} color="#00E5FF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
              </View>
            </View>
          </Animatable.View>
        )}

        {/* OTP Countdown - Mostrar cuando timer está activo */}
        {booking.otp_timer_started_at && (
          <Animatable.View animation="fadeInUp" duration={450} delay={180} useNativeDriver>
            <OtpCountdownNotification 
              bookingId={bookingId}
              customerId={booking.customer_id || user?.id}
              visible={true}
            />
          </Animatable.View>
        )}

        {/* Verification Status */}
        {booking.otp_verified && (
          <Animatable.View animation="fadeInUp" duration={450} useNativeDriver>
            <View style={[s.card, s.verifiedCard]}>
              <Ionicons name="checkmark-circle" size={32} color="#00E676" />
              <Text style={s.verifiedText}>Viaje Verificado</Text>
              <Text style={s.verifiedSub}>Tu viaje será iniciado próximamente</Text>
            </View>
          </Animatable.View>
        )}

        {/* Información de Viaje - Durante TRIP_STARTED */}
        {(booking.status === 'IN_PROGRESS' || booking.status === 'STARTED' || booking.status === 'TRIP_STARTED') ? (
          <Animatable.View animation="fadeInUp" duration={450} useNativeDriver>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Información de tu Viaje</Text>

              {/* Teléfono del Conductor */}
              {driverInfo?.mobile && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <Ionicons name="call-outline" size={16} color="#00E5FF" style={{ marginRight: 10 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, flex: 1 }}>Conductor: {cleanNumberDisplay(driverInfo.mobile)}</Text>
                  <TouchableOpacity 
                    onPress={() => Linking.openURL(`tel:${cleanNumberDisplay(driverInfo.mobile)}`)}
                    style={{ paddingHorizontal: 8 }}
                  >
                    <Ionicons name="call" size={18} color="#00E676" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: 'rgba(0,244,245,0.2)', marginBottom: 14 }} />

              {/* Método de Pago */}
              {booking.payment_mode && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons 
                      name={booking.payment_mode === 'cash' ? 'cash-outline' : booking.payment_mode === 'nequi' ? 'phone-portrait-outline' : 'wallet-outline'} 
                      size={16} 
                      color="#00E5FF" 
                      style={{ marginRight: 10 }} 
                    />
                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>
                      {booking.payment_mode === 'cash' ? 'Pago en Efectivo' : booking.payment_mode === 'nequi' ? 'Pago por Nequi' : 'Pago por Daviplata'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Número para Transferencia (Nequi/Daviplata) */}
              {(booking.payment_mode === 'nequi' || booking.payment_mode === 'daviplata') && (driverInfo?.mobile || booking.driver_payment_number || driverInfo?.bankAccount) && (
                <View style={{ backgroundColor: 'rgba(0,244,245,0.08)', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#00E5FF' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 }}>
                    Transferir a este número:
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#00F4F5', fontSize: 16, fontWeight: '700', letterSpacing: 2 }}>
                      {driverInfo?.mobile || booking.driver_payment_number || driverInfo?.bankAccount}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => {
                        const number = driverInfo?.mobile || booking.driver_payment_number || driverInfo?.bankAccount;
                        if (number) {
                          handleCopyNumber(number);
                        }
                      }}
                      style={{ paddingHorizontal: 8 }}
                    >
                      <Ionicons name="copy-outline" size={18} color="#00E5FF" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </Animatable.View>
        ) : null}
      </ScrollView>

      {/* Modal: mapa fullscreen con 3D */}
      {booking?.pickup_lat != null && booking?.pickup_lng != null && (
        <Modal
          visible={mapFullscreen}
          animationType="slide"
          onRequestClose={() => setMapFullscreen(false)}
          statusBarTranslucent
        >
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Mapbox.MapView
              style={StyleSheet.absoluteFillObject}
              styleURL={MapboxStyles.DARK}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <Mapbox.Camera
                ref={fullscreenCameraRef}
                zoomLevel={14}
                centerCoordinate={[Number(booking.pickup_lng), Number(booking.pickup_lat)]}
                animationDuration={800}
              />

              <Mapbox.PointAnnotation
                id="fs-pickup"
                coordinate={[Number(booking.pickup_lng), Number(booking.pickup_lat)]}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={{ width: 26, height: 50 }}>
                  <Image source={originIcon} style={{ width: 26, height: 50 }} />
                </View>
              </Mapbox.PointAnnotation>

              <Mapbox.ShapeSource
                id="fs-pickup-halo"
                shape={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'Point',
                    coordinates: [Number(booking.pickup_lng), Number(booking.pickup_lat)],
                  },
                }}
              >
                <Mapbox.CircleLayer
                  id="fs-pickup-halo-outer"
                  style={{
                    circleRadius: 22,
                    circleColor: 'rgba(0,229,255,0.18)',
                    circleStrokeWidth: 2.5,
                    circleStrokeColor: '#00E5FF',
                    circlePitchAlignment: 'map',
                  }}
                />
                <Mapbox.CircleLayer
                  id="fs-pickup-halo-core"
                  style={{
                    circleRadius: 7,
                    circleColor: '#00E5FF',
                    circleStrokeWidth: 2,
                    circleStrokeColor: '#FFFFFF',
                    circlePitchAlignment: 'map',
                  }}
                />
              </Mapbox.ShapeSource>

              {booking?.drop_lat != null && booking?.drop_lng != null && (
                <Mapbox.PointAnnotation
                  id="fs-drop"
                  coordinate={[Number(booking.drop_lng), Number(booking.drop_lat)]}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <View style={{ width: 26, height: 50 }}>
                    <Image source={destinationIcon} style={{ width: 26, height: 50 }} />
                  </View>
                </Mapbox.PointAnnotation>
              )}

              {routeToPickup && (booking?.status === 'ACCEPTED' || booking?.status === 'STARTED') && (
                <Mapbox.ShapeSource id="fs-route-source" shape={routeToPickup}>
                  <Mapbox.LineLayer
                    id="fs-route-line"
                    style={{ lineColor: '#00E5FF', lineWidth: 5, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.85 }}
                  />
                </Mapbox.ShapeSource>
              )}

              {!!carMarkerCoords && (
                <Mapbox.MarkerView
                  id="fs-driver"
                  coordinate={[carMarkerCoords.longitude, carMarkerCoords.latitude]}
                  allowOverlap
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ rotate: `${driverHeading}deg` }],
                    }}
                  >
                    <Image source={driverCarIcon} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
                  </View>
                </Mapbox.MarkerView>
              )}
            </Mapbox.MapView>

            {/* Barra superior: cerrar + toggle 3D */}
            <View style={[s.fsTopBar, { paddingTop: insets.top + 8 }]}>
              <TouchableOpacity style={s.fsControlBtn} onPress={() => setMapFullscreen(false)}>
                <Ionicons name="chevron-down" size={22} color="#FFF" />
              </TouchableOpacity>

              <Text style={s.fsTitle}>Mi Viaje</Text>

              <TouchableOpacity
                style={[s.fsControlBtn, map3D && s.fsControlBtnActive]}
                onPress={() => {
                  const next = !map3D;
                  setMap3D(next);
                  fullscreenCameraRef.current?.setCamera?.({
                    pitch: next ? 60 : 0,
                    animationDuration: 700,
                    animationMode: 'easeTo',
                  });
                }}
              >
                <MaterialCommunityIcons name="rotate-3d-variant" size={18} color={map3D ? '#001824' : '#FFF'} />
                <Text style={[s.fsControlBtnLabel, map3D && { color: '#001824' }]}>3D</Text>
              </TouchableOpacity>
            </View>

            {/* ETA pill fullscreen */}
            {booking?.status === 'ACCEPTED' && (
              <View style={[
                s.etaPill,
                { bottom: insets.bottom + 24, top: undefined, left: 16, right: 16 },
                signalHealth === 'LATE' && { borderColor: 'rgba(255,179,0,0.55)' },
                signalHealth === 'LOST' && { borderColor: 'rgba(100,120,130,0.35)' },
              ]}>
                <View style={[
                  s.etaPillIcon,
                  signalHealth === 'LATE' && { backgroundColor: '#FFB300' },
                  signalHealth === 'LOST' && { backgroundColor: '#546E7A' },
                ]}>
                  {signalHealth === 'LOST'
                    ? <Ionicons name="warning-outline" size={16} color="#ECEFF1" />
                    : <FontAwesome5 name="car" size={16} color="#001824" />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    s.etaPillLabel,
                    signalHealth === 'LATE' && { color: '#FFB300' },
                    signalHealth === 'LOST' && { color: '#78909C' },
                  ]}>
                    {signalHealth === 'LOST' ? 'Ubicación no actualizada' : 'Tu conductor en camino'}
                  </Text>
                  <Text style={[
                    s.etaPillValue,
                    signalHealth === 'LOST' && { color: '#90A4AE' },
                  ]}>
                    {signalHealth === 'LOST'
                      ? estimatedTime
                        ? `ETA aprox. ${estimatedTime}${estimatedDistance ? `  ·  ${estimatedDistance}` : ''}`
                        : driverLocation
                          ? 'Calculando ruta...'
                          : 'Reintentando...'
                      : signalHealth === 'LATE'
                        ? estimatedTime
                          ? `Última ubic. hace ${Math.round(getPositionAgeSeconds(driverPosition?.createdAt ?? null) ?? 0)}s  ·  ETA aprox. ${estimatedTime}`
                          : `Última ubicación hace ${Math.round(getPositionAgeSeconds(driverPosition?.createdAt ?? null) ?? 0)}s`
                        : estimatedTime
                          ? etaEstado === 'VERY_CLOSE'
                            ? `${estimatedDistance}  ·  ${estimatedTime}`
                            : `Llega en ${estimatedTime}${estimatedDistance ? `  ·  ${estimatedDistance}` : ''}`
                          : driverLocation ? 'Calculando ruta...' : 'Conectando con conductor...'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* 🧾 Modal: resumen de fin de viaje (distancia/tiempo/valor recalculados) */}
      <Modal
        transparent
        visible={tripSummaryVisible}
        animationType="none"
        onRequestClose={() => closeAlertModal(setTripSummaryVisible)}
      >
        <View style={s.alertOverlay}>
          <Animated.View style={[s.alertCard, { opacity: fadeAnimAlert, transform: [{ scale: scaleAnimAlert }] }]}>
            <LinearGradient
              colors={['#00E5FF', '#0079FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.alertIconBadge}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={36} color="#FFF" />
            </LinearGradient>
            <Text style={s.alertTitle}>¡Viaje completado!</Text>

            <Text style={s.tripSummaryTotalLabel}>Valor final del servicio</Text>
            <Text style={s.tripSummaryTotalAmount}>
              {formatBookingFareRange(booking)}
            </Text>

            <View style={s.tripSummaryRow}>
              <View style={s.tripSummaryItem}>
                <Ionicons name="navigate" size={20} color="#0079FF" />
                <Text style={s.tripSummaryValue}>
                  {Number(booking?.distance || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} km
                </Text>
                <Text style={s.tripSummaryItemLabel}>Distancia</Text>
              </View>
              <View style={s.tripSummaryDivider} />
              <View style={s.tripSummaryItem}>
                <Ionicons name="time" size={20} color="#0079FF" />
                <Text style={s.tripSummaryValue}>{formatTripDuration(booking?.total_trip_time)}</Text>
                <Text style={s.tripSummaryItemLabel}>Tiempo</Text>
              </View>
            </View>

            <TouchableOpacity
              style={s.alertPrimaryBtnSolo}
              activeOpacity={0.85}
              onPress={() => closeAlertModal(setTripSummaryVisible)}
            >
              <LinearGradient
                colors={['#00E5FF', '#0079FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.alertPrimaryBtn}
              >
                <Text style={s.alertPrimaryText}>Entendido</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Modal de copiado personalizado */}
      <Modal
        transparent
        visible={copiedModalVisible}
        animationType="none"
        onRequestClose={() => setCopiedModalVisible(false)}
      >
        <View style={s.copiedModalOverlay}>
          <Animated.View
            style={[
              s.copiedModalContent,
              {
                opacity: fadeAnimCopy,
                transform: [{ scale: scaleAnimCopy }],
              },
            ]}
          >
            <LinearGradient
              colors={["#00E5FF", "#0079FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.copiedModalGradient}
            >
              <MaterialCommunityIcons name="check-circle" size={56} color="#FFF" style={{ marginBottom: 12 }} />
              <Text style={s.copiedModalTitle}>Número copiado</Text>
              <Text style={s.copiedModalNumber}>{copiedNumber}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* Modal: confirmar cancelación */}
      <Modal
        transparent
        visible={confirmCancelVisible}
        animationType="none"
        onRequestClose={() => closeAlertModal(setConfirmCancelVisible)}
      >
        <View style={s.alertOverlay}>
          <Animated.View style={[s.alertCard, { opacity: fadeAnimAlert, transform: [{ scale: scaleAnimAlert }] }]}>
            <LinearGradient
              colors={['#FF5C7A', '#C2185B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.alertIconBadge}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#FFF" />
            </LinearGradient>
            <Text style={s.alertTitle}>Cancelar viaje</Text>
            <Text style={s.alertMessage}>
              ¿Seguro que quieres cancelar el viaje? Se notificará al conductor.
            </Text>
            <View style={s.alertButtonRow}>
              <TouchableOpacity
                style={s.alertSecondaryBtn}
                activeOpacity={0.85}
                onPress={() => closeAlertModal(setConfirmCancelVisible)}
                disabled={cancelling}
              >
                <Text style={s.alertSecondaryText}>No, mantener</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.alertPrimaryBtnWrapper}
                activeOpacity={0.85}
                onPress={() => closeAlertModal(setConfirmCancelVisible, performCancelTrip)}
                disabled={cancelling}
              >
                <LinearGradient
                  colors={['#FF5C7A', '#C2185B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.alertPrimaryBtn}
                >
                  {cancelling ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={s.alertPrimaryText}>Sí, cancelar</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Modal: cancelación exitosa */}
      <Modal
        transparent
        visible={successCancelVisible}
        animationType="none"
        onRequestClose={() => closeAlertModal(setSuccessCancelVisible, () => nav.goBack())}
      >
        <View style={s.alertOverlay}>
          <Animated.View style={[s.alertCard, { opacity: fadeAnimAlert, transform: [{ scale: scaleAnimAlert }] }]}>
            <LinearGradient
              colors={['#00E5FF', '#0079FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.alertIconBadge}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={36} color="#FFF" />
            </LinearGradient>
            <Text style={s.alertTitle}>Viaje cancelado</Text>
            <Text style={s.alertMessage}>Tu viaje fue cancelado correctamente.</Text>
            <TouchableOpacity
              style={s.alertPrimaryBtnSolo}
              activeOpacity={0.85}
              onPress={() => closeAlertModal(setSuccessCancelVisible, () => nav.goBack())}
            >
              <LinearGradient
                colors={['#00E5FF', '#0079FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.alertPrimaryBtn}
              >
                <Text style={s.alertPrimaryText}>OK</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Modal: error al cancelar */}
      <Modal
        transparent
        visible={errorCancelVisible}
        animationType="none"
        onRequestClose={() => closeAlertModal(setErrorCancelVisible)}
      >
        <View style={s.alertOverlay}>
          <Animated.View style={[s.alertCard, { opacity: fadeAnimAlert, transform: [{ scale: scaleAnimAlert }] }]}>
            <LinearGradient
              colors={['#FF5C7A', '#C2185B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.alertIconBadge}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={36} color="#FFF" />
            </LinearGradient>
            <Text style={s.alertTitle}>Error</Text>
            <Text style={s.alertMessage}>No se pudo cancelar el viaje. Intenta de nuevo.</Text>
            <TouchableOpacity
              style={s.alertPrimaryBtnSolo}
              activeOpacity={0.85}
              onPress={() => closeAlertModal(setErrorCancelVisible)}
            >
              <LinearGradient
                colors={['#FF5C7A', '#C2185B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.alertPrimaryBtn}
              >
                <Text style={s.alertPrimaryText}>OK</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <FloatingChatModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        bookingId={booking.id}
        myRole="customer"
        myName={
          booking.customer_name ||
          [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
          'Cliente'
        }
        senderId={booking.customer || booking.customer_id || user?.id}
        otherName={booking.driver_name || 'Conductor'}
        otherPhoto={driverPhotoUri}
      />
    </View>
  );
};

export default CustomerActiveTripScreen;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,26,38,0.78)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'rgba(5,26,38,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', flex: 1, textAlign: 'center' },
  infoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14 },
  mapWrapper: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#0a1a26',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  etaPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 26, 38, 0.95)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  etaPillIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaPillLabel: { fontSize: 10, color: '#7FA3B8', fontWeight: '600' },
  etaPillValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '800', marginTop: 1 },
  statusCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(10,46,61,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  statusCardCompact: {
    borderRadius: 14,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(10,46,61,0.72)',
    borderWidth: 1.5,
  },
  statusTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  statusText: { fontSize: 18, fontWeight: '700', color: '#FFF', marginTop: 12 },
  statusTextCompact: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  referenceText: { fontSize: 12, color: '#00E5FF', marginTop: 6 },
  referenceTextCompact: { fontSize: 11, color: '#00E5FF', marginTop: 2, fontWeight: '600' },
  otpInlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,230,118,0.12)', borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.45)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  otpInlineCode: { color: '#00E676', fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  otpInlineHint: { marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 15 },
  fareRowCompact: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,229,255,0.15)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  notificationHintCompact: { marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.45)' },
  priceInStatus: {
    alignItems: 'center', marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(0,229,255,0.2)', width: '100%',
  },
  priceInStatusLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  priceInStatusAmount: {
    fontSize: 22, fontWeight: '800', color: '#00E5FF', marginTop: 4,
    letterSpacing: 0.5, textAlign: 'center',
  },
  priceInStatusAmountCompact: {
    fontSize: 15, fontWeight: '800', color: '#00E5FF', letterSpacing: 0.2,
    flexShrink: 1, textAlign: 'right',
  },
  card: {
    padding: 16, borderRadius: 18, marginBottom: 14,
    backgroundColor: 'rgba(10,46,61,0.5)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)',
  },
  cardCompact: { padding: 12, borderRadius: 14, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#00E5FF', textTransform: 'uppercase', marginBottom: 12 },
  sectionTitleCompact: {
    fontSize: 11, fontWeight: '700', color: '#00E5FF', textTransform: 'uppercase',
    marginBottom: 8, letterSpacing: 0.4,
  },
  routeBlock: { marginBottom: 10 },
  routeBlockCompact: { marginBottom: 8 },
  routeItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  routeItemCompact: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  dotStart: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#00E5FF' },
  dotEnd: { backgroundColor: '#E91E63', borderWidth: 2, borderColor: '#00E5FF' },
  address: { fontSize: 14, color: '#FFF', flex: 1 },
  addressCompact: { fontSize: 12, color: '#FFF', flex: 1 },
  routeLine: { height: 20, width: 2, backgroundColor: 'rgba(0,229,255,0.3)', marginLeft: 4, marginVertical: 2 },
  routeLineCompact: { height: 10, width: 2, backgroundColor: 'rgba(0,229,255,0.3)', marginLeft: 4, marginVertical: 1 },
  divider: { height: 1, backgroundColor: 'rgba(0,229,255,0.1)', marginVertical: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-around' },
  metaRowCompact: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  metaItem: { alignItems: 'center', gap: 6 },
  metaItemCompact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#00E5FF' },
  metaTextCompact: { fontSize: 11, color: '#00E5FF', fontWeight: '600' },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)', gap: 10,
  },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,229,255,0.12)' },
  driverAvatarFallback: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)',
  },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  driverPlate: { fontSize: 12, color: '#00E5FF', marginTop: 2 },
  driverContact: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  actionBtnsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.15)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)',
    position: 'relative',
  },
  chatBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#051A26',
  },
  chatBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', lineHeight: 11 },
  vehicleBoxCompact: {
    backgroundColor: 'rgba(0,244,245,0.08)', borderRadius: 8, padding: 10, marginTop: 10,
    borderLeftWidth: 3, borderLeftColor: '#00E5FF',
  },
  vehicleBoxTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 8, fontWeight: '600' },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehicleCell: { width: '47%', minWidth: 120 },
  vehicleLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginBottom: 2 },
  vehicleValue: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  vehicleValuePlate: { color: '#00F4F5', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  categoryPill: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(0,229,255,0.18)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.45)',
  },
  categoryPillText: { color: '#00F4F5', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  payContactBlock: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,244,245,0.15)', gap: 10,
  },
  payContactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payContactPhone: { color: '#FFF', fontSize: 13, flex: 1 },
  payModeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payModeLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  payModeValue: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  transferBox: {
    backgroundColor: 'rgba(0,244,245,0.08)', borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#00E5FF',
  },
  transferLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 6 },
  transferRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transferNumber: { color: '#00F4F5', fontSize: 15, fontWeight: '700', letterSpacing: 1.5 },
  navigationBtns: {
    flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(0,229,255,0.1)',
  },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)', gap: 6,
  },
  navBtnText: { fontSize: 12, fontWeight: '600', color: '#FFF', letterSpacing: 0.3 },
  verifiedCard: { alignItems: 'center', paddingVertical: 20 },
  verifiedText: { fontSize: 16, fontWeight: '700', color: '#00E676', marginTop: 12 },
  verifiedSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  waitingCard: {
    backgroundColor: 'rgba(255, 179, 0, 0.08)',
    borderColor: 'rgba(255, 179, 0, 0.3)',
    borderWidth: 1.5,
  },
  waitingContent: { alignItems: 'center', paddingVertical: 8 },
  waitingContentCompact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waitingTitle: {
    fontSize: 18, fontWeight: '700', color: '#FFB300', marginTop: 12, marginBottom: 6,
  },
  waitingTitleCompact: { fontSize: 13, fontWeight: '700', color: '#FFB300', marginBottom: 2 },
  waitingSubtext: {
    fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', marginBottom: 8,
  },
  waitingSubtextCompact: { fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 15 },
  waitingMessage: {
    fontSize: 12, color: 'rgba(255, 179, 0, 0.8)', textAlign: 'center',
    fontWeight: '600', letterSpacing: 0.3,
  },
  countdownCardCompact: { paddingVertical: 10 },
  countdownContentCompact: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  countdownTimeCompact: { fontSize: 22, fontWeight: '800', color: '#00E5FF' },
  countdownLabelCompact: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  ratingCard: {
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: 'rgba(255, 213, 79, 0.08)',
    borderColor: 'rgba(255, 213, 79, 0.35)',
    borderWidth: 2,
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  ratingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFD54F',
  },
  ratingDriverName: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  ratingSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 6,
  },
  ratingInput: {
    width: '100%',
    minHeight: 70,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: '#FFFFFF',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  ratingSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#FFD54F',
  },
  ratingSubmitBtnDisabled: {
    backgroundColor: 'rgba(255, 213, 79, 0.35)',
  },
  ratingSubmitText: {
    color: '#001824',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ratingHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 10,
  },
  ratingThanksBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.35)',
  },
  ratingThanksText: {
    color: '#00E676',
    fontSize: 13,
    fontWeight: '700',
  },
  countdownCard: {
    padding: 20,
    borderRadius: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(0, 229, 255, 0.06)',
    borderWidth: 2,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    alignItems: 'center',
  },
  countdownContent: {
    alignItems: 'center',
    gap: 8,
  },
  countdownTime: {
    fontSize: 56,
    fontWeight: '800',
    color: '#00E5FF',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  countdownLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  otpCodeCard: {
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderColor: 'rgba(0, 230, 118, 0.25)',
  },
  otpCodeContent: {
    alignItems: 'center',
    gap: 12,
  },
  otpCodeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00E676',
    marginTop: 4,
  },
  otpCodeSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  otpCodeDisplay: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderColor: 'rgba(0, 230, 118, 0.4)',
    marginVertical: 8,
  },
  otpCodeValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#00E676',
    letterSpacing: 8,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  otpCodeNote: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
    textAlign: 'center',
  },
  notificationHint: {
    fontSize: 12,
    color: '#B2EBF2',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  cancelTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: 'rgba(255, 92, 122, 0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 92, 122, 0.45)',
  },
  cancelTripBtnText: {
    color: '#FF5C7A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Estilos del modal de copiado
  copiedModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 17, 60, 0.7)',
  },
  copiedModalContent: {
    width: 280,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  copiedModalGradient: {
    padding: 30,
    alignItems: 'center',
  },
  copiedModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  copiedModalNumber: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    letterSpacing: 1.5,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  // Modales de cancelación (confirm / success / error)
  alertOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 26, 38, 0.85)',
    paddingHorizontal: 28,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    paddingTop: 26,
    paddingHorizontal: 22,
    paddingBottom: 20,
    backgroundColor: '#0B2535',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.18)',
    alignItems: 'center',
    elevation: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
  },
  alertIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  alertTitle: {
    color: '#FFF',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  alertMessage: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  tripSummaryTotalLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 14,
  },
  tripSummaryTotalAmount: {
    color: '#00E5FF',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  tripSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 20,
  },
  tripSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  tripSummaryDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tripSummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 6,
  },
  tripSummaryItemLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  alertButtonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  alertSecondaryBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 229, 255, 0.35)',
  },
  alertSecondaryText: {
    color: '#00E5FF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Para el boton primario cuando comparte fila con el secundario dentro de
  // alertButtonRow: ahi flex: 1 reparte el ancho disponible.
  alertPrimaryBtnWrapper: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  // Para cuando el boton es el unico y cuelga directo de alertCard. No puede
  // reutilizar alertPrimaryBtnWrapper: alertCard es una columna sin altura
  // fija, asi que ahi flex: 1 resuelve a altura 0 y el boton desaparece,
  // dejando el modal sin forma de cerrarse. Se usa width en vez de flex, igual
  // que alertButtonRow, para que el ancho no lo encoja el alignItems: center
  // del padre.
  alertPrimaryBtnSolo: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  alertPrimaryBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertPrimaryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  mapExpandBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,26,38,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.4)',
  },
  fsTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(5,26,38,0.82)',
  },
  fsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fsControlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(5,26,38,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  fsControlBtnActive: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  fsControlBtnLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
