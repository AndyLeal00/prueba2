import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Mapbox, { MapboxStyles } from '@/config/MapboxConfig';
import { getMapboxAccessToken } from '@/config/AppConfig';
import supabase from '@/config/SupabaseConfig';
import { useAnimatedDriverMarker } from '@/hooks/useAnimatedDriverMarker';
import driverCarIcon from '../../assets/images/track_Car.png';

getMapboxAccessToken(); // ensure token is set

const { width } = Dimensions.get('window');

type ScreenState = 'idle' | 'searching' | 'tracking' | 'not_found' | 'no_active';

interface TrackingInfo {
  bookingId: string;
  driverName: string;
  carModel: string;
  carColor: string;
  plateNumber: string;
  bookingStatus: string;
  initialLat: number | null;
  initialLng: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: 'Conductor en camino',
  ARRIVED: 'Conductor llegó al punto',
  STARTED: 'Viaje en curso',
};

export default function PlateTrackingScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [plate, setPlate] = useState('');
  const [state, setState] = useState<ScreenState>('idle');
  const [info, setInfo] = useState<TrackingInfo | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const cameraRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const animatedCoords = useAnimatedDriverMarker(driverLocation);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleSearch = useCallback(async () => {
    const trimmed = plate.trim().toUpperCase();
    if (!trimmed) return;
    Keyboard.dismiss();
    setState('searching');
    cleanup();
    setDriverLocation(null);
    setInfo(null);

    try {
      console.log('[PlateTracking] Searching for plate:', trimmed);
      const { data, error } = await (supabase as any).rpc('get_active_booking_by_plate', {
        p_plate: trimmed,
      });

      if (error) {
        console.error('[PlateTracking] RPC error:', error.message, error.code);
        throw error;
      }

      console.log('[PlateTracking] RPC response:', data);

      if (!data || (data as any[]).length === 0) {
        console.warn('[PlateTracking] No active booking found for plate:', trimmed);
        setState('not_found');
        return;
      }

      const row = (data as any[])[0];

      if (!row.booking_id) {
        console.warn('[PlateTracking] No booking_id in response');
        setState('not_found');
        return;
      }

      console.log('[PlateTracking] Found booking:', {
        bookingId: row.booking_id,
        status: row.booking_status,
        hasLat: row.driver_lat != null,
        hasLng: row.driver_lng != null,
      });

      const trackingInfo: TrackingInfo = {
        bookingId: row.booking_id,
        driverName: row.driver_name || 'Conductor',
        carModel: row.car_model || '',
        carColor: row.car_color || '',
        plateNumber: row.plate_number || trimmed,
        bookingStatus: row.booking_status || 'ACCEPTED',
        initialLat: row.driver_lat != null ? Number(row.driver_lat) : null,
        initialLng: row.driver_lng != null ? Number(row.driver_lng) : null,
      };

      setInfo(trackingInfo);

      if (trackingInfo.initialLat != null && trackingInfo.initialLng != null) {
        console.log('[PlateTracking] Setting initial location:', {
          lat: trackingInfo.initialLat,
          lng: trackingInfo.initialLng,
        });
        setDriverLocation({
          latitude: trackingInfo.initialLat,
          longitude: trackingInfo.initialLng,
        });
      } else {
        console.log('[PlateTracking] No initial location data from booking_tracking');
      }

      setState('tracking');

      // Subscribe to realtime updates
      console.log('[PlateTracking] Subscribing to realtime updates for booking:', row.booking_id);
      const channel = supabase
        .channel(`plate-tracking-${row.booking_id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'reserva_tracking',
            filter: `id_reserva=eq.${row.booking_id}`,
          },
          (payload) => {
            console.log('[PlateTracking] Realtime update received:', payload.new);
            const r = payload.new as any;
            if (r?.lat != null && r?.lng != null) {
              console.log('[PlateTracking] Updating driver location:', {
                lat: r.lat,
                lng: r.lng,
              });
              setDriverLocation({ latitude: Number(r.lat), longitude: Number(r.lng) });
            }
          }
        )
        .subscribe((status) => {
          console.log('[PlateTracking] Subscription status:', status);
        });

      channelRef.current = channel;
    } catch (err: any) {
      console.error('[PlateTracking] search error:', err);
      console.error('[PlateTracking] error details:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
      });
      setState('not_found');
    }
  }, [plate, cleanup]);

  const handleReset = useCallback(() => {
    cleanup();
    setState('idle');
    setInfo(null);
    setDriverLocation(null);
    setPlate('');
  }, [cleanup]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Seguir servicio</Text>
        {state === 'tracking' && (
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Ionicons name="search-outline" size={20} color="#00E5FF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search panel — always visible unless actively tracking and driver found */}
      {state !== 'tracking' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.searchPanel}
        >
          <View style={styles.searchCard}>
            <MaterialCommunityIcons name="car-info" size={40} color="#00E5FF" style={styles.searchIcon} />
            <Text style={styles.searchTitle}>Ingresa la placa</Text>
            <Text style={styles.searchSubtitle}>
              Escribe la placa del vehículo para ver su posición en tiempo real
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.plateInput}
                value={plate}
                onChangeText={(t) => setPlate(t.toUpperCase())}
                placeholder="Ej. ABC123"
                placeholderTextColor="#555"
                autoCapitalize="characters"
                maxLength={8}
                editable={state !== 'searching'}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
            </View>

            {state === 'not_found' && (
              <View style={styles.alertBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
                <Text style={styles.alertText}>
                  No se encontró ningún servicio activo con esa placa
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.searchButton, (!plate.trim() || state === 'searching') && styles.searchButtonDisabled]}
              onPress={handleSearch}
              disabled={!plate.trim() || state === 'searching'}
              activeOpacity={0.8}
            >
              {state === 'searching' ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.searchButtonText}>Rastrear</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Tracking view */}
      {state === 'tracking' && info && (
        <View style={StyleSheet.absoluteFillObject}>
          <Mapbox.MapView
            style={StyleSheet.absoluteFillObject}
            styleURL={MapboxStyles.DARK}
            logoEnabled={false}
            attributionEnabled={false}
          >
            <Mapbox.Camera
              ref={cameraRef}
              zoomLevel={15}
              centerCoordinate={
                animatedCoords
                  ? [animatedCoords.longitude, animatedCoords.latitude]
                  : info.initialLng != null && info.initialLat != null
                  ? [info.initialLng, info.initialLat]
                  : [-74.0817, 4.6097]
              }
              animationDuration={600}
            />

            {animatedCoords && (
              <Mapbox.PointAnnotation
                id="plate-driver"
                coordinate={[animatedCoords.longitude, animatedCoords.latitude]}
                title="Conductor"
              >
                <View style={styles.carMarker}>
                  <Image source={driverCarIcon} style={styles.carMarkerImage} />
                </View>
              </Mapbox.PointAnnotation>
            )}
          </Mapbox.MapView>

          {/* Info card overlay */}
          <View style={[styles.infoCard, { paddingBottom: insets.bottom + 12 }]}>
            {/* Status badge */}
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {STATUS_LABEL[info.bookingStatus] ?? 'En servicio'}
              </Text>
            </View>

            {/* Plate */}
            <View style={styles.plateBadge}>
              <Text style={styles.plateBadgeText}>{info.plateNumber}</Text>
            </View>

            {/* Driver + car info */}
            <View style={styles.infoRow}>
              <Ionicons name="person-circle-outline" size={18} color="#aaa" style={{ marginRight: 6 }} />
              <Text style={styles.infoText} numberOfLines={1}>
                {info.driverName}
              </Text>
            </View>
            {!!info.carModel && (
              <View style={styles.infoRow}>
                <Ionicons name="car-outline" size={18} color="#aaa" style={{ marginRight: 6 }} />
                <Text style={styles.infoText}>
                  {[info.carModel, info.carColor].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}

            {!animatedCoords && (
              <View style={styles.waitingRow}>
                <ActivityIndicator size="small" color="#00E5FF" />
                <Text style={styles.waitingText}>Esperando señal GPS del conductor…</Text>
              </View>
            )}

            <TouchableOpacity style={styles.newSearchBtn} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="search-outline" size={14} color="#00E5FF" />
              <Text style={styles.newSearchText}>Buscar otra placa</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    zIndex: 10,
    backgroundColor: '#0a0a0a',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  resetBtn: {
    padding: 4,
  },
  searchPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  searchCard: {
    width: '100%',
    backgroundColor: '#141414',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  searchIcon: {
    marginBottom: 16,
  },
  searchTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  searchSubtitle: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputRow: {
    width: '100%',
    marginBottom: 12,
  },
  plateInput: {
    width: '100%',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#333',
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 4,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    width: '100%',
    gap: 8,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    color: '#FF6B6B',
  },
  searchButton: {
    width: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  searchButtonDisabled: {
    backgroundColor: '#1e3033',
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  carMarker: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  infoCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,10,10,0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: '#1f1f1f',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  statusText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  plateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  plateBadgeText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  waitingText: {
    fontSize: 13,
    color: '#555',
  },
  newSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 4,
  },
  newSearchText: {
    fontSize: 13,
    color: '#00E5FF',
  },
});
