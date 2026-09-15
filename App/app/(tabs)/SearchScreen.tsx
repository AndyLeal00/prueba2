import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSelector } from "react-redux";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootState } from "@/common/store";
import Entypo from "react-native-vector-icons/Entypo";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import * as Animatable from "react-native-animatable";
import { Ionicons, AntDesign, MaterialIcons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { API_KEY } from "@/config/AppConfig";
import { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { useCustomerNavBottomPad } from '@/components/CustomerBottomNav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Supabase REST directo (el cliente JS cuelga) ──
const MAX_FAVORITES = 5;

type Props = NativeStackScreenProps<any>;
const { width, height } = Dimensions.get("window");

interface Address {
  id: string;
  label: string;
  address: string;
  isFavorite?: boolean;
  typeAddress?: string | null;
  lat?: number;
  lng?: number;
  usageCount?: number;
}

const TYPE_ICONS: Record<string, { icon: string; family: string; color: string }> = {
  Casa: { icon: "home", family: "MaterialCommunityIcons", color: "#00E5FF" },
  Trabajo: { icon: "briefcase", family: "MaterialCommunityIcons", color: "#FFFFFF" },
  Gimnasio: { icon: "dumbbell", family: "MaterialCommunityIcons", color: "#00E5FF" },
  Supermercado: { icon: "cart", family: "MaterialCommunityIcons", color: "#00E676" },
  Parque: { icon: "tree", family: "MaterialCommunityIcons", color: "#69F0AE" },
  Escuela: { icon: "school", family: "MaterialCommunityIcons", color: "#00E5FF" },
  Restaurante: { icon: "silverware-fork-knife", family: "MaterialCommunityIcons", color: "#E91E63" },
  Otro: { icon: "map-marker-radius", family: "MaterialCommunityIcons", color: "#FFFFFF" },
};

// Floating diamond particle
const PARTICLES = [
  { size: 10, x: width * 0.12, y: height * 0.08, color: "#00E5FF", duration: 6000, delay: 0 },
  { size: 6,  x: width * 0.85, y: height * 0.14, color: "#FFFFFF", duration: 7500, delay: 400 },
  { size: 8,  x: width * 0.42, y: height * 0.25, color: "#00E5FF", duration: 8000, delay: 800 },
  { size: 5,  x: width * 0.7,  y: height * 0.38, color: "#FFFFFF", duration: 6500, delay: 200 },
  { size: 7,  x: width * 0.2,  y: height * 0.52, color: "#FFFFFF", duration: 7000, delay: 1000 },
  { size: 9,  x: width * 0.78, y: height * 0.62, color: "#00E5FF", duration: 8500, delay: 600 },
  { size: 5,  x: width * 0.55, y: height * 0.75, color: "#FFFFFF", duration: 6000, delay: 1200 },
  { size: 7,  x: width * 0.1,  y: height * 0.85, color: "#00E5FF", duration: 7200, delay: 300 },
  { size: 6,  x: width * 0.9,  y: height * 0.45, color: "#FFFFFF", duration: 6800, delay: 900 },
  { size: 4,  x: width * 0.35, y: height * 0.92, color: "#00E5FF", duration: 7800, delay: 500 },
];

const DiamondParticle = ({ size, x, y, color, duration, delay }: typeof PARTICLES[0]) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fade = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: duration / 2, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.08, duration: duration / 2, useNativeDriver: true }),
      ])
    );
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -12, duration, delay, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 12, duration: duration * 0.8, useNativeDriver: true }),
      ])
    );
    fade.start();
    drift.start();
    return () => { fade.stop(); drift.stop(); };
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        opacity,
        transform: [{ translateY }, { rotate: "45deg" }],
        backgroundColor: color,
        borderRadius: size * 0.18,
      }}
    />
  );
};

