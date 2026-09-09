import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  Animated,
  Easing,
  Platform,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { Ionicons, AntDesign, MaterialIcons, Feather } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/common/store";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import defaultProfileImage from "./../../assets/images/Avatar/1.png";
import { getUserVerification } from "@/common/topus-integration";
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from "axios";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_STORAGE_KEY, supabase } from '@/config/SupabaseConfig';
type Props = NativeStackScreenProps<any>;
import {
  listenToSettingsChanges,
  selectSettings,
} from "@/common/reducers/settingsSlice";
import { setProfile } from "@/common/store/authSlice";

const DocumentsScreen = ({ navigation }: Props) => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const user = useSelector((state: RootState) => state.auth.user);
  const profile = useSelector((state: RootState) => state.auth.profile);
  const dispatch = useDispatch();

  // Loading state
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [referralId, setReferralId] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [imageUriVehicle, setimageUriVehicle] = useState<string | null>(null);

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [editField, setEditField] = useState<{
    key: string;
    label: string;
    value: string;
    keyboard?: string;
    isCityPicker?: boolean;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

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

  const [fadeAnim] = useState(new Animated.Value(0));
  const settings = useSelector(selectSettings);
  const glowPulse = useRef(new Animated.Value(0)).current;
  const orbSpin = useRef(new Animated.Value(0)).current;
  const imageScaleAnim = useRef(new Animated.Value(1)).current;
  const editModalSlide = useRef(new Animated.Value(300)).current;

  const [cities] = useState([
    "Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena",
    "Cúcuta", "Bucaramanga", "Pereira", "Santa Marta", "Ibagué",
    "Pasto", "Manizales", "Neiva", "Villavicencio", "Armenia",
    "Valledupar", "Montería", "Sincelejo", "Popayán", "Floridablanca",
    "Palmira", "Bello", "Soledad", "Itagüí", "San Juan de Pasto",
    "Santa Rosa de Cabal", "Tuluá", "Yopal", "Tumaco", "Florencia",
    "Girardot", "Zipaquirá", "Buenaventura", "Riohacha", "Duitama",
    "Quibdó", "Arauca", "Tunja", "Magangué", "Sogamoso",
    "Girón", "Chía", "Facatativá", "Rionegro", "Piedecuesta",
    "Ciénaga", "La Dorada", "Maicao", "Calarcá", "Fundación",
    "La Ceja", "Chiquinquirá", "Sahagún", "Villa del Rosario",
    "Montelíbano", "Arjona", "Turbo", "Tame", "El Banco",
    "Sabanalarga", "Ipiales", "Túquerres", "Pitalito", "La Plata",
    "Baranoa", "El Carmen de Bolívar", "San Jacinto", "Santo Tomás",
    "Repelón", "Planeta Rica", "Ciénaga de Oro", "San Onofre",
    "María la Baja", "Clemencia", "San Juan Nepomuceno", "El Guamo",
    "Sampués", "San Carlos", "Morroa", "Corozal", "Turbaco",
    "San Juan del Cesar", "Ayapel", "Cereté", "Sincé", "Chinú",
    "Ovejas", "Tolú", "Tuchín", "Bosconia", "Aguachica",
    "Gamarra", "San Alberto", "Curumaní", "Manaure", "Copey",
    "San Diego", "La Paz", "Valencia", "San Martín", "San Andrés",
    "Providencia", "San Vicente del Caguán", "Mocoa", "Puerto Asís",
  ]);

  // Fetch profile on mount - REST API directo
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadProfile = async () => {
      const authId = user?.id;
      if (!authId) return;

      console.log('[DocumentsScreen] Cargando perfil REST para:', authId);
      setProfileLoading(true);

      try {
        // Si el bucket/tabla requiere RLS authenticated, mandamos el JWT de la sesión.
        let bearer = SUPABASE_ANON_KEY;
        try {
          const sessionStr = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
          if (sessionStr) {
            const sessionData = JSON.parse(sessionStr);
            const token = sessionData?.access_token || sessionData?.session?.access_token;
            if (token) bearer = token;
          }
        } catch {}

        const url = `${SUPABASE_URL}/rest/v1/users?or=(auth_id.eq.${authId},id.eq.${authId})&limit=1`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (cancelled) return;

        const data = await response.json();
        console.log('[DocumentsScreen] REST response status:', response.status, 'rows:', Array.isArray(data) ? data.length : 'not-array');

        if (Array.isArray(data) && data.length > 0) {
          const p = data[0];
          console.log('[DocumentsScreen] Perfil:', p.first_name, p.last_name, p.city, p.mobile);
          setName(p.first_name || '');
          setLastName(p.last_name || '');
          setMobile(p.mobile || '');
          setReferralId(p.referral_id || '');
          setCity(p.city || '');
          setEmail(p.email || user?.email || '');
          setLicenseNumber(p.license_number || '');
          dispatch(setProfile(p));
        } else {
          setEmail(user?.email || '');
        }
      } catch (e: any) {
        if (!cancelled) {
          console.log('[DocumentsScreen] Fetch cancelado o error:', e?.name === 'AbortError' ? 'unmount' : e?.message);
          setEmail(user?.email || '');
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    loadProfile();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user?.id]);

  // Fallback: if user is available but no profile, use user data directly
  useEffect(() => {
    if (!profile && user) {
      setEmail(user.email || "");
    }
  }, [user]);

  // Sync form fields when profile changes
  useEffect(() => {
    if (profile) {
      setName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setMobile(profile.mobile || "");
      setReferralId(profile.referral_id || "");
      setCity(profile.city || "");
      setEmail(profile.email || user?.email || "");
      setLicenseNumber(profile.license_number || "");
      if (profile.profile_image && !imageUriVehicle) {
        setimageUriVehicle(null); // Let the profile image show from profile
      }
    }
  }, [profile]);

  useEffect(() => {
    dispatch(listenToSettingsChanges());
  }, [dispatch]);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const orbLoop = Animated.loop(
      Animated.timing(orbSpin, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    glowLoop.start();
    orbLoop.start();

    return () => {
      glowLoop.stop();
      orbLoop.stop();
    };
  }, [glowPulse, orbSpin]);

  // Animate profile image when changed
  const animateImageChange = () => {
    Animated.sequence([
      Animated.timing(imageScaleAnim, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(imageScaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const selectImage = async (fromCamera: boolean) => {
    let result;
    if (fromCamera) {
      result = await ImagePicker.launchCameraAsync();
    } else {
      result = await ImagePicker.launchImageLibraryAsync();
    }

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setimageUriVehicle(uri);
      animateImageChange();
    }

    setModalVisible(false);
  };

  // Open edit modal for a field
  const openEditModal = (key: string, label: string, value: string, keyboard?: string, isCityPicker?: boolean) => {
    setEditField({ key, label, value, keyboard, isCityPicker });
    setEditValue(value);
    setEditModalVisible(true);
    Animated.spring(editModalSlide, {
      toValue: 0,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
  };

  const closeEditModal = () => {
    Animated.timing(editModalSlide, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setEditModalVisible(false);
      setEditField(null);
      setCitySearch("");
    });
  };

  const confirmEdit = () => {
    if (!editField) return;
    const setterMap: Record<string, (v: string) => void> = {
      first_name: setName,
      last_name: setLastName,
      mobile: setMobile,
      referral_id: setReferralId,
      city: setCity,
      email: setEmail,
      license_number: setLicenseNumber,
    };
    const setter = setterMap[editField.key];
    if (setter) setter(editValue);
    closeEditModal();
  };

  const resolveAuthIdFromSession = async (): Promise<string | null> => {
    try {
      const sessionStr = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionStr) {
        const sessionData = JSON.parse(sessionStr);
        const token = sessionData?.access_token || sessionData?.session?.access_token;
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload?.sub) return payload.sub as string;
          } catch {}
        }
      }
    } catch {}
    return user?.id || (profile as any)?.auth_id || null;
  };

  const uploadProfileImage = async (): Promise<string | null> => {
    if (!imageUriVehicle) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session?.user?.id) {
        throw new Error('Sesión no encontrada. Inicia sesión nuevamente.');
      }

      const base64 = await FileSystem.readAsStringAsync(imageUriVehicle, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64) throw new Error('No se pudo leer la imagen seleccionada');

      const storagePath = `${session.user.id}/profile_image.jpg`;
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/user-profiles/${storagePath}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let uploadResponse: Response;
      try {
        uploadResponse = await fetch(storageUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true',
          },
          body: decode(base64),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text().catch(() => '');
        throw new Error(`Error al subir imagen (${uploadResponse.status}): ${errText.substring(0, 200)}`);
      }

      const { data: pub } = supabase.storage
        .from('user-profiles')
        .getPublicUrl(storagePath);

      return `${pub.publicUrl}?v=${Date.now()}`;
    } catch (err: any) {
      console.error('[DocumentsScreen] Error subiendo imagen:', err?.message);
      showAlert('error', 'Error de imagen', err?.message || 'No se pudo subir la imagen');
      return null;
    }
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);

      const updatedData: Record<string, any> = {
        first_name: name,
        last_name: lastName,
        mobile: mobile,
        referral_id: referralId,
        city: city,
        email: email,
        license_number: licenseNumber,
        updated_at: new Date().toISOString(),
      };

      // Si hay imagen local seleccionada, subirla a Storage primero
      if (imageUriVehicle) {
        const uploadedImageUrl = await uploadProfileImage();
        if (uploadedImageUrl) {
          updatedData.profile_image = uploadedImageUrl;
        } else {
          // Si la subida falla, detener la actualización
          setLoading(false);
          return;
        }
      }

      // Eliminar campos vacíos (excepto city que se permite null para limpiarla)
      Object.keys(updatedData).forEach(key => {
        if (key === 'city') {
          if (!updatedData[key]) updatedData[key] = null;
          return;
        }
        if (key !== 'updated_at' && (updatedData[key] === '' || updatedData[key] === null || updatedData[key] === undefined)) {
          delete updatedData[key];
        }
      });

      const fieldsToUpdate = Object.keys(updatedData).filter(k => k !== 'updated_at');
      if (fieldsToUpdate.length === 0) {
        showAlert('info', 'Sin cambios', 'No se detectaron datos para actualizar.');
        setLoading(false);
        return;
      }

      const authId = await resolveAuthIdFromSession();
      if (!authId) {
        showAlert('error', 'Error', 'No se encontró el ID del usuario autenticado.');
        setLoading(false);
        return;
      }

      // Usar el SDK de supabase para que maneje el JWT automáticamente (RLS)
      const { data: rows, error: updateError } = await supabase
        .from('users')
        .update(updatedData)
        .eq('auth_id', authId)
        .select();

      if (updateError) {
        setLoading(false);
        console.error('[DocumentsScreen] Error update:', updateError.message);
        showAlert('error', 'Error', `No se pudo actualizar: ${updateError.message}`);
        return;
      }

      if (!rows || rows.length === 0) {
        setLoading(false);
        console.error('[DocumentsScreen] 0 rows actualizadas');
        showAlert('error', 'Error', 'No se encontró el perfil para actualizar.');
        return;
      }

      const p = rows[0];
      setName(p.first_name || '');
      setLastName(p.last_name || '');
      setMobile(p.mobile || '');
      setReferralId(p.referral_id || '');
      setCity(p.city || '');
      setEmail(p.email || '');
      setLicenseNumber(p.license_number || '');
      dispatch(setProfile(p));
      if (imageUriVehicle) setimageUriVehicle(null);

      setLoading(false);
      setSuccessModalVisible(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => setSuccessModalVisible(false));
      }, 2000);
      showAlert('success', 'Perfil actualizado', `Se actualizaron: ${fieldsToUpdate.join(', ')}`);
    } catch (err: any) {
      setLoading(false);
      console.error('[DocumentsScreen] handleUpdate error:', err?.message);
      showAlert('error', 'Error inesperado', err?.message || 'Ocurrió un error al actualizar.');
    }
  };

  const verifyUserInTopus = async (data: any) => {
    showAlert('info', 'Consulta de antecedentes en proceso', 'Estamos verificando tu cuenta para asegurarnos de que todo esté en orden y así protegerte a ti y a los demás usuarios. Este proceso solo tomará unos 5 minutos.');
    return await getUserVerification({
      doc_type: data.docType,
      identification: data.verifyId,
      name: data.firstName,
    });
  };

  // Field row component
  const FieldRow = ({ icon, label, value, fieldKey, keyboard, isCityPicker }: {
    icon: string;
    label: string;
    value: string;
    fieldKey: string;
    keyboard?: string;
    isCityPicker?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.fieldRow}
      onPress={() => openEditModal(fieldKey, label, value, keyboard, isCityPicker)}
      activeOpacity={0.7}
    >
      <View style={styles.fieldIconContainer}>
        <Ionicons name={icon as any} size={20} color="#00E5FF" />
      </View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>
          {value || "Toca para agregar"}
        </Text>
      </View>
      <Feather name="edit-2" size={16} color="#5C8A9D" />
    </TouchableOpacity>
  );

  // Get the display image
  const displayImage = imageUriVehicle
    ? { uri: imageUriVehicle }
    : profile?.profile_image
      ? { uri: profile.profile_image }
      : defaultProfileImage;

  const styles = createStyles(isDarkMode);
  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22],
  });
  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.42],
  });
  const orbRotate = orbSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (profileLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00E5FF" />
        <Text style={{ color: '#8FB3C5', marginTop: 12, fontSize: 14 }}>Cargando perfil...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.bgLayer}>
        <Animated.View
          style={[
            styles.bgGlow,
            styles.bgGlowTop,
            { transform: [{ scale: glowScale }], opacity: glowOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.bgGlow,
            styles.bgGlowBottom,
            {
              transform: [{ scale: glowScale }],
              opacity: glowOpacity,
            },
          ]}
        />
        <Animated.View
          style={[styles.bgOrb, { transform: [{ rotate: orbRotate }] }]}
        />
        <View style={styles.bgGrid} />
      </View>

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <AntDesign name="arrow-left" size={22} color="#E9F6FF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerText}>Datos Personales</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="sparkles-outline" size={18} color="#00E5FF" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Image Section */}
        <TouchableOpacity
          style={styles.profileContainer}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.9}
        >
          <Animated.View style={[styles.profileRing, { transform: [{ scale: imageScaleAnim }] }]}>
            <Image source={displayImage} style={styles.profileImage} />
          </Animated.View>
          <View style={styles.cameraIcon}>
            <Ionicons name="camera" size={16} color="#071822" />
          </View>
          {imageUriVehicle && (
            <View style={styles.imageChangedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#00E5FF" />
              <Text style={styles.imageChangedText}>Nueva foto seleccionada</Text>
            </View>
          )}
          <Text style={styles.avatarHint}>Toca para cambiar tu foto</Text>
        </TouchableOpacity>

        {/* User Info Card */}
        <View style={styles.userInfoCard}>
          <Text style={styles.userName}>
            {name || lastName ? `${name} ${lastName}`.trim() : "Sin nombre"}
          </Text>
          <Text style={styles.userEmail}>{email || "Sin email"}</Text>
          {profile?.user_type && (
            <View style={styles.userTypeBadge}>
              <Text style={styles.userTypeText}>
                {profile.user_type === 'driver' ? 'Conductor' : profile.user_type === 'customer' ? 'Pasajero' : profile.user_type}
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.documentsButton}
            onPress={() => navigation.navigate("ImageGallery")}
            activeOpacity={0.85}
          >
            <AntDesign name="idcard" size={22} color="#E91E63" />
            <Text style={styles.buttonText}>Documentos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.updateButton, loading && { opacity: 0.6 }]}
            onPress={handleUpdate}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#04202C" />
            ) : (
              <Text style={styles.updateButtonText}>Guardar Cambios</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Ver Carnet (solo clientes) */}
        {profile?.user_type === 'customer' && (
          <TouchableOpacity
            style={styles.carnetButton}
            onPress={() => navigation.navigate("Carnet")}
            activeOpacity={0.85}
          >
            <Ionicons name="card-outline" size={22} color="#00E5FF" />
            <Text style={styles.carnetButtonText}>Ver Carnet</Text>
          </TouchableOpacity>
        )}

        {/* Editable Fields */}
        <View style={styles.infoContainer}>
          <Text style={styles.sectionTitle}>Información Personal</Text>
          <FieldRow icon="person-outline" label="Nombres" value={name} fieldKey="first_name" />
          <FieldRow icon="person-outline" label="Apellidos" value={lastName} fieldKey="last_name" />
          <FieldRow icon="call-outline" label="Celular" value={mobile} fieldKey="mobile" keyboard="phone-pad" />
          <FieldRow icon="mail-outline" label="Email" value={email} fieldKey="email" keyboard="email-address" />
          <FieldRow icon="location-outline" label="Ciudad" value={city} fieldKey="city" isCityPicker={true} />

        </View>
      </ScrollView>

      {/* Image Picker Modal */}
      <Modal
        transparent={true}
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <Text style={styles.modalText}>Selecciona una opción</Text>
            <TouchableOpacity
              style={styles.botonCamera}
              onPress={() => selectImage(true)}
            >
              <Ionicons name="camera" size={24} color="white" />
              <Text style={styles.modalButtonText}>Tomar Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.botonGallery}
              onPress={() => selectImage(false)}
            >
              <Ionicons name="images" size={24} color="white" />
              <Text style={styles.modalButtonText}>
                Cargar desde Dispositivo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <MaterialIcons name="cancel" size={24} color="#00f4f5" />
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Field Modal */}
      <Modal
        transparent={true}
        visible={editModalVisible}
        animationType="none"
        onRequestClose={closeEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.editModalOverlay}
        >
          <TouchableOpacity
            style={styles.editModalBackdrop}
            activeOpacity={1}
            onPress={closeEditModal}
          />
          <Animated.View
            style={[styles.editModalContent, { transform: [{ translateY: editModalSlide }] }]}
          >
            <View style={styles.editModalHandle} />
            <Text style={styles.editModalTitle}>
              Editar {editField?.label}
            </Text>

            {editField?.isCityPicker ? (
              <>
                <TextInput
                  style={styles.citySearchInput}
                  value={citySearch}
                  onChangeText={setCitySearch}
                  placeholder="Buscar ciudad..."
                  placeholderTextColor="#5C8A9D"
                />
                <View style={styles.editPickerContainer}>
                  <FlatList
                    data={cities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))}
                    keyExtractor={(item) => item}
                    style={styles.editCityList}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    renderItem={({ item }) => {
                      const selected = editValue === item;
                      return (
                        <TouchableOpacity
                          style={[styles.editCityItem, selected && styles.editCityItemSelected]}
                          onPress={() => setEditValue(item)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.editCityText, selected && styles.editCityTextSelected]}>
                            {item}
                          </Text>
                          {selected && (
                            <Ionicons name="checkmark-circle" size={18} color="#00E5FF" />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              </>
            ) : (
              <TextInput
                style={styles.editInput}
                value={editValue}
                onChangeText={setEditValue}
                placeholder={`Ingrese ${editField?.label?.toLowerCase()}`}
                placeholderTextColor="#5C8A9D"
                keyboardType={
                  editField?.keyboard === 'phone-pad' ? 'phone-pad' :
                  editField?.keyboard === 'email-address' ? 'email-address' : 'default'
                }
                autoFocus
              />
            )}

            <View style={styles.editModalButtons}>
              <TouchableOpacity style={styles.editCancelBtn} onPress={closeEditModal}>
                <Text style={styles.editCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editConfirmBtn} onPress={confirmEdit}>
                <Ionicons name="checkmark" size={20} color="#04202C" />
                <Text style={styles.editConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success Modal */}
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
            <Ionicons name="checkmark-circle" size={48} color="#00E5FF" />
            <Text style={styles.successModalText}>Actualizado con éxito</Text>
          </Animated.View>
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

const createStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#051A26",
    },
    bgLayer: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden",
      zIndex: 0,
    },
    bgGlow: {
      position: "absolute",
      borderRadius: 999,
      backgroundColor: "#00E5FF",
      shadowColor: "#00E5FF",
      shadowOpacity: 0.35,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 8 },
      elevation: 14,
    },
    bgGlowTop: {
      width: 240,
      height: 240,
      top: -110,
      right: -80,
    },
    bgGlowBottom: {
      width: 210,
      height: 210,
      bottom: 120,
      left: -90,
      backgroundColor: "#00B8D4",
    },
    bgOrb: {
      position: "absolute",
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 1,
      borderColor: "rgba(0,229,255,0.12)",
      top: "42%",
      right: -90,
    },
    bgGrid: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(2, 16, 24, 0.58)",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 48,
      paddingBottom: 12,
      zIndex: 2,
    },
    headerBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "rgba(0,229,255,0.15)",
      backgroundColor: "rgba(10, 46, 61, 0.65)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerCenter: {
      flex: 1,
      alignItems: "center",
    },
    headerText: {
      fontSize: 20,
      fontWeight: "800",
      color: "#E9F6FF",
      letterSpacing: 0.2,
    },
    headerBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(0,229,255,0.18)",
      backgroundColor: "rgba(10, 46, 61, 0.65)",
      alignItems: "center",
      justifyContent: "center",
    },
    profileContainer: {
      alignItems: "center",
      marginTop: 8,
      marginBottom: 16,
    },
    profileRing: {
      width: 124,
      height: 124,
      borderRadius: 62,
      padding: 3,
      backgroundColor: "#00E5FF",
      shadowColor: "#00E5FF",
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    profileImage: {
      width: 118,
      height: 118,
      borderRadius: 59,
      backgroundColor: "#0A2E3D",
    },
    cameraIcon: {
      position: "absolute",
      bottom: 28,
      right: "33%",
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#00E5FF",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#051A26",
    },
    imageChangedBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0, 229, 255, 0.15)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.3)",
    },
    imageChangedText: {
      color: "#00E5FF",
      fontSize: 11,
      fontWeight: "600",
      marginLeft: 4,
    },
    avatarHint: {
      marginTop: 6,
      color: "#8FB3C5",
      fontSize: 12,
      fontWeight: "500",
    },
    userInfoCard: {
      alignItems: "center",
      marginBottom: 20,
    },
    userName: {
      fontSize: 22,
      fontWeight: "800",
      color: "#E9F6FF",
      letterSpacing: 0.3,
    },
    userEmail: {
      fontSize: 13,
      color: "#7BA8BC",
      marginTop: 4,
    },
    userTypeBadge: {
      marginTop: 8,
      backgroundColor: "rgba(0, 229, 255, 0.12)",
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.25)",
    },
    userTypeText: {
      fontSize: 12,
      color: "#00E5FF",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    buttonContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 22,
      gap: 10,
    },
    updateButton: {
      backgroundColor: "#00E5FF",
      paddingVertical: 14,
      borderRadius: 20,
      alignItems: "center",
      flex: 1,
      shadowColor: "#00E5FF",
      shadowOpacity: 0.34,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    updateButtonText: {
      color: "#04202C",
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    documentsButton: {
      backgroundColor: "rgba(9, 45, 60, 0.72)",
      paddingVertical: 14,
      borderRadius: 20,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      flex: 1,
      borderWidth: 1,
      borderColor: "rgba(255, 106, 123, 0.4)",
    },
    buttonText: {
      color: "#E91E63",
      fontSize: 14,
      fontWeight: "700",
      marginLeft: 8,
    },
    carnetButton: {
      backgroundColor: "rgba(0, 229, 255, 0.08)",
      paddingVertical: 14,
      borderRadius: 20,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 22,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.4)",
    },
    carnetButtonText: {
      color: "#00E5FF",
      fontSize: 14,
      fontWeight: "700",
      marginLeft: 8,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 28,
      zIndex: 2,
    },
    infoContainer: {
      backgroundColor: "rgba(8, 36, 49, 0.72)",
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.14)",
    },
    sectionTitle: {
      fontSize: 13,
      color: "#00E5FF",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 12,
      marginTop: 4,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: "rgba(0, 229, 255, 0.1)",
      marginVertical: 14,
    },
    // Field Row (tap to edit pattern)
    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(7, 35, 48, 0.6)",
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.1)",
    },
    fieldIconContainer: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: "rgba(0, 229, 255, 0.08)",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    fieldContent: {
      flex: 1,
    },
    fieldLabel: {
      fontSize: 11,
      color: "#7BA8BC",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    fieldValue: {
      fontSize: 15,
      color: "#E9F6FF",
      fontWeight: "500",
    },
    fieldPlaceholder: {
      color: "#4A7A8F",
      fontStyle: "italic",
    },
    // Image picker modal
    modalContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(2, 10, 16, 0.74)",
    },
    modalView: {
      width: 320,
      padding: 20,
      backgroundColor: "rgba(9, 39, 52, 0.95)",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.28)",
      alignItems: "center",
      elevation: 10,
    },
    modalText: {
      fontSize: 18,
      fontWeight: "700",
      color: "#E9F6FF",
      marginBottom: 20,
    },
    botonCamera: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#0A2E3D",
      padding: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.24)",
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
      borderRadius: 14,
      marginBottom: 15,
      width: "100%",
      justifyContent: "center",
      elevation: 5,
    },
    modalButtonText: {
      color: "white",
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    cancelButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(9, 39, 52, 0.85)",
      padding: 15,
      borderRadius: 14,
      marginTop: 10,
      width: "100%",
      justifyContent: "center",
      elevation: 5,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.28)",
    },
    cancelButtonText: {
      color: "#00f4f5",
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    // Edit field modal (bottom sheet style)
    editModalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    editModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(2, 10, 16, 0.6)",
    },
    editModalContent: {
      backgroundColor: "#092734",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.2)",
      borderBottomWidth: 0,
    },
    editModalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: "rgba(0, 229, 255, 0.3)",
      alignSelf: "center",
      marginBottom: 20,
    },
    editModalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: "#E9F6FF",
      marginBottom: 16,
    },
    editInput: {
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.3)",
      borderRadius: 14,
      padding: 14,
      fontSize: 16,
      color: "#E9F6FF",
      backgroundColor: "rgba(7, 35, 48, 0.72)",
      marginBottom: 20,
    },
    citySearchInput: {
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.3)",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: "#E9F6FF",
      backgroundColor: "rgba(7, 35, 48, 0.72)",
      marginBottom: 10,
    },
    editPickerContainer: {
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.3)",
      borderRadius: 14,
      marginBottom: 20,
      backgroundColor: "rgba(7, 35, 48, 0.72)",
      overflow: "hidden",
    },
    editCityList: {
      height: 320,
    },
    editCityItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 48,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 229, 255, 0.08)",
    },
    editCityItemSelected: {
      backgroundColor: "rgba(0, 229, 255, 0.1)",
    },
    editCityText: {
      fontSize: 15,
      color: "#8FB3C5",
    },
    editCityTextSelected: {
      color: "#00E5FF",
      fontWeight: "600",
    },
    editModalButtons: {
      flexDirection: "row",
      gap: 12,
    },
    editCancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: "rgba(7, 35, 48, 0.72)",
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.15)",
    },
    editCancelText: {
      color: "#8FB3C5",
      fontSize: 15,
      fontWeight: "600",
    },
    editConfirmBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      backgroundColor: "#00E5FF",
      shadowColor: "#00E5FF",
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    editConfirmText: {
      color: "#04202C",
      fontSize: 15,
      fontWeight: "700",
      marginLeft: 6,
    },
    // Success modal
    successModalContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(2, 10, 16, 0.74)",
    },
    successModalView: {
      width: 250,
      padding: 20,
      backgroundColor: "rgba(9, 39, 52, 0.95)",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(0, 229, 255, 0.35)",
      alignItems: "center",
      elevation: 10,
    },
    successModalText: {
      color: "#E9F6FF",
      fontSize: 18,
      fontWeight: "bold",
      marginTop: 10,
    },
  });

export default DocumentsScreen;

