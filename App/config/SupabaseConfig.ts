import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
/* import { SupabaseConfig } from './AppConfig'; */
// Ignora AppConfig dentro de la app, usa directamente los valores del manifest
import Constants from 'expo-constants';
const extra = Constants.expoConfig?.extra || {};

const SupabaseConfig = {
  url: extra.SUPABASE_URL as string,
  publishableKey: (extra.SUPABASE_PUBLISHABLE_KEY || extra.SUPABASE_ANON_KEY) as string,
  projectRef: extra.SUPABASE_PROJECT_REF as string,
};

import { Database } from './database.types';

// ==================== INTERFACES TYPESCRIPT ====================
interface SupabaseClientOptions {
  auth: {
    storage: any;
    autoRefreshToken: boolean;
    persistSession: boolean;
    detectSessionInUrl: boolean;
    flowType?: 'pkce' | 'implicit';
    storageKey?: string;
  };
  global: {
    headers: Record<string, string>;
  };
  realtime: {
    params: {
      eventsPerSecond: number;
    };
  };
}

interface ConnectionStatus {
  isConnected: boolean;
  lastChecked: Date;
  error?: string;
}

interface DatabaseHealth {
  tablesCount: number;
  activeConnections?: number;
  isHealthy: boolean;
}

const projectRefFromUrl = SupabaseConfig.url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
export const SUPABASE_PROJECT_REF = SupabaseConfig.projectRef || projectRefFromUrl || 'unknown-project';
export const SESSION_STORAGE_KEY = `tmasplus_auth_session_${SUPABASE_PROJECT_REF}`;

const toErrorMessage = (error: any): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.error_description || error.name || '');
};

const isInvalidRefreshTokenError = (error: any): boolean => {
  const msg = toErrorMessage(error);
  if (!msg) return false;
  return msg.includes('Invalid Refresh Token') || msg.includes('Refresh Token Not Found');
};

// Storage envuelto: descarta sesiones malformadas o cuyo access_token expiró
// hace más de 14 días (entonces el refresh_token también suele estar invalidado
// en el servidor). Evita que el SDK intente refrescar tokens muertos al iniciar.
const REFRESH_GRACE_SECONDS = 14 * 24 * 60 * 60;
const sessionStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(key);
      if (!value) return null;
      if (key !== SESSION_STORAGE_KEY) return value;

      const parsed = JSON.parse(value);
      const expiresAt: number | undefined = parsed?.expires_at;
      if (typeof expiresAt === 'number') {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - expiresAt > REFRESH_GRACE_SECONDS) {
          console.warn('[SupabaseStorage] Sesión guardada caducó hace mucho, descartando.');
          await AsyncStorage.removeItem(key);
          return null;
        }
      }
      return value;
    } catch (err) {
      console.warn('[SupabaseStorage] Sesión guardada inválida, descartando:', (err as any)?.message);
      try { await AsyncStorage.removeItem(key); } catch {}
      return null;
    }
  },
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// ==================== CONFIGURACION OPTIMIZADA DEL CLIENTE ====================
const createSupabaseClientOptions = (): SupabaseClientOptions => ({
  auth: {
    storage: sessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Especifico para React Native
    // PKCE: el enlace de recuperación llega como ?code=... (query) en vez de
    // #access_token=... (fragmento). En Android el fragmento se pierde al saltar
    // del navegador al deep link; el query sobrevive. La app intercambia el code
    // por la sesión con exchangeCodeForSession (ver ResetPassword.tsx).
    flowType: 'pkce',
    storageKey: SESSION_STORAGE_KEY,
  },
  global: {
    headers: {
      'X-Client-Info': `TmasPlus-mobile@${process.env.APP_VERSION || '1.10.3'}`,
      'X-App-Platform': 'react-native',
      'X-App-Environment': process.env.NODE_ENV || 'development',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

console.log('Supabase URL efectiva:', SupabaseConfig.url);


// ==================== CLIENTE PRINCIPAL SUPABASE TIPADO ====================
export const supabase: SupabaseClient<Database> = createClient<Database>(
  SupabaseConfig.url,
  SupabaseConfig.publishableKey,
  createSupabaseClientOptions()
); 

// ==================== FLAG DE RECUPERACION DE CONTRASEÑA ====================
// Mientras el usuario restablece su contraseña por deep link, exchangeCodeForSession
// crea una sesión temporal que dispara SIGNED_IN. Sin este flag, el listener global
// marcaría al usuario como autenticado y el navegador conmutaría de stack,
// desmontando la pantalla ResetPassword (inputs quedaban inutilizables).
let _passwordRecoveryInProgress = false;
export const setPasswordRecoveryInProgress = (value: boolean): void => {
  _passwordRecoveryInProgress = value;
};
export const isPasswordRecoveryInProgress = (): boolean => _passwordRecoveryInProgress;

// ==================== REST API CREDENTIALS (for direct fetch calls) ====================
export const SUPABASE_URL = SupabaseConfig.url;
export const SUPABASE_PUBLISHABLE_KEY = SupabaseConfig.publishableKey;
// Alias temporal para llamadas REST legacy.
export const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;

/**
 * Build auth headers for direct Supabase REST API calls.
 * Reads JWT from AsyncStorage, validates expiry, falls back to anon key.
 */
export const getSupabaseAuthHeaders = async (includeContentType = false) => {
  let token = SUPABASE_ANON_KEY;
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const jwt = parsed?.access_token;
      if (jwt && jwt.length > 40) {
        try {
          const payload = JSON.parse(atob(jwt.split('.')[1]));
          if (payload.exp && payload.exp * 1000 > Date.now()) {
            token = jwt;
          }
        } catch {
          token = jwt;
        }
      }
    }
  } catch {}
  const headers: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
  };
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

export const clearStoredSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('Error clearing stored auth session:', error);
  }

  try {
    // Reset Supabase auth state in memory too, para evitar que el cliente siga usando una sesión inválida.
    await supabase.auth.signOut();
  } catch (error) {
    // El refresh token puede no existir o ser inválido, así que ignoramos el error.
    console.warn('Error clearing Supabase auth state:', error);
  }
};

