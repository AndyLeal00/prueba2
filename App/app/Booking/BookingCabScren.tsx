import React, {
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions,
  Linking,
  Platform,
  Modal,
  useColorScheme,
  Animated,
  Switch,
  ScrollView,
  AppState,
  TextInput,
} from "react-native";
import StarRating from "react-native-star-rating-widget";
import Mapbox, { MapboxStyles } from '@/config/MapboxConfig';
import {
  Entypo,
  FontAwesome,
  FontAwesome5,
  Ionicons,
  MaterialIcons,
} from "@expo/vector-icons";
import { Icon } from "react-native-elements";
import SliderButton from "@/components/SliderButton";
import {
  BottomSheetModal,
  BottomSheetModalProvider,
} from "@gorhom/bottom-sheet";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSelector, useDispatch } from "react-redux";
import axios from "axios";
import supabase from "@/config/SupabaseConfig";
import OtpModal from "@/components/OtpModal";
import { RootState } from "@/common/store";
// import loadCar from "./../../assets/video/g4.gif"; // TODO: Verify if file exists
import {
  startBooking,
  endBooking,
  arriveBooking,
  updateLocation,
  reportIncident,
} from "@/common/store/bookingsSlice";
import { useDriverTracking } from "@/hooks/useDriverTracking";
import CountdownModal from "@/components/CountdownModal";
import { roundPrice } from "@/hooks/roundPrice";
import originIcon from "../../assets/images/rsz_2red_pin.png";
import destinationIcon from "../../assets/images/green_pin.png";
import driverCarIcon from "../../assets/images/track_Car.png";
import { colors } from "@/scripts/theme";
import { MAIN_COLOR } from "@/common/other/sharedFunctions";
import moment from "moment";
import { fonts } from "@/scripts/font";
import CancelModal from "@/components/CancelModal";
import {
  listenToSettingsChanges,
  selectSettings,
} from "@/common/reducers/settingsSlice";
// import RadioForm from "react-native-simple-radio-button";  // TODO: Fix type declarations

import { API_KEY, getMapboxAccessToken } from '@/config/AppConfig'; // Aseg�rate de importar la clave API
import MapSensor from "../(tabs)/mapaSensors";
import AntDesign from "@expo/vector-icons/AntDesign";
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import ServiceParameterSelector from '@/components/ServiceParameterSelector';
import {
  scheduleActiveTripNotification,
  cancelActiveTripNotification,
  stopBackgroundLocationUpdatesAsync,
  isActiveTripStatus,
  notifyTripStateChange,
} from '@/common/services/ActiveTripNotificationService';
import { calculateDistance, getEstimatedTime } from '@/common/services/DriverTrackingService';

const { width, height } = Dimensions.get("window");
const MAPBOX_ACCESS_TOKEN = getMapboxAccessToken();

