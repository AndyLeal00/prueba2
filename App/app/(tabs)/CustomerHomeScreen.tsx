import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  InteractionManager,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { RootState } from '@/common/store';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import BookingRealtimeService from '@/common/services/BookingRealtimeService';
import { useCustomerNavBottomPad } from '@/components/CustomerBottomNav';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W = 260;
const CARD_GAP = 16;
const H_PAD = 20;
const BG_IMAGE = require('../../assets/images/bg.png');
const CARD_TEXTURE = require('../../assets/images/card_texture.png');

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  x: Math.random() * SW,
  y: Math.random() * SH * 0.85,
  size: 2 + Math.random() * 3,
  duration: (5 + Math.random() * 7) * 1000,
  delay: Math.random() * 4000,
  drift: -(30 + Math.random() * 70),
}));

const Particle = React.memo(({ p, active }: { p: typeof PARTICLES[0]; active: boolean }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      anim.stopAnimation();
      anim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(anim, { toValue: 1, duration: p.duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim, p.delay, p.duration]);

  const opacity = anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.7, 0.35, 0] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: p.x, top: p.y,
        width: p.size, height: p.size, borderRadius: p.size / 2,
        backgroundColor: '#00E5FF',
        opacity, transform: [{ translateY }],
      }}
    />
  );
});

