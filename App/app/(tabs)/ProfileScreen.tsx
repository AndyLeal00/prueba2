import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useIsFocused } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import supabase, { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseAuthHeaders } from "@/config/SupabaseConfig";
import { RootState } from "@/common/store";
import { settings } from "@/scripts/settings";
import { logout } from "@/common/reducers/authReducer";
import { AppConfig } from "@/config/AppConfig";
import { getDriverOwnReferralCode, DriverReferralCode } from "@/common/services/referralsService";
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { useCustomerNavBottomPad } from '@/components/CustomerBottomNav';
import { useDriverNavBottomPad, useIsDriverUser } from '@/components/DriverBottomNav';
import { useActiveTripBanner } from '@/hooks/useActiveTripBanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { fetchAndSyncUserRating } from '@/common/utils/userRating';

const emptyProfile = {
  firstName: null as string | null,
  lastName: null as string | null,
  mobile: null as string | null,
  documentType: null as string | null,
  documentNumber: null as string | null,
  userType: null as string | null,
  referredByCode: null as string | null,
  referralId: null as string | null,
  rating: null as number | null,
  ratingCount: 0,
  userRowId: null as string | null,
  profileImage: null as string | null,
  completedTrips: 0,
};

type Props = NativeStackScreenProps<any>;

type PickerItem = {
  key: string;
  label: string;
  onPress: () => void;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  isSOS?: boolean;
};

type MenuSection = {
  title: string;
  items: PickerItem[];
};

const BG_IMAGE = require("../../assets/images/bg.png");

const LiquidGlass = ({
  style,
  children,
}: {
  style?: object;
  children: React.ReactNode;
}) => (
  <View style={[styles.glassOuter, style]}>
    <View style={styles.glassContent}>{children}</View>
  </View>
);

const ProfileScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const user = useSelector((state: RootState) => state.auth.user) as any;
  const profile = useSelector((state: RootState) => state.auth.profile) as any;
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(false);
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
  const [dbProfile, setDbProfile] = useState({ ...emptyProfile });
  // Código de referido PROPIO (AAA-XXXXX) + conteo. null = aún generándose.
  const [ownReferral, setOwnReferral] = useState<DriverReferralCode | null>(null);
  const currentUserType = String(
    dbProfile.userType ||
      user?.usertype ||
      user?.user_type ||
      user?.userType ||
      user?.user_metadata?.usertype ||
      user?.user_metadata?.user_type ||
      "customer"
  )
    .trim()
    .toLowerCase();

  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;
    const controller = new AbortController();

    const fetchProfileData = async () => {
      const authId = user?.id || user?.auth_id;
      if (!authId) {
        if (!cancelled) setDbProfile({ ...emptyProfile });
        return;
      }

      try {
        const url = `${SUPABASE_URL}/rest/v1/users?or=(auth_id.eq.${encodeURIComponent(authId)},id.eq.${encodeURIComponent(authId)})&select=id,first_name,last_name,mobile,document_type,document_number,user_type,referred_by_code,referral_id,rating,profile_image&limit=1`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (cancelled) return;
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          const p = data[0];
          const rowId = String(p.id || '');
          const roleRaw = String(p.user_type || '').toLowerCase();
          const role = roleRaw === 'driver' ? 'driver' : 'customer';

          let rating: number | null =
            p.rating !== null && p.rating !== undefined ? Number(p.rating) : null;
          let ratingCount = 0;
          let completedTrips = 0;

          // Recalcular desde bookings (users.rating suele quedar en 0)
          if (rowId) {
            try {
              const synced = await fetchAndSyncUserRating(rowId, role, { syncToProfile: true });
              ratingCount = synced.count;
              rating = synced.count > 0 ? synced.average : null;
            } catch (e) {
              console.warn('[Profile] sync rating failed:', e);
              if (rating === 0) rating = null;
            }

            // Viajes COMPLETE/PAID (reservas + inmediatos)
            try {
              const authHeaders = await getSupabaseAuthHeaders();
              const idFilter =
                role === 'driver'
                  ? `or=(driver_id.eq.${encodeURIComponent(rowId)},driver.eq.${encodeURIComponent(rowId)})`
                  : `or=(customer_id.eq.${encodeURIComponent(rowId)},customer.eq.${encodeURIComponent(rowId)})`;
              const countUrl =
                `${SUPABASE_URL}/rest/v1/bookings?${idFilter}` +
                `&status=in.(COMPLETE,PAID)&select=id`;
              const countRes = await fetch(countUrl, {
                method: 'GET',
                headers: {
                  ...authHeaders,
                  Prefer: 'count=exact',
                  Range: '0-0',
                },
                signal: controller.signal,
              });
              if (countRes.ok) {
                const range = countRes.headers.get('content-range') || '';
                const totalPart = range.split('/')[1];
                const n = Number(totalPart);
                completedTrips = Number.isFinite(n) && n >= 0 ? n : 0;
              }
            } catch (e) {
              console.warn('[Profile] completed trips count failed:', e);
            }
          }

          if (!cancelled) {
            setDbProfile({
              firstName: p.first_name || null,
              lastName: p.last_name || null,
              mobile: p.mobile || null,
              documentType: p.document_type || null,
              documentNumber: p.document_number || null,
              userType: p.user_type || null,
              referredByCode: p.referred_by_code || null,
              referralId: p.referral_id || null,
              rating,
              ratingCount,
              userRowId: rowId || null,
              profileImage: p.profile_image || null,
              completedTrips,
            });
          }
        }
      } catch (e: any) {
        if (!cancelled && e?.name !== 'AbortError') {
          setDbProfile({ ...emptyProfile });
        }
      }
    };

    const fetchOwnReferral = async () => {
      const authId = user?.id || user?.auth_id;
      if (!authId) {
        if (!cancelled) setOwnReferral(null);
        return;
      }
      const code = await getDriverOwnReferralCode(authId, controller.signal);
      if (!cancelled) setOwnReferral(code);
    };

    fetchProfileData();
    fetchOwnReferral();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user?.id, user?.auth_id, isFocused]);

  const displayFirstName =
    dbProfile.firstName ||
    profile?.first_name ||
    profile?.firstName ||
    user?.first_name ||
    user?.firstName ||
    user?.user_metadata?.first_name ||
    user?.user_metadata?.firstName ||
    "Usuario";

  const displayLastName =
    dbProfile.lastName ||
    profile?.last_name ||
    profile?.lastName ||
    user?.last_name ||
    user?.lastName ||
    user?.user_metadata?.last_name ||
    user?.user_metadata?.lastName ||
    "";

  const displayPhone =
    dbProfile.mobile ||
    profile?.mobile ||
    user?.mobile ||
    user?.phone ||
    user?.user_metadata?.phone ||
    "+57 300 000 0000";

  const displayDocumentType =
    dbProfile.documentType ||
    (profile as any)?.document_type ||
    user?.user_metadata?.document_type ||
    null;

  const displayDocumentNumber =
    dbProfile.documentNumber ||
    (profile as any)?.document_number ||
    user?.user_metadata?.document_number ||
    null;

  const displayReferredBy =
    dbProfile.referredByCode ||
    (profile as any)?.referred_by_code ||
    user?.user_metadata?.referred_by_code ||
    null;

  const displayUserTypeLabel =
    currentUserType === 'driver'
      ? 'Conductor'
      : currentUserType === 'customer'
      ? 'Cliente'
      : currentUserType;

  const stopBackgroundLocation = async () => {
    const tasks = await TaskManager.getRegisteredTasksAsync();
    tasks.forEach((task) => {
      if (task.taskName === "background-location-task") {
        Location.stopLocationUpdatesAsync("background-location-task");
      }
    });
  };

  // Exigido por la Guideline 5.1.1(v) de Apple: si la app deja registrarse,
  // tiene que dejar eliminar la cuenta desde dentro. No vale un enlace a la web
  // ni un correo a soporte.
  const eliminarCuenta = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showAlert('error', 'Sesion expirada', 'Vuelve a iniciar sesion e intentalo de nuevo.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      // Un viaje en curso no bloquea por capricho: dejar a la contraparte con
      // un usuario anonimo a mitad de servicio rompe el viaje.
      const detalle = (error as any)?.context?.body || data;
      if (detalle?.error === 'VIAJE_ACTIVO') {
        showAlert('warning', 'Tienes un viaje activo', detalle.message);
        return;
      }
      if (error) throw error;

      if (user?.usertype === 'driver') {
        await Promise.race([
          stopBackgroundLocation(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]).catch(() => {});
      }
      await supabase.auth.signOut().catch(() => {});
      dispatch(logout());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      showAlert('error', 'No se pudo eliminar la cuenta', `${msg}. Si el problema sigue, escribenos por soporte.`);
    } finally {
      setLoading(false);
    }
  }, [dispatch, user?.usertype]);

  const confirmarEliminarCuenta = useCallback(() => {
    showAlert(
      'confirm',
      'Eliminar cuenta',
      'Se borraran tus datos personales de forma permanente y no podras volver a iniciar sesion. Tus viajes ya realizados se conservaran de forma anonima. Esta accion no se puede deshacer.',
      [
        { text: 'Cancelar', onPress: () => setAlertVisible(false) },
        {
          text: 'Eliminar cuenta',
          onPress: () => {
            setAlertVisible(false);
            eliminarCuenta();
          },
        },
      ],
    );
  }, [eliminarCuenta]);

  const handleLogout = async () => {
    try {
      setLoading(true);
      if (user?.usertype === "driver") {
        await Promise.race([
          stopBackgroundLocation(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 5000)
          ),
        ]).catch(() => {});
      }
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise<{ error: Error }>(
        (resolve) => setTimeout(() => resolve({ error: new Error('timeout') }), 8000)
      );
      const { error } = await Promise.race([signOutPromise, timeoutPromise]);
      if (error && error.message !== 'timeout') throw error;
      dispatch(logout());
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      showAlert('error', 'Error', `No se pudo cerrar sesión: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const refer = useCallback(async () => {
    try {
      const authId = user?.id || user?.auth_id || profile?.auth_id;
      if (!authId) {
        console.error('[ProfileScreen] refer: No authId found');
        return;
      }

      // Compartimos el código PROPIO del usuario (AAA-XXXXX) — el de
      // referral_codes, NO users.referral_id (que es el de quien lo invitó).
      const own = ownReferral ?? (await getDriverOwnReferralCode(authId));
      if (own && !ownReferral) setOwnReferral(own);

      const firstName = displayFirstName || 'Usuario';
      const ownCode = own?.referralCode;

      if (!ownCode) {
        showAlert(
          'info',
          'Código en preparación',
          'Tu código de referido se está generando. Inténtalo de nuevo en unos momentos.'
        );
        return;
      }

      const message =
        settings.bonus > 0
          ? `🚗 Imagina que con un solo viaje ayudas a que un conductor lleve el 100% de su trabajo a casa.\n\nDescarga Gratis T+Plus en Ios o Android y regístrate según tu sistema operativo.\n\n🔒 Tendrás seguridad en cada viaje y los conductores recibirán el pago completo, apoyando a sus familias.\n\n💸 Además, recibe un incentivo en tu próximo viaje.\n\n🎟️ Código de referido: ${ownCode}\n\n👉 https://tmasplus.com — Seguridad para ti. Justo para ti... Justo para todos!`
          : `🚗 Imagina que con un solo viaje ayudas a que un conductor lleve el 100% de su trabajo a casa.\n\nDescarga Gratis T+Plus en Ios o Android y regístrate según tu sistema operativo.\n\n🔒 Tendrás seguridad en cada viaje y los conductores recibirán el pago completo, apoyando a sus familias.\n\n🎟️ Código de referido: ${ownCode}\n\n👉 https://tmasplus.com — Seguridad para ti. Justo para ti... Justo para todos!`;

      Share.share({ message });
    } catch (error) {
      console.error('[ProfileScreen] refer error:', error);
    }
  }, [user, profile, ownReferral, displayFirstName]);

  const sos = useCallback(() => {
    const emergencyNumber = "123";
    const callLink = Platform.OS === "android" ? `tel:${emergencyNumber}` : `telprompt:${emergencyNumber}`;
    Linking.openURL(callLink).catch(() => {
      showAlert('error', 'Error', 'No se pudo iniciar la llamada al 123.');
    });
  }, []);

  const benefits = useCallback(() => {
    Linking.openURL("https://tmasplus.com/beneficios").catch(() => {});
  }, []);

  const menuSections: MenuSection[] = useMemo(() => {
    const sections: MenuSection[] = [
      {
        title: "Avanzado",
        items: [
          { key: "profile-config", label: "Ajustar Perfil", icon: "settings-outline", onPress: () => navigation.navigate("Docs") },
          { key: "change-password", label: "Cambiar contraseña", icon: "lock-closed-outline", onPress: () => navigation.navigate("ChangePassword") },
        ],
      },
    ];

    if (currentUserType === "customer") {
      sections.push({
        title: "Lugares",
        items: [
          { key: "saved-places", label: "Mis lugares", icon: "location-outline", onPress: () => navigation.navigate("Search") },
        ],
      });
    }

    if (currentUserType === "driver") {
      sections.push({
        title: "Conductor",
        items: [
          { key: "carnet", label: "Carnet", icon: "card-outline", onPress: () => navigation.navigate("Carnet") },
          { key: "my-vehicles", label: "Mis Vehiculos", icon: "car-outline", onPress: () => navigation.navigate("CarsScreen") },
          { key: "insurance", label: "Aseguradora", icon: "shield-checkmark-outline", onPress: () => navigation.navigate("Insurance") },
        ],
      });
    }

    sections.push(
      {
        title: "Seguridad",
        items: [
          { key: "security-contact", label: "Contacto de seguridad", icon: "people-outline", onPress: () => navigation.navigate("SecurityContact") },
          { key: "shared-trip", label: "Viaje Compartido", icon: "navigate-outline", onPress: () => navigation.navigate("ReceiveLocation") },
          { key: "sos", label: "S.O.S Emergencia", icon: "warning-outline", onPress: sos, isSOS: true },
        ],
      },
      {
        title: "Beneficios",
        items: [
          { key: "benefits", label: "Beneficios", icon: "gift-outline", onPress: benefits },
          { key: "share", label: "Comparte y gana", icon: "share-social-outline", onPress: refer },
        ],
      },
      {
        title: "Soporte",
        items: [
          { key: "chat", label: "Chat con tmasplus", icon: "chatbubble-ellipses-outline", onPress: () => navigation.navigate("Soporte") },
          { key: "complaints", label: "Quejas y reclamos", icon: "help-buoy-outline", onPress: () => navigation.navigate("Complain") },
        ],
      },
      {
        title: "General",
        items: [
          { key: "updates", label: "Ver actualizaciones", icon: "refresh-outline", onPress: () => navigation.navigate("Updates") },
          // Ultima de la lista: es destructiva y no debe quedar al alcance de un
          // desliz accidental entre opciones cotidianas.
          { key: "delete-account", label: "Eliminar cuenta", icon: "trash-outline", onPress: confirmarEliminarCuenta },
        ],
      },
    );

    return sections;
  }, [benefits, confirmarEliminarCuenta, currentUserType, navigation, refer, sos]);

  const goBackFromProfile = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("HomeScreen");
  };

  const isCustomer = currentUserType === "customer";
  const isDriverUser = useIsDriverUser();
  const hideNavBack = isCustomer || isDriverUser;
  const headerTopPadding = Platform.OS === "android" ? Math.max(insets.top, 10) + 8 : 10;
  const customerNavPad = useCustomerNavBottomPad();
  const driverNavPad = useDriverNavBottomPad();
  const { hasActiveTrip } = useActiveTripBanner();
  // Solo cliente usa banner flotante en Perfil; conductor solo en GO.
  const bannerClearance = isCustomer && hasActiveTrip ? 108 : 0;
  const navBottomPad = (isCustomer ? customerNavPad : isDriverUser ? driverNavPad : 36) + bannerClearance;

  const profilePhoto =
    dbProfile.profileImage ||
    (user as any)?.profile_image ||
    profile?.profile_image ||
    null;

  return (
    <View style={styles.container}>
      <Image source={BG_IMAGE} style={styles.bgImage} resizeMode="cover" />
      <View pointerEvents="none" style={styles.bgOverlay} />

      <View style={[styles.headerArea, { paddingTop: headerTopPadding }]}>
        {!hideNavBack && (
          <TouchableOpacity style={styles.headerBackBtn} onPress={goBackFromProfile} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={18} color="#00E5FF" />
          </TouchableOpacity>
        )}
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>T+plus</Text>
          <Text style={styles.headerTitle}>Mi Perfil</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.contentArea, { paddingBottom: navBottomPad + 28 }]}
      >
        <View style={styles.userCard}>
          <View pointerEvents="none" style={styles.userCardBlotches}>
            <View style={[styles.blotch, styles.blotchA]} />
            <View style={[styles.blotch, styles.blotchB]} />
            <View style={[styles.blotch, styles.blotchC]} />
            <View style={[styles.blotch, styles.blotchD]} />
            <View style={[styles.blotch, styles.blotchE]} />
            <View style={[styles.blotch, styles.blotchF]} />
          </View>

          <View style={styles.avatarTop}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarRing}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="person-outline" size={28} color="#00E5FF" />
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => navigation.navigate("Docs")}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={14} color="#051A26" />
              </TouchableOpacity>
            </View>

            {displayUserTypeLabel ? (
              <View style={styles.profileBadge}>
                <Text style={styles.profileBadgeText}>{displayUserTypeLabel}</Text>
              </View>
            ) : null}

            <Text style={styles.profileName} numberOfLines={1}>
              {`${displayFirstName} ${displayLastName}`.trim()}
            </Text>
          </View>

          <View style={styles.glassGrid}>
            <LiquidGlass style={styles.glassTileHalf}>
              <View style={styles.glassIconWrap}>
                <Ionicons name="ribbon-outline" size={14} color="#00E5FF" />
              </View>
              <View style={styles.glassStars}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const r = dbProfile.ratingCount > 0 ? (dbProfile.rating ?? 0) : 0;
                  const filled = dbProfile.ratingCount > 0 && n <= Math.round(r);
                  return (
                    <Ionicons
                      key={n}
                      name={filled ? "star" : "star-outline"}
                      size={11}
                      color={filled ? "#00E5FF" : "rgba(255,255,255,0.28)"}
                    />
                  );
                })}
              </View>
              <Text style={styles.glassNum}>
                {dbProfile.ratingCount > 0 && dbProfile.rating != null
                  ? dbProfile.rating.toFixed(1)
                  : "—"}
              </Text>
              <Text style={styles.glassCaption}>Calificación</Text>
            </LiquidGlass>

            <LiquidGlass style={styles.glassTileHalf}>
              <View style={styles.glassIconWrap}>
                <Ionicons name="car-sport-outline" size={14} color="#00E5FF" />
              </View>
              <Text style={styles.glassNum}>{dbProfile.completedTrips}</Text>
              <Text style={styles.glassCaption}>Viajes Plus</Text>
            </LiquidGlass>

            <LiquidGlass style={styles.glassTileHalf}>
              <View style={styles.glassIconWrap}>
                <Ionicons name="call-outline" size={14} color="#00E5FF" />
              </View>
              <Text style={styles.glassValue} numberOfLines={2}>
                {displayPhone}
              </Text>
              <Text style={styles.glassCaption}>Celular</Text>
            </LiquidGlass>

            <LiquidGlass style={styles.glassTileHalf}>
              <View style={styles.glassIconWrap}>
                <Ionicons name="id-card-outline" size={14} color="#00E5FF" />
              </View>
              <Text style={styles.glassValue} numberOfLines={2}>
                {displayDocumentType || displayDocumentNumber
                  ? `${displayDocumentType ? `${displayDocumentType} ` : ""}${displayDocumentNumber || "—"}`
                  : "Sin documento"}
              </Text>
              <Text style={styles.glassCaption}>Documento</Text>
            </LiquidGlass>

            <LiquidGlass style={styles.glassTileFull}>
              <View style={styles.glassIconWrap}>
                <Ionicons name="gift-outline" size={14} color="#00E5FF" />
              </View>
              {ownReferral ? (
                <>
                  <Text style={styles.glassValue} numberOfLines={1}>
                    {ownReferral.referralCode}
                  </Text>
                  <Text style={styles.glassCaption} numberOfLines={1}>
                    {ownReferral.totalReferrals}{" "}
                    {ownReferral.totalReferrals === 1 ? "referido" : "referidos"}
                    {displayReferredBy ? ` · por ${displayReferredBy}` : ""}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.glassValue}>…</Text>
                  <Text style={styles.glassCaption}>Generando tu código</Text>
                </>
              )}
            </LiquidGlass>
          </View>
        </View>

        {menuSections.map((section) => (
          <View key={section.title} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.menuItem,
                    index < section.items.length - 1 ? styles.menuItemBorder : null,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => item.onPress()}
                >
                  <View
                    style={[
                      styles.menuIconWrap,
                      item.isSOS ? styles.menuIconWrapSOS : null,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={item.isSOS ? "#E91E63" : "rgba(0,229,255,0.85)"}
                    />
                  </View>
                  <Text
                    style={[styles.menuText, item.isSOS ? styles.menuTextSOS : null]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={item.isSOS ? "rgba(233,30,99,0.55)" : "rgba(255,255,255,0.28)"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.85}
          onPress={handleLogout}
        >
          <MaterialIcons name="logout" size={16} color="#FFFFFF" />
          <Text style={styles.logoutText}>{loading ? "Cerrando..." : "Cerrar sesión"}</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>
          RT {AppConfig.runtime_Version} · V {AppConfig.ios_app_version} · B{" "}
          {AppConfig.android_app_version}
        </Text>
      </ScrollView>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#051A26",
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,26,38,0.82)",
  },
  headerArea: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#00E5FF",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,229,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  contentArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  userCard: {
    marginBottom: 10,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(8,38,52,0.72)",
    overflow: "hidden",
    position: "relative",
  },
  userCardBlotches: {
    ...StyleSheet.absoluteFillObject,
  },
  blotch: {
    position: "absolute",
    borderRadius: 999,
  },
  blotchA: {
    width: 150,
    height: 150,
    top: -50,
    right: -40,
    backgroundColor: "rgba(0,229,255,0.22)",
  },
  blotchB: {
    width: 100,
    height: 100,
    top: 30,
    left: -36,
    backgroundColor: "rgba(0,176,255,0.18)",
  },
  blotchC: {
    width: 78,
    height: 58,
    top: 88,
    right: 18,
    borderRadius: 40,
    backgroundColor: "rgba(125,211,252,0.16)",
    transform: [{ rotate: "28deg" }],
  },
  blotchD: {
    width: 120,
    height: 76,
    bottom: -30,
    left: 34,
    borderRadius: 50,
    backgroundColor: "rgba(0,229,255,0.14)",
    transform: [{ rotate: "-18deg" }],
  },
  blotchE: {
    width: 52,
    height: 52,
    bottom: 34,
    right: -12,
    backgroundColor: "rgba(103,232,249,0.16)",
  },
  blotchF: {
    width: 64,
    height: 36,
    top: 10,
    left: 70,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    transform: [{ rotate: "12deg" }],
  },
  avatarTop: {
    alignItems: "center",
    marginBottom: 12,
    zIndex: 1,
  },
  avatarWrap: {
    width: 68,
    height: 68,
    marginBottom: 8,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2,
    backgroundColor: "rgba(0,229,255,0.55)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
  },
  avatarFallback: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: "#0A2E3D",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    maxWidth: "100%",
  },
  profileBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(0,229,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.3)",
  },
  profileBadgeText: {
    color: "#00E5FF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  glassGrid: {
    zIndex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  glassOuter: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.12)",
    backgroundColor: "rgba(10,46,61,0.55)",
  },
  glassContent: {
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  glassTileHalf: {
    width: "48.5%",
    minHeight: 96,
  },
  glassTileFull: {
    width: "100%",
  },
  glassIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    backgroundColor: "rgba(0,229,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.32)",
  },
  glassStars: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    marginBottom: 3,
  },
  glassNum: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  glassValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 14,
  },
  glassCaption: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(200,240,255,0.7)",
    textAlign: "center",
  },
  editBtn: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#00E5FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0A2E3D",
  },
  menuSection: {
    marginBottom: 14,
  },
  menuSectionTitle: {
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(220,230,240,0.55)",
  },
  menuCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.12)",
    backgroundColor: "rgba(10,46,61,0.55)",
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,229,255,0.1)",
  },
  menuIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "rgba(0,229,255,0.08)",
  },
  menuIconWrapSOS: {
    backgroundColor: "rgba(233,30,99,0.1)",
  },
  menuText: {
    flex: 1,
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "500",
  },
  menuTextSOS: {
    color: "#E91E63",
    fontWeight: "600",
  },
  logoutBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  logoutText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  versionText: {
    marginTop: 14,
    textAlign: "center",
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
  },
});

export default ProfileScreen;
