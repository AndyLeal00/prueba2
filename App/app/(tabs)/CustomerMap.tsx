import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Image,
  StatusBar,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  useColorScheme,
  Linking,  // Importamos useColorScheme para detectar el modo

} from "react-native";
import Mapbox, { MapboxStyles, GYROSCOPE_CONFIG } from '@/config/MapboxConfig';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from "expo-location";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootState, AppDispatch } from "@/common/store";
import { useSelector } from "react-redux";
import {
  listenToSettingsChanges, 
  selectSettings,
} from "@/common/reducers/settingsSlice";
import { useDispatch } from "react-redux";
import { fetchPromos } from "@/common/actions/promoactions";
import { debounce } from "lodash"; // Importa debounce
import { useFocusEffect, useNavigation } from "@react-navigation/native"; // Importa useFocusEffect y useNavigation
import { API_KEY, getMapboxAccessToken } from '@/config/AppConfig'; // Asegúrate de importar la clave API
import { Ionicons } from "@expo/vector-icons";
import supabase from '@/config/SupabaseConfig';

import RNPickerSelect from "react-native-picker-select";

import * as Animatable from "react-native-animatable";
type Props = NativeStackScreenProps<any>;
import { Button, Input } from "react-native-elements";
import { AntDesign, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { updateUserProfileSupabase } from "@/common/actions/userActions";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getUserVerification } from "@/common/topus-integration";
import { ActivityIndicator } from "react-native"; // Asegúrate de importar ActivityIndicator
import axios from "axios";
const markerIcon = require("../../assets/images/green_pin.png");
const tourImage = require("../../assets/images/icon.png");
const GOOGLE_MAPS_APIKEY_PROD = API_KEY; // Asignar la clave API
const CustomerMap = ({ navigation: propsNavigation }: Props) => {
  const navigation = useNavigation<any>();
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [origin, setOrigin] = useState<any>(null);
  const [destination, setDestination] = useState<any>(null);
 // console.log(destination, "destination")
  const mapRef = useRef<MapView>(null);
  const user = (useSelector((state: RootState) => state.auth.user) || {}) as any;
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [newAddress, setNewAddress] = useState("");
  const settings = useSelector(selectSettings);
  const promos = useSelector((state: RootState) => state.promodata?.promos || []);
  const dispatch = useDispatch<AppDispatch>();

  const colorScheme = useColorScheme(); // Hook para detectar si es modo oscuro o claro
  const [isEmailVerified, setIsEmailVerified] = useState(Boolean(user?.emailVerified));

  const [requestCount, setRequestCount] = useState(0); // Contador de peticiones
  const [searchText, setSearchText] = useState(""); // Estado para el texto de búsqueda
  const [focus, setFocus] = useState("origin"); // Estado para controlar el foco
  const originAutocompleteRef = useRef<any>(null);
  const destinationAutocompleteRef = useRef<any>(null);
  const [tourVisible, setTourVisible] = useState(false);
  const [dbFirstName, setDbFirstName] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [modalVisibleImage, setModalVisibleImage] = useState(false);
 // console.log(modalVisibleImage, "status")
  const [userData, setUserData] = useState({
    profile_image: user?.profile_image || "",
    mobile: user?.mobile || "",
    docType: user?.docType || "",
    verifyId: user?.verifyId || "",
    verifyIdImage: user?.verifyIdImage || "",
    firstName: user?.firstName || user?.first_name || "",
    lastName: user?.lastName || user?.last_name || "",
  });
  const [docTypes] = useState(["CC", "Pasaporte", "CE"]);
  const customStyles = {
    stepIndicatorSize: 30,
    currentStepIndicatorSize: 40,
    separatorStrokeWidth: 2,
    currentStepStrokeWidth: 3,
    stepStrokeCurrentColor: "#00f4f5",
    stepStrokeWidth: 3,
    stepStrokeFinishedColor: "#00f4f5",
    stepStrokeUnFinishedColor: "#aaaaaa",
    separatorFinishedColor: "#00f4f5",
    separatorUnFinishedColor: "#aaaaaa",
    stepIndicatorFinishedColor: "#00f4f5",
    stepIndicatorUnFinishedColor: "#ffffff",
    stepIndicatorCurrentColor: "#ffffff",
    stepIndicatorLabelFontSize: 15,
    currentStepIndicatorLabelFontSize: 15,
    stepIndicatorLabelCurrentColor: "#00f4f5",
    stepIndicatorLabelFinishedColor: "#ffffff",
    stepIndicatorLabelUnFinishedColor: "#aaaaaa",
    labelColor: "#999999",
    labelSize: 13,
    currentStepLabelColor: "#00f4f5",
  };
  const [modalVisibleImageVerify, setModalVisibleImageVerify] = useState(false);
  const totalSteps = 6; // Total de pasos en el tour
  const [uriImage, setUriImage] = useState("");
  // Array de mensajes para cada paso
  const stepMessages = [
    "Está en el paso 1 de 6:",
    "Está en el paso 2 de 6:",
    "Está en el paso 3 de 6:",
    "Está en el paso 4 de 6:",
    "Está en el paso 5 de 6:",
    "Está en el paso 6 de 6:",
  ];
  const [loading, setLoading] = useState(false); // Estado para controlar el loader
  const [loadingMessage, setLoadingMessage] = useState("Estamos verificando tu cuenta para asegurarnos de que todo esté en orden y así protegerte a ti y a los demás usuarios. Este proceso solo tomará unos 5 minutos. Es muy importante para nosotros garantizar la seguridad tanto de nuestros usuarios como de nuestros conductores. Agradecemos tu paciencia");
  
  // TEMPORALMENTE DESHABILITADO - Pendiente configurar Supabase email verification
  /* useEffect(() => {
    if (!isEmailVerified) {
      navigation.navigate("EmailVerificationScreen"); // Navega a una pantalla de verificación de email si lo deseas
    }
  }, [isEmailVerified]); */
  useEffect(() => {
    if (loading) {
      const messages = [
        "Estamos verificando tu cuenta para asegurarnos de que todo esté en orden y así protegerte a ti y a los demás usuarios. Este proceso solo tomará unos 5 minutos. Es muy importante para nosotros garantizar la seguridad tanto de nuestros usuarios como de nuestros conductores. Agradecemos tu paciencia.",
        "Ya casi terminamos, falta poco...",
        "Está tardando un poco más de lo esperado. Gracias por tu paciencia..."
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
    let isMounted = true;

    const fetchFirstName = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        const authUserId = authUser?.id || user?.auth_id || user?.id;
        if (!authUserId) {
          if (isMounted) setDbFirstName(null);
          return;
        }

        const { data: byAuthId } = await supabase
          .from("users")
          .select("first_name")
          .eq("auth_id", authUserId)
          .maybeSingle();

        if ((byAuthId as any)?.first_name) {
          if (isMounted) setDbFirstName((byAuthId as any).first_name);
          return;
        }

        const { data: byId } = await supabase
          .from("users")
          .select("first_name")
          .eq("id", authUserId)
          .maybeSingle();

        if (isMounted) {
          setDbFirstName((byId as any)?.first_name || null);
        }
      } catch (error) {
        if (isMounted) setDbFirstName(null);
      }
    };

    fetchFirstName();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const fields = [
      { value: user.profile_image, step: 0 },
      { value: user.mobile, step: 1 },
      { value: user.docType, step: 2 },
      { value: user.verifyId, step: 3 },
      { value: user.verifyIdImage, step: 4 }
    ];
   // console.log(user.verifyIdImage, "fields");
    const firstEmptyField = fields.find(field => !field.value);

    if (firstEmptyField && user.emailVerified) {
      setTourVisible(true);
    } else {
      //      setTourVisible(false);
    }
  }, [
    user.verifyIdImage,
    user.verifyId,
    user.docType,
    user.profile_image,
    user.mobile,
    user
  ]); // Este useEffect se activa cada vez que cambian user.verifyIdImage, user.verifyId, user.docType, user.profile_image o user.mobile




  const sessionTokenOriginRef = useRef<string | null>(null);
  const sessionTokenDestinationRef = useRef<string | null>(null);


  const [isMapVisible, setIsMapVisible] = useState(false); // Nuevo estado para controlar la visibilidad del mapa
  const [buttonsVisible, setButtonsVisible] = useState(true);
  const [activeBookingsCount, setActiveBookingsCount] = useState(0);
  const [type, setType] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [editingMode, setEditingMode] = useState(false); // Modo para cambiar punto de origen
  const suggestions = [
    { id: 1, image: require("@/assets/images/TREAS-E.png"), label: "T+Plus Especial", description: "Servicio Especial" },
    { id: 2, image: require("@/assets/images/TREAS-X.png"), label: "T+Plus Particular", description: "Vehículo Particular" },
    { id: 3, image: require("@/assets/images/TREAS-Van.png"), label: "T+Plus Van", description: "Van 11 Pax" },
    { id: 4, image: require("@/assets/images/TREAS-T.png"), label: "T+Plus Taxi", description: "Taxi" },

  ];
 // console.log(destination, "dest")

  useEffect(() => {
    dispatch(listenToSettingsChanges());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchPromos());
  }, [dispatch]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permission to access location was denied");
        return;
      }

      // Get initial position
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLatitude(initialLocation.coords.latitude);
        setLongitude(initialLocation.coords.longitude);
        setOrigin({
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
          title: "Mi ubicación actual",
        });
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: initialLocation.coords.latitude,
            longitude: initialLocation.coords.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }, 1000);
        }
      } catch (error) {
        console.log("Error getting initial location:", error);
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 50,
        },
        (location) => {
          setLatitude(location.coords.latitude);
          setLongitude(location.coords.longitude);
          setOrigin({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            title: "Mi ubicación actual",
          });
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }, 1000);
          }
        }
      );

      return () => {
        if (subscription) {
          subscription.remove();
        }
      };
    })();
  }, []);
  useEffect(() => {
    const fetchActiveBookings = async () => {
      try {
        if (!user?.id) {
          setActiveBookingsCount(0);
          return;
        }

        const statuses = ['ACCEPTED', 'REACHED', 'NEW', 'STARTED', 'ARRIVED'];

        const compositeStatuses = statuses.map((status) => `${user.id}_${status}`);

        const { count, error } = await supabase
          .from('bookings_v2_mobile' as any)
          .select('id', { count: 'exact', head: true })
          .eq('customer', user.id)
          .in('customer_status', compositeStatuses);

        if (error) {
          console.error('Error fetching active bookings from Supabase:', error.message);
          setActiveBookingsCount(0);
          return;
        }

        setActiveBookingsCount(count ?? 0);
      } catch (error) {
        console.error('Error fetching active bookings:', error);
      }
    };

    fetchActiveBookings();
  }, [user?.id]);
  const handleLocationSelect = (
    data: any,
    details: any = null,
    type: string
  ) => {

    const { lat, lng } = details.geometry.location;
    if (type === "origin") {
      setOrigin({
        latitude: lat,
        longitude: lng,
        title: data.description,
      });
    //  console.log("Origin:", origin);
      setRequestCount((prevCount) => prevCount + 1);
      originAutocompleteRef.current?.setAddressText(data.description);
      // Incrementa el contador
      //console.log("Total de peticiones a la API:", requestCount + 1); // Log de la cantidad de peticiones
    } else if (type === "destination") {
      setDestination({
        latitude: lat,
        longitude: lng,
        title: data.description,
      });
     // console.log("Destination:", destination);
      setRequestCount((prevCount) => prevCount + 1); // Incrementa el contador
     // console.log("Total de peticiones a la API:", requestCount + 1); // Log de la cantidad de peticiones
      destinationAutocompleteRef.current?.setAddressText(data.description);
    }
  };

  // Función para eliminar el marcador de origen
  const handleRemoveOrigin = () => {
    setOrigin(null);
    originAutocompleteRef.current?.setAddressText("");
  };

  // Función para eliminar el marcador de destino
  const handleRemoveDestination = () => {
    setDestination(null);
    destinationAutocompleteRef.current?.setAddressText("");
  };

  // Función para cambiar el punto de origen
  const toggleEditingMode = () => {
    setEditingMode(!editingMode);
  };

  // Removed auto-navigation to BookingScreen - now goes through TripPreviewScreen first

  useEffect(() => {
    const fetchRoute = async () => {
      if (!origin || !destination) {
        setRouteGeometry(null);
        return;
      }

      try {
        const token = getMapboxAccessToken();
        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`;

        const response = await axios.get(directionsUrl, {
          params: {
            geometries: 'geojson',
            overview: 'full',
            access_token: token,
          },
        });

        const geometry = response?.data?.routes?.[0]?.geometry;
        if (geometry?.coordinates?.length) {
          setRouteGeometry({
            type: 'Feature',
            geometry,
            properties: {},
          });
        } else {
          setRouteGeometry(null);
        }
      } catch (error) {
        console.error('Error fetching Mapbox route:', error);
        setRouteGeometry(null);
      }
    };

    fetchRoute();
  }, [origin, destination]);

  const renderFavoriteButtons = () => {
    const favoriteAddresses = user?.savedAddresses
      ? (Object.values(user.savedAddresses) as any[]).filter(
        (address: any) => address.isFavorite
      )
      : [];

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.favoriteScroll}
      >
        {favoriteAddresses.map((address: any) => (
          <TouchableOpacity
            key={address.id} // Asegúrate de que 'address.id' sea único
            style={styles.favoriteButton}
            onPress={() =>
              handleLocationSelect(
                { description: address.description },
                {
                  geometry: {
                    location: { lat: address.lat, lng: address.lng },
                  },
                },
                focus
              )
            }
          >
            <Text style={styles.favoriteButtonText}>{address.typeAddress}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const verifyUserInTopus = async (data: any) => {

    return await getUserVerification({
      doc_type: data.docType,
      identification: data.verifyId,
      name: data.firstName,
    });
  };
  const handleFinishTour = async () => {
    try {
      if (!user) {
        console.warn("No hay usuario autenticado.");
        return;
      }
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authUserId = authUser?.id || user?.auth_id;
      if (!authUserId) {
        console.warn("No se pudo resolver auth.uid() para el update.");
        alert("No se pudo identificar al usuario autenticado.");
        return;
      }
      setLoading(true);
      // Actualiza en Supabase usando auth.uid() (= users.auth_id)
      const result = await updateUserProfileSupabase(
        authUserId,
        {
          ...userData,
          verify_id_image: userData.verifyIdImage,
        },
        dispatch,
        userData.profile_image || undefined
      );
      setLoading(false);
      setTourVisible(false);
      if (result.success) {
        alert("Perfil actualizado correctamente.");
      } else {
        alert(result.error || "No se pudo actualizar el perfil.");
      }
    } catch (error) {
      console.error("Error general en handleFinishTour:", error);
      alert("Hubo un error al actualizar el perfil. Por favor, inténtalo de nuevo.");
    }
  };


  const handleBookNowPress = async () => {
    if (origin && destination) {
      try {
        /*  const address = await getAddressFromCoordinates(
            origin.latitude,
            origin.longitude
          );
  */
        const updatedOrigin = {
          ...origin,
          title: origin.title,
        };

        navigation.getParent()?.navigate("BookingS", {
          origin,
          destination,
          type
        });
      } catch (error) {
        console.error("Error al obtener la dirección", error);
      }
    } else {
      setModalMessage("Por favor seleccione origen y destino.");
      setModalVisible(true);
    }
  };


  const centerMap = () => {
    if (mapRef.current && latitude && longitude) {
      mapRef.current.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      }, 1000);
    }
  };

  // Función para manejar el cambio en el texto de búsqueda
  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    setRequestCount(0); // Reinicia el contador de peticiones
  };
  // Sin request explícito de READ_MEDIA_IMAGES/VIDEO en ninguno de los dos —
  // el Photo Picker nativo no lo requiere para uso puntual (foto de perfil /
  // documento de verificación), y pedirlo de más viola la política de Google
  // Play sobre permisos de fotos y video.
  const pickProfileImage = async () => {
    let pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      setUserData({ ...userData, profile_image: pickerResult.assets[0].uri });
    }
  };

  const pickVerifyIdImage = async () => {
    let pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      setUserData({ ...userData, verifyIdImage: pickerResult.assets[0].uri });
    }
  };

  // Función debounced para manejar la selección de ubicación
  const debouncedHandleLocationSelect = debounce(
    (data: any, details: any, type: string) => {
      handleLocationSelect(data, details, type);
    },
    1000
  ); // Ajusta el tiempo de debounce según sea necesario

  const takePhoto = async (variable: "profile" | "verifyId") => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      alert("Permiso para acceder a la cámara es necesario!");
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (variable === "profile") {
      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setModalVisible(false); // Cerrar el modal después de seleccionar una imagen
        const uri = pickerResult.assets[0].uri;
        setUserData({ ...userData, profile_image: uri }); // Actualiza el estado local
        // dispatch(updateProfile(user, uri)); // Llama a updateProfile con un objeto vacío y la URI
        setModalVisibleImage(false); // Cierra el modal si está abierto
      }
    } else if (variable === "verifyId") {


      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setModalVisible(false); // Cerrar el modal después de seleccionar una imagen

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
        setModalVisibleImage(false); // Cierra el modal si está abierto
      } else if (variable === "verifyId") {
        setModalVisible(false); // Cerrar el modal después de seleccionar una imagen


        setUserData({ ...userData, verifyIdImage: uri }); // Actualiza el estado local
        setModalVisibleImageVerify(false);

      }
    }
  };
  const renderStepContent = () => {
    return (
      <Animatable.View animation="fadeIn" style={styles.stepContainer}>
        <Animatable.Text
          animation="bounceIn" // Animación más llamativa
          duration={700} // Duración más lenta para efecto suave
          style={styles.stepMessage}
          iterationCount={1} // Solo una vez al cargar
          easing="ease-in-out" // Efecto más fluido
        >
          {stepMessages[currentStep]}
        </Animatable.Text>
        {(() => {
          switch (currentStep) {
            case 0:
              return (

                <>
                  <Text style={styles.stepTitle}>Sube tu foto de perfil</Text>
                  <Text style={styles.explanatoryText}>¡Gracias por registrarte en T+Plus!</Text>
                  <Text style={styles.explanatoryText}>
                    Por tu seguridad y la de los conductores que te atenderán, es necesario completar los siguientes campos y datos para poder proceder con todas tus solicitudes.                  </Text>

                  <TouchableOpacity>
                    {userData.profile_image || uriImage ? (
                      <Image
                        source={{ uri: userData.profile_image || uriImage }}
                        style={styles.profileImage}
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <AntDesign name="camera" size={50} color="#ccc" />
                        <Text>Subir imagen</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                 
                    
                    

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
                          <Text style={styles.modalButtonText}>Cargar desde Dispositivo</Text>
                        </TouchableOpacity>
                    
                    
                  


                </>
              );
            case 1:
              return (
                <>
                  <Text style={styles.explanatoryText}>
                    Es muy importante que tengamos un número para contactarte. Recuerda que deberás incluir el indicativo."                    <Text style={{ backgroundColor: colorScheme === "dark" ? "#000" : "#D3D3D3", fontStyle: "italic" }}>ejm: +572223334455</Text>
                  </Text>
                  <Text style={styles.stepTitle}>Ingresa tu número de teléfono</Text>
                  <Input
                    placeholder="Teléfono"
                    value={userData.mobile}
                    onChangeText={(text) => setUserData({ ...userData, mobile: text })}
                    keyboardType="phone-pad"
                    leftIcon={{ type: "antdesign", name: "phone", color: "#00f4f5" }}
                    inputStyle={styles.input}
                  />
                </>
              );
            case 2:
              return (
                <>
                  <Text style={styles.stepTitle}>Selecciona el tipo de documento</Text>
                  <Text style={styles.explanatoryText}>

                    En este paso nos indicarás el tipo de documento que te identifica en el país en el cual resides en este momento. Lo hacemos para que formes parte de este cambio en movilidad y podamos reportar tu documento completo a las aseguradoras que respaldan tu movilidad.</Text>
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
                        label: userData.docType ? userData.docType : "Seleccione un tipo de documento",
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
                <TouchableWithoutFeedback onPress={Platform.OS === "ios" ? Keyboard.dismiss : undefined}>
                  <>
                    <Text style={styles.stepTitle}>Ingresa tu número de documento</Text>
                    <Text style={styles.explanatoryText}>
                      Por favor, digita tu número de documento. En el caso de pasaporte, ingresa las letras y números tal como aparecen en tu documento. Si es cédula o cédula de extranjería, ingresa los números sin puntos ni comas, tal como aparecen en tu documento.                    </Text>
                    <View style={styles.pickerContainer}></View>
                    <Input
                      placeholder="Número de documento"
                      value={userData.verifyId}
                      onChangeText={(text) => setUserData({ ...userData, verifyId: text })}
                      keyboardType="number-pad"
                      leftIcon={{ type: "antdesign", name: "idcard", color: "#00f4f5" }}
                      inputStyle={styles.input}
                    />
                  </>
                </TouchableWithoutFeedback>
              );
            case 4:
              return (
                <>
                  <Text style={styles.stepTitle}>Sube tu documento de identidad</Text>
                  <Text style={styles.explanatoryText}>
                    Por favor toma foto del frontal de tu documento de identidad, para poder verificar que eres tú y poder atender tus solicitudes con toda la seguridad que esperas:                  </Text>
                  <TouchableOpacity >
                    {userData.verifyIdImage || uriImage ? (
                      <Image
                        source={{ uri: userData.verifyIdImage || uriImage }}
                        style={styles.profileImage}
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <AntDesign name="idcard" size={50} color="#ccc" />
                        <Text>Subir imagen</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  
   

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
                          <Text style={styles.modalButtonText}>Cargar desde Dispositivo</Text>
                        </TouchableOpacity>
              
                  
                </>
              );
            case 5:
              return (
                <>
                  <Text style={styles.stepTitle}>Resumen</Text>
                  <Text style={styles.explanatoryText}>Por favor verifica que la información registrada corresponda y sea conforme a la realidad, ya que con ella haremos una verificación en línea, para garantizar tu seguridad y la de nuestros conductores, si quieres revisarlas ingresa al siguiente link:

                  </Text>
                  {/* <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://treasapp.com/politica-de-privacidad')}>
                    <Text style={styles.linkButton}>
                      https://treasapp.com/politica-de-privacidad
                    </Text>
                  </TouchableOpacity> */}
                  <Text style={styles.summaryText}>Teléfono: {userData.mobile}</Text>
                  <Text style={styles.summaryText}>
                    Tipo de Documento: {userData.docType}
                  </Text>
                  <Text style={styles.summaryText}>ID Verificado: {userData.verifyId}</Text>
                  {userData.verifyIdImage && (
                    <Image
                      source={{ uri: userData.verifyIdImage }}
                      style={styles.profileImage}
                    />
                  )}
                  <Button
                    title={loading ? <ActivityIndicator size="small" color="#fff" /> : "Finalizar"}
                    buttonStyle={styles.finishButton}
                    onPress={handleFinishTour}
                    disabled={!userData.mobile || !userData.docType || !userData.verifyId || !userData.verifyIdImage}
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

  const styles: any = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos dinámicos

  // Limpia los campos de autocompletado al navegar a otra pantalla
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        // Restablece los estados de origen y destino
        setOrigin(null);
        setDestination(null);
        setSearchText(""); // Limpia el texto de búsqueda
        setRequestCount(0); // Reinicia el contador de peticiones
        setAddresses([]); // Limpia las direcciones guardadas si es necesario

      };
    }, [])
  );
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

  const renderSuggestions = () => {


    return (
      <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionsScroll}
        >
          {suggestions.map((suggestion, index) => (
            <Animatable.View
              key={suggestion.id}
              animation="fadeInUp"
              duration={500}
              delay={index * 70}
              useNativeDriver
            >
              <TouchableOpacity
                style={styles.suggestionButton}
                onPress={() => {
                  setType(suggestion.id);
                  console.log(`Seleccionado: ${suggestion.label}`);
                  navigation.navigate('TripPreviewScreen', { vehicleType: suggestion.id });
                }}
              >
                <Image
                  source={suggestion.image}
                  style={{ width: 50, height: 50 }}
                  resizeMode="contain"
                />
                <Text style={styles.suggestionButtonText}>{suggestion.label}</Text>
                <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
              </TouchableOpacity>
            </Animatable.View>
          ))}
        </ScrollView>
      </>
    );
  };


  const DailySavings = () => {



    const handlePress = (id: number) => {
      switch (id) {
        case 1:
          // Navegar a la pantalla de "Carnet"
          navigation.getParent()?.navigate('Carnet');
          break;
        case 2:
          // Navegar a la pantalla de "Reservas"
          navigation.getParent()?.navigate('ReservationsScreen');
          break;
        case 3:
          // Abrir WhatsApp
          Linking.openURL(`https://wa.me/message/BTQOY5GZC7REF1`);
          break;
        case 4:
          // Navegar a la pantalla de "Perfil"
          navigation.getParent()?.navigate('Docs');
          break;
        case 5:
          // Abrir Términos y Condiciones en un navegador web
          Linking.openURL('https://tmasplus.com/terminos-y-condiciones');
          break;
        case 6:
          // Navegar a la pantalla de "Contactos de seguridad"
          navigation.getParent()?.navigate('SecurityContact');
          break;
        case 7:
          // Realizar una llamada telefónica
          const call_link = Platform.OS === 'android' ? `tel:${settings.panic}` : `telprompt:${settings.panic}`;
          Linking.openURL(call_link);
          break;
        default:
          console.log('Acción no definida');
      }
    };

    const cards = [
      {
        id: 1,
        title: "¡Usa tu carnet!",
        subtitle: "Presenta tu carnet de T+plus para identificarte fácilmente ante los conductores. ¡Es tu acceso seguro y confiable!",
        image: require("@/assets/images/iconos3d/43.png"),
      },
      {
        id: 2,
        title: "¡Tus Reservas!",
        subtitle: `Tienes ${activeBookingsCount} ${activeBookingsCount === 1 ? 'reserva activa' : 'reservas activas'}. Toca aquí para ver detalles y estar al tanto de tus viajes.`,
        image: require("@/assets/images/iconos3d/45.png"),
        badge: activeBookingsCount > 0 ? {
          value: activeBookingsCount,
          color: '#00f4f5'
        } : null,
        animation: 'pulse',
      },
      {
        id: 3,
        title: "¡Chatea con nosotros!",
        subtitle: "¿Necesitas ayuda? Comunícate con nosotros por WhatsApp para obtener soporte rápido y personalizado.",
        image: require("@/assets/images/iconos3d/36.png"),
      },
      {
        id: 4,
        title: "Verifica y actualiza tu perfil",
        subtitle: "En T+plus, tu seguridad es nuestra prioridad. Realizamos un estudio de seguridad para garantizar que todo esté en orden. ¡Actualiza tu perfil con total tranquilidad!",
        image: require("@/assets/images/iconos3d/19.png"),
      },
      {
        id: 5,
        title: "Términos y condiciones",
        subtitle: "Consulta los términos y condiciones de T+plus para conocer nuestras políticas y cómo aseguramos una experiencia segura y transparente para todos nuestros usuarios.",
        image: require("@/assets/images/iconos3d/25.png"),
      },
      {
        id: 6,
        title: "Acceso a contacto de seguridad",
        subtitle: "Añade contactos de confianza para que podamos notificarles en caso de emergencia. Mantén a tus seres queridos informados y seguros mientras usas T+plus.",
        image: require("@/assets/images/iconos3d/24.png"),
      },
      {
        id: 7,
        title: "Botón de Emergencia (SOS)",
        subtitle: "En caso de emergencia, usa el botón de SOS para alertar a tus contactos de seguridad o recibir ayuda inmediata. Tu seguridad es nuestra prioridad.",
        image: require("@/assets/images/iconos3d/17.png"),
      },
    ];

    return (
      <View style={styles.containerDayli}>
        <Text style={styles.headerDayli}>T+plus</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollContainerDayli}>
          {cards.map((card, index) => (
            <Animatable.View
              key={card.id}
              animation="fadeInUp"
              duration={550}
              delay={index * 80}
              useNativeDriver
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
  const SavedAddresses = () => {
    // Obtener las direcciones guardadas del usuario
    const savedAddresses = Object.values(user.savedAddresses || {});
    // Filtrar las direcciones favoritas
    const favoriteAddresses = savedAddresses.filter((address: any) => address.isFavorite);
    // Obtener las últimas dos direcciones guardadas
    const lastTwoAddresses = savedAddresses.slice(-2);

    return (
      <>
        {/* Contenedor de direcciones favoritas (con el estilo de SavedAddresses) */}
        {favoriteAddresses.length > 0 && (
          <View style={styles.containerAddress}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {favoriteAddresses.map((address: any, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={styles.addressCard}
                  onPress={() => {
                    navigation.navigate('TripPreviewScreen', {
                      preselectedDestination: {
                        latitude: address.lat,
                        longitude: address.lng,
                        title: address.description
                      }
                    });
                  }}
                >
                  <Ionicons name="star-outline" size={24} color="#fff" style={styles.icon} />
                  <View>
                    <Text style={styles.addressTitle}>
                      {address.typeAddress || address.description.split(",")[0]}
                    </Text>
                    <Text style={styles.addressSubtitle}>{address.description}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Contenedor de últimas dos direcciones guardadas */}
        <View style={styles.containerAddress}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {lastTwoAddresses.map((address: any, index: number) => (
              <TouchableOpacity
                key={index}
                style={styles.addressCard}
                onPress={() => {
                  handleLocationSelect(
                    { description: address.description },
                    {
                      geometry: {
                        location: { lat: address.lat, lng: address.lng },
                      },
                    },
                    "destination"
                  );
                  setIsMapVisible(true);
                }}
              >
                <Ionicons name="time-outline" size={24} color="#fff" style={styles.icon} />
                <View>
                  <Text style={styles.addressTitle}>
                    {address.nameAddressFavorite || address.description.split(",")[0]}
                  </Text>
                  <Text style={styles.addressSubtitle}>{address.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </>
    );
  };

  const HorizontalImageBanner = () => {
    const banners = [
      { image: require("@/assets/images/Combuscol.png"), url: "https://tmasplus.com/beneficios" },
      { image: require("@/assets/images/Fitvision.png"), url: "https://tmasplus.com/beneficios" },
  
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
              <TouchableOpacity onPress={() => handlePress(banner.url)}>
                <Image source={banner.image} style={styles.bannerImage} />
              </TouchableOpacity>
            </Animatable.View>
          ))}
        </ScrollView>
      </View>
    );
  };
  const darkMapStyle = [
    {
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#212121"
        }
      ]
    },
    {
      "elementType": "labels.icon",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#757575"
        }
      ]
    },
    {
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#212121"
        }
      ]
    },
    {
      "featureType": "administrative",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#757575"
        }
      ]
    },
    {
      "featureType": "administrative.country",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#9e9e9e"
        }
      ]
    },
    {
      "featureType": "administrative.land_parcel",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "administrative.locality",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#bdbdbd"
        }
      ]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#757575"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#181818"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#616161"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#1b1b1b"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#2c2c2c"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#8a8a8a"
        }
      ]
    },
    {
      "featureType": "road.arterial",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#373737"
        }
      ]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#3c3c3c"
        }
      ]
    },
    {
      "featureType": "road.highway.controlled_access",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#4e4e4e"
        }
      ]
    },
    {
      "featureType": "road.local",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#616161"
        }
      ]
    },
    {
      "featureType": "transit",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#757575"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#000000"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#3d3d3d"
        }
      ]
    }
  ];

  const goToMainMenu = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.getParent()?.navigate("HomeScreen");
  };

  return (

    <View style={styles.container}>
      <>
        <StatusBar hidden={true} />

        {isMapVisible && (
          <View style={{ flex: 1 }}>
            {/* Map Header - Botón de Cambiar Origen y otros controles */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: 20, paddingTop: 30 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {/* Botón de Back */}
                <TouchableOpacity
                  style={{
                    backgroundColor: '#b3fcfc',
                    borderRadius: 100,
                    width: 40,
                    height: 40,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={() => setIsMapVisible(false)}
                >
                  <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>

                {/* Botón para cambiar punto de origen */}
                <TouchableOpacity
                  style={{
                    backgroundColor: editingMode ? '#ff6b6b' : '#b3fcfc',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 15,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1
                  }}
                  onPress={toggleEditingMode}
                >
                  <Text style={{
                    color: editingMode ? 'white' : 'black',
                    fontWeight: '600',
                    fontSize: 14
                  }}>
                    {editingMode ? '✓ Modo Edición' : '✎ Cambiar Origen'}
                  </Text>
                </TouchableOpacity>

                {/* Botón para centrar en ubicación actual */}
                <TouchableOpacity
                  style={{
                    backgroundColor: '#b3fcfc',
                    borderRadius: 100,
                    width: 40,
                    height: 40,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={centerMap}
                >
                  <Ionicons name="locate" size={24} color="black" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Inputs flotantes */}
            <View style={{ position: 'absolute', top: 80, width: '100%', zIndex: 1, padding: 20 }}>
              {/* Input de origen */}
              <GooglePlacesAutocomplete
                ref={originAutocompleteRef}
                enablePoweredByContainer={false}
                placeholder="Inicia tu viaje ya!!!"
                minLength={4}
                debounce={2000}
                fetchDetails
                onPress={(data, details = null) =>
                  handleLocationSelect(data, details, 'origin')
                }
                query={{
                  key: GOOGLE_MAPS_APIKEY_PROD,
                  language: 'es',
                  components: 'country:co',
                  sessiontoken: sessionTokenOriginRef.current,
                }}
                styles={{
                  textInput: {
                    ...styles.input,
                    backgroundColor: colorScheme === 'dark'
                      ? Platform.OS === 'ios'
                        ? '#333'
                        : '#b3fcfc'
                      : '#fff',
                    color: colorScheme === 'dark' ? '#fff' : '#000',
                    paddingVertical: 10,
                  },
                  listView: {
                    ...styles.listView,
                    backgroundColor: colorScheme === 'dark' ? '#333' : '#fff',
                  },
                  description: {
                    color: colorScheme === 'dark' ? '#000' : '#000',
                  },
                }}
                textInputProps={{
                  onFocus: () => {
                    setFocus('origin');
                    setIsMapVisible(true);
                    setButtonsVisible(false);
                    if (!sessionTokenOriginRef.current) {
                      const generateUID = () => {
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                          const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                          return v.toString(16);
                        });
                      };
                      sessionTokenOriginRef.current = generateUID();
                    }
                  },
                  onBlur: () => {
                    if (!origin) {
                      sessionTokenOriginRef.current = null;
                    }
                  },
                }}
              />

              {/* Input de destino */}
              <GooglePlacesAutocomplete
                ref={destinationAutocompleteRef}
                enablePoweredByContainer={false}
                placeholder={destination ? destination.title : "Destino"}
                minLength={4}
                debounce={2000}
                fetchDetails
                onPress={(data, details = null) =>
                  handleLocationSelect(data, details, 'destination')
                }
                query={{
                  key: GOOGLE_MAPS_APIKEY_PROD,
                  language: 'es',
                  components: 'country:co',
                  sessiontoken: sessionTokenDestinationRef.current,
                }}
                styles={{
                  textInput: {
                    ...styles.input,
                    backgroundColor: colorScheme === 'dark'
                      ? Platform.OS === 'ios'
                        ? '#333'
                        : '#b3fcfc'
                      : '#fff',
                    color: colorScheme === 'dark' ? '#fff' : '#000',
                    paddingVertical: 10,
                  },
                  listView: {
                    ...styles.listView,
                    backgroundColor: colorScheme === 'dark' ? '#333' : '#fff',
                  },
                  description: {
                    color: colorScheme === 'dark' ? '#000' : '#000',
                  },
                }}
                textInputProps={{
                  onFocus: () => {
                    setFocus('destination');
                    if (!sessionTokenDestinationRef.current) {
                      const generateUID = () => {
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                          const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                          return v.toString(16);
                        });
                      };
                      sessionTokenDestinationRef.current = generateUID();
                    }
                  },
                  onBlur: () => {
                    if (!destination) {
                      sessionTokenDestinationRef.current = null;
                    }
                  },
                }}
              />
              {type !== null && (
                <View style={styles.selectedTypeContainer}>
                  <Text style={styles.selectedTypeText}>
                    ¡Genial! Has elegido: {suggestions.find(s => s.id === type)?.label}
                  </Text>
                </View>
              )}
            </View>

            {/* Map View */}

            {/* Modal de Tour */}
            <Modal
  animationType="slide"
  transparent={false}
  visible={tourVisible}
  onRequestClose={() => {}}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={90}
    style={{ flex: 1 }}
  >
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, ...styles.tourContainer }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Image source={tourImage} style={styles.tourImage} />
        {loading ? (
          <Text style={[styles.tourText, { flexShrink: 1 }]}>{loadingMessage}</Text>
        ) : currentStep === 5 ? (
          <Text style={[styles.tourText, { flexShrink: 1 }]}>
            ¡Felicidades! Estás a un paso de completar tu registro en T+Plus.
          </Text>
        ) : (
          <Text style={[styles.tourText, { flexShrink: 1 }]}>
            Hola, bienvenido a T+Plus, Asegúrate de completar los siguientes pasos para poder disfrutar de todas nuestras funcionalidades
          </Text>
        )}
      </View>

      {renderStepContent()}

      {/* Botones de navegación */}
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
  </KeyboardAvoidingView>
</Modal>



            <MapView
              ref={mapRef}
              style={styles.map}
              provider="google"
              showsUserLocation={true}
              showsMyLocationButton={false}
              initialRegion={{
                latitude: latitude || 37.78825,
                longitude: longitude || -122.4324,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              }}
              region={{
                latitude: latitude || 37.78825,
                longitude: longitude || -122.4324,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              }}
              zoomEnabled={true}
              scrollEnabled={true}
              pitchEnabled={true}
            >
              {/* Polyline - Línea de viaje DEBE ir primero */}
              {routeGeometry && (
                <>
                  {/* Línea de sombra (más gruesa, semitransparente) */}
                  <Polyline
                    coordinates={routeGeometry.coordinates.map((coord: [number, number]) => ({ latitude: coord[1], longitude: coord[0] }))}
                    strokeColor="rgba(0, 244, 245, 0.3)"
                    strokeWidth={8}
                    lineCap="round"
                    lineJoin="round"
                  />
                  {/* Línea principal (bright cyan) */}
                  <Polyline
                    coordinates={routeGeometry.coordinates.map((coord: [number, number]) => ({ latitude: coord[1], longitude: coord[0] }))}
                    strokeColor="#00f4f5"
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                </>
              )}

              {/* Marcador de Origen - Clickeable */}
              {origin && (
                <Marker
                  coordinate={{ latitude: origin.latitude, longitude: origin.longitude }}
                  title={origin.title}
                  onPress={() => {
                    if (editingMode) {
                      handleRemoveOrigin();
                    }
                  }}
                >
                  <TouchableOpacity
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: editingMode ? '#ff6b6b' : 'transparent',
                      borderRadius: 20,
                      padding: 4,
                    }}
                    disabled={!editingMode}
                  >
                    <Image
                      source={markerIcon}
                      style={{ width: 30, height: 50 }}
                    />
                    {editingMode && (
                      <View
                        style={{
                          position: 'absolute',
                          backgroundColor: '#ff6b6b',
                          borderRadius: 12,
                          width: 24,
                          height: 24,
                          justifyContent: 'center',
                          alignItems: 'center',
                          top: -8,
                          right: -8,
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>×</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </Marker>
              )}

              {/* Marcador de Destino - Clickeable */}
              {destination && (
                <Marker
                  coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
                  title={destination.title}
                  onPress={() => {
                    if (editingMode) {
                      handleRemoveDestination();
                    }
                  }}
                >
                  <TouchableOpacity
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: editingMode ? '#ff6b6b' : 'transparent',
                      borderRadius: 20,
                      padding: 4,
                    }}
                    disabled={!editingMode}
                  >
                    <View
                      style={{
                        backgroundColor: '#00f4f5',
                        borderRadius: 50,
                        padding: 8,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="location" size={32} color="white" />
                    </View>
                    {editingMode && (
                      <View
                        style={{
                          position: 'absolute',
                          backgroundColor: '#ff6b6b',
                          borderRadius: 12,
                          width: 24,
                          height: 24,
                          justifyContent: 'center',
                          alignItems: 'center',
                          top: -8,
                          right: -8,
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>×</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </Marker>
              )}
            </MapView>
          </View>
        )}


        {!isMapVisible && ( // Mostrar el mapa solo si isMapVisible es verdadero

          <View style={{ flex: 1 }}>
            <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>

              <StatusBar hidden={true} />
              <View style={styles.notificationCard}>
                <View style={styles.headerControls}>
                  <TouchableOpacity
                    style={styles.headerBackBtn}
                    onPress={goToMainMenu}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="arrow-back" size={18} style={styles.headerBackIcon} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.profileMenuButton}
                    onPress={() => navigation.getParent()?.navigate("Carnet")}
                  >
                    <Image
                      source={user?.profile_image ? { uri: user?.profile_image } : require("@/assets/images/Avatar/1.png")}
                      style={styles.headerAvatar}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.notificationTextWrap}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.notificationText}>
                    {(() => {
                      const currentHour = new Date().getHours();
                      const greeting = currentHour < 12
                        ? "Buenos días"
                        : currentHour < 18
                          ? "Buenas tardes"
                          : "Buenas noches";
                      const firstName = dbFirstName || user?.first_name || "Usuario";
                      return `${greeting}, ${firstName}`;
                    })()}
                  </Text>
                </View>

              </View>

              {/* Main CTA Button - A donde vamos */}
              <Animatable.View
                animation="fadeInUp"
                duration={500}
                delay={100}
                useNativeDriver
                style={styles.destCardWrap}
              >
                <TouchableOpacity
                  activeOpacity={0.92}
                  style={styles.destCard}
                  onPress={() => {
                    navigation.navigate('TripPreviewScreen', {});
                  }}
                >
                  <View style={styles.destInner}>
                    <Ionicons name="location-outline" size={20} style={styles.destLeadingIcon} />

                    <Text style={styles.destText}>¿A dónde vamos?</Text>

                    <View style={styles.destArrow}>
                      <Ionicons name="arrow-forward" size={18} color="#00E5FF" />
                    </View>
                  </View>
                </TouchableOpacity>
              </Animatable.View>

              <View >
                {SavedAddresses()}
                <View style={{ marginBottom: 100 }}>
                  {/* Tipos de vehículos movidos a TripPreviewScreen */}
                  {!isMapVisible && DailySavings()}

                  {!isMapVisible && (
                    <>
                      <Text style={styles.headerDayli}>BENEFICIOS</Text>
                      {HorizontalImageBanner()}
                    </>
                  )}

                  {!isMapVisible && promos.length > 0 && (
                    <>
                      <Text style={styles.headerDayli}>PROMOCIONES</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                        {promos.map((promo: any, index: number) => (
                          <Animatable.View
                            key={`${promo.promo_code}-${index}`}
                            animation="fadeInUp"
                            duration={500}
                            delay={index * 80}
                            useNativeDriver
                          >
                            <View style={styles.promoCard}>
                              <Text style={styles.promoTitle}>{promo.promo_name}</Text>
                              <Text style={styles.promoDescription}>{promo.description}</Text>
                              <Text style={styles.promoCode}>Código: {promo.promo_code}</Text>
                            </View>
                          </Animatable.View>
                        ))}
                      </ScrollView>
                    </>
                  )}
                </View>






              </View>

            </ScrollView>
          </View>
        )}
        {destination && (
          <View style={styles.bookNowContainer2}>
            <TouchableOpacity
              style={styles.bookNow}
              onPress={handleBookNowPress}
            >
              <Text style={styles.bookNowText}>SOLICITAR</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS === "android" && isMapVisible && (
          <TouchableOpacity style={styles.centerButton} onPress={centerMap}>
            <Text style={styles.centerButtonText}>
              Centra aquí{" "}
              <AntDesign name="right" size={18} color="#FFFFFF" />
            </Text>
          </TouchableOpacity>
        )}

        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(!modalVisible)}
        >
          <View style={styles.modalBackground}>
            <View style={styles.modalView}>
              <Text style={styles.modalText}>{modalMessage}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <Modal
              transparent={true}
              animationType="slide"
              visible={modalVisibleImage}
              onRequestClose={() => setModalVisibleImage(false)}
            >
              <View style={[styles.modalContainer, { zIndex: 9999 }]}>                <View style={styles.modalView}>
                <Text style={styles.modalText}>Selecciona una opción</Text>
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
              <View style={[styles.modalContainer, { zIndex: 9999 }]}>
                <View style={styles.modalView}>
                  <Text style={styles.modalText}>Selecciona una opción</Text>
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

          </View>
        </Modal>
      </>
    </View>

  );
};

const lightStyles = StyleSheet.create({
  containerSuper: {
    backgroundColor: "#e9f1f5",
    height: "300%",
  },
  homeScroll: {
    width: "auto",
    margin: 10,
    zIndex: 1,
  },
  homeScrollContent: {
    paddingBottom: 110,
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLine: {},
  autocompleteContainer: {
    position: "absolute",
    top: 10,
    width: "100%",
    paddingHorizontal: 20,
    height: 800
  },
  input: {
    height: 52,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderRadius: 14,
    paddingHorizontal: 20,
    fontSize: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 244, 245, 0.28)",
  },
  listView: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 14,
    marginHorizontal: 20,
    shadowColor: "#00204a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  bookNowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
  },

  menuButton: {
    padding: 10,
    borderRadius: 100,
    margin: 10,
  },

  notificationText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#000",
  },


  bookNowContainer2: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  modalButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  bookNow: {
    backgroundColor: "#00204a",
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 80,
    elevation: 6,
    shadowColor: "#00204a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1.5,
    borderColor: "#00f4f5",
  },
  bookNowText: {
    color: "#00f4f5",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  centerButton: {
    position: "absolute",
    top: 15,
    right: 60,
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 10,
    elevation: 5,
  },
  centerButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
  },
  destCardWrap: {
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  destCard: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    shadowColor: "#001428",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  destInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  destLeadingIcon: {
    marginRight: 12,
    color: "#00E5FF",
  },
  iconPulseWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  destIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#00E5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  destText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#0A1A24",
  },
  destArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: {
    color: "#000",
    fontSize: 16,

    justifyContent: "center",
  },
  modalBackground: {
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
  closeButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },
  closeButtonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  favoriteScroll: {
    marginVertical: 10,
  },
  explanatoryText: {
    fontSize: 16,
    color: "#000",
    textAlign: "center",
    marginVertical: 10,
  },
  favoriteButton: {
    backgroundColor: "#00f4f5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  favoriteButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },

  suggestionsScroll: {
    marginVertical: 10,
  },
  suggestionButton: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    width: 105,
    height: 105,
    shadowColor: "#00204a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: "rgba(0, 244, 245, 0.30)",
  },
  suggestionButtonText: {
    color: "#00204a",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 4,
  },
  containerDayli: {
    marginVertical: 24,
    paddingHorizontal: 10,
  },
  headerDayli: {
    color: "#00204a",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
    letterSpacing: 0.6,
  },
  scrollContainerDayli: {
    flexDirection: "row",
  },
  cardDayli: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 24,
    width: 220,
    marginRight: 15,
    padding: 16,
    shadowColor: "#001428",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    overflow: "hidden",
  },
  cardImageDayli: {
    width: "74%",
    height: 104,
    borderRadius: 12,
    marginBottom: 12,
    alignSelf: "center",
  },
  cardTitleDayli: {
    color: "#00204a",
    fontSize: 18,
    fontWeight: "800",
  },
  cardSubtitleDayli: {
    color: "rgba(0,32,74,0.66)",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  containerAddress: {
    marginHorizontal: 10,
  },
  addressCard: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 14,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 3,
    borderLeftColor: "#00f4f5",
    shadowColor: "#00204a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 10,
  },
  icon: {
    marginRight: 15,
    color: "#00f4f5",
  },
  addressTitle: {
    color: "#00204a",
    fontSize: 15,
    fontWeight: "700",
  },
  addressSubtitle: {
    color: "#8a9bae",
    fontSize: 13,
    marginTop: 4,
  },
  containerHorizontal: {
    marginVertical: 20,
  },
  bannerImage: {
    width: 300,
    height: 150,
    borderRadius: 14,
    marginRight: 10,
  },
  selectedTypeContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 244, 245, 0.28)',
  },
  selectedTypeText: {
    fontSize: 16,
    color: '#000',
  },
  tourImage: {
    width: 200,
    height: 100,
    resizeMode: "contain",
    marginBottom: 20,
  },



  picker: {
    width: "100%",
    height: 50,
  },



  prevButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center"
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center"
  },

  finishButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },



  tourContainer: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#fff", // o el color correspondiente
  },
  stepContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  profileImage: {
    width: 30,
    height: 30,
    borderRadius: 15, // Hace que la imagen sea circular
    marginRight: 10,
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
  pickerContainer: {
    width: "100%",
    marginTop: 20,
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
    padding: 10,
  },
  nextButton: {
    backgroundColor: "#00f4f5",
    width: 150,
    padding: 10,
    borderRadius: 10,
  },
  finishButton: {
    backgroundColor: "#00f4f5",
    marginTop: 20,
    width: 200,
    borderRadius: 10,
  },
  closeIcon: {
    position: "absolute",
    top: 40,
    right: 20,
  },
  summaryText: {
    fontSize: 18,
    marginVertical: 5,
  },
  stepMessage: {
    fontSize: 22, // Aumentar tamaño para más impacto
    fontWeight: "600", // Peso mediano para no saturar
    marginBottom: 20, // Más espacio entre elementos
    textAlign: "center",
    color: "#00f4f5", // Color más suave pero llamativo
    textShadowColor: "rgba(0, 0, 0, 0.15)", // Sombras más suaves
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8, // Sombra más dispersa
    letterSpacing: 0.8, // Espaciado entre letras para mejor legibilidad
  },
  linkButton: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
  inlinePicker: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 10,
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

  tourText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#000",
  },
  notificationCard: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#00204a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "rgba(0, 244, 245, 0.22)",
  },
  notificationTextWrap: {
    flex: 1,
    justifyContent: "center",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  headerBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0, 244, 245, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerBackIcon: {
    color: "#00204a",
  },
  profileMenuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
    backgroundColor: "#000",
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  suggestionDescription: {
    fontSize: 12,
  },
  mainMenuBackWrap: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 5,
  },
  mainMenuBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(0, 244, 245, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00204a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  mainMenuBackIcon: {
    color: "#00204a",
  },
});