export const getSafeSession = async (): Promise<Session | null> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearStoredSession();
        return null;
      }
      return null;
    }

    return session;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearStoredSession();
      return null;
    }
    console.warn('Error inesperado obteniendo sesion segura:', error);
    return null;
  }
};

// ==================== FUNCIONES DE AUTENTICACION MEJORADAS ====================
export const Auth = {
  /**
   * Obtiene el usuario actual con manejo robusto de errores
   */
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          await clearStoredSession();
        }
        return null;
      }
      return user;
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearStoredSession();
        return null;
      }
      console.warn('Error inesperado obteniendo usuario:', error);
      return null;
    }
  },

  /**
   * Obtiene la sesion actual con validacion
   */
  getCurrentSession: async (): Promise<Session | null> => {
    return getSafeSession();
  },

  /**
   * Verifica si el usuario esta autenticado y la sesion es valida
   */
  isAuthenticated: async (): Promise<boolean> => {
    const session = await Auth.getCurrentSession();
    if (!session?.user) return false;
    
    // Verificar que la sesion no haya expirado
    const expiresAt = new Date(session.expires_at! * 1000);
    return expiresAt > new Date();
  },

  /**
   * Obtiene el perfil completo del usuario desde la tabla users
   */
  getUserProfile: async (): Promise<Database['public']['Tables']['users']['Row'] | null> => {
    try {
      const user = await Auth.getCurrentUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single();

      if (error) {
        console.error('Error obteniendo perfil de usuario:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error inesperado obteniendo perfil:', error);
      return null;
    }
  },

  /**
   * Cierra la sesion del usuario de forma segura
   */
  signOut: async (): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error cerrando sesion:', error.message);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error inesperado cerrando sesion:', error);
      return false;
    }
  }
} as const;

