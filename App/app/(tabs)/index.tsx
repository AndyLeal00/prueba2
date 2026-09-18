import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  Dimensions,
  Image,
  Switch,
  Platform,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  useColorScheme,
  Linking,
  FlatList,
  Animated,
  InteractionManager,
} from "react-native";
import { useSelector } from "react-redux";
import { RootState } from "@/common/store";
import { updateProfile } from "@/common/actions/authactions";
import BookingsView from "@/components/BookingsView";
import {
  acceptBooking,
  listenForNewBookings,
  removeBooking,
} from "@/common/store/bookingsSlice";
import { useNavigation } from "@react-navigation/native";
// Firebase imports eliminados - migrado a Supabase
import { fetchMemberships } from "@/common/reducers/membershipSlice"; // Import the fetchMemberships action
import { differenceInDays } from "date-fns";
import { fetchKilometers } from "@/common/reducers/KilometersSlice";
import {
  listenToSettingsChanges,
  selectSettings,
} from "@/common/reducers/settingsSlice";
import * as Animatable from "react-native-animatable";
import { Ionicons, AntDesign, MaterialIcons } from "@expo/vector-icons";
import RNPickerSelect from "react-native-picker-select";
import * as ImagePicker from "expo-image-picker";
import { Button, Input } from "react-native-elements";
import { ActivityIndicator } from "react-native"; // Aseg�rate de importar ActivityIndicator
import axios from "axios";
import supabase, { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { mapSupabaseBooking } from '@/common/store/bookingsSlice';
const { width, height: screenHeight } = Dimensions.get("window");
import { useRoute } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import BottomSheet from "@gorhom/bottom-sheet"; // Importa el BottomSheet
import MapSensor, { MapSensorHandle, MapViewMode } from "./mapaSensors";
import type { GoogleMapTheme } from '@/config/googleMapsDarkStyle';
import MapCompassIcon from '@/components/MapCompassIcon';
import { LinearGradient } from 'expo-linear-gradient';
import DriverReservationsScreen from "./DriverReservationsScreen";
import { ActiveTripBannerStack } from "@/components/ActiveTripFloatingBanner";
import { useActiveTripBanner } from "@/hooks/useActiveTripBanner";
import DriverNotificationsModal from "@/components/DriverNotificationsModal";
import * as Speech from "expo-speech";
import { useAppDispatch } from "../../common/store/hooks";
import { updateUserProfile } from "@/common/reducers/authReducer";
import { showDriverActiveNotification, dismissDriverNotification, updateDriverNotification } from '@/hooks/DriverNotificationService';
import { requestIgnoreBatteryOptimization } from '@/common/services/batteryOptimizationPrompt';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { registerDriverGoHandlers } from '@/common/utils/driverGoBridge';
import { FIXED_TEXT_PROPS } from '@/common/utils/typography';
import { useDriverNavBottomPad } from '@/components/DriverBottomNav';

const tourImage = require("../../assets/images/icon.png");

// Tracks driver IDs that have already seen the membership-renewal reminder
// in the current app session. Reset on app reload (i.e. on next login).
const driversShownRenewalReminder = new Set<string>();

/** Puntos animados para "Buscando servicios..." */
function SearchingServicesLabel({ style }: { style?: object }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    let step = 0;
    const timer = setInterval(() => {
      step = (step + 1) % 4;
      setDots('.'.repeat(step));
    }, 420);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={style}>
      Buscando servicios
      <Text style={{ color: '#00E5FF' }}>{dots || ''}</Text>
    </Text>
  );
}

type UserDataState = {
  profile_image: string | null;
  mobile: string;
  docType: string;
  verifyId: string;
  bankAccount: string;
  city: string;
  addres: string;
  verifyIdImage?: string;
  firstName?: string;
  lastName?: string;
};

const toFiniteCoordinate = (value: any): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractImmediateCoords = (source: any): { lat: number; lng: number } | null => {
  if (!source) return null;

  const directLat = toFiniteCoordinate(source.lat ?? source.latitude ?? source.pickup_lat);
  const directLng = toFiniteCoordinate(source.lng ?? source.longitude ?? source.pickup_lng);
  if (directLat !== null && directLng !== null) {
    return { lat: directLat, lng: directLng };
  }

  const nestedLocation = source.location || source.pickup_location || source.pickup;
  if (nestedLocation) {
    if (typeof nestedLocation === 'string') {
      try {
        return extractImmediateCoords(JSON.parse(nestedLocation));
      } catch {
        return null;
      }
    }
    return extractImmediateCoords(nestedLocation);
  }

  return null;
};

const calculateImmediateDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
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


