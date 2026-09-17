import { RootState } from '../../common/store';
import { supabase, SUPABASE_URL, getSupabaseAuthHeaders } from '../../config/SupabaseConfig';

const MAX_ACTIVE_IMMEDIATE_TRIPS = 2;
const ACTIVE_IMMEDIATE_STATUSES = ['PENDING', 'ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED', 'NEW'];
import { roundPrice } from '../../hooks/roundPrice';
import { FareCalculator } from '../../common/actions/FareCalculator';
import { isNearAirport } from '../../common/utils/airports';
import { DEFAULT_UMBRAL_INTERMUNICIPAL_KM } from '../../constants/fare';
import { OtpService } from '../../common/services/OtpService';
import { saveBooking } from '../../common/actions/saveBooking';
import OtpModal from '../../components/OtpModal';
import { OTPSystemDebug } from '../../components/OTPSystemDebug';
import CustomAlert from '../../components/CustomAlert';
import PromoComp from '../../components/PromoComp';
import MapContainer from '../../components/MapContainer';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Avatar } from 'react-native-elements';
const GOOGLE_MAPS_APIKEY_PROD = 'YOUR_GOOGLE_MAPS_API_KEY';
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  TextInput,
  Animated,
  Dimensions,
  Platform,
} from "react-native";

type ColorScheme = 'light' | 'dark';
const { width, height } = Dimensions.get('window');
import { useDispatch, useSelector } from "react-redux";
import { useNavigation, useRoute } from "@react-navigation/native";
import { AntDesign, Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { createSelector } from 'reselect';

// Memoized selectors (simple, no reselect needed)
const selectDrivers = (state: RootState) => (state as any).bookings?.recentDrivers || [];
const selectUser = (state: RootState) => (state as any).auth?.user || null;

// Add other imports as needed for your project context
//console.log(type,"type")

const BookingScreen = () => {
  // Redux and navigation
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const route = useRoute() as any;
  // Example selectors (adjust to your store structure)
  const drivers = useSelector(selectDrivers);
  const user = useSelector(selectUser);
  // Color scheme (adjust if you use a different hook)
  const colorScheme: ColorScheme = 'light';
  const cameraRef = useRef(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  // State declarations - initialize from route params
  const [origin, setOrigin] = useState<any>(route.params?.origin || null);
  const [destination, setDestination] = useState<any>(route.params?.destination || null);
  const [distance, setDistance] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStartTime, setSearchStartTime] = useState<number | null>(null);
  const [searchRadius, setSearchRadius] = useState(1000);
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [isDriverModalVisible, setIsDriverModalVisible] = useState(false);
  const [isVehicleModalVisible, setIsVehicleModalVisible] = useState(false);
  const [taxiOptions, setTaxiOptions] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [fareDetails, setFareDetails] = useState<any>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [date, setDate] = useState<number | null>(null);
  const [immediatePickup, setImmediatePickup] = useState(true);
  const [scheduleRide, setScheduleRide] = useState(false);
  const [isSoloIdaActive, setIsSoloIdaActive] = useState(true);
  const [isIdaYVueltaActive, setIsIdaYVueltaActive] = useState(false);
  const [tripType, setTripType] = useState('Solo Ida');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpValidated, setOtpValidated] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState('cash');
  const [isPromoModalVisible, setIsPromoModalVisible] = useState(false);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<any>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [observations, setObservations] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertType, setAlertType] = useState<any>('info');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<any[]>([]);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [useFallbackMap, setUseFallbackMap] = useState(false);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [priceAdjustment, setPriceAdjustment] = useState(0);
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const pendingBookingRef = useRef<any>(null);
  // Add/adjust more state as needed for your logic
  
  // MONITOR DE ESTADO - Imprime en consola para debug
  useEffect(() => {
    console.log("════════════════════════════════════════════════════════");
    console.log("🚀 [BookingScreen MOUNTED] Componente ha cargado");
    console.log("════════════════════════════════════════════════════════");
    return () => {
      console.log("🛑 [BookingScreen UNMOUNTED]");
    };
  }, []);
  
  // Monitor de cambios en estados críticos
  useEffect(() => {
    console.log("📊 [STATE UPDATE] showOtpModal:", showOtpModal, "| otp:", otp);
  }, [showOtpModal, otp]);
  
  // TODO: Uncomment and fix once fetchPromos and fetchRecentDrivers are properly imported/defined
  // useEffect(() => {
  //   dispatch(fetchPromos() as any);
  //   dispatch(fetchRecentDrivers() as any);
  // }, [dispatch]);
  
  // Calcular distancia y duración usando Google Maps Directions API
  useEffect(() => {
    if (origin && destination) {
      const fetchDistanceAndDuration = async () => {
        console.log("🗺️ [DIRECTIONS] Solicitando distancia/duración...");
        console.log("   From:", origin.latitude, origin.longitude);
        console.log("   To:", destination.latitude, destination.longitude);
        
        let timeoutId: NodeJS.Timeout | null = null;
        let controller: AbortController | null = null;
        
        try {
          // Timeout de 7 segundos para Google Maps (más realista)
          controller = new AbortController();
          timeoutId = setTimeout(() => {
            console.warn("⏱️ [DIRECTIONS] Timeout después de 7 segundos");
            controller!.abort();
          }, 7000);
          
          try {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&key=${GOOGLE_MAPS_APIKEY_PROD}`,
              { signal: controller.signal }
            );
            
            const data = await response.json();
            
            if (data.routes && data.routes.length > 0) {
              const route = data.routes[0].legs[0];
              const distKm = route.distance.value / 1000;
              const durationMin = route.duration.value / 60;
              setDistance(distKm);
              setDuration(durationMin);
              console.log("✅ [DIRECTIONS] Distancia:", distKm.toFixed(2), "km | Duración:", durationMin.toFixed(1), "min");
              return;
            } else {
              throw new Error("No routes found");
            }
          } catch (fetchError: any) {
            // Capturar AbortError + otros errores de fetch
            if (fetchError.name === 'AbortError' || fetchError.message.includes('abort')) {
              console.warn("⏱️ [DIRECTIONS] Timeout - Google Maps no respondió a tiempo");
            } else {
              console.warn("⚠️ [DIRECTIONS] Fetch error:", fetchError.message);
            }
            console.warn("⚠️ [DIRECTIONS FALLBACK] Usando Haversine...");
            throw fetchError; // Re-throw para ir al catch externo
          }
        } catch (error: any) {
          // Fallback a Haversine
          try {
            const distKm = calculateDistance(
              origin.latitude,
              origin.longitude,
              destination.latitude,
              destination.longitude
            ) / 1000;
            const durationMin = (distKm / 30) * 60;
            setDistance(distKm);
            setDuration(durationMin);
            console.log("✅ [HAVERSINE] Distancia:", distKm.toFixed(2), "km | Duración:", durationMin.toFixed(1), "min");
          } catch (err: any) {
            console.error("❌ [DIRECTIONS FINAL ERROR]:", err.message);
          }
        } finally {
          // SIEMPRE limpiar el timeout
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      };
      fetchDistanceAndDuration();
    }
  }, [origin, destination]);

  // ─── FUNCIÓN AUXILIAR: Calcular distancia entre dos puntos (Haversine) ───
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Retorna en metros
  };

  // ─── EFECTO: Iniciar búsqueda de conductores ───
  useEffect(() => {
    if (origin && destination) {
      setIsSearching(true);
      setSearchStartTime(Date.now());
      setSearchRadius(1000); // Comenzar con 1km de radio
    }
  }, [origin, destination]);

  // ─── EFECTO: Incrementar radio de búsqueda cada 10 segundos ───
  useEffect(() => {
    if (!isSearching) return;
    
    const radiusIncrement = setInterval(() => {
      setSearchRadius((prevRadius: number) => {
        const newRadius = prevRadius + 1000; // Incrementar 1km cada 10 segundos
        console.log(`📍 Radio de búsqueda aumentado a: ${(newRadius / 1000).toFixed(1)}km`);
        return newRadius;
      });
    }, 10000); // Cada 10 segundos

    return () => clearInterval(radiusIncrement);
  }, [isSearching]);

  // ─── EFECTO: Filtrar conductores cercanos por radio ───
  useEffect(() => {
    if (origin && drivers && drivers.length > 0) {
      const filtered = drivers
        .map((driver: any) => {
          // Asumir que driver tiene driver_latitude y driver_longitude
          if (!driver.driver_latitude || !driver.driver_longitude) return null;
          
          const distance = calculateDistance(
            origin.latitude,
            origin.longitude,
            driver.driver_latitude,
            driver.driver_longitude
          );

          return {
            ...driver,
            distance: distance,
          };
        })
        .filter((driver: any) => driver !== null && driver.distance <= searchRadius)
        .sort((a: any, b: any) => a.distance - b.distance); // Ordenar por cercania

      setNearbyDrivers(filtered);
      
      if (filtered.length > 0) {
        console.log(`✅ ${filtered.length} conductor(es) encontrado(s) a ${(searchRadius / 1000).toFixed(1)}km`);
      } else {
        console.log(`❌ No hay conductores dentro de ${(searchRadius / 1000).toFixed(1)}km`);
      }
    }
  }, [origin, drivers, searchRadius]);
  
  const styles = colorScheme === "dark" ? darkStyles : lightStyles;

  const handleSelectDriver = (driver: any) => {
    setSelectedDriver(driver);
   // console.log("Conductor seleccionado:", driver); // Guardar en log
    setIsDriverModalVisible(false); // Cerrar el modal
  };
  useEffect(() => {
    console.log("👀 [TAXI OPTIONS EFFECT] Revisando condiciones:");
    console.log("   - distance:", distance, "typeof:", typeof distance);
    console.log("   - duration:", duration, "typeof:", typeof duration);
    
    if (distance && duration) {
      console.log("✅ [TAXI OPTIONS EFFECT] Condiciones cumplidas - llamando fetchTaxiOptionsFromFirebase");
      fetchTaxiOptionsFromFirebase();
    } else {
      console.log("⏳ [TAXI OPTIONS EFFECT] Esperando distance y duration...");
    }
  }, [distance, duration]);
  
  const renderDriverList = () => {
    // Usar conductores cercanos ordenados por distancia
    const uniqueDrivers = new Set();
    const filteredDrivers = nearbyDrivers.filter((driver: any) => {
      if (!uniqueDrivers.has(driver.driver_name)) {
        uniqueDrivers.add(driver.driver_name);
        return true;
      }
      return false;
    });

    if (filteredDrivers.length === 0) {
      return (
        <View style={{padding: 16, alignItems: 'center'}}>
          <Text style={{color: colorScheme === 'dark' ? '#fff' : '#000', fontSize: 14}}>
            Buscando conductores a {(searchRadius / 1000).toFixed(1)}km...
          </Text>
        </View>
      );
    }

    return filteredDrivers.map((driver: any, index: number) => (
      <Animatable.View
        key={`${driver.driver_name}-${index}`}
        animation="fadeInUp"
        duration={450}
        delay={index * 70}
        useNativeDriver
      >
        <TouchableOpacity
          activeOpacity={0.84}
          style={styles.driverItem}
          onPress={() => handleSelectDriver(driver)}
        >
          <Text style={styles.driverName}>
            {driver.driver_name} {index === 0 && '⭐ Más cercano'}
          </Text>
          <Text style={{color: colorScheme === 'dark' ? '#00E5FF' : '#00d4d7', fontSize: 12, marginTop: 4}}>
            📍 {(driver.distance / 1000).toFixed(1)}km de distancia
          </Text>
        </TouchableOpacity>
      </Animatable.View>
    ));
  };

  const fetchTaxiOptionsFromFirebase = async () => {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("🔍 [SUPABASE] Buscando vehículos en car_types...");
    console.log("════════════════════════════════════════════════════════════");
    
    console.log("📊 Parámetros: distance=" + distance + ", duration=" + duration);
    
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // TIMEOUT: 8 segundos para Supabase (más realista)
      const controller = new AbortController();
      timeoutId = setTimeout(() => {
        console.warn("⏱️ [SUPABASE] Timeout después de 8 segundos");
        controller.abort();
      }, 8000);
      
      try {
        console.log("📡 [QUERY] SELECT * FROM car_types WHERE is_active = true");
        const { data: carTypes, error: queryError, status } = await supabase
          .from("car_types")
          .select("*")
          .eq("is_active", true);

        console.log("📡 [RESPONSE] HTTP Status:", status);
        
        if (queryError) {
          console.error("\n❌ [ERROR] Query falló:");
          console.error("   Código:", queryError.code);
          console.error("   Mensaje:", queryError.message);
          
          // Fallback: intentar sin filtro
          console.log("\n🔄 [FALLBACK] Intentando query sin .eq()...");
          const { data: allData, error: error2 } = await supabase
            .from("car_types")
            .select("*");
          
          if (error2) {
            console.error("❌ [FALLBACK FAILED]:", error2.message);
            console.log("🔴 Supabase completamente inaccesible");
            setTaxiOptions([]);
            return;
          }
          
          console.log("✅ Fallback OK - Total registros:", allData?.length);
          const active = allData?.filter((v: any) => v.is_active === true) || [];
          console.log("📦 Registros activos:", active.length);
          
          if (active.length === 0) {
            console.warn("⚠️ No hay vehículos activos");
            setTaxiOptions([]);
            return;
          }
          
          const options = active.map((car: any) => ({
            value: car.id,
            name: car.name,
            capacity: car.capacity || 0,
            service: car.description || "",
            carImage: car.image || "",
            base_fare: parseFloat(car.base_price) || 0,
            base_fare_inter: parseFloat(car.base_price_inter) || 0,
            rate_per_unit_distance: parseFloat(car.price_per_km) || 0,
            rate_per_unit_distance_inter: parseFloat(car.price_per_km_inter) || 0,
            rate_per_hour: parseFloat(car.rate_per_hour) || 0,
            rate_per_hour_inter: parseFloat(car.rate_per_hour_inter) || 0,
            valor_hora: parseFloat(car.valor_hora) || 0,
            min_fare: parseFloat(car.min_fare) || 0,
            min_fare_inter: parseFloat(car.min_fare_inter) || 0,
            delta_aeropuerto: parseFloat(car.delta_aeropuerto) || 0,
            delta_aeropuerto_prog: parseFloat(car.delta_aeropuerto_prog) || 0,
            convenience_fees: parseFloat(car.convenience_fee) || 0,
            convenience_fee_type: car.convenience_fee_type || "flat",
            estimatedPrice: parseFloat(car.base_price) || 15000,
          }));
          
          console.log("✅ [FALLBACK SUCCESS]", options.length, "vehículos");
          setTaxiOptions(options);
          return;
        }

        // QUERY EXITOSA
        console.log("✅ [SUCCESS] Query exitosa!");
        console.log("📦 Vehículos recibidos:", carTypes?.length || 0);

        if (!carTypes || carTypes.length === 0) {
          console.warn("⚠️ Tabla vacía o sin activos");
          setTaxiOptions([]);
          return;
        }

        const options = carTypes.map((carType: any) => ({
          value: carType.id,
          name: carType.name,
          capacity: carType.capacity || 0,
          service: carType.description || "",
          carImage: carType.image || "",
          base_fare: parseFloat(carType.base_price) || 0,
          base_fare_inter: parseFloat(carType.base_price_inter) || 0,
          rate_per_unit_distance: parseFloat(carType.price_per_km) || 0,
          rate_per_unit_distance_inter: parseFloat(carType.price_per_km_inter) || 0,
          rate_per_hour: parseFloat(carType.rate_per_hour) || 0,
          rate_per_hour_inter: parseFloat(carType.rate_per_hour_inter) || 0,
          valor_hora: parseFloat(carType.valor_hora) || 0,
          min_fare: parseFloat(carType.min_fare) || 0,
          min_fare_inter: parseFloat(carType.min_fare_inter) || 0,
          delta_aeropuerto: parseFloat(carType.delta_aeropuerto) || 0,
          delta_aeropuerto_prog: parseFloat(carType.delta_aeropuerto_prog) || 0,
          convenience_fees: parseFloat(carType.convenience_fee) || 0,
          convenience_fee_type: carType.convenience_fee_type || "flat",
          umbral_intermunicipal_km: parseFloat(carType.umbral_intermunicipal_km) || 29,
          estimatedPrice: parseFloat(carType.base_price) || 15000,
        }));

        console.log("✅ [COMPLETE]", options.length, "vehículos listos");
        setTaxiOptions(options);
        console.log("════════════════════════════════════════════════════════════\n");
        
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message.includes('abort')) {
          console.error("\n⏱️ [TIMEOUT] Supabase no respondió en 8 segundos");
        } else {
          console.error("\n❌ [EXCEPTION]:", error.message);
        }
        console.log("🔴 Supabase inaccesible - intentaré más tarde");
        setTaxiOptions([]);
      } finally {
        // SIEMPRE limpiar el timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error: any) {
      // Catch outer: cualquier otro error no capturado
      console.error("❌ [FATAL ERROR]:", error.message || error);
      console.log("🔴 Abortando fetch de vehículos");
      setTaxiOptions([]);
    }
  };

  // Detección automática aeropuerto por coordenadas (Haversine + 40 aeropuertos Colombia).
  // Sustituye el legacy `.includes("Aero")` (frágil, case-sensitive).
  const detectAirport = (): boolean => {
    const o = origin && (origin as any).latitude != null && (origin as any).longitude != null
      ? isNearAirport((origin as any).latitude, (origin as any).longitude) : null;
    const d = destination && (destination as any).latitude != null && (destination as any).longitude != null
      ? isNearAirport((destination as any).latitude, (destination as any).longitude) : null;
    return !!(o || d);
  };

  const handleSelectVehicle = (vehicle: any) => {
    setSelectedVehicle(vehicle);

    const distKm   = typeof distance === 'string' ? parseFloat(distance) : distance;
    const durMin   = typeof duration === 'string' ? parseFloat(duration) : duration;
    const isAirport = detectAirport();
    const isIntermunicipal = distKm > (vehicle.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);

    const { totalCost, grandTotal, clientTotal, convenience_fees } = FareCalculator(
      distKm,
      durMin * 60,
      vehicle,
      null,
      2,
      { isAirport, isScheduled, isIntermunicipal }
    );

    setFareDetails({
      estimateFare: grandTotal,
      clientFare:   clientTotal,
      totalCost,
      convenienceFees: convenience_fees,
      driverShare: totalCost,
    });

    setIsVehicleModalVisible(false);
  };
  

  const getVehiclePrice = (option: any) => {
    const distKm = typeof distance === 'number' ? distance : parseFloat(distance as any) || 0;
    const durMin = typeof duration === 'number' ? duration : parseFloat(duration as any) || 0;
    const isAirport = detectAirport();
    const isIntermunicipal = distKm > (option.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);
    const mult = tripType === "Ida y Vuelta" ? 2 : 1;
    const { grandTotal } = FareCalculator(
      distKm * mult,
      durMin * 60 * mult,
      option,
      null,
      2,
      { isAirport, isScheduled, isIntermunicipal }
    );
    return grandTotal;
  };

  const renderTaxiOptions = () => {
    if (taxiOptions.length === 0) {
      console.log("📋 [RENDER VEHICLES] taxiOptions está vacío. Diagnóstico:");
      console.log("   - distance:", distance);
      console.log("   - duration:", duration);
      console.log("   - taxiOptions.length:", taxiOptions.length);
      
      return (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={styles.vehicleSubtext}>
            {(!distance || !duration) 
              ? "⏳ Calculando ruta..." 
              : "🔍 Cargando vehículos disponibles..."}
          </Text>
        </View>
      );
    }
    
    console.log("✅ [RENDER VEHICLES] Mostrando " + taxiOptions.length + " vehículos");
    console.log("   - taxiOptions:", taxiOptions.map(v => ({ name: v.name, value: v.value })));
    
    return (
      <>
        {taxiOptions.map((option, index) => {
          const isSelected = selectedVehicle?.value === option.value;
          const price = getVehiclePrice(option);
          return (
            <Animatable.View
              key={option.value}
              animation="fadeInUp"
              duration={400}
              delay={index * 60}
              useNativeDriver
            >
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.vehicleRow, isSelected && styles.vehicleRowSelected]}
                onPress={() => {
                  console.log("🎯 [TAP] Tocando vehículo:", option.name);
                  handleSelectVehicle(option);
                }}
              >
                <Image
                  source={
                    option.carImage
                      ? { uri: option.carImage }
                      : require("./../../assets/images/microBlackCar.png")
                  }
                  style={styles.vehicleImage}
                />
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleName}>{option.name}</Text>
                  <Text style={styles.vehicleSubtext}>
                    {option.capacity ? `Capacidad: ${option.capacity}` : 'Servicio estándar'}
                  </Text>
                </View>
                <View style={styles.vehiclePriceContainer}>
                  <Text style={styles.vehiclePrice}>${price.toLocaleString()}</Text>
                  {selectedPromo && (
                    <Text style={styles.vehicleDiscount}>
                      -${roundPrice(parseFloat(selectedPromo.max_promo_discount_value || 0)).toLocaleString()}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animatable.View>
          );
        })}
      </>
    );
  };

  const handleShowPromoModal = async () => {
    try {
      setIsPromoModalVisible(true); // Muestra el modal
    } catch (error) {
      console.error("Error fetching promotions: ", error);
    }
  };

  const handleClosePromoModal = () => {
    setIsPromoModalVisible(false); // Cierra el modal
  };

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirm = (selectedDate: Date) => {
    const timestamp = new Date(selectedDate).getTime(); // Convertir la fecha seleccionada a un timestamp
    setDate(timestamp); // Guardamos el timestamp en el estado
    setIsScheduled(true); // Indicamos que el viaje es programado
    //console.log("Fecha y hora seleccionadas (timestamp):", timestamp); // Log del timestamp

    // Mostrar alerta con la fecha seleccionada
    setAlertType('info');
    setAlertTitle('Fecha y Hora Seleccionadas');
    setAlertMessage(`Has seleccionado: ${new Date(selectedDate).toLocaleString()}`);
    setAlertButtons([{ text: 'OK', onPress: () => setAlertVisible(false) }]);
    setAlertVisible(true);

    hideDatePicker();
  };

  const paymentTypes = [
    { label: "Efectivo", value: "cash" },
    { label: "Nequi", value: "nequi" },
    { label: "Daviplata", value: "daviplata" },
  ];

  const handleSelectPaymentType = (value: string) => {
    setSelectedPaymentType(value);
    setShowPaymentModal(false);
  };

  const renderPaymentOption = ({ item, index }: { item: { label: string; value: string }; index: number }) => (
    <Animatable.View animation="fadeInUp" duration={420} delay={index * 60} useNativeDriver>
      <TouchableOpacity
        activeOpacity={0.84}
        style={styles.paymentOption}
        onPress={() => handleSelectPaymentType(item.value)}
      >
        <Text style={styles.paymentOptionText}>{item.label}</Text>
      </TouchableOpacity>
    </Animatable.View>
  );

  const getPrice = (bookingData: any, tolls: any, isScheduled: boolean) => {
    const { roundedDistance, durationMinutes, carType } = bookingData;

    if (!carType) {
      console.error("carType is undefined");
      return null;
    }

    const isAirport = detectAirport();
    const isIntermunicipal = roundedDistance > (carType.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);
    const tollsCost = tolls.reduce((acc: number, toll: any) => acc + toll.PriceToll, 0);

    let { totalCost, grandTotal, clientTotal, convenience_fees } = FareCalculator(
      roundedDistance,
      durationMinutes * 60,
      carType,
      {},
      2,
      { isAirport, isScheduled, isIntermunicipal, tollsTotal: tollsCost }
    );

    if (isNaN(totalCost) || isNaN(grandTotal) || isNaN(convenience_fees)) {
      console.error("Calculation resulted in NaN values:", {
        totalCost,
        grandTotal,
        convenience_fees,
      });
      return null;
    }

    return {
      totalCost,
      estimateFare: grandTotal,
      clientFare: clientTotal,
      estimateTime: durationMinutes,
      convenienceFees: convenience_fees,
      driverShare: totalCost,
      tollsCost,
    };
  };

  // Directions are fetched via Google Maps REST API in the useEffect above (lines ~108-126)
  // The google.maps.DirectionsService is a web-only API and not available in React Native.

// ... código existente ...

const snapPoints = useMemo(() => ["35%", "55%", "85%"], []); // Map visible in top portion

// ... código existente ...
  useEffect(() => {
    handlePayment();
  }, [origin, destination, snapPoints]); // Mantiene actualización de pago sin depender de mapRef inexistente

  const showAlert = (type: string, title: string, message: string) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons([{ text: 'OK', onPress: () => setAlertVisible(false) }]);
    setAlertVisible(true);
  };

  const handleMissingFields = () => {
    let missingFields = [];

    if (!selectedVehicle) missingFields.push("el vehículo");
    if (!origin) missingFields.push("el origen");
    if (!destination) missingFields.push("el destino");
    if (!selectedPaymentType) missingFields.push("el tipo de pago");

    // Generar el mensaje de error dinámicamente
    if (missingFields.length > 0) {
      const message = `Error al crear la Reserva. Por favor selecciona ${missingFields.join(
        ", "
      )}.`;
      setErrorMessage(message);
      setSuccessModalVisible(true);

      // Animación de entrada
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }).start();

      // Cerrar el modal después de 2 segundos
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }).start(() => setSuccessModalVisible(false));
      }, 3000);
    }
  };

  const handleBookNowPress = async () => {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("📱 [BOOKING START] ¡¡¡ BOTÓN PRESIONADO !!!");
    console.log("════════════════════════════════════════════════════════════");

    if (isButtonDisabled) {
      console.log("❌ Botón deshabilitado");
      return;
    }
    setIsButtonDisabled(true);

    console.log("✅ Validando datos:");
    console.log("   User:", user?.id ? "✅" : "❌");
    console.log("   Vehicle:", selectedVehicle?.name ? "✅ " + selectedVehicle.name : "❌");
    console.log("   Origin:", origin?.title ? "✅ " + origin.title : "❌");
    console.log("   Destination:", destination?.title ? "✅ " + destination.title : "❌");
    console.log("   Payment:", selectedPaymentType ? "✅ " + selectedPaymentType : "❌");

    if (!user || !selectedVehicle || !origin || !destination || !selectedPaymentType) {
      console.log("❌ VALIDACIÓN FALLIDA - Campos faltantes");
      setIsButtonDisabled(false);
      return;
    }

    // 🛡️ Límite de 2 viajes inmediatos activos por cliente
    if (!isScheduled) {
      try {
        const headers = await getSupabaseAuthHeaders();
        const statuses = ACTIVE_IMMEDIATE_STATUSES.map((s) => `"${s}"`).join(',');
        const url = `${SUPABASE_URL}/rest/v1/bookings_v2_mobile?customer=eq.${user.id}&status=in.(${statuses})&select=id`;
        const resp = await fetch(url, { headers });
        if (resp.ok) {
          const rows = await resp.json();
          const activeCount = Array.isArray(rows) ? rows.length : 0;
          console.log(`🛡️ [LIMIT CHECK] Viajes inmediatos activos: ${activeCount}/${MAX_ACTIVE_IMMEDIATE_TRIPS}`);
          if (activeCount >= MAX_ACTIVE_IMMEDIATE_TRIPS) {
            setAlertType('warning');
            setAlertTitle('Límite de viajes alcanzado');
            setAlertMessage(
              `Solo puedes tener ${MAX_ACTIVE_IMMEDIATE_TRIPS} viajes inmediatos activos al mismo tiempo. ` +
              `Actualmente tienes ${activeCount}. Finaliza o cancela uno para solicitar otro.`
            );
            setAlertButtons([
              { text: 'Ver mis viajes', onPress: () => { setAlertVisible(false); navigation.navigate('Notifications'); } },
              { text: 'Entendido', onPress: () => setAlertVisible(false) },
            ]);
            setAlertVisible(true);
            setIsButtonDisabled(false);
            return;
          }
        } else {
          console.warn('⚠️ [LIMIT CHECK] No se pudo validar el límite, continuando:', resp.status);
        }
      } catch (e: any) {
        console.warn('⚠️ [LIMIT CHECK] Error al validar límite, continuando:', e?.message || e);
      }
    }

    console.log("\n✅✅✅ TODOS LOS CAMPOS VALIDADOS ✅✅✅");
    
    try {
      // Generar OTP
      console.log("\n🔐 ══════════════════════════════════════");
      console.log("🔐 GENERANDO OTP...");
      const generatedOtp = OtpService.generateOtp();
      console.log("🔐 OTP GENERADO:", generatedOtp);
      console.log("🔐 ══════════════════════════════════════\n");
      
      // Actualizar estado
      setOtp(generatedOtp);
      console.log("✅ State actualizado con OTP");
      
      // Mostrar modal
      console.log("📲 [OTP MODAL] Abriendo modal...");
      setShowOtpModal(true);
      console.log("📲 [OTP MODAL] Modal debería estar VISIBLE ahora en pantalla");
      
      // Guardar booking temporal.
      // `fareDetails` viene de getPrice/handleSelectVehicle con FareCalculator
      // (min_fare aplicado, margen 25%). Si no se calculó tarifa, usar 0.
      const fd = fareDetails || { estimateFare: 0, clientFare: 0, totalCost: 0, convenienceFees: 0, driverShare: 0 };

      pendingBookingRef.current = {
        bookLater: isScheduled,
        bookingDate: new Date().getTime(),
        carImage: selectedVehicle?.carImage || "TREAS-X",
        carType: selectedVehicle?.name || "TREAS-X",
        commission_rate: selectedVehicle?.convenience_fees || "0",
        convenience_fees: fd.convenienceFees,
        tollsCost: "No contiene",
        drop: {
          lat: destination.latitude,
          lng: destination.longitude,
          add: destination.title || "Dirección no disponible",
        },
        pickup: {
          lat: origin.latitude,
          lng: origin.longitude,
          add: origin.title || "Dirección no disponible",
      },
      pickupAddress: origin.title || "Dirección no disponible",
      dropAddress: destination.title || "Dirección no disponible",
      customer: user.id || "",
      customer_contact: user.mobile || "",
      customer_email: user.email || "",
      customer_image: user.profile_image || "",
      customer_name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      customer_token: user.push_token || "",
      customer_status: `${user.id || ""}_NEW`,
      customer_city: user.city || "",
      distance: distance || 0,
      // estimate = máximo esperado del rango (valorCliente). El cobro inicial
      // (trip_cost/driver_share) es el mínimo (totalConductor). Sistema puede
      // ajustar al finalizar el servicio real dentro del rango [min, max].
      estimate: fd.clientFare,
      estimateDistance: distance || 0,
      estimateTime: duration || 0,
      // OTP de self-confirm del cliente: se usa solo en el modal local
      // (state `otp`). NO se persiste en bookings.otp — esa columna es del
      // OTP conductor↔cliente que el conductor genera cuando confirma llegada
      // en ReservationTripScreen. Persistir el self-confirm aquí causaba
      // desincronización: al llegar, el conductor pisaba el OTP viejo con
      // uno nuevo y el cliente seguía viendo el viejo cacheado.
      payment_mode: selectedPaymentType || "cash",
      driver_share: fd.driverShare,
      reference: [...Array(6)].map(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join(""),
      driverEstimates: {},
      status: "NEW",
      tripType: tripType,
      tripUrban: "Urbano",
      trip_cost: fd.totalCost,
      // Piso de cobro capturado al momento de reservar — usado por el trigger
      // SQL `calculate_total_cost` para que un descuento/promo no deje
      // total_cost por debajo del mínimo de la categoría. Ver migración
      // `min_fare_snapshot` en [[22-plan-fix-bug-min-fare]].
      min_fare_snapshot: selectedVehicle?.min_fare || 0,
      tripdate: isScheduled ? date : new Date().getTime(),
      cost_corp: 0,
      company: "",
      observations: observations,
      requestedDrivers: selectedDriver ? { [selectedDriver.driver]: true } : {},
      // Promo / descuento: antes no se persistían y la UI mentía al cliente.
      discount: promoDiscount || 0,
      promo_applied: !!selectedPromo,
      promo_code: selectedPromo?.promo_code || null,
      promo_details: selectedPromo || null,
    };
    
    console.log("✅ Booking temporal guardado en memoria");
    setIsButtonDisabled(false);
    
    } catch (error: any) {
      console.error("❌ [ERROR] Exception en handleBookNowPress:", error.message);
      setIsButtonDisabled(false);
    }
  };

  // Manejar validación OTP
  const handleOtpMatch = async (isMatch: any) => {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("🔐 [OTP VALIDATION] Usuario ingresó código OTP");
    console.log("════════════════════════════════════════════════════════════");
    console.log("🔐 isMatch:", isMatch);
    console.log("🔐 OTP en estado:", otp);
    
    setShowOtpModal(false);
    
    if (!isMatch) {
      console.log("❌ [OTP VALIDATION] OTP INCORRECTO");
      console.log("   El código ingresado NO coincide con el generado");
      setAlertType('error');
      setAlertTitle('OTP incorrecto');
      setAlertMessage('El código ingresado no es válido. Intenta de nuevo.');
      setAlertButtons([{ text: 'OK', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
      setIsButtonDisabled(false);
      return;
    }
    
    console.log("\n✅✅✅ [OTP VALIDATION] OTP CORRECTO ✅✅✅");
    console.log("✅ Proceediendo con guardar reserva...");
    setOtpValidated(true);
    
    const bookingObject = pendingBookingRef.current;
    console.log("✅ bookingObject recuperado:", bookingObject ? "✅ Existe" : "❌ Es null/undefined");
    
    if (!bookingObject) {
      console.log("❌ [BOOKING ERROR] bookingObject es vacío");
      setAlertType('error');
      setAlertTitle('Error');
      setAlertMessage('No se pudo recuperar los datos de la reserva.');
      setAlertButtons([{ text: 'OK', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
      setIsButtonDisabled(false);
      return;
    }
    
    try {
      console.log("💾 [SAVING BOOKING] Guardando booking en Supabase...");
      const result = await saveBooking(bookingObject);
      console.log("💾 [SAVE RESULT]:", result);
      
      if (result.success) {
        console.log("✅ [BOOKING SAVED] ID:", result.uid);
        // NO llamamos OtpService.saveOtp aquí. El OTP conductor↔cliente lo
        // genera y persiste ReservationTripScreen cuando el conductor confirma
        // llegada. Antes esta línea seteaba otp_generated_at=NOW sin OTP real,
        // marcando el booking como "OTP en curso" antes de tiempo y causando
        // desincronización con el OTP posterior del conductor.

        const bookingWithUid = { ...bookingObject, id: result.uid };
        console.log("✅ [NAVIGATION] Navegando a pantalla Booking...");
        setIsButtonDisabled(false);
        navigation.navigate('Booking', { booking: bookingWithUid });
      } else {
        console.log("❌ [BOOKING SAVE FAILED] result.success es false");
        setAlertType('error');
        setAlertTitle('Error');
        setAlertMessage('No se pudo crear la reserva. Inténtalo de nuevo.');
        setAlertButtons([{ text: 'OK', onPress: () => setAlertVisible(false) }]);
        setAlertVisible(true);
        setIsButtonDisabled(false);
      }
    } catch (error: any) {
      console.error("❌ [BOOKING ERROR] Exception:", error.message);
      console.error("   Stack:", error.stack);
      setAlertType('error');
      setAlertTitle('Error');
      setAlertMessage('Ocurrió un error al guardar la reserva. ' + error.message);
      setAlertButtons([{ text: 'OK', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
      setIsButtonDisabled(false);
    }
  };

  const handleCarDetails = () => {
    setIsVehicleModalVisible(true);
  };

  const handlePayment = useCallback(() => {
    if (bottomSheetModalRef.current && typeof bottomSheetModalRef.current.present === 'function') {
      bottomSheetModalRef.current.present();
    }
  }, []);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      if (bottomSheetModalRef.current && typeof bottomSheetModalRef.current.dismiss === 'function') {
        bottomSheetModalRef.current.dismiss(); // Cierra el BottomSheet cuando se baja
      }
    }
  }, []);
  const openBottomSheet = useCallback(() => {
    if (bottomSheetModalRef.current && typeof bottomSheetModalRef.current.present === 'function') {
      bottomSheetModalRef.current.present();
    }
  }, []);
  useEffect(() => {
    // Espera a que el modal esté montado antes de intentar abrirlo
    const timer = setTimeout(() => {
      openBottomSheet();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    handlePayment();
  }, []);

  const applyPromo = (promo: any) => {
    // Aquí aplicamos el descuento de la promoción
    const discount = promo.discount; // Asumimos que el objeto promo tiene un campo `discount`
    setPromoDiscount(discount);
    setSelectedPromo(promo); // Guarda la promoción seleccionada
  };

  // roundPrice ahora importado desde hooks/roundPrice

  if (!origin || !destination) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={48} color="#ccc" />
          <Text style={styles.emptyStateText}>Por favor, selecciona origen y destino.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* === MAPA === */}
      <View style={styles.mapSection}>
        <MapContainer
          origin={origin}
          destination={destination}
          colorScheme={colorScheme}
          useFallbackMap={useFallbackMap}
          setUseFallbackMap={setUseFallbackMap}
          cameraRef={cameraRef}
        />
      </View>

      {/* === OVERLAY: Botón volver + tarjeta de dirección === */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>

        <View style={styles.addressCard}>
          <View style={styles.addressDots}>
            <View style={[styles.dot, { backgroundColor: '#00d4d7' }]} />
            <View style={styles.dotLine} />
            <View style={[styles.dot, { backgroundColor: '#E91E63' }]} />
          </View>
          <View style={styles.addressTexts}>
            <Text style={styles.addressText} numberOfLines={1}>
              {origin.title || 'Origen'}
            </Text>
            <View style={styles.addressDivider} />
            <Text style={styles.addressText} numberOfLines={1}>
              {destination.title || 'Destino'}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()}>
            <Text style={styles.changeText}>Cambiar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* === CONDUCTORES VIENDO TU SOLICITUD === */}
      {nearbyDrivers.length > 0 && (
        <View style={styles.driversViewingCard} pointerEvents="box-none">
          <View style={styles.driversViewingInner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.driversViewingText}>
                Conductores viendo tu solicitud: <Text style={styles.driversViewingCount}>{nearbyDrivers.length}</Text>
              </Text>
            </View>
            <View style={styles.driversAvatarRow}>
              {nearbyDrivers.slice(0, 4).map((driver, i) => (
                <View key={i} style={[styles.driverAvatarCircle, { marginLeft: i > 0 ? -10 : 0, zIndex: 10 - i }]}>
                  {driver.driver_image ? (
                    <Image source={{ uri: driver.driver_image }} style={styles.driverAvatarImg} />
                  ) : (
                    <Ionicons name="person" size={16} color="#fff" />
                  )}
                </View>
              ))}
              {nearbyDrivers.length > 4 && (
                <View style={[styles.driverAvatarCircle, { marginLeft: -10, backgroundColor: '#00d4d7' }]}>  
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>+{nearbyDrivers.length - 4}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* === BOTTOM SHEET === */}
      <BottomSheetModalProvider>
        <BottomSheetModal
          ref={bottomSheetModalRef}
          index={1}
          snapPoints={snapPoints}
          onChange={handleSheetChanges}
          enablePanDownToClose={false}
          handleStyle={styles.sheetHandle}
          handleIndicatorStyle={styles.sheetIndicator}
          backgroundStyle={styles.sheetBackground}
        >
          <View style={styles.sheetContent}>
            {/* === LISTA DE VEHÍCULOS (inline, no modal) === */}
            <FlatList
              data={[{ key: 'vehicles' }]}
              keyExtractor={(item) => item.key}
              showsVerticalScrollIndicator={false}
              renderItem={() => (
                <View>
                  {/* Tipo de viaje - chips */}
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, immediatePickup && styles.chipActive]}
                      onPress={() => { setImmediatePickup(true); setScheduleRide(false); setIsScheduled(false); }}
                    >
                      <Ionicons name="flash" size={14} color={immediatePickup ? '#fff' : '#666'} />
                      <Text style={[styles.chipText, immediatePickup && styles.chipTextActive]}>Inmediato</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, scheduleRide && styles.chipActive]}
                      onPress={() => { setImmediatePickup(false); setScheduleRide(true); showDatePicker(); }}
                    >
                      <Ionicons name="calendar-outline" size={14} color={scheduleRide ? '#fff' : '#666'} />
                      <Text style={[styles.chipText, scheduleRide && styles.chipTextActive]}>Programar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, isSoloIdaActive && styles.chipActive]}
                      onPress={() => { setIsSoloIdaActive(true); setIsIdaYVueltaActive(false); setTripType("Solo Ida"); }}
                    >
                      <Text style={[styles.chipText, isSoloIdaActive && styles.chipTextActive]}>Solo Ida</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, isIdaYVueltaActive && styles.chipActive]}
                      onPress={() => { setIsIdaYVueltaActive(true); setIsSoloIdaActive(false); setTripType("Ida y Vuelta"); }}
                    >
                      <Text style={[styles.chipText, isIdaYVueltaActive && styles.chipTextActive]}>Ida y Vuelta</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Lista de vehículos */}
                  {renderTaxiOptions()}

                  {/* === AJUSTE DE PRECIO === */}
                  {selectedVehicle && (
                    <View style={styles.priceAdjustContainer}>
                      {promoDiscount > 0 && (
                        <Text style={styles.priceDiscountLabel}>
                          Descuento de <Text style={{ color: '#00d4d7', fontWeight: '700' }}>${roundPrice(promoDiscount).toLocaleString()}</Text> en tu tarifa propuesta
                        </Text>
                      )}
                      <View style={styles.priceAdjustRow}>
                        <TouchableOpacity
                          style={styles.priceAdjustBtn}
                          activeOpacity={0.7}
                          onPress={() => { setPriceAdjustment(prev => prev - 500); setPriceConfirmed(false); }}
                        >
                          <Text style={styles.priceAdjustBtnText}>-500</Text>
                        </TouchableOpacity>
                        <View style={styles.priceAdjustCenter}>
                          <Text style={styles.priceAdjustValue}>
                            ${roundPrice(getVehiclePrice(selectedVehicle) + priceAdjustment - promoDiscount).toLocaleString()}
                          </Text>
                          <Ionicons name="pencil-outline" size={14} color="#999" style={{ marginLeft: 4 }} />
                        </View>
                        <TouchableOpacity
                          style={styles.priceAdjustBtn}
                          activeOpacity={0.7}
                          onPress={() => { setPriceAdjustment(prev => prev + 500); setPriceConfirmed(false); }}
                        >
                          <Text style={styles.priceAdjustBtnText}>+500</Text>
                        </TouchableOpacity>
                      </View>
                      {fareDetails && (
                        <Text style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 6, fontStyle: 'italic' }}>
                          Cobro inicial estimado. Puede ajustarse al finalizar el servicio.
                          {'\n'}Rango: ${roundPrice(fareDetails.totalCost).toLocaleString()} – ${roundPrice(fareDetails.clientFare).toLocaleString()}
                        </Text>
                      )}
                      {priceAdjustment !== 0 && !priceConfirmed && (
                        <TouchableOpacity
                          style={styles.confirmAdjustBtn}
                          activeOpacity={0.85}
                          onPress={() => setPriceConfirmed(true)}
                        >
                          <Text style={styles.confirmAdjustBtnText}>Confirmar aumento</Text>
                        </TouchableOpacity>
                      )}
                      {priceConfirmed && (
                        <Text style={styles.priceConfirmedText}>
                          ✓ Precio ajustado confirmado
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Observaciones */}
                  <TextInput
                    style={styles.observationsInput}
                    placeholder="Añadir observaciones (opcional)"
                    placeholderTextColor="#aaa"
                    onChangeText={setObservations}
                    value={observations}
                  />
                </View>
              )}
            />

            {/* === FOOTER FIJO: Pago + Botones === */}
            <View style={styles.sheetFooter}>
              {/* Promo badge */}
              {selectedPromo && (
                <View style={styles.promoBadge}>
                  <Ionicons name="pricetag" size={14} color="#00d4d7" />
                  <Text style={styles.promoBadgeText}>
                    {selectedPromo.promo_code} -${roundPrice(parseFloat(selectedPromo.max_promo_discount_value || 0)).toLocaleString()}
                  </Text>
                </View>
              )}

              {/* Payment row */}
              <View style={styles.paymentRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.paymentSelector}
                  onPress={() => setShowPaymentModal(true)}
                >
                  <Ionicons
                    name={selectedPaymentType === 'cash' ? 'cash-outline' : selectedPaymentType === 'wallet' ? 'wallet-outline' : 'card-outline'}
                    size={20}
                    color="#00d4d7"
                  />
                  <Text style={styles.paymentLabel}>
                    {paymentTypes.find((t) => t.value === selectedPaymentType)?.label || "Efectivo"}
                  </Text>
                  <AntDesign name="right" size={14} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.promoBtn}
                  onPress={handleShowPromoModal}
                >
                  <Ionicons name="pricetag-outline" size={16} color="#00d4d7" />
                  <Text style={styles.promoBtnText}>Promo</Text>
                </TouchableOpacity>
              </View>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.mainButton, !selectedVehicle && styles.mainButtonDisabled]}
                  onPress={() => {
                    console.log("🔵 [UI] Botón 'Solicitar Viaje' presionado");
                    console.log("   - isButtonDisabled:", isButtonDisabled);
                    console.log("   - selectedVehicle:", selectedVehicle?.name);
                    handleBookNowPress();
                  }}
                  disabled={isButtonDisabled || !selectedVehicle}
                >
                  <Text style={styles.mainButtonText}>
                    {isButtonDisabled ? 'Procesando...' : 'Solicitar Viaje'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.secondaryButton}
                  onPress={() => {
                    if (!selectedVehicle || !origin || !destination) {
                      showAlert('warning', 'Campos faltantes', 'Selecciona vehículo, origen y destino antes de reservar.');
                      return;
                    }
                    const distKm = typeof distance === 'number' ? distance : parseFloat(distance as any) || 0;
                    const durMin = typeof duration === 'number' ? duration : parseFloat(duration as any) || 0;
                    const mult = tripType === 'Ida y Vuelta' ? 2 : 1;
                    const isAirportNav = detectAirport();
                    const isIntermunicipal = distKm > (selectedVehicle?.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);
                    // Recalcula con FareCalculator (fuente única) en vez de sumar deltas ad-hoc:
                    // fareDetails.estimateFare ya incluye delta aeropuerto/programado, sumarlos
                    // de nuevo aquí duplicaba el recargo. Ver [[21-calculo-tarifa]].
                    const { totalCost, clientTotal } = FareCalculator(
                      distKm * mult,
                      durMin * 60 * mult,
                      selectedVehicle,
                      null,
                      2,
                      { isAirport: isAirportNav, isScheduled, isIntermunicipal }
                    );
                    navigation.navigate('CreateReservation', {
                      origin, destination, distance, duration,
                      driverPrice: totalCost, clientPrice: clientTotal,
                      carType: selectedVehicle?.name || '',
                    });
                  }}
                >
                  <Ionicons name="calendar" size={18} color="#00d4d7" />
                  <Text style={styles.secondaryButtonText}>Reservar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </BottomSheetModal>
      </BottomSheetModalProvider>

      {/* === MODALES === */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="datetime"
        locale="es_ES"
        onConfirm={handleConfirm}
        onCancel={hideDatePicker}
        isDarkModeEnabled={true}
        cancelTextIOS="Cancelar"
        confirmTextIOS="Confirmar Fecha"
        minimumDate={new Date()}
      />

      <Modal visible={successModalVisible} transparent animationType="fade" onRequestClose={() => setSuccessModalVisible(false)}>
        <View style={styles.overlayCenter}>
          <Animated.View style={[styles.toastBox, { opacity: fadeAnim }]}>
            <Ionicons name="close-circle" size={40} color="#E91E63" />
            <Text style={styles.toastText}>{errorMessage}</Text>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={isPromoModalVisible} transparent animationType="slide" onRequestClose={handleClosePromoModal}>
        <View style={styles.overlayCenter}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Promociones Disponibles</Text>
            <PromoComp promotions={promotions} onPressButton={applyPromo} />
            <TouchableOpacity onPress={handleClosePromoModal} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={styles.overlayCenter}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Selecciona tipo de pago</Text>
            <FlatList
              data={paymentTypes}
              keyExtractor={(item) => item.value}
              renderItem={({ item, index }) => (
                <Animatable.View animation="fadeInUp" duration={350} delay={index * 50} useNativeDriver>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.paymentModalOption, selectedPaymentType === item.value && styles.paymentModalOptionActive]}
                    onPress={() => handleSelectPaymentType(item.value)}
                  >
                    <Ionicons
                      name={item.value === 'cash' ? 'cash-outline' : item.value === 'wallet' ? 'wallet-outline' : 'card-outline'}
                      size={22}
                      color={selectedPaymentType === item.value ? '#00d4d7' : '#666'}
                    />
                    <Text style={[styles.paymentModalText, selectedPaymentType === item.value && { color: '#00d4d7' }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                </Animatable.View>
              )}
            />
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowPaymentModal(false)}>
              <Text style={styles.modalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isDriverModalVisible} transparent animationType="slide" onRequestClose={() => setIsDriverModalVisible(false)}>
        <View style={styles.overlayCenter}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Selecciona un Conductor</Text>
            {drivers.length > 0 ? renderDriverList() : (
              <Text style={styles.vehicleSubtext}>No hay conductores disponibles en este momento.</Text>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: '#eee', flex: 1, marginRight: 8 }]} onPress={() => setIsDriverModalVisible(false)}>
                <Text style={[styles.modalCloseBtnText, { color: '#333' }]}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { flex: 1, marginLeft: 8, opacity: isButtonDisabled ? 0.5 : 1 }]}
                onPress={handleBookNowPress}
                disabled={isButtonDisabled}
              >
                <Text style={styles.modalCloseBtnText}>Solicitar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <OtpModal
        modalVisible={showOtpModal}
        otp={otp}
        onMatch={handleOtpMatch}
        requestModalClose={() => setShowOtpModal(false)}
      />

      <CustomAlert
        visible={alertVisible}
        type={alertType}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onDismiss={() => setAlertVisible(false)}
      />

      {/* 🔐 OTP System Debug Panel - para depuración */}
      <OTPSystemDebug
        selectedVehicle={selectedVehicle}
        origin={origin}
        destination={destination}
        distance={distance || 0}
        duration={duration || 0}
        otp={otp}
        showOtpModal={showOtpModal}
        taxiOptions={taxiOptions}
        user={user}
        selectedPaymentType={selectedPaymentType}
      />

      {/* BOTÓN FLOTANTE GLOBAL - SIEMPRE VISIBLE */}
      <TouchableOpacity
        activeOpacity={0.75}
        style={[
          styles.floatingButton,
          {
            backgroundColor: !selectedVehicle ? '#E91E63' : '#00E5FF',
            opacity: isButtonDisabled ? 0.5 : 1,
          },
        ]}
        onPress={() => {
          console.log('\n🎯 ═══════════════════════════════════════════════════════════');
          console.log('🎯 🚨 BOTÓN FLOTANTE PRESIONADO 🚨');
          console.log('🎯 Estado actual:');
          console.log('   • selectedVehicle:', selectedVehicle?.name || 'NADA SELECCIONADO');
          console.log('   • origin:', origin?.title || 'NADA');
          console.log('   • destination:', destination?.title || 'NADA');
          console.log('   • selectedPaymentType:', selectedPaymentType || 'NADA');
          console.log('   • isButtonDisabled:', isButtonDisabled);
          console.log('🎯 ═══════════════════════════════════════════════════════════\n');
          if (!selectedVehicle) {
            console.log('❌ NO PUEDES hacer clic - FALTA SELECCIONAR VEHÍCULO');
            console.log('   1. Desplázate hacia el MAPA (hacia arriba)');
            console.log('   2. Mira la lista de vehículos');
            console.log('   3. TAP/TOCA una tarjeta de vehículo');
            console.log('   4. Este botón debería verde y decir "SOLICITAR"');
            return;
          }
          if (isButtonDisabled) {
            console.log('❌ NO PUEDES hacer clic - BOTÓN ESTÁ DESHABILITADO');
            return;
          }
          handleBookNowPress();
        }}
        disabled={isButtonDisabled && !!selectedVehicle}
      >
        <Text style={styles.floatingButtonText}>
          {!selectedVehicle
            ? '⚠️ TAP ARRIBA EN VEHÍCULO'
            : isButtonDisabled
            ? '⏳ PROCESANDO...'
            : '✅ SOLICITAR VIAJE'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ═══════════════════════════════════════════════
// ESTILOS
// ═══════════════════════════════════════════════

const lightStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
  },
  // Map
  mapSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 12,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  addressDots: {
    alignItems: 'center',
    marginRight: 10,
    height: 44,
    justifyContent: 'space-between',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#ddd',
    marginVertical: 2,
  },
  addressTexts: {
    flex: 1,
  },
  addressText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  addressDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 6,
  },
  changeText: {
    fontSize: 13,
    color: '#00d4d7',
    fontWeight: '600',
    marginLeft: 8,
  },
  // Drivers viewing card
  driversViewingCard: {
    position: 'absolute',
    bottom: '45%',
    left: 16,
    right: 16,
    zIndex: 9,
  },
  driversViewingInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  driversViewingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
  },
  driversViewingCount: {
    color: '#00d4d7',
    fontWeight: '800',
  },
  driversAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  driverAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  driverAvatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  // Price adjustment
  priceAdjustContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  priceDiscountLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
  },
  priceAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  priceAdjustBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  priceAdjustBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  priceAdjustCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceAdjustValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#222',
  },
  confirmAdjustBtn: {
    marginTop: 12,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  confirmAdjustBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#aaa',
  },
  priceConfirmedText: {
    marginTop: 10,
    fontSize: 13,
    color: '#00d4d7',
    fontWeight: '600',
  },
  // Bottom Sheet
  sheetHandle: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetIndicator: {
    backgroundColor: '#ddd',
    width: 36,
    height: 4,
  },
  sheetBackground: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    gap: 4,
  },
  chipActive: {
    backgroundColor: '#00d4d7',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  chipTextActive: {
    color: '#fff',
  },
  // Vehicle rows
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  vehicleRowSelected: {
    backgroundColor: 'rgba(0, 212, 215, 0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#00d4d7',
  },
  vehicleImage: {
    width: 72,
    height: 52,
    resizeMode: 'contain',
    marginRight: 14,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  vehicleSubtext: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  vehiclePriceContainer: {
    alignItems: 'flex-end',
  },
  vehiclePrice: {
    fontSize: 17,
    fontWeight: '800',
    color: '#222',
  },
  vehicleDiscount: {
    fontSize: 12,
    color: '#00d4d7',
    fontWeight: '600',
    marginTop: 2,
  },
  // Observations
  observationsInput: {
    marginHorizontal: 16,
    marginVertical: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  // Sheet footer
  sheetFooter: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#fff',
  },
  promoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 215, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    gap: 4,
  },
  promoBadgeText: {
    fontSize: 12,
    color: '#00d4d7',
    fontWeight: '600',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  paymentSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f6f6f6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
  },
  paymentLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  promoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f6f6f6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 6,
  },
  promoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mainButton: {
    flex: 2,
    backgroundColor: '#00d4d7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00d4d7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mainButtonDisabled: {
    backgroundColor: '#b0e8e9',
    shadowOpacity: 0,
    elevation: 0,
  },
  mainButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fafa',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#00d4d7',
    paddingVertical: 16,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#00d4d7',
  },
  // Modals
  overlayCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  toastBox: {
    width: 240,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
    elevation: 10,
  },
  toastText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '88%',
    maxHeight: '75%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalBoxTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
  },
  modalCloseBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: '#00d4d7',
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  paymentModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#f8f8f8',
    gap: 12,
    width: '100%',
  },
  paymentModalOptionActive: {
    backgroundColor: 'rgba(0, 212, 215, 0.08)',
    borderWidth: 1,
    borderColor: '#00d4d7',
  },
  paymentModalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  // Driver list
  driverItem: {
    padding: 14,
    marginVertical: 4,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  driverName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  noDriversText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
  // Legacy compat
  estimateText: {
    fontSize: 16,
    color: '#333',
  },
  paymentText: {
    fontSize: 14,
    color: '#666',
  },
  input: {
    width: '100%',
    height: 44,
    borderColor: '#e8e8e8',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#333',
  },
  bookNow: {
    backgroundColor: '#00d4d7',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  promoButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  successModalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  successModalView: { width: 240, padding: 24, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center' },
  successModalText: { color: '#333', fontSize: 15, fontWeight: '600', marginTop: 10 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalContainer: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%', maxHeight: '70%', alignItems: 'center' },
  modalContent: { flex: 1, alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  modalHeader: { width: '100%', alignItems: 'center', margin: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#00d4d7' },
  closeButton: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#00d4d7', borderRadius: 8 },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 10, width: '100%' },
  optionText: { fontSize: 16, color: '#333' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
  optionButton: { flex: 1, padding: 10, marginHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  activeButton: { backgroundColor: '#e0fafa', borderWidth: 1, borderColor: '#00d4d7' },
  inactiveButton: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd' },
  optionButtonText: { fontSize: 14, fontWeight: '600' },
  activeButtonText: { color: '#00d4d7' },
  inactiveButtonText: { color: '#999' },
  taxiOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8, backgroundColor: '#f8f8f8' },
  selectedTaxiOption: { borderColor: '#00d4d7', borderWidth: 2 },
  taxiIcon: { height: 60, width: 60, resizeMode: 'contain', marginRight: 10 },
  optionDetails: { flex: 1 },
  taxiType: { fontSize: 16, fontWeight: '700', color: '#222' },
  taxiInfo: { fontSize: 13, color: '#888' },
  taxiPrice: { fontSize: 15, fontWeight: '700', color: '#222' },
  paymentOption: { paddingVertical: 14, paddingHorizontal: 16, borderBottomColor: '#f0f0f0', borderBottomWidth: 1 },
  paymentOptionText: { fontSize: 16, color: '#00d4d7' },
  paymentList: { width: '100%', marginBottom: 16 },
  glassOrbTop: { display: 'none' },
  glassOrbBottom: { display: 'none' },
  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  floatingButton: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 999,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  floatingButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#051A26',
    letterSpacing: 1,
    textAlign: 'center',
  },
});

const darkStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  mapSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20,20,20,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,20,0.9)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addressDots: {
    alignItems: 'center',
    marginRight: 10,
    height: 44,
    justifyContent: 'space-between',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#333',
    marginVertical: 2,
  },
  addressTexts: { flex: 1 },
  addressText: { fontSize: 13, color: '#ddd', fontWeight: '500' },
  addressDivider: { height: 1, backgroundColor: '#333', marginVertical: 6 },
  changeText: { fontSize: 13, color: '#00d4d7', fontWeight: '600', marginLeft: 8 },
  // Drivers viewing card
  driversViewingCard: { position: 'absolute', bottom: '45%', left: 16, right: 16, zIndex: 9 },
  driversViewingInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  driversViewingText: { fontSize: 15, fontWeight: '700', color: '#eee' },
  driversViewingCount: { color: '#00d4d7', fontWeight: '800' },
  driversAvatarRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
  driverAvatarCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1a1a1a', overflow: 'hidden' },
  driverAvatarImg: { width: 34, height: 34, borderRadius: 17 },
  // Price adjustment
  priceAdjustContainer: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#222' },
  priceDiscountLabel: { fontSize: 13, color: '#888', marginBottom: 10, textAlign: 'center' },
  priceAdjustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  priceAdjustBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#333' },
  priceAdjustBtnText: { fontSize: 15, fontWeight: '700', color: '#ddd' },
  priceAdjustCenter: { flexDirection: 'row', alignItems: 'center' },
  priceAdjustValue: { fontSize: 26, fontWeight: '800', color: '#eee' },
  confirmAdjustBtn: { marginTop: 12, backgroundColor: '#2a2a2a', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 },
  confirmAdjustBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },
  priceConfirmedText: { marginTop: 10, fontSize: 13, color: '#00d4d7', fontWeight: '600' },
  sheetHandle: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetIndicator: { backgroundColor: '#444', width: 36, height: 4 },
  sheetBackground: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetContent: { flex: 1, backgroundColor: '#1a1a1a' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#2a2a2a', gap: 4 },
  chipActive: { backgroundColor: '#00d4d7' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#888' },
  chipTextActive: { color: '#fff' },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  vehicleRowSelected: { backgroundColor: 'rgba(0, 212, 215, 0.08)', borderLeftWidth: 3, borderLeftColor: '#00d4d7' },
  vehicleImage: { width: 72, height: 52, resizeMode: 'contain', marginRight: 14 },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 16, fontWeight: '700', color: '#eee' },
  vehicleSubtext: { fontSize: 13, color: '#777', marginTop: 2 },
  vehiclePriceContainer: { alignItems: 'flex-end' },
  vehiclePrice: { fontSize: 17, fontWeight: '800', color: '#eee' },
  vehicleDiscount: { fontSize: 12, color: '#00d4d7', fontWeight: '600', marginTop: 2 },
  observationsInput: { marginHorizontal: 16, marginVertical: 12, height: 44, borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingHorizontal: 14, fontSize: 14, color: '#ddd', backgroundColor: '#222' },
  sheetFooter: { borderTopWidth: 1, borderTopColor: '#222', paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 16, backgroundColor: '#1a1a1a' },
  promoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,215,0.12)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8, gap: 4 },
  promoBadgeText: { fontSize: 12, color: '#00d4d7', fontWeight: '600' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  paymentSelector: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, gap: 8 },
  paymentLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#ddd' },
  promoBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, gap: 6 },
  promoBtnText: { fontSize: 13, fontWeight: '600', color: '#ddd' },
  actionRow: { flexDirection: 'row', gap: 10 },
  mainButton: { flex: 2, backgroundColor: '#00d4d7', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  mainButtonDisabled: { backgroundColor: 'rgba(0,212,215,0.3)' },
  mainButtonText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  secondaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,212,215,0.08)', borderRadius: 12, borderWidth: 1.5, borderColor: '#00d4d7', paddingVertical: 16, gap: 6 },
  secondaryButtonText: { fontSize: 15, fontWeight: '700', color: '#00d4d7' },
  overlayCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  toastBox: { width: 240, padding: 24, backgroundColor: '#1a1a1a', borderRadius: 16, alignItems: 'center' },
  toastText: { color: '#ddd', fontSize: 15, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  modalBox: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, width: '88%', maxHeight: '75%', alignItems: 'center' },
  modalBoxTitle: { fontSize: 17, fontWeight: '700', color: '#eee', marginBottom: 16 },
  modalCloseBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 28, backgroundColor: '#00d4d7', borderRadius: 10, alignItems: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  paymentModalOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginBottom: 6, backgroundColor: '#222', gap: 12, width: '100%' },
  paymentModalOptionActive: { backgroundColor: 'rgba(0,212,215,0.12)', borderWidth: 1, borderColor: '#00d4d7' },
  paymentModalText: { fontSize: 16, fontWeight: '600', color: '#ddd' },
  driverItem: { padding: 14, marginVertical: 4, backgroundColor: '#222', borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  driverName: { fontSize: 15, color: '#ddd', fontWeight: '500' },
  noDriversText: { fontSize: 14, color: '#666', textAlign: 'center', padding: 20 },
  estimateText: { fontSize: 16, color: '#ddd' },
  paymentText: { fontSize: 14, color: '#888' },
  input: { width: '100%', height: 44, borderColor: '#333', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 14, color: '#ddd' },
  bookNow: { backgroundColor: '#00d4d7', borderRadius: 10, padding: 14, alignItems: 'center' },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  promoButtonText: { color: '#ddd', fontSize: 14, fontWeight: '600' },
  successModalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  successModalView: { width: 240, padding: 24, backgroundColor: '#1a1a1a', borderRadius: 14, alignItems: 'center' },
  successModalText: { color: '#ddd', fontSize: 15, fontWeight: '600', marginTop: 10 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContainer: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, width: '85%', maxHeight: '70%', alignItems: 'center' },
  modalContent: { flex: 1, alignItems: 'center', padding: 20, backgroundColor: '#1a1a1a' },
  modalHeader: { width: '100%', alignItems: 'center', margin: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#00d4d7' },
  closeButton: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#00d4d7', borderRadius: 8 },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 10, width: '100%' },
  optionText: { fontSize: 16, color: '#ddd' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
  optionButton: { flex: 1, padding: 10, marginHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  activeButton: { backgroundColor: 'rgba(0,212,215,0.12)', borderWidth: 1, borderColor: '#00d4d7' },
  inactiveButton: { backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  optionButtonText: { fontSize: 14, fontWeight: '600' },
  activeButtonText: { color: '#00d4d7' },
  inactiveButtonText: { color: '#666' },
  taxiOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8, backgroundColor: '#222' },
  selectedTaxiOption: { borderColor: '#00d4d7', borderWidth: 2 },
  taxiIcon: { height: 60, width: 60, resizeMode: 'contain', marginRight: 10 },
  optionDetails: { flex: 1 },
  taxiType: { fontSize: 16, fontWeight: '700', color: '#eee' },
  taxiInfo: { fontSize: 13, color: '#777' },
  taxiPrice: { fontSize: 15, fontWeight: '700', color: '#eee' },
  paymentOption: { paddingVertical: 14, paddingHorizontal: 16, borderBottomColor: '#222', borderBottomWidth: 1 },
  paymentOptionText: { fontSize: 16, color: '#00d4d7' },
  paymentList: { width: '100%', marginBottom: 16 },
  glassOrbTop: { display: 'none' },
  glassOrbBottom: { display: 'none' },
  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  floatingButton: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 999,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  floatingButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
    textAlign: 'center',
  },
});

export default BookingScreen;