// ==================== FUNCIONES DE CONEXION Y SALUD MEJORADAS ====================
export const Health = {
  /**
   * Prueba la conexion a Supabase con verificacion completa
   */
  testConnection: async (): Promise<ConnectionStatus> => {
    const status: ConnectionStatus = {
      isConnected: false,
      lastChecked: new Date()
    };

    try {
      // Test 1: Verificar conexion basica
      const { error: pingError } = await supabase
        .from('users')
        .select('count', { count: 'exact', head: true })
        .limit(1);
      
      if (pingError) {
        status.error = `Test basico falló: ${pingError.message}`;
        return status;
      }

      // Test 2: Verificar autenticacion funciona
      const { error: authError } = await supabase.auth.getSession();
      
      if (authError) {
        if (isInvalidRefreshTokenError(authError)) {
          await clearStoredSession();
          status.isConnected = true;
          return status;
        }
        status.error = `Autenticacion falló: ${authError.message}`;
        return status;
      }

      status.isConnected = true;
    } catch (error) {
      status.error = `Error de conexion: ${error}`;
    }

    return status;
  },

  /**
   * Verifica la salud de la base de datos T+Plus
   */
  checkDatabaseHealth: async (): Promise<DatabaseHealth> => {
    const health: DatabaseHealth = {
      tablesCount: 0,
      isHealthy: false
    };

    try {
      // Verificar que las tablas principales de T+Plus existan
      const tablesToCheck = ['users', 'cars', 'bookings', 'car_types'];
      let successCount = 0;

      for (const table of tablesToCheck) {
        try {
          const { error } = await supabase
            .from(table as any)
            .select('count', { count: 'exact', head: true })
            .limit(1);
          
          if (!error) {
            successCount++;
          }
        } catch {
          // Tabla no accesible
        }
      }

      health.tablesCount = successCount;
      health.isHealthy = successCount === tablesToCheck.length;

    } catch (error) {
      console.error('Error verificando salud de BD:', error);
    }

    return health;
  },

  /**
   * Verifica el estado completo de la configuracion
   */
  validateConfig: (): { isValid: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validaciones criticas
    if (!SupabaseConfig.url) {
      errors.push('SUPABASE_URL no configurada');
    } else if (!SupabaseConfig.url.includes('supabase.co')) {
      errors.push('SUPABASE_URL no parece ser una URL valida de Supabase');
    }

    if (!SupabaseConfig.publishableKey) {
      errors.push('SUPABASE_PUBLISHABLE_KEY no configurada');
    } else if (!SupabaseConfig.publishableKey.startsWith('sb_publishable_')) {
      warnings.push('La API key no usa el formato publishable actual');
    }

    // Validaciones de seguridad
    if (process.env.NODE_ENV === 'production') {
      if (SupabaseConfig.url.includes('localhost')) {
        errors.push('URL de Supabase apunta a localhost en produccion');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
} as const;

// ==================== UTILIDADES DE DESARROLLO MEJORADAS ====================
export const DevUtils = {
  /**
   * Log completo de informacion de conexion en desarrollo
   */
  logConnectionInfo: async (): Promise<void> => {
    if (process.env.NODE_ENV === 'development') {
      console.log('=== SUPABASE CONNECTION INFO ===');
      console.log('URL:', SupabaseConfig.url);
      console.log('Project ID:', SupabaseConfig.url.split('//')[1]?.split('.')[0]);
      console.log('Environment:', process.env.NODE_ENV);
      
      // Validacion de configuracion
      const configValidation = Health.validateConfig();
      console.log('Config Valid:', configValidation.isValid ? 'SI' : 'NO');
      
      if (!configValidation.isValid) {
        console.error('Config Errors:', configValidation.errors);
      }
      
      if (configValidation.warnings.length > 0) {
        console.warn('Config Warnings:', configValidation.warnings);
      }

      // Test de conexion
      try {
        const connectionStatus = await Health.testConnection();
        console.log('Connection Status:', connectionStatus.isConnected ? 'CONECTADO' : 'FALLIDO');
        
        if (!connectionStatus.isConnected && connectionStatus.error) {
          console.error('Connection Error:', connectionStatus.error);
        }

        // Test de salud de BD
        if (connectionStatus.isConnected) {
          const dbHealth = await Health.checkDatabaseHealth();
          console.log('Database Health:', dbHealth.isHealthy ? 'SALUDABLE' : 'CON PROBLEMAS');
          console.log('Tables Available:', `${dbHealth.tablesCount}/4`);
        }
      } catch (error) {
        console.error('Connection Test Failed:', error);
      }
      
      console.log('=== END CONNECTION INFO ===');
    }
  },

  /**
   * Ejecuta diagnosticos completos del sistema
   */
  runDiagnostics: async (): Promise<{
    config: boolean;
    connection: boolean;
    database: boolean;
    auth: boolean;
  }> => {
    const diagnostics = {
      config: false,
      connection: false,
      database: false,
      auth: false
    };

    try {
      // Test 1: Configuracion
      const configTest = Health.validateConfig();
      diagnostics.config = configTest.isValid;

      // Test 2: Conexion
      const connectionTest = await Health.testConnection();
      diagnostics.connection = connectionTest.isConnected;

      if (diagnostics.connection) {
        // Test 3: Base de datos
        const dbTest = await Health.checkDatabaseHealth();
        diagnostics.database = dbTest.isHealthy;

        // Test 4: Autenticacion
        try {
          await supabase.auth.getSession();
          diagnostics.auth = true;
        } catch {
          diagnostics.auth = false;
        }
      }

    } catch (error) {
      console.error('Error ejecutando diagnosticos:', error);
    }

    return diagnostics;
  }
} as const;

// ==================== LISTENERS DE AUTENTICACION MEJORADOS ====================
export const setupAuthListeners = (): { unsubscribe: () => void } => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Auth State Change:', event, session?.user?.id || 'No user');
    }

    switch (event) {
      case 'SIGNED_IN':
        console.log('Usuario autenticado:', session?.user?.email);

        // IMPORTANTE: nunca usar `await` sobre llamadas a Supabase dentro de un
        // callback de onAuthStateChange. El evento se emite mientras setSession/
        // exchangeCodeForSession mantienen el lock de auth; si el callback espera
        // otra llamada de auth (p.ej. getUserProfile), se produce un DEADLOCK y la
        // promesa de setSession nunca resuelve. Diferimos con setTimeout(0) para
        // liberar el lock primero.
        if (session?.user) {
          setTimeout(async () => {
            try {
              const profile = await Auth.getUserProfile();
              if (!profile) {
                console.log('Perfil de usuario no encontrado, podria requerir creacion');
              }
            } catch (error) {
              console.error('Error verificando perfil:', error);
            }
          }, 0);
        }
        break;
        
      case 'SIGNED_OUT':
        console.log('Usuario cerro sesion (o refresh token inválido)');
        try {
          await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (storageError) {
          console.warn('Error clearing stored auth session in listener:', storageError);
        }
        break;

      case 'TOKEN_REFRESHED':
        console.log('Token renovado exitosamente');
        break;

      case 'USER_UPDATED':
        console.log('Usuario actualizado');
        break;
        
      case 'PASSWORD_RECOVERY':
        console.log('Recuperacion de contraseña iniciada');
        break;
    }
  });

  return {
    unsubscribe: () => subscription.unsubscribe()
  };
};