export default function FavoritesScreen({ navigation }: Props) {
  const user = useSelector((state: RootState) => state.auth.user) as any;
  const profile = useSelector((state: RootState) => state.auth.profile) as any;
  const insets = useSafeAreaInsets();
  const navBottomPad = useCustomerNavBottomPad();
  const headerTopPadding = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;
  const isCustomer = String(
    profile?.user_type ||
      user?.usertype ||
      user?.user_type ||
      user?.userType ||
      user?.user_metadata?.usertype ||
      user?.user_metadata?.user_type ||
      ''
  ).toLowerCase() === 'customer';
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newAddressDetails, setNewAddressDetails] = useState<any>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editingAddressLabel, setEditingAddressLabel] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchAutocompleteRef = useRef<any>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);

  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteType, setFavoriteType] = useState<string | null>(null);

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

  const headerAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(200, [
      Animated.spring(headerAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
      Animated.spring(listAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Resolver user_id de Supabase ──
  const resolveUserId = useCallback(async (): Promise<string | null> => {
    const authId = user?.id || user?.auth_id || profile?.auth_id || profile?.id;
    if (!authId) return null;
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const url = `${SUPABASE_URL}/rest/v1/users?or=(auth_id.eq.${encodeURIComponent(authId)},id.eq.${encodeURIComponent(authId)})&select=id&limit=1`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.[0]?.id || null;
    } catch { return null; }
  }, [user, profile]);

  // ── Cargar favoritos desde Supabase ──
  const loadFavorites = useCallback(async (userId: string) => {
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const url = `${SUPABASE_URL}/rest/v1/favorite_places?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) { console.warn('[FavPlaces] Error loading:', resp.status); return; }
      const rows = await resp.json();
      const mapped: Address[] = rows.map((r: any) => ({
        id: r.id,
        label: r.name || 'Lugar guardado',
        address: r.description,
        isFavorite: r.is_favorite,
        typeAddress: r.type_address,
        lat: r.latitude,
        lng: r.longitude,
        usageCount: r.usage_count,
      }));
      setAddresses(mapped);
    } catch (e) { console.warn('[FavPlaces] loadFavorites error:', e); }
  }, []);

  // ── Init: resolver userId + cargar datos ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      const uid = await resolveUserId();
      if (uid) {
        setSupabaseUserId(uid);
        await loadFavorites(uid);
      }
      setLoading(false);
    })();
  }, [user]);

  // ── Helpers: contar favoritos actuales ──
  const favoriteCount = addresses.filter(a => a.isFavorite).length;

  const handleLongPress = (address: Address) => {
    setSelectedAddress(address);
    setIsFavorite(address.isFavorite || false);
    setFavoriteType(address.typeAddress || null);
  };

  // ── UPDATE favorito (categoría + is_favorite) en Supabase ──
  const handleSaveFavorite = async () => {
    if (!selectedAddress || !supabaseUserId) return;
    // Validar límite de 5 al marcar como favorito
    if (isFavorite && !selectedAddress.isFavorite && favoriteCount >= MAX_FAVORITES) {
      showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos. Elimina uno para agregar otro.`);
      return;
    }
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const url = `${SUPABASE_URL}/rest/v1/favorite_places?id=eq.${encodeURIComponent(selectedAddress.id)}`;
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          is_favorite: isFavorite,
          type_address: favoriteType,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        if (err.includes('máximo 5')) {
          showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos.`);
        } else {
          showAlert('error', 'Error', 'No se pudo actualizar el lugar.');
        }
        return;
      }
      setAddresses(prev =>
        prev.map(a => a.id === selectedAddress.id ? { ...a, isFavorite, typeAddress: favoriteType } : a)
      );
    } catch (e) {
      console.warn('[FavPlaces] handleSaveFavorite error:', e);
      showAlert('error', 'Error', 'Error de conexi�n al guardar.');
    }
    setSelectedAddress(null);
    setIsFavorite(false);
    setFavoriteType(null);
  };

  const filteredAddresses = searchQuery.trim()
    ? addresses.filter(
        (a) =>
          a.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.typeAddress && a.typeAddress.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : addresses;

  // ── INSERT lugar desde barra de búsqueda → Supabase ──
  const handleSearchSelect = async (data: any, details: any = null) => {
    if (!details || !supabaseUserId) return;
    if (favoriteCount >= MAX_FAVORITES) {
      showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos. Elimina uno para agregar otro.`);
      return;
    }
    const description = details.formatted_address || data.description;
    const lat = details.geometry.location.lat;
    const lng = details.geometry.location.lng;
    const nameComponents = details.address_components || [];
    const shortName =
      nameComponents.find((c: any) => c.types.includes("route"))?.short_name ||
      nameComponents.find((c: any) => c.types.includes("sublocality"))?.short_name ||
      data.structured_formatting?.main_text ||
      "Lugar guardado";

    try {
      const headers = await getSupabaseAuthHeaders(true);
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/favorite_places`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id: supabaseUserId,
          name: shortName,
          description,
          latitude: lat,
          longitude: lng,
          is_favorite: true,
          type_address: 'Otro',
          usage_count: 1,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        if (err.includes('máximo 5') || err.includes('P0001')) {
          showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos.`);
        } else {
          console.warn('[FavPlaces] insert error:', err);
          showAlert('error', 'Error', 'No se pudo guardar el lugar.');
        }
        return;
      }
      const inserted = (await resp.json())[0];
      const newAddr: Address = {
        id: inserted.id,
        label: inserted.name,
        address: inserted.description,
        isFavorite: inserted.is_favorite,
        typeAddress: inserted.type_address,
        lat: inserted.latitude,
        lng: inserted.longitude,
        usageCount: inserted.usage_count,
      };
      setAddresses(prev => [newAddr, ...prev]);
    } catch (e) {
      console.warn('[FavPlaces] handleSearchSelect error:', e);
      showAlert('error', 'Error', 'Error de conexi�n al guardar.');
    }
    setSearchQuery("");
    searchAutocompleteRef.current?.setAddressText("");
  };

  // ── INSERT lugar desde modal "Nuevo Lugar" → Supabase ──
  const handleAddAddress = async () => {
    if (newAddressLabel.trim() === "" || newAddress.trim() === "") {
      showAlert('error', 'Error', 'Por favor, completa todos los campos.');
      return;
    }
    if (!newAddressDetails) {
      showAlert('error', 'Error', 'Por favor, selecciona una direcci�n v�lida.');
      return;
    }
    if (!supabaseUserId) {
      showAlert('error', 'Error', 'No se pudo identificar tu usuario.');
      return;
    }
    if (favoriteCount >= MAX_FAVORITES) {
      showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos. Elimina uno para agregar otro.`);
      return;
    }

    try {
      const headers = await getSupabaseAuthHeaders(true);
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/favorite_places`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id: supabaseUserId,
          name: newAddressLabel.trim(),
          description: newAddress,
          latitude: newAddressDetails.geometry.location.lat,
          longitude: newAddressDetails.geometry.location.lng,
          is_favorite: true,
          type_address: 'Otro',
          usage_count: 1,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        if (err.includes('m�ximo 5') || err.includes('P0001')) {
          showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos.`);
        } else {
          console.warn('[FavPlaces] modal insert error:', err);
          showAlert('error', 'Error', 'No se pudo guardar el lugar.');
        }
        return;
      }
      const inserted = (await resp.json())[0];
      const newAddr: Address = {
        id: inserted.id,
        label: inserted.name,
        address: inserted.description,
        isFavorite: inserted.is_favorite,
        typeAddress: inserted.type_address,
        lat: inserted.latitude,
        lng: inserted.longitude,
        usageCount: inserted.usage_count,
      };
      setAddresses(prev => [newAddr, ...prev]);
    } catch (e) {
      console.warn('[FavPlaces] handleAddAddress error:', e);
      showAlert('error', 'Error', 'Error de conexi�n al guardar.');
    }

    setNewAddressLabel("");
    setNewAddress("");
    setNewAddressDetails(null);
    setModalVisible(false);
  };

  const handleLocationSelect = (data: any, details: any = null) => {
    if (details) {
      const selectedAddr = details.formatted_address;
      setNewAddress(selectedAddr);
      setNewAddressDetails(details);
    } else {
      setNewAddress(data.description);
      setNewAddressDetails(null);
    }
  };

  const handleEditAddress = (id: string, label: string) => {
    setEditingAddressId(id);
    setEditingAddressLabel(label);
  };

  // ── UPDATE nombre del lugar en Supabase ──
  const handleSaveEdit = async (id: string) => {
    setEditingAddressId(null);
    const trimmed = editingAddressLabel.trim();
    if (!trimmed) { setEditingAddressLabel(""); return; }
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const url = `${SUPABASE_URL}/rest/v1/favorite_places?id=eq.${encodeURIComponent(id)}`;
      await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ name: trimmed }),
      });
      setAddresses(prev => prev.map(a => a.id === id ? { ...a, label: trimmed } : a));
    } catch (e) { console.warn('[FavPlaces] handleSaveEdit error:', e); }
    setEditingAddressLabel("");
  };

  const handleFavoriteTypeSelect = (type: string | null) => {
    setFavoriteType(type);
    setIsFavorite(type !== null);
  };

  // ── DELETE lugar de Supabase ──
  const handleDeleteAddress = (id: string) => {
    showAlert('confirm', 'Eliminar Direcci�n', '�Est�s seguro de que deseas eliminar esta direcci�n?', [
      { text: 'Cancelar', style: 'cancel', onPress: () => setAlertVisible(false) },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setAlertVisible(false);
          try {
            const headers = await getSupabaseAuthHeaders(true);
            const url = `${SUPABASE_URL}/rest/v1/favorite_places?id=eq.${encodeURIComponent(id)}`;
            const resp = await fetch(url, { method: 'DELETE', headers });
            if (!resp.ok) {
              showAlert('error', 'Error', 'No se pudo eliminar el lugar.');
              return;
            }
            setAddresses(prev => prev.filter(a => a.id !== id));
          } catch (e) {
            console.warn('[FavPlaces] delete error:', e);
            showAlert('error', 'Error', 'Error de conexi�n al eliminar.');
          }
        },
      },
    ]);
  };

  const getTypeIcon = (type: string | null) => {
    if (!type || !TYPE_ICONS[type]) return null;
    const { icon, color } = TYPE_ICONS[type];
    return <MaterialCommunityIcons name={icon as any} size={16} color={color} />;
  };

  const renderFavoriteTypeButton = (type: string | null, label: string) => {
    const isSelected = favoriteType === type;
    const typeInfo = type ? TYPE_ICONS[type] : null;
    return (
      <TouchableOpacity
        key={type ?? "none"}
        style={[styles.favoriteTypeButton, isSelected && styles.selectedFavoriteTypeButton]}
        onPress={() => handleFavoriteTypeSelect(type)}
        activeOpacity={0.7}
      >
        {typeInfo && (
          <MaterialCommunityIcons
            name={typeInfo.icon as any}
            size={20}
            color={isSelected ? "#fff" : typeInfo.color}
            style={{ marginRight: 6 }}
          />
        )}
        <Text style={[styles.favoriteTypeButtonText, isSelected && styles.selectedFavoriteTypeButtonText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderAddressItem = ({ item, index }: { item: Address; index: number }) => {
    const typeInfo = item.typeAddress ? TYPE_ICONS[item.typeAddress] : null;
    return (
      <Animatable.View animation="fadeInUp" duration={600} delay={index * 80} useNativeDriver>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleEditAddress(item.id, item.label)}
          onLongPress={() => handleLongPress(item)}
          style={styles.cardOuter}
        >
          <LinearGradient
            colors={["rgba(0,229,255,0.08)", "rgba(0,229,255,0.02)", "rgba(3,7,18,0.6)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addressCard}
          >
            {/* Icon circle */}
            <View style={[styles.iconCircle, { borderColor: typeInfo?.color || "#00E5FF" }]}>
              {typeInfo ? (
                <MaterialCommunityIcons name={typeInfo.icon as any} size={22} color={typeInfo.color} />
              ) : (
                <Entypo name="location-pin" size={22} color="#00E5FF" />
              )}
            </View>

            {/* Content */}
            <View style={styles.cardContent}>
              <View style={styles.cardTopRow}>
                {editingAddressId === item.id ? (
                  <TextInput
                    style={styles.editInput}
                    value={editingAddressLabel}
                    onChangeText={setEditingAddressLabel}
                    onBlur={() => handleSaveEdit(item.id)}
                    autoFocus
                    selectionColor="#00E5FF"
                  />
                ) : (
                  <Text style={styles.cardLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                )}
                {item.isFavorite && (
                  <Entypo name="star" size={16} color="#00E5FF" style={{ marginLeft: 6 }} />
                )}
              </View>
              <Text style={styles.cardAddress} numberOfLines={2}>
                {item.address}
              </Text>
              {item.typeAddress && (
                <View style={[styles.typeBadge, { borderColor: typeInfo?.color || "#00E5FF" }]}>
                  {getTypeIcon(item.typeAddress)}
                  <Text style={[styles.typeBadgeText, { color: typeInfo?.color || "#00E5FF" }]}>
                    {item.typeAddress}
                  </Text>
                </View>
              )}
            </View>

            {/* Delete */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteAddress(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="delete-outline" size={22} color="rgba(255,82,82,0.7)" />
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderEmptyList = () => (
    <Animatable.View animation="fadeIn" duration={800} style={styles.emptyContainer}>
      <MaterialCommunityIcons name="map-marker-off-outline" size={64} color="rgba(0,229,255,0.25)" />
      <Text style={styles.emptyTitle}>Sin direcciones guardadas</Text>
      <Text style={styles.emptySubtitle}>
        Toca el botón + para agregar tu primera dirección favorita
      </Text>
    </Animatable.View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#030712" />

      {/* Background gradient */}
      <LinearGradient colors={["#030712", "#051A26", "#030712"]} style={StyleSheet.absoluteFill} />

      {/* Diamond particles */}
      {PARTICLES.map((p, i) => (
        <DiamondParticle key={i} {...p} />
      ))}

      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          isCustomer && styles.headerCustomer,
          {
            paddingTop: headerTopPadding,
            opacity: headerAnim,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          },
        ]}
      >
        {!isCustomer ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <AntDesign name="arrow-left" size={24} color="#E9F6FF" />
          </TouchableOpacity>
        ) : null}
        <View style={[styles.headerTitleWrap, isCustomer && styles.headerTitleWrapCustomer]}>
          {isCustomer ? <Text style={styles.headerEyebrow}>T+plus</Text> : null}
          <Text style={styles.headerTitle}>Mis Direcciones</Text>
          <Text style={styles.headerSubtitle}>
            {favoriteCount}/{MAX_FAVORITES} favoritos • {addresses.length} {addresses.length === 1 ? "lugar" : "lugares"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (favoriteCount >= MAX_FAVORITES) {
              showAlert('warning', 'L�mite alcanzado', `Solo puedes tener ${MAX_FAVORITES} lugares favoritos. Elimina uno para agregar otro.`);
              return;
            }
            setModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={["#00E5FF", "#00B8D4"]}
            style={styles.addButtonGradient}
          >
            <Entypo name="plus" size={22} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Search bar - Google Places Autocomplete */}
      <View style={{ marginHorizontal: 20, marginTop: 8, marginBottom: 4, zIndex: 50 }}>
        <GooglePlacesAutocomplete
          ref={searchAutocompleteRef}
          enablePoweredByContainer={false}
          placeholder="Buscar destino..."
          minLength={3}
          debounce={400}
          fetchDetails={true}
          keyboardShouldPersistTaps="handled"
          listViewDisplayed="auto"
          keepResultsAfterBlur={true}
          onPress={handleSearchSelect}
          query={{
            key: API_KEY,
            language: "es",
            components: "country:co",
          }}
          textInputProps={{
            onChangeText: (text: string) => setSearchQuery(text),
            selectionColor: "#00E5FF",
            placeholderTextColor: "rgba(255,255,255,0.3)",
          }}
          renderLeftButton={() => (
            <View style={styles.searchIconLeft}>
              <Ionicons name="search" size={18} color="rgba(0,229,255,0.6)" />
            </View>
          )}
          renderRightButton={() =>
            searchQuery.length > 0 ? (
              <TouchableOpacity
                style={styles.searchClearBtn}
                onPress={() => {
                  setSearchQuery("");
                  searchAutocompleteRef.current?.setAddressText("");
                }}
              >
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            ) : null
          }
          styles={{
            container: { flex: 0 },
            textInputContainer: {
              backgroundColor: "transparent",
              borderTopWidth: 0,
              borderBottomWidth: 0,
            },
            textInput: {
              height: 46,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(0,229,255,0.1)",
              borderRadius: 14,
              paddingLeft: 40,
              paddingRight: 36,
              fontSize: 15,
              color: "#fff",
            },
            listView: {
              backgroundColor: "#0D2137",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(0,229,255,0.15)",
              marginTop: 4,
              elevation: 10,
              shadowColor: "#00E5FF",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
            },
            row: {
              backgroundColor: "transparent",
              paddingVertical: 14,
              paddingHorizontal: 16,
            },
            separator: { backgroundColor: "rgba(0,229,255,0.08)", height: 1 },
            description: { color: "#fff", fontSize: 14 },
          }}
          nearbyPlacesAPI="GooglePlacesSearch"
        />
      </View>

      {/* Section header */}
      <Animatable.View animation="fadeInLeft" duration={600} delay={300}>
        <View style={styles.sectionRow}>
          <View style={styles.sectionLine} />
          <Text style={styles.sectionTitle}>Lugares Frecuentes</Text>
          <View style={styles.sectionLine} />
        </View>
      </Animatable.View>

      {/* Address list */}
      <Animated.View style={[styles.listWrapper, { opacity: listAnim, zIndex: 1 }]}>
        {loading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color="#00E5FF" />
            <Text style={[styles.emptySubtitle, { marginTop: 16 }]}>Cargando lugares...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredAddresses}
            renderItem={renderAddressItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, isCustomer && { paddingBottom: navBottomPad + 30 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyList}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </Animated.View>

      {/* Modal: Add new address */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        presentationStyle="overFullScreen"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <LinearGradient
              colors={["#0A1628", "#0D2137", "#0A1628"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            {/* Modal glow */}
            <View style={styles.modalGlow} />

            <Text style={styles.modalTitle}>Nuevo Lugar</Text>
            <Text style={styles.modalSubtitle}>Agrega una dirección a tus favoritos</Text>

            <View style={{ marginVertical: 12, zIndex: 10 }}>
              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="label-outline" size={20} color="#00E5FF" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="Nombre del lugar (ej. Casa, Trabajo)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={newAddressLabel}
                  onChangeText={setNewAddressLabel}
                  selectionColor="#00E5FF"
                />
              </View>
              <GooglePlacesAutocomplete
                placeholder="Buscar dirección..."
                minLength={2}
                fetchDetails={true}
                onPress={handleLocationSelect}
                query={{
                  key: API_KEY,
                  language: "es",
                  components: "country:co",
                }}
                styles={{
                  textInput: {
                    height: 48,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(0,229,255,0.15)",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingLeft: 40,
                    fontSize: 15,
                    color: "#fff",
                  },
                  container: { flex: 0, zIndex: 10 },
                  listView: {
                    position: "absolute",
                    top: 52,
                    zIndex: 20,
                    backgroundColor: "#0D2137",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(0,229,255,0.15)",
                    elevation: 10,
                  },
                  row: { backgroundColor: "transparent", paddingVertical: 12 },
                  description: { color: "#fff", fontSize: 14 },
                  separator: { backgroundColor: "rgba(0,229,255,0.08)" },
                }}
                renderLeftButton={() => (
                  <View style={styles.autocompleteIcon}>
                    <Ionicons name="location-sharp" size={18} color="#00E5FF" />
                  </View>
                )}
                nearbyPlacesAPI="GooglePlacesSearch"
                debounce={200}
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleAddAddress} activeOpacity={0.8}>
              <LinearGradient colors={["#00E5FF", "#00B8D4"]} style={styles.saveButtonGradient}>
                <Ionicons name="bookmark" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>Guardar Lugar</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Edit / Favorite type */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={selectedAddress !== null}
        onRequestClose={() => setSelectedAddress(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={["#0A1628", "#0D2137", "#0A1628"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.modalGlow} />

            <Text style={styles.modalTitle}>Detalles del Lugar</Text>
            {selectedAddress && (
              <>
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="label-outline" size={20} color="#00E5FF" />
                  <Text style={styles.detailLabel}>{selectedAddress.label}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="location-sharp" size={20} color="#00E5FF" />
                  <Text style={styles.detailAddress}>{selectedAddress.address}</Text>
                </View>

                <Text style={styles.favoriteTypeTitle}>Categoría</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.favoriteTypeScroll}
                >
                  {renderFavoriteTypeButton(null, "Ninguna")}
                  {renderFavoriteTypeButton("Casa", "Casa")}
                  {renderFavoriteTypeButton("Trabajo", "Trabajo")}
                  {renderFavoriteTypeButton("Otro", "Otro")}
                  {renderFavoriteTypeButton("Gimnasio", "Gimnasio")}
                  {renderFavoriteTypeButton("Supermercado", "Mercado")}
                  {renderFavoriteTypeButton("Parque", "Parque")}
                  {renderFavoriteTypeButton("Escuela", "Escuela")}
                  {renderFavoriteTypeButton("Restaurante", "Restaurante")}
                </ScrollView>
              </>
            )}
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveFavorite} activeOpacity={0.8}>
              <LinearGradient colors={["#00E5FF", "#00B8D4"]} style={styles.saveButtonGradient}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>Guardar</Text>
              </LinearGradient>
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
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#030712",
  },
  // ─── Header ───
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerCustomer: {
    backgroundColor: "rgba(5,26,38,0.85)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitleWrapCustomer: {
    paddingHorizontal: 0,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#00E5FF",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  addButton: {
    borderRadius: 22,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  addButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  // ─── Search ───
  searchIconLeft: {
    position: "absolute",
    left: 12,
    top: 14,
    zIndex: 25,
  },
  searchClearBtn: {
    position: "absolute",
    right: 12,
    top: 14,
    zIndex: 25,
  },
  // ─── Section ───
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(0,229,255,0.12)",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(0,229,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginHorizontal: 12,
  },
  // ─── List ───
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  // ─── Card ───
  cardOuter: {
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.1)",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: "rgba(0,229,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#00E5FF",
    borderBottomWidth: 1,
    borderBottomColor: "#00E5FF",
    paddingVertical: 2,
  },
  cardAddress: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 3,
    lineHeight: 18,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(0,229,255,0.04)",
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deleteButton: {
    padding: 6,
  },
  // ─── Empty ───
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.3)",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  // ─── Modals ───
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.12)",
    borderBottomWidth: 0,
  },
  modalGlow: {
    position: "absolute",
    top: -60,
    left: width / 2 - 80,
    width: 160,
    height: 120,
    borderRadius: 80,
    backgroundColor: "#00E5FF",
    opacity: 0.08,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
  },
  autocompleteIcon: {
    position: "absolute",
    left: 12,
    top: 14,
    zIndex: 15,
  },
  saveButton: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 16,
    elevation: 6,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  saveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelButtonText: {
    color: "rgba(0,229,255,0.7)",
    fontWeight: "600",
    fontSize: 15,
  },
  // ─── Detail modal ───
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 14,
    paddingHorizontal: 4,
  },
  detailLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    marginLeft: 10,
    flex: 1,
  },
  detailAddress: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
  },
  favoriteTypeTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(0,229,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },
  favoriteTypeScroll: {
    paddingBottom: 4,
  },
  favoriteTypeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 8,
  },
  selectedFavoriteTypeButton: {
    backgroundColor: "rgba(0,229,255,0.2)",
    borderColor: "#00E5FF",
  },
  favoriteTypeButtonText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  selectedFavoriteTypeButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});