const BookingCabScreen = () => {
  const route = useRoute() as any;
  const dispatch = useDispatch();
  const [currentBooking, setCurrentBooking] = useState(
    route.params?.booking as any || {} // Use an empty object as a fallback
  );

  const user: any = useSelector((state: RootState) => state.auth.user);
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const previousStatusRef = useRef(route.params?.booking?.status); // 🆕 Track previous status for transitions
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["60%", "70%"], []);
  const [driverLocation, setDriverLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<string | null>(null);
  const [distanceToDriver, setDistanceToDriver] = useState<number | null>(null);
  const [etaToPickup, setEtaToPickup] = useState<number | null>(null);
  const [routeToPickup, setRouteToPickup] = useState<any>(null);
  const [isDriverArrived, setIsDriverArrived] = useState(false);
  const navigation = useNavigation();
  const [isButtonDisabled, setIsButtonDisabled] = useState(true); // Estado para habilitar/deshabilitar el bot�n
  const [countdown, setCountdown] = useState(180); // 3 minutos en segundos
  const [showOtp, setShowOtp] = useState(false);
  const [isCountdownModalVisible, setIsCountdownModalVisible] = useState(false); // Nuevo estado para controlar la visibilidad del modal
  const [isCustomerArrivalModalVisible, setIsCustomerArrivalModalVisible] =
    useState(false);
  const [bookingViewers, setBookingViewers] = useState<any[]>([]);
  const [driverAccepted, setDriverAccepted] = useState(false);
  const [priceAdjustment, setPriceAdjustment] = useState(0);
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [autoConnect, setAutoConnect] = useState(true);
  const [serviceParameters, setServiceParameters] = useState({
    service: 'express',
    price: 0,
    specialRequests: '',
    requiresChildSeat: false,
    accessibilityNeeded: false,
  });

  const [userLocation, setUserLocation] = useState({
    latitude: user?.location?.lat,
    longitude: user?.location?.lng,
  });
  const [successModalVisible, setSuccessModalVisible] = useState(false);

  useEffect(() => {
    const manageActiveTripNotification = async () => {
      if (isActiveTripStatus(currentBooking?.status)) {
        await scheduleActiveTripNotification(currentBooking, user?.usertype === 'driver' ? 'driver' : 'customer');
        
        // 🆕 Notify on state change
        if (previousStatusRef.current !== currentBooking?.status) {
          const role = user?.usertype === 'driver' ? 'driver' : 'customer';
          console.log(`🔔 [NOTIFICACIÓN ${role.toUpperCase()}] Estado cambió: ${previousStatusRef.current} → ${currentBooking?.status}`);
          await notifyTripStateChange(currentBooking, role, previousStatusRef.current);
          previousStatusRef.current = currentBooking?.status;
        }
      } else {
        await cancelActiveTripNotification();
        await stopBackgroundLocationUpdatesAsync();
      }
    };

    manageActiveTripNotification();
    return () => {
      cancelActiveTripNotification();
    };
  }, [currentBooking?.status, currentBooking?.id, user?.usertype]);

  const [unreadMessages, setUnreadMessages] = useState(false);
  const settings = useSelector(selectSettings);
  const [isIncidentModalVisible, setIsIncidentModalVisible] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const colorScheme = useColorScheme(); // Hook para detectar si es modo oscuro o claro
  const [fadeAnim] = useState(new Animated.Value(0)); // Animaci�n de fade
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] =
    useState(false);
  const [customerRating, setCustomerRating] = useState(0);
  const [customerReview, setCustomerReview] = useState("");
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info' | 'confirm'>('error');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);
  const onAlertDismissRef = useRef<(() => void) | null>(null);
  const showAlert = (type: 'success' | 'error' | 'warning' | 'info' | 'confirm', title: string, message: string, buttons?: AlertButton[], onDismiss?: () => void) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons || [{ text: 'OK', onPress: () => setAlertVisible(false) }]);
    onAlertDismissRef.current = onDismiss ?? null;
    setAlertVisible(true);
  };
  const incidentOptions = [
    { label: "Falla Mecanica (Parcial)", value: "Falla Mecanica (Parcial)" },

    {
      label: "Accidente de Tr�nsito (Fotos Requeridas)",
      value: "Accidente de Tr�nsito con Heridos (Fotos Requeridas)",
    },
    {
      label:
        "Tome el servicio por error y no alcanzo a llegar a cumplir con la reserva.",
      value:
        "Tome el servicio por error y no alcanzo a llegar a cumplir con la reserva.",
    },

    { label: "Falla Mecanica (Total)", value: "Falla Mecanica (Total)" },
    { label: "Falla Electrica", value: "Falla Electrica" },
    { label: "Otros", value: "Otros" },
    // Agrega m�s opciones seg�n sea necesario
  ];
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  useEffect(() => {
    // Start listening to settings changes
    dispatch(listenToSettingsChanges());
  }, [dispatch]);

  // Supabase Realtime Presence: track drivers viewing this booking
  useEffect(() => {
    if (!currentBooking?.id) return;
    const presenceChannel = supabase.channel(`booking-presence-${currentBooking.id}`, {
      config: { presence: { key: user?.id || 'anonymous' } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const viewers = Object.values(state).flat().filter((v: any) => v.usertype === 'driver');
        setBookingViewers(viewers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: user?.id,
            user_name: user?.firstName || user?.first_name || 'Usuario',
            user_image: user?.profile_image || null,
            usertype: user?.usertype || 'customer',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => { supabase.removeChannel(presenceChannel); };
  }, [currentBooking?.id, user?.id]);

  // Detect when a driver accepts the booking
  useEffect(() => {
    if (currentBooking?.status === 'ACCEPTED' || currentBooking?.status === 'ARRIVED' || currentBooking?.status === 'STARTED') {
      setDriverAccepted(true);
    }
  }, [currentBooking?.status]);
  useEffect(() => {
    if (!currentBooking?.id) return;
    // Subscribe to chat messages via Supabase
    const channel = supabase
      .channel(`chat-${currentBooking.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `id_reserva=eq.${currentBooking.id}`,
      }, (payload) => {
        if (payload.new && (payload.new as any).source !== user?.usertype) {
          setUnreadMessages(true);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentBooking?.id]);

  const isTrackingActive =
    user?.usertype === "driver" &&
    (currentBooking?.status === "ACCEPTED" ||
      currentBooking?.status === "ARRIVED" ||
      currentBooking?.status === "STARTED");

  useDriverTracking(
    currentBooking?.id ?? null,
    user?.id ?? user?.uid ?? null,
    isTrackingActive
  );

  useEffect(() => {
    if (currentBooking?.status === "ARRIVED") {
      setIsCountdownModalVisible(true); // Mostrar modal cuando el estado es ARRIVED
    }
  }, [currentBooking?.status]);
  useEffect(() => {
    if (currentBooking?.status === "NEW" && user?.usertype === "driver") {
      navigation.navigate("HomeScreen");
    }
  }, [currentBooking?.status, user?.usertype]);
  useEffect(() => {
    if (user?.location && currentBooking?.pickup) {
      const distance = getDistanceFromLatLonInMeters(
        user.location.lat,
        user.location.lng,
        currentBooking.pickup.lat,
        currentBooking.pickup.lng
      );
      // //console.log("aaaaaa", distance);
      if (distance <= 500) {
        //  //console.log("si esta dentro del rango");
        setIsButtonDisabled(false); // Habilitar el bot�n si est� dentro de 500 metros
      } else {
        setIsButtonDisabled(true); // Deshabilitar el bot�n si est� m�s lejos
      }
    }
  }, [user?.location, currentBooking?.pickup]);

  useEffect(() => {
    if (
      currentBooking?.status === "ARRIVED" &&
      currentBooking?.driver_arrived_time
    ) {
      const driverArrivedTime = new Date(
        currentBooking.driver_arrived_time
      ).getTime();
      const currentTime = Date.now();
      const timeElapsed = (currentTime - driverArrivedTime) / 1000; // Tiempo transcurrido en segundos
      const initialCountdown = 180; // 3 minutos en segundos

      // Calcula el tiempo restante
      const remainingTime = initialCountdown - timeElapsed;

      if (remainingTime > 0) {
        setCountdown(remainingTime);

        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              setShowOtp(true);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        return () => clearInterval(timer);
      } else {
        setCountdown(0);
        setShowOtp(true); // Mostrar OTP inmediatamente si el tiempo ya expir�
      }
    }
  }, [currentBooking?.status, currentBooking?.driver_arrived_time]);

  // Supabase realtime subscription for booking updates
  useEffect(() => {
    if (!currentBooking?.id) return;
    const channel = supabase
      .channel(`booking-cab-${currentBooking.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'reserva',
        filter: `id=eq.${currentBooking.id}`,
      }, (payload) => {
        if (payload.new) {
          // Map Supabase fields back to the booking format
          const updated = {
            ...currentBooking,
            ...payload.new,
            pickup: {
              lat: payload.new.pickup_lat ?? payload.new.origen_lat ?? currentBooking.pickup?.lat,
              lng: payload.new.pickup_lng ?? payload.new.origen_lng ?? currentBooking.pickup?.lng,
              add: payload.new.pickup_address ?? payload.new.origen_direccion ?? currentBooking.pickup?.add,
            },
            drop: {
              lat: payload.new.drop_lat ?? payload.new.destino_lat ?? currentBooking.drop?.lat,
              lng: payload.new.drop_lng ?? payload.new.destino_lng ?? currentBooking.drop?.lng,
              add: payload.new.drop_address ?? payload.new.destino_direccion ?? currentBooking.drop?.add,
            },
          };
          setCurrentBooking(updated);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentBooking?.id]);

  // Refresh booking status when the app comes to foreground (catches missed realtime updates)
  useEffect(() => {
    if (!currentBooking?.id) return;
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const { data } = await supabase
          .from('bookings')
          .select('status, cancelled_by')
          .eq('id', currentBooking.id)
          .single();
        const row = data as any;
        if (row && row.status !== currentBooking.status) {
          setCurrentBooking((prev: any) => ({ ...prev, status: row.status, cancelled_by: row.cancelled_by }));
        }
      }
    });
    return () => subscription.remove();
  }, [currentBooking?.id]);

  // Handle booking status transitions
  const exitFlowRanRef = useRef(false);
  useEffect(() => {
    if (currentBooking?.status === "CANCELLED") {
      if (exitFlowRanRef.current) return;
      exitFlowRanRef.current = true;

      const exitFlow = () => {
        navigation.navigate('HomeScreen' as never);
      };
      const cancelledByCustomer =
        (currentBooking as any)?.cancelled_by === "customer";
      const isDriver = user?.usertype === "driver";
      if (isDriver && cancelledByCustomer) {
        const customerName = currentBooking?.customer_name || "El cliente";
        const reference = (currentBooking as any)?.reference;
        const refLine = reference ? `\nReserva: ${reference}` : "";
        showAlert(
          "warning",
          "Viaje cancelado por el cliente",
          `${customerName} canceló el viaje.${refLine}\n\nSe cerrará esta pantalla.`,
          [{ text: "Entendido", onPress: () => { setAlertVisible(false); exitFlow(); } }],
          exitFlow,
        );
      } else {
        exitFlow();
      }
    } else if (currentBooking?.status === "PENDING") {
      navigation.goBack();
    } else if (currentBooking?.status === "REACHED") {
      navigation.navigate("Payment", { booking: { ...currentBooking } });
    }
  }, [currentBooking?.status]);

  // Supabase realtime subscription for driver tracking (booking_tracking table)
  useEffect(() => {
    if (!currentBooking?.id) return;
    if (currentBooking?.status !== 'ACCEPTED' && currentBooking?.status !== 'ARRIVED' && currentBooking?.status !== 'STARTED') return;

    const setupTracking = async () => {
      try {
        // Seed with the latest known point so the marker appears immediately
        const { data: latest, error: latestError } = await supabase
          .from('booking_tracking')
          .select('lat, lng, created_at')
          .eq('booking_id', currentBooking.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestError) {
          console.warn('[tracking] Initial fetch error:', latestError.message);
        } else if (latest?.lat != null && latest?.lng != null) {
          console.log('[tracking] Seeded with latest point:', latest);
          setDriverLocation({ latitude: Number(latest.lat), longitude: Number(latest.lng) });
        }
      } catch (err) {
        console.error('[tracking] Seed error:', err);
      }
    };

    setupTracking();

    console.log('[tracking][customer] subscribing', { bookingId: currentBooking.id, status: currentBooking.status });
    const channel = supabase
      .channel(`booking_tracking_${currentBooking.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reserva_tracking',
          filter: `id_reserva=eq.${currentBooking.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          console.log('[tracking][customer] new point received:', row);
          if (row?.lat != null && row?.lng != null) {
            const newLocation = {
              latitude: Number(row.lat),
              longitude: Number(row.lng),
            };
            setDriverLocation(newLocation);

            // Calculate distance from customer to driver (if customer view)
            if (user?.usertype === 'customer' && user?.location?.lat && user?.location?.lng) {
              const dist = calculateDistance(
                user.location.lat,
                user.location.lng,
                newLocation.latitude,
                newLocation.longitude
              );
              setDistanceToDriver(dist);
              console.log('[tracking] Distance to driver:', dist, 'km');
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[tracking][customer] channel status:', status);
      });

    return () => {
      console.log('[tracking] Unsubscribing');
      supabase.removeChannel(channel);
    };
  }, [currentBooking?.status, currentBooking?.id, user?.location?.lat, user?.location?.lng, user?.usertype]);

  useEffect(() => {
    if (!cameraRef.current || !driverLocation) return;
    const pickupLat = currentBooking?.pickup?.lat;
    const pickupLng = currentBooking?.pickup?.lng;
    const isCustomerTrackingDriver =
      user?.usertype === 'customer' &&
      currentBooking?.status === 'ACCEPTED' &&
      typeof pickupLat === 'number' &&
      typeof pickupLng === 'number';

    if (isCustomerTrackingDriver) {
      const lats = [driverLocation.latitude, pickupLat];
      const lngs = [driverLocation.longitude, pickupLng];
      const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
      const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
      cameraRef.current.fitBounds(ne, sw, [140, 60, 260, 60], 1000);
    } else {
      cameraRef.current.setCamera({
        centerCoordinate: [driverLocation.longitude, driverLocation.latitude],
        pitch: 70,
        zoomLevel: 17,
        animationDuration: 1000,
      });
    }
  }, [driverLocation, currentBooking?.pickup?.lat, currentBooking?.pickup?.lng, currentBooking?.status, user?.usertype]);

  // Calculate ETA and distance from driver to pickup
  useEffect(() => {
    if (!driverLocation || !currentBooking?.pickup) return;
    if (user?.usertype !== 'customer' || currentBooking?.status !== 'ACCEPTED') return;

    const calculateETA = async () => {
      try {
        const result = await getEstimatedTime(
          driverLocation.latitude,
          driverLocation.longitude,
          currentBooking.pickup.lat,
          currentBooking.pickup.lng,
          MAPBOX_ACCESS_TOKEN
        );

        if (result) {
          const distanceToPickup = result.distance;
          const durationToPickup = result.duration;
          
          setEstimatedDistance(`${distanceToPickup.toFixed(1)} km`);
          setEstimatedTime(`${durationToPickup} min${durationToPickup !== 1 ? 's' : ''}`);
          setEtaToPickup(durationToPickup);
          
          console.log('[ETA] Distance:', distanceToPickup.toFixed(1), 'km, Duration:', durationToPickup, 'mins');
        }
      } catch (error) {
        console.error('[ETA] Error calculating ETA:', error);
      }
    };

    // Calculate ETA every 30 seconds or when driver location changes
    const timer = setInterval(calculateETA, 30000);
    calculateETA(); // Calculate immediately

    return () => clearInterval(timer);
  }, [driverLocation, currentBooking?.pickup, currentBooking?.status, user?.usertype]);

  const handleStartTrip = () => {
    if (currentBooking?.status === "CANCELLED") {
      return showAlert(
        'warning',
        'Viaje cancelado',
        'El cliente canceló el viaje. No es posible iniciarlo.'
      );
    }
    // OTP only for customers; drivers don't need to verify OTP
    if (user?.usertype === 'driver') return;
    setOtpModalVisible(true);

    if (Platform.OS === "android") {
      // L�gica espec�fica para Android relacionada con heading o rotaci�n si es necesario
    }
  };

  const handleOtpMatch = async (isMatch: boolean) => {
    setOtpModalVisible(false); // Cierra el modal
    if (isMatch) {
      if (
        !user ||
        (currentBooking?.status !== "ACCEPTED" &&
          currentBooking?.status !== "ARRIVED")
      ) {
        return showAlert('error', 'Error', 'No se puede iniciar el viaje.');
      }
      try {
        await dispatch(
          startBooking({ booking: currentBooking, driverProfile: user })
        ).unwrap();
        <CountdownModal
          visible={isCountdownModalVisible}
          countdown={countdown}
          otp={currentBooking?.otp}
          onClose={() => setIsCountdownModalVisible(false)} // Cerrar el modal
        />;
        // Enviar notificaci�n
        fetch(
          "https://us-central1-treasupdate.cloudfunctions.net/sendMassNotification",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tokens: [currentBooking.customer_token],
              title: `�${currentBooking.customer_name} Tu viaje ha comenzado!`,
              body: `�Hola ${currentBooking.customer_name}! xaS Tu emocionante viaje ha comenzado. �Prep�rate para una experiencia incre�ble!`,
            }),
          }
        )
          .then((response) => response.json())
          .then((data) => {
            console.log("Notificaci�n enviada:", data);
          })
          .catch((error) => {
            console.error("Error al enviar la notificaci�n:", error);
          });

        setSuccessModalVisible(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();

        // Cerrar el modal despu�s de 2 segundos
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => setSuccessModalVisible(false));
        }, 2000);
      } catch (error) {
        showAlert('error', 'Error', `No se pudo iniciar el viaje: ${error}`);
      }
    } else {
      showAlert('error', 'C�digo incorrecto', 'El c�digo OTP no coincide.');
    }
  };
  const handleCustomerArrival = () => {
    setIsCustomerArrivalModalVisible(true);
  };
  const confirmCustomerArrival = async () => {
    const arrivedTime = new Date().toISOString();

    try {
      const updatedBooking = {
        ...currentBooking,
        customer_arrived_time: arrivedTime,
      };

      // Actualizar la reserva en la base de datos
      const bookingId = currentBooking.uid || currentBooking.id;
      await supabase
        .from('bookings')
        .update({ customer_arrived_time: arrivedTime } as any)
        .eq('id', bookingId);

      setCurrentBooking(updatedBooking);
      setIsCustomerArrivalModalVisible(false);
      showAlert(
        'success',
        '�xito',
        'Tu llegada ha sido confirmada. El conductor ahora puede iniciar el viaje sin ti.'
      );
    } catch (error) {
      showAlert(
        'error',
        'Error',
        'No se pudo confirmar tu llegada. Int�ntalo de nuevo.'
      );
    }
  };

  const handleEndTrip = async () => {
    //  console.log("Current user object:", user); // Log the full user object

    if (currentBooking?.status === "CANCELLED") {
      return showAlert(
        'warning',
        'Viaje cancelado',
        'El cliente canceló el viaje. No es posible finalizarlo.'
      );
    }

    if (!user.location || !user.location.lat || !user.location.lng) {
      showAlert(
        'error',
        'Error',
        'No se pudo finalizar el viaje: Driver Location data is missing'
      );
      return;
    }

    setIsConfirmationModalVisible(true);
  };

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleArrived = async () => {
    // Verify current status from DB to catch cancellations the realtime may have missed
    const { data: latestRow } = await supabase
      .from('bookings')
      .select('status, cancelled_by')
      .eq('id', currentBooking.id)
      .single();
    const latest = latestRow as any;
    if (latest?.status === 'CANCELLED') {
      setCurrentBooking((prev: any) => ({ ...prev, status: 'CANCELLED', cancelled_by: latest.cancelled_by }));
      return showAlert(
        'warning',
        'Viaje cancelado',
        'El cliente canceló el viaje. No es posible confirmar la llegada.'
      );
    }
    if (isButtonDisabled) {
      showAlert(
        'warning',
        'Demasiado lejos',
        'No puedes confirmar la llegada porque est�s demasiado lejos del punto de inicio.'
      );
      return;
    }

    try {
      const result = await dispatch(arriveBooking(currentBooking)).unwrap();
      // Enviar notificaci�n
      fetch(
        "https://us-central1-treasupdate.cloudfunctions.net/sendMassNotification",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tokens: [currentBooking.customer_token],
            title: `�${currentBooking.customer_name}, tu conductor ha llegado!`,
            body: `Hola ${currentBooking.customer_name}, tu conductor ${user.firstName} ${user.lastName} ha llegado al punto de encuentro. Tienes 3 minutos para llegar al punto de recogida. Pasado este tiempo, el conductor podr� iniciar el viaje y se empezar� a contar el costo del servicio. �Gracias por elegirnos!`,
          }),
        }
      )
        .then((response) => response.json())
        .then((data) => {
          console.log("Notificaci�n enviada:", data);
        })
        .catch((error) => {
          console.error("Error al enviar la notificaci�n:", error);
        });
      setIsDriverArrived(true);
    } catch (error) {
      showAlert('error', 'Error', `No se pudo finalizar el viaje: ${error}`);
    }
  };

  const onPressCall = () => {
    if (user.usertype === "customer") {
      let call_link =
        Platform.OS == "android"
          ? "tel:" + currentBooking.driver_contact
          : "telprompt:" + currentBooking.driver_contact;
      Linking.openURL(call_link);
    } else if (user.usertype === "driver") {
      let call_link =
        Platform.OS == "android"
          ? "tel:" + currentBooking.customer_contact
          : "telprompt:" + currentBooking.customer_contact;
      Linking.openURL(call_link);
    }
  };

  const openWhatsApp = () => {
    handleOpenOnlineChat();
  };

  const handleReporIncident = () => {
    setIsIncidentModalVisible(true);
  };

  const [modalVisible, setModalVisible] = useState(false);

  const handleOpenCancelModal = () => {
    if (!currentBooking || !currentBooking.id) {
      showAlert(
        'warning',
        'Atenci�n',
        'Vuelve a entrar a la reserva para cancelar.',
        [
          {
            text: 'OK',
            onPress: () => {
              setAlertVisible(false);
              navigation.navigate('CustMap');
            },
          },
        ]
      );
      return;
    } else {
      setModalVisible(true);
    }

    // Si hay un ID v�lido, mostramos el modal
    setModalVisible(true);
  };
  const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceInKm = R * c; // Distancia en km
    return distanceInKm * 1000; // Distancia en metros
  };
  const startNavigation = () => {
    let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving";
    let bookingData = currentBooking;
    if (bookingData.status == "ACCEPTED") {
      url =
        url +
        "&destination=" +
        bookingData.pickup.lat +
        "," +
        bookingData.pickup.lng;
      Linking.openURL(url);
    } else if (bookingData.status == "STARTED") {
      if (
        bookingData.waypoints &&
        bookingData.waypoints.length &&
        bookingData.waypoints.length > 0
      ) {
        let abc =
          url +
          "&destination=" +
          bookingData.drop.lat +
          "," +
          bookingData.drop.lng +
          "&waypoints=";
        if (bookingData.waypoints.length > 1) {
          for (let i = 0; i < bookingData.waypoints.length; i++) {
            let obj = bookingData.waypoints[i];
            if (i < bookingData.waypoints.length - 1) {
              abc = abc + obj.lat + "," + obj.lng + "%7C";
            } else {
              abc = abc + obj.lat + "," + obj.lng;
            }
          }
          Linking.openURL(abc);
        } else {
          url =
            url +
            "&destination=" +
            bookingData.drop.lat +
            "," +
            bookingData.drop.lng +
            "&waypoints=" +
            bookingData.waypoints[0].lat +
            "," +
            bookingData.waypoints[0].lng;
          Linking.openURL(url);
        }
      } else {
        url =
          url +
          "&destination=" +
          bookingData.drop.lat +
          "," +
          bookingData.drop.lng;
        Linking.openURL(url);
      }
    } else {
      showAlert('info', 'Info', 'Navegaci�n disponible');
    }
  };

  const startNavigationWaze = () => {
    let url = "";
    
    if (currentBooking.status === "ACCEPTED") {
      // Utilizar las coordenadas de recogida
      url = `https://www.waze.com/ul?ll=${currentBooking.pickup.lat},${currentBooking.pickup.lng}&navigate=yes&zoom=17`;
    } else if (currentBooking.status === "STARTED") {
      // Utilizar las coordenadas de destino
      url = `https://www.waze.com/ul?ll=${currentBooking.drop.lat},${currentBooking.drop.lng}&navigate=yes&zoom=17`;
    } else {
      showAlert('warning', 'Alerta', 'Navegaci�n no disponible en este estado.');
      return;
    }
  
    // Navegar a la pantalla del WebView con la URL
    navigation.navigate("NavigationWebView", { url });
  };

  const [lastLocation, setLastLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [lastBearing, setLastBearing] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0); // Direcci�n actual del mapa
  const smoothFactor = 0.01; // Factor de suavizado

  const calculateBearing = (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ): number => {
    const startLat = (start.latitude * Math.PI) / 180;
    const startLng = (start.longitude * Math.PI) / 180;
    const endLat = (end.latitude * Math.PI) / 180;
    const endLng = (end.longitude * Math.PI) / 180;

    const dLon = endLng - startLng;

    const y = Math.sin(dLon) * Math.cos(endLat);
    const x =
      Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);

    let bearing = Math.atan2(y, x) * (180 / Math.PI);
    bearing = (bearing + 360) % 360; // Normalizar a 0-360 grados

    return bearing;
  };

  // Monitorear cambios en la ubicaci�n para ajustar el rumbo
  useEffect(() => {
    if (Platform.OS !== "android") return; // Solo para Android

    if (userLocation) {
      if (lastLocation) {
        const newBearing = calculateBearing(lastLocation, userLocation);
        const bearingChange = Math.abs(newBearing - lastBearing);

        const normalizedChange =
          bearingChange > 180 ? 360 - bearingChange : bearingChange;

        const UMBRAL_CAMBIO = 10; // Grados de cambio para considerar un giro

        if (normalizedChange > UMBRAL_CAMBIO) {
          // Aplicar suavizado si es necesario
          const smoothedBearing =
            lastBearing * (1 - smoothFactor) + newBearing * smoothFactor;
          setHeading(smoothedBearing);
          setLastBearing(smoothedBearing);
        }
        // Si el cambio es menor que el umbral, mantener el rumbo actual
      }

      // Actualizar la �ltima ubicaci�n
      setLastLocation(userLocation);
    }
  }, [userLocation]);

  // Ajustar la c�mara del mapa basado en el nuevo rumbo
  useEffect(() => {
    if (Platform.OS !== "android") return; // Solo para Android

    if (cameraRef.current && userLocation) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        pitch: 40,
        heading: heading, // Utilizar el �ngulo calculado
        zoomLevel: 18,
        animationDuration: 500,
      });
      console.log("Camera updated with heading:", heading);
    }
  }, [heading, userLocation]);

  // Suscripci�n al giroscopio para obtener el heading

  useEffect(() => {
    if (!driverLocation || !currentBooking) return;

    let destLat: number | undefined;
    let destLng: number | undefined;
    if (currentBooking.status === "ACCEPTED") {
      destLat = currentBooking.pickup?.lat;
      destLng = currentBooking.pickup?.lng;
    } else if (currentBooking.status === "STARTED") {
      destLat = currentBooking.drop?.lat;
      destLng = currentBooking.drop?.lng;
    }
    if (typeof destLat !== 'number' || typeof destLng !== 'number') return;

    let cancelled = false;
    const fetchRoute = async () => {
      try {
        const origin = `${driverLocation.longitude},${driverLocation.latitude}`;
        const destination = `${destLng},${destLat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin};${destination}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const response = await axios.get(url);
        if (cancelled) return;
        const route = response.data?.routes?.[0];
        if (!route) return;
        setRouteToPickup({
          type: 'Feature',
          geometry: route.geometry,
          properties: {},
        });
        const minutes = Math.max(1, Math.round(route.duration / 60));
        setEstimatedTime(minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`);
        const km = route.distance / 1000;
        setEstimatedDistance(km < 1 ? `${Math.round(route.distance)} m` : `${km.toFixed(1)} km`);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          console.error("Mapbox Directions error:", error.response.data);
        }
      }
    };

    fetchRoute();
    const intervalId = setInterval(fetchRoute, 25000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [driverLocation, currentBooking?.status, currentBooking?.pickup?.lat, currentBooking?.pickup?.lng, currentBooking?.drop?.lat, currentBooking?.drop?.lng]);

  const determineTripType = (pickup: any, drop: any) => {
    if (
      !pickup ||
      !drop ||
      !pickup.lat ||
      !pickup.lng ||
      !drop.lat ||
      !drop.lng
    ) {
      return "Ubicaciones no disponibles";
    }

    const cityLimits = {
      northEast: { latitude: 4.8, longitude: -73.9 },
      southWest: { latitude: 4.5, longitude: -74.2 },
    };

    const isWithinCityLimits = (location: any) => {
      return (
        location.lat >= cityLimits.southWest.latitude &&
        location.lat <= cityLimits.northEast.latitude &&
        location.lng >= cityLimits.southWest.longitude &&
        location.lng <= cityLimits.northEast.longitude
      );
    };

    const isUrban = isWithinCityLimits(pickup) && isWithinCityLimits(drop);
    return isUrban ? "Urbano" : "Intermunicipal";
  };

  useEffect(() => {
    if (currentBooking.id) {
      // console.log("ID de la reserva actual:", currentBooking.id); // Verifica que el id est� presente
    } else {
      console.error("La reserva actual no tiene un ID.");
    }
  }, [currentBooking]);
  const handleOpenOnlineChat = () => {
    if (currentBooking.id) {
      const role = user?.usertype === "driver" ? "driver" : "customer";
      const myName =
        role === "driver"
          ? currentBooking.driver_name ||
            [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
            "Conductor"
          : currentBooking.customer_name ||
            [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
            "Cliente";
      navigation.navigate("Chat", {
        bookingId: currentBooking.id,
        myRole: role,
        myName,
        senderId:
          role === "driver"
            ? currentBooking.driver || user?.id || user?.uid
            : currentBooking.customer || user?.id || user?.uid,
        otherName:
          role === "driver"
            ? currentBooking.customer_name || "Cliente"
            : currentBooking.driver_name || "Conductor",
      });
    } else {
      showAlert('error', 'Error', 'ID de reserva no disponible.');
    }
  };

  const navigationSecurity = (currentBooking: any) => {
    if (!currentBooking) {
      console.error("currentBooking es undefined");
      return; // Salir de la funci�n si currentBooking es undefined
    }

    const booking = currentBooking;
    console.log(booking);
    navigation.navigate("Segurity", { booking, estimatedTime, estimatedDistance });
  };
  const handleReportIncident = () => {
    if (!currentBooking.id || !selectedIncident) {
      console.error("Booking ID or incident not available");
      return;
    }
    dispatch(
      reportIncident({
        bookingId: currentBooking.id,
        incident: selectedIncident,
      })
    ).then((response: any) => {
      if (response.error) {
        console.error("Error reporting incident:", response.error.message);
      } else {
        console.log("Incidencia reportada con �xito:", selectedIncident);
      }
    });
    setIsIncidentModalVisible(false);
  };

  const darkMapStyle = [
    {
      elementType: "geometry",
      stylers: [
        {
          color: "#212121",
        },
      ],
    },
    {
      elementType: "labels.icon",
      stylers: [
        {
          visibility: "off",
        },
      ],
    },
    {
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      elementType: "labels.text.stroke",
      stylers: [
        {
          color: "#212121",
        },
      ],
    },
    {
      featureType: "administrative",
      elementType: "geometry",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      featureType: "administrative.country",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#9e9e9e",
        },
      ],
    },
    {
      featureType: "administrative.land_parcel",
      stylers: [
        {
          visibility: "off",
        },
      ],
    },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#bdbdbd",
        },
      ],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [
        {
          color: "#181818",
        },
      ],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#616161",
        },
      ],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.stroke",
      stylers: [
        {
          color: "#1b1b1b",
        },
      ],
    },
    {
      featureType: "road",
      elementType: "geometry.fill",
      stylers: [
        {
          color: "#2c2c2c",
        },
      ],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#8a8a8a",
        },
      ],
    },
    {
      featureType: "road.arterial",
      elementType: "geometry",
      stylers: [
        {
          color: "#373737",
        },
      ],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [
        {
          color: "#3c3c3c",
        },
      ],
    },
    {
      featureType: "road.highway.controlled_access",
      elementType: "geometry",
      stylers: [
        {
          color: "#4e4e4e",
        },
      ],
    },
    {
      featureType: "road.local",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#616161",
        },
      ],
    },
    {
      featureType: "transit",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#757575",
        },
      ],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [
        {
          color: "#000000",
        },
      ],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [
        {
          color: "#3d3d3d",
        },
      ],
    },
  ];
  const finalizarReserva = async (currentBooking: any, user: any) => {
    if (customerRating < 1) {
      showAlert(
        'warning',
        'Calificación requerida',
        'Por favor califica al cliente con 1 a 5 estrellas antes de finalizar el viaje.'
      );
      return;
    }
    setIsConfirmationModalVisible(false);
    try {
      // Guardar calificación del cliente (por parte del conductor) en Supabase
      try {
        await supabase
          .from('bookings')
          .update({
            customer_rating: customerRating,
            customer_review: customerReview || null,
          } as any)
          .eq('id', currentBooking.id);

        // Actualizar el promedio de calificación del cliente en users
        const { data: pastBookings } = await supabase
          .from('bookings')
          .select('customer_rating')
          .eq('customer', currentBooking.customer)
          .not('customer_rating', 'is', null);
        if (pastBookings?.length) {
          const avg = (
            pastBookings.reduce(
              (s: number, b: any) => s + (b.customer_rating || 0),
              0
            ) / pastBookings.length
          ).toFixed(1);
          await supabase
            .from('users')
            .update({ rating: avg } as any)
            .eq('id', currentBooking.customer);
        }
      } catch (e) {
        console.error('Error al guardar calificación del cliente:', e);
      }

      const bookingWithRating = {
        ...currentBooking,
        customer_rating: customerRating,
        customer_review: customerReview,
      };

      const result = await dispatch(
        endBooking({ booking: bookingWithRating, driverProfile: user })
      ).unwrap(); // Aseg�rate de que driverProfile se pase como user

      if (result && result.status === "REACHED") {
        let booking = { ...result };
        // Enviar notificaci�n

        fetch(
          "https://us-central1-treasupdate.cloudfunctions.net/sendMassNotification",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tokens: [currentBooking.customer_token],
              title: `�Has llegado a tu destino!`,
              body: `Hola ${currentBooking.customer_name}, Has llegado a tu destino ${currentBooking.dropAddress}.`,
            }),
          }
        )
          .then((response) => response.json())
          .then((data) => {
            console.log("Notificaci�n enviada:", data);
          })
          .catch((error) => {
            console.error("Error al enviar la notificaci�n:", error);
          });

        navigation.navigate("Payment", { booking });
      } else {
        showAlert('error', 'Error', 'No se pudo finalizar la reserva correctamente.');
      }
    } catch (error) {
      showAlert(
        'error',
        'Error',
        `No se pudo finalizar el viaje: ${(error as any)?.message || error}`
      );
    }
  };

  useEffect(() => {
    if (user?.location && currentBooking?.drop) {
      console.log("Origen:", user.location.lat, user.location.lng);
      console.log("Destino:", currentBooking.drop.lat, currentBooking.drop.lng);
    } else {
      console.warn("Las coordenadas de origen o destino no est�n disponibles.");
    }
  }, [user, currentBooking]);

  return (
    <BottomSheetModalProvider>
      <View style={styles.container}>
        <View
          style={{
            position: "absolute",
            top: 15,
            left: 15,
            zIndex: 10,
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={{
              backgroundColor: "#00E5FF",
              borderRadius: 100,
              width: 40,
              height: 40,
              justifyContent: "center",
              alignItems: "center",
            }}
            onPress={() => navigation.goBack()} // Cambia 'NombreDeLaPantalla' por el nombre de la pantalla a la que deseas navegar
          >
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {user?.usertype === "driver" ? (
            <>
              <MapSensor>
                <Mapbox.PointAnnotation
                  id="destination-marker"
                  coordinate={[currentBooking?.drop?.lng || 0, currentBooking?.drop?.lat || 0]}
                  title="Punto de Destino"
                >
                  <View>
                    <Image source={destinationIcon} style={{ width: 26, height: 50 }} />
                  </View>
                </Mapbox.PointAnnotation>

                {currentBooking?.status === "ACCEPTED" && (
                  <>
                    <Mapbox.PointAnnotation
                      id="origin-marker"
                      coordinate={[currentBooking?.pickup?.lng || 0, currentBooking?.pickup?.lat || 0]}
                      title="Punto de Origen"
                    >
                      <View>
                        <Image source={originIcon} style={{ width: 26, height: 50 }} />
                      </View>
                    </Mapbox.PointAnnotation>
                  </>
                )}
              </MapSensor>
            </>
          ) : (
            <Mapbox.MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              styleURL={colorScheme === "dark" ? MapboxStyles.DARK : MapboxStyles.STREET}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <Mapbox.Camera
                ref={cameraRef}
                zoomLevel={14}
                centerCoordinate={[
                  currentBooking?.pickup?.lng || user?.location?.lng || -74.0721,
                  currentBooking?.pickup?.lat || user?.location?.lat || 4.7110
                ]}
                pitch={40}
                animationDuration={1000}
              />
              
              <Mapbox.UserLocation
                visible={true}
                showsUserHeadingIndicator={true}
                androidRenderMode="compass"
              />
              
              {currentBooking?.pickup?.lng && currentBooking?.pickup?.lat && (
                <Mapbox.PointAnnotation
                  id="pickup-marker-customer"
                  coordinate={[currentBooking.pickup.lng, currentBooking.pickup.lat]}
                  title="Punto de Origen"
                >
                  <View>
                    <Image source={originIcon} style={{ width: 26, height: 50 }} />
                  </View>
                </Mapbox.PointAnnotation>
              )}
              
              {currentBooking?.drop?.lng && currentBooking?.drop?.lat && (
                <Mapbox.PointAnnotation
                  id="drop-marker-customer"
                  coordinate={[currentBooking.drop.lng, currentBooking.drop.lat]}
                  title="Punto de Destino"
                >
                  <View>
                    <Image source={destinationIcon} style={{ width: 26, height: 50 }} />
                  </View>
                </Mapbox.PointAnnotation>
              )}

              {routeToPickup && currentBooking?.status === 'ACCEPTED' && (
                <Mapbox.ShapeSource id="driver-route-source" shape={routeToPickup}>
                  <Mapbox.LineLayer
                    id="driver-route-line"
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

              {driverLocation && currentBooking?.status === 'ACCEPTED' && (
                <Mapbox.PointAnnotation
                  id="driver-marker-customer"
                  coordinate={[driverLocation.longitude, driverLocation.latitude]}
                  title="Conductor"
                >
                  <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={driverCarIcon} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
                  </View>
                </Mapbox.PointAnnotation>
              )}
            </Mapbox.MapView>
          )}

          <CancelModal
            isVisible={modalVisible} // Aqu� pasas el estado que controla la visibilidad
            onClose={() => setModalVisible(false)} // L�gica para cerrar el modal
            currentBooking={currentBooking} // Aqu� pasas la reserva actual
            user={user} // Aqu� pasas el usuario actual
          />

          {/* -------------------------------------------------- */}
          {/* VISTA "NEW" - Esperando que un conductor acepte   */}
          {/* -------------------------------------------------- */}
          {user?.usertype === 'customer' && currentBooking?.status === 'NEW' ? (
            <>
              {/* Badge verificaci�n flotante */}
              <View style={styles.verificationBadge}>
                <View style={styles.verificationBadgeInner}>
                  <Ionicons name="checkmark-circle" size={20} color="#00d4d7" />
                  <Text style={styles.verificationBadgeText}>
                    Conductores pasan por verificaci�n facial
                  </Text>
                </View>
              </View>

              {/* Panel inferior estilo referencia */}
              <View style={styles.waitingPanel}>
                {/* Drag indicator bars */}
                <View style={styles.dragIndicatorRow}>
                  <View style={styles.dragBar} />
                  <View style={styles.dragBar} />
                  <View style={styles.dragBar} />
                  <View style={styles.dragBar} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                  {/* Conductores viendo tu solicitud + avatares */}
                  <View style={styles.viewersSection}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.viewersSectionTitle}>
                        Conductores viendo tu{'\n'}solicitud:{' '}
                        <Text style={styles.viewersSectionCount}>{bookingViewers.length}</Text>
                      </Text>
                    </View>
                    <View style={styles.viewersAvatarRow}>
                      {bookingViewers.length > 0 ? (
                        bookingViewers.slice(0, 4).map((viewer: any, i: number) => (
                          <View key={i} style={[styles.viewerAvatar, { marginLeft: i > 0 ? -12 : 0, zIndex: 10 - i }]}>
                            {viewer.user_image ? (
                              <Image source={{ uri: viewer.user_image }} style={styles.viewerAvatarImg} />
                            ) : (
                              <Image source={require("../../assets/images/Avatar/1.png")} style={styles.viewerAvatarImg} />
                            )}
                          </View>
                        ))
                      ) : (
                        [0, 1, 2, 3].map((i) => (
                          <View key={i} style={[styles.viewerAvatar, { marginLeft: i > 0 ? -12 : 0, zIndex: 10 - i, backgroundColor: '#e0e0e0' }]}>
                            <Ionicons name="person" size={16} color="#999" />
                          </View>
                        ))
                      )}
                      {bookingViewers.length > 4 && (
                        <View style={[styles.viewerAvatar, { marginLeft: -12, backgroundColor: '#00d4d7' }]}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+{bookingViewers.length - 4}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Descuento + Precio + Ajuste */}
                  <View style={styles.priceSection}>
                    {currentBooking?.discount > 0 ? (
                      <Text style={styles.discountLabel}>
                        Descuento de{' '}
                        <Text style={{ color: '#00d4d7', fontWeight: '700' }}>
                          ${roundPrice(parseFloat(currentBooking.discount)).toLocaleString()}
                        </Text>
                        {' '}en tu tarifa propuesta
                      </Text>
                    ) : null}

                    <View style={styles.priceAdjustRow}>
                      <TouchableOpacity
                        style={styles.priceAdjustBtn}
                        activeOpacity={0.7}
                        onPress={() => { setPriceAdjustment(prev => prev - 500); setPriceConfirmed(false); }}
                      >
                        <Text style={styles.priceAdjustBtnText}>-500</Text>
                      </TouchableOpacity>

                      <View style={styles.priceCenter}>
                        <Text style={styles.priceValue}>
                          ${roundPrice(
                            parseFloat(currentBooking?.trip_cost || currentBooking?.estimate || 0) 
                            + priceAdjustment 
                            - parseFloat(currentBooking?.discount || 0)
                          ).toLocaleString()}
                        </Text>
                        <Ionicons name="pencil" size={16} color="#aaa" style={{ marginLeft: 6 }} />
                      </View>

                      <TouchableOpacity
                        style={styles.priceAdjustBtn}
                        activeOpacity={0.7}
                        onPress={() => { setPriceAdjustment(prev => prev + 500); setPriceConfirmed(false); }}
                      >
                        <Text style={styles.priceAdjustBtnText}>+500</Text>
                      </TouchableOpacity>
                    </View>

                    {priceAdjustment !== 0 && !priceConfirmed ? (
                      <TouchableOpacity
                        style={styles.confirmAdjustBtn}
                        activeOpacity={0.85}
                        onPress={async () => {
                          setPriceConfirmed(true);
                          const newPrice = parseFloat(currentBooking?.trip_cost || currentBooking?.estimate || 0) + priceAdjustment;
                          try {
                            await supabase
                              .from('bookings')
                              .update({ trip_cost: newPrice, estimate: newPrice } as any)
                              .eq('id', currentBooking.id);
                            setCurrentBooking((prev: any) => ({ ...prev, trip_cost: newPrice, estimate: newPrice }));
                          } catch (e) {
                            console.error('Error actualizando precio:', e);
                          }
                        }}
                      >
                        <Text style={styles.confirmAdjustBtnText}>Confirmar aumento</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.confirmAdjustBtn, priceConfirmed ? { backgroundColor: 'rgba(0,212,215,0.08)' } : { opacity: 0.35 }]}>
                        <Text style={[styles.confirmAdjustBtnText, priceConfirmed && { color: '#00d4d7' }]}>
                          {priceConfirmed ? '? Precio confirmado' : 'Confirmar aumento'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Toggle: auto-connect */}
                  <View style={styles.autoConnectRow}>
                    <Text style={styles.autoConnectText} numberOfLines={2}>
                      Conectar con el primer conductor que acepte tu oferta
                    </Text>
                    <Switch
                      value={autoConnect}
                      onValueChange={setAutoConnect}
                      trackColor={{ false: '#e0e0e0', true: '#00d4d7' }}
                      thumbColor="#fff"
                    />
                  </View>

                  {/* Promo banner */}
                  {currentBooking?.promo_applied && currentBooking?.promo_code ? (
                    <View style={styles.promoBanner}>
                      <Text style={styles.promoBannerTitle}>Promo de la Casa</Text>
                      <Text style={styles.promoBannerCode}>{currentBooking.promo_code}</Text>
                    </View>
                  ) : null}

                  {/* Cancelar */}
                  <TouchableOpacity
                    style={styles.cancelWaitingBtn}
                    activeOpacity={0.8}
                    onPress={handleOpenCancelModal}
                  >
                    <Text style={styles.cancelWaitingBtnText}>Cancelar solicitud</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </>
          ) : (
            <>
              {/* ---------------------------------------------- */}
              {/* VISTA NORMAL - Conductor asignado              */}
              {/* ---------------------------------------------- */}
              <Header
                currentBooking={currentBooking}
                user={user}
                colorScheme={colorScheme}
              />

              {/* === DRIVER ACEPT� === */}
              {user?.usertype === 'customer' && driverAccepted && currentBooking?.status === 'ACCEPTED' && (
                <View style={styles.acceptedCard}>
                  <Ionicons name="checkmark-circle" size={24} color="#00d4d7" />
                  <Text style={styles.acceptedText}>�Un conductor acept� tu solicitud!</Text>
                </View>
              )}

              {/* === ETA TRACKING PILL === */}
              {user?.usertype === 'customer' && currentBooking?.status === 'ACCEPTED' && driverLocation && (
                <View style={styles.etaPill}>
                  <View style={styles.etaPillIcon}>
                    <FontAwesome5 name="car" size={18} color="#001824" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.etaPillLabel}>Tu conductor est� en camino</Text>
                    <Text style={styles.etaPillValue}>
                      {estimatedTime ? `Llega en ${estimatedTime}` : 'Calculando tiempo...'}
                      {estimatedDistance ? `  �  ${estimatedDistance}` : ''}
                    </Text>
                  </View>
                  <View style={styles.etaPulse} />
                </View>
              )}

              {/* === OTP PROMINENTE PARA CLIENTE === */}
              {user?.usertype === 'customer' && currentBooking?.otp && (currentBooking?.status === 'ACCEPTED' || currentBooking?.status === 'ARRIVED') && (
                <View style={styles.otpClientCard}>
                  <Text style={styles.otpClientLabel}>Tu c�digo de seguridad</Text>
                  <Text style={styles.otpClientCode}>{currentBooking.otp}</Text>
                  <Text style={styles.otpClientHint}>Dile este c�digo al conductor cuando se encuentren</Text>
                </View>
              )}

              {/* === OTP PROMINENTE PARA CONDUCTOR === */}
              {user?.usertype === 'driver' && (currentBooking?.status === 'ACCEPTED' || currentBooking?.status === 'ARRIVED') && (
                <View style={styles.otpDriverCard}>
                  <Text style={styles.otpDriverLabel}>Pide el c�digo al cliente para iniciar</Text>
                  <Ionicons name="lock-closed" size={28} color="#00f4f5" />
                </View>
              )}

              <ButonsFloat
                handleOpenOnlineChat={handleOpenOnlineChat}
                startNavigation={startNavigation}
                startNavigationWaze={startNavigationWaze}
                navigationSecurity={navigationSecurity}
                onPressCall={onPressCall}
                user={user}
                unreadMessages={unreadMessages}
                currentBooking={currentBooking}
                colorScheme={colorScheme}
              />
              <DetailsContainer
                currentBooking={currentBooking}
                user={user}
                estimatedTime={estimatedTime}
                estimatedDistance={estimatedDistance}
                onPresentModalPress={handlePresentModalPress}
                onStartTrip={handleStartTrip}
                handleArrived={handleArrived}
                handleEndTrip={handleEndTrip}
                openWhatsApp={openWhatsApp}
                onPressCall={onPressCall}
                onHandle={handleArrived}
                isButtonDisabled={isButtonDisabled}
                handleCustomerArrival={handleCustomerArrival}
                setIsCustomerArrivalModalVisible={setIsCustomerArrivalModalVisible}
                confirmCustomerArrival={confirmCustomerArrival}
                isCustomerArrivalModalVisible={isCustomerArrivalModalVisible}
                colorScheme={colorScheme}
                serviceParameters={serviceParameters}
                onServiceParametersChange={setServiceParameters}
              />
            </>
          )}
          {otpModalVisible && user?.usertype !== 'driver' && (
            <OtpModal
              modalVisible={otpModalVisible}
              requestModalClose={() => setOtpModalVisible(false)}
              otp={currentBooking?.otp}
              onMatch={handleOtpMatch}
            />
          )}
          <CountdownModal
            visible={isCountdownModalVisible}
            countdown={countdown}
            otp={currentBooking?.otp}
            onClose={() => setIsCountdownModalVisible(false)} // Cerrar el modal
          />
          {currentBooking.status !== "ARRIVED" ? null : (
            <View
              style={{
                alignItems: "flex-end",
                justifyContent: "flex-end",
                marginRight: 25,
                position: "absolute",
                top: 10,
                marginLeft: -10,
                width: "100%",
                height: "70%",
              }}
            >
              <TouchableOpacity
                style={styles.reopenButton}
                onPress={() => setIsCountdownModalVisible(true)}
              >
                <Ionicons name="timer" size={24} color="red" />
              </TouchableOpacity>
            </View>
          )}
          <BottomSheetModal
            ref={bottomSheetModalRef}
            index={0}
            snapPoints={snapPoints}
          >
            <BottomSheetContent
              user={user}
              currentBooking={currentBooking}
              handleReporIncident={handleReporIncident}
              determineTripType={determineTripType}
              handleOpenCancelModal={handleOpenCancelModal}
              colorScheme={colorScheme}
            />
          </BottomSheetModal>
        </View>

        <Modal
          animationType="slide"
          transparent={true}
          visible={searchModalVisible}
          onRequestClose={() => {
            setSearchModalVisible(false);
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.BACKGROUND,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: width - 70,
                borderRadius: 10,
                flex: 1,
                maxHeight: 310,
                marginTop: 15,
                backgroundColor: colors.WHITE,
              }}
            >
              <View
                style={{
                  width: "100%",
                  height: 220,
                  backgroundColor: colors.WHITE,
                  justifyContent: "center",
                  alignItems: "center"
                }}
              >
                <Ionicons name="car" size={80} color="#ccc" />
              </View>
              <View style={{ alignSelf: "center" }}>
                <Text
                  style={{
                    color: colors.BLACK || '#333',
                    fontSize: 16,
                    fontFamily: fonts.Regular,
                  }}
                >
                  {"El conductor se asignar� pronto.."}
                </Text>
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 10,
                  alignSelf: "center",
                }}
              >
                <TouchableOpacity
                  style={{
                    width: 120,
                    backgroundColor: colors.RED,
                    marginTop: 20,
                    borderRadius: 18,
                    alignItems: "center",
                  }}
                  onPress={() => {
                    setSearchModalVisible(false);
                  }}
                >
                  <Text
                    style={{ fontFamily: fonts.Bold, margin: 7, color: "#FFF" }}
                  >
                    Cerrar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="slide"
          transparent={true}
          visible={isIncidentModalVisible}
          onRequestClose={() => setIsIncidentModalVisible(false)}
        >
          <View style={styles.modalCenteredView}>
            <View style={styles.modalView}>
              <Text style={styles.modalText}>Selecciona una incidencia:</Text>
              <ScrollView style={{ width: '100%', maxHeight: 200 }}>
                {incidentOptions?.map((option: any, index: number) => (
                  <TouchableOpacity
                    key={index}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 15,
                      borderBottomWidth: 1,
                      borderBottomColor: '#e0e0e0',
                      backgroundColor: selectedIncident === option.value ? '#f0f0f0' : '#fff',
                    }}
                    onPress={() => setSelectedIncident(option.value)}
                  >
                    <Text style={{ fontSize: 16, color: selectedIncident === option.value ? '#00f4f5' : '#000' }}>
                      � {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    { backgroundColor: "#00f4f5", marginHorizontal: 10 },
                  ]}
                  onPress={handleReportIncident}
                >
                  <Text style={styles.modalConfirmButtonText}>Reportar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalCancelButton,
                    { backgroundColor: "#333", marginHorizontal: 10 },
                  ]}
                  onPress={() => setIsIncidentModalVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          transparent={true}
          visible={successModalVisible}
          animationType="fade"
          onRequestClose={() => setSuccessModalVisible(false)}
        >
          <View style={styles.successModalContainer}>
            <Animated.View
              style={[styles.successModalView, { opacity: fadeAnim }]}
            >
              <Ionicons name="checkmark-circle" size={48} color="#fff" />
              <Text style={styles.successModalText}>
                Se ha iniciado el viaje!
              </Text>
            </Animated.View>
          </View>
        </Modal>
        <Modal
          transparent={true}
          visible={isConfirmationModalVisible}
          animationType="fade"
          onRequestClose={() => setIsConfirmationModalVisible(false)}
        >
          <View style={styles.successModalContainer}>
            <View
              style={[
                styles.successModalView,
                { paddingVertical: 20, paddingHorizontal: 20, width: "85%" },
              ]}
            >
              <AntDesign name="star" size={42} color="#fff" />
              <Text style={[styles.modalText, { textAlign: "center" }]}>
                Califica al cliente antes de finalizar el viaje
              </Text>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 13,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                1 estrella = poco satisfecho · 5 estrellas = muy satisfecho
              </Text>
              <View style={{ alignItems: "center", marginVertical: 10 }}>
                <StarRating
                  maxStars={5}
                  starSize={40}
                  color="#FFD700"
                  emptyColor="#ffffff"
                  rating={customerRating}
                  onChange={(rating: number) => setCustomerRating(rating)}
                />
                <Text style={{ color: "#fff", marginTop: 6 }}>
                  {customerRating > 0
                    ? `${customerRating} / 5`
                    : "Selecciona una calificación"}
                </Text>
              </View>
              <TextInput
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 8,
                  width: "100%",
                  minHeight: 60,
                  padding: 8,
                  textAlignVertical: "top",
                  marginBottom: 12,
                  color: "#000",
                }}
                placeholder="Observaciones (opcional)"
                placeholderTextColor="#888"
                multiline
                value={customerReview}
                onChangeText={setCustomerReview}
              />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    {
                      backgroundColor: customerRating > 0 ? "#fff" : "#cccccc",
                      flex: 1,
                      marginRight: 6,
                    },
                  ]}
                  disabled={customerRating < 1}
                  onPress={() => {
                    finalizarReserva(currentBooking, user);
                  }}
                >
                  <Text style={styles.modalButtonText}>Finalizar viaje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButtonCancel,
                    { backgroundColor: "#333", flex: 1, marginLeft: 6 },
                  ]}
                  onPress={() => setIsConfirmationModalVisible(false)}
                >
                  <Text
                    style={[styles.modalButtonText, { color: colors.WHITE }]}
                  >
                    Cancelar
                  </Text>
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
        onDismiss={() => {
          setAlertVisible(false);
          const cb = onAlertDismissRef.current;
          onAlertDismissRef.current = null;
          cb?.();
        }}
      />
      </View>
    </BottomSheetModalProvider>
  );
};
const BottomSheetContent = ({
  currentBooking,
  user,
  handleOpenCancelModal,
  handleReporIncident,
  determineTripType,
  colorScheme,
}: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos
  const carImageSource = currentBooking?.carImage
    ? { uri: currentBooking.car_image }
    : require("../../assets/images/defaultVehicle.png");

  return (
    <View style={styles.contentContainer}>
      {/* Encabezado del Viaje */}
      <View style={styles.header2}>
        <View style={{ margin: 1 }}>
          <Image
            source={carImageSource}
            style={[styles.carImage, { height: 90, width: 90 }]}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              width: "auto",
            }}
          >
            <Text
              style={{
                marginHorizontal: 4,
                color: colorScheme === "dark" ? "white" : "black",
              }}
            >
              <Text style={{ fontWeight: "bold" }}> Placa:</Text>{" "}
              {currentBooking.vehicle_number}
            </Text>
            <Text
              style={{
                marginHorizontal: 4,
                color: colorScheme === "dark" ? "white" : "black",
              }}
            >
              <Text style={{ fontWeight: "bold" }}> Marca: </Text>{" "}
              {currentBooking.vehicleMake}
            </Text>
            <Text
              style={{
                marginHorizontal: 4,
                color: colorScheme === "dark" ? "white" : "black",
              }}
            >
              <Text style={{ fontWeight: "bold" }}> Color:</Text>{" "}
              {currentBooking.vehicleColor}
            </Text>
          </View>
        </View>

        <View style={{ right: 69 }}>
          {user?.usertype === "customer" ? (
            // Si es customer, mostrar "Cancelar viaje"
            <TouchableOpacity onPress={handleOpenCancelModal}>
              <Text style={styles.cancelRideText}>Cancelar viaje</Text>
            </TouchableOpacity>
          ) : user?.usertype === "driver" ? (
            // Si es driver, mostrar "Reportar incidencia"
            <TouchableOpacity onPress={handleReporIncident}>
              <Text style={styles.cancelRideText}>Reportar Incidencia</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Informaci�n del Conductor */}
      <View
        style={[styles.driverInfoContainer, { margin: 10, borderWidth: 0.8 }]}
      ></View>

      {/* Detalles del Viaje */}
      <View style={styles.tripDetails}>
        <Text style={styles.tripTitle}>Informaci�n del Viaje</Text>

        {/* Fecha del viaje */}
        <View style={styles.row}>
          <Image
            source={require("./../../assets/images/iconos3d/45.png")}
            style={styles.iconImage}
          />
          <Text style={styles.tripDateText}>
            {currentBooking?.tripdate
              ? moment(currentBooking.tripdate).format("lll")
              : ""}
          </Text>
        </View>

        {/* Paradas del viaje */}
        <View style={styles.tripStops}>
          <Text style={styles.tripStopText}>
            <Ionicons
              name="location-outline"
              size={24}
              color={colors.BALANCE_GREEN}
            />{" "}
            {currentBooking?.pickupAddress}
          </Text>
          <View style={styles.tripStopSeparator} />
          <Text style={styles.tripStopText}>
            <Ionicons
              name="location-outline"
              size={24}
              color={colors.LIGHT_RED}
            />{" "}
            {currentBooking?.dropAddress}
          </Text>
        </View>
      </View>

      {/* Detalle de Pago */}
      <View style={styles.paymentDetails}>
        <Text style={styles.paymentTitle}>Detalles de Pago</Text>

        {/* M�todo de pago destacado */}
        <View style={{
          backgroundColor: 'rgba(0, 229, 255, 0.08)',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: 'rgba(0, 229, 255, 0.2)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={{ marginRight: 12 }}>
              {currentBooking.payment_mode === "cash" ? (
                <Ionicons name="cash" size={32} color="#00E5FF" />
              ) : currentBooking.payment_mode === "nequi" ? (
                <MaterialIcons name="phone" size={32} color="#00E5FF" />
              ) : currentBooking.payment_mode === "daviplata" ? (
                <MaterialIcons name="account-balance-wallet" size={32} color="#00E5FF" />
              ) : null}
            </View>
            <View>
              <Text style={{ fontSize: 12, color: '#B8C5D6', fontWeight: '500' }}>
                M�todo de Pago
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#00E5FF', marginTop: 4 }}>
                {currentBooking.payment_mode === "cash"
                  ? "💵 Efectivo"
                  : currentBooking.payment_mode === "nequi"
                  ? "📱 Nequi"
                  : currentBooking.payment_mode === "daviplata"
                  ? "💳 Daviplata"
                  : "Efectivo"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.amountText}>
          <Text style={{ fontWeight: "bold" }}>Costo Estimado:</Text> $
          {roundPrice(parseFloat(currentBooking.trip_cost))} - $
          {roundPrice(parseFloat(currentBooking.estimate) || parseFloat(currentBooking.trip_cost))}
        </Text>

        {/* Tipo de viaje y otros detalles */}
        <View style={styles.paymentMethodContainer}>
          {/* Tipo de viaje */}
          <View style={styles.paymentMethod}>
            <Text style={styles.iconText}>
              <Entypo
                name="location"
                size={29}
                color={colorScheme === "dark" ? "white" : "#3333"}
              />
            </Text>
            <Text style={styles.methodText}>{currentBooking.tripType}</Text>
          </View>

          {/* Detalles adicionales */}
          <View style={styles.paymentMethod}>
            <Text style={styles.iconText}>
              <FontAwesome5 name="map" size={29} color="#00E5FF" />
            </Text>
            <Text style={[styles.methodText]}>
              {determineTripType(currentBooking?.pickup, currentBooking?.drop)}
            </Text>
          </View>
        </View>

        {/* Observaciones */}
        <View style={{ marginVertical: 13 }}>
          <Text
            style={[styles.tripDetail, { fontWeight: "bold", color: "black" }]}
          >
            Observaciones: {currentBooking?.observations}
          </Text>
        </View>
      </View>
    </View>
  );
};

const Header = ({ currentBooking, user, colorScheme }: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <View style={styles.header}>
      <Text style={styles.address}>
        Estado:{" "}
        {currentBooking?.status === "ACCEPTED"
          ? "ACEPTADO"
          : currentBooking && currentBooking.status === "REACHED"
          ? "ALCANZADO"
          : currentBooking && currentBooking.status === "STARTED"
          ? "INICIO"
          : currentBooking && currentBooking.status === "NEW"
          ? "NUEVO"
          : currentBooking && currentBooking.status === "ARRIVED"
          ? "LLEGO"
          : ""}
      </Text>
      <Text style={styles.address}>
        {" "}
        Cod de Seg: {currentBooking && currentBooking.otp}
      </Text>
      <ProfileImage
        currentBooking={currentBooking}
        user={user}
        colorScheme={colorScheme}
      />
    </View>
  );
};

