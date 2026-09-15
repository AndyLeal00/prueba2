import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Image,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons, MaterialIcons, FontAwesome, Feather } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/common/store";
import { format, differenceInDays } from "date-fns";
import {
  fetchWalletHistory,
  selectWalletHistory,
  selectWalletLoading,
} from "@/common/reducers/walletSlice";
import {
  fetchMemberships,
  selectMembershipLoading,
} from "@/common/reducers/membershipSlice";
import { listenToSettingsChanges, selectSettings } from "@/common/reducers/settingsSlice";
import { supabase } from "@/config/SupabaseConfig";
import { PUEDE_COMPRAR_EN_APP } from "@/config/appStoreCompliance";
import { useDriverNavBottomPad, useIsDriverUser } from "@/components/DriverBottomNav";

type Props = NativeStackScreenProps<any>;

const WalletDetails = ({ navigation }: Props) => {
  const isDriverUser = useIsDriverUser();
  const driverNavPad = useDriverNavBottomPad();
  const insets = useSafeAreaInsets();
  const headerTopPadding = Platform.OS === "android" ? Math.max(insets.top, 10) + 8 : 10;
  const user = useSelector((state: RootState) => state.auth.user);
  const profile = useSelector((state: RootState) => state.auth.profile);
  const walletHistory = useSelector(selectWalletHistory);
  const walletLoading = useSelector(selectWalletLoading);
  const memberships = useSelector(
    (state: RootState) => state.memberships.memberships
  );
  const isLoadingMemberships = useSelector(selectMembershipLoading);
  const dispatch = useDispatch<AppDispatch>();
  const settings = useSelector(selectSettings);

  // FK: memberships.conductor → auth.users(id). Probamos auth_id primero
  // y caemos a users.id por compatibilidad con datos legacy.
  const driverIdCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [profile?.auth_id, (user as any)?.auth_id, profile?.id, user?.id, (user as any)?.uid]
            .map((v) => (v ? String(v) : ''))
            .filter(Boolean),
        ),
      ),
    [profile?.auth_id, profile?.id, (user as any)?.auth_id, user?.id, (user as any)?.uid],
  );
  const driverConductorId = driverIdCandidates[0];
  

  const glowAnimRef = useRef({
    glow1: new Animated.Value(0),
    glow2: new Animated.Value(0),
    glow3: new Animated.Value(0),
    shineAnim: new Animated.Value(0),
  }).current;

  const { glow1, glow2, glow3, shineAnim } = glowAnimRef;

  useEffect(() => {
    dispatch(listenToSettingsChanges());
  }, [dispatch]);

  // 📡 Cargar datos iniciales
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchWalletHistory(user?.id));
    }
    if (driverConductorId) {
      // Un único fetch con el id canónico (igual que index.tsx). Disparar uno
      // por cada candidato sobrescribe state.memberships y borra la membresía
      // activa cuando el último candidato no tiene filas.
      dispatch(fetchMemberships(driverConductorId));
    }
  }, [dispatch, user?.id, driverConductorId]);

  // 🔄 Configurar Realtime listener solo cuando la pantalla está enfocada
  useFocusEffect(
    React.useCallback(() => {
      if (!driverConductorId) return;

      const channel = supabase
        .channel(`memberships-${driverConductorId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'memberships',
            filter: `conductor=eq.${driverConductorId}`,
          },
          () => {
            dispatch(fetchMemberships(driverConductorId));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [driverConductorId, dispatch])
  );

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow1, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow1, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow2, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow2, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow3, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow3, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();


    shineAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(shineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [glow1, glow2, glow3, shineAnim]);

  const calculateDaysRemaining = (endDate: string | Date | undefined) => {
    if (!endDate) return 0;
    try {
      const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
      return differenceInDays(end, new Date());
    } catch (e) {
      console.error('Error calculando días restantes:', e);
      return 0;
    }
  };

  // 🎯 Filtrar por candidatos de conductor para no confundir membresías de otro id
  // (fetchMemberships sobrescribe state.memberships con el último candidato consultado).
  const activeMembership = useMemo(() => {
    if (!memberships || memberships.length === 0) return null;
    const mine = memberships.filter((m: any) =>
      driverIdCandidates.includes(String(m.conductor))
    );
    const list = mine.length > 0 ? mine : memberships;
    return (
      list.find((m: any) => m?.status?.toString().toUpperCase() === 'ACTIVA') ||
      list[0] ||
      null
    );
  }, [memberships, driverIdCandidates]);

  const daysRemaining = useMemo(
    () =>
      activeMembership
        ? calculateDaysRemaining(activeMembership.fecha_terminada)
        : 0,
    [activeMembership]
  );

  const walletBalance = user?.walletBalance || 0;
  const hasHistory = Array.isArray(walletHistory) && walletHistory.length > 0;

  // 🟢 Memoizar el estado de membresía
  const { membershipStatus, expiryDate, startDate } = useMemo(() => {
    let status = "Sin datos";
    let isActive = false;

    if (activeMembership) {
      const estado = activeMembership.status?.toUpperCase();

      if (estado === 'ACTIVA' && daysRemaining > 0) {
        status = "ACTIVA";
        isActive = true;
      } else if (estado === 'ACTIVA' && daysRemaining <= 0) {
        status = "VENCIDA";
      } else if (estado === 'PENDIENTE') {
        status = "PENDIENTE";
      } else if (estado === 'CANCELADA') {
        status = "CANCELADA";
      } else {
        status = `${estado}`;
      }
    }

    const expiry = activeMembership?.fecha_terminada
      ? format(new Date(activeMembership.fecha_terminada), "dd/MM/yyyy")
      : "-- / --";

    const start = activeMembership?.fecha_inicio
      ? format(new Date(activeMembership.fecha_inicio), "dd/MM/yyyy")
      : "-- / --";

    const renewal = activeMembership && daysRemaining > 0
      ? `Te quedan ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} de membresía`
      : activeMembership?.status === 'PENDIENTE'
      ? "Tu membresía está pendiente de activación"
      : "No tienes membresía registrada. Adquiere una para poder aceptar servicios.";

    return {
      membershipStatus: status,
      isMembershipActive: isActive,
      expiryDate: expiry,
      startDate: start,
      renewalText: renewal,
    };
  }, [activeMembership, daysRemaining]);

  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });

  const shineX = useMemo(
    () =>
      shineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-(cardSize.width || 320), (cardSize.width || 320) + 40],
      }),
    [shineAnim, cardSize.width]
  );

  const shineHeight = Math.max(cardSize.height * 1.6, 420);

  const statusTone = useMemo(() => {
    switch (membershipStatus) {
      case "ACTIVA":
        return {
          accent: "#76FF03",
          softBg: "rgba(118,255,3,0.10)",
          border: "rgba(118,255,3,0.32)",
          label: "rgba(200,255,170,0.72)",
          chipBg: "rgba(118,255,3,0.16)",
        };
      case "VENCIDA":
        return {
          accent: "#FFD54F",
          softBg: "rgba(255,213,79,0.10)",
          border: "rgba(255,213,79,0.32)",
          label: "rgba(255,236,179,0.72)",
          chipBg: "rgba(255,213,79,0.16)",
        };
      case "PENDIENTE":
        return {
          accent: "#7DD3FC",
          softBg: "rgba(125,211,252,0.10)",
          border: "rgba(125,211,252,0.32)",
          label: "rgba(186,230,253,0.72)",
          chipBg: "rgba(125,211,252,0.16)",
        };
      case "CANCELADA":
        return {
          accent: "#FF6B6B",
          softBg: "rgba(255,107,107,0.10)",
          border: "rgba(255,107,107,0.32)",
          label: "rgba(255,190,190,0.72)",
          chipBg: "rgba(255,107,107,0.16)",
        };
      default:
        return {
          accent: "#9FB6C1",
          softBg: "rgba(159,182,193,0.10)",
          border: "rgba(159,182,193,0.3)",
          label: "rgba(200,214,220,0.72)",
          chipBg: "rgba(159,182,193,0.16)",
        };
    }
  }, [membershipStatus]);

  const daysTone = useMemo(() => {
    if (daysRemaining > 7) {
      return {
        accent: "#76FF03",
        softBg: "rgba(118,255,3,0.10)",
        border: "rgba(118,255,3,0.32)",
        label: "rgba(200,255,170,0.72)",
        chipBg: "rgba(118,255,3,0.16)",
      };
    }
    if (daysRemaining > 0) {
      return {
        accent: "#FFD54F",
        softBg: "rgba(255,213,79,0.10)",
        border: "rgba(255,213,79,0.32)",
        label: "rgba(255,236,179,0.72)",
        chipBg: "rgba(255,213,79,0.16)",
      };
    }
    return {
      accent: "#FF6B6B",
      softBg: "rgba(255,107,107,0.10)",
      border: "rgba(255,107,107,0.32)",
      label: "rgba(255,190,190,0.72)",
      chipBg: "rgba(255,107,107,0.16)",
    };
  }, [daysRemaining]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTopPadding }]}>
        {!isDriverUser ? (
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#D9F6FF" />
          </TouchableOpacity>
        ) : null}
        <View style={[styles.headerTitleWrap, isDriverUser && styles.headerTitleWrapDriver]}>
          {isDriverUser ? <Text style={styles.headerEyebrow}>T+plus</Text> : null}
          <Text style={isDriverUser ? styles.headerTitle : styles.headerText}>Mi Billetera</Text>
        </View>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => Linking.openURL("https://wa.me/573118841054")}
        >
          <MaterialIcons name="help-outline" size={22} color="#00E5FF" />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isDriverUser && { paddingBottom: driverNavPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardWrap}>
          <View
            style={styles.membershipCard}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setCardSize({ width, height });
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.cardShine,
                {
                  height: shineHeight,
                  top: -shineHeight * 0.12,
                  transform: [{ translateX: shineX }, { rotate: "-20deg" }],
                },
              ]}
            />
            <View style={styles.cardTopRow}>
              <View style={styles.cardLogoWrap}>
                <Image
                  source={require("@/assets/images/logo-Preview-Photoroom.png")}
                  style={styles.cardLogo}
                />
              </View>
            </View>

            <View style={styles.statusStack}>
              <View style={styles.statusLine}>
                <Text style={styles.statusLineLabel}>Estado membresía</Text>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: statusTone.chipBg,
                      borderColor: statusTone.border,
                    },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: statusTone.accent }]} />
                  <Text style={[styles.statusPillText, { color: statusTone.accent }]} numberOfLines={1}>
                    {membershipStatus}
                  </Text>
                </View>
              </View>

              {activeMembership ? (
                <View style={styles.statusLine}>
                  <Text style={styles.statusLineLabel}>Días restantes</Text>
                  <View
                    style={[
                      styles.daysPill,
                      {
                        backgroundColor: daysTone.chipBg,
                        borderColor: daysTone.border,
                      },
                    ]}
                  >
                    <Text style={[styles.daysPillText, { color: daysTone.accent }]}>
                      {Math.max(daysRemaining, 0)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {isLoadingMemberships && !activeMembership && (
              <View style={styles.loadingSection}>
                <ActivityIndicator size="small" color="#00E5FF" />
                <Text style={styles.loadingText}>Cargando membresía...</Text>
              </View>
            )}

            {activeMembership ? (
              <View style={styles.detailsGrid}>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Membresía</Text>
                  <Text style={styles.detailValueAccent}>
                    Conductor {activeMembership?.status === 'ACTIVA' ? 'Premium' : 'Estándar'}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Vence</Text>
                  <Text style={styles.detailValue}>{expiryDate}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Costo</Text>
                  <Text style={styles.detailValue}>
                    ${Number(activeMembership?.costo || 0).toLocaleString("es-CO")}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailLabel}>Inicio</Text>
                  <Text style={styles.detailValue}>{startDate}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.noMembershipSection}>
                <Ionicons name="information-circle-outline" size={28} color="#FF6B6B" />
                <Text style={styles.noMembershipText}>No tienes una membresía activa</Text>
                <Text style={styles.noMembershipSubtext}>
                  Adquiere una membresía para aceptar y completar servicios.
                </Text>
                <TouchableOpacity
                  style={styles.ctaMini}
                  onPress={() =>
                    PUEDE_COMPRAR_EN_APP
                      ? Linking.openURL("https://mpago.li/12iuk56")
                      : Linking.openURL("https://wa.me/573118841054")
                  }
                >
                  <Ionicons
                    name={PUEDE_COMPRAR_EN_APP ? "card-outline" : "logo-whatsapp"}
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.ctaMiniText}>
                    {PUEDE_COMPRAR_EN_APP ? "Obtener membresía" : "Contactar soporte"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {activeMembership ? (
          <View style={styles.supportBannerHighlight}>
            <View style={styles.supportBannerContent}>
              <Text style={styles.supportBannerTitle}>¡Ya eres miembro!</Text>
              <Text style={styles.supportBannerSubtitle}>¿Necesitas ayuda? Contáctanos</Text>
            </View>
            <TouchableOpacity
              style={styles.supportBannerBtn}
              onPress={() => Linking.openURL("https://wa.me/573118841054")}
            >
              <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.alertBanner}>
            <View style={styles.alertIconWrap}>
              <Ionicons name="alert-circle-outline" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.alertTextWrap}>
              <Text style={styles.alertTitle}>Sin membresía activa</Text>
              <Text style={styles.alertSub}>
                Necesitas una membresía para aceptar servicios.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.renewMiniBtn}
              onPress={() =>
                PUEDE_COMPRAR_EN_APP
                  ? Linking.openURL("https://mpago.li/12iuk56")
                  : Linking.openURL("https://wa.me/573118841054")
              }
            >
              <Text style={styles.renewMiniBtnText}>
                {PUEDE_COMPRAR_EN_APP ? "Obtener" : "Soporte"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {PUEDE_COMPRAR_EN_APP && (
          <View style={styles.ctaWrap}>
            <TouchableOpacity
              style={styles.ctaMain}
              onPress={() => Linking.openURL("https://mpago.li/12iuk56")}
            >
              <Ionicons name="refresh-outline" size={18} color="#051A26" />
              <Text style={styles.ctaMainText}>Renovar membresía</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.packagesWrap}>
        {[
          ...(settings.Membership
            ? [{ icon: "local-offer", text: "Membresía", mode: "membership" }]
            : []),
          ...(user && user?.cartype === "TREAS-X" && settings.KilimetrsWallet
            ? [{ icon: "road", text: "Kilómetros", mode: "kms" }]
            : []),
        ].map(({ icon, text, mode }, idx) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.packageBtn,
              idx === 1 ? { marginTop: 8 } : null,
            ]}
            onPress={() => navigation.navigate("ChosePlan", { mode })}
          >
            {icon === "local-offer" ? (
              <MaterialIcons name={icon} size={20} color="#E8FCFF" />
            ) : (
              <FontAwesome name={icon} size={20} color="#E8FCFF" />
            )}
            <Text style={styles.packageBtnText}>
              Paquete {text}
            </Text>
          </TouchableOpacity>
        ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#051A26",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitleWrapDriver: {
    flex: 1,
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
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(10,46,61,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 12,
  },
  cardWrap: {
    marginBottom: 10,
  },
  membershipCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: "100%",
    backgroundColor: "rgba(10,46,61,0.55)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.18)",
    overflow: "hidden",
    position: "relative",
  },
  cardShine: {
    position: "absolute",
    left: 0,
    width: 100,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  cardLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
  },
  cardLogo: {
    width: 30,
    height: 30,
    resizeMode: "contain",
  },
  statusStack: {
    gap: 8,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,229,255,0.05)",
  },
  statusLineLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
    flex: 1,
    marginRight: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    lineHeight: 16,
  },
  daysPill: {
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  daysPillText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,229,255,0.12)",
    paddingTop: 12,
    marginHorizontal: -4,
  },
  detailCell: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.42)",
    fontWeight: "600",
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
    lineHeight: 18,
  },
  detailValueAccent: {
    fontSize: 13,
    color: "#00E5FF",
    fontWeight: "700",
    lineHeight: 18,
  },
  alertBanner: {
    marginBottom: 10,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(10,46,61,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
  },
  alertIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  alertTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  alertSub: {
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  renewMiniBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  renewMiniBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  ctaWrap: {
    marginBottom: 10,
  },
  ctaMain: {
    borderRadius: 12,
    backgroundColor: "#00E5FF",
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaMainText: {
    marginLeft: 8,
    color: "#051A26",
    fontWeight: "700",
    fontSize: 14,
  },
  packagesWrap: {
    paddingBottom: 16,
  },
  packageBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(0,229,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  packageBtnText: {
    marginLeft: 8,
    color: "#E8FCFF",
    fontWeight: "600",
    fontSize: 13,
  },
  loadingSection: {
    marginTop: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,229,255,0.12)",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: "rgba(0,229,255,0.75)",
    fontWeight: "500",
  },
  supportBannerHighlight: {
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: "rgba(10,46,61,0.55)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.14)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  supportBannerContent: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  supportBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00E5FF",
    marginBottom: 2,
  },
  supportBannerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
  supportBannerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(37,211,102,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(37,211,102,0.4)",
  },
  noMembershipSection: {
    marginTop: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,229,255,0.12)",
  },
  noMembershipText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B6B",
    textAlign: "center",
  },
  noMembershipSubtext: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    paddingHorizontal: 8,
    lineHeight: 17,
  },
  ctaMini: {
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: "#FF6B6B",
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaMiniText: {
    marginLeft: 8,
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
});

export default WalletDetails;

