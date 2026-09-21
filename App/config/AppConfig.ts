import Constants from 'expo-constants';

// ==================== INTERFACES TYPESCRIPT ====================
interface AppConfiguration {
  readonly app_name: string;
  readonly app_description: string;
  readonly app_display_name: string;
  readonly icon_app: string;
  readonly app_identifier: string;
  readonly app_identifier_ios: string;
  readonly ios_app_version: string;
  readonly runtime_Version: string;
  readonly android_app_version: number;
  readonly expo_owner: string;
  readonly expo_slug: string;
  readonly expo_project_id: string;
}

interface SupabaseConfiguration {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly jwtSecret: string;
}

interface StorageConfiguration {
  readonly USER_PROFILES: string;
  readonly USER_DOCUMENTS: string;
  readonly VEHICLE_DOCUMENTS: string;
  readonly DRIVER_DOCUMENTS: string;
  readonly VEHICLE_IMAGES: string;
  readonly CAR_IMAGES: string;
  readonly BOOKING_MEDIA: string;
}

interface GoogleMapsConfiguration {
  readonly development: string;
  readonly production: string;
}

interface MapboxConfiguration {
  readonly accessToken: string;
  readonly downloadToken: string;
}


// ==================== VALIDACIÓN DE VARIABLES DE ENTORNO ====================
// Helper para leer variables de entorno desde process.env o desde Constants.expoConfig.extra
const getEnv = (name: string, defaultValue: string = ''): string => {
  try {
    // Priorizar process.env (cuando se ejecuta en Node durante build)
    if (process.env && process.env[name]) return process.env[name] as string;

    // En runtime de Expo/Metro usar Constants.expoConfig.extra
    const extras = (Constants.expoConfig && (Constants.expoConfig as any).extra) || (Constants.manifest && (Constants.manifest as any).extra) || {};
    if (extras && extras[name]) return extras[name];
  } catch (e) {
    // ignore
  }
  return defaultValue;
};

const validateEnvVars = (): void => {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'APP_NAME',
    'EXPO_PROJECT_ID'
  ];

  const missingVars = requiredVars.filter(varName => !getEnv(varName));
  
  if (missingVars.length > 0) {
    const message = `Variables de entorno requeridas faltantes: ${missingVars.join(', ')}\nPor favor verifica tu archivo .env`;
    // Si estamos en un entorno Node (ej. al ejecutar app.config.js) lanzamos el error
    // En el runtime de React Native (Metro/Expo) `window` existe, así que evitamos tirar
    const isNode = typeof window === 'undefined';
    if (isNode) {
      throw new Error(message);
    } else {
      // Mostrar advertencia en tiempo de ejecución del bundle para permitir que Metro compile
      // y que la app use valores desde Constants.expoConfig.extra o process.env inyectados.
      // Esto evita que la app se detenga en desarrollo por ausencia de variables en `process.env`.
      // Se seguirá mostrando la validación detallada más adelante si es necesario.
      // eslint-disable-next-line no-console
      console.warn(message);
    }
  }
};

// Ejecutar validación al cargar el módulo
if (process.env.NODE_ENV !== 'test') {
  validateEnvVars();
}

// ==================== CONFIGURACIÓN T+PLUS SEGURA ====================
export const AppConfig: AppConfiguration = {
  app_name: getEnv('APP_NAME'),
  app_description: getEnv('APP_DESCRIPTION', 'Sistema de transporte urbano inteligente T+Plus'),
  app_display_name: getEnv('APP_DISPLAY_NAME', 'TmasPlus'),
  icon_app: './assets/images/logo-Preview.png',
  
  // Identificadores de aplicación
  app_identifier: getEnv('APP_IDENTIFIER', 'com.tmasplus.tmasplus'),
  app_identifier_ios: getEnv('APP_IDENTIFIER_IOS', 'tmasplus.tmasplus'),
  
  // Control de versiones
  ios_app_version: getEnv('APP_VERSION', '1.10.3'),
  runtime_Version: getEnv('EXPO_RUNTIME_VERSION', '1.0.4'),
  android_app_version: parseInt(getEnv('ANDROID_APP_VERSION', '1'), 10),
  
  // Configuración Expo
  expo_owner: getEnv('EXPO_OWNER', 'tmasplus_cto'),
  expo_slug: getEnv('EXPO_SLUG', 'tmasplus-app'),
  expo_project_id: getEnv('EXPO_PROJECT_ID')
} as const;

// ==================== CONFIGURACIÓN SUPABASE SEGURA ====================
export const SupabaseConfig: SupabaseConfiguration = {
  url: getEnv('SUPABASE_URL'),
  anonKey: getEnv('SUPABASE_ANON_KEY'),
  serviceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY', ''),
  jwtSecret: getEnv('JWT_SECRET', '')
} as const;

// ==================== CONFIGURACIÓN GOOGLE MAPS SEGURA ====================
const GoogleMapsConfig: GoogleMapsConfiguration = {
  development: getEnv('GOOGLE_MAPS_API_KEY_DEV', getEnv('GOOGLE_MAPS_API_KEY_ANDROID', '')),
  production: getEnv('GOOGLE_MAPS_API_KEY_PROD', getEnv('GOOGLE_MAPS_API_KEY_ANDROID', getEnv('GOOGLE_MAPS_API_KEY_IOS', '')))
} as const;

