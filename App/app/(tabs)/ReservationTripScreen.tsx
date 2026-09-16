import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image, Linking, Platform, Dimensions, Modal, TextInput,
} from 'react-native';
import * as Animatable from 'react-native-animatable';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import supabase from '@/config/SupabaseConfig';
import { activeTripBookings } from '@/hooks/useDriverCancellationWatcher';
import { GOOGLE_MAPS_DARK_STYLE } from '@/config/googleMapsDarkStyle';
import { API_KEY, getMapboxAccessToken } from '@/config/AppConfig';
import { DRIVER_LOCATION_PUCK_IMAGE } from '@/components/DriverMapLocationMarker';
import { updateDriverNotification, showDriverActiveNotification } from '@/hooks/DriverNotificationService';
import DriverOtpVerificationModal from '@/components/DriverOtpVerificationModal';
import { useDriverTracking } from '@/hooks/useDriverTracking';
import { OtpService } from '@/common/services/OtpService';
import { useOtpTimer } from '@/hooks/useOtpTimer';
// import AgoraCallModal from '@/components/AgoraCallModal'; // COMENTADO PARA EXPO GO
// import { useAgoraCall } from '@/hooks/useAgoraCall'; // COMENTADO PARA EXPO GO
import { notifyIncomingCall } from '@/common/services/NotificationService';
import { shareTrip } from '@/common/utils/tripShare';
import { addActualsToBooking } from '@/common/other/sharedFunctions';
import { formatBookingFareRange } from '@/constants/fare';
import { fetchAndSyncUserRating } from '@/common/utils/userRating';
import StarRating from 'react-native-star-rating-widget';

const NEQUI_LOGO_URI = 'https://img.logo.dev/nequi.com.co?token=pk_c_F6FSsGSaKey4lkmcDLNw';
const DAVIPLATA_LOGO_URI = 'https://img.logo.dev/daviplata.com?token=pk_c_F6FSsGSaKey4lkmcDLNw';
const ROUTE_LINE_BLUE = '#00E5FF';
const TIP_BASE_ZOOM = 17;

/** Halo de precisión del conductor (metros), escala con zoom. */
const accuracyHaloForZoom = (baseMeters: number, zoom: number) => {
  const levelsOut = Math.max(0, TIP_BASE_ZOOM - zoom);
  const levelsIn = Math.max(0, zoom - TIP_BASE_ZOOM);
  const scaled = Math.min(baseMeters, 28) * Math.pow(1.35, levelsOut) / Math.pow(1.55, levelsIn);
  return Math.min(Math.max(scaled, 6), 60);
};

/** Puntas inicio/fin: misma lógica dinámica del halo de navegar, tamaño medio. */
const tipRadiusForZoom = (zoom: number) => {
  const levelsOut = Math.max(0, TIP_BASE_ZOOM - zoom);
  const levelsIn = Math.max(0, zoom - TIP_BASE_ZOOM);
  const scaled = 10 * Math.pow(1.35, levelsOut) / Math.pow(1.55, levelsIn);
  return Math.min(Math.max(scaled, 6), 26);
};

const { width, height } = Dimensions.get('window');
const BG_IMAGE = require('../../assets/images/bg.png');
const MAPBOX_TOKEN = getMapboxAccessToken();

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

// Phase: NAVIGATING_TO_PICKUP → ARRIVED_AT_PICKUP → TRIP_STARTED → TRIP_COMPLETE
type TripPhase = 'NAVIGATING_TO_PICKUP' | 'ARRIVED_AT_PICKUP' | 'TRIP_STARTED' | 'TRIP_COMPLETE';

const formatTime = (ts: string) => {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
};

