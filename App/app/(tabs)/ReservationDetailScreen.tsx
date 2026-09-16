import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Platform, Share, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StarRating from 'react-native-star-rating-widget';
import { RootState } from '@/common/store';
import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { formatBookingFareRange } from '@/constants/fare';
import { fetchAndSyncUserRating } from '@/common/utils/userRating';
import { API_KEY } from '@/config/AppConfig';
import { GOOGLE_MAPS_DARK_STYLE } from '@/config/googleMapsDarkStyle';

const BG_IMAGE = require('../../assets/images/bg.png');
const GOOGLE_MAPS_APIKEY = API_KEY;
const NEQUI_LOGO_URI = 'https://img.logo.dev/nequi.com.co?token=pk_c_F6FSsGSaKey4lkmcDLNw';
const DAVIPLATA_LOGO_URI = 'https://img.logo.dev/daviplata.com?token=pk_c_F6FSsGSaKey4lkmcDLNw';

type LatLng = { latitude: number; longitude: number };

/** Decodifica overview_polyline de Google Directions. */
const decodePolyline = (encoded: string): LatLng[] => {
  const coordinates: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coordinates;
};

const formatDate = (ts: string) => {
  const d = new Date(ts);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const formatTime = (ts: string) => {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'p. m.' : 'a. m.';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m}:00 ${ampm}`;
};

type StatusMeta = {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  softBg: string;
  border: string;
};

const getStatusMeta = (status?: string): StatusMeta => {
  const key = String(status || '').toUpperCase();
  if (['COMPLETE', 'PAID'].includes(key)) {
    return {
      title: 'Reserva Completada',
      icon: 'checkmark-done-circle',
      color: '#00B0FF',
      softBg: 'rgba(0,176,255,0.12)',
      border: 'rgba(0,176,255,0.35)',
    };
  }
  if (['ACCEPTED', 'STARTED', 'ARRIVED'].includes(key)) {
    return {
      title: 'Reserva Confirmada',
      icon: 'checkmark-circle',
      color: '#00E676',
      softBg: 'rgba(0,230,118,0.12)',
      border: 'rgba(0,230,118,0.35)',
    };
  }
  if (key === 'CANCELLED') {
    return {
      title: 'Reserva Cancelada',
      icon: 'close-circle',
      color: '#E91E63',
      softBg: 'rgba(233,30,99,0.12)',
      border: 'rgba(233,30,99,0.35)',
    };
  }
  return {
    title: 'Reserva Pendiente',
    icon: 'time',
    color: '#00E5FF',
    softBg: 'rgba(0,229,255,0.12)',
    border: 'rgba(0,229,255,0.35)',
  };
};

const ReservationDetailScreen = () => {
  const nav = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const profile = useSelector((s: RootState) => s.auth.profile) as any;
  const mapRef = useRef<MapView>(null);

  const paramReservation = (route.params as any)?.reservation;
  const [reservation, setReservation] = useState<any>(paramReservation);
  const [driverInfo, setDriverInfo] = useState<{
    name: string | null;
    plate: string | null;
    make: string | null;
    model: string | null;
    color: string | null;
    photo: string | null;
  } | null>(null);
  const [counterpartPhoto, setCounterpartPhoto] = useState<string | null>(null);
  const [counterpartLabel, setCounterpartLabel] = useState<string | null>(null);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 20 : 18) + 6;

  const userId = user?.auth_id || user?.id || profile?.id;
  const isDriverOnTrip = !!(
    reservation &&
    (reservation.driver === userId || reservation.driver_id === userId)
  );

  const accountType = String(
    user?.usertype ||
      user?.user_type ||
      user?.userType ||
      profile?.user_type ||
      user?.user_metadata?.usertype ||
      ''
  )
    .trim()
    .toLowerCase();
  const isDriverAccount = accountType === 'driver' || isDriverOnTrip;

  const statusMeta = getStatusMeta(reservation?.status);
  const driverId = reservation?.driver || reservation?.driver_id || null;
  const customerId = reservation?.customer_id || reservation?.customer || null;

  // Cliente califica conductor → driver_rating / review
  // Conductor califica cliente → customer_rating / customer_review
  const myGivenRating = isDriverAccount
    ? Number(reservation?.customer_rating) || 0
    : Number(reservation?.driver_rating) || 0;
  const myGivenReview = isDriverAccount
    ? (reservation?.customer_review || '')
    : (reservation?.review || reservation?.driver_review || '');
  const hasRated = myGivenRating >= 1;
  // Cliente puede calificar al completar (aunque falte driver_id en BD).
  // Conductor necesita customerId para sincronizar promedio del cliente.
  const canRate =
    ['COMPLETE', 'PAID'].includes(String(reservation?.status || '').toUpperCase()) &&
    !hasRated &&
    (isDriverAccount ? !!customerId : true);

  const resolvedDriver = useMemo(() => {
    const name =
      driverInfo?.name ||
      reservation?.driver_name ||
      'Conductor';
    return {
      name,
      category: reservation?.car_type || 'N/A',
      plate: driverInfo?.plate || reservation?.plate_number || reservation?.vehicle_number || 'N/A',
      make: driverInfo?.make || reservation?.vehicle_make || 'N/A',
      model: driverInfo?.model || reservation?.vehicle_model || reservation?.car_model || 'N/A',
      color: driverInfo?.color || reservation?.vehicle_color || reservation?.car_color || 'N/A',
      photo: driverInfo?.photo || reservation?.driver_image || null,
    };
  }, [driverInfo, reservation]);

  const refreshBooking = useCallback(async () => {
    const id = paramReservation?.id;
    if (!id) return;
    try {
      const headers = await getSupabaseAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${id}&select=*`,
        { headers },
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (Array.isArray(rows) && rows[0]) setReservation(rows[0]);
    } catch (e) {
      console.warn('[ReservationDetail] refresh booking failed:', e);
    }
  }, [paramReservation?.id]);

  useEffect(() => {
    setReservation(paramReservation);
    refreshBooking();
  }, [paramReservation, refreshBooking]);

  useEffect(() => {
    let cancelled = false;
    const loadRoute = async () => {
      if (!reservation) return;

      const pLat = Number(reservation.pickup_lat ?? reservation.pickup?.lat);
      const pLng = Number(reservation.pickup_lng ?? reservation.pickup?.lng);
      const dLat = Number(reservation.drop_lat ?? reservation.drop?.lat);
      const dLng = Number(reservation.drop_lng ?? reservation.drop?.lng);
      if (![pLat, pLng, dLat, dLng].every(Number.isFinite)) return;

      const origin: LatLng = { latitude: pLat, longitude: pLng };
      const destination: LatLng = { latitude: dLat, longitude: dLng };
      let points: LatLng[] = [origin, destination];

      // Ruta por calles (Google Directions), no trazo GPS ni línea recta
      if (GOOGLE_MAPS_APIKEY) {
        try {
          const url =
            `https://maps.googleapis.com/maps/api/directions/json` +
            `?origin=${pLat},${pLng}&destination=${dLat},${dLng}` +
            `&mode=driving&key=${GOOGLE_MAPS_APIKEY}`;
          const res = await fetch(url);
          const json = await res.json();
          const encoded = json?.routes?.[0]?.overview_polyline?.points;
          if (json?.status === 'OK' && encoded) {
            const decoded = decodePolyline(encoded);
            if (decoded.length > 1) points = decoded;
          } else {
            console.warn('[ReservationDetail] Directions:', json?.status, json?.error_message);
          }
        } catch (e) {
          console.warn('[ReservationDetail] Directions fetch failed:', e);
        }
      }

      if (cancelled) return;
      setRouteCoords(points);
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
          animated: false,
        });
      }, 300);
    };
    loadRoute();
    return () => { cancelled = true; };
  }, [
    reservation?.id,
    reservation?.pickup_lat,
    reservation?.pickup_lng,
    reservation?.drop_lat,
    reservation?.drop_lng,
  ]);

  useEffect(() => {
    let cancelled = false;

    const pickPhoto = (...candidates: Array<string | null | undefined>) => {
      for (const c of candidates) {
        const u = String(c || '').trim();
        if (u.startsWith('http') || u.startsWith('file:') || u.startsWith('content:')) return u;
      }
      return null;
    };

    const loadCounterpart = async () => {
      const targetId = isDriverAccount ? customerId : driverId;
      const fallbackName = isDriverAccount
        ? (reservation?.customer_name || 'usuario')
        : (reservation?.driver_name || resolvedDriver.name || 'conductor');
      const fallbackPhoto = pickPhoto(
        isDriverAccount
          ? reservation?.customer_image
          : (reservation?.driver_image || resolvedDriver.photo),
      );

      if (!cancelled) {
        setCounterpartLabel(fallbackName);
        setCounterpartPhoto(fallbackPhoto);
      }

      if (!targetId) return;

      try {
        const headers = await getSupabaseAuthHeaders();
        const url =
          `${SUPABASE_URL}/rest/v1/users` +
          `?or=(id.eq.${encodeURIComponent(targetId)},auth_id.eq.${encodeURIComponent(targetId)})` +
          `&select=first_name,last_name,profile_image&limit=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          console.warn('[ReservationDetail] counterpart fetch failed:', res.status, await res.text());
          return;
        }
        const rows = await res.json();
        const u = Array.isArray(rows) ? rows[0] : null;
        if (!u || cancelled) return;

        const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        const photo = pickPhoto(u.profile_image, fallbackPhoto);
        setCounterpartLabel(full || fallbackName);
        setCounterpartPhoto(photo);
      } catch (e) {
        console.warn('[ReservationDetail] counterpart load failed:', e);
      }
    };

    loadCounterpart();
    return () => { cancelled = true; };
  }, [
    isDriverAccount,
    customerId,
    driverId,
    reservation?.customer_name,
    reservation?.driver_name,
    reservation?.customer_image,
    reservation?.driver_image,
    resolvedDriver.name,
    resolvedDriver.photo,
  ]);

  useEffect(() => {
    let cancelled = false;
    const enrich = async () => {
      if (!driverId || isDriverAccount) return;
      try {
        const headers = await getSupabaseAuthHeaders();
        let name: string | null = reservation?.driver_name || null;
        let photo: string | null = reservation?.driver_image || null;

        const userUrl =
          `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(driverId)}` +
          `&select=first_name,last_name,profile_image&limit=1`;
        const userRes = await fetch(userUrl, { headers });
        if (userRes.ok) {
          const users = await userRes.json();
          const u = Array.isArray(users) ? users[0] : null;
          if (u) {
            const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
            if (full) name = full;
            photo = u.profile_image || photo;
          }
        }

        let plate: string | null =
          reservation.plate_number || reservation.vehicle_number || null;
        let make: string | null = reservation.vehicle_make || null;
        let model: string | null =
          reservation.vehicle_model || reservation.car_model || null;
        let color: string | null =
          reservation.vehicle_color || reservation.car_color || null;

        if (!plate || !make || !model || !color) {
          const carUrl =
            `${SUPABASE_URL}/rest/v1/cars` +
            `?driver_id=eq.${encodeURIComponent(driverId)}` +
            `&select=plate,make,model,color,vehicle_number,vehicle_make,vehicle_model,vehicle_color` +
            `&order=is_active.desc,created_at.desc&limit=1`;
          const carRes = await fetch(carUrl, { headers });
          if (carRes.ok) {
            const cars = await carRes.json();
            const car = Array.isArray(cars) ? cars[0] : null;
            if (car) {
              plate = plate || car.plate || car.vehicle_number || null;
              make = make || car.make || car.vehicle_make || null;
              model = model || car.model || car.vehicle_model || null;
              color = color || car.color || car.vehicle_color || null;
            }
          }
        }

        if (!cancelled) {
          setDriverInfo({ name, plate, make, model, color, photo });
        }
      } catch (e) {
        console.warn('[ReservationDetail] enrich driver info failed:', e);
      }
    };
    enrich();
    return () => { cancelled = true; };
  }, [driverId, isDriverAccount, reservation]);

  if (!reservation) {
    return (
      <View style={s.root}>
        <Text style={{ color: '#FFF', textAlign: 'center', marginTop: 100 }}>No hay datos de la reserva</Text>
      </View>
    );
  }

  const accountName = (() => {
    const first =
      profile?.first_name ||
      profile?.firstName ||
      user?.first_name ||
      user?.firstName ||
      user?.user_metadata?.first_name ||
      '';
    const last =
      profile?.last_name ||
      profile?.lastName ||
      user?.last_name ||
      user?.lastName ||
      user?.user_metadata?.last_name ||
      '';
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (isDriverAccount) return reservation.driver_name || 'Conductor';
    return reservation.customer_name || 'Cliente';
  })();

  const handleShare = async () => {
    try {
      await Share.share({ message: buildConfirmationText() });
    } catch {}
  };

  const buildConfirmationText = () => {
    return `Hola, ${accountName}

Te confirmo, estos son los datos de tu servicio:

*Fecha:* ${formatDate(reservation.booking_date)}
*Hora:* ${formatTime(reservation.booking_date)}

*Datos del servicio:*
*Origen:* ${reservation.pickup_address}
*Destino:* ${reservation.drop_address}
*Cliente:* ${reservation.customer_name}
*Categoría:* ${reservation.car_type || 'N/A'}
*Valor estimado:* ${formatBookingFareRange(reservation)}
*Distancia estimada:* ${reservation.distance?.toFixed?.(2) ?? reservation.distance} km
*Tiempo Estimado:* ${reservation.duration} min
*Recorrido:* ${reservation.trip_type}
`;
  };

  const getPaymentMethodLabel = (mode: string) => {
    switch (mode) {
      case 'cash': return 'Efectivo';
      case 'nequi': return 'Nequi';
      case 'daviplata': return 'Daviplata';
      default: return 'Efectivo';
    }
  };

  const openRatingModal = () => {
    setStars(0);
    setComment('');
    setRatingError(null);
    setRatingModalVisible(true);
  };

  const submitRating = async () => {
    if (stars < 1) {
      setRatingError('Selecciona de 1 a 5 estrellas.');
      return;
    }
    setSubmittingRating(true);
    setRatingError(null);
    try {
      const headers = await getSupabaseAuthHeaders(true);
      const body = isDriverAccount
        ? {
            customer_rating: Math.round(stars),
            customer_review: comment.trim() || null,
          }
        : {
            driver_rating: Math.round(stars),
            review: comment.trim() || null,
          };

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${reservation.id}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());

      const ratedUserId = isDriverAccount ? customerId : driverId;
      if (ratedUserId) {
        await fetchAndSyncUserRating(
          ratedUserId,
          isDriverAccount ? 'customer' : 'driver',
          { syncToProfile: true },
        );
      }

      const rows = await res.json();
      if (Array.isArray(rows) && rows[0]) {
        setReservation(rows[0]);
      } else {
        setReservation((prev: any) => ({ ...prev, ...body }));
      }
      setRatingModalVisible(false);
    } catch (e: any) {
      console.error('[ReservationDetail] submit rating:', e);
      setRatingError('No se pudo guardar la calificación.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const MetaItem = ({ label, value }: { label: string; value: string }) => (
    <View style={s.metaItem}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );

  const tripStatus = String(reservation.status || '').toUpperCase();
  const isImmediate = reservation.booking_type === 'immediate';
  const showCounterpart =
    ['ACCEPTED', 'STARTED', 'ARRIVED', 'COMPLETE', 'PAID'].includes(tripStatus);

  const counterpartName =
    counterpartLabel ||
    (isDriverAccount
      ? (reservation.customer_name || 'usuario')
      : (resolvedDriver.name || 'conductor'));

  const ratingModalTitle = isDriverAccount
    ? `Califica al usuario ${counterpartName}`
    : `Califica tu viaje con ${counterpartName}`;

  const distanceLabel = `${
    Number.isFinite(Number(reservation.distance))
      ? Number(reservation.distance).toFixed(2)
      : reservation.distance ?? '—'
  } km`;
  const durationLabel = `${reservation.duration ?? '—'} min`;

  return (
    <View style={s.root}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image source={BG_IMAGE} style={s.bgImage} resizeMode="cover" />
        <View style={s.bgOverlay} />
      </View>

      <View style={[s.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Detalle de Reserva</Text>
        <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.75}>
          <Ionicons name="share-outline" size={18} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animatable.View animation="fadeInDown" duration={400} useNativeDriver>
          <View style={[s.statusBar, { borderColor: statusMeta.border, backgroundColor: statusMeta.softBg }]}>
            <View style={[s.statusIconWrap, { backgroundColor: statusMeta.softBg }]}>
              <Ionicons name={statusMeta.icon} size={18} color={statusMeta.color} />
            </View>
            <View style={s.statusTextCol}>
              <Text style={s.statusTitle}>{statusMeta.title}</Text>
              <Text style={[s.statusRef, { color: statusMeta.color }]}>
                Ref · {reservation.reference}
              </Text>
            </View>
            <View style={[s.typeChip, isImmediate ? s.typeChipImmediate : s.typeChipScheduled]}>
              <Ionicons
                name={isImmediate ? 'flash' : 'calendar-outline'}
                size={12}
                color="#00E5FF"
              />
              <Text style={s.typeChipTxt}>{isImmediate ? 'ASAP' : 'Programada'}</Text>
            </View>
          </View>
        </Animatable.View>

        {routeCoords.length > 1 ? (
          <Animatable.View animation="fadeInUp" duration={380} delay={40} useNativeDriver>
            <View style={s.mapCard} pointerEvents="none">
              <MapView
                ref={mapRef}
                style={s.map}
                provider={PROVIDER_GOOGLE}
                customMapStyle={GOOGLE_MAPS_DARK_STYLE}
                pointerEvents="none"
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                toolbarEnabled={false}
                moveOnMarkerPress={false}
                initialRegion={{
                  latitude: routeCoords[0].latitude,
                  longitude: routeCoords[0].longitude,
                  latitudeDelta: 0.04,
                  longitudeDelta: 0.04,
                }}
              >
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#00E5FF"
                  strokeWidth={8}
                  lineJoin="round"
                  lineCap="round"
                  tappable={false}
                  zIndex={1}
                />
                <Polyline
                  coordinates={routeCoords}
                  strokeColor="#00E676"
                  strokeWidth={5}
                  lineJoin="round"
                  lineCap="round"
                  tappable={false}
                  zIndex={2}
                />
                <Marker
                  coordinate={routeCoords[0]}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={4}
                >
                  <View style={s.routeEndpointStart} />
                </Marker>
                <Marker
                  coordinate={routeCoords[routeCoords.length - 1]}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={5}
                >
                  <View style={s.routeEndpointEnd} />
                </Marker>
              </MapView>
            </View>
          </Animatable.View>
        ) : null}

        <Animatable.View animation="fadeInUp" duration={400} delay={60} useNativeDriver>
          <Text style={s.greetingLine}>
            Hola, <Text style={s.greetingName}>{accountName}</Text>
            <Text style={s.greetingMuted}> · datos de tu servicio</Text>
          </Text>
        </Animatable.View>

        {['COMPLETE', 'PAID'].includes(tripStatus) ? (
          <Animatable.View animation="fadeInUp" duration={380} delay={80} useNativeDriver>
            <View style={s.card}>
              {hasRated ? (
                <View style={s.ratingGivenWrap}>
                  {counterpartPhoto ? (
                    <Image source={{ uri: counterpartPhoto }} style={s.ratingAvatar} />
                  ) : (
                    <View style={[s.ratingAvatar, s.ratingAvatarFallback]}>
                      <Ionicons name="person" size={18} color="#00E5FF" />
                    </View>
                  )}
                  <View style={s.ratingGivenBody}>
                    <Text style={s.ratingPersonName} numberOfLines={1}>
                      {counterpartName}
                    </Text>
                    <View style={s.ratingGivenRow}>
                      <Text style={s.ratingGivenLabel}>Calificación</Text>
                      <View style={s.ratingStarsInline}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Ionicons
                            key={n}
                            name={n <= Math.round(myGivenRating) ? 'star' : 'star-outline'}
                            size={13}
                            color={n <= Math.round(myGivenRating) ? '#FFB300' : 'rgba(255,255,255,0.28)'}
                            style={{ marginRight: 1 }}
                          />
                        ))}
                      </View>
                    </View>
                    <Text style={myGivenReview ? s.ratingCommentTxt : s.ratingMuted}>
                      {myGivenReview ? String(myGivenReview) : 'Sin comentario'}
                    </Text>
                  </View>
                </View>
              ) : canRate ? (
                <TouchableOpacity style={s.rateBtn} onPress={openRatingModal} activeOpacity={0.85}>
                  <Ionicons name="star" size={16} color="#051A26" />
                  <Text style={s.rateBtnTxt}>
                    Calificar {isDriverAccount ? 'cliente' : 'conductor'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={s.ratingMuted}>Aún no hay calificación en este viaje.</Text>
              )}
            </View>
          </Animatable.View>
        ) : null}

        <Animatable.View animation="fadeInUp" duration={400} delay={100} useNativeDriver>
          <View style={s.card}>
            <Text style={s.sectionTitle}>Servicio</Text>

            <View style={s.dateTimeRow}>
              <View style={[s.dateTimeCard, s.dateTimeCardLeft]}>
                <Text style={s.metaLabel}>Fecha</Text>
                <Text style={s.metaValue}>{formatDate(reservation.booking_date)}</Text>
              </View>
              <View style={s.dateTimeCard}>
                <Text style={s.metaLabel}>Hora</Text>
                <Text style={s.metaValue}>{formatTime(reservation.booking_date)}</Text>
              </View>
            </View>

            <View style={s.routeBlock}>
              <View style={s.routeRow}>
                <View style={s.routeDotStart} />
                <View style={s.routeTextCol}>
                  <Text style={s.metaLabel}>Origen</Text>
                  <Text style={s.metaValue}>{reservation.pickup_address || '—'}</Text>
                </View>
              </View>
              <View style={s.routeLine} />
              <View style={s.routeRow}>
                <View style={s.routeDotEnd} />
                <View style={s.routeTextCol}>
                  <Text style={s.metaLabel}>Destino</Text>
                  <Text style={s.metaValue}>{reservation.drop_address || '—'}</Text>
                </View>
              </View>
            </View>

            <View style={s.metaGrid}>
              {!isDriverAccount ? (
                <MetaItem label="Cliente" value={reservation.customer_name || 'N/A'} />
              ) : null}
              <MetaItem label="Categoría" value={reservation.car_type || 'N/A'} />
              <MetaItem label="Valor" value={formatBookingFareRange(reservation)} />
              <MetaItem label="Distancia" value={distanceLabel} />
              <MetaItem label="Tiempo" value={durationLabel} />
              <MetaItem label="Recorrido" value={reservation.trip_type || 'N/A'} />
            </View>

            <View style={s.paymentRow}>
              <View style={s.payLogoBox}>
                {reservation.payment_mode === 'nequi' ? (
                  <Image source={{ uri: NEQUI_LOGO_URI }} style={s.payLogoImg} />
                ) : reservation.payment_mode === 'daviplata' ? (
                  <Image source={{ uri: DAVIPLATA_LOGO_URI }} style={s.payLogoImg} />
                ) : (
                  <Ionicons name="cash-outline" size={16} color="#16A34A" />
                )}
              </View>
              <Text style={s.paymentLabel}>Método de pago:</Text>
              <Text style={s.paymentValue}>
                {getPaymentMethodLabel(reservation.payment_mode || 'cash')}
              </Text>
            </View>
          </View>
        </Animatable.View>

        {showCounterpart && !isDriverAccount ? (
          <Animatable.View animation="fadeInUp" duration={400} delay={140} useNativeDriver>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Conductor</Text>
              <View style={s.personHeader}>
                {counterpartPhoto || resolvedDriver.photo ? (
                  <Image
                    source={{ uri: counterpartPhoto || resolvedDriver.photo || '' }}
                    style={s.personAvatar}
                  />
                ) : (
                  <View style={[s.personAvatar, s.ratingAvatarFallback]}>
                    <Ionicons name="person" size={20} color="#00E5FF" />
                  </View>
                )}
                <View style={s.personHeaderText}>
                  <Text style={s.personName}>{resolvedDriver.name}</Text>
                  <Text style={s.personSub}>{resolvedDriver.category}</Text>
                </View>
              </View>
              <View style={s.metaGrid}>
                <MetaItem label="Placa" value={resolvedDriver.plate} />
                <MetaItem label="Marca" value={resolvedDriver.make} />
                <MetaItem label="Modelo" value={resolvedDriver.model} />
                <MetaItem label="Color" value={resolvedDriver.color} />
              </View>
            </View>
          </Animatable.View>
        ) : null}

        {showCounterpart && isDriverAccount && !['COMPLETE', 'PAID', 'CANCELLED'].includes(tripStatus) ? (
          <Animatable.View animation="fadeInUp" duration={400} delay={140} useNativeDriver>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Cliente</Text>
              <View style={s.personHeader}>
                {counterpartPhoto ? (
                  <Image source={{ uri: counterpartPhoto }} style={s.personAvatar} />
                ) : (
                  <View style={[s.personAvatar, s.ratingAvatarFallback]}>
                    <Ionicons name="person" size={20} color="#00E5FF" />
                  </View>
                )}
                <View style={s.personHeaderText}>
                  <Text style={s.personName}>{reservation.customer_name || 'Cliente'}</Text>
                  <Text style={s.personSub}>{reservation.customer_contact || 'Sin celular'}</Text>
                </View>
              </View>
              {reservation.customer_email ? (
                <View style={s.emailRow}>
                  <Ionicons name="mail-outline" size={14} color="rgba(255,255,255,0.45)" />
                  <Text style={s.emailTxt} numberOfLines={1}>
                    {reservation.customer_email}
                  </Text>
                </View>
              ) : null}
            </View>
          </Animatable.View>
        ) : null}
      </ScrollView>

      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingRating && setRatingModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <TouchableOpacity
              style={s.modalClose}
              onPress={() => !submittingRating && setRatingModalVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>

            {counterpartPhoto ? (
              <Image source={{ uri: counterpartPhoto }} style={s.modalAvatar} />
            ) : (
              <View style={[s.modalAvatar, s.modalAvatarFallback]}>
                <Ionicons name="person" size={36} color="#00E5FF" />
              </View>
            )}
            <Text style={s.modalTitle}>{ratingModalTitle}</Text>

            <View style={s.modalStars}>
              <StarRating
                rating={stars}
                onChange={setStars}
                starSize={34}
                color="#FFB300"
                emptyColor="rgba(255,255,255,0.25)"
                enableHalfStar={false}
              />
            </View>

            <TextInput
              style={s.modalInput}
              placeholder="Comentario (opcional)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={400}
            />

            {ratingError ? <Text style={s.modalError}>{ratingError}</Text> : null}

            <TouchableOpacity
              style={[s.modalSubmit, (stars < 1 || submittingRating) && { opacity: 0.5 }]}
              onPress={submitRating}
              disabled={stars < 1 || submittingRating}
              activeOpacity={0.85}
            >
              {submittingRating ? (
                <ActivityIndicator color="#051A26" />
              ) : (
                <Text style={s.modalSubmitTxt}>Enviar calificación</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ReservationDetailScreen;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#051A26' },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,26,38,0.82)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#FFF', letterSpacing: -0.2 },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  statusIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  statusTextCol: { flex: 1, minWidth: 0 },
  statusTitle: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  statusRef: { fontSize: 12, fontWeight: '500', marginTop: 1, opacity: 0.95 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeChipImmediate: {
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderColor: 'rgba(0,229,255,0.35)',
  },
  typeChipScheduled: {
    backgroundColor: 'rgba(0,229,255,0.06)',
    borderColor: 'rgba(0,229,255,0.25)',
  },
  typeChipTxt: { fontSize: 11, fontWeight: '600', color: '#00E5FF' },

  mapCard: {
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  map: { flex: 1 },

  greetingLine: { fontSize: 13, color: '#FFF', marginBottom: 10, lineHeight: 18 },
  greetingName: { fontWeight: '700', color: '#00E5FF' },
  greetingMuted: { color: 'rgba(255,255,255,0.45)', fontWeight: '400' },

  card: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(10,46,61,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.12)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(0,229,255,0.85)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  ratingGivenWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  ratingAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  ratingAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.1)',
  },
  ratingGivenBody: { flex: 1, minWidth: 0 },
  ratingPersonName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  ratingGivenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  ratingGivenLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginRight: 8,
  },
  ratingStarsInline: { flexDirection: 'row', alignItems: 'center' },
  ratingCommentTxt: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18 },
  ratingMuted: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    borderRadius: 10,
    paddingVertical: 11,
    gap: 8,
  },
  rateBtnTxt: { color: '#051A26', fontWeight: '700', fontSize: 13 },

  dateTimeRow: { flexDirection: 'row', marginBottom: 12 },
  dateTimeCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,229,255,0.06)',
  },
  dateTimeCardLeft: { marginRight: 8 },

  routeBlock: { marginBottom: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  routeDotStart: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E5FF',
    marginTop: 5,
    marginRight: 10,
  },
  routeDotEnd: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E91E63',
    marginTop: 5,
    marginRight: 10,
  },
  routeLine: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(0,229,255,0.28)',
    marginLeft: 3.5,
    marginVertical: 2,
  },
  routeTextCol: { flex: 1, minWidth: 0, paddingBottom: 6 },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  metaItem: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    lineHeight: 18,
  },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,229,255,0.12)',
    gap: 8,
  },
  payLogoBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  payLogoImg: { width: 18, height: 18 },
  paymentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    flex: 1,
  },
  paymentValue: { fontSize: 13, fontWeight: '700', color: '#00E5FF' },

  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  personHeaderText: { flex: 1, minWidth: 0 },
  personName: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  personSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  emailTxt: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: '#0A2E3D',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.28)',
    padding: 20,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#00E5FF',
  },
  modalAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  modalStars: { marginBottom: 14 },
  modalInput: {
    width: '100%',
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    backgroundColor: 'rgba(5,26,38,0.6)',
    color: '#FFF',
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  modalError: { color: '#FF6B8A', marginTop: 8, fontSize: 12 },
  modalSubmit: {
    marginTop: 14,
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#00E5FF',
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalSubmitTxt: { color: '#051A26', fontWeight: '700', fontSize: 14 },
  routeEndpointStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#00E5FF',
  },
  routeEndpointEnd: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E91E63',
    borderWidth: 2.5,
    borderColor: '#00E5FF',
  },
});