const ButonsFloat = ({
  startNavigation,
  user,
  startNavigationWaze,
  navigationSecurity,
  onPressCall,
  handleOpenOnlineChat,
  unreadMessages,
  currentBooking,
  colorScheme,
}: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <View
      style={{
        position: "absolute",
        top:
          user?.usertype === "driver" ? height / 2.4 - 50 : height / 1.7 - 50, // Ajusta 50 seg�n la mitad de la altura del componente
        left: 0, // Alinea a la izquierda
        width: "20%", // Ajusta el ancho seg�n sea necesario
        height: 100, // Ajusta el alto seg�n sea necesario
        alignItems: "flex-start",
        justifyContent: "center", // Centra el contenido verticalmente
        marginLeft: 10,
      }}
    >
      {user?.usertype == "driver" ? (
        <TouchableOpacity
          style={styles.floatButton1}
          onPress={() => startNavigation()}
        >
          <Icon
            name="navigate-circle"
            type="ionicon"
            size={30}
            color={colors.WHITE}
          />
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.floatButton1}
        onPress={handleOpenOnlineChat}
      >
        <FontAwesome name="wechat" size={24} color="white" />
        {unreadMessages && <View style={styles.unreadIndicator} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.floatButton1, { marginVertical: 10 }]}
        onPress={onPressCall}
      >
        <MaterialIcons name="phone" size={24} color="white" />
      </TouchableOpacity>
      {user?.usertype === "driver" ? (
        <View>
          <TouchableOpacity
            style={[styles.floatButton1, { marginVertical: 10 }]}
            onPress={() => startNavigationWaze()}
          >
            <FontAwesome5 name="waze" size={30} color={colors.WHITE} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View>
        <TouchableOpacity
          style={[styles.floatButton1, { marginVertical: 10 }]}
          onPress={() => navigationSecurity(currentBooking)}
        >
          <FontAwesome5 name="shield-alt" size={30} color={colors.WHITE} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DetailsContainer = ({
  currentBooking,
  user,
  estimatedTime,
  estimatedDistance,
  onPresentModalPress,
  onStartTrip,
  handleEndTrip,
  openWhatsApp,
  onPressCall,
  onHandle,

  isButtonDisabled,
  handleArrived,
  handleCustomerArrival,
  setIsCustomerArrivalModalVisible,
  confirmCustomerArrival,
  isCustomerArrivalModalVisible,
  colorScheme,
  serviceParameters,
  onServiceParametersChange,
}: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <View style={styles.detailsContainer}>
      {user?.usertype === 'customer' && 
       currentBooking?.status !== 'NEW' && 
       (currentBooking?.status === 'ACCEPTED' || currentBooking?.status === 'ARRIVED' || currentBooking?.status === 'STARTED') && (
        <>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#00E5FF',
              marginBottom: 14,
              letterSpacing: 0.3,
            }}
          >
            Confirmar Detalles del Viaje
          </Text>
          <ServiceParameterSelector
            onParametersChange={onServiceParametersChange}
            basePrice={parseFloat(currentBooking?.trip_cost || currentBooking?.estimate || 0)}
            currentService={serviceParameters?.service || 'express'}
          />
        </>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: colorScheme === "dark" ? "white" : "black",
          }}
        >
          {user?.usertype === "customer"
            ? estimatedTime
              ? `Tu conductor llega en ${estimatedTime}${estimatedDistance ? ` � ${estimatedDistance}` : ''}`
              : "Calculando tiempo y ruta..."
            : `Est�s a ${estimatedTime || "calculando..."}${estimatedDistance ? ` � ${estimatedDistance}` : ''} de tu servicio`}
        </Text>

        <TouchableOpacity onPress={onPresentModalPress}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#E91E63" }}>
            Detalle del Viaje
          </Text>
        </TouchableOpacity>
      </View>
      <DriverInfo
        currentBooking={currentBooking}
        user={user}
        colorScheme={colorScheme}
      />
      <CarDetails currentBooking={currentBooking} colorScheme={colorScheme} />
      <ActionButtons
        currentBooking={currentBooking}
        user={user}
        onStartTrip={onStartTrip}
        onHandle={onHandle}
        handleEndTrip={handleEndTrip}
        openWhatsApp={openWhatsApp}
        onPressCall={onPressCall}
        handleArrived={handleArrived}
        isButtonDisabled={isButtonDisabled}
        handleCustomerArrival={handleCustomerArrival}
        setIsCustomerArrivalModalVisible={setIsCustomerArrivalModalVisible}
        confirmCustomerArrival={confirmCustomerArrival}
        isCustomerArrivalModalVisible={isCustomerArrivalModalVisible}
        colorScheme={colorScheme}
      />
    </View>
  );
};