// ==================== REALTIME PARA T+PLUS ====================
export const Realtime = {
  /**
   * Suscribirse a cambios de reservas en tiempo real
   */
  subscribeToBookings: (userId: string, callback: (payload: any) => void) => {
    return supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `customer_id=eq.${userId}`
        },
        callback
      )
      .subscribe();
  },

  /**
   * Suscribirse a tracking de viajes en tiempo real
   */
  subscribeToTracking: (bookingId: string, callback: (payload: any) => void) => {
    return supabase
      .channel(`booking_tracking-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_tracking',
          filter: `booking_id=eq.${bookingId}`
        },
        callback
      )
      .subscribe();
  },

  /**
   * Suscribirse a notificaciones en tiempo real
   */
  subscribeToNotifications: (userId: string, callback: (payload: any) => void) => {
    return supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        callback
      )
      .subscribe();
  }
} as const;

// ==================== INICIALIZACION AUTOMATICA ====================
// Los listeners de auth deben quedar SIEMPRE registrados (también en release),
// si no, cuando el SDK detecta un refresh token inválido nadie limpia el storage
// y el error se repite en cada arranque.
setupAuthListeners();

if (process.env.NODE_ENV === 'development') {
  DevUtils.logConnectionInfo();
}

// ==================== EXPORTACIONES PRINCIPALES ====================
export default supabase;


console.log('Supabase URL efectiva:', SupabaseConfig.url);

/*
export {
  supabase as client,
  Auth,
  Health,
  DevUtils,
  Realtime,
  setupAuthListeners
};
*/
export type {
  SupabaseClient,
  Session,
  User,
  ConnectionStatus,
  DatabaseHealth
};