const darkStyles = StyleSheet.create({
  containerSuper: {
    backgroundColor: "#01060a",
  },
  homeScroll: {
    width: "auto",
    margin: 10,
    zIndex: 1,
  },
  homeScrollContent: {
    paddingBottom: 110,
  },
  container: {
    flex: 1,
    backgroundColor: "#01060a",
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLine: {},
  autocompleteContainer: {
    position: "absolute",
    //top: 10,
    width: "100%",
    //paddingHorizontal: 20,
    height: 700
  },
  input: {
    height: 50,

    borderRadius: 10,
    paddingHorizontal: 20,
    fontSize: 16,
    marginTop: 10,
    color: "#fff",
    backgroundColor: "rgba(4, 39, 58, 0.40)",
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.35)",
  },
  listView: {
    backgroundColor: "rgba(4, 39, 58, 0.78)",
    borderRadius: 10,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.30)",
  },

  modalButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  menuButton: {
    position: "absolute",
    top: 4,
    left: 20,
    backgroundColor: "#000",
    borderRadius: 25,
    padding: 10,
    elevation: 5,
  },

  bookNow: {
    backgroundColor: "#00204a",
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 80,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: "#00f4f5",
  },
  bookNowText: {
    color: "#00f4f5",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  centerButton: {
    position: "absolute",
    top: 15,
    right: 60,
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 10,
    elevation: 5,
  },
  centerButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    justifyContent: "center",
  },
  destCardWrap: {
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  destCard: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  destInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  destLeadingIcon: {
    marginRight: 12,
    color: "#00E5FF",
  },
  iconPulseWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  destIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#00E5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  destText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#EAF2F7",
  },
  destArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackground: {
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
  closeButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },
  closeButtonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  favoriteScroll: {
    marginVertical: 10,
  },
  favoriteButton: {
    backgroundColor: "#00f4f5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  favoriteButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  suggestionsScroll: {
    marginVertical: 10,
  },
  suggestionButton: {
    backgroundColor: "rgba(4, 39, 58, 0.42)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    width: 105,
    height: 105,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.35)",
  },
  suggestionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 4,
  },
  containerDayli: {
    marginVertical: 24,
    paddingHorizontal: 10,
  },
  headerDayli: {
    color: "#00f4f5",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
    letterSpacing: 0.6,
  },
  scrollContainerDayli: {
    flexDirection: "row",
  },
  cardDayli: {
    backgroundColor: "rgba(10,46,61,0.48)",
    borderRadius: 24,
    width: 220,
    marginRight: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.18)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
    overflow: "hidden",
  },
  cardImageDayli: {
    width: "74%",
    height: 104,
    borderRadius: 12,
    marginBottom: 12,
    alignSelf: "center",

  },
  cardTitleDayli: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  cardSubtitleDayli: {
    color: "rgba(234,242,247,0.66)",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  containerAddress: {
    paddingHorizontal: 10,
  },
  addressCard: {
    backgroundColor: "rgba(4, 39, 58, 0.50)",
    borderRadius: 14,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#00f4f5",
  },
  icon: {
    marginRight: 15,
    color: "#00f4f5",
  },
  addressTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  addressSubtitle: {
    color: "#8a9bae",
    fontSize: 13,
    marginTop: 4,
  },
  containerHorizontal: {
    marginVertical: 20,
  },
  bannerImage: {
    width: 300,
    height: 150,
    borderRadius: 14,
    marginRight: 10,
  },
  selectedTypeContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(4, 39, 58, 0.55)',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(21, 229, 233, 0.35)',
  },
  selectedTypeText: {
    fontSize: 16,
    color: '#fff',
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
  userInfoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },

  userInfoText: {
    fontSize: 16,
    marginBottom: 5,
    color: "#fff",
  },

  closeIconImage: {
    width: 30,
    height: 30,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center"
  },

  finishButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  prevButtonText: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    alignSelf: "center",
    alignItems: "center"
  },
  imagePlaceholderText: {
    color: "#FAF6F6",
    fontSize: 12,

    justifyContent: "center",
  },
  picker: {
    width: "100%",
    height: 50,
  },

  tourContainer: {
    
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#01060a",
  },
  stepContainer: {
    
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
    backgroundColor:"#01060a"
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
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
    backgroundColor: "#707070",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  pickerContainer: {
    width: "100%",
    marginTop: 20,
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
  nextButton: {
    backgroundColor: "#00f4f5",
    width: 150,
    padding: 10,
    borderRadius: 10,
  },
  finishButton: {
    backgroundColor: "#00f4f5",
    marginTop: 20,
    width: 200,
    borderRadius: 10
  },
  closeIcon: {
    position: "absolute",
    top: 40,
    right: 20,
  },
  summaryText: {
    fontSize: 18,
    marginVertical: 5,
    color: "#fff",
  },
  stepMessage: {
    fontSize: 22, // Aumentar tamaño para más impacto
    fontWeight: "600", // Peso mediano para no saturar
    marginBottom: 20, // Más espacio entre elementos
    textAlign: "center",
    color: "#00f4f5", // Color más suave pero llamativo
    textShadowColor: "rgba(0, 0, 0, 0.15)", // Sombras más suaves
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8, // Sombra más dispersa
    letterSpacing: 0.8, // Espaciado entre letras para mejor legibilidad
    backgroundColor:"#01060a"
    
  },
  explanatoryText: {
    fontSize: 16,
    color: "#D7D7D7",
    textAlign: "center",
    marginVertical: 10,
  },
  linkButton: {
    color: "#00f4f5",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
  inlinePicker: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 10,
  },
  modalButtonTextios: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",

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
  notificationCard: {
    backgroundColor: "rgba(4, 39, 58, 0.52)",
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.32)",
  },
  notificationTextWrap: {
    flex: 1,
    justifyContent: "center",
  },
  notificationText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#fff",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  headerBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(4, 39, 58, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerBackIcon: {
    color: "#00f4f5",
  },
  profileMenuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
    backgroundColor: "#fff",
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  bookNowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
  },
  suggestionDescription: {
    fontSize: 12,
    color: "#fff",
    marginBottom: 10,
  },
  mainMenuBackWrap: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 5,
  },
  mainMenuBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(4, 39, 58, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(21, 229, 233, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  mainMenuBackIcon: {
    color: "#00f4f5",
  },
  promoCard: {
    backgroundColor: 'rgba(4, 39, 58, 0.52)',
    padding: 12,
    marginRight: 10,
    borderRadius: 14,
    width: 200,
    borderWidth: 1,
    borderColor: 'rgba(21, 229, 233, 0.32)',
    elevation: 2,
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00f4f5',
  },
  promoDescription: {
    fontSize: 14,
    color: '#8a9bae',
    marginVertical: 5,
  },
  promoCode: {
    fontSize: 12,
    color: '#00f4f5',
    fontStyle: 'italic',
  }
});

export default CustomerMap;