const ActionButtons = ({
  currentBooking,
  user,
  onStartTrip,
  handleArrived,
  handleEndTrip,
  openWhatsApp,
  onPressCall,
  onHandle,

  isButtonDisabled,
  handleCustomerArrival,
  confirmCustomerArrival,
  isCustomerArrivalModalVisible,
  setIsCustomerArrivalModalVisible,
  colorScheme,
}: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <View style={styles.actionsContainer}>
      {user?.usertype === "customer" ? (
        <>
          <TouchableOpacity style={styles.messageButton} onPress={openWhatsApp}>
            <Text style={styles.messageButtonText}>MENSAJES</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.callButton} onPress={onPressCall}>
            <Text style={styles.callButtonText}>LLAMADA</Text>
          </TouchableOpacity>
          {currentBooking && currentBooking.status === "ARRIVED" && (
            <TouchableOpacity
              style={styles.iniciarButton}
              onPress={handleCustomerArrival}
            >
              <Text style={styles.callButtonText}>INICIAR!</Text>
            </TouchableOpacity>
          )}
          <CustomerArrivalModal
            visible={isCustomerArrivalModalVisible}
            onConfirm={confirmCustomerArrival}
            onCancel={() => setIsCustomerArrivalModalVisible(false)}
            colorScheme={colorScheme}
          />
        </>
      ) : (
        <View style={styles.actionsContainer}>
          {user?.usertype === "customer" ? (
            <>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={openWhatsApp}
              >
                <Text style={styles.messageButtonText}>MENSAJES</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.callButton} onPress={onPressCall}>
                <Text style={styles.callButtonText}>LLAMADA</Text>
              </TouchableOpacity>
              {currentBooking && currentBooking.status === "ARRIVED" && (
                <TouchableOpacity
                  style={styles.iniciarButton}
                  onPress={handleCustomerArrival}
                >
                  <Text style={styles.callButtonText}>INICIAR!</Text>
                </TouchableOpacity>
              )}
              <CustomerArrivalModal
                visible={isCustomerArrivalModalVisible}
                onConfirm={confirmCustomerArrival}
                onCancel={() => setIsCustomerArrivalModalVisible(false)}
                colorScheme={colorScheme}
              />
            </>
          ) : (
            <View style={styles.actionsContainer}>
              {user?.usertype === "customer" ? (
                <>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={openWhatsApp}
                  >
                    <FontAwesome name="whatsapp" size={24} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={onPressCall}
                  >
                    <MaterialIcons name="phone" size={24} color="white" />
                  </TouchableOpacity>
                  {currentBooking && currentBooking.status === "ARRIVED" && (
                    <TouchableOpacity
                      style={styles.iniciarButton}
                      onPress={handleCustomerArrival}
                    >
                      <Text style={styles.callButtonText}>INICIAR!</Text>
                    </TouchableOpacity>
                  )}
                  <CustomerArrivalModal
                    visible={isCustomerArrivalModalVisible}
                    onConfirm={confirmCustomerArrival}
                    onCancel={() => setIsCustomerArrivalModalVisible(false)}
                    colorScheme={colorScheme}
                  />
                </>
              ) : (
                <View style={{ flexDirection: "column", width: "100%" }}>
                  {(currentBooking && currentBooking.status === "ACCEPTED") ||
                  currentBooking.status === "ARRIVED" ? (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      {currentBooking?.status !== "ARRIVED" && (
                        <TouchableOpacity
                          onPress={handleArrived}
                          style={[
                            styles.messageButton,
                            isButtonDisabled && { opacity: 0.5 },
                          ]} // Cambiar la opacidad si el bot�n est� deshabilitado
                          disabled={isButtonDisabled} // Deshabilitar el bot�n
                        >
                          <Text style={styles.messageButtonText}>
                            REPORTAR LLEGADA
                          </Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[styles.callButton, { flex: 1, marginLeft: 10 }]}
                        onPress={onStartTrip}
                      >
                        <Text style={styles.callButtonText}>INICIAR VIAJE</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ marginBottom: 10 }}>
                      <SliderButton onSlideCompleted={handleEndTrip} />
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const CarDetails = ({ currentBooking, colorScheme }: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <View style={styles.carDetails}>
      <Text style={styles.carModel}>
        {currentBooking && currentBooking.car_model}
      </Text>
      <Text style={styles.plateNumber}>
        {currentBooking && currentBooking.plate_number}
      </Text>
    </View>
  );
};

const DriverInfo = ({ currentBooking, user, colorScheme }: any) => {
  // Default image fallback for both driver and customer
  const defaultDriverImage = require("../../assets/images/Avatar/1.png");

  // Safeguard against missing or invalid image URIs
  const driverImageSource = currentBooking?.driver_image
    ? { uri: currentBooking.driver_image }
    : defaultDriverImage;

  const customerImageSource = currentBooking?.customer_image
    ? { uri: currentBooking.customer_image }
    : defaultDriverImage;

  const carImageSource = currentBooking?.car_image
    ? { uri: currentBooking.car_image }
    : defaultDriverImage; // You can use a separate default image for car if needed
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <View style={styles.driverInfoContainer}>
      {/* Render a default image if status is "NEW", else use driver or customer image */}
      {currentBooking?.status === "NEW" ? (
        <Image source={defaultDriverImage} style={styles.driverImage} />
      ) : (
        <Image
          source={
            user?.usertype === "customer"
              ? driverImageSource
              : customerImageSource
          }
          style={styles.driverImage}
        />
      )}

      <View style={styles.driverDetails}>
        <Text style={styles.driverName}>
          {user?.usertype === "customer"
            ? currentBooking?.driver_name || "Driver Name"
            : currentBooking?.customer_name || "Customer Name"}
        </Text>

        {/* Ensure the driver rating is available and valid */}
        <Text style={styles.driverRating}>
          <FontAwesome5 name="star" size={14} color="#00f4f5" />{" "}
          {currentBooking?.driverRating ?? "No Rating"}
        </Text>

        <Text style={styles.driverTime}>
          {currentBooking?.arrivalTime || "Usuario Verificado"}
        </Text>
      </View>

      {/* Render car image with a fallback */}
      <Image source={carImageSource} style={styles.carImage} />
    </View>
  );
};

const CustomerArrivalModal = ({
  visible,
  onConfirm,
  onCancel,
  colorScheme,
}: any) => {
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.modalCenteredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalText}>
            �Est�s seguro de que quieres iniciar el viaje sin estar presente?
          </Text>
          <View style={styles.modalButtonsContainer}>
            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={onConfirm}
            >
              <Text style={styles.modalConfirmButtonText}>S�</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={onCancel}
            >
              <Text style={styles.modalCancelButtonText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const ProfileImage = ({ currentBooking, user, colorScheme }: any) => {
  const defaultImage = require("../../assets/images/Avatar/1.png");
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos

  const imageSource =
    user?.usertype === "customer"
      ? currentBooking?.customer_image
        ? { uri: currentBooking.customer_image }
        : defaultImage
      : currentBooking?.driver_image
      ? { uri: currentBooking.driver_image }
      : defaultImage;

  return (
    <TouchableOpacity style={styles.profileButton}>
      <Image source={imageSource} style={styles.profileImage} />
    </TouchableOpacity>
  );
};
const lightStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#051A26',
  },
  map: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 10,
    width: width - 40,
    left: 20,
    right: 20,
    backgroundColor: "rgba(5, 26, 38, 0.8)",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    marginTop: 60,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  address: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
  },
  profileButton: {
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    borderRadius: 25,
    padding: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.3)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  detailsContainer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "rgba(5, 26, 38, 0.95)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 229, 255, 0.2)",
  },
  arrivalText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  cancelButtonModal: {
    position: "absolute",
    top: 20,
    right: 20,
  },
  cancelButtonText: {
    color: "red",
    fontSize: 16,
  },
  driverInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  driverImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 10,
    elevation: 5,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  driverRating: {
    fontSize: 16,
    color: "#777",
  },
  driverTime: {
    fontSize: 16,
    color: "#777",
  },
  carImage: {
    width: 60,
    height: 40,
    resizeMode: "contain",
    borderRadius: 50,
  },
  carDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  carModel: {
    fontSize: 16,
  },
  plateNumber: {
    fontSize: 16,
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between", // Espacio uniforme entre botones
    marginTop: 10, // Espacio superior opcional
    paddingHorizontal: 5, // Relleno lateral opcional
  },
  iniciarButton: {
    backgroundColor: "#610000", // Color verde para diferenciar el bot�n de iniciar
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5, // Espacio horizontal entre botones
    elevation: 5,
  },
  messageButton: {
    backgroundColor: "#a1a3a6",
    borderRadius: 10,
    padding: 15,
    flex: 1,
    alignItems: "center",
    marginRight: 10,
    elevation: 5,
  },
  messageButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  callButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    elevation: 5,
  },
  callButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",

    marginTop: 5,
  },
  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  header2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  driverArrivalText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelRideText: {
    fontSize: 14,
    color: "red",
  },
  driverInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rating: {
    marginLeft: 5,
    fontSize: 14,
  },
  time: {
    marginLeft: 10,
    fontSize: 14,
    color: "grey",
  },

  carName: {
    fontSize: 14,
    fontWeight: "bold",
  },

  tripDetails: {
    marginBottom: 20,
  },
  tripTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  tripStops: {
    marginBottom: 10,
    color: "#000",
  },
  tripStopText: {
    fontSize: 14,
    marginBottom: 5,
    color: "#000",
  },
  editRideText: {
    fontSize: 14,
    color: "red",
  },
  paymentDetails: {
    marginBottom: 20,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  amount: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  paymentLogo: {
    width: 30,
    height: 20,
    marginRight: 10,
  },
  cardText: {
    fontSize: 14,
  },
  cardNumber: {
    fontSize: 14,
    color: "grey",
    marginLeft: 5,
  },
  splitCostText: {
    fontSize: 14,
    color: "red",
  },
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contentContainer: {
    padding: 20,
    backgroundColor: "rgba(5, 26, 38, 0.5)",
  },
  arrivalMapContainer: {
    height: 200,
    marginTop: 10,
  },
  arrivalMap: {
    ...StyleSheet.absoluteFillObject,
  },
  cancelButton: {
    position: "absolute",
    top: 20,
    right: 20,
  },

  reopenButton: {
    borderWidth: 0.4,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 50,
    backgroundColor: "#eee",
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 5,
  },
  unreadIndicator: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "green",
    borderWidth: 1,
    borderColor: "white",
  },
  reopenButtonText: {
    fontSize: 24,
    color: "#000",
  },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  confirmButton: {
    backgroundColor: "green",
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
    elevation: 2,
    flex: 1,
    alignItems: "center",
  },
  iconButton: {
    backgroundColor: "#00f4f5", // Color de fondo del bot�n
    padding: 10, // Espacio interno del bot�n
    borderRadius: 5, // Bordes redondeados
    alignItems: "center", // Alineaci�n centrada del contenido
    justifyContent: "center", // Alineaci�n vertical centrada
    marginHorizontal: 5, // Espacio horizontal entre botones
  },
  confirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  confirmButtonModal: {
    backgroundColor: "green",
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
    elevation: 2,
    flex: 1,
    alignItems: "center",
  },
  confirmButtonTextModal: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },

  cancelButtonTextModal: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    width: "120%",
  },
  modalView: {
    width: 300,
    margin: 20,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalConfirmButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalCancelButton: {
    backgroundColor: "#E91E63",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  radioContainerStyle: { paddingTop: 30, marginLeft: 10 },
  radioStyle: { paddingBottom: 25 },
  cancelModalButtosContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    marginBottom: 10,
  },
  radioText: { fontSize: 16, color: "#000" },
  cancelModalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(22,22,22,0.8)",
  },
  cancelReasonText: {
    top: 10,
    color: "#000",

    fontSize: 20,
    alignSelf: "center",
  },
  cancelModalInnerContainer: {
    height: 400,
    width: width * 0.85,
    padding: 0,
    backgroundColor: "#fff",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 7,
  },
  cancelModalButttonStyle: { backgroundColor: "gray", borderRadius: 0 },
  buttonSeparataor: {
    height: height / 35,
    width: 0.8,
    backgroundColor: "#FFF",
    alignItems: "center",
    marginTop: 3,
  },
  cancelModalButtonContainerStyle: {
    minWidth: 140,
    alignSelf: "center",
    borderRadius: 10,
  },
  floatButton1: {
    borderWidth: 1,
    borderColor: "#00f4f5",
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 50,
    backgroundColor: "#00f4f5",
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 5,
    position: "relative", // Asegura que el indicador se posicione relativo al bot�n
    margin: 2,
  },
  hbox2: {
    width: 1,
    backgroundColor: MAIN_COLOR,
    left: 8,
    bottom: 5,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconImage: {
    width: 30,
    height: 30,
    marginBottom: 6,
  },
  tripDateText: {
    marginLeft: 6,
    color: colors.LIGHT_RED,
  },

  tripStopSeparator: {
    height: 1,
    backgroundColor: colors.GREY,
    marginVertical: 5,
  },

  amountText: {
    fontSize: 16,
    color: "#00f4f5",
    marginBottom: 10,
  },
  paymentMethodContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    top: 8,
  },
  paymentMethod: {
    flexDirection: "column",
    alignItems: "center",
  },
  iconText: {
    fontSize: 14,
    marginBottom: 5,
  },
  methodText: {
    fontSize: 14,
    textAlign: "center",
  },
  tripDetail: {
    fontSize: 14,
    color: "#777",
  },
  successModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  successModalView: {
    width: 250,
    padding: 20,
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    alignItems: "center",
    elevation: 10,
  },
  successModalText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
  modalButton: {
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5,
  },
  modalButtonCancel: {
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // --- Waiting panel (status NEW) ---
  verificationBadge: {
    position: 'absolute',
    bottom: height * 0.52,
    left: 16,
    zIndex: 15,
  },
  verificationBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 26, 38, 0.85)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  verificationBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00E5FF',
  },
  waitingPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(5, 26, 38, 0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: height * 0.52,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 20,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(0, 229, 255, 0.2)',
  },
  dragIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 14,
  },
  dragBar: {
    width: width * 0.12,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 229, 255, 0.3)',
  },
  viewersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 14,
    marginHorizontal: 0,
    marginBottom: 14,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.15)',
  },
  viewersSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 22,
  },
  viewersSectionCount: {
    color: '#00E5FF',
    fontWeight: '900',
    fontSize: 18,
  },
  viewersAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  viewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(5, 26, 38, 0.9)',
    overflow: 'hidden',
  },
  viewerAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  priceSection: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 229, 255, 0.1)',
  },
  discountLabel: {
    fontSize: 13,
    color: '#B8C5D6',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  priceAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  priceAdjustBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  priceAdjustBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00E5FF',
  },
  priceCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#00E5FF',
  },
  confirmAdjustBtn: {
    marginTop: 14,
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmAdjustBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#051A26',
  },
  autoConnectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 229, 255, 0.1)',
    marginTop: 4,
  },
  autoConnectText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
    marginRight: 12,
  },
  promoBanner: {
    marginHorizontal: 0,
    marginTop: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  promoBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00E5FF',
  },
  promoBannerCode: {
    fontSize: 12,
    color: '#B8C5D6',
    marginTop: 4,
    fontWeight: '500',
  },
  cancelWaitingBtn: {
    marginHorizontal: 0,
    marginTop: 14,
    marginBottom: 0,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 80, 80, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 80, 80, 0.3)',
  },
  cancelWaitingBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E91E63',
  },
  // Driver accepted card
  acceptedCard: {
    position: 'absolute',
    top: height * 0.42,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 26, 38, 0.85)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  acceptedText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#00E5FF',
  },
  // ETA tracking pill (driver en route)
  etaPill: {
    position: 'absolute',
    top: 70,
    left: 70,
    right: 70,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 26, 38, 0.95)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.35)',
  },
  etaPillIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7FA3B8',
    letterSpacing: 0.3,
  },
  etaPillValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  etaPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00E5FF',
  },
  // OTP client card
  otpClientCard: {
    position: 'absolute',
    top: height * 0.35,
    left: 24,
    right: 24,
    zIndex: 20,
    backgroundColor: 'rgba(5, 26, 38, 0.9)',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  otpClientLabel: {
    fontSize: 13,
    color: '#B8C5D6',
    marginBottom: 8,
    fontWeight: '600',
  },
  otpClientCode: {
    fontSize: 40,
    fontWeight: '900',
    color: '#00E5FF',
    letterSpacing: 10,
    marginVertical: 8,
  },
  otpClientHint: {
    fontSize: 12,
    color: '#7FA3B8',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  // OTP driver card
  otpDriverCard: {
    position: 'absolute',
    top: height * 0.38,
    left: 24,
    right: 24,
    zIndex: 20,
    backgroundColor: 'rgba(5, 26, 38, 0.85)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  otpDriverLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00E5FF',
  },
});

const darkStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#051A26',
  },
  map: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 10,
    width: width - 40,
    left: 20,
    right: 20,
    backgroundColor: "rgba(5, 26, 38, 0.8)",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    marginTop: 60,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  address: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
  },
  profileButton: {
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    borderRadius: 25,
    padding: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.3)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  detailsContainer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "rgba(5, 26, 38, 0.95)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 229, 255, 0.2)",
  },
  arrivalText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  cancelButtonModal: {
    position: "absolute",
    top: 20,
    right: 20,
  },
  cancelButtonText: {
    color: "red",
    fontSize: 16,
  },
  driverInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "rgba(0, 229, 255, 0.05)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.1)",
  },
  driverImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    elevation: 4,
    borderWidth: 2,
    borderColor: "#00E5FF",
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  driverRating: {
    fontSize: 13,
    color: "#B8C5D6",
    marginTop: 4,
  },
  driverTime: {
    fontSize: 13,
    color: "#B8C5D6",
    marginTop: 2,
  },
  carImage: {
    width: 60,
    height: 40,
    resizeMode: "contain",
    borderRadius: 50,
  },
  carDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  carModel: {
    fontSize: 16,
  },
  plateNumber: {
    fontSize: 16,
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between", // Espacio uniforme entre botones
    marginTop: 10, // Espacio superior opcional
    paddingHorizontal: 5, // Relleno lateral opcional
  },
  iniciarButton: {
    backgroundColor: "#610000", // Color verde para diferenciar el bot�n de iniciar
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5, // Espacio horizontal entre botones
    elevation: 5,
  },
  messageButton: {
    backgroundColor: "#a1a3a6",
    borderRadius: 10,
    padding: 15,
    flex: 1,
    alignItems: "center",
    marginRight: 10,
    elevation: 5,
  },
  messageButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  callButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    elevation: 5,
  },
  callButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",

    marginTop: 5,
  },
  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  header2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#000",
  },
  driverArrivalText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelRideText: {
    fontSize: 14,
    color: "red",
  },
  driverInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rating: {
    marginLeft: 5,
    fontSize: 14,
  },
  time: {
    marginLeft: 10,
    fontSize: 14,
    color: "grey",
  },

  carName: {
    fontSize: 14,
    fontWeight: "bold",
  },

  tripDetails: {
    marginBottom: 20,
  },
  tripTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#fff",
  },
  tripStops: {
    marginBottom: 10,
  },
  tripStopText: {
    fontSize: 14,
    marginBottom: 5,
    color: "#fff",
  },
  editRideText: {
    fontSize: 14,
    color: "red",
  },
  paymentDetails: {
    marginBottom: 20,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#fff",
  },
  amount: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  paymentLogo: {
    width: 30,
    height: 20,
    marginRight: 10,
  },
  cardText: {
    fontSize: 14,
  },
  cardNumber: {
    fontSize: 14,
    color: "grey",
    marginLeft: 5,
  },
  splitCostText: {
    fontSize: 14,
    color: "red",
  },
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contentContainer: {
    padding: 20,
    backgroundColor: "#000",
  },
  arrivalMapContainer: {
    height: 200,
    marginTop: 10,
  },
  arrivalMap: {
    ...StyleSheet.absoluteFillObject,
  },
  cancelButton: {
    position: "absolute",
    top: 20,
    right: 20,
  },

  reopenButton: {
    borderWidth: 0.4,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 50,
    backgroundColor: "#eee",
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 5,
  },
  unreadIndicator: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "green",
    borderWidth: 1,
    borderColor: "white",
  },
  reopenButtonText: {
    fontSize: 24,
    color: "#000",
  },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  confirmButton: {
    backgroundColor: "green",
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
    elevation: 2,
    flex: 1,
    alignItems: "center",
  },
  iconButton: {
    backgroundColor: "#00f4f5", // Color de fondo del bot�n
    padding: 10, // Espacio interno del bot�n
    borderRadius: 5, // Bordes redondeados
    alignItems: "center", // Alineaci�n centrada del contenido
    justifyContent: "center", // Alineaci�n vertical centrada
    marginHorizontal: 5, // Espacio horizontal entre botones
  },
  confirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  confirmButtonModal: {
    backgroundColor: "green",
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
    elevation: 2,
    flex: 1,
    alignItems: "center",
  },
  confirmButtonTextModal: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },

  cancelButtonTextModal: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    width: "120%",
  },
  modalView: {
    width: 300,
    margin: 20,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalConfirmButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalCancelButton: {
    backgroundColor: "#E91E63",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  radioContainerStyle: { paddingTop: 30, marginLeft: 10 },
  radioStyle: { paddingBottom: 25 },
  cancelModalButtosContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    marginBottom: 10,
  },
  radioText: { fontSize: 16, color: "#000" },
  cancelModalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(22,22,22,0.8)",
  },
  cancelReasonText: {
    top: 10,
    color: "#000",

    fontSize: 20,
    alignSelf: "center",
  },
  cancelModalInnerContainer: {
    height: 400,
    width: width * 0.85,
    padding: 0,
    backgroundColor: "#fff",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 7,
  },
  cancelModalButttonStyle: { backgroundColor: "gray", borderRadius: 0 },
  buttonSeparataor: {
    height: height / 35,
    width: 0.8,
    backgroundColor: "#FFF",
    alignItems: "center",
    marginTop: 3,
  },
  cancelModalButtonContainerStyle: {
    minWidth: 140,
    alignSelf: "center",
    borderRadius: 10,
  },
  floatButton1: {
    borderWidth: 1,
    borderColor: "#00f4f5",
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 50,
    backgroundColor: "#00f4f5",
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 5,
    position: "relative", // Asegura que el indicador se posicione relativo al bot�n
    margin: 2,
  },
  hbox2: {
    width: 1,
    backgroundColor: MAIN_COLOR,
    left: 8,
    bottom: 5,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconImage: {
    width: 30,
    height: 30,
    marginBottom: 6,
  },
  tripDateText: {
    marginLeft: 6,
    color: colors.LIGHT_RED,
  },

  tripStopSeparator: {
    height: 1,
    backgroundColor: colors.GREY,
    marginVertical: 5,
  },

  amountText: {
    fontSize: 16,
    color: "#00f4f5",
    marginBottom: 10,
  },
  paymentMethodContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    top: 8,
  },
  paymentMethod: {
    flexDirection: "column",
    alignItems: "center",
  },
  iconText: {
    fontSize: 14,
    marginBottom: 5,
  },
  methodText: {
    fontSize: 14,
    textAlign: "center",
    color: "#474747",
  },
  tripDetail: {
    fontSize: 14,
    color: "#777",
  },
  successModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  successModalView: {
    width: 250,
    padding: 20,
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    alignItems: "center",
    elevation: 10,
  },
  successModalText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
  modalButton: {
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5,
    backgroundColor: "#00f4f5",
  },
  modalButtonCancel: {
    borderRadius: 10,
    padding: 10,
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5,
    backgroundColor: "#ffff",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // --- Waiting panel (status NEW) ---
  verificationBadge: { position: 'absolute', bottom: height * 0.52, left: 16, zIndex: 15 },
  verificationBadgeInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 24, paddingVertical: 8, paddingHorizontal: 14, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  verificationBadgeText: { fontSize: 13, fontWeight: '600', color: '#00d4d7' },
  waitingPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 20, maxHeight: height * 0.52, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10, zIndex: 20 },
  dragIndicatorRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 14 },
  dragBar: { width: width * 0.15, height: 4, borderRadius: 2, backgroundColor: '#333' },
  viewersSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, backgroundColor: '#222', borderRadius: 16, marginHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  viewersSectionTitle: { fontSize: 18, fontWeight: '800', color: '#eee', lineHeight: 24 },
  viewersSectionCount: { color: '#eee', fontWeight: '800', fontSize: 18 },
  viewersAvatarRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
  viewerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#444', justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: '#1a1a1a', overflow: 'hidden' },
  viewerAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  priceSection: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20 },
  discountLabel: { fontSize: 14, color: '#888', marginBottom: 14, textAlign: 'center' },
  priceAdjustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  priceAdjustBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#333' },
  priceAdjustBtnText: { fontSize: 16, fontWeight: '700', color: '#ddd' },
  priceCenter: { flexDirection: 'row', alignItems: 'center' },
  priceValue: { fontSize: 30, fontWeight: '900', color: '#eee' },
  confirmAdjustBtn: { marginTop: 16, backgroundColor: '#2a2a2a', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, alignItems: 'center', width: '100%' },
  confirmAdjustBtnText: { fontSize: 16, fontWeight: '600', color: '#666' },
  autoConnectRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#222', marginTop: 4 },
  autoConnectText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#eee', lineHeight: 21, marginRight: 12 },
  promoBanner: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#3a3520', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  promoBannerTitle: { fontSize: 16, fontWeight: '800', color: '#eee' },
  promoBannerCode: { fontSize: 13, color: '#999', marginTop: 2 },
  cancelWaitingBtn: { marginHorizontal: 16, marginTop: 16, marginBottom: 8, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(233,30,99,0.1)' },
  cancelWaitingBtnText: { fontSize: 15, fontWeight: '700', color: '#E91E63' },
  // Driver accepted / OTP cards
  acceptedCard: { position: 'absolute', top: height * 0.42, left: 16, right: 16, zIndex: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  acceptedText: { fontSize: 15, fontWeight: '700', color: '#00d4d7' },
  etaPill: { position: 'absolute', top: 70, left: 70, right: 70, zIndex: 25, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, borderWidth: 1, borderColor: 'rgba(0, 244, 245, 0.35)' },
  etaPillIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#00f4f5', alignItems: 'center', justifyContent: 'center' },
  etaPillLabel: { fontSize: 11, fontWeight: '600', color: '#888', letterSpacing: 0.3 },
  etaPillValue: { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 2 },
  etaPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00f4f5' },
  otpClientCard: { position: 'absolute', top: height * 0.35, left: 24, right: 24, zIndex: 20, backgroundColor: '#1a1a1a', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  otpClientLabel: { fontSize: 13, color: '#888', marginBottom: 6 },
  otpClientCode: { fontSize: 36, fontWeight: '900', color: '#00f4f5', letterSpacing: 8 },
  otpClientHint: { fontSize: 12, color: '#666', marginTop: 6, textAlign: 'center' },
  otpDriverCard: { position: 'absolute', top: height * 0.38, left: 24, right: 24, zIndex: 20, backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  otpDriverLabel: { fontSize: 14, fontWeight: '600', color: '#ddd' },
});

export default BookingCabScreen;