const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const decodePolyline = (encoded: string): { latitude: number; longitude: number }[] => {
  const coords: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
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

const ReservationTripScreen = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const user = useSelector((s: RootState) => s.auth.user) as any;

  const reservation = (route.params as any)?.reservation;
  
  // Debug logging
  console.log('🗺️ [ReservationTripScreen] Route params:', {
    hasReservation: !!reservation,
    reservationId: reservation?.id,
    pickupLat: reservation?.pickup_lat,
    pickupLng: reservation?.pickup_lng,
    dropLat: reservation?.drop_lat,
    dropLng: reservation?.drop_lng,
    pickupAddress: reservation?.pickup_address,
    dropAddress: reservation?.drop_address,
  });

  if (!reservation) {
    return (
      <View style={s.root}>
        <Text style={{ color: '#FFF', textAlign: 'center', marginTop: 100 }}>❌ Sin datos de reserva</Text>
        <Text style={{ color: '#999', textAlign: 'center', marginTop: 20, fontSize: 12 }}>
          Debug: No se recibieron parámetros
        </Text>
      </View>
    );
  }

  const pickupLat = reservation.pickup_lat || (reservation.pickup?.lat);
  const pickupLng = reservation.pickup_lng || (reservation.pickup?.lng);
  const dropLat = reservation.drop_lat || (reservation.drop?.lat);
  const dropLng = reservation.drop_lng || (reservation.drop?.lng);

  if (!pickupLat || !pickupLng || !dropLat || !dropLng) {
    return (
      <View style={s.root}>
        <Text style={{ color: '#FFF', textAlign: 'center', marginTop: 100 }}>❌ Coordenadas incompletas</Text>
        <Text style={{ color: '#999', textAlign: 'center', marginTop: 20, fontSize: 12 }}>
          Pickup: {pickupLat}, {pickupLng} | Drop: {dropLat}, {dropLng}
        </Text>
      </View>
    );
  }

  const [phase, setPhase] = useState<TripPhase>(() => {
    if (reservation.status === 'STARTED') return 'TRIP_STARTED';
    if (reservation.status === 'ARRIVED') return 'ARRIVED_AT_PICKUP';
    return 'NAVIGATING_TO_PICKUP';
  });
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const [driverAccuracy, setDriverAccuracy] = useState(30);
  const [areaPulse, setAreaPulse] = useState(0.5);
  const [inAppNav, setInAppNav] = useState(false);
  const [customerPhoto, setCustomerPhoto] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState(300);
  const [mapZoom, setMapZoom] = useState(17);
  const mapZoomRef = useRef(17);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [distanceToPickup, setDistanceToPickup] = useState<number | null>(null);
  const [driverCountdown, setDriverCountdown] = useState<number | null>(null);
  const localTimerStart = useRef<number | null>(null); // Fallback local timestamp
  const voiceReminderSent = useRef(false);
  // Timestamp (ms epoch) de inicio real del viaje — insumo de `addActualsToBooking`
  // para calcular `total_trip_time`. Se fija en handleStartTrip.
  const tripStartTimestamp = useRef<number>(0);
  
  // ✅ OTP State
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [currentOtp, setCurrentOtp] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [waitingForOtpTimer, setWaitingForOtpTimer] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState(''); // 🆕 Input del driver

  // 💵 Precio total del servicio — primer modal al finalizar, antes de calificar.
  // Mismo valor que ve el cliente (ver `addActualsToBooking`: price === trip_cost, sin margen al cierre).
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  // 📏 Distancia (km) y ⏱️ tiempo (segundos) reales recalculados al cierre —
  // se muestran junto al precio en el modal de fin de viaje.
  const [finalDistanceKm, setFinalDistanceKm] = useState<number | null>(null);
  const [finalTripSeconds, setFinalTripSeconds] = useState<number | null>(null);
  const completedBookingRef = useRef<any>(null);

  // ⭐ Customer rating (conductor → cliente) requerido antes de finalizar
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [customerRating, setCustomerRating] = useState(0);
  const [customerReview, setCustomerReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // ⏱️ OTP Timer Hook - Persistent 3-minute countdown
  const otpTimer = useOtpTimer({
    bookingId: reservation?.id,
    initialTimeRemaining: 180, // 3 minutos
    autoStart: false,
    onTimerExpired: () => {
      console.log('⏰ [OTP TIMER] Timer ha expirado - habilitar ingreso de código');
      setWaitingForOtpTimer(false);
      // Notificar al cliente que el código ya está disponible y el servicio será iniciado
      if (reservation.customer_token) {
        sendPushNotification(
          reservation.customer_token,
          '🔐 Código de verificación listo',
          `Tu código de seguridad está disponible. Compártelo con tu conductor para iniciar el viaje.`,
        );
      }
    },
  });

  // Escribe la posición del conductor en booking_tracking para que el cliente la vea en tiempo real
  useDriverTracking(
    reservation?.id ?? null,
    user?.id ?? user?.uid ?? null,
    phase !== 'TRIP_COMPLETE'
  );

  // Agora calls - COMENTADO PARA EXPO GO
  // const callManager = useAgoraCall({
  //   appId: AGORA_APP_ID || 'e7f6e9aeecf14b2ba10e3f40be9f56e7',
  //   userId: user?.id || user?.auth_id || 'user_unknown',
  //   userName: user?.first_name || user?.name || 'Conductor',
  //   userPhone: user?.mobile || 'N/A',
  //   userImage: user?.profile_image,
  // });
  // Mock callManager para desarrollo sin Agora
  const callManager = {
    callActive: false,
    channelName: '',
    remoteUser: null,
    token: null,
    isLoadingToken: false,
    makeCall: () => console.log('📞 Mock call'),
    acceptCall: () => console.log('📞 Mock accept'),
    endCall: () => console.log('📞 Mock end'),
  };

  // Payment info from the reservation
  const paymentMode = reservation.payment_mode || 'cash';
  const driverPaymentNumber = user?.bankAccount || user?.mobile || '';

  const paymentLabel = paymentMode === 'nequi' ? 'Nequi'
    : paymentMode === 'daviplata' ? 'Daviplata' : 'Efectivo';

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

  // Voice reminder when driver gets close to pickup (< 800m)
  useEffect(() => {
    if (voiceReminderSent.current) return;
    if (phase !== 'NAVIGATING_TO_PICKUP') return;
    if (distanceToPickup === null || distanceToPickup > 800) return;

    voiceReminderSent.current = true;
    // Anunciar el mínimo del rango (trip_cost / driver_share).
    const price =
      Number(reservation.trip_cost) ||
      Number(reservation.driver_share) ||
      Number(reservation.price) ||
      Number(reservation.estimate) ||
      0;
    const priceFormatted = price.toLocaleString('es-CO');

    let voiceMsg = `Estás llegando al punto de recogida de ${reservation.customer_name}. `;
    if (paymentMode === 'cash') {
      voiceMsg += `El pago estimado mínimo es en efectivo por ${priceFormatted} pesos.`;
    } else {
      voiceMsg += `El pago estimado mínimo es por ${paymentLabel} por ${priceFormatted} pesos. Recuerda confirmar la transferencia al finalizar el viaje.`;
    }

    Speech.stop().then(() => {
      Speech.speak(voiceMsg, { language: 'es-CO', pitch: 1, rate: 0.9 });
    }).catch(() => {
      Speech.speak(voiceMsg, { language: 'es-CO', pitch: 1, rate: 0.9 });
    });
  }, [distanceToPickup, phase, paymentMode]);

  // GPS tracking
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
        loc => {
          const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setDriverLocation(pos);
          if (typeof loc.coords.heading === 'number' && loc.coords.heading >= 0) {
            setDriverHeading(loc.coords.heading);
          }
          if (typeof loc.coords.accuracy === 'number' && loc.coords.accuracy > 0) {
            setDriverAccuracy(Math.min(Math.max(loc.coords.accuracy, 12), 120));
          }
          if (pickupLat && pickupLng) {
            setDistanceToPickup(getDistanceMeters(pos.latitude, pos.longitude, pickupLat, pickupLng));
          }
        },
      );
    })();
    return () => { sub?.remove(); };
  }, [pickupLat, pickupLng]);

  // Halo de precisión (mismo efecto parpadeante del mapa principal)
  useEffect(() => {
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = (Date.now() - start) / 1800;
      setAreaPulse(0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Foto del cliente
  useEffect(() => {
    let cancelled = false;
    const pickPhoto = (...candidates: Array<string | null | undefined>) => {
      for (const c of candidates) {
        const u = String(c || '').trim();
        if (u.startsWith('http') || u.startsWith('file:') || u.startsWith('content:')) return u;
      }
      return null;
    };
    const load = async () => {
      const fallback = pickPhoto(reservation?.customer_image, reservation?.profile_image);
      if (!cancelled && fallback) setCustomerPhoto(fallback);
      const targetId = String(reservation?.customer_id || reservation?.customer || '').trim();
      if (!targetId) return;
      try {
        const headers = await getSupabaseAuthHeaders();
        const url =
          `${SUPABASE_URL}/rest/v1/users` +
          `?or=(id.eq.${encodeURIComponent(targetId)},auth_id.eq.${encodeURIComponent(targetId)})` +
          `&select=profile_image&limit=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) return;
        const rows = await res.json();
        const u = Array.isArray(rows) ? rows[0] : null;
        const photo = pickPhoto(u?.profile_image, fallback);
        if (!cancelled && photo) setCustomerPhoto(photo);
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [reservation?.customer_id, reservation?.customer, reservation?.customer_image]);

  // Navegación in-app tipo Waze: sigue al conductor con el puck
  useEffect(() => {
    if (!inAppNav || !driverLocation || !mapRef.current) return;
    mapRef.current.animateCamera(
      {
        center: driverLocation,
        heading: driverHeading || 0,
        pitch: 45,
        zoom: mapZoomRef.current,
      },
      { duration: 500 },
    );
  }, [inAppNav, driverLocation?.latitude, driverLocation?.longitude, driverHeading]);

  // Mientras esta pantalla esté montada, "posee" su booking: el watcher global
  // (useDriverCancellationWatcher) ignora este id para no duplicar el modal.
  // Aquí mostramos el aviso y navegamos de vuelta; fuera de aquí lo hace el global.
  useEffect(() => {
    if (!reservation?.id) return;
    const id = String(reservation.id);
    activeTripBookings.add(id);
    return () => { activeTripBookings.delete(id); };
  }, [reservation?.id]);

  // 🚫 Detectar cancelación (cliente o admin desde web) — poll + realtime
  useEffect(() => {
    if (!reservation?.id) return;
    if (phase === 'TRIP_COMPLETE') return;
    let cancelHandled = false;

    const handleCancellation = (reason?: string | null, cancelledBy?: string | null) => {
      if (cancelHandled) return;
      cancelHandled = true;
      const actor =
        cancelledBy === 'admin'
          ? 'El administrador'
          : reservation.customer_name || 'El cliente';
      const msg = `${actor} canceló el servicio.${reason ? `\nMotivo: ${reason}` : ''}`;
      const goBack = () => {
        setAlertVisible(false);
        nav.goBack();
      };
      showAlert('warning', 'Servicio cancelado', msg, [
        { text: 'Entendido', style: 'default', onPress: goBack },
      ]);
      // Failsafe: si el modal se cierra por dismiss o no se interactúa,
      // navegar de vuelta de todos modos tras un breve margen.
      setTimeout(goBack, 6000);
    };

    const checkCancellation = async () => {
      if (cancelHandled) return;
      try {
        const { data, error } = await (supabase as any)
          .from('bookings')
          .select('status, cancelled_by, reason')
          .eq('id', reservation.id)
          .single();
        if (error || !data) return;
        if (data.status === 'CANCELLED') {
          handleCancellation(data.reason, data.cancelled_by);
        }
      } catch (e) {
        console.warn('checkCancellation error:', e);
      }
    };

    checkCancellation();
    const interval = setInterval(checkCancellation, 3000);

    // Realtime: detecta cancelación al instante sin esperar el siguiente poll
    const channel = (supabase as any)
      .channel(`booking-cancel-${reservation.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${reservation.id}` },
        (payload: any) => {
          if (payload?.new?.status === 'CANCELLED') {
            handleCancellation(payload.new.reason, payload.new.cancelled_by);
          }
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      (supabase as any).removeChannel?.(channel);
    };
  }, [reservation?.id, reservation?.customer_name, phase, nav]);

  // Fetch route polyline
  const fetchRoute = useCallback(async (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
    try {
      if (MAPBOX_TOKEN) {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=polyline&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]?.geometry) {
          setRouteCoords(decodePolyline(data.routes[0].geometry));
          return;
        }
      }
      // Fallback to Google
      if (API_KEY) {
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]?.overview_polyline?.points) {
          setRouteCoords(decodePolyline(data.routes[0].overview_polyline.points));
        }
      }
    } catch {}
  }, []);

  // Update route based on phase
  useEffect(() => {
    if (!driverLocation) return;
    if (phase === 'NAVIGATING_TO_PICKUP' && pickupLat && pickupLng) {
      fetchRoute(driverLocation.latitude, driverLocation.longitude, pickupLat, pickupLng);
    } else if (phase === 'TRIP_STARTED' && pickupLat && pickupLng && dropLat && dropLng) {
      fetchRoute(pickupLat, pickupLng, dropLat, dropLng);
    }
  }, [phase, driverLocation?.latitude, driverLocation?.longitude, fetchRoute, pickupLat, pickupLng, dropLat, dropLng]);

  // Reemplaza la ruta sugerida (Mapbox/Google, fija desde TRIP_STARTED) por el
  // recorrido real registrado en `booking_tracking` — el trazo debe pasar por
  // todos los puntos GPS del conductor, no solo pickup→drop. Se llama de forma
  // eager desde `handleEndTrip` (no reactiva a `phase`) para que la ruta ya
  // esté lista antes de que aparezca el modal de precio/calificación/éxito —
  // si se esperaba al cambio de fase, un `fitToCoordinates` de otro efecto
  // (o la latencia de red) podía ganarle la carrera y dejar la cámara
  // encuadrada solo en 2 puntos aunque el trazo ya tuviera todo el recorrido.
  const loadActualRoute = async () => {
    if (!reservation?.id) return;
    try {
      const { data, error } = await supabase
        .from('booking_tracking')
        .select('lat, lng, created_at')
        .eq('booking_id', reservation.id)
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('[ReservationTripScreen] error leyendo booking_tracking para ruta final:', error);
        return;
      }
      const points = (data || []).map((row: any) => ({
        latitude: row.lat,
        longitude: row.lng,
      }));
      if (points.length > 1) {
        setRouteCoords(points);
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 120, right: 60, bottom: 280, left: 60 },
          animated: true,
        });
      }
    } catch (e) {
      console.warn('[ReservationTripScreen] excepción cargando ruta real del viaje:', e);
    }
  };

  // Fit map to markers — en TRIP_COMPLETE la cámara la controla el efecto de
  // ruta real (arriba), que encuadra los puntos GPS completos; si este efecto
  // también corriera ahí, su fitToCoordinates(driverLocation+pickup) podía
  // ganar la carrera y recortar la vista a solo 2 puntos, tapando el resto
  // del trazo aunque routeCoords ya tuviera todo el recorrido.
  useEffect(() => {
    if (phase === 'TRIP_COMPLETE') return;
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      const markers: { latitude: number; longitude: number }[] = [];
      if (driverLocation) markers.push(driverLocation);
      if (pickupLat && pickupLng && phase !== 'TRIP_STARTED') markers.push({ latitude: pickupLat, longitude: pickupLng });
      if (phase === 'TRIP_STARTED' && dropLat && dropLng) {
        markers.push({ latitude: pickupLat, longitude: pickupLng });
        markers.push({ latitude: dropLat, longitude: dropLng });
      }
      if (markers.length >= 2) {
        mapRef.current.fitToCoordinates(markers, {
          edgePadding: { top: 120, right: 60, bottom: 280, left: 60 },
          animated: true,
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [phase, driverLocation, pickupLat, pickupLng, dropLat, dropLng]);

  // Update booking status in Supabase
  const updateBookingStatus = async (status: string, extraFields?: Record<string, any>) => {
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const body: any = { status, ...extraFields };
      const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${reservation.id}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json())[0];
    } catch (e: any) {
      console.error('updateBookingStatus error:', e);
      throw e;
    }
  };

  // Confirm arrival at pickup
  const handleConfirmArrival = async () => {
    if (distanceToPickup !== null && distanceToPickup > 500) {
      showAlert('warning', 'Aún estás lejos', 'Debes estar a menos de 500 metros del punto de recogida para confirmar tu llegada.');
      return;
    }
    setLoading(true);
    try {
      // 🔐 OTP de recogida: se genera al CREAR el booking (trigger DB
      // `trg_generate_booking_otp`) para que el admin lo vea en la web y se lo
      // pueda dar al cliente. Aquí solo lo LEEMOS, no lo regeneramos.
      let otp = currentOtp;
      if (!otp) {
        const existing = await OtpService.getOtp(reservation.id);
        otp = existing?.otp ? String(existing.otp).trim() : null;
      }
      // Fallback: reservas creadas ANTES de existir el trigger no tienen otp.
      // En ese caso lo generamos y persistimos como antes (retrocompatibilidad).
      if (!otp) {
        otp = OtpService.generateOtp();
        await OtpService.saveOtp(reservation.id, otp);
        console.log('✅ OTP legacy generado y guardado:', otp);
      }
      setCurrentOtp(otp);

      await updateBookingStatus('ARRIVED', {
        driver_arrived_time: new Date().toISOString(),
      });
      console.log('✅ OTP de recogida en uso:', otp);
      
      setPhase('ARRIVED_AT_PICKUP');
      setWaitingForOtpTimer(true); // ⏱️ Mostrar estado de espera
      localTimerStart.current = Date.now(); // Iniciar countdown local inmediatamente
      
      updateDriverNotification(
        '📍 Has llegado al punto de recogida',
        `Esperando a ${reservation.customer_name} — Reserva ${reservation.reference}`,
      ).catch(() => {});

      // ⏱️ INICIAR TIMER DE 3 MINUTOS (No mostrar modal aún)
      otpTimer.startTimer().catch((err: any) => {
        console.error('⚠️ Error al iniciar timer en Supabase (countdown local continúa):', err);
      });
      console.log('✅ Timer OTP iniciado - 3 minutos de espera');

      // 📱 Notify customer with waiting message
      if (reservation.customer_token) {
        // ⛔ "Conductor ha llegado": la envía SOLO el servidor. El Database
        // Webhook `bookingWebhookDispatcher` despacha el push de ARRIVED al
        // cliente. Duplicarla aquí generaba doble notificación. Se conservan las
        // notificaciones de PAGO abajo porque llevan info que el dispatcher no da.

        // Notificación de pago — anunciar MÍNIMO del rango (mismo valor ambos lados)
        const quoteMin =
          Number(reservation.trip_cost) ||
          Number(reservation.driver_share) ||
          Number(reservation.price) ||
          Number(reservation.estimate) ||
          0;
        const quoteMinTxt = quoteMin.toLocaleString('es-CO');
        if (paymentMode === 'cash') {
          sendPushNotification(
            reservation.customer_token,
            `${reservation.customer_name}, pago en efectivo`,
            `Pago estimado desde $${quoteMinTxt}. El viaje comenzará pronto.`,
          );
        } else {
          sendPushNotification(
            reservation.customer_token,
            `${reservation.customer_name}, pago por ${paymentLabel}`,
            `Prepárate para transferir desde $${quoteMinTxt} al: ${driverPaymentNumber}`,
          );
        }
      }
      
      // ❌ NO mostrar OTP modal inmediatamente - esperar 3 minutos
      // setOtpModalVisible(true); // COMENTADO: Será mostrado automáticamente después de 3 min
    } catch (error) {
      console.error('❌ Error en handleConfirmArrival:', error);
      showAlert('error', 'Error', 'No se pudo confirmar la llegada. Intenta de nuevo.');
      setWaitingForOtpTimer(false);
    } finally {
      setLoading(false);
    }
  };

  // Start the trip
  const handleStartTrip = async () => {
    // ✅ Check if OTP has been verified
    if (!otpVerified) {
      showAlert('warning', 'OTP no verificado', 'Debes verificar el código OTP antes de iniciar el viaje. Abre el modal para ingresar el código.');
      return;
    }
    
    showAlert('confirm',
      'Iniciar Viaje',
      `¿Confirmas que el pasajero ${reservation.customer_name} está a bordo?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setAlertVisible(false) },
        {
          text: 'Iniciar',
          onPress: async () => {
            setAlertVisible(false);
            setLoading(true);
            try {
              tripStartTimestamp.current = Date.now();
              await updateBookingStatus('STARTED', {
                trip_start_time: new Date().toISOString(),
              });
              setPhase('TRIP_STARTED');
              updateDriverNotification(
                '🚗 Viaje en curso',
                `Llevando a ${reservation.customer_name} al destino — ${reservation.drop_address || 'Destino'}`,
              ).catch(() => {});
              // ⛔ Push de "viaje iniciado" al cliente: se quita el envío legacy
              // (treasupdate) desde aquí. STARTED lo notifica la alerta local del
              // cliente (`notifyTripStateChange`), fuente única para este estado.
              // (Opcional futuro: mover STARTED al dispatcher del servidor y
              //  excluirlo también del local — ver plan de notificaciones.)
            } catch {
              showAlert('error', 'Error', 'No se pudo iniciar el viaje.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // � Verificar si ya existe OTP guardado (cuando re-entra como conductor)
  useEffect(() => {
    const loadExistingOtp = async () => {
      try {
        // Primero intentar usar OTP del objeto reservation (si vino en params)
        if ((reservation as any)?.otp && !currentOtp) {
          const otpString = String((reservation as any).otp).trim();
          console.log('✅ [INIT] OTP desde reservation params:', otpString);
          setCurrentOtp(otpString);

          if ((reservation as any).otp_verified) {
            setOtpVerified(true);
            console.log('✅ [INIT] OTP ya verificado');
          }
          return;
        }

        // Si no está en params, cargar desde BD
        const { data, error } = await (supabase as any)
          .from('bookings')
          .select('otp, otp_verified, otp_timer_started_at, status')
          .eq('id', reservation?.id)
          .single();

        if (error || !data) return;

        // Si hay OTP guardado
        if (data.otp && !currentOtp) {
          const otpString = String(data.otp).trim();
          console.log('✅ [RELOAD] OTP encontrado:', otpString);
          setCurrentOtp(otpString);

          // Si ya fue verificado
          if (data.otp_verified) {
            setOtpVerified(true);
            console.log('✅ [RELOAD] OTP ya verificado');
          }

          // Si timer está activo, calcular si aún queda tiempo
          if (data.otp_timer_started_at) {
            const startTime = new Date(data.otp_timer_started_at).getTime();
            const elapsed = (Date.now() - startTime) / 1000;
            const remaining = Math.max(0, 180 - elapsed);
            console.log(`✅ [RELOAD] Timer activo, remaining: ${remaining.toFixed(1)}s`);

            if (!data.otp_verified && remaining > 0) {
              // Aún queda tiempo en el countdown
              setWaitingForOtpTimer(true);
            } else {
              // Timer ya expiró o ya verificado - mostrar botón de código
              setWaitingForOtpTimer(false);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error loading existing OTP:', error);
      }
    };

    if (reservation?.id && phase === 'ARRIVED_AT_PICKUP') {
      loadExistingOtp();
    }
  }, [reservation?.id, phase, currentOtp]);

  // ⏲️ Driver Countdown - Calcula localmente desde otp_timer_started_at de Supabase
  // Si Supabase aún no devuelve el timestamp, usa localTimerStart como fallback
  useEffect(() => {
    if (!waitingForOtpTimer) {
      setDriverCountdown(null);
      return;
    }

    const updateCountdown = () => {
      // Preferir timestamp de Supabase, fallback a timestamp local
      const startTime = otpTimer.timerStartedAt
        ? new Date(otpTimer.timerStartedAt).getTime()
        : localTimerStart.current;

      if (!startTime) {
        setDriverCountdown(180);
        return;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 180 - elapsed);
      setDriverCountdown(Math.ceil(remaining));

      if (remaining <= 0) {
        console.log('⏰ [DRIVER COUNTDOWN] Tiempo agotado - mostrando botón de código');
        setWaitingForOtpTimer(false);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [waitingForOtpTimer, otpTimer.timerStartedAt]);

  // 🆕 Limpiar entrada OTP cuando se sale de ARRIVED_AT_PICKUP
  useEffect(() => {
    if (phase !== 'ARRIVED_AT_PICKUP') {
      setEnteredOtp('');
    }
  }, [phase]);

  // 🔓 Auto-transicionar cuando timer expira (y fetch OTP si no lo tiene)
  useEffect(() => {
    if (otpTimer.isExpired && otpTimer.hasStarted && !otpVerified) {
      console.log('⏰ [AUTO-TRANSITION] Timer expirado, habilitando ingreso de código...');
      setWaitingForOtpTimer(false);

      // Fetch el OTP de la BD (por si acaso no lo tiene - ej: app fue cerrada y reabierta)
      const fetchOtp = async () => {
        try {
          const { data, error } = await (supabase as any)
            .from('bookings')
            .select('otp')
            .eq('id', reservation?.id)
            .single();

          if (error || !data?.otp) return;

          if (!currentOtp) {
            const otpString = String(data.otp).trim();
            console.log('✅ Cargando OTP: ', otpString);
            setCurrentOtp(otpString);
          }
        } catch (e) {
          console.error('Error fetching OTP:', e);
        }
      };

      fetchOtp();
    }
  }, [otpTimer.isExpired, otpTimer.hasStarted, otpVerified, currentOtp, reservation?.id]);

  // 🔐 NUEVO: Handle OTP validation from modal
  const handleOTPMatch = async (isMatch: boolean) => {
    if (isMatch) {
      console.log('✅ [OTP] OTP válido ingresado por conductor');
      setOtpVerified(true);
      setWaitingForOtpTimer(false);
      setEnteredOtp(''); // 🆕 Limpiar input
      
      try {
        // Mark as verified in database
        await OtpService.markOtpAsVerified(reservation.id);
        
        // Reset timer now that OTP is verified
        await otpTimer.resetTimer();
        
        // 📱 NUEVO: Notificaciones en tiempo real al cliente
        if (reservation.customer_token) {
          // Notificación 1: Código verificado
          sendPushNotification(
            reservation.customer_token,
            '✅ Código verificado',
            `Tu conductor ha compartido el código. ¡El viaje está a punto de comenzar!`,
          );
          
          // Notificación 2 (después de 1s): Servicio iniciará
          setTimeout(() => {
            sendPushNotification(
              reservation.customer_token,
              '🚗 Servicio iniciando',
              `Tu conductor está listo. Prepárate para el viaje - Reserva ${reservation.reference}`,
            );
          }, 1000);
        }
        
        showAlert('success', 'Código verificado', 'El código OTP ha sido verificado. Ahora puedes iniciar el viaje.');
      } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        showAlert('error', 'Error', 'No se pudo verificar el código. Intenta de nuevo.');
      }
    } else {
      console.log('❌ [OTP] OTP incorrecto');
      showAlert('error', 'Código incorrecto', 'El código que ingresaste no es correcto. Intenta de nuevo.');
    }
  };

  // Confirmación previa — evita finalizar el viaje por un toque accidental
  // en el botón. Solo al confirmar corre la lógica real (cálculo de precio,
  // ruta, modales).
  const handleEndTrip = () => {
    showAlert('confirm',
      '¿Finalizar viaje?',
      'Vas a marcar este viaje como finalizado. ¿Confirmas que el recorrido terminó?',
      [
        { text: 'No', style: 'cancel', onPress: () => setAlertVisible(false) },
        {
          text: 'Sí, finalizar',
          onPress: () => {
            setAlertVisible(false);
            confirmedEndTrip();
          },
        },
      ],
    );
  };

  // End the trip — primero se calcula y persiste el precio real (mismo valor
  // que verá el cliente), se muestra al conductor, y solo después se pide la
  // calificación del cliente.
  const confirmedEndTrip = async () => {
    setLoading(true);
    try {
      const bookingForActuals = {
        ...reservation,
        id: reservation.id,
        startTime: tripStartTimestamp.current || Date.now(),
        carType: reservation.car_type,
        status: 'COMPLETE',
        driver_status: 'COMPLETE',
        customer_status: 'COMPLETE',
      };
      // isScheduled: true — todo viaje en esta pantalla es una reserva programada.
      // isProtocol/tollsTotal/parking: deuda pendiente, ver [[10-deuda-tecnica]] #26.
      const updated = await addActualsToBooking(bookingForActuals, { isScheduled: true });
      completedBookingRef.current = updated;
      setFinalPrice(Number(updated?.price ?? updated?.trip_cost ?? 0));
      setFinalDistanceKm(Number(updated?.distance ?? 0));
      setFinalTripSeconds(Number(updated?.total_trip_time ?? 0));
      await loadActualRoute();
      setPriceModalVisible(true);
    } catch (e) {
      console.error('Error calculando el precio final del viaje:', e);
      showAlert('error', 'Error', 'No se pudo calcular el precio final del viaje.');
    } finally {
      setLoading(false);
    }
  };

  // Guardar la calificación del cliente y continuar con el flujo de finalización
  const submitCustomerRating = async () => {
    if (customerRating < 1) {
      showAlert('warning', 'Calificación requerida', 'Califica al cliente con 1 a 5 estrellas antes de finalizar el viaje.');
      return;
    }
    setSubmittingRating(true);
    try {
      const customerId = reservation.customer_id || reservation.customer;
      const ratingValue = Math.round(customerRating);
      const headers = await getSupabaseAuthHeaders(true);

      // Update vía REST directo (evita cuelgue del cliente supabase-js)
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${reservation.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            customer_rating: ratingValue,
            customer_review: customerReview?.trim() || null,
          }),
        },
      );
      if (!updateRes.ok) {
        const text = await updateRes.text();
        throw new Error(text || `HTTP ${updateRes.status}`);
      }

      // Recalcular promedio del cliente (no bloquea el flujo si falla)
      if (customerId) {
        try {
          await fetchAndSyncUserRating(String(customerId), 'customer', { syncToProfile: true });
        } catch (e) {
          console.warn('No se pudo recalcular el promedio del cliente:', e);
        }
      }

      setRatingModalVisible(false);
      finalizeTrip();
    } catch (e: any) {
      console.error('Error guardando calificación del cliente:', e);
      showAlert(
        'error',
        'Error',
        e?.message ? `No se pudo guardar la calificación: ${e.message}` : 'No se pudo guardar la calificación. Intenta de nuevo.',
      );
    } finally {
      setSubmittingRating(false);
    }
  };

  // Cierra el viaje (compartido por flujo efectivo y transferencia). El precio
  // real ya fue calculado y persistido en `handleEndTrip` vía `addActualsToBooking`
  // — ver [[21-calculo-tarifa]] — acá solo se marca la fase y se notifica.
  const finalizeTrip = async () => {
    setLoading(true);
    try {
      setPhase('TRIP_COMPLETE');
      // Restore the default driver-online notification
      showDriverActiveNotification().catch(() => {});
      // ⛔ "Viaje completado": la envía SOLO el servidor. El Database Webhook
      // `bookingWebhookDispatcher` despacha el push de COMPLETE al cliente
      // ("Servicio finalizado"). Enviarla también aquí duplicaba la notificación.
      // Fuente única de verdad = el dispatcher del servidor.
      showAlert('success',
        '¡Viaje Completado!',
        `La reserva ${reservation.reference} ha sido completada exitosamente.`,
        [{
          text: 'Volver',
          onPress: () => { setAlertVisible(false); nav.goBack(); },
        }],
      );
    } catch {
      showAlert('error', 'Error', 'No se pudo finalizar el viaje.');
    } finally {
      setLoading(false);
    }
  };

  // Open Google Maps navigation
  const openNavigation = () => {
    setInAppNav(false);
    let destLat: number, destLng: number;
    if (phase === 'NAVIGATING_TO_PICKUP' || phase === 'ARRIVED_AT_PICKUP') {
      destLat = pickupLat;
      destLng = pickupLng;
    } else {
      destLat = dropLat;
      destLng = dropLng;
    }
    const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${destLat},${destLng}`;
    Linking.openURL(url);
  };

  // Open Waze navigation
  const openWaze = () => {
    setInAppNav(false);
    let destLat: number, destLng: number;
    if (phase === 'NAVIGATING_TO_PICKUP' || phase === 'ARRIVED_AT_PICKUP') {
      destLat = pickupLat;
      destLng = pickupLng;
    } else {
      destLat = dropLat;
      destLng = dropLng;
    }
    const url = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;
    Linking.openURL(url);
  };

  const startInAppNav = () => {
    setInAppNav(true);
    if (driverLocation && mapRef.current) {
      mapZoomRef.current = 18;
      setMapZoom(18);
      mapRef.current.animateCamera(
        {
          center: driverLocation,
          heading: driverHeading || 0,
          pitch: 45,
          zoom: 18,
        },
        { duration: 600 },
      );
    }
  };

  const locateOnMap = () => {
    if (!driverLocation || !mapRef.current) return;
    mapRef.current.animateCamera(
      {
        center: driverLocation,
        heading: inAppNav ? (driverHeading || 0) : 0,
        pitch: inAppNav ? 45 : 0,
        zoom: mapZoomRef.current,
      },
      { duration: 400 },
    );
  };

  const zoomBy = (delta: number) => {
    const next = Math.min(21, Math.max(12, mapZoomRef.current + delta));
    mapZoomRef.current = next;
    setMapZoom(next);
    if (!mapRef.current) return;
    const center = driverLocation || (pickupLat ? { latitude: pickupLat, longitude: pickupLng } : null);
    if (!center) return;
    mapRef.current.animateCamera(
      {
        center,
        heading: inAppNav ? (driverHeading || 0) : 0,
        pitch: inAppNav ? 45 : 0,
        zoom: next,
      },
      { duration: 250 },
    );
  };

  const syncMapZoom = (cameraZoom?: number, latitudeDelta?: number) => {
    let z = cameraZoom;
    if (typeof z !== 'number' || !Number.isFinite(z)) {
      const d = Number(latitudeDelta);
      if (Number.isFinite(d) && d > 0) z = Math.log2(360 / d);
    }
    if (typeof z === 'number' && Number.isFinite(z)) {
      const clamped = Math.min(21, Math.max(12, z));
      if (Math.abs(clamped - mapZoomRef.current) > 0.05) {
        mapZoomRef.current = clamped;
        setMapZoom(clamped);
      }
    }
  };

  const tipRadius = tipRadiusForZoom(mapZoom);
  const haloRadius = accuracyHaloForZoom(driverAccuracy, mapZoom);
  const showRouteStartTip = phase === 'TRIP_STARTED';
  const showRouteEndTip = routeCoords.length > 1;

  const renderPaymentIcon = (size = 14) => {
    if (paymentMode === 'nequi') {
      return <Image source={{ uri: NEQUI_LOGO_URI }} style={{ width: size, height: size, borderRadius: 3 }} />;
    }
    if (paymentMode === 'daviplata') {
      return <Image source={{ uri: DAVIPLATA_LOGO_URI }} style={{ width: size, height: size, borderRadius: 3 }} />;
    }
    return <Ionicons name="cash-outline" size={size} color="#00E676" />;
  };

  // Call customer - Usando Agora UIKit
  const callCustomer = async () => {
    if (!reservation.customer_contact) {
      showAlert('error', 'Error', 'No hay número de contacto disponible');
      return;
    }

    try {
      console.log('📞 [CALL] Iniciando llamada P2P a cliente...');
      
      const customerData = {
        userId: reservation.customer_id || reservation.customer,
        name: reservation.customer_name || 'Cliente',
        phone: reservation.customer_contact,
        image: undefined,
      };

      // Generar canal de llamada
      const driverId = user?.id || user?.auth_id || '0';
      const customerId = reservation.customer_id || reservation.customer;
      const parts = [driverId, customerId].sort().join('_');
      const channelName = `call_${parts}`;

      // Notificar al cliente sobre la llamada entrante
      await notifyIncomingCall({
        customerId,
        driverId,
        driverName: user?.first_name || user?.name || 'Conductor',
        channelName,
      });

      // callManager.makeCall(customerData); // COMENTADO - EXPO GO
      showAlert('success', '✅ Llamada iniciada', 'Notificación enviada al cliente');
    } catch (error) {
      console.error('❌ Agora call error:', error);
      // Fallback a llamada nativa
      const prefix = Platform.OS === 'android' ? 'tel:' : 'telprompt:';
      Linking.openURL(prefix + reservation.customer_contact);
    }
  };

  const phaseConfig = {
    NAVIGATING_TO_PICKUP: {
      title: 'Ir al punto de recogida',
      subtitle: reservation.pickup_address,
      color: '#00E5FF',
      icon: 'navigate' as const,
    },
    ARRIVED_AT_PICKUP: {
      title: 'Esperando al pasajero',
      subtitle: `${reservation.customer_name} — ${reservation.pickup_address}`,
      color: '#00E5FF',
      icon: 'time' as const,
    },
    TRIP_STARTED: {
      title: 'Viaje en curso',
      subtitle: reservation.drop_address,
      color: '#00E676',
      icon: 'car' as const,
    },
    TRIP_COMPLETE: {
      title: 'Viaje completado',
      subtitle: 'La reserva ha finalizado',
      color: '#00E676',
      icon: 'checkmark-circle' as const,
    },
  };

  const currentConfig = phaseConfig[phase];
  const canConfirmArrival = distanceToPickup !== null && distanceToPickup <= 500;

  return (
    <View style={s.root}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: pickupLat || 4.6367,
          longitude: pickupLng || -74.0829,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        customMapStyle={GOOGLE_MAPS_DARK_STYLE}
        rotateEnabled
        pitchEnabled
        onRegionChangeComplete={(region) => {
          Promise.resolve(mapRef.current?.getCamera?.())
            .then((cam: any) => {
              if (typeof cam?.zoom === 'number') syncMapZoom(cam.zoom);
              else syncMapZoom(undefined, region.latitudeDelta);
            })
            .catch(() => syncMapZoom(undefined, region.latitudeDelta));
        }}
      >
        {/* Driver puck + halo parpadeante (radio según zoom) */}
        {driverLocation && (
          <>
            <Circle
              center={driverLocation}
              radius={haloRadius * (0.85 + areaPulse * 0.2)}
              fillColor={`rgba(0, 229, 255, ${0.08 + areaPulse * 0.1})`}
              strokeColor={`rgba(0, 229, 255, ${0.22 + areaPulse * 0.14})`}
              strokeWidth={1}
              zIndex={1}
            />
            <Marker
              coordinate={driverLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              rotation={driverHeading || 0}
              tracksViewChanges={false}
              zIndex={10}
              image={DRIVER_LOCATION_PUCK_IMAGE}
            />
          </>
        )}

        {/* Route polyline + puntas dinámicas (misma escala que halo navegar) */}
        {routeCoords.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeWidth={8}
              strokeColor={ROUTE_LINE_BLUE}
              lineJoin="round"
              lineCap="round"
              zIndex={2}
            />
            <Polyline
              coordinates={routeCoords}
              strokeWidth={5}
              strokeColor="#00E676"
              lineJoin="round"
              lineCap="round"
              zIndex={3}
            />
            {showRouteStartTip && (
              <Circle
                center={routeCoords[0]}
                radius={tipRadius}
                fillColor="#FFFFFF"
                strokeColor="#00E5FF"
                strokeWidth={2}
                zIndex={5}
              />
            )}
            {showRouteEndTip && (
              <Circle
                center={routeCoords[routeCoords.length - 1]}
                radius={tipRadius}
                fillColor="#E91E63"
                strokeColor="#00E5FF"
                strokeWidth={2}
                zIndex={5}
              />
            )}
          </>
        )}
      </MapView>

      {/* Controles: siempre encima del panel; ocultos en llegada/OTP */}
      {phase !== 'ARRIVED_AT_PICKUP' && panelHeight < height * 0.65 && (
        <>
          <View style={[s.mapZoomControls, { bottom: panelHeight + 14 }]} pointerEvents="box-none">
            <TouchableOpacity style={s.mapCtrlBtn} onPress={() => zoomBy(1)} activeOpacity={0.85}>
              <Ionicons name="add" size={22} color="#00E5FF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.mapCtrlBtn} onPress={() => zoomBy(-1)} activeOpacity={0.85}>
              <Ionicons name="remove" size={22} color="#00E5FF" />
            </TouchableOpacity>
          </View>
          <View style={[s.mapSideControls, { bottom: panelHeight + 14 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={[s.mapCtrlBtn, inAppNav && s.mapCtrlBtnOn]}
              onPress={() => (inAppNav ? setInAppNav(false) : startInAppNav())}
              activeOpacity={0.85}
            >
              <Image source={DRIVER_LOCATION_PUCK_IMAGE} style={s.mapCtrlPuck} />
            </TouchableOpacity>
            <TouchableOpacity style={s.mapCtrlBtn} onPress={locateOnMap} activeOpacity={0.85}>
              <Ionicons name="locate" size={20} color="#00E5FF" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: Math.max(insets.top, 20) + 6 }]}>
        <View style={s.topBarRow}>
          <TouchableOpacity style={s.topBtn} onPress={() => nav.goBack()} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={s.topInfo}>
            <View style={[s.phaseDot, { backgroundColor: currentConfig.color }]} />
            <Text style={s.topTitle} numberOfLines={1}>{currentConfig.title}</Text>
          </View>

          <TouchableOpacity
            style={s.topBtn}
            onPress={async () => {
              const estimatedDistance =
                distanceToPickup !== null
                  ? distanceToPickup < 1000
                    ? `${Math.round(distanceToPickup)} m`
                    : `${(distanceToPickup / 1000).toFixed(1)} km`
                  : null;
              await shareTrip('driver', reservation, user, { estimatedDistance });
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="share-social" size={20} color="#00E5FF" />
          </TouchableOpacity>

          <TouchableOpacity style={s.topBtn} onPress={() => {
            mapRef.current?.fitToCoordinates(
              [
                ...(driverLocation ? [driverLocation] : []),
                ...(pickupLat ? [{ latitude: pickupLat, longitude: pickupLng }] : []),
                ...(dropLat && phase === 'TRIP_STARTED' ? [{ latitude: dropLat, longitude: dropLng }] : []),
              ],
              { edgePadding: { top: 120, right: 60, bottom: 280, left: 60 }, animated: true }
            );
          }} activeOpacity={0.75}>
            <Ionicons name="scan" size={20} color="#00E5FF" />
          </TouchableOpacity>
        </View>

        {!!reservation.reference && (
          <View style={s.tripCodePill}>
            <Ionicons name="barcode-outline" size={14} color="#00E5FF" />
            <Text style={s.tripCodeLabel}>CÓDIGO DEL VIAJE</Text>
            <Text style={s.tripCodeValue}>{reservation.reference}</Text>
          </View>
        )}
      </View>

      {/* Bottom panel */}
      <View
        style={[s.bottomPanel, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - panelHeight) > 2) setPanelHeight(h);
        }}
      >
        {/* Reservation info summary */}
        <View style={s.infoCard}>
          <View style={s.infoRow}>
            {customerPhoto ? (
              <Image source={{ uri: customerPhoto }} style={s.customerAvatar} />
            ) : (
              <View style={s.customerAvatarFallback}>
                <Ionicons name="person" size={14} color="#00E5FF" />
              </View>
            )}
            <Text style={s.infoName}>{reservation.customer_name}</Text>
            <TouchableOpacity style={s.callBtn} onPress={callCustomer} activeOpacity={0.75}>
              <Ionicons name="call" size={16} color="#00E676" />
            </TouchableOpacity>
          </View>

          <View style={s.routeInfo}>
            <View style={s.routeRowItem}>
              <View style={s.routeDotStart} />
              <Text style={s.routeText} numberOfLines={1}>{reservation.pickup_address}</Text>
            </View>
            <View style={s.routeDash} />
            <View style={s.routeRowItem}>
              <View style={s.routeDotEnd} />
              <Text style={s.routeText} numberOfLines={1}>{reservation.drop_address}</Text>
            </View>
          </View>

          <View style={s.metaRow}>
            {/* 🆕 Precio más prominente - Dinámico según estado */}
            <View style={s.priceHighlight}>
              <Ionicons name="cash-outline" size={14} color="#00E5FF" />
              <Text style={s.priceHighlightText}>
                {formatBookingFareRange(reservation)}
              </Text>
            </View>
            <Text style={s.metaDivider}>•</Text>
            <Text style={s.metaItem}>{reservation.distance?.toFixed?.(1) ?? reservation.distance} km</Text>
            <Text style={s.metaDivider}>•</Text>
            <Text style={s.metaItem}>{formatTime(reservation.booking_date)}</Text>
            <Text style={s.metaDivider}>•</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={s.payIconBox}>
                {renderPaymentIcon(12)}
              </View>
              <Text style={[s.metaItem, { color: paymentMode === 'cash' ? '#00E676' : '#00E5FF' }]}>{paymentLabel}</Text>
            </View>
          </View>
        </View>

        {/* Navigation buttons */}
        <View style={s.navRow}>
          <TouchableOpacity
            style={[s.navBtn, inAppNav && s.navBtnActive]}
            onPress={() => (inAppNav ? setInAppNav(false) : startInAppNav())}
            activeOpacity={0.8}
          >
            <Image source={DRIVER_LOCATION_PUCK_IMAGE} style={s.navPuckIcon} />
            <Text style={s.navBtnTxt}>{inAppNav ? 'Navegando' : 'Navegar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.navBtn} onPress={openNavigation} activeOpacity={0.8}>
            <Ionicons name="navigate" size={16} color="#FFF" />
            <Text style={s.navBtnTxt}>Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.navBtn, s.navBtnWaze]} onPress={openWaze} activeOpacity={0.8}>
            <Ionicons name="compass" size={16} color="#FFF" />
            <Text style={s.navBtnTxt}>Waze</Text>
          </TouchableOpacity>
        </View>

        {/* 🆕 Tarjeta de Precio Prominente en Punto de Recogida */}
        {phase === 'ARRIVED_AT_PICKUP' && (
          <Animatable.View animation="fadeInUp" duration={400} useNativeDriver>
            <View style={s.priceCard}>
              <View style={s.priceCardHeader}>
                <Ionicons name="cash" size={24} color="#00E5FF" />
                <Text style={s.priceCardTitle}>
                  {reservation.status === 'COMPLETE' ? '💰 Valor Final Liquidado' : '💰 Valor Estimado'}
                </Text>
              </View>
              <Text style={s.priceCardAmount}>
                {formatBookingFareRange(reservation)}
              </Text>
              <View style={s.priceCardPayment}>
                <View style={s.payIconBoxLg}>
                  {renderPaymentIcon(16)}
                </View>
                <Text style={s.priceCardPaymentText}>
                  {paymentMode === 'cash' ? 'Pago en Efectivo' : paymentMode === 'nequi' ? 'Pago por Nequi' : 'Pago por Daviplata'}
                </Text>
              </View>
              {paymentMode !== 'cash' && (
                <Text style={s.priceCardNote}>
                  Recuerda confirmar la recepción del pago al finalizar el viaje
                </Text>
              )}
            </View>
          </Animatable.View>
        )}

        {/* Phase action buttons */}
        {phase === 'NAVIGATING_TO_PICKUP' && (
          <TouchableOpacity
            style={[s.actionBtn, !canConfirmArrival && s.actionBtnDisabled]}
            onPress={handleConfirmArrival}
            disabled={loading || !canConfirmArrival}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#051A26" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color={canConfirmArrival ? '#051A26' : 'rgba(255,255,255,0.3)'} />
                <Text style={[s.actionBtnTxt, !canConfirmArrival && s.actionBtnTxtDisabled]}>Confirmar Llegada</Text>
              </>
            )}
            {distanceToPickup !== null && (
              <Text style={s.distanceTxt}>
                {distanceToPickup < 1000
                  ? `${Math.round(distanceToPickup)} m`
                  : `${(distanceToPickup / 1000).toFixed(1)} km`}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {phase === 'ARRIVED_AT_PICKUP' && (
          <>
            {/* 🔐 OTP Input - SIEMPRE disponible durante ARRIVED_AT_PICKUP */}
            {!otpVerified && (
              <Animatable.View animation="fadeInUp" duration={400} useNativeDriver>
                <View style={[s.actionBtn, { backgroundColor: 'rgba(0, 244, 245, 0.08)', borderWidth: 2, borderColor: '#00F4F5', padding: 0, overflow: 'hidden' }]}>
                  <View style={{ width: '100%' }}>
                    <Text style={{ fontSize: 13, color: '#00F4F5', fontWeight: '600', marginBottom: 12, paddingHorizontal: 16, paddingTop: 16 }}>
                      💬 ¿El cliente ya te pasó el código?
                    </Text>
                    <View style={{ 
                      flexDirection: 'row', 
                      paddingHorizontal: 16,
                      paddingBottom: 16,
                      gap: 8,
                    }}>
                      <TextInput
                        placeholder="Digita el código OTP"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={enteredOtp}
                        onChangeText={setEnteredOtp}
                        maxLength={6}
                        keyboardType="numeric"
                        style={{
                          flex: 1,
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: '#FFF',
                          fontSize: 16,
                          fontWeight: '600',
                          letterSpacing: 4,
                        }}
                      />
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#00F4F5',
                          paddingHorizontal: 14,
                          borderRadius: 8,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                        onPress={() => handleOTPMatch(String(enteredOtp).trim() === String(currentOtp).trim())}
                        disabled={loading || enteredOtp.length === 0}
                      >
                        <Ionicons name="checkmark" size={20} color="#00204a" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Animatable.View>
            )}

            {/* ⏱️ OTP Timer Countdown - Mostrar mientras espera */}
            {waitingForOtpTimer && driverCountdown !== null && driverCountdown > 0 && !otpVerified && (
              <Animatable.View 
                animation="pulse" 
                easing="ease-in-out-cubic" 
                iterationCount="infinite" 
                duration={1500}
                style={s.timerContainer}
              >
                <MaterialCommunityIcons name="clock-outline" size={32} color="#00E5FF" />
                <Text style={s.timerCountdown}>
                  {Math.floor(driverCountdown / 60)}:{(driverCountdown % 60).toString().padStart(2, '0')}
                </Text>
                <Text style={s.timerSubtext}>Código en...</Text>
              </Animatable.View>
            )}

            {/* 🔐 OTP Code Display + Input - Mostrar cuando timer expire */}
            {!waitingForOtpTimer && currentOtp && !otpVerified && (
              <Animatable.View animation="fadeInUp" duration={400} useNativeDriver>
                <View style={[s.actionBtn, { backgroundColor: 'rgba(0, 230, 118, 0.08)', borderWidth: 2, borderColor: '#00E676' }]}>
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <MaterialCommunityIcons name="lock-check" size={28} color="#00E676" />
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>CÓDIGO DE VERIFICACIÓN</Text>
                    <Text style={{ fontSize: 44, fontWeight: '800', color: '#00E676', letterSpacing: 8, fontFamily: 'monospace', marginTop: 8 }}>
                      {currentOtp}
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, textAlign: 'center' }}>
                      Digita este código para habilitar el inicio del viaje
                    </Text>
                  </View>
                </View>
              </Animatable.View>
            )}

            {/* ✅ OTP Verified indicator */}
            {otpVerified && (
              <Animatable.View animation="fadeInUp" duration={400} useNativeDriver>
                <View style={[s.actionBtn, { backgroundColor: 'rgba(0, 230, 118, 0.08)', borderWidth: 2, borderColor: '#00E676' }]}>
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <MaterialCommunityIcons name="lock-check" size={28} color="#00E676" />
                    <Text style={{ fontSize: 14, color: '#00E676', marginTop: 8, fontWeight: '700' }}>✓ CÓDIGO VERIFICADO</Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6, textAlign: 'center' }}>
                      Ya puedes iniciar el viaje
                    </Text>
                  </View>
                </View>
              </Animatable.View>
            )}

            {/* 🔐 OTP Verification Button - Mostrar después de timer y antes de verificar */}
            {!waitingForOtpTimer && !otpVerified && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#00E5FF' }]}
                onPress={() => setOtpModalVisible(true)}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#051A26" size="small" />
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={22} color="#051A26" />
                    <Text style={s.actionBtnTxt}>🔐 Ingresar Código</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Start Trip Button - Only enabled after OTP verified */}
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: otpVerified ? '#00E5FF' : 'rgba(255,255,255,0.15)', marginTop: 12 }]}
              onPress={handleStartTrip}
              disabled={loading || !otpVerified}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#051A26" size="small" />
              ) : (
                <>
                  <Ionicons 
                    name="car" 
                    size={22} 
                    color={otpVerified ? '#051A26' : 'rgba(255,255,255,0.3)'} 
                  />
                  <Text style={[s.actionBtnTxt, !otpVerified && { opacity: 0.5 }]}>
                    Iniciar Viaje
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {phase === 'TRIP_STARTED' && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#00E5FF' }]}
            onPress={handleEndTrip}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#051A26" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color="#051A26" />
                <Text style={s.actionBtnTxt}>Finalizar Viaje</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* 🔐 OTP Verification Modal */}
      {currentOtp && (
        <DriverOtpVerificationModal
          visible={otpModalVisible}
          correctOtp={currentOtp}
          customerName={reservation?.customer_name || 'Cliente'}
          onOtpVerified={() => handleOTPMatch(true)}
          onCancel={() => setOtpModalVisible(false)}
        />
      )}

      {/* Modal de Agora para llamadas - COMENTADO PARA EXPO GO */}
      {/* <AgoraCallModal
        visible={callManager.callActive}
        appId={AGORA_APP_ID || '8a0861d85c5d45e9813ee0b967e12d6c'}
        channel={callManager.channelName}
        token={callManager.token}
        uid={parseInt((user?.id || user?.auth_id || '0').replace(/\D/g, '')) || 0}
        userName={user?.first_name || user?.name || 'User'}
        onClose={() => {
          callManager.endCall();
        }}
      /> */}

      {/* 💵 Modal de precio total del servicio — primero al finalizar, antes de calificar */}
      <Modal
        transparent
        visible={priceModalVisible}
        animationType="fade"
        onRequestClose={() => setPriceModalVisible(false)}
      >
        <View style={s.ratingBackdrop}>
          <View style={s.ratingModalCard}>
            <View style={s.ratingHeader}>
              <Ionicons name="cash" size={28} color="#00E676" />
              <Text style={s.ratingTitle}>Viaje completado</Text>
            </View>
            <Text style={s.ratingSubtitle}>
              Precio total del servicio
            </Text>
            <Text style={{ color: '#00E676', fontSize: 40, fontWeight: '800', textAlign: 'center', marginVertical: 16 }}>
              ${(finalPrice ?? 0).toLocaleString('es-CO')}
            </Text>

            {/* 📊 Distancia y tiempo reales recalculados al cierre del viaje */}
            <View style={s.tripSummaryRow}>
              <View style={s.tripSummaryItem}>
                <Ionicons name="navigate" size={20} color="#4FC3F7" />
                <Text style={s.tripSummaryValue}>
                  {(finalDistanceKm ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} km
                </Text>
                <Text style={s.tripSummaryLabel}>Distancia</Text>
              </View>
              <View style={s.tripSummaryDivider} />
              <View style={s.tripSummaryItem}>
                <Ionicons name="time" size={20} color="#FFD54F" />
                <Text style={s.tripSummaryValue}>{formatTripDuration(finalTripSeconds)}</Text>
                <Text style={s.tripSummaryLabel}>Tiempo</Text>
              </View>
            </View>

            <Text style={s.ratingHint}>
              Este es el valor que le fue cobrado al pasajero — el mismo que verás reflejado en tu balance.
            </Text>

            <TouchableOpacity
              style={s.ratingSubmitBtn}
              onPress={() => { setPriceModalVisible(false); setRatingModalVisible(true); }}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={20} color="#051A26" />
              <Text style={s.ratingSubmitText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ⭐ Modal de calificación al cliente (obligatorio antes de finalizar) */}
      <Modal
        transparent
        visible={ratingModalVisible}
        animationType="fade"
        onRequestClose={() => { if (!submittingRating) setRatingModalVisible(false); }}
      >
        <View style={s.ratingBackdrop}>
          <View style={s.ratingModalCard}>
            <View style={s.ratingHeader}>
              <Ionicons name="star" size={28} color="#FFD700" />
              <Text style={s.ratingTitle}>Califica al cliente</Text>
            </View>
            <Text style={s.ratingSubtitle}>
              {reservation.customer_name || 'Cliente'}
            </Text>
            <Text style={s.ratingHint}>
              1 estrella = poco satisfecho · 5 estrellas = muy satisfecho
            </Text>

            <View style={s.ratingStarsWrap}>
              <StarRating
                maxStars={5}
                starSize={40}
                color="#FFD700"
                emptyColor="rgba(255,255,255,0.25)"
                rating={customerRating}
                onChange={(r: number) => setCustomerRating(Math.round(r))}
              />
              <Text style={s.ratingValue}>
                {customerRating > 0 ? `${customerRating} / 5` : 'Selecciona una calificación'}
              </Text>
            </View>

            <TextInput
              style={s.ratingInput}
              placeholder="Observaciones (opcional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              multiline
              value={customerReview}
              onChangeText={setCustomerReview}
              editable={!submittingRating}
            />

            <TouchableOpacity
              style={[
                s.ratingSubmitBtn,
                (customerRating < 1 || submittingRating) && s.ratingSubmitBtnDisabled,
              ]}
              onPress={submitCustomerRating}
              disabled={customerRating < 1 || submittingRating}
              activeOpacity={0.85}
            >
              {submittingRating ? (
                <ActivityIndicator color="#051A26" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#051A26" />
                  <Text style={s.ratingSubmitText}>
                    {customerRating < 1 ? 'Selecciona una calificación' : 'Continuar y finalizar viaje'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.ratingCancelBtn}
              onPress={() => setRatingModalVisible(false)}
              disabled={submittingRating}
            >
              <Text style={s.ratingCancelText}>Cancelar</Text>
            </TouchableOpacity>
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

export default ReservationTripScreen;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  /* Top bar */
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(5,26,38,0.85)',
  },
  topBarRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  topInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  phaseDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  topTitle: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  tripCodePill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
    gap: 6,
  },
  tripCodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },
  tripCodeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#00E5FF',
    letterSpacing: 2,
  },
  /* Bottom panel */
  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(5,26,38,0.95)',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 18,
    borderTopWidth: 1, borderTopColor: 'rgba(0,229,255,0.15)',
  },
  infoCard: { marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoName: { fontSize: 16, fontWeight: '700', color: '#FFF', flex: 1, marginLeft: 8 },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  customerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  callBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,230,118,0.12)', borderWidth: 1, borderColor: 'rgba(0,230,118,0.3)',
  },
  routeInfo: { marginBottom: 10 },
  routeRowItem: { flexDirection: 'row', alignItems: 'center' },
  routeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  routeDotStart: {
    width: 8, height: 8, borderRadius: 4, marginRight: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#00E5FF',
  },
  routeDotEnd: {
    width: 8, height: 8, borderRadius: 4, marginRight: 10,
    backgroundColor: '#E91E63', borderWidth: 1.5, borderColor: '#00E5FF',
  },
  routeText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', flex: 1, fontWeight: '500' },
  routeDash: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 3.5, marginVertical: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  metaItem: { fontSize: 12, color: '#00E5FF', fontWeight: '600' },
  metaDivider: { fontSize: 12, color: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  payIconBox: {
    width: 18, height: 18, borderRadius: 5, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  payIconBoxLg: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  priceHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    gap: 4,
  },
  priceHighlightText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#00E5FF',
  },
  /* Nav buttons */
  navRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 14, gap: 5,
    backgroundColor: 'rgba(0,229,255,0.15)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)',
  },
  navBtnActive: {
    backgroundColor: 'rgba(0,229,255,0.28)',
    borderColor: '#00E5FF',
  },
  navBtnWaze: { backgroundColor: 'rgba(51,153,255,0.15)', borderColor: 'rgba(51,153,255,0.3)' },
  navBtnTxt: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  navPuckIcon: { width: 18, height: 18 },
  mapZoomControls: {
    position: 'absolute',
    right: 14,
    zIndex: 30,
    gap: 10,
  },
  mapSideControls: {
    position: 'absolute',
    left: 14,
    zIndex: 30,
    gap: 10,
  },
  mapCtrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,46,61,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCtrlBtnOn: {
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0,229,255,0.22)',
  },
  mapCtrlPuck: { width: 26, height: 26 },
  /* Action buttons */
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, gap: 8,
    backgroundColor: '#00E5FF',
  },
  actionBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  actionBtnTxt: { fontSize: 16, fontWeight: '800', color: '#051A26' },
  actionBtnTxtDisabled: { color: 'rgba(255,255,255,0.3)' },
  distanceTxt: {
    position: 'absolute', right: 16, fontSize: 11, fontWeight: '600',
    color: 'rgba(5,26,38,0.6)',
  },
  /* ⏱️ OTP Timer Container */
  timerContainer: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, marginBottom: 16,
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1.5, borderColor: '#00E5FF',
    borderRadius: 16,
    gap: 8,
  },
  timerCountdown: {
    fontSize: 52, fontWeight: '900', color: '#00E5FF',
    letterSpacing: 2, fontFamily: 'monospace',
  },
  timerSubtext: {
    fontSize: 14, fontWeight: '600', color: '#AAA',
    marginTop: 4,
  },
  /* Markers */
  markerWrap: { alignItems: 'center' },
  markerDot: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
    elevation: 5,
  },
  markerLabel: {
    fontSize: 10, fontWeight: '700', color: '#FFF', marginTop: 2,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  routeEndpointStart: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#00E5FF',
  },
  routeEndpointEnd: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E91E63',
    borderWidth: 2.5,
    borderColor: '#00E5FF',
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
  /* 🆕 Price Card Styles */
  priceCard: {
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(0,229,255,0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  priceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  priceCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00E5FF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceCardAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#00E5FF',
    marginBottom: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  priceCardPayment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  priceCardPaymentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  priceCardNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  /* ⭐ Rating modal */
  ratingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  ratingModalCard: {
    width: '100%',
    backgroundColor: '#0B2230',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  ratingSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#00E5FF',
    marginBottom: 4,
  },
  ratingHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
  },
  tripSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 14,
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
  tripSummaryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  ratingStarsWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  ratingValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
    fontWeight: '600',
  },
  ratingInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    minHeight: 70,
    padding: 12,
    color: '#FFF',
    textAlignVertical: 'top',
    marginTop: 12,
    marginBottom: 14,
    fontSize: 14,
  },
  ratingSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  ratingSubmitBtnDisabled: {
    backgroundColor: 'rgba(0,229,255,0.35)',
  },
  ratingSubmitText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#051A26',
  },
  ratingCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  ratingCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
});


