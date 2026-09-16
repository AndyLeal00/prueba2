import React, { useCallback, useEffect, useMemo, useState, useRef, ReactNode, forwardRef, useImperativeHandle } from "react";
import { View, StyleSheet } from "react-native";
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { getDistance } from "geolib";
import { DRIVER_LOCATION_PUCK_IMAGE } from '@/components/DriverMapLocationMarker';
import { getGoogleMapStyle, GoogleMapTheme } from '@/config/googleMapsDarkStyle';

const DEFAULT_REGION = {
  latitude: 4.7110,
  longitude: -74.0721,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

export type MapViewMode = '2D' | '3D';

export interface MapSensorHandle {
  locateUser: () => void;
  setViewMode: (mode: MapViewMode) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetMapNorth: () => void;
}

interface MapSensorProps {
  children?: ReactNode;
  currentPosition?: [number, number] | null;
  viewMode?: MapViewMode;
  mapTheme?: GoogleMapTheme;
  mapBottomPadding?: number;
  onMapBearingChange?: (bearing: number) => void;
}

type CameraSnapshot = {
  latitude: number;
  longitude: number;
  heading: number;
  pitch: number;
};

const pitchForMode = (mode: MapViewMode) => (mode === '3D' ? 68 : 0);
const DEFAULT_ZOOM = 19;
const MIN_ZOOM = 14;
const MAX_ZOOM = 21;

const clampAccuracy = (meters: number | null | undefined) =>
  Math.min(Math.max(meters ?? 30, 12), 120);

/** Radio visible del área de precisión — crece al alejar zoom para no perderse en pantalla. */
const accuracyRadiusForZoom = (baseMeters: number, zoom: number) => {
  const levelsOut = Math.max(0, DEFAULT_ZOOM - zoom);
  const scaled = baseMeters * Math.pow(2, levelsOut * 0.92);
  return Math.min(Math.max(scaled, baseMeters), 1000);
};

const MapSensor = forwardRef<MapSensorHandle, MapSensorProps>(
  ({ children, currentPosition = null, viewMode = '2D', mapTheme = 'dark', mapBottomPadding = 0, onMapBearingChange }, ref) => {
  const mapRef = useRef<MapView>(null);
  const headingRef = useRef(0);
  const lastCameraRef = useRef<CameraSnapshot | null>(null);
  const hasMountedCameraRef = useRef(false);
  const viewModeRef = useRef<MapViewMode>(viewMode);
  const northUpLockedRef = useRef(false);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const regionRef = useRef({
    latitude: currentPosition ? currentPosition[1] : DEFAULT_REGION.latitude,
    longitude: currentPosition ? currentPosition[0] : DEFAULT_REGION.longitude,
  });
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
  const [region, setRegion] = useState({
    latitude: currentPosition ? currentPosition[1] : DEFAULT_REGION.latitude,
    longitude: currentPosition ? currentPosition[0] : DEFAULT_REGION.longitude,
    latitudeDelta: 0.003,
    longitudeDelta: 0.003,
  });
  const [heading, setHeading] = useState(0);
  const [locationReady, setLocationReady] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState(30);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [areaPulse, setAreaPulse] = useState(0.5);

  const mapStyle = useMemo(() => getGoogleMapStyle(mapTheme), [mapTheme]);

  const displayAccuracyRadius = useMemo(
    () => accuracyRadiusForZoom(clampAccuracy(locationAccuracy), mapZoom),
    [locationAccuracy, mapZoom],
  );

  const areaFillColor = useMemo(
    () => `rgba(0, 229, 255, ${0.08 + areaPulse * 0.1})`,
    [areaPulse],
  );
  const areaStrokeColor = useMemo(
    () => `rgba(0, 229, 255, ${0.22 + areaPulse * 0.14})`,
    [areaPulse],
  );

  useEffect(() => {
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = (Date.now() - start) / 1800;
      setAreaPulse(0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const resolveCameraHeading = (gpsHeading: number) =>
    northUpLockedRef.current ? 0 : gpsHeading;

  const syncMapZoom = useCallback(async () => {
    try {
      const camera = await mapRef.current?.getCamera();
      if (camera?.zoom != null) {
        zoomRef.current = camera.zoom;
        setMapZoom(camera.zoom);
      }
      if (camera?.heading != null) {
        if (northUpLockedRef.current && Math.abs(camera.heading) > 1.5) {
          northUpLockedRef.current = false;
        }
        onMapBearingChange?.(camera.heading);
      }
    } catch {
      /* noop */
    }
  }, [onMapBearingChange]);

  const syncCamera = (
    latitude: number,
    longitude: number,
    nextHeading: number,
    duration: number,
    force = false,
    pitch = pitchForMode(viewModeRef.current),
  ) => {
    const cameraHeading = resolveCameraHeading(nextHeading);
    const lastCamera = lastCameraRef.current;
    const headingDelta = lastCamera ? Math.abs(lastCamera.heading - cameraHeading) : Number.POSITIVE_INFINITY;
    const movedMeters = lastCamera
      ? getDistance(
          { latitude: lastCamera.latitude, longitude: lastCamera.longitude },
          { latitude, longitude },
        )
      : Number.POSITIVE_INFINITY;

    if (!force && lastCamera && movedMeters < 4 && headingDelta < 8 && lastCamera.pitch === pitch) {
      return;
    }

    lastCameraRef.current = { latitude, longitude, heading: cameraHeading, pitch };
    regionRef.current = { latitude, longitude };
    onMapBearingChange?.(cameraHeading);
    mapRef.current?.animateCamera(
      {
        center: { latitude, longitude },
        heading: cameraHeading,
        pitch,
        zoom: zoomRef.current,
      },
      { duration }
    );
  };

  const animateZoom = (delta: number) => {
    zoomRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + delta));
    setMapZoom(zoomRef.current);
    const { latitude, longitude } = regionRef.current;
    const cameraHeading = resolveCameraHeading(headingRef.current);
    mapRef.current?.animateCamera(
      {
        center: { latitude, longitude },
        heading: cameraHeading,
        pitch: pitchForMode(viewModeRef.current),
        zoom: zoomRef.current,
      },
      { duration: 220 },
    );
  };

  useImperativeHandle(ref, () => ({
    locateUser: () => {
      const { latitude, longitude } = regionRef.current;
      syncCamera(latitude, longitude, headingRef.current, 450, true);
    },
    setViewMode: (mode: MapViewMode) => {
      northUpLockedRef.current = false;
      viewModeRef.current = mode;
      const { latitude, longitude } = regionRef.current;
      syncCamera(latitude, longitude, headingRef.current, 500, true, pitchForMode(mode));
    },
    zoomIn: () => animateZoom(1),
    zoomOut: () => animateZoom(-1),
    resetMapNorth: () => {
      northUpLockedRef.current = true;
      const { latitude, longitude } = regionRef.current;
      lastCameraRef.current = {
        latitude,
        longitude,
        heading: 0,
        pitch: pitchForMode(viewModeRef.current),
      };
      onMapBearingChange?.(0);
      mapRef.current?.animateCamera(
        {
          center: { latitude, longitude },
          heading: 0,
          pitch: pitchForMode(viewModeRef.current),
          zoom: zoomRef.current,
        },
        { duration: 350 },
      );
    },
  }));

  useEffect(() => {
    viewModeRef.current = viewMode;
    const { latitude, longitude } = regionRef.current;
    syncCamera(latitude, longitude, headingRef.current, 500, true, pitchForMode(viewMode));
  }, [viewMode]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('warning', 'Permiso denegado', 'No se puede acceder a la ubicación.');
        setLocationReady(true);
        return;
      }

      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude, heading: h, accuracy } = first.coords;
        const resolvedHeading = h || 0;
        setRegion(prev => ({ ...prev, latitude, longitude }));
        regionRef.current = { latitude, longitude };
        setHeading(resolvedHeading);
        headingRef.current = resolvedHeading;
        setLocationAccuracy(clampAccuracy(accuracy));
        setLocationReady(true);
        syncCamera(latitude, longitude, resolvedHeading, 400, true);
        hasMountedCameraRef.current = true;
      } catch {
        setLocationReady(true);
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 2, timeInterval: 1500 },
        (loc) => {
          const { latitude, longitude, heading: h, accuracy } = loc.coords;
          const newHeading = (h !== null && !isNaN(h)) ? h : headingRef.current;
          setRegion(prev => ({ ...prev, latitude, longitude }));
          regionRef.current = { latitude, longitude };
          setHeading(newHeading);
          headingRef.current = newHeading;
          setLocationAccuracy(clampAccuracy(accuracy));
          syncCamera(latitude, longitude, newHeading, hasMountedCameraRef.current ? 800 : 400, !hasMountedCameraRef.current);
          hasMountedCameraRef.current = true;
        }
      );
    };

    startTracking();
    return () => { subscription?.remove(); };
  }, []);

  const restoreCameraAfterMount = useCallback(() => {
    const { latitude, longitude } = regionRef.current;
    requestAnimationFrame(() => {
      mapRef.current?.setCamera({
        center: { latitude, longitude },
        heading: headingRef.current,
        pitch: pitchForMode(viewModeRef.current),
        zoom: zoomRef.current,
        altitude: 200,
      });
    });
  }, []);

  useEffect(() => {
    if (currentPosition) {
      const [longitude, latitude] = currentPosition;
      setRegion(prev => ({ ...prev, latitude, longitude }));
      regionRef.current = { latitude, longitude };
      syncCamera(latitude, longitude, headingRef.current, 400, true);
      hasMountedCameraRef.current = true;
    }
  }, [currentPosition]);

  return (
    <View style={styles.container}>
      <MapView
        key={`driver-map-${mapTheme}`}
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyle}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        scrollEnabled={true}
        zoomEnabled={true}
        rotateEnabled={true}
        pitchEnabled={true}
        onMapReady={restoreCameraAfterMount}
        onRegionChange={syncMapZoom}
        onRegionChangeComplete={syncMapZoom}
        mapPadding={{
          top: 0,
          right: 0,
          bottom: mapBottomPadding,
          left: 0,
        }}
        initialCamera={{
          center: { latitude: region.latitude, longitude: region.longitude },
          pitch: pitchForMode(viewMode),
          heading,
          zoom: zoomRef.current,
          altitude: 200,
        }}
      >
        {locationReady && (
          <>
            <Circle
              center={{ latitude: region.latitude, longitude: region.longitude }}
              radius={displayAccuracyRadius}
              fillColor={areaFillColor}
              strokeColor={areaStrokeColor}
              strokeWidth={1}
              zIndex={1}
            />
            <Marker
              coordinate={{ latitude: region.latitude, longitude: region.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={viewMode === '3D'}
              rotation={viewMode === '3D' ? heading : 0}
              image={DRIVER_LOCATION_PUCK_IMAGE}
              zIndex={2}
            />
          </>
        )}
        {children}
      </MapView>

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
});

MapSensor.displayName = 'MapSensor';

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject },
  map: { ...StyleSheet.absoluteFillObject },
});

export default React.memo(MapSensor);