export const getGoogleMapsApiKey = (): string => {
  const isDev = process.env.NODE_ENV === 'development';
  const key = isDev ? GoogleMapsConfig.development : GoogleMapsConfig.production;
  
  if (!key) {
    console.warn('Google Maps API Key no configurada para entorno:', process.env.NODE_ENV);
  }
  
  return key;
};

// Mantener compatibilidad con código existente
export const API_KEY = getGoogleMapsApiKey();

// ==================== CONFIGURACIÓN MAPBOX SEGURA ====================
export const MapboxConfig: MapboxConfiguration = {
  accessToken: getEnv('MAPBOX_ACCESS_TOKEN', ''),
  downloadToken: getEnv('MAPBOX_DOWNLOAD_TOKEN', '')
} as const;

export const getMapboxAccessToken = (): string => {
  if (!MapboxConfig.accessToken) {
    console.warn('Mapbox Access Token no configurado');
  }
  return MapboxConfig.accessToken;
};


// ==================== CONFIGURACIÓN DE STORAGE BUCKETS ====================
export const StorageBuckets: StorageConfiguration = {
  USER_PROFILES: 'user-profiles',    // Fotos de perfil (público)
  USER_DOCUMENTS: 'user-documents',      // Documentos de usuario
  VEHICLE_DOCUMENTS: 'vehicle-documents', // Documentos de vehículo
  DRIVER_DOCUMENTS: 'driver-documents',  // Documentos de conductor
  VEHICLE_IMAGES: 'vehicle-images',       // Alias explícito de imágenes de vehículo
  CAR_IMAGES: 'vehicle-images',           // Fotos de vehículos (público)
  BOOKING_MEDIA: 'booking-media'          // Media de viajes (privado)
} as const;

// ==================== SISTEMA DE VALIDACIÓN AVANZADO ====================
export const validateConfiguration = (): { 
  isValid: boolean; 
  errors: string[]; 
  warnings: string[];
  summary: string;
} => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validaciones críticas de Supabase
  if (!SupabaseConfig.url || !SupabaseConfig.url.includes('supabase.co')) {
    errors.push('SUPABASE_URL inválida - debe contener supabase.co');
  }
  
  // Acepta ambos formatos: JWT legacy (eyJ...) y las nuevas API keys de Supabase
  // (sb_publishable_... para el cliente). Las nuevas son cortas y NO son JWT.
  const anon = SupabaseConfig.anonKey;
  const anonValida = !!anon && (anon.startsWith('sb_publishable_') || (anon.startsWith('eyJ') && anon.length >= 100));
  if (!anonValida) {
    errors.push('SUPABASE_ANON_KEY inválida - debe ser un JWT (eyJ...) o una publishable key (sb_publishable_...)');
  }
  
  // UUID v4: 8-4-4-4-12 caracteres hex + guiones (ej: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
  if (!AppConfig.expo_project_id || !AppConfig.expo_project_id.match(/^[a-fA-F0-9\-]{36}$/)) {
    errors.push('EXPO_PROJECT_ID inválido - debe ser un UUID válido (obtenerlo en https://expo.dev → tu proyecto → Project ID)');
  }
  
  // Validaciones de seguridad
  if (SupabaseConfig.serviceRoleKey && process.env.NODE_ENV === 'production') {
    warnings.push('Service Role Key presente en producción - usar con precaución');
  }
  
  // Validaciones de Google Maps
  if (!getGoogleMapsApiKey()) {
    warnings.push('Google Maps API Key no configurada - funciones de mapas limitadas');
  }
  
  // Validaciones de configuración de app
  if (!AppConfig.app_identifier.includes('tmasplus')) {
    warnings.push('Bundle ID no coincide con el dominio de T+Plus');
  }
  
  const isValid = errors.length === 0;
  const summary = isValid 
    ? `Configuración válida (${warnings.length} advertencias)`
    : `${errors.length} errores críticos, ${warnings.length} advertencias`;
  
  return { isValid, errors, warnings, summary };
};

// ==================== UTILIDADES DE ENTORNO ====================
export const Environment = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  
  // Helper para logs seguros
  logConfig: () => {
    if (Environment.isDevelopment) {
      console.log('T+Plus Configuration:', {
        appName: AppConfig.app_name,
        version: AppConfig.ios_app_version,
        bundleId: AppConfig.app_identifier,
        supabaseUrl: SupabaseConfig.url,
        expoProjectId: AppConfig.expo_project_id,
        environment: process.env.NODE_ENV
      });
      
      const validation = validateConfiguration();
      console.log('Config Validation:', validation.summary);
      
      if (validation.warnings.length > 0) {
        console.warn('Advertencias:', validation.warnings);
      }
      if (validation.errors.length > 0) {
        console.error('Errores:', validation.errors);
      }
    }
  }
} as const;

// Ejecutar log de configuración en desarrollo
Environment.logConfig();

// ==================== EXPORTS PRINCIPALES ====================
export default {
  AppConfig,
  SupabaseConfig,
  StorageBuckets,
  GoogleMapsConfig,
  API_KEY,
  getGoogleMapsApiKey,
  validateConfiguration,
  Environment
} as const;

// ==================== TIPOS PARA TYPESCRIPT ====================
export type { 
  AppConfiguration, 
  SupabaseConfiguration, 
  StorageConfiguration,
  GoogleMapsConfiguration 
};
