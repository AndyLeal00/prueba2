import type { ReactNode } from 'react';
import { getMapboxAccessToken } from './AppConfig';

type AnyProps = { children?: ReactNode } & Record<string, unknown>;

const Passthrough = ({ children }: AnyProps) => children ?? null;
const Empty = () => null;

const fallbackStyleURL = {
  Street: 'mapbox://styles/mapbox/streets-v11',
  Dark: 'mapbox://styles/mapbox/dark-v11',
  Light: 'mapbox://styles/mapbox/light-v11',
  Outdoors: 'mapbox://styles/mapbox/outdoors-v11',
  Satellite: 'mapbox://styles/mapbox/satellite-v9',
  SatelliteStreet: 'mapbox://styles/mapbox/satellite-streets-v12',
  TrafficDay: 'mapbox://styles/mapbox/navigation-day-v1',
  TrafficNight: 'mapbox://styles/mapbox/navigation-night-v1',
} as const;

let Mapbox: any;
let mapboxNativeAvailable = false;

try {
  const mapboxModule = require('@rnmapbox/maps');
  Mapbox = mapboxModule.default ?? mapboxModule;
  mapboxNativeAvailable = true;

  const mapboxAccessToken = getMapboxAccessToken();
  if (mapboxAccessToken) {
    Mapbox.setAccessToken(mapboxAccessToken);
  }
} catch {
  mapboxNativeAvailable = false;
  Mapbox = {
    setAccessToken: () => undefined,
    StyleURL: fallbackStyleURL,
    MapView: Passthrough,
    Camera: Empty,
    UserLocation: Empty,
    PointAnnotation: Passthrough,
    MarkerView: Passthrough,
    ShapeSource: Passthrough,
    LineLayer: Empty,
    SymbolLayer: Empty,
    FillLayer: Empty,
    CircleLayer: Empty,
    RasterLayer: Empty,
  };
}

const styleURL = Mapbox.StyleURL ?? fallbackStyleURL;

// Estilos de mapa predefinidos de Mapbox
export const MapboxStyles = {
  STREET: styleURL.Street,
  DARK: styleURL.Dark,
  LIGHT: styleURL.Light,
  OUTDOORS: styleURL.Outdoors,
  SATELLITE: styleURL.Satellite,
  SATELLITE_STREETS: styleURL.SatelliteStreet,
  TRAFFIC_DAY: styleURL.TrafficDay,
  TRAFFIC_NIGHT: styleURL.TrafficNight,
} as const;

export const MAPBOX_STYLES = MapboxStyles;

// Colores corporativos
export const CORP_COLORS = {
  WHITE: '#ffffff',
  CYAN: '#00f4f5',
  NAVY: '#00204a',
} as const;

// Configuración de la cámara por defecto
export const DEFAULT_CAMERA_CONFIG = {
  zoomLevel: 15,
  pitch: 0,
  heading: 0,
  animationDuration: 1000,
  animationMode: 'flyTo',
} as const;

// Configuración del giroscopio
export const GYROSCOPE_CONFIG = {
  enabled: true,
  trackUserLocation: true,
  trackUserCourse: true,
  followUserLocation: true,
  followPitch: 45, // Inclinación de la cámara cuando se sigue al usuario
  followZoomLevel: 18,
} as const;

export const IS_MAPBOX_NATIVE_AVAILABLE = mapboxNativeAvailable;

export default Mapbox;