const MapScreen = () => {
  const dispatch = useAppDispatch();
  const user = useSelector((state: RootState) => state.auth.user) as any;
  const settings = useSelector(selectSettings);
  const [currentPosition, setCurrentPosition] = useState();
  const [isEnabled, setIsEnabled] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]); // Estado local para las reservas
  const profile = useSelector((state: RootState) => state.auth.profile) as any;
  const navigation = useNavigation<any>();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [checks, setChecks] = useState({
    carExists: user?.carExists || false,
    carApproved: user?.carApproved || false,
    licenseImage: user?.licenseImage || false,
    approved: user?.approved || false,
    verifyId: user?.verifyId || false,
    imageIdApproval: user?.imageIdApproval || false,
    term: user?.term || false,
    SOATImage: user?.SOATImage || false,
  });

  const memberships = useSelector(
    (state: RootState) => state.memberships.memberships
  );
  const membershipsLoading = useSelector(
    (state: RootState) => state.memberships.loading
  );
  const [showRenewBanner, setShowRenewBanner] = useState(false);
  const [showKmBanner, setShowKmBanner] = useState(false);
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);
  const [homeImmediateBookings, setHomeImmediateBookings] = useState<any[]>([]);
  const [activeBookingsCount, setActiveBookingsCount] = useState(0);
  const [tourVisible, setTourVisible] = useState(false);
  const [dbFirstName, setDbFirstName] = useState<string | null>(null);
  const [dbLastName, setDbLastName] = useState<string | null>(null);
  const totalSteps = 9; // Total de pasos en el tour
  const [loading, setLoading] = useState(false); // Estado para controlar el loader
  const [loadingMessage, setLoadingMessage] = useState(
    "Estamos verificando tu cuenta para asegurarnos de que todo est� en orden y as� protegerte a ti y a los dem�s usuarios. Este proceso solo tomar� unos 5 minutos. Es muy importante para nosotros garantizar la seguridad tanto de nuestros usuarios como de nuestros conductores. Agradecemos tu paciencia"
  );
  const [currentStep, setCurrentStep] = useState(0);
  const colorScheme = useColorScheme(); // Hook para detectar si es modo oscuro o claro
  const [userData, setUserData] = useState<UserDataState>({
    profile_image: user?.profile_image || null,
    mobile: user?.mobile || "",
    docType: user?.docType || "",
    verifyId: user?.verifyId || "",
    bankAccount: user?.bankAccount || "",
    city: user?.city || "",
    addres: user?.addres || "",
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [modalVisibleImage, setModalVisibleImage] = useState(false);
  const [docTypes] = useState(["CC", "Pasaporte", "CE"]);
  const [modalVisibleImageVerify, setModalVisibleImageVerify] = useState(false);
  const route = useRoute<any>();
  const [isEmailVerified, setIsEmailVerified] = useState(Boolean(user?.emailVerified));
  const [inprocess, setInprocess] = useState("");
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos din�micos
  const stepMessages = [
    "Est�s en el paso 1 de 9: Sube tu foto de perfil.",
    "Est�s en el paso 2 de 9: Ingresa tu n�mero de tel�fono.",
    "Est�s en el paso 3 de 9: Selecciona el tipo de documento.",
    "Est�s en el paso 4 de 9: Ingresa tu n�mero de documento.",
    "Est�s en el paso 5 de 9: Ingresa tu n�mero de DAVIPLATA.",
    "Est�s en el paso 6 de 9: Por favor, selecciona tu ciudad.",
    "Est�s en el paso 7 de 9: Por favor, ingresa tu direcci�n.",
    "Est�s en el paso 8 de 9: Por favor, actualiza tus documentos.",
    "Est�s en el paso 9 de 9: Resumen de la informaci�n.",
  ];
  const cities = [
    "Bogota",
    "Medellin",
    "Cali",
    "Barranquilla",
    "Cartagena",
    "Cucuta",
    "Bucaramanga",
    "Pereira",
    "Santa Marta",
    "Ibague",
    "Pasto",
    "Manizales",
    "Neiva",
    "Villavicencio",
    "Armenia",
    "Valledupar",
    "Monter�a",
    "Sincelejo",
    "Popay�n",
    "Floridablanca",
    "Palmira",
    "Bello",
    "Soledad",
    "Itag��",
    "San Juan de Pasto",
    "Santa Rosa de Cabal",
    "Tulu�",
    "Yopal",
    "Tumaco",
    "Florencia",
    "Girardot",
    "Zipaquira",
    "Buenaventura",
    "Riohacha",
    "Duitama",
    "Quibd�",
    "Arauca",
    "Tunja",
    "Magangu�",
    "Sogamoso",
    "Giron",
    "Chia",
    "Facatativa",
    "Rionegro",
    "Piedecuesta",
    "Ci�naga",
    "La Dorada",
    "Maicao",
    "Calarc�",
    "Fundaci�n",
    "La Ceja",
    "Chiquinquir�",
    "Sahag�n",
    "Villa del Rosario",
    "Montel�bano",
    "Arjona",
    "Turbo",
    "Tame",
    "El Banco",
    "Sabanalarga",
    "Ipiales",
    "Tuquerres",
    "Pitalito",
    "Distracci�n",
    "La Plata",
    "Chiriguan�",
    "Baranoa",
    "El Carmen de Bol�var",
    "San Jacinto",
    "Santo Tom�s",
    "Repel�n",
    "Planeta Rica",
    "El Ret�n",
    "Ci�naga de Oro",
    "San Onofre",
    "Mar�a la Baja",
    "Clemencia",
    "San Juan Nepomuceno",
    "El Guamo",
    "Carmen de Bol�var",
    "Sampu�s",
    "San Carlos",
    "Morroa",
    "Corozal",
    "Santa Rosa de Lima",
    "Turbaco",
    "San Juan del Cesar",
    "Ayapel",
    "Ceret�",
    "Momil",
    "Sinc�",
    "Chin�",
    "Ovejas",
    "Tolu",
    "Tuchin",
    "Bosconia",
    "Aguachica",
    "Gamarra",
    "San Alberto",
    "Curuman�",
    "Manaure",
    "Copey",
    "San Diego",
    "La Paz",
    "Valencia",
    "San Martin",
    "San Andres",
    "Providencia",
    "San Vicente del Caguan",
    "Mocoa",
    "Puerto Asis",
  ];
  const [closestBooking, setClosestBooking] = useState<any | null>(null);
  const [IsMapVisible, setIsMapVisible] = useState(false);
  const userTypeRaw = String(
    profile?.user_type ||
      user?.usertype ||
      user?.user_type ||
      user?.userType ||
      user?.user_metadata?.usertype ||
      user?.user_metadata?.user_type ||
      user?.user_metadata?.userType ||
      ''
  )
    .trim()
    .toLowerCase();
  const isDriverView = userTypeRaw === 'driver';
  const driverNavBottomPad = useDriverNavBottomPad();

  const resolveDriverName = useCallback(async () => {
    const profileFirst = String(profile?.first_name || profile?.firstName || '').trim();
    const profileLast = String(profile?.last_name || profile?.lastName || '').trim();

    if (profileFirst || profileLast) {
      console.log('[VOICE] name from auth.profile/users:', profileFirst || '(null)', profileLast || '(null)');
      return {
        firstName: profileFirst || null,
        lastName: profileLast || null,
      };
    }

    // REST directo � el cliente Supabase JS cuelga
    const authId = profile?.auth_id || user?.auth_id || user?.user_metadata?.sub || profile?.id || user?.id;
    if (!authId) {
      console.log('[VOICE] no authId available for REST lookup');
      return null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const url = `${SUPABASE_URL}/rest/v1/users?or=(auth_id.eq.${encodeURIComponent(authId)},id.eq.${encodeURIComponent(authId)})&select=first_name,last_name&limit=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const p = data[0];
        console.log('[VOICE] name from REST:', p.first_name, p.last_name);
        return {
          firstName: p.first_name || null,
          lastName: p.last_name || null,
        };
      }
    } catch (e: any) {
      console.log('[VOICE] REST name lookup error:', e?.name === 'AbortError' ? 'timeout' : e?.message);
    }

    console.log('[VOICE] name not found via REST, fallback');
    return null;
  }, [profile?.auth_id, profile?.first_name, profile?.firstName, profile?.id, profile?.last_name, profile?.lastName, user?.auth_id, user?.id, user?.user_metadata?.sub]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`balance-bookings-${user.id}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'bookings', filter: `driver=eq.${user.id}` },
        () => { fetchBalanceBookings(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const fetchFirstName = async () => {
      try {
        const fullName = await resolveDriverName();
        if (isMounted) {
          setDbFirstName(fullName?.firstName || null);
          setDbLastName(fullName?.lastName || null);
          console.log('[VOICE] db name state set to:', fullName?.firstName || '(null)', fullName?.lastName || '(null)');
        }
      } catch (error) {
        console.log('[VOICE] fetchFirstName error:', error);
        if (isMounted) {
          setDbFirstName(null);
          setDbLastName(null);
        }
      }
    };

    fetchFirstName();

    return () => {
      isMounted = false;
    };
  }, [resolveDriverName]);

  useEffect(() => {
    if (user) {
      setIsEmailVerified(user.emailVerified);
    }
  }, [user]);

  useEffect(() => {
    if (isDriverView) {
      setIsMapVisible(true);
    }
  }, [isDriverView]);

  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.openModal) {
        // Tour de onboarding deshabilitado: nunca debe mostrarse
        navigation.setParams({ openModal: undefined });
      }
    }, [route.params?.openModal])
  );
  // Tour de onboarding deshabilitado: el modal de "paso N de 9" no debe aparecer.
  useEffect(() => {
    setTourVisible(false);
  }, [
    isDriverView,
    user.verifyIdImage,
    user.verifyId,
    user.docType,
    user.profile_image,
    user.mobile,
    user.bankAccount,
    user.city,
    user.addres,
    user
  ]);
  
  // TEMPORALMENTE DESHABILITADO - Pendiente configurar Supabase email verification
  /* useEffect(() => {
    if (!isEmailVerified) {
      navigation.navigate("EmailVerificationScreen"); // Navega a una pantalla de verificaci�n de email si lo deseas
    }
  }, [isEmailVerified]); */
  
  useEffect(() => {
    if (loading) {
      const messages = [
        "Estamos verificando tu cuenta para asegurarnos de que todo est� en orden y as� protegerte a ti y a los dem�s usuarios. Este proceso solo tomar� unos 5 minutos. Es muy importante para nosotros garantizar la seguridad tanto de nuestros usuarios como de nuestros conductores. Agradecemos tu paciencia",
        "Ya casi terminamos, falta un poco...",
        "Est� tardando un poco m�s de lo esperado, gracias por tu paciencia...",
      ];

      let messageIndex = 0;
      setLoadingMessage(messages[messageIndex]); // Muestra el primer mensaje inicialmente
      const interval = setInterval(() => {
        messageIndex = (messageIndex + 1) % messages.length;
        setLoadingMessage(messages[messageIndex]);
      }, 30000); // Cambia el mensaje cada 30 segundos

      return () => clearInterval(interval); // Limpia el intervalo al desmontar
    }
  }, [loading]);

  useEffect(() => {
    // Start listening to settings changes
    dispatch(listenToSettingsChanges());
  }, [dispatch]);

  // El FK de memberships.conductor referencia auth.users(id), o sea el auth_id del conductor.
  // Probamos auth_id primero, con fallbacks por compatibilidad con datos legacy creados con users.id.
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
  // Marca el id para el cual ya completó (ok o error) el fetch inicial de membresías.
  // Sin esto, en el primer render con driverConductorId presente, membershipsLoading sigue
  // siendo `false` (estado inicial) en el closure del effect del popup, así que el modal
  // se disparaba antes de que el fetch terminara. Esperamos a que resuelva.
  const [membershipFetchedFor, setMembershipFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (driverConductorId) {
      // Un único fetch con el id canónico (igual que WalletDetails). Hacer fetch en paralelo
      // por cada candidato sobreescribe state.memberships y borraba la membresía activa.
      const promise = dispatch(fetchMemberships(driverConductorId));
      Promise.resolve(promise as unknown as Promise<unknown>).finally(() => {
        setMembershipFetchedFor(driverConductorId);
      });
      dispatch(fetchKilometers(driverConductorId));
    }
  }, [dispatch, driverConductorId]);

  // El API ya filtra por conductor; basta con detectar una membresía con status ACTIVA y vigente.
  const activeMembership = memberships.find((membership) => {
    if (membership?.status?.toString().toUpperCase() !== "ACTIVA") return false;
    if (!membership?.fecha_terminada) return true;
    return differenceInDays(new Date(membership.fecha_terminada), new Date()) >= 0;
  });

  useEffect(() => {
    console.log('[Membership] check', {
      driverIdCandidates,
      memberships: memberships.length,
      activeMembership: activeMembership?.uid || null,
      isDriverView,
    });
  }, [driverIdCandidates, memberships, activeMembership, isDriverView]);

  useEffect(() => {
    if (activeMembership) {
      const daysLeft = differenceInDays(
        new Date(activeMembership.fecha_terminada),
        new Date()
      );
      if (daysLeft <= 5) {
        setShowRenewBanner(true);
      }
    }

    if (user?.kilometers !== null && user?.kilometers <= 10) {
      setShowKmBanner(true);
    } else {
      setShowKmBanner(false);
    }
  }, [activeMembership, user?.kilometers]);

  // Recordatorio amigable de renovación al iniciar sesión (una vez por sesión)
  useEffect(() => {
    if (!isDriverView) return;
    if (membershipsLoading) return;
    if (!driverConductorId) return;
    // Espera a que el primer fetch de membresías para este conductor haya resuelto.
    // Sin esto, el modal podía dispararse en el render donde driverConductorId aparece
    // pero el thunk aún no había marcado loading=true.
    if (membershipFetchedFor !== driverConductorId) return;
    // Solo mostramos el aviso si el conductor NO tiene ninguna membresía.
    // Si ya tiene una (activa, vencida o pendiente), se omite.
    if (activeMembership) return;
    if (memberships.length > 0) return;
    if (driversShownRenewalReminder.has(driverConductorId)) return;

    driversShownRenewalReminder.add(driverConductorId);
    const driverFirst = (dbFirstName || user?.firstName || user?.first_name || '').toString().trim();
    const greeting = driverFirst ? `¡Hola ${driverFirst}! ` : '¡Hola! ';
    showAlert(
      'info',
      '¡Te extrañamos en la ruta! 🚗',
      `${greeting}Notamos que tu membresía no está activa. Mientras tanto puedes ver los servicios disponibles, pero para tomarlos y seguir generando ingresos necesitas renovar tu membresía.\n\nRenuévala ahora y vuelve a ganar con T+Plus. ¡Tus pasajeros te esperan!`,
      [
        { text: 'Más tarde', style: 'cancel', onPress: () => setAlertVisible(false) },
        {
          text: 'Renovar ahora',
          onPress: () => {
            setAlertVisible(false);
            navigation.navigate('Wallet');
          },
        },
      ],
    );
  }, [
    isDriverView,
    membershipsLoading,
    driverConductorId,
    membershipFetchedFor,
    activeMembership,
    memberships,
    dbFirstName,
    navigation,
  ]);

  useEffect(() => {
    if (!user?.carType || !user?.location) {
      // Si falta el carType o la ubicaci�n, mostrar el modal para resolver el problema
      const hasUnresolvedIssues = Object.values(checks).some(
        (value) => value === false
      );
      console.log('[DRIVER-FEED] Sin carType o location — no se suscribe a bookings NEW.', {
        carType: user?.carType,
        location: user?.location,
      });
      setIsModalVisible(hasUnresolvedIssues);
      return; // Detener la ejecuci�n si falta el carType o la ubicaci�n
    }

    const applyFilter = (bookingsList: any[]) => {
      const filtered = bookingsList.filter((booking) => {
        const isCarTypeMatch = booking.carType === user?.carType;
        const normalizedMatch = String(booking.carType || '').trim().toLowerCase() ===
          String(user?.carType || '').trim().toLowerCase();
        if (isCarTypeMatch !== normalizedMatch) {
          console.warn('[DRIVER-FEED] carType difiere solo por mayúsculas/espacios — booking:', booking.carType, 'driver:', user?.carType);
        }
        if (!isCarTypeMatch || !booking.pickup) {
          console.log('[DRIVER-FEED] booking descartado', {
            id: booking.id,
            bookingCarType: booking.carType,
            driverCarType: user?.carType,
            isCarTypeMatch,
            hasPickup: !!booking.pickup,
          });
          return false;
        }

        let maxDistance = 8000;
        if (booking.bookLater) {
          const timeDiffMin = Math.floor((Date.now() - new Date(booking.bookingDate || booking.created_at).getTime()) / 60000);
          maxDistance = Math.min(30000 + Math.floor(timeDiffMin / 10) * 10000, 70000);
        }

        const distance = getDistanceFromLatLonInMeters(
          user.location.lat, user.location.lng,
          booking.pickup.lat, booking.pickup.lng
        );
        const withinRange = distance <= maxDistance;
        if (!withinRange) {
          console.log('[DRIVER-FEED] booking fuera de rango', { id: booking.id, distance, maxDistance });
        }
        return withinRange;
      });
      console.log(`[DRIVER-FEED] ${filtered.length}/${bookingsList.length} bookings pasaron el filtro.`);
      setIsMapVisible(filtered.length > 0);
      setFilteredBookings(filtered);
    };

    // Carga inicial desde Supabase
    supabase
      .from('bookings')
      .select('*')
      .eq('status', 'NEW')
      .then(({ data, error }) => {
        if (error) {
          console.error('[DRIVER-FEED] Error consultando bookings NEW:', error);
        }
        console.log(`[DRIVER-FEED] Supabase devolvió ${data?.length || 0} bookings en status NEW.`);
        const mapped = (data || []).map(mapSupabaseBooking);
        applyFilter(mapped);
      });

    // Realtime: nuevas reservas y cambios de estado
    const channel = supabase
      .channel('index-new-bookings')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'bookings', filter: 'status=eq.NEW' },
        (payload: any) => {
          console.log('[DRIVER-FEED] Realtime INSERT recibido:', payload.new?.id, payload.new?.car_type);
          const booking = mapSupabaseBooking(payload.new);
          setFilteredBookings((prev: any[]) => {
            const updated = [...prev.filter((b) => b.id !== booking.id), booking];
            applyFilter(updated);
            return updated;
          });
        }
      )
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        (payload: any) => {
          if (payload.new.status !== 'NEW') {
            setFilteredBookings((prev: any[]) => prev.filter((b) => b.id !== payload.new.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.carType, user?.location]);
  
  // Funci�n para calcular distancia en metros
  const getDistanceFromLatLonInMeters = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
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

  useEffect(() => {
    bookings.forEach((booking) => {
      if (booking.status !== "NEW") {
        dispatch(removeBooking(booking.id));
      }
    });
  }, [bookings, dispatch]);

  // Effect to watch position changes
  const handleSwipeSuccess = async (newStatus: boolean) => {
    const updateData = {
      driverActiveStatus: newStatus,
    };

    //console.log("Despachando actualizaci�n de perfil con:", updateData);

    try {
      await dispatch(updateProfile(updateData));

    } catch (error) {
      console.error("Error actualizando estado:", error);
      showAlert('error', 'Error', 'No se pudo actualizar el estado. Por favor, int�ntalo nuevamente.');
    }
  };
  const DailySavings = () => {



    const handlePress = (id: number) => {
      switch (id) {
        case 1:
          navigation.navigate('CarsScreen');
          break;
        case 2:
          navigation.navigate('RideList');
          break;
        case 3:
          Linking.openURL(`https://wa.me/message/BTQOY5GZC7REF1`);
          break;
        case 4:
          navigation.navigate('Docs');
          break;
        case 5:
          Linking.openURL('https://tmasplus.com/terminos-y-condiciones');
          break;
        case 6:
          Linking.openURL('https://tmasplus.com/condiciones-recargas');
          break;
        case 7:
          navigation.navigate('SecurityContact');
          break;
        case 8:
          const call_link = Platform.OS === 'android' ? `tel:${settings.panic}` : `telprompt:${settings.panic}`;
          Linking.openURL(call_link);
          break;
        default:
          console.log('Acci�n no definida');
      }
    };

    const cards: Array<{ id: number; title: string; subtitle: string; image: any; badge?: any; animation?: string; }> = [
      {
        id: 1,
        title: "�Informaci�n de tu veh�culo!",
        subtitle: `Toca aqu� para ver los detalles de tu veh�culo.\nVeh�culo activo: ${user.carType}.\nPlaca: ${user?.vehicleNumber}.`,
        image: user?.car_image ? { uri: user.car_image } : require("@/assets/images/iconos3d/12.png"),
      },
      {
        id: 2,
        title: `�Tienes ${activeBookingsCount} ${activeBookingsCount === 1 ? 'reserva activa' : 'reservas activas'}!`,
        subtitle: `�Hola! ${closestBooking ? `Tienes una reserva para el ${new Date(closestBooking.tripdate).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}. El viaje es desde ${closestBooking.pickupAddress} hasta ${closestBooking.dropAddress}.` : 'Pronto tendr�s una nueva reserva.'}`,
        image: require("@/assets/images/iconos3d/45.png"),
        badge: activeBookingsCount > 0 ? {
          value: activeBookingsCount,
          color: '#FFFFFF'
        } : null,
        animation: 'pulse',
      },
      {
        id: 3,
        title: "Chatea con nosotros",
        subtitle: "�Necesitas ayuda? Comun�cate con nosotros por WhatsApp para obtener soporte r�pido y personalizado.",
        image: require("@/assets/images/iconos3d/36.png"),
      },
      {
        id: 4,
        title: "Verifica y actualiza tu perfil",
        subtitle: "En T+Plus, tu seguridad es nuestra prioridad. Realizamos un estudio de seguridad para garantizar que todo est� en orden. Actualiza tu perfil con total tranquilidad.",
        image: require("@/assets/images/iconos3d/19.png"),
      },
      {
        id: 5,
        title: "T�rminos y condiciones",
        subtitle: "Consulta los t�rminos y condiciones de T+Plus para conocer nuestras pol�ticas y c�mo aseguramos una experiencia segura y transparente para todos nuestros usuarios.",
        image: require("@/assets/images/iconos3d/25.png"),
      },
      {
        id: 6,
        title: "Acceso a contacto de seguridad",
        subtitle: "Agrega contactos de confianza para que podamos notificarles en caso de emergencia. Mant�n a tus seres queridos informados y seguros mientras usas T+Plus.",
        image: require("@/assets/images/iconos3d/24.png"),
      },
      {
        id: 7,
        title: "Bot�n de emergencia (SOS)",
        subtitle: "En caso de emergencia, utiliza el bot�n de SOS para alertar a tus contactos de seguridad o recibir ayuda inmediata. Tu seguridad es nuestra prioridad.",
        image: require("@/assets/images/iconos3d/17.png"),
      }
    ];

    return (
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cards.map((card: any, index: number) => (
            <Animatable.View
              key={card.id}
              animation="fadeInUp"
              duration={550}
              delay={index * 80}
              useNativeDriver={true}
            >
              <TouchableOpacity style={styles.cardDayli} onPress={() => handlePress(card.id)}>
                <Image source={card.image} style={styles.cardImageDayli} />
                <Text style={styles.cardTitleDayli}>{card.title}</Text>
                <Text style={styles.cardSubtitleDayli}>{card.subtitle}</Text>
              </TouchableOpacity>
            </Animatable.View>
          ))}
        </ScrollView>
      </View>
    );
  };
  useEffect(() => {
    setIsEnabled(user?.driverActiveStatus || false);
  }, [user]);

  const handleAccept = (booking: any) => {
    // Bloquear toma de servicios si el conductor no tiene membresía ACTIVA.
    // Regla de negocio: sin membresía activa, puede ver pero no tomar.
    if (isDriverView && !activeMembership) {
      console.log('[Membership] handleAccept BLOQUEADO: sin membresía activa', {
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
              navigation.navigate('Wallet');
            },
          },
        ],
      );
      return;
    }

    if (!user) {
      showAlert('error', 'Error', 'No se encontró el perfil del conductor.');
      return;
    }

    navigation.navigate("RideList", { booking });

    dispatch(acceptBooking({ booking, driverProfile: user }))
      .unwrap()
      .then(() => {
        // Enviar notificaci�n
       
        fetch(
          "https://us-central1-treasupdate.cloudfunctions.net/sendMassNotification",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tokens: [booking.customer_token],
              title: 'Servicio aceptado',
              body: 'Hola ' + booking.customer_name + ', su servicio ha sido aceptado con exito. El conductor ' + user.firstName + ' ' + user.lastName + ' esta listo para atenderle. Puede comunicarse con el a traves del chat de la reserva. La placa del vehiculo es ' + user.vehicleNumber + '.',
            }),
          }
        )
          .then((response) => response.json())
          .then((data) => {
            console.log("Notificaci�n enviada:", data);
          })
          .catch((error: unknown) => {
            console.error("Error al enviar la notificaci�n:", error);
          });
      })
      .catch((error) => {
        showAlert('error', 'Error', 'No se pudo aceptar la reserva: ' + error);
      });
  };

  const [lastDeclineTime, setLastDeclineTime] = useState<number | null>(null);
  const [bookingModalDecline, setBookingModalDecline] = useState(false);
  const [driverOnline, setDriverOnline] = useState(
    Boolean(profile?.driver_active_status || user?.driver_active_status || user?.driverActiveStatus)
  );
  const [showIncomingRequest, setShowIncomingRequest] = useState(false);
  const [showNovedades, setShowNovedades] = useState(false);
  const [showDriverServicesModal, setShowDriverServicesModal] = useState(false);
  const [driverImmediateFeedEnabled, setDriverImmediateFeedEnabled] = useState(false);
  const [driverImmediateLoading, setDriverImmediateLoading] = useState(false);
  const [driverServicesListReady, setDriverServicesListReady] = useState(false);
  // Vuelto a `false` temporalmente (2026-07-04) para aislar la causa de la
  // pantalla en blanco al presionar GO durante debug remoto — con `true` se
  // activa un pipeline extra (polling cada 7s + logs pesados con JSON
  // completo de bookings) que la versión estable (commit 1da2d02) nunca
  // ejecutaba, y que podía competir por memoria/CPU justo cuando el mapa
  // nativo intenta inicializar. `filteredBookings` (búsqueda realtime real,
  // el mecanismo que sí encuentra bookings — ver [[10-deuda-tecnica]] #29)
  // sigue activo e independiente de este flag. Volver a `true` cuando se
  // necesite el modal de solicitud entrante, una vez descartado el GL.
  const ENABLE_DRIVER_MAP_RESERVATIONS = false;
  const [driverReservationsMinimized, setDriverReservationsMinimized] = useState(false);
  const goToggleLockRef = useRef(false);
  const mapSensorRef = useRef<MapSensorHandle>(null);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('2D');
  const [mapTheme, setMapTheme] = useState<GoogleMapTheme>('dark');
  const [mapBearing, setMapBearing] = useState(0);
  const { bookings: activeTripBookings, hasActiveTrip } = useActiveTripBanner();
  const driverReservationsExpandedHeight = Math.max(300, Math.round(screenHeight * 0.52));
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
  const destGlowAnim = useRef(new Animated.Value(0)).current;

  const [driverHasUnreadNotif, setDriverHasUnreadNotif] = useState(false);
  const [driverActiveBookingId, setDriverActiveBookingId] = useState<string | null>(null);
  const [driverNotifModalVisible, setDriverNotifModalVisible] = useState(false);
  const driverLastBookingIdRef = useRef<string | null>(null);
  const driverBellAnim = useRef(new Animated.Value(0)).current;
  const driverBellFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isDriverView) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(driverBellFloat, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(driverBellFloat, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isDriverView, driverBellFloat]);

  const shakeDriverBell = useCallback(() => {
    Animated.sequence([
      Animated.timing(driverBellAnim, { toValue: -15, duration: 80, useNativeDriver: true }),
      Animated.timing(driverBellAnim, { toValue: 12, duration: 80, useNativeDriver: true }),
      Animated.timing(driverBellAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(driverBellAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(driverBellAnim, { toValue: -4, duration: 80, useNativeDriver: true }),
      Animated.timing(driverBellAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [driverBellAnim]);

  const onDriverBellPress = useCallback(() => {
    setDriverHasUnreadNotif(false);
    shakeDriverBell();
    // Antes: navigation.navigate('Notifications') → pantalla completa NotificationsScreen.
    // Se conserva la pantalla en el stack; ahora la campanita abre el modal de servicios/noticias.
    setDriverNotifModalVisible(true);
  }, [shakeDriverBell]);

  const driverBellRot = driverBellAnim.interpolate({
    inputRange: [-15, 0, 15],
    outputRange: ['-15deg', '0deg', '15deg'],
  });
  const driverBellY = driverBellFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2.5],
  });

  const refreshDriverActiveBooking = useCallback(async () => {
    if (!isDriverView) return;
    try {
      const headers = await getSupabaseAuthHeaders();
      const candidates = [user?.id, user?.auth_id].filter(Boolean);
      let driverUsersId: string | null = null;
      for (const c of candidates) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/users?or=(id.eq.${c},auth_id.eq.${c})&select=id&limit=1`,
          { headers },
        );
        if (r.ok) {
          const rows = await r.json();
          if (rows?.[0]?.id) { driverUsersId = rows[0].id; break; }
        }
      }
      if (!driverUsersId) return;
      const statuses = ['ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED']
        .map(s => `"${s}"`)
        .join(',');
      const url = `${SUPABASE_URL}/rest/v1/bookings?driver_id=eq.${driverUsersId}&status=in.(${statuses})&order=created_at.desc&limit=1&select=id,status`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) return;
      const rows = await resp.json();
      const b = rows?.[0];
      if (b?.id) {
        if (driverLastBookingIdRef.current && driverLastBookingIdRef.current !== b.id) {
          setDriverHasUnreadNotif(true);
          shakeDriverBell();
        }
        driverLastBookingIdRef.current = b.id;
        setDriverActiveBookingId(b.id);
      } else {
        driverLastBookingIdRef.current = null;
        setDriverActiveBookingId(null);
      }
    } catch {}
  }, [isDriverView, user?.auth_id, user?.id, shakeDriverBell]);

  useEffect(() => {
    if (!isDriverView) return;
    refreshDriverActiveBooking();
    const interval = setInterval(refreshDriverActiveBooking, 15000);
    return () => clearInterval(interval);
  }, [isDriverView, refreshDriverActiveBooking]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(destGlowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(destGlowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handleDecline = () => {
    setBookingModalDecline(false); // Cierra el modal
    setLastDeclineTime(Date.now()); // Guarda el tiempo actual
  };

  const immediateBookings = useMemo(() => homeImmediateBookings || [], [homeImmediateBookings]);

  useEffect(() => {
    if (!ENABLE_DRIVER_MAP_RESERVATIONS) {
      setDriverImmediateFeedEnabled(false);
      setDriverImmediateLoading(false);
      setDriverServicesListReady(false);
      setHomeImmediateBookings([]);
      return;
    }

    if (!driverOnline) {
      setDriverImmediateFeedEnabled(false);
      setDriverImmediateLoading(false);
      setDriverServicesListReady(false);
      return;
    }

    setDriverImmediateFeedEnabled(false);
    setDriverImmediateLoading(true);
    setDriverServicesListReady(false);

    let cancelled = false;
    let interactionTask: { cancel?: () => void } | null = null;
    const timeoutId = setTimeout(() => {
      interactionTask = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) {
          setDriverImmediateFeedEnabled(true);
        }
      });
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      interactionTask?.cancel?.();
    };
  }, [driverOnline, ENABLE_DRIVER_MAP_RESERVATIONS]);

  useEffect(() => {
    const now = Date.now();

    if (
      ENABLE_DRIVER_MAP_RESERVATIONS &&
      driverOnline &&
      driverImmediateFeedEnabled &&
      !driverImmediateLoading &&
      immediateBookings.length > 0 &&
      (!lastDeclineTime || now - lastDeclineTime > 15000)
    ) {
      setBookingModalDecline(true); // Muestra el modal solo si han pasado m�s de 15 segundos
    } else {
      setBookingModalDecline(false);
    }
  }, [driverImmediateFeedEnabled, driverImmediateLoading, driverOnline, immediateBookings, lastDeclineTime, ENABLE_DRIVER_MAP_RESERVATIONS]);

  const fetchHomeImmediateBookings = useCallback(async (silent = false) => {
    if (!ENABLE_DRIVER_MAP_RESERVATIONS || !driverOnline || !driverImmediateFeedEnabled) {
      setHomeImmediateBookings([]);
      if (!silent) {
        setDriverImmediateLoading(false);
      }
      return;
    }

    if (!silent) {
      setDriverImmediateLoading(true);
    }

    try {
      const headers = await getSupabaseAuthHeaders();
      const driverCoords = extractImmediateCoords({
        ...profile,
        ...user,
        location: user?.location || profile?.location || currentPosition,
      });
      const url = `${SUPABASE_URL}/rest/v1/bookings?booking_type=eq.immediate&limit=1000&select=*&order=created_at.desc`;
      const response = await fetch(url, { headers });
      const rows = response.ok ? await response.json() : [];

      if (!Array.isArray(rows)) {
        setHomeImmediateBookings([]);
        return;
      }

      const nextImmediateBookings = rows.filter((booking: any) => {
        const status = String(booking?.status || '').toUpperCase();
        if (status !== 'NEW' && status !== 'PENDING') return false;

        const hasDriverAssigned = Boolean(String(booking?.driver || '').trim()) || Boolean(String(booking?.driver_id || '').trim());
        if (hasDriverAssigned) return false;

        const bookingCarType = String(booking?.car_type || booking?.carType || '').trim().toLowerCase();
        const driverCarType = String(user?.carType || user?.car_type || '').trim().toLowerCase();
        if (bookingCarType && driverCarType && bookingCarType !== driverCarType) return false;

        const pickupCoords = extractImmediateCoords(booking);
        if (!driverCoords || !pickupCoords) return true;

        const distanceKm = calculateImmediateDistanceKm(
          driverCoords.lat,
          driverCoords.lng,
          pickupCoords.lat,
          pickupCoords.lng,
        );

        booking.distance_to_pickup_km = distanceKm;
        return distanceKm <= 3;
      });

      setHomeImmediateBookings(nextImmediateBookings);
    } catch (error) {
      console.error('Error fetching home immediate bookings:', error);
      setHomeImmediateBookings([]);
    } finally {
      if (!silent) {
        setDriverImmediateLoading(false);
      }
    }
  }, [currentPosition, driverImmediateFeedEnabled, driverOnline, profile, user, ENABLE_DRIVER_MAP_RESERVATIONS]);

  useEffect(() => {
    if (!ENABLE_DRIVER_MAP_RESERVATIONS || !driverOnline || !driverImmediateFeedEnabled) {
      setHomeImmediateBookings([]);
      return;
    }

    void fetchHomeImmediateBookings(false);
    const interval = setInterval(() => {
      void fetchHomeImmediateBookings(true);
    }, 7000);
    return () => clearInterval(interval);
  }, [driverImmediateFeedEnabled, driverOnline, fetchHomeImmediateBookings, ENABLE_DRIVER_MAP_RESERVATIONS]);

  useEffect(() => {
    if (!ENABLE_DRIVER_MAP_RESERVATIONS || !showDriverServicesModal) {
      setDriverServicesListReady(false);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        setDriverServicesListReady(true);
      }
    });

    if (driverImmediateFeedEnabled) {
      void fetchHomeImmediateBookings(true);
    }

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [driverImmediateFeedEnabled, fetchHomeImmediateBookings, showDriverServicesModal, ENABLE_DRIVER_MAP_RESERVATIONS]);

  const incomingBooking = (homeImmediateBookings && homeImmediateBookings.length > 0
    ? homeImmediateBookings[0]
    : null) as any;

  useEffect(() => {
    if (!ENABLE_DRIVER_MAP_RESERVATIONS || !IsMapVisible || !driverOnline || showNovedades || !driverImmediateFeedEnabled || driverImmediateLoading) {
      setShowIncomingRequest(false);
      return;
    }
    setShowIncomingRequest(Boolean(incomingBooking));
  }, [IsMapVisible, driverImmediateFeedEnabled, driverImmediateLoading, driverOnline, incomingBooking, showNovedades, ENABLE_DRIVER_MAP_RESERVATIONS]);

  const renderImmediateBookingItem = useCallback(({ item, index }: { item: any; index: number }) => {
    const pickupText =
      item?.pickup_address ||
      item?.pickupAddress ||
      item?.pickup?.add ||
      item?.pickup?.address ||
      'Punto de recogida';
    const dropText =
      item?.drop_address ||
      item?.dropAddress ||
      item?.drop?.add ||
      item?.drop?.address ||
      'Destino';
    const fareValue = item?.driver_share ?? item?.price ?? item?.estimate ?? item?.tripPrice ?? item?.estimate_fare;
    const fareText = fareValue !== undefined && fareValue !== null ? `$${fareValue}` : 'Tarifa por confirmar';

    return (
      <View key={item?.id || `immediate-modal-${index}`} style={nS.driverImmediateCard}>
        <View style={nS.driverImmediateTopRow}>
          <Text style={nS.driverImmediateFare} numberOfLines={1}>{fareText}</Text>
          <TouchableOpacity
            style={nS.driverImmediateAcceptBtn}
            onPress={() => {
              setShowDriverServicesModal(false);
              navigation.navigate('DriverReservations' as never);
            }}
          >
            <Text style={nS.driverImmediateAcceptText}>Abrir</Text>
          </TouchableOpacity>
        </View>
        <Text style={nS.driverImmediateRouteText} numberOfLines={1}>Origen: {pickupText}</Text>
        <Text style={nS.driverImmediateRouteText} numberOfLines={1}>Destino: {dropText}</Text>
      </View>
    );
  }, [navigation]);

  const speakDriverGreeting = useCallback(async () => {
    const hour = new Date().getHours();
    const periodGreeting = hour < 12 ? 'Buenos dias' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const readValidatedName = async () => {
      const firstState = String(dbFirstName || profile?.first_name || profile?.firstName || '').trim();
      const lastState = String(dbLastName || profile?.last_name || profile?.lastName || '').trim();
      if (firstState || lastState) {
        return { firstName: firstState, lastName: lastState };
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nameFromDb = await Promise.race([
            resolveDriverName(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
          ]);

          const firstDb = String(nameFromDb?.firstName || '').trim();
          const lastDb = String(nameFromDb?.lastName || '').trim();

          if (firstDb || lastDb) {
            return { firstName: firstDb, lastName: lastDb };
          }
        } catch (_) {}

        await wait(350);
      }

      return null;
    };

    const resolvedName = await readValidatedName();

    let conductorWithName: string;
    if (resolvedName) {
      const first = String(resolvedName.firstName || '').trim();
      const last = String(resolvedName.lastName || '').trim();
      const fullName = (first + ' ' + last).trim();
      console.log('[VOICE] fullName used for speech:', fullName || '(empty)');
      conductorWithName = fullName ? 'conductor ' + fullName : 'conductor';
    } else {
      console.log('[VOICE] Name not found in DB, using fallback "conductor".');
      conductorWithName = 'conductor';
    }
    const message = periodGreeting + ', ' + conductorWithName + '. Recuerda manejar con responsabilidad. Usa el cinturon de seguridad, cuide su vida y la de los demas. T mas Plus, justo para ti, justo para todos.';

    try {
      await Speech.stop();
    } catch (_) {}

    await new Promise((resolve) => setTimeout(resolve, 120));

    try {
      Speech.speak(message, {
        language: 'es-CO',
        pitch: 1,
        rate: 0.92,
        onStart: () => console.log('[VOICE] Speech started (es-CO)'),
        onDone: () => console.log('[VOICE] Speech done (es-CO)'),
        onError: (err) => console.log('[VOICE] Speech error (es-CO):', err),
      });
      console.log('[VOICE] Speech.speak launched (es-CO)');
      return true;
    } catch (_) {
      try {
        Speech.speak(message, {
          pitch: 1,
          rate: 0.92,
          onStart: () => console.log('[VOICE] Speech started (default)'),
          onDone: () => console.log('[VOICE] Speech done (default)'),
          onError: (err) => console.log('[VOICE] Speech error (default):', err),
        });
        console.log('[VOICE] Speech.speak launched (default language)');
        return true;
      } catch (error) {
        console.log('Speech error:', error);
        return false;
      }
    }

  }, [dbFirstName, dbLastName, profile?.first_name, profile?.firstName, profile?.last_name, profile?.lastName, resolveDriverName]);

  const setDriverOnlineStatus = async (newStatus: boolean) => {
    if (goToggleLockRef.current) return;
    if (newStatus === driverOnline) return;
    goToggleLockRef.current = true;

    setDriverOnline(newStatus);
    dispatch(updateUserProfile({ driver_active_status: newStatus }));
    setDriverReservationsMinimized(!newStatus);
    setShowIncomingRequest(false);
    setShowNovedades(false);
    setShowDriverServicesModal(false);
    setIsEnabled(newStatus);

    try {
      if (newStatus) {
        await speakDriverGreeting();
        setIsMapVisible(true);
        const name = dbFirstName || user?.firstName || user?.first_name || '';
        showDriverActiveNotification(name).catch(() => {});
        requestIgnoreBatteryOptimization().catch(() => {});
      } else {
        setIsMapVisible(false);
        dismissDriverNotification().catch(() => {});
      }

      await handleSwipeSuccess(newStatus);
    } finally {
      goToggleLockRef.current = false;
    }
  };

  const activateDriverOnline = () => setDriverOnlineStatus(true);
  const deactivateDriverOnline = () => setDriverOnlineStatus(false);

  const activateDriverOnlineRef = useRef(activateDriverOnline);
  activateDriverOnlineRef.current = activateDriverOnline;
  const deactivateDriverOnlineRef = useRef(deactivateDriverOnline);
  deactivateDriverOnlineRef.current = deactivateDriverOnline;

  useEffect(() => {
    return registerDriverGoHandlers({
      activate: () => activateDriverOnlineRef.current(),
      deactivate: () => deactivateDriverOnlineRef.current(),
    });
  }, []);

  const handleAcceptIncoming = () => {
    if (!incomingBooking) return;
    setShowIncomingRequest(false);
    navigation.navigate('DriverReservations' as never);
  };

  const handleRejectIncoming = () => {
    setShowIncomingRequest(false);
    handleDecline();
  };

  useEffect(() => {
    const unsubscribe = dispatch(listenForNewBookings() as any) as unknown as (() => void) | undefined;
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [dispatch]);

  //-----------------..........................................................................................................................................................................................................


  useEffect(() => {
    const online = Boolean(
      profile?.driver_active_status || user?.driver_active_status || user?.driverActiveStatus
    );
    setDriverOnline(online);
  }, [profile?.driver_active_status, user?.driver_active_status, user?.driverActiveStatus]);

  useEffect(() => {
    if (user?.driverActiveStatus && !currentPosition) {
      dispatch(updateProfile({ driverActiveStatus: true }));
      setIsEnabled(false);
    }
  }, [user?.driverActiveStatus, currentPosition, dispatch]);



  useEffect(() => {
    if (!user) return;
    const userId = user.id || user.auth_id;
    if (!userId) return;

    const channel = supabase
      .channel(`user-profile-${userId}`)
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        (payload: any) => {
          try {
            if (payload.new) dispatch(updateProfile(payload.new));
          } catch (e) {
            console.error('Error procesando cambio de perfil:', e);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [dispatch, user]);

  const takePhoto = async (variable: "profile" | "verifyId") => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      alert("Permiso para acceder a la c�mara es necesario!");
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (variable === "profile") {
      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setModalVisible(false); // Cerrar el modal despu�s de seleccionar una imagen
        const uri = pickerResult.assets[0].uri;
        setUserData({ ...userData, profile_image: uri }); // Actualiza el estado local
        // dispatch(updateProfile(user, uri)); // Llama a updateProfile con un objeto vac�o y la URI
        setModalVisibleImage(false); // Cierra el modal si est� abierto
      }
    } else if (variable === "verifyId") {
      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setModalVisible(false); // Cerrar el modal despu�s de seleccionar una imagen

        const uri = pickerResult.assets[0].uri;
        setUserData({ ...userData, verifyIdImage: uri }); // Actualiza el estado local

        setModalVisibleImageVerify(false);
      }
    }
  };

  const pickImage = async (variable: "profile" | "verifyId") => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [5, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      if (variable === "profile") {
        setUserData({ ...userData, profile_image: uri }); // Actualiza el estado local
        setModalVisibleImage(false); // Cierra el modal si est� abierto
      } else if (variable === "verifyId") {
        setModalVisible(false); // Cerrar el modal despu�s de seleccionar una imagen

        setUserData({ ...userData, verifyIdImage: uri }); // Actualiza el estado local
        setModalVisibleImageVerify(false);
      }
    }
  };
  const handleFinishTour = async () => {
    try {
      if (!user) {
        console.warn("No hay usuario autenticado.");
        return;
      }
      setLoading(true); // Muestra el loader

      // Despachar la acci�n updateProfile con el userData actualizado
      //   dispatch(updateProfile({ ...userData, verifyIdImage: downloadURL }, ""));

      // Cierra el modal si est� abierto
      dispatch(updateProfile({ ...userData }, userData.profile_image || undefined));
      try {
        // Realiza la llamada a la verificaci�n en Topus con axios
        const response = await axios.post(
          "https://us-central1-treasupdate.cloudfunctions.net/getUserVerification",
          {
            doc_type: user.docType || userData.docType,
            identification: user.verifyId || userData.verifyId,
            name:
              user.firstName + " " + user.lastName ||
              userData.firstName + " " + userData.lastName,
            uid: user.uid || user.id,
          },
          {
            timeout: 300000, // 5 minutos de tiempo m�ximo para la solicitud
          }
        );

        const results = response.data;

        // setData(results);
        console.log("results", results);

        // Procesar los resultados para verificar entidades con paso = '2' excepto 'simit'
        let blockedTopus = false;
        let blockedReasonTopus: string[] = [];

        results.forEach((item: any) => {
          if (item.entidad !== "simit" && item.paso === "2") {
            blockedTopus = true;
            blockedReasonTopus.push(item.entidad);
          }
        });

        const filteredData = {
          blockedTopus: blockedTopus,
          blockedReasonTopus: blockedReasonTopus,
          securityData: [
            {
              antecedents: results,
              date: Date.now(),
              verifyId: user.verifyId,
              doc_type: user.docType || userData.docType,
              firstName: user.firstName,
              lastName: user.lastName,
            },
          ],
        };

        await dispatch(updateProfile(filteredData) as any);
        setLoading(false); // Muestra el loader
        setTourVisible(false); // Oculta el tour si es necesario
        console.log("Verificaci�n completada", results);
      } catch (error) {
        console.error("Error en la verificaci�n:", error);
        console.log("error", error);
      }

      // Cierra el modal del tour
      //setModalVisibleImageVerify(false);
    } catch (error) {
      console.error("Error al subir la imagen:", error);
      // Opcional: Puedes mostrar una alerta al usuario informando del error
      alert("Hubo un error al subir la imagen. Por favor, int�ntalo de nuevo.");
    }
    // Despacha la acci�n updateProfile con los datos del usuario
  };
  const navigateToDocuments = (data: any) => {
    setInprocess(data);
    navigation.navigate("ImageGallery", { data:data  });
    setTourVisible(false);
  };
  const renderStepContent = () => {
    return (
      <Animatable.View animation="fadeIn" style={styles.stepContainer}>
        <Animatable.Text
          animation="bounceIn" // Animaci�n m�s llamativa
          duration={700} // Duraci�n m�s lenta para efecto suave
          style={styles.stepMessage}
          iterationCount={1} // Solo una vez al cargar
          easing="ease-in-out" // Efecto m�s fluido
        >
          {stepMessages[currentStep]}
        </Animatable.Text>
        {(() => {
          switch (currentStep) {
            case 0:
              return (
                <>
                  <Text style={styles.stepTitle}>Sube tu foto de perfil</Text>
                  <Text style={styles.explanatoryText}>
                    �Gracias por registrarte en T+Plus!
                  </Text>
                  <Text style={styles.explanatoryText}>
                    Por tu seguridad y la de los usuarios que atender�s, es
                    necesario completar los siguientes campos y datos para poder
                    iniciar a tomar servicios:
                  </Text>

                  <TouchableOpacity
                    onPress={() =>
                      Platform.OS === "android"
                        ? setModalVisibleImage(true)
                        : null
                    }
                  >
                    {userData.profile_image || "" ? (
                      <Image
                        source={{ uri: userData.profile_image || "" }}
                        style={styles.profileImage}
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <AntDesign name="camera" size={50} color="#ccc" />
                        <Text>Subir imagen</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {Platform.OS === "ios" && (
                    <View style={styles.modalContainerIos}>
                      <View style={styles.modalViewIos}>
                        <TouchableOpacity
                          style={styles.botonCamera}
                          onPress={() => takePhoto("profile")}
                        >
                          <Ionicons name="camera" size={24} color="white" />
                          <Text style={styles.modalButtonText}>Tomar Foto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.botonGallery}
                          onPress={() => pickImage("profile")}
                        >
                          <Ionicons name="images" size={24} color="white" />
                          <Text style={styles.modalButtonText}>
                            Cargar desde Dispositivo
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              );
            case 1:
              return (
                <>
                  <Text style={styles.explanatoryText}>
                    Es muy importante que tengamos un n�mero para contactarte y
                    que tus clientes tambi�n lo hagan. Recuerda que deber�s
                    incluir el indicativo:
                    <Text
                      style={{
                        backgroundColor:
                          colorScheme === "dark" ? "#000" : "#D3D3D3",
                        fontStyle: "italic",
                      }}
                    >
                      ejm: +572223334455
                    </Text>
                  </Text>
                  <Text style={styles.stepTitle}>
                    Ingresa tu n�mero de tel�fono
                  </Text>
                  <Input
                    placeholder="Tel�fono"
                    value={userData.mobile}
                    onChangeText={(text) =>
                      setUserData({ ...userData, mobile: text })
                    }
                    keyboardType="phone-pad"
                    leftIcon={{
                      type: "antdesign",
                      name: "phone",
                      color: "#00f4f5",
                    }}
                    inputStyle={styles.input}
                  />
                </>
              );
            case 2:
              return (
                <>
                  <Text style={styles.stepTitle}>
                    Selecciona el tipo de documento
                  </Text>
                  <Text style={styles.explanatoryText}>
                    En este paso nos indicar�s el tipo de documento que te
                    identifica en el pa�s en el cual resides en este momento. Lo
                    hacemos para que hagas parte de este cambio en movilidad y
                    podamos reportar tu documento completo a las aseguradoras
                    que respaldan tu movilidad:
                  </Text>
                  <View style={styles.pickerContainer}>
                    <RNPickerSelect
                      onValueChange={(itemValue) =>
                        setUserData({ ...userData, docType: itemValue })
                      }
                      items={docTypes.map((docName) => ({
                        label: docName,
                        value: docName,
                      }))}
                      placeholder={{
                        label: userData.docType
                          ? userData.docType
                          : "Seleccione un tipo de documento",
                        value: userData.docType ? userData.docType : null,
                        color: "#000",
                      }}
                      style={pickerSelectStyles}
                      useNativeAndroidPickerStyle={false}
                      Icon={() => {
                        return <AntDesign name="down" size={24} color="gray" />;
                      }}
                    />
                  </View>
                </>
              );
            case 3:
              return (
                <TouchableWithoutFeedback
                  onPress={Platform.OS === "ios" ? Keyboard.dismiss : undefined}
                >
                  <View>
                    <Text style={styles.stepTitle}>
                      Ingresa tu n�mero de documento
                    </Text>
                    <Text style={styles.explanatoryText}>
                      Por favor digita tu n�mero de documento. En el caso de
                      pasaporte, escribe las letras y n�meros tal como aparecen
                      en tu documento. Si es c�dula o c�dula de extranjer�a,
                      escribe los n�meros sin puntos ni comas, tal como aparecen
                      en tu documento.
                    </Text>
                    <View style={styles.pickerContainer}></View>
                    <Input
                      placeholder="N�mero de documento"
                      value={userData.verifyId}
                      onChangeText={(text) =>
                        setUserData({ ...userData, verifyId: text })
                      }
                      keyboardType="number-pad"
                      leftIcon={{
                        type: "antdesign",
                        name: "idcard",
                        color: "#00f4f5",
                      }}
                      inputStyle={styles.input}
                    />
                  </View>
                </TouchableWithoutFeedback>
              );
            case 4:
              return (
                <TouchableWithoutFeedback
                  onPress={Platform.OS === "ios" ? Keyboard.dismiss : undefined}
                >
                  <View>
                    <Text style={styles.stepTitle}>
                      Ingresa tu n�mero de DAVIPLATA
                    </Text>
                    <Text style={styles.explanatoryText}>
                      Manteniendo nuestro compromiso, tu trabajo no tendr�
                      descuentos, con nuestro aliado Daviplata tus recargas y
                      los pagos que realizaremos desde T+Plus, se har�n sin
                      descuentos. Si ya cuentas con tu n�mero Daviplata,
                      ingr�salo ahora mismo:
                    </Text>
                    <View style={styles.pickerContainer}></View>
                    <Input
                      placeholder="Daviplata"
                      value={userData.bankAccount}
                      onChangeText={(text) =>
                        setUserData({ ...userData, bankAccount: text })
                      }
                      keyboardType="number-pad"
                      leftIcon={{
                        type: "materialicons",
                        name: "account-balance",
                        color: "#00f4f5",
                      }}
                      inputStyle={styles.input}
                    />
                  </View>
                </TouchableWithoutFeedback>
              );
            case 5:
              return (
                <>
                  <Text style={styles.stepTitle}>
                    Selecciona tu ciudad de residencia
                  </Text>
                  <Text style={styles.explanatoryText}>
                    Es muy importante que nos indiques la ciudad en la que
                    resides, para que los usuarios puedan ubicarte y as� poder
                    ofrecerte servicios en tu ciudad.
                  </Text>
                  <View style={styles.pickerContainer}>
                    <RNPickerSelect
                      onValueChange={(itemValue) =>
                        setUserData({ ...userData, city: itemValue })
                      }
                      items={cities.map((cityName) => ({
                        label: cityName,
                        value: cityName,
                      }))}
                      placeholder={{
                        label: userData.city
                          ? userData.city
                          : "Seleccione una ciudad",
                        value: userData.city ? userData.city : null,
                        color: "#000",
                      }}
                      style={pickerSelectStyles}
                      useNativeAndroidPickerStyle={false}
                      Icon={() => {
                        return <AntDesign name="down" size={24} color="gray" />;
                      }}
                    />
                  </View>
                </>
              );
            case 6:
              return (
                <>
                  <Text style={styles.stepTitle}>Direcci�n de residencia</Text>
                  <Text style={styles.explanatoryText}>
                    Por requerimiento de facturaci�n electr�nica y
                    verificaci�n de seguridad, es muy importante que nos
                    indiques tu actual direcci�n de residencia:
                  </Text>
                  <View style={styles.pickerContainer}></View>
                  <Input
                    placeholder="Calle 123, Ciudad"
                    value={userData.addres}
                    onChangeText={(text) =>
                      setUserData({ ...userData, addres: text })
                    }
                    //keyboardType="number-pad"
                    leftIcon={{
                      type: "materialicons",
                      name: "location-on",
                      color: "#00f4f5",
                    }}
                    inputStyle={styles.input}
                  />
                </>
              );
            case 7:
              return (
                <>
                  <Text style={styles.stepTitle}>Sube tus documentos</Text>
                  <Text style={styles.explanatoryText}>
                    Documentos faltantes:
                  </Text>
                  {!user.verifyIdImage ||
                    !user.verifyIdImageBk ||
                    !user.SOATImage ||
                    !user.licenseImage ||
                    !user.licenseImageBack ||
                    !user.cardPropImage ||
                    !user.cardPropImageBK ? (
                    <View>
                      {!user.verifyIdImage && (
                        <Text style={styles.summaryText}>
                          Documento de identidad
                        </Text>
                      )}
                      {!user.verifyIdImageBk && (
                        <Text style={styles.summaryText}>
                          Documento de identidad posterior
                        </Text>
                      )}
                      {!user.SOATImage && (
                        <Text style={styles.summaryText}>Imagen del SOAT</Text>
                      )}
                      {!user.verifyIdImageBk && (
                        <Text style={styles.summaryText}>Imagen del coche</Text>
                      )}
                      {!user.licenseImage && (
                        <Text style={styles.summaryText}>
                          Licencia de conducir
                        </Text>
                      )}
                      {!user.licenseImageBack && (
                        <Text style={styles.summaryText}>
                          Licencia de conducir trasera
                        </Text>
                      )}
                      {!user.cardPropImage && (
                        <Text style={styles.summaryText}>
                          Tarjeta de propiedad
                        </Text>
                      )}
                      {!user.cardPropImageBK && (
                        <Text style={styles.summaryText}>
                          Tarjeta de propiedad trasera
                        </Text>
                      )}
                      <Button
                        title={
                          loading ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            "Ir A Documentos"
                          )
                        }
                        buttonStyle={styles.finishButton}
                        onPress={() => navigateToDocuments("Process")}
                        disabled={
                          !!user.verifyIdImage &&
                          !!user.verifyIdImageBk &&
                          !!user.SOATImage &&
                          !!user.licenseImage &&
                          !!user.licenseImageBack &&
                          !!user.cardPropImage &&
                          !!user.cardPropImageBK
                        }
                      />
                    </View>
                  ) : (
                    <Text style={styles.summaryText}>
                      Todos tus documentos est�n al d�a Puedes continuar.
                    </Text>
                  )}
                </>
              );
            case 8:
              return (
                <>
                  <Text style={styles.stepTitle}>Resumen</Text>
                  <Text style={styles.explanatoryText}>
                    Por favor verifica que la informaci�n registrada corresponda
                    y sea conforme a la realidad, ya que con ella haremos una
                    verificaci�n en l�nea, para garantizar la seguridad de los
                    usuarios como la de nuestros conductores, si quieres
                    revisarlas ingresa al siguiente link:
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(
                        "https://tmasplus.com/politica-de-privacidad"
                      )
                    }
                  >
                    <Text style={styles.linkButton}>
                      https://tmasplus.com/politica-de-privacidad
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.summaryText}>
                    Tel�fono: {userData.mobile}
                  </Text>
                  <Text style={styles.summaryText}>
                    Tipo de Documento: {userData.docType}
                  </Text>
                  <Text style={styles.summaryText}>
                    N� Documento: {userData.verifyId}
                  </Text>
                  <Text style={styles.summaryText}>
                    Daviplata: {userData.bankAccount}
                  </Text>
                  <Text style={styles.summaryText}>
                    Ciudad: {userData.city}
                  </Text>

                  {userData.verifyIdImage && (
                    <Image
                      source={{ uri: userData.verifyIdImage }}
                      style={styles.profileImage}
                    />
                  )}
                  <Button
                    title={
                      loading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        "Finalizar"
                      )
                    }
                    buttonStyle={styles.finishButton}
                    onPress={handleFinishTour}
                    disabled={
                      !userData.mobile ||
                      !userData.docType ||
                      !userData.verifyId ||
                      !userData.bankAccount ||
                      !userData.city
                    }
                  />
                </>
              );
            default:
              return null;
          }
        })()}
      </Animatable.View>
    );
  };
  const pickerSelectStyles = StyleSheet.create({
    inputIOS: {
      fontSize: 16,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: "#a1a3a6",
      borderRadius: 4,
      color: "black",
      paddingRight: 30, // Para asegurar que el texto no se superponga al icono
    },
    inputAndroid: {
      fontSize: 16,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "#a1a3a6",
      borderRadius: 8,
      color: "black",
      paddingRight: 30, // Para asegurar que el texto no se superponga al icono
    },
  });

  // En bookings.driver se guarda users.id (UUID interno), que en Redux corresponde
  // a profile.id. user.id puede ser el auth_id de Supabase y no coincidir.
  const driverIdForBalance = profile?.id ?? user?.id;

  // Replica el cálculo del Historial (DriverActivityScreen): fetch REST con
  // getSupabaseAuthHeaders, status=COMPLETE, filtrado por día en cliente
  // sobre `booking_date`, sumando driver_share (con fallback a estimate/price).
  const fetchBalanceBookings = async () => {
    try {
      const headers = await getSupabaseAuthHeaders();
      const url =
        `${SUPABASE_URL}/rest/v1/bookings` +
        `?status=eq.COMPLETE` +
        `&order=created_at.desc&limit=200`;
      console.log('[HOY] driverIdForBalance:', driverIdForBalance, '| profile.id:', profile?.id, '| user.id:', user?.id, '| user.auth_id:', user?.auth_id);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn('[HOY] fetch failed:', res.status, await res.text());
        return;
      }
      const data: any[] = await res.json();
      console.log('[HOY] total COMPLETE bookings:', data.length);
      const now = new Date();
      const isSameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

      const todayRows = data.filter(b => {
        const ts = b.booking_date ? new Date(b.booking_date) : null;
        return !!ts && !isNaN(ts.getTime()) && isSameDay(ts, now);
      });
      const total = todayRows.reduce((sum, b) => {
        const amount = parseFloat(b.driver_share ?? b.estimate ?? b.price ?? 0);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      setBalance(Math.round(total * 100) / 100);
    } catch (error) {
      console.error('Error al obtener las ganancias:', error);
    }
  };

  useEffect(() => {
    if (!driverIdForBalance) return;
    fetchBalanceBookings();
  }, [driverIdForBalance]);

  useEffect(() => {
    if (!driverIdForBalance) return;
    const channelName = `balance-realtime-${driverIdForBalance}`;
    try {
      const existing = (supabase.getChannels?.() ?? []).filter(
        (c: any) => c.topic === `realtime:${channelName}`
      );
      existing.forEach((c: any) => supabase.removeChannel(c));
    } catch {}
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'bookings', filter: `driver=eq.${driverIdForBalance}` },
        () => { fetchBalanceBookings(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driverIdForBalance]);

  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const timeout = setTimeout(() => {
      setBalance(0);
      fetchBalanceBookings();
    }, msUntilMidnight);
    return () => clearTimeout(timeout);
  }, [user?.id]);
  //-----------------..........................................................................................................................................................................................................

  const [balance, setBalance] = useState(0);


  useEffect(() => {
    const fetchActiveBookings = async () => {
      try {
        const statuses = ['ACCEPTED', 'REACHED', 'NEW', 'STARTED', 'ARRIVED'];
        const { data, error } = await supabase
          .from('bookings')
          .select('id, booking_date, created_at')
          .eq('driver', user.id)
          .in('status', statuses);
        if (error) throw error;
        const currentTime = Date.now();
        let closestBooking = null;
        let closestDiff = Number.MAX_SAFE_INTEGER;
        (data || []).forEach((booking: any) => {
          const t = new Date(booking.booking_date || booking.created_at).getTime();
          const diff = Math.abs(t - currentTime);
          if (diff < closestDiff) { closestDiff = diff; closestBooking = booking; }
        });
        setActiveBookingsCount((data || []).length);
        setClosestBooking(closestBooking);
      } catch (error) {
        console.error('Error al obtener las reservas activas:', error);
      }
    };
    fetchActiveBookings();
    fetchBalanceBookings();
  }, []);

  // Ref para controlar el Bottom Sheet
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Definir los snap points (porcentajes de la pantalla)
  const snapPoints = useMemo(() => ["17%", "50%", "75%", "95%"], ["100%"]);

  // Funci�n para abrir el Bottom Sheet
  const openBottomSheet = () => {
    bottomSheetRef.current?.expand();
  };

  const sos = () => {
    showAlert('confirm', 'SOS', '�Desea llamar a emergencia?', [
      { text: 'Cancelar', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Llamar',
        onPress: () => {
          setAlertVisible(false);
          const call_link =
            Platform.OS === 'android'
              ? `tel:${settings.panic}`
              : `telprompt:${settings.panic}`;
          Linking.openURL(call_link);
        },
      },
    ]);
  };

  const sugerencias = [
    {
      id: "1",
      nombre: "Carnet",
      icono: require("@/assets/images/iconos3d/43.png"),
      route: "Carnet",
    },
    {
      id: "2",
      nombre: "SOS",
      icono: require("@/assets/images/iconos3d/42.png"),
      route: "SOS",
    },
    {
      id: "3",
      nombre: "Veh�culo",
      icono: require("@/assets/images/iconos3d/12.png"),
      route: "CarsScreen",
    },
    {
      id: "4",
      nombre: "Soporte",
      icono: require("@/assets/images/iconos3d/46.png"),
      route: "Soporte",
    },
    {
      id: "5",
      nombre: "Reservas",
      icono: require("@/assets/images/iconos3d/11.png"),
      route: "DriverReservations",
    },
  ];

  const promociones = [
    {
      id: "1",
      titulo: "Reservas Activas",
      descripcion:
        activeBookingsCount === 0
          ? "No tienes Reservas por el momento"
          : `�Tienes ${activeBookingsCount} ${
              activeBookingsCount === 1 ? "reserva activa" : "reservas activas"
            }!  `,
      image: require("@/assets/images/iconos3d/11.png"),
      route: "RideList",
    },
    {
      id: "2",
      titulo: "Kilometros",
      descripcion: `�Tienes ${user?.kilometers} kilometros! `,
      image: require("@/assets/images/iconos3d/16.png"),
      route: "Wallet",
    },
    {
      id: "3",
      titulo: "Ganancias",
      descripcion: `Has ganado $${balance.toLocaleString()} pesos! `,
      image: require("@/assets/images/iconos3d/33.png"),
      route: "Wallet",
    },
    {
      id: "5",
      titulo: "Membresia",
      descripcion: activeMembership
        ? `Tu membres�a caduca el ${activeMembership.fecha_terminada}`
        : "No tienes membres�a",
      image: require("@/assets/images/iconos3d/8.png"),
      route: "Memberships",
    },
  ];

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

  const HorizontalImageBanner = () => {
    const banners = [
      {
        image: require("@/assets/images/Combuscol.png"),
        url: "https://tmasplus.com/beneficios",
      },
      {
        image: require("@/assets/images/Fitvision.png"),
        url: "https://tmasplus.com/beneficios",
      },

    ];

    const handlePress = (url: string) => {
      Linking.openURL(url);
    };

    return (
      <View style={styles.containerHorizontal}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {banners.map((banner, index) => (
            <Animatable.View
              key={`${banner.url}-${index}`}
              animation="fadeInRight"
              duration={500}
              delay={index * 90}
              useNativeDriver
            >
              <TouchableOpacity
                onPress={() => handlePress(banner.url)}
              >
                <Image source={banner.image} style={styles.bannerImage} />
              </TouchableOpacity>
            </Animatable.View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const driverOfflinePanelHeight = 168;
  // Altura extra del banner de viaje activo (GO desconectado) para no tapar controles del mapa
  const offlineActiveBannerExtra = useMemo(() => {
    if (driverOnline || !hasActiveTrip) return 0;
    const count = Math.min(activeTripBookings.length, 4);
    return count * 118;
  }, [driverOnline, hasActiveTrip, activeTripBookings.length]);

  const driverServicesPanelHeight = useMemo(() => {
    if (!isDriverView || showNovedades) return 0;
    if (driverOnline) {
      return driverReservationsMinimized ? 108 : driverReservationsExpandedHeight;
    }
    return driverOfflinePanelHeight + offlineActiveBannerExtra;
  }, [
    isDriverView,
    showNovedades,
    driverOnline,
    driverReservationsMinimized,
    driverReservationsExpandedHeight,
    offlineActiveBannerExtra,
  ]);

  const mapBottomPadding = isDriverView
    ? driverNavBottomPad - 12 + driverServicesPanelHeight
    : 0;
  // Empuja un poco más los controles laterales por encima del stack offline
  const mapControlsBottom = mapBottomPadding + 16 + (offlineActiveBannerExtra > 0 ? 8 : 0);

  return (
    <View style={styles.container}>

      {(IsMapVisible || isDriverView) ? (
        <View style={isDriverView ? nS.driverSplitRoot : nS.mapStage}>
          <View style={isDriverView ? nS.driverMapHalf : nS.mapStage}>
            <MapSensor
              ref={mapSensorRef}
              currentPosition={currentPosition}
              viewMode={mapViewMode}
              mapTheme={mapTheme}
              mapBottomPadding={mapBottomPadding}
              onMapBearingChange={setMapBearing}
            />
            <View pointerEvents="box-none" style={nS.driverOverlay}>
            {isDriverView && (
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(5,26,38,0.78)', 'rgba(5,26,38,0.38)', 'transparent']}
                locations={[0, 0.42, 1]}
                style={nS.driverTopGradient}
              />
            )}
            {isDriverView && (
              <View pointerEvents="box-none" style={[nS.driverMapZoomControls, { bottom: mapControlsBottom }]}>
                <TouchableOpacity
                  style={nS.driverMapCtrlBtn}
                  activeOpacity={0.85}
                  onPress={() => mapSensorRef.current?.zoomIn()}
                >
                  <Ionicons name="add" size={22} color="#00E5FF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={nS.driverMapCtrlBtn}
                  activeOpacity={0.85}
                  onPress={() => mapSensorRef.current?.zoomOut()}
                >
                  <Ionicons name="remove" size={22} color="#00E5FF" />
                </TouchableOpacity>
              </View>
            )}
            {isDriverView && (
              <View pointerEvents="box-none" style={[nS.driverMapControls, { bottom: mapControlsBottom }]}>
                <TouchableOpacity
                  style={nS.driverMapCtrlBtn}
                  activeOpacity={0.85}
                  onPress={() => setMapTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
                >
                  <Ionicons
                    name={mapTheme === 'dark' ? 'moon' : 'sunny'}
                    size={20}
                    color="#00E5FF"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={nS.driverMapCtrlBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    const next: MapViewMode = mapViewMode === '3D' ? '2D' : '3D';
                    setMapViewMode(next);
                    mapSensorRef.current?.setViewMode(next);
                  }}
                >
                  <Text style={nS.driverMapCtrlTxt}>{mapViewMode}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={nS.driverMapCtrlBtn}
                  activeOpacity={0.85}
                  onPress={() => mapSensorRef.current?.resetMapNorth()}
                >
                  <MapCompassIcon heading={mapBearing} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={nS.driverMapCtrlBtn}
                  activeOpacity={0.85}
                  onPress={() => mapSensorRef.current?.locateUser()}
                >
                  <Ionicons name="locate" size={20} color="#00E5FF" />
                </TouchableOpacity>
              </View>
            )}
            <View style={nS.driverTopBar}>
              <View style={nS.driverEarningsPill}>
                <Text style={nS.driverEarningsLabel}>Hoy</Text>
                <Text style={nS.driverEarningsAmount}>$ {Number(balance || 0).toLocaleString('es-CO')}</Text>
              </View>

              <TouchableOpacity
                style={nS.driverNotifBtn}
                onPress={onDriverBellPress}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Animated.View
                  style={{
                    transform: [
                      { rotate: driverBellRot },
                      { translateY: driverBellY },
                    ],
                  }}
                >
                  <Ionicons name="notifications" size={28} color="#00E5FF" />
                </Animated.View>
                {(driverHasUnreadNotif || !!driverActiveBookingId) && (
                  <View style={nS.driverNotifDot}>
                    <View style={nS.driverNotifDotInner} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Avatar de perfil en top bar — ya no necesario (Perfil está en el navbar) */}
              {/* <View style={nS.driverMiniAvatarRing}>
                {user?.profile_image ? (
                  <Image source={{ uri: user.profile_image }} style={nS.driverMiniAvatarImg} />
                ) : (
                  <Ionicons name="person" size={18} color="#00E5FF" />
                )}
              </View> */}
            </View>

            {ENABLE_DRIVER_MAP_RESERVATIONS && showIncomingRequest && incomingBooking && (
              <View style={nS.incomingRequestCard}>
                <View style={nS.incomingHeader}>
                  <Text style={nS.incomingType}>T+Plus Servicio</Text>
                  <Text style={nS.incomingEta}>Nuevo</Text>
                </View>
                <Text style={nS.incomingPrice}>
                  ${Number(incomingBooking?.trip_cost || 0).toLocaleString('es-CO')}
                </Text>
                <Text style={nS.incomingRouteText} numberOfLines={1}>
                  {incomingBooking?.pickupAddress || incomingBooking?.pickup?.add || 'Origen no disponible'}
                </Text>
                <Text style={nS.incomingRouteText} numberOfLines={1}>
                  {incomingBooking?.dropAddress || incomingBooking?.drop?.add || 'Destino no disponible'}
                </Text>
                <View style={nS.incomingActions}>
                  <TouchableOpacity style={nS.rejectBtn} onPress={handleRejectIncoming}>
                    <Text style={nS.rejectBtnText}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={nS.acceptBtn} onPress={handleAcceptIncoming}>
                    <Text style={nS.acceptBtnText}>Aceptar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {showNovedades && (
              <View style={nS.driverNovedadesCard}>
                <View style={nS.driverNovedadesHeader}>
                  <Text style={nS.driverNovedadesTitle}>Novedades</Text>
                  <TouchableOpacity onPress={() => setShowNovedades(false)}>
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                </View>
                <Text style={nS.driverNovedadesText}>
                  En camino al punto de recogida. Sigue la ruta indicada en el mapa.
                </Text>
              </View>
            )}

            {!showNovedades && !driverOnline && (
              <View style={[nS.driverOfflineStack, { bottom: driverNavBottomPad - 12 }]}>
                <ActiveTripBannerStack
                  stackNavigation={navigation}
                  maxItems={4}
                  tripFilter="all"
                />
                <View style={nS.driverMiniPanel}>
                  <Text {...FIXED_TEXT_PROPS} numberOfLines={1} style={nS.driverMiniPanelTitle}>Conductor desconectado</Text>
                  <Text {...FIXED_TEXT_PROPS} numberOfLines={2} style={nS.driverMiniPanelSub}>Activa GO para iniciar</Text>

                  <TouchableOpacity
                    style={nS.driverReservasBtn}
                    activeOpacity={0.82}
                    onPress={() =>
                      navigation.navigate('DriverReservations' as never, { initialTab: 'reservations' } as never)
                    }
                  >
                    <View style={nS.driverReservasBtnIcon}>
                      <Ionicons name="calendar-outline" size={22} color="#051A26" />
                    </View>
                    <View style={nS.driverReservasBtnTextWrap}>
                      <Text style={nS.driverReservasBtnTitle}>Reservas Disponibles</Text>
                      <Text style={nS.driverReservasBtnSub}>Ver y aceptar reservas de clientes</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="rgba(0,229,255,0.7)" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Modal
              visible={showDriverServicesModal}
              transparent
              animationType="slide"
              onRequestClose={() => setShowDriverServicesModal(false)}
            >
              {ENABLE_DRIVER_MAP_RESERVATIONS ? (
              <View style={nS.driverServicesModalOverlay}>
                <View style={nS.driverServicesModalPanel}>
                  <View style={nS.driverServicesModalHeader}>
                    <Text style={nS.driverServicesModalTitle}>Servicios inmediatos</Text>
                    <TouchableOpacity onPress={() => setShowDriverServicesModal(false)} style={nS.driverServicesModalCloseBtn}>
                      <Ionicons name="close" size={20} color="#FFF" />
                    </TouchableOpacity>
                  </View>

                  {!driverImmediateFeedEnabled || driverImmediateLoading || !driverServicesListReady ? (
                    <View style={nS.driverServicesLoadingWrap}>
                      <ActivityIndicator size="small" color="#00E5FF" />
                      <Text style={nS.driverServicesLoadingText}>Cargando servicios inmediatos...</Text>
                    </View>
                  ) : immediateBookings.length === 0 ? (
                    <Text style={nS.driverImmediateEmpty}>Aun no hay servicios inmediatos en tu zona.</Text>
                  ) : (
                    <FlatList
                      data={immediateBookings}
                      keyExtractor={(item: any, index) => String(item?.id || `immediate-modal-${index}`)}
                      renderItem={renderImmediateBookingItem}
                      style={nS.driverServicesModalList}
                      contentContainerStyle={nS.driverServicesModalListContent}
                      showsVerticalScrollIndicator={false}
                      initialNumToRender={6}
                      maxToRenderPerBatch={6}
                      windowSize={5}
                      removeClippedSubviews={Platform.OS === 'android'}
                    />
                  )}
                </View>
              </View>
              ) : null}
            </Modal>
            </View>
          </View>

          {isDriverView && driverOnline && !showNovedades && (
            <View
              style={[
                nS.driverReservationsHalf,
                { bottom: driverNavBottomPad - 12, height: driverReservationsExpandedHeight },
                driverReservationsMinimized && nS.driverReservationsHalfMinimized,
              ]}
            >
              <View style={nS.driverReservationsHeaderRow}>
                <View style={nS.driverReservationsHandle} />
                {driverReservationsMinimized ? (
                  <View style={nS.driverCollapsedRow}>
                    <SearchingServicesLabel style={nS.driverSearchingText} />
                    <TouchableOpacity
                      style={nS.driverReservationsToggleBtn}
                      activeOpacity={0.85}
                      onPress={() => setDriverReservationsMinimized(false)}
                    >
                      <Ionicons name="chevron-up" size={17} color="#00E5FF" />
                      <Text style={nS.driverReservationsToggleText}>Maximizar servicios</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={nS.driverReservationsToggleBtn}
                    activeOpacity={0.85}
                    onPress={() => setDriverReservationsMinimized(true)}
                  >
                    <Ionicons name="chevron-down" size={17} color="#00E5FF" />
                    <Text style={nS.driverReservationsToggleText}>Minimizar servicios</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!driverReservationsMinimized && (
                <View style={nS.driverReservationsBody}>
                  <Text {...FIXED_TEXT_PROPS} numberOfLines={2} style={nS.driverConnectedSub}>Conectado y esperando solicitudes</Text>
                  <DriverReservationsScreen embedded initialTab="immediate" />
                </View>
              )}
            </View>
          )}
          </View>
      ) : (
        <View style={nS.wrap}>
          <View pointerEvents="none" style={nS.orbTop} />
          <View pointerEvents="none" style={nS.orbBottomLeft} />
          <ScrollView
            style={nS.scroll}
            contentContainerStyle={nS.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* --- HEADER --- */}
            <View style={nS.header}>
              <View style={nS.avatarRing}>
                {user?.profile_image ? (
                  <Image source={{ uri: user.profile_image }} style={nS.avatarImg} />
                ) : (
                  <View style={nS.avatarFallback}>
                    <Text style={nS.avatarInitial}>
                      {(dbFirstName || user?.first_name || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={nS.headerMid}>
                <Text style={nS.greetText}>
                  {new Date().getHours() < 12 ? 'Buenos d�as' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'}
                </Text>
                <Text style={nS.nameText}>{dbFirstName || user?.first_name || 'Usuario'}</Text>
              </View>
              <TouchableOpacity style={nS.mapBtn} onPress={() => setIsMapVisible(true)}>
                <Ionicons name="map-outline" size={22} color="#00E5FF" />
              </TouchableOpacity>
            </View>

            {/* --- DESTINATION CARD --- */}
            <TouchableOpacity
              style={nS.destCard}
              onPress={() => navigation.navigate('TripPreviewScreen' as never)}
              activeOpacity={0.82}
            >
              {/* Animated glow ring */}
              <Animated.View
                style={[
                  nS.destGlowRing,
                  {
                    opacity: destGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
                    transform: [{ scale: destGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.03] }) }],
                  },
                ]}
              />
              <View style={nS.destCardInner}>
                <Animated.View
                  style={[
                    nS.destIconWrap,
                    {
                      shadowOpacity: destGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
                    },
                  ]}
                >
                  <Ionicons name="navigate" size={22} color="#00E5FF" />
                </Animated.View>
                <View style={nS.destTextWrap}>
                  <Text style={nS.destLabel}>�A d�nde vamos?</Text>
                  <Text style={nS.destSub}>Toca para buscar tu destino</Text>
                </View>
                <View style={nS.destArrowWrap}>
                  <Ionicons name="chevron-forward" size={20} color="#00E5FF" />
                </View>
              </View>
            </TouchableOpacity>

            {/* --- SERVICIOS --- */}
            <View style={nS.sectionRow}>
              <Text style={nS.sectionTitle}>Servicios</Text>
            </View>
            <View style={nS.servicesGrid}>
              {([
                { id: 'particular', label: 'T+Plus Particular', icon: require('@/assets/images/iconos3d/12.png') },
                { id: 'van', label: 'T+Plus Van', icon: require('@/assets/images/iconos3d/33.png') },
                { id: 'taxi', label: 'T+Plus Taxi', icon: require('@/assets/images/iconos3d/11.png') },
                { id: 'especial', label: 'T+Plus Especial', icon: require('@/assets/images/iconos3d/8.png') },
              ] as const).map((svc) => (
                <TouchableOpacity
                  key={svc.id}
                  style={nS.serviceCard}
                  onPress={() => navigation.navigate('TripPreviewScreen' as never)}
                  activeOpacity={0.8}
                >
                  <Image source={svc.icon} style={nS.serviceIcon} />
                  <Text style={nS.serviceLabel}>{svc.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* --- T+PLUS CARDS --- */}
            {DailySavings()}

            {/* --- PROMO BANNER --- */}
            <View style={nS.promoBanner}>
              <View style={nS.promoTextWrap}>
                <Text style={nS.promoTitle}>Justo para ti...</Text>
                <Text style={nS.promoSub}>�Justo para todos!</Text>
                <Text style={nS.promoDesc}>Descubre los beneficios exclusivos de T+Plus para ti y tu familia.</Text>
              </View>
              <TouchableOpacity
                style={nS.promoCta}
                onPress={() => Linking.openURL('https://tmasplus.com/beneficios')}
              >
                <Text style={nS.promoCtaText}>Ver m�s</Text>
              </TouchableOpacity>
            </View>

            {/* --- BENEFICIOS --- */}
            <View style={nS.sectionRow}>
              <Text style={nS.sectionTitle}>Beneficios</Text>
            </View>
            <View style={nS.beneficiosGrid}>
              {([
                { id: 'seguridad', label: 'Seguridad', icon: '???', desc: 'Viaja con conductores verificados' },
                { id: 'tarifas', label: 'Tarifas justas', icon: '??', desc: 'Sin cobros sorpresa' },
                { id: 'rapidez', label: 'Rapidez', icon: '?', desc: 'Llegamos en minutos' },
                { id: 'confort', label: 'Confort', icon: '?', desc: 'Comodidad garantizada' },
              ] as const).map((b) => (
                <View key={b.id} style={nS.beneficioCard}>
                  <Text style={nS.beneficioIcon}>{b.icon}</Text>
                  <Text style={nS.beneficioLabel}>{b.label}</Text>
                  <Text style={nS.beneficioDesc}>{b.desc}</Text>
                </View>
              ))}
            </View>

            {/* --- ALIADOS --- */}
            <View style={nS.sectionRow}>
              <Text style={nS.sectionTitle}>Aliados</Text>
            </View>
            <HorizontalImageBanner />

            <View style={{ height: 100 }} />
          </ScrollView>
        </View>

      )}


      {/* Modal de Tour */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={tourVisible}
        onRequestClose={() => setTourVisible(!tourVisible)}
      >
        <TouchableWithoutFeedback
          onPress={Platform.OS === "ios" ? Keyboard.dismiss : undefined}
        >
          <ScrollView contentContainerStyle={styles.tourContainer}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Image source={tourImage} style={styles.tourImage} />
              {loading ? (
                <Text style={[styles.tourText, { flexShrink: 1 }]}>
                  {loadingMessage}
                </Text>
              ) : currentStep === 5 ? (
                <Text style={[styles.tourText, { flexShrink: 1 }]}>
                  �Felicidades! Est�s a un paso de completar tu registro en
                  T+Plus.
                </Text>
              ) : (
                <Text style={[styles.tourText, { flexShrink: 1 }]}>
                  Hola, bienvenido a T+Plus, aseg�rate de completar los
                  siguientes campos y podr�s empezar a tomar servicios.
                </Text>
              )}
            </View>

            {renderStepContent()}

            {/* Botones de navegaci�n */}
            <View style={styles.navigationButtons}>
              {currentStep > 0 && (
                <TouchableOpacity
                  style={styles.prevButton}
                  onPress={() => setCurrentStep(currentStep - 1)}
                >
                  <Text style={styles.prevButtonText}>Anterior</Text>
                </TouchableOpacity>
              )}
              {currentStep < totalSteps - 1 && (
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={() => setCurrentStep(currentStep + 1)}
                >
                  <Text style={styles.nextButtonText}>Siguiente</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal
        transparent={true}
        animationType="slide"
        visible={modalVisibleImage}
        onRequestClose={() => setModalVisibleImage(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <Text style={styles.modalText}>Selecciona una opci�n</Text>
            <TouchableOpacity
              style={styles.botonCamera}
              onPress={() => takePhoto("profile")}
            >
              <Ionicons name="camera" size={24} color="white" />
              <Text style={styles.modalButtonText}>Tomar Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.botonGallery}
              onPress={() => pickImage("profile")}
            >
              <Ionicons name="images" size={24} color="white" />
              <Text style={styles.modalButtonText}>
                Cargar desde Dispositivo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisibleImage(false)}
            >
              <MaterialIcons name="cancel" size={24} color="#00f4f5" />
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        transparent={true}
        animationType="slide"
        visible={modalVisibleImageVerify}
        onRequestClose={() => setModalVisibleImageVerify(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <Text style={styles.modalText}>Selecciona una opci�n</Text>
            <TouchableOpacity
              style={styles.botonCamera}
              onPress={() => takePhoto("verifyId")}
            >
              <Ionicons name="camera" size={24} color="white" />
              <Text style={styles.modalButtonText}>Tomar Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.botonGallery}
              onPress={() => pickImage("verifyId")}
            >
              <Ionicons name="images" size={24} color="white" />
              <Text style={styles.modalButtonText}>
                Cargar desde Dispositivo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisibleImageVerify(false)}
            >
              <MaterialIcons name="cancel" size={24} color="#00f4f5" />
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {!activeMembership &&
        settings.Membership &&
        user?.carType !== "TREAS-X" && user.profile_image && user.mobile && user.docType && user.verifyId && user.bankAccount && user.city && user.addres&& user.emailVerified && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              �No tienes una membres�a activa!
            </Text>
            <Text style={styles.bannerSubText}>
              Obt�n una membres�a para disfrutar de beneficios exclusivos.
            </Text>
            <TouchableOpacity
              style={styles.createMembershipButton}
              onPress={() =>
                navigation.navigate("ChosePlan", { mode: "membership" })
              }
            >
              <Text style={styles.createMembershipButtonText}>
                Obtener Membres�a
              </Text>
            </TouchableOpacity>
          </View>
        )}

      {settings.membership_TreasX &&
        !activeMembership &&
        user?.carType === "TREAS-X" && user.profile_image && user.mobile && user.docType && user.verifyId && user.bankAccount && user.city && user.addres&& user.emailVerified && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              �No tienes una membres�a activa!
            </Text>
            <Text style={styles.bannerSubText}>
              Obt�n una membres�a para disfrutar de beneficios exclusivos.
            </Text>
            <TouchableOpacity
              style={styles.createMembershipButton}
              onPress={() =>
                navigation.navigate("ChosePlan", { mode: "membership" })
              }
            >
              <Text style={styles.createMembershipButtonText}>
                Obtener Membres�a
              </Text>
            </TouchableOpacity>
          </View>
        )}

      {showRenewBanner && settings.Membership && (
        <View style={styles.renewBanner}>
          <Image
            source={require("@/assets/images/iconos3d/4.png")}
            style={{ height: 70, width: 100, margin: 20 }}
          />
          <Text style={styles.renewBannerText}>
            Tu membres�a est� a punto de expirar. �Renueva ahora para seguir
            disfrutando de los beneficios!
          </Text>
          <View style={styles.renewBannerButtons}>
            <TouchableOpacity
              style={styles.renewButton}
              onPress={() =>
                navigation.navigate("ChosePlan", { mode: "membership" })
              }
            >
              <Text style={styles.renewButtonText}>Renovar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowRenewBanner(false)}
            >
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showKmBanner &&
        settings.KilimetrsWallet &&
        user?.carType === "TREAS-X" && (
          <View style={styles.renewBanner}>
            <Image
              source={require("@/assets/images/iconos3d/5.png")}
              style={{ height: 80, width: 100, margin: 20 }}
            />
            <Text style={styles.kmBannerText}>
              �Te quedan menos de 10 km!{"\n"}
              Recarga ahora para seguir disfrutando de los viajes.
            </Text>
            <View style={styles.kmBannerButtons}>
              <TouchableOpacity
                style={styles.rechargeButton}
                onPress={() =>
                  navigation.navigate("ChosePlan", { mode: "kms" })
                }
              >
                <Text style={styles.createMembershipButtonText}>
                  Recargar Kil�metros
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowKmBanner(false)}
              >
                <Text style={styles.createMembershipButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      {bookingModalDecline && (
        <BookingsView
          bookings={filteredBookings}
          onAccept={handleAccept}
          onDecline={handleDecline} // Bot�n de "ignorar" cerrar� el modal
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

      {isDriverView ? (
        <DriverNotificationsModal
          visible={driverNotifModalVisible}
          onClose={() => setDriverNotifModalVisible(false)}
          onOpenBookingDetail={(booking) => {
            setDriverNotifModalVisible(false);
            const type = String(booking?.booking_type || '').toLowerCase();
            const tab = type.includes('reserv') ? 'reservations' : 'immediate';
            try {
              navigation.navigate(
                'DriverReservations' as never,
                { initialTab: tab, highlightBookingId: booking?.id } as never,
              );
            } catch (e) {
              console.warn('[DriverNotificationsModal] navigate failed', e);
            }
          }}
        />
      ) : null}

  
    </View>
  );
};

const lightStyles = StyleSheet.create({
  bottomSheetWrap: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  glassOrbTop: {
    position: "absolute",
    top: -90,
    right: -40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(0, 244, 245, 0.16)",
    zIndex: 0,
  },
  glassOrbBottom: {
    position: "absolute",
    bottom: 20,
    left: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(0, 32, 74, 0.10)",
    zIndex: 0,
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  infoContainer: {
    position: "absolute",
    top: 20,
    right: 10,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    padding: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  infoText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  bookNow: {
    position: "absolute",
    bottom: 20,
    left: (width - 90) / 2,
    width: 240,
    height: 55,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 23,
    padding: 20,
    shadowColor: "gray",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  banner: {
    padding: 20,
    backgroundColor: "#E0F7FA",
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  bannerText: {
    fontSize: 18,
    color: "#721c24",
    fontWeight: "bold",
    marginBottom: 10,
  },
  bannerSubText: {
    fontSize: 16,
    color: "#721c24",
    marginBottom: 20,
    textAlign: "center",
  },
  createMembershipButton: {
    backgroundColor: "#00f4f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  createMembershipButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  renewBanner: {
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    backgroundColor: "#ffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    margin: 20,
  },
  renewBannerText: {
    fontSize: 16,
    color: "#856404",
    marginBottom: 10,
    textAlign: "center",
  },
  renewBannerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  renewButton: {
    backgroundColor: "#00f4f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginRight: 10,
  },
  renewButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  closeButton: {
    backgroundColor: "#333",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
    marginBottom: 50
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
    paddingBottom: 50
  },
  kmBanner: {
    padding: 20,
    backgroundColor: "#ffff",
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  kmBannerText: {
    fontSize: 16,
    color: "#E91E63",
    marginBottom: 10,
    textAlign: "center",
  },
  kmBannerButtons: {
    flexDirection: "column", // Cambiado a 'column' para que los botones sean verticales
    justifyContent: "space-between",
    alignItems: "center", // Opcional: Centrar los botones horizontalmente
    width: "100%",
  },
  headerContainer: {
    flexDirection: 'column', // Organiza los elementos en columna
    alignItems: 'flex-start', // Alinea los elementos al inicio (izquierda)
    padding: 10, // A�ade padding para espaciar los elementos del borde
  },
  backButtonHeader: {
    marginBottom: 10, // Espacio debajo de la flecha
  },
  greetingContainer: {
    width: '100%', // Asegura que el contenedor ocupe todo el ancho disponible
    marginTop: 10,
  },

  notificationTextCompact: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000",
  },
  rechargeButton: {
    backgroundColor: "#00f4f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginRight: 10,
  },
  rechargeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  tourContainer: {
    flex: 1,
    paddingTop: 50,
    backgroundColor: "#474747",
  },
  tourImage: {
    width: 200,
    height: 100,
    resizeMode: "contain",
    marginBottom: 20,
    borderRadius: 100,
  },
  tourText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
  },
  navigationButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  prevButton: {
    backgroundColor: "#cccccc",
    width: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#00f4f5",
    padding: 10,
  },
  prevButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    alignSelf: "center",
    alignItems: "center",
  },
  nextButton: {
    backgroundColor: "#00f4f5",
    width: 150,
    padding: 10,
    borderRadius: 10,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  stepMessage: {
    fontSize: 22, // Aumentar tama�o para m�s impacto
    fontWeight: "600", // Peso mediano para no saturar
    marginBottom: 20, // M�s espacio entre elementos
    textAlign: "center",
    color: "#FFFFFF", // Color cambiado a blanco
    textShadowColor: "rgba(0, 0, 0, 0.15)", // Sombras m�s suaves
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8, // Sombra m�s dispersa
    letterSpacing: 0.8, // Espaciado entre letras para mejor legibilidad
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
  },
  explanatoryText: {
    fontSize: 16,
    color: "#D7D7D7",
    textAlign: "center",
    marginVertical: 10,
  },
  profileImage: {
    width: 150,
    height: 150,
    borderRadius: 10,
    marginBottom: 10,
  },
  imagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 10,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalContainerIos: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalViewIos: {
    width: 300,
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  botonCamera: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00204a",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    width: "100%",
    justifyContent: "center",
    elevation: 5,
  },
  botonGallery: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00f4f5",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    width: "100%",
    justifyContent: "center",
    elevation: 5,
  },
  pickerContainer: {
    width: "100%",
    marginTop: 20,
  },
  modalButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  input: {
    height: 50,

    borderRadius: 10,
    paddingHorizontal: 20,
    fontSize: 16,
    marginTop: 10,
    color: "#fff",
  },
  linkButton: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  summaryText: {
    fontSize: 18,
    marginVertical: 5,
    color: "#fff",
  },
  finishButton: {
    backgroundColor: "#00f4f5",
    marginTop: 20,
    width: 200,
    borderRadius: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    width: 300,
    backgroundColor: "white",
    borderRadius: 20,
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
    marginBottom: 15,
    textAlign: "center",
    fontSize: 16,
  },
  cancelButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    width: "100%",
    justifyContent: "center",
    elevation: 5,
    borderWidth: 1,
    borderColor: "#00f4f5",
  },
  bottomSheetContent: {
    padding: 16,
    backgroundColor: "rgba(1, 6, 10, 0.94)", // Glass dark background
    zIndex: 1,
  },
  bottomSheetContentContainer: {
    paddingBottom: 80,
  },

  notificationCard: {
    backgroundColor: "rgba(4, 39, 58, 0.52)",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.30)",
  },
  notificationText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#ffffff", // White text for better contrast
  },
  notificationLink: {
    color: "#1e90ff", // Bright blue for links
    fontWeight: "bold",
  },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#ffffff", // White text for section titles
  },
  viewAll: {
    color: "#1e90ff", // Bright blue for 'View All' links
  },
  suggestionCard: {
    backgroundColor: "rgba(4, 39, 58, 0.45)",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.35)",
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff", // White text for suggestions
  },
  promoCard: {
    flexDirection: "row",
    backgroundColor: "rgba(4, 39, 58, 0.52)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    elevation: 5,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.32)",
  },
  promoImage: {
    width: 100,
    height: 100,
    marginRight: 16,
    borderRadius: 8,
  },
  promoTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff", // White text for promo titles
  },
  promoDescription: {
    fontSize: 14,
    color: "#cccccc", // Light gray for promo descriptions
  },
  statusText: {
    fontSize: 16,
    fontWeight: "bold",
    top: 3,
    marginRight: 10,
  },

  infoContainerDark: {
    backgroundColor: "#545454", // Modo oscuro
  },

  containerHorizontal: {
  },
  bannerImage: {
    width: 300,
    height: 150,
    borderRadius: 10,
    marginRight: 10,
    elevation:5
  },
  containerDayli: {
    marginVertical: 20,
    paddingHorizontal: 10,
  },
  headerDayli: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  scrollContainerDayli: {
    flexDirection: "row",
  },
  cardDayli: {
    backgroundColor: "rgba(4, 39, 58, 0.45)",
    borderRadius: 16,
    width: 200,
    marginRight: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.30)",
  },
  cardImageDayli: {
    width: "70%",
    height: 100,
    borderRadius: 10,
    marginBottom: 10,
    alignSelf: "center",
  },
  cardTitleDayli: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  cardSubtitleDayli: {
    color: "#a1a1a1",
    fontSize: 14,
    marginTop: 5,
  },
  backButtonFloating: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10, // Para asegurarse de que est� por encima de otros elementos
  },
});
const darkStyles = StyleSheet.create({
  bottomSheetWrap: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  glassOrbTop: {
    position: "absolute",
    top: -100,
    right: -30,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: "rgba(21, 229, 233, 0.14)",
    zIndex: 0,
  },
  glassOrbBottom: {
    position: "absolute",
    bottom: 10,
    left: -80,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: "rgba(0, 32, 74, 0.28)",
    zIndex: 0,
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  infoContainer: {
    position: "absolute",
    top: 20,
    right: 10,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    padding: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  infoText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  bookNow: {
    position: "absolute",
    bottom: 20,
    left: (width - 90) / 2,
    width: 240,
    height: 55,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 23,
    padding: 20,
    shadowColor: "gray",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  banner: {
    padding: 20,
    backgroundColor: "#E0F7FA",
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  bannerText: {
    fontSize: 18,
    color: "#721c24",
    fontWeight: "bold",
    marginBottom: 10,
  },
  bannerSubText: {
    fontSize: 16,
    color: "#721c24",
    marginBottom: 20,
    textAlign: "center",
  },
  createMembershipButton: {
    backgroundColor: "#00f4f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  createMembershipButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  renewBanner: {
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    backgroundColor: "#ffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    margin: 20,
  },
  renewBannerText: {
    fontSize: 16,
    color: "#856404",
    marginBottom: 10,
    textAlign: "center",
  },
  renewBannerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  renewButton: {
    backgroundColor: "#00f4f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginRight: 10,
  },
  renewButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  closeButton: {
    backgroundColor: "#333",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
    marginBottom: 50
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
    paddingBottom: 50
  },
  kmBanner: {
    padding: 20,
    backgroundColor: "#ffff",
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  kmBannerText: {
    fontSize: 16,
    color: "#E91E63",
    marginBottom: 10,
    textAlign: "center",
  },
  kmBannerButtons: {
    flexDirection: "column", // Cambiado a 'column' para que los botones sean verticales
    justifyContent: "space-between",
    alignItems: "center", // Opcional: Centrar los botones horizontalmente
    width: "100%",
  },
  headerContainer: {
    flexDirection: 'column', // Organiza los elementos en columna
    alignItems: 'flex-start', // Alinea los elementos al inicio (izquierda)
    padding: 10, // A�ade padding para espaciar los elementos del borde
  },
  backButtonHeader: {
    marginBottom: 10, // Espacio debajo de la flecha
  },
  greetingContainer: {
    width: '100%', // Asegura que el contenedor ocupe todo el ancho disponible
    marginTop: 10,
  },

  notificationTextCompact: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000",
  },
  rechargeButton: {
    backgroundColor: "#00f4f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginRight: 10,
  },
  rechargeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  tourContainer: {
    flex: 1,
    paddingTop: 50,
    backgroundColor: "#474747",
  },
  tourImage: {
    width: 200,
    height: 100,
    resizeMode: "contain",
    marginBottom: 20,
    borderRadius: 100,
  },
  tourText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
  },
  navigationButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  prevButton: {
    backgroundColor: "#cccccc",
    width: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#00f4f5",
    padding: 10,
  },
  prevButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    alignSelf: "center",
    alignItems: "center",
  },
  nextButton: {
    backgroundColor: "#00f4f5",
    width: 150,
    padding: 10,
    borderRadius: 10,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  stepMessage: {
    fontSize: 22, // Aumentar tama�o para m�s impacto
    fontWeight: "600", // Peso mediano para no saturar
    marginBottom: 20, // M�s espacio entre elementos
    textAlign: "center",
    color: "#FFFFFF", // Color cambiado a blanco
    textShadowColor: "rgba(0, 0, 0, 0.15)", // Sombras m�s suaves
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8, // Sombra m�s dispersa
    letterSpacing: 0.8, // Espaciado entre letras para mejor legibilidad
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
  },
  explanatoryText: {
    fontSize: 16,
    color: "#D7D7D7",
    textAlign: "center",
    marginVertical: 10,
  },
  profileImage: {
    width: 150,
    height: 150,
    borderRadius: 10,
    marginBottom: 10,
  },
  imagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 10,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalContainerIos: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalViewIos: {
    width: 300,
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  botonCamera: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00204a",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    width: "100%",
    justifyContent: "center",
    elevation: 5,
  },
  botonGallery: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00f4f5",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    width: "100%",
    justifyContent: "center",
    elevation: 5,
  },
  pickerContainer: {
    width: "100%",
    marginTop: 20,
  },
  modalButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  input: {
    height: 50,

    borderRadius: 10,
    paddingHorizontal: 20,
    fontSize: 16,
    marginTop: 10,
    color: "#fff",
  },
  linkButton: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  summaryText: {
    fontSize: 18,
    marginVertical: 5,
    color: "#fff",
  },
  finishButton: {
    backgroundColor: "#00f4f5",
    marginTop: 20,
    width: 200,
    borderRadius: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    width: 300,
    backgroundColor: "white",
    borderRadius: 20,
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
    marginBottom: 15,
    textAlign: "center",
    fontSize: 16,
  },
  cancelButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    width: "100%",
    justifyContent: "center",
    elevation: 5,
    borderWidth: 1,
    borderColor: "#00f4f5",
  },
  bottomSheetContent: {
    padding: 16,
    backgroundColor: "rgba(1, 6, 10, 0.94)", // Glass dark background
    zIndex: 1,
  },
  bottomSheetContentContainer: {
    paddingBottom: 80,
  },

  notificationCard: {
    backgroundColor: "rgba(4, 39, 58, 0.52)",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.30)",
  },
  notificationText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#ffffff", // White text for better contrast
  },
  notificationLink: {
    color: "#1e90ff", // Bright blue for links
    fontWeight: "bold",
  },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#ffffff", // White text for section titles
  },
  viewAll: {
    color: "#1e90ff", // Bright blue for 'View All' links
  },
  suggestionCard: {
    backgroundColor: "rgba(4, 39, 58, 0.45)",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.35)",
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff", // White text for suggestions
  },
  promoCard: {
    flexDirection: "row",
    backgroundColor: "rgba(4, 39, 58, 0.52)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    elevation: 5,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.32)",
  },
  promoImage: {
    width: 100,
    height: 100,
    marginRight: 16,
    borderRadius: 8,
  },
  promoTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff", // White text for promo titles
  },
  promoDescription: {
    fontSize: 14,
    color: "#cccccc", // Light gray for promo descriptions
  },
  statusText: {
    fontSize: 16,
    fontWeight: "bold",
    top: 3,
    marginRight: 10,
  },

  infoContainerDark: {
    backgroundColor: "#545454", // Modo oscuro
  },

  containerHorizontal: {
  },
  bannerImage: {
    width: 300,
    height: 150,
    borderRadius: 10,
    marginRight: 10,
    elevation:5
  },
  containerDayli: {
    marginVertical: 20,
    paddingHorizontal: 10,
  },
  headerDayli: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  scrollContainerDayli: {
    flexDirection: "row",
  },
  cardDayli: {
    backgroundColor: "rgba(4, 39, 58, 0.45)",
    borderRadius: 16,
    width: 200,
    marginRight: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.30)",
  },
  cardImageDayli: {
    width: "70%",
    height: 100,
    borderRadius: 10,
    marginBottom: 10,
    alignSelf: "center",
  },
  cardTitleDayli: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  cardSubtitleDayli: {
    color: "#a1a1a1",
    fontSize: 14,
    marginTop: 5,
  },
  backButtonFloating: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10, // Para asegurarse de que est� por encima de otros elementos
  },
});

const nS = StyleSheet.create({
  driverSplitRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: '#051A26',
  },
  driverMapHalf: {
    flex: 1,
    width: '100%',
    backgroundColor: '#051A26',
  },
  driverReservationsHalf: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 126,
    zIndex: 20,
    elevation: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.24)',
    backgroundColor: 'rgba(8,33,46,0.95)',
    overflow: 'hidden',
  },
  driverReservationsHalfMinimized: {
    height: 108,
  },
  driverReservationsHeaderRow: {
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,33,46,0.95)',
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  driverCollapsedRow: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  driverSearchingText: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  driverConnectedSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 0,
    textAlign: 'center',
    backgroundColor: 'rgba(8,33,46,0.95)',
  },
  driverTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 96,
    zIndex: 25,
  },
  driverMapControls: {
    position: 'absolute',
    left: 16,
    zIndex: 35,
    elevation: 35,
    gap: 10,
  },
  driverMapZoomControls: {
    position: 'absolute',
    right: 16,
    zIndex: 35,
    elevation: 35,
    gap: 10,
  },
  driverMapCtrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,46,61,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  driverMapCtrlTxt: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  driverReservationsHandle: {
    width: 52,
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 8,
  },
  driverReservationsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  driverReservationsToggleText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  driverReservationsBody: {
    flex: 1,
    backgroundColor: 'rgba(8,33,46,0.95)',
    borderTopWidth: 0,
  },
  mapStage: {
    flex: 1,
    width: '100%',
    backgroundColor: '#051A26',
  },
  wrap: {
    flex: 1,
    width: '100%',
    backgroundColor: '#051A26',
  },
  orbTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(0, 229, 255, 0.07)',
    zIndex: 0,
  },
  orbBottomLeft: {
    position: 'absolute',
    bottom: 100,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(0, 32, 74, 0.20)',
    zIndex: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#00E5FF',
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,229,255,0.18)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  avatarInitial: {
    color: '#00E5FF',
    fontSize: 20,
    fontWeight: '800' as const,
  },
  headerMid: {
    flex: 1,
  },
  greetText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500' as const,
  },
  nameText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  mapBtn: {
    padding: 8,
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  destCard: {
    backgroundColor: '#0A1E2E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.22)',
    marginBottom: 28,
    overflow: 'hidden',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  destGlowRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  destCardInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  destIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 16,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 4,
  },
  destArrowWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.15)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  destTextWrap: {
    flex: 1,
  },
  destLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  destSub: {
    color: 'rgba(255, 255, 255, 0.40)',
    fontSize: 12.5,
    marginTop: 4,
    fontWeight: '400' as const,
  },
  sectionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
  },
  servicesGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 24,
  },
  serviceCard: {
    width: '47%',
    backgroundColor: 'rgba(10, 46, 61, 0.72)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.18)',
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  serviceIcon: {
    width: 52,
    height: 52,
    marginBottom: 10,
    resizeMode: 'contain' as const,
  },
  serviceLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textAlign: 'center' as const,
  },
  promoBanner: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.22)',
    padding: 20,
    marginBottom: 26,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  promoTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  promoTitle: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  promoSub: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900' as const,
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  promoDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 17,
  },
  promoCta: {
    backgroundColor: '#00E5FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  promoCtaText: {
    color: '#051A26',
    fontWeight: '800' as const,
    fontSize: 13,
  },
  beneficiosGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 26,
  },
  beneficioCard: {
    width: '47%',
    backgroundColor: 'rgba(10, 46, 61, 0.72)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.14)',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  beneficioIcon: {
    fontSize: 26,
    marginBottom: 8,
  },
  beneficioLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  beneficioDesc: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    lineHeight: 15,
  },
  driverOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
  },
  driverTopBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  driverCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,46,61,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverEarningsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,46,61,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  driverEarningsLabel: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  driverEarningsAmount: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '800',
  },
  driverMiniAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(5,26,38,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverNotifBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  driverNotifDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#051A26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNotifDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E676',
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  driverMiniAvatarImg: {
    width: '100%',
    height: '100%',
  },
  driverOfflineStack: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
    elevation: 40,
    gap: 8,
    alignItems: 'center',
  },
  driverMiniPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.24)',
    backgroundColor: 'rgba(8,33,46,0.88)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  driverMiniPanelTitle: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '800',
  },
  driverMiniPanelSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    marginTop: 4,
  },
  driverMiniPanelBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  driverMiniPanelBtnText: {
    color: '#051A26',
    fontSize: 12,
    fontWeight: '800',
  },
  driverServicesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  driverServicesModalPanel: {
    maxHeight: '74%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    backgroundColor: 'rgba(8,33,46,0.98)',
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  driverServicesModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  driverServicesModalTitle: {
    color: '#00E5FF',
    fontSize: 17,
    fontWeight: '800',
  },
  driverServicesModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  driverServicesModalList: {
    width: '100%',
  },
  driverServicesModalListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  driverServicesLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    gap: 10,
  },
  driverServicesLoadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  driverBottomSheetContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 92,
    zIndex: 20,
    elevation: 20,
  },
  driverBottomSheetContainerCollapsed: {
    height: 176,
  },
  driverBottomSheetContainerExpanded: {
    height: 420,
  },
  driverBottomSheetBackground: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: 'rgba(8,33,46,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
    overflow: 'hidden',
  },
  driverBottomSheet: {
    flex: 1,
    width: '100%',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  driverSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.38)',
    marginBottom: 5,
  },
  driverStatusText: {
    color: '#00E5FF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  driverStatusSub: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
    textAlign: 'center',
  },
  driverStatsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  driverStatItem: {
    width: '31%',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.12)',
  },
  driverStatVal: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  driverStatLbl: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  driverReservasBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  driverImmediateListWrap: {
    width: '100%',
    marginTop: 4,
    marginBottom: 6,
    gap: 8,
  },
  driverImmediateScroll: {
    width: '100%',
    maxHeight: 420,
  },
  driverImmediateScrollContent: {
    gap: 8,
    paddingBottom: 2,
  },
  driverImmediateTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  driverImmediateEmpty: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 2,
  },
  driverImmediateCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 64,
  },
  driverImmediateTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    gap: 10,
  },
  driverImmediateFare: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  driverImmediateAcceptBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 58,
    alignItems: 'center',
  },
  driverImmediateAcceptText: {
    color: '#051A26',
    fontSize: 11,
    fontWeight: '800',
  },
  driverImmediateRouteText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 11,
    marginTop: 1,
    paddingRight: 4,
  },
  driverReservasBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  driverReservasBtnTextWrap: {
    flex: 1,
  },
  driverReservasBtnTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  driverReservasBtnSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  incomingRequestCard: {
    backgroundColor: 'rgba(10,46,61,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#00E5FF',
    padding: 16,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 9,
  },
  incomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  incomingType: {
    color: '#00E5FF',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  incomingEta: {
    color: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  incomingPrice: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 8,
  },
  incomingRouteText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    marginBottom: 3,
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  rejectBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rejectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
  },
  acceptBtnText: {
    color: '#051A26',
    fontSize: 15,
    fontWeight: '900',
  },
  driverNovedadesCard: {
    backgroundColor: 'rgba(10,46,61,0.90)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    padding: 14,
    marginTop: 10,
  },
  driverNovedadesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  driverNovedadesTitle: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  driverNovedadesText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 18,
  },
  driverBottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom:  32,
    zIndex: 40,
    elevation: 40,
    paddingHorizontal: 12,
  },
  driverNavItems: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(8,35,50,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.12)',
  },
  driverNavItem: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: 4,
  },
  driverNavItemActive: {
    opacity: 1,
  },
  driverNavLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
    fontWeight: '500',
  },
  driverNavLabelActive: {
    color: '#00E5FF',
  },
  driverNavIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#00E5FF',
  },
  driverNavCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
  },
  driverNavCenterStack: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNavCenterPulseRing: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'rgba(0,229,255,0.35)',
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  driverNavCenterBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ffffff', 
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  driverNavCenterBtnGo: {
    backgroundColor: '#0F2F3D',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.55)',
    shadowColor: '#0F2F3D',
  },
  driverNavCenterLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    marginTop: 2,
    fontWeight: '500',
  },
  driverNavGoText: {
    color: '#051A26',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  driverNavGoTextGo: {
    color: '#00E5FF',
  },
  driverLogoImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
});

export default MapScreen;