const Scalable = ({
  onPress, style, scaleTo = 0.95, liftBy = 0, children,
}: { onPress: () => void; style?: any; scaleTo?: number; liftBy?: number; children: React.ReactNode }) => {
  const sc = useRef(new Animated.Value(1)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const hi = () => {
    Animated.spring(sc, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
    if (liftBy) Animated.spring(ty, { toValue: liftBy, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  };
  const ho = () => {
    Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    if (liftBy) Animated.spring(ty, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  };
  return (
    <TouchableOpacity onPress={onPress} onPressIn={hi} onPressOut={ho} activeOpacity={1}>
      <Animated.View style={[style, { transform: [{ scale: sc }, { translateY: ty }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
};

const ActionBtn = ({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: any;
  label: string;
  sub: string;
  onPress: () => void;
}) => {
  const anim = useRef(new Animated.Value(0)).current;
  const onIn = () => Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onOut = () => Animated.spring(anim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const lift = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  return (
    <TouchableOpacity style={s.serviceCardWrap} onPress={onPress} onPressIn={onIn} onPressOut={onOut} activeOpacity={1}>
      <Animated.View style={[s.serviceCard, { transform: [{ scale }, { translateY: lift }] }]}>
        <View style={s.serviceCardContent}>
          <View style={s.serviceIconWrap}>
            <Ionicons name={icon} size={18} color="#00E5FF" />
          </View>
          <Text style={s.serviceTitle} adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={2}>
            {label}
          </Text>
          <Text style={s.serviceSub} numberOfLines={2}>
            {sub}
          </Text>
          <View style={s.serviceCta}>
            <Text style={s.serviceCtaTxt}>Solicitar</Text>
            <Ionicons name="chevron-forward" size={14} color="#051A26" />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const BenefitItem = ({ icon, label, sub }: { icon: any; label: string; sub: string }) => {
  const ty = useRef(new Animated.Value(0)).current;
  const onIn = () => Animated.spring(ty, { toValue: -3, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onOut = () => Animated.spring(ty, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  return (
    <TouchableOpacity activeOpacity={1} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[s.benefitItem, { transform: [{ translateY: ty }] }]}>
        <View style={s.benefitIconWrap}>
          <Ionicons name={icon} size={24} color="#00E5FF" />
        </View>
        <Text style={s.benefitLabel}>{label}</Text>
        <Text style={s.benefitSub}>{sub}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const CustomerHomeScreen = () => {
  const user = useSelector((state: RootState) => state.auth.user) as any;
  const profile = useSelector((state: RootState) => state.auth.profile) as any;
  const nav = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [dbFirstName, setDbFirstName] = useState<string | null>(null);
  const [dbLastName, setDbLastName] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const lastBookingIdRef = useRef<string | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOp = useRef(new Animated.Value(0.5)).current;
  const bellAnim = useRef(new Animated.Value(0)).current;
  const navigateLockRef = useRef(false);
  const navBottomPad = useCustomerNavBottomPad();

  const greeting = useCallback(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const uid = user?.auth_id || user?.id;
        if (!uid) return;
        const headers = await getSupabaseAuthHeaders();
        const url = `${SUPABASE_URL}/rest/v1/users?select=first_name,last_name&auth_id=eq.${encodeURIComponent(uid)}&limit=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) return;
        const rows = await res.json();
        if (alive && rows?.[0]) {
          if (rows[0].first_name) setDbFirstName(rows[0].first_name);
          if (rows[0].last_name) setDbLastName(rows[0].last_name);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // ── Voice greeting on first focus after login ──
  useEffect(() => {
    if (!isFocused || !dbFirstName) return;
    let cancelled = false;
    (async () => {
      try {
        const flagKey = `greeted_${user?.id || user?.auth_id || 'anon'}`;
        const alreadyGreeted = await AsyncStorage.getItem(flagKey);
        if (alreadyGreeted === '1' || cancelled) return;
        const hour = new Date().getHours();
        const salute = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
        const msg = `${salute}, ${dbFirstName}. Bienvenido a T más plus.`;
        try { Speech.stop(); } catch {}
        Speech.speak(msg, { language: 'es-CO', pitch: 1.0, rate: 0.98 });
        await AsyncStorage.setItem(flagKey, '1');
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isFocused, dbFirstName, user?.id, user?.auth_id]);

  // ── Bell interactions (defined early so they can be referenced in effects below) ──
  const shakeBell = useCallback(() => {
    Animated.sequence([
      Animated.timing(bellAnim, { toValue: -15, duration: 80, useNativeDriver: true }),
      Animated.timing(bellAnim, { toValue: 12, duration: 80, useNativeDriver: true }),
      Animated.timing(bellAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(bellAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(bellAnim, { toValue: -4, duration: 80, useNativeDriver: true }),
      Animated.timing(bellAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [bellAnim]);

  const triggerNotificationAlert = useCallback((spokenMessage?: string) => {
    setHasUnread(true);
    shakeBell();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const msg = spokenMessage || 'Tienes una notificación nueva';
    try { Speech.stop(); } catch {}
    Speech.speak(msg, { language: 'es-CO', pitch: 1.0, rate: 1.0 });
  }, [shakeBell]);

  const onBellPress = useCallback(() => {
    setHasUnread(false);
    shakeBell();
    nav.navigate('Notifications');
  }, [shakeBell, nav]);

  // ── Fetch active booking to know if there are ongoing notifications ──
  const refreshActiveBooking = useCallback(async () => {
    try {
      const headers = await getSupabaseAuthHeaders();
      const candidates = [user?.id, user?.auth_id].filter(Boolean);
      let uid: string | null = null;
      for (const c of candidates) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/users?or=(id.eq.${c},auth_id.eq.${c})&select=id&limit=1`, { headers });
        if (r.ok) {
          const rows = await r.json();
          if (rows?.[0]?.id) { uid = rows[0].id; break; }
        }
      }
      if (!uid) return;
      const statuses = ['PENDING', 'ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED', 'NEW']
        .map(s => `"${s}"`).join(',');
      const url = `${SUPABASE_URL}/rest/v1/bookings?customer=eq.${uid}&status=in.(${statuses})&order=created_at.desc&limit=1&select=id,status`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) return;
      const rows = await resp.json();
      const b = rows?.[0];
      if (b?.id) {
        if (lastBookingIdRef.current && lastBookingIdRef.current !== b.id) {
          triggerNotificationAlert('Nueva actualización en tu viaje');
        }
        lastBookingIdRef.current = b.id;
        lastStatusRef.current = b.status || null;
        setActiveBookingId(b.id);
      } else {
        lastBookingIdRef.current = null;
        setActiveBookingId(null);
      }
    } catch {}
  }, [user?.id, user?.auth_id, triggerNotificationAlert]);

  useEffect(() => {
    if (!isFocused) return;
    refreshActiveBooking();
  }, [isFocused, refreshActiveBooking]);

  // ── Subscribe to realtime updates for the active booking ──
  useEffect(() => {
    if (!activeBookingId) return;
    const STATUS_LABELS: Record<string, string> = {
      PENDING: 'Buscando conductor',
      ACCEPTED: 'Conductor en camino',
      ARRIVED: 'Tu conductor ha llegado',
      STARTED: 'Tu viaje ha comenzado',
      IN_PROGRESS: 'Viaje en progreso',
      TRIP_STARTED: 'Viaje en progreso',
      COMPLETE: 'Viaje finalizado',
      CANCELLED: 'Viaje cancelado',
    };
    const channel = BookingRealtimeService.subscribeToBookingUpdates(activeBookingId, (updated: any) => {
      const newStatus = updated?.status;
      if (newStatus && lastStatusRef.current && newStatus !== lastStatusRef.current) {
        const label = STATUS_LABELS[newStatus] || 'Estado del viaje actualizado';
        triggerNotificationAlert(label);
      }
      if (newStatus) lastStatusRef.current = newStatus;
    });
    return () => {
      try { BookingRealtimeService.unsubscribe(`booking-${activeBookingId}`); } catch {}
    };
  }, [activeBookingId, triggerNotificationAlert]);

  useEffect(() => {
    if (!isFocused) {
      pulseScale.stopAnimation();
      pulseOp.stopAnimation();
      pulseScale.setValue(1);
      pulseOp.setValue(0.5);
      return;
    }

    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 2.8, duration: 2500, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOp, { toValue: 0, duration: 2500, useNativeDriver: true }),
          Animated.timing(pulseOp, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isFocused, pulseOp, pulseScale]);

  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;
    const consumePendingTripNavigation = async () => {
      try {
        const pendingBookingId = await AsyncStorage.getItem('pending_customer_active_trip');
        if (!pendingBookingId || cancelled) return;

        await AsyncStorage.removeItem('pending_customer_active_trip');
        nav.navigate('CustomerActiveTrip', { bookingId: pendingBookingId });
      } catch {
        // ignore storage/navigation race errors
      }
    };

    consumePendingTripNavigation();
    return () => {
      cancelled = true;
    };
  }, [isFocused, nav]);

  const navigateToCreateReservation = useCallback(() => {
    if (navigateLockRef.current) return;
    navigateLockRef.current = true;

    InteractionManager.runAfterInteractions(() => {
      nav.navigate('CreateReservation');
      setTimeout(() => {
        navigateLockRef.current = false;
      }, 650);
    });
  }, [nav]);

  const firstName = dbFirstName || profile?.first_name || profile?.firstName || user?.first_name || user?.firstName || user?.user_metadata?.first_name || user?.user_metadata?.firstName || '';
  const lastName = dbLastName || profile?.last_name || profile?.lastName || user?.last_name || user?.lastName || user?.user_metadata?.last_name || user?.user_metadata?.lastName || '';
  const displayName = firstName ? `${firstName}${lastName ? ' ' + lastName : ''}` : 'Usuario';
  const headerTopPad = Math.max(insets.top, Platform.OS === 'ios' ? 14 : 10) + 6;
  const scrollBottomPad = 60 + navBottomPad;
  const headerBgOp = scrollY.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
  const bellRot = bellAnim.interpolate({ inputRange: [-15, 0, 15], outputRange: ['-15deg', '0deg', '15deg'] });

  const onCardScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveCard(Math.max(0, Math.min(2, Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP)))));
  }, []);

  const SERVICES = [
    { id: 'T+Plus Especial', label: 'T+Plus Especial', sub: 'Servicio premium y exclusivo.', icon: 'star-outline' as const },
    { id: 'T+Plus Particular', label: 'T+Plus Particular', sub: 'Viajes cómodos y directos.', icon: 'car-outline' as const },
    { id: 'T+plus Van', label: 'T+plus Van', sub: 'Ideal para grupos y equipaje.', icon: 'car-outline' as const },
    { id: 'T+plus taxi', label: 'T+plus taxi', sub: 'Rápido, seguro y cercano.', icon: 'car-outline' as const },
  ];
  const BENEFITS = [
    { id: 'seg', icon: 'shield-checkmark-outline' as const, label: 'Seguridad', sub: 'Viajes protegidos' },
    { id: 'tar', icon: 'cash-outline' as const, label: 'Tarifas justas', sub: 'Precios transparentes' },
    { id: 'rap', icon: 'flash-outline' as const, label: 'Rapidez', sub: 'Llegada inmediata' },
    { id: 'con', icon: 'heart-outline' as const, label: 'Confort', sub: 'Comodidad garantizada' },
  ];

  return (
    <View style={s.root}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image source={BG_IMAGE} style={s.bgImage} resizeMode="cover" />
        <View style={s.bgGlow2} />
        {isFocused && PARTICLES.map(p => <Particle key={p.id} p={p} active={isFocused} />)}
      </View>
      <View style={[s.headerWrap, { paddingTop: headerTopPad }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, s.headerScrollBg, { opacity: headerBgOp }]} />
        <Animatable.View animation="fadeInDown" duration={500} style={s.header}>
          <View style={s.avatarRing}>
            {user?.profile_image
              ? <Image source={{ uri: user.profile_image }} style={s.avatarImg} />
              : <View style={s.avatarInner}><Ionicons name="person-outline" size={22} color="#00E5FF" /></View>}
          </View>
          <View style={s.greetWrap}>
            <Text style={s.greetLabel}>{greeting()}</Text>
            <Text style={s.greetName}>{displayName}</Text>
          </View>
          <Pressable style={({ pressed }) => [s.notifBtn, pressed && s.notifBtnPressed]} onPress={onBellPress}>
            <Animated.View style={{ transform: [{ rotate: bellRot }] }}>
              <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.7)" />
            </Animated.View>
            {(hasUnread || !!activeBookingId) && <View style={s.notifDot} />}
          </Pressable>
        </Animatable.View>
      </View>
      <Animated.ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <Animatable.View animation="fadeInUp" duration={500} delay={50} useNativeDriver>
          <Scalable onPress={navigateToCreateReservation} scaleTo={0.97} liftBy={-2} style={s.destCard}>
            <View style={s.destInner}>
              <Ionicons name="location-outline" size={20} style={s.destLeadingIcon} />
              <Text style={s.destText}>¿A dónde vamos?</Text>
              <View style={s.destArrow}>
                <Ionicons name="arrow-forward" size={18} color="#00E5FF" />
              </View>
            </View>
          </Scalable>
        </Animatable.View>
        <Animatable.View animation="fadeInUp" duration={500} delay={150} useNativeDriver>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Servicios</Text>
            <View style={s.badge}><Text style={s.badgeText}>RÁPIDO</Text></View>
          </View>
          <View style={s.actionsGrid}>
            {SERVICES.map(sv => (
              <ActionBtn key={sv.id} icon={sv.icon} label={sv.label} sub={sv.sub} onPress={navigateToCreateReservation} />
            ))}
          </View>
        </Animatable.View>
        <Animatable.View animation="fadeInUp" duration={500} delay={250} useNativeDriver>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>T+plus</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>Tu acceso inteligente</Text>
            </View>
          </View>
        </Animatable.View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={s.cardsContent}
          style={s.cardsOuter}
          onScroll={onCardScroll}
          onMomentumScrollEnd={onCardScroll}
          scrollEventThrottle={32}
        >
          <Scalable onPress={() => nav.navigate('Historial')} liftBy={-4} style={[s.tplusCard, s.cardReservas]}>
            <View style={s.cardIconWrap}><Ionicons name="time-outline" size={40} color="#00E5FF" /></View>
            <Text style={s.cardTitle} adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={2}>¡Tus Reservas!</Text>
            <Text style={s.cardDesc}>Tienes 0 reservas activas. Toca aquí para ver detalles y estar al tanto de tus viajes.</Text>
            <View style={s.cardAction}><Text style={s.cardActionTxt}>Ver reservas</Text><Ionicons name="chevron-forward" size={16} color="#00E5FF" /></View>
          </Scalable>
          <Scalable onPress={() => nav.navigate('Historial')} liftBy={-4} style={[s.tplusCard, s.cardHistorial]}>
            <View style={s.cardIconWrap}><Ionicons name="document-text-outline" size={40} color="#00E5FF" /></View>
            <Text style={s.cardTitle} adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={2}>Historial</Text>
            <Text style={s.cardDesc}>Revisa tu historial de viajes, pagos y actividad reciente en un solo lugar.</Text>
            <View style={s.cardAction}><Text style={s.cardActionTxt}>Ver historial</Text><Ionicons name="chevron-forward" size={16} color="#00E5FF" /></View>
          </Scalable>
          <Scalable onPress={() => nav.navigate('Carnet')} liftBy={-4} style={[s.tplusCard, s.cardCarnet]}>
            <View style={s.cardIconWrap}><Ionicons name="card-outline" size={40} color="#00E5FF" /></View>
            <Text style={s.cardTitle} adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={2}>¡Usa tu carnet!</Text>
            <Text style={s.cardDesc}>Presenta tu carnet T+plus para identificarte fácilmente. ¡Es tu acceso seguro y confiable!</Text>
            <View style={s.cardAction}><Text style={s.cardActionTxt}>Ver carnet</Text><Ionicons name="chevron-forward" size={16} color="#00E5FF" /></View>
          </Scalable>
        </ScrollView>
        <View style={s.dotsRow}>{[0, 1, 2].map(i => <View key={i} style={[s.dot, activeCard === i && s.dotActive]} />)}</View>
        <Animatable.View animation="fadeInUp" duration={500} delay={350} useNativeDriver>
          <Scalable onPress={() => Linking.openURL('https://tmasplus.com/beneficios')} scaleTo={0.98} liftBy={-2} style={s.promoCard}>
            <View style={s.promoBgView} />
            <Image source={CARD_TEXTURE} style={s.promoTexture} resizeMode="cover" />
            <View style={s.promoBgOverlay} />
            <View style={s.promoContent}>
              <View style={s.promoTag}><Text style={s.promoTagTxt}>NUEVO</Text></View>
              <Text style={s.promoTitle}>{'Justo para ti...\n¡Justo para todos!'}</Text>
              <Text style={s.promoText}>Viaja con tarifas justas y transparentes en toda Colombia.</Text>
              <View style={s.promoBtn}><Text style={s.promoBtnTxt}>Conocer más</Text><Ionicons name="chevron-forward" size={16} color="#051A26" /></View>
            </View>
          </Scalable>
        </Animatable.View>
        <View style={[s.sectionHeader, { marginTop: 28 }]}>
          <Text style={s.sectionTitle}>Beneficios</Text>
          <Text style={s.sectionSub}>Exclusivos para ti</Text>
        </View>
        <View style={s.benefitsGrid}>
          {BENEFITS.map((b, i) => (
            <Animatable.View key={b.id} animation="fadeInUp" duration={500} delay={480 + i * 80} useNativeDriver>
              <BenefitItem icon={b.icon} label={b.label} sub={b.sub} />
            </Animatable.View>
          ))}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.48 },
  bgGlow2: { position: 'absolute', bottom: 160, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(0,38,58,0.18)' },
  headerWrap: { zIndex: 10 },
  headerScrollBg: { backgroundColor: 'rgba(5,26,38,0.96)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,229,255,0.1)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: H_PAD, paddingTop: 6, paddingBottom: 12 },
  avatarRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#00E5FF', overflow: 'hidden', marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  avatarInner: { width: '100%', height: '100%', backgroundColor: '#0A2E3D', justifyContent: 'center', alignItems: 'center' },
  greetWrap: { flex: 1 },
  greetLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 },
  greetName: { fontSize: 20, fontWeight: '700', color: '#ffffff', letterSpacing: -0.3 },
  notifBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  notifDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E91E63', shadowColor: '#E91E63', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 4, elevation: 2 },
  notifBtnPressed: { backgroundColor: 'rgba(0,229,255,0.15)', borderColor: 'rgba(0,229,255,0.3)' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 18 },
  destCard: { marginBottom: 28, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 5 },
  destTexture: { ...StyleSheet.absoluteFillObject, opacity: 0.32 },
  destInner: { flexDirection: 'row', alignItems: 'center' },
  destLeadingIcon: { marginRight: 12, color: '#00E5FF' },
  iconPulseWrap: { width: 40, height: 40, marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  destIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#00E5FF', justifyContent: 'center', alignItems: 'center', shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
  destText: { flex: 1, fontSize: 16, fontWeight: '700', color: '#EAF2F7', letterSpacing: -0.2 },
  destArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, marginTop: 4, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', letterSpacing: -0.3, marginRight: 8 },
  sectionSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  badge: {
    backgroundColor: 'rgba(0,229,255,0.15)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
    maxWidth: '70%',
  },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#00E5FF', letterSpacing: 0.5, flexShrink: 1 },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  serviceCardWrap: {
    width: (SW - H_PAD * 2 - 12) / 2,
    marginBottom: 12,
  },
  serviceCard: {
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 108,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    backgroundColor: 'rgba(10,46,61,0.94)',
  },
  serviceCardContent: {
    padding: 10,
  },
  serviceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(0,229,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  serviceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 16,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  serviceSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 13,
    marginBottom: 8,
  },
  serviceCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#00E5FF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  serviceCtaTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#051A26',
    marginRight: 2,
  },
  actionItem: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14 },
  actionIconWrap: { width: 56, height: 56, borderRadius: 14, backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionLabel: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 14 },
  cardsOuter: { marginHorizontal: -H_PAD },
  cardsContent: { paddingHorizontal: H_PAD, paddingBottom: 14 },
  tplusCard: {
    width: CARD_W,
    minHeight: 240,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    marginRight: CARD_GAP,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,46,61,0.94)',
  },
  cardCarnet: { backgroundColor: 'rgba(10,46,61,0.94)' },
  cardReservas: { backgroundColor: 'rgba(10,46,61,0.94)' },
  cardHistorial: { backgroundColor: 'rgba(10,46,61,0.94)' },
  cardTracking: { backgroundColor: 'rgba(10,46,61,0.94)' },
  cardIconWrap: { width: 60, height: 60, borderRadius: 14, backgroundColor: 'rgba(0,229,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', letterSpacing: -0.3, marginBottom: 6 },
  cardDesc: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.65)', flexShrink: 1, marginBottom: 12 },
  cardAction: { flexDirection: 'row', alignItems: 'center' },
  cardActionTxt: { fontSize: 13, fontWeight: '600', color: '#00E5FF', marginRight: 4 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, marginBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4 },
  dotActive: { width: 24, backgroundColor: '#00E5FF', borderRadius: 3 },
  promoCard: { borderRadius: 24, overflow: 'hidden', minHeight: 200, justifyContent: 'flex-end' },
  promoBgView: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0D3B4F' },
  promoTexture: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  promoBgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,26,38,0.4)' },
  promoContent: { padding: 20, zIndex: 1 },
  promoTag: { alignSelf: 'flex-start', backgroundColor: '#00E5FF', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, marginBottom: 8 },
  promoTagTxt: { fontSize: 10, fontWeight: '700', color: '#051A26', letterSpacing: 1.5 },
  promoTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff', lineHeight: 28, marginBottom: 6, letterSpacing: -0.5 },
  promoText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 14 },
  promoBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#00E5FF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14 },
  promoBtnTxt: { fontSize: 14, fontWeight: '600', color: '#051A26', marginRight: 4 },
  benefitsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 4 },
  benefitItem: { width: (SW - H_PAD * 2 - 14) / 2, padding: 20, borderRadius: 16, backgroundColor: 'rgba(10,46,61,0.55)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.12)', alignItems: 'center', marginBottom: 14 },
  benefitIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,229,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  benefitLabel: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
  benefitSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
});

export default CustomerHomeScreen;