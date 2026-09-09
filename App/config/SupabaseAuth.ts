import { AuthError, AuthTokenResponsePassword, Session, User } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { SESSION_STORAGE_KEY, supabase } from './SupabaseConfig';

// ==================== INTERFACES TYPESCRIPT ====================
interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterCredentials {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}

interface AuthResult<T = User> {
  data: T | null;
  error: string | null;
  success: boolean;
}

interface PasswordResetRequest {
  email: string;
  redirectTo?: string;
}

interface PasswordUpdateRequest {
  password: string;
  confirmPassword: string;
}

interface UserUpdateData {
  email?: string;
  fullName?: string;
  phone?: string;
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

// ==================== CONSTANTES DE AUTENTICACION ====================
const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Credenciales invalidas',
  USER_NOT_FOUND: 'Usuario no encontrado',
  EMAIL_ALREADY_EXISTS: 'El email ya esta registrado',
  WEAK_PASSWORD: 'La contraseña debe tener al menos 8 caracteres',
  INVALID_EMAIL: 'Email invalido',
  PASSWORDS_DONT_MATCH: 'Las contraseñas no coinciden',
  NETWORK_ERROR: 'Error de conexion',
  UNAUTHORIZED: 'No autorizado',
  UNKNOWN_ERROR: 'Error desconocido'
};

const PASSWORD_MIN_LENGTH = 8;
// ==================== UTILIDADES DE VALIDACION ====================
const ValidationUtils = {
  /**
   * Valida formato de email
   */
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Valida fortaleza de contraseña
   */
  isValidPassword: (password: string): boolean => {
    return password.length >= PASSWORD_MIN_LENGTH;
  },

  /**
   * Valida credenciales de login
   */
  validateLoginCredentials: (credentials: LoginCredentials): string | null => {
    if (!credentials.email) return 'Email es requerido';
    if (!credentials.password) return 'Contraseña es requerida';
    if (!ValidationUtils.isValidEmail(credentials.email)) return AUTH_ERRORS.INVALID_EMAIL;
    return null;
  },

  /**
   * Valida credenciales de registro
   */
  validateRegisterCredentials: (credentials: RegisterCredentials): string | null => {
    const loginValidation = ValidationUtils.validateLoginCredentials(credentials);
    if (loginValidation) return loginValidation;
    
    if (!ValidationUtils.isValidPassword(credentials.password)) {
      return AUTH_ERRORS.WEAK_PASSWORD;
    }
    
    return null;
  }
};

// ==================== UTILIDADES DE ERROR HANDLING ====================
const ErrorUtils = {
  /**
   * Mapea errores de Supabase Auth a mensajes legibles
   */
  mapAuthError: (error: AuthError): string => {
    switch (error.message) {
      case 'Invalid login credentials':
        return AUTH_ERRORS.INVALID_CREDENTIALS;
      case 'Email not confirmed':
        return 'Email no confirmado. Revisa tu bandeja de entrada.';
      case 'User already registered':
        return AUTH_ERRORS.EMAIL_ALREADY_EXISTS;
      case 'Password should be at least 6 characters':
        return AUTH_ERRORS.WEAK_PASSWORD;
      case 'Signup requires a valid password':
        return AUTH_ERRORS.WEAK_PASSWORD;
      default:
        console.error('Auth Error Details:', {
          message: error.message,
          status: error.status,
          details: error
        });
        return error.message || AUTH_ERRORS.UNKNOWN_ERROR;
    }
  }
};

// ==================== SERVICIO PRINCIPAL DE AUTENTICACION ====================
export const SupabaseAuth = {
  /**
   * Inicia sesion con email y contraseña
   */
  signIn: async (credentials: LoginCredentials): Promise<AuthResult<Session>> => {
    try {
      const validationError = ValidationUtils.validateLoginCredentials(credentials);
      if (validationError) {
        return { data: null, error: validationError, success: false };
      }

      const response = await supabase.auth.signInWithPassword({
        email: credentials.email.toLowerCase().trim(),
        password: credentials.password
      });

      const { data, error } = response as any;

      if (error) {
        const errorMessage = ErrorUtils.mapAuthError(error);
        return { data: null, error: errorMessage, success: false };
      }

      return { data: data.session, error: null, success: true };
    } catch (error) {
      console.error('Error en signIn:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Registra nuevo usuario y crea membresía PENDIENTE
   */
  signUp: async (credentials: RegisterCredentials): Promise<AuthResult<User>> => {
    try {
      const validationError = ValidationUtils.validateRegisterCredentials(credentials);
      if (validationError) {
        return { data: null, error: validationError, success: false };
      }

      const expoConfig = Constants.expoConfig as any;
      const manifest = Constants.manifest as any;
      const extra = expoConfig?.extra || manifest?.extra || {};
      const defaultRedirect = 'https://dashboard.tmasplus.com/welcome';
      const emailRedirectTo =
        extra?.SUPABASE_EMAIL_REDIRECT_TO ||
        (process.env?.SUPABASE_EMAIL_REDIRECT_TO as string | undefined) ||
        defaultRedirect;

      console.log('[SupabaseAuth.signUp] emailRedirectTo:', emailRedirectTo);
      const response = await supabase.auth.signUp({
        email: credentials.email.toLowerCase().trim(),
        password: credentials.password,
        options: {
          emailRedirectTo,
          data: {
            full_name: credentials.fullName || '',
            phone: credentials.phone || '',
            app_source: 'TmasPlus-mobile'
          }
        }
      });

      const { data, error } = response as any;

      if (error) {
        console.error('[SupabaseAuth.signUp] error details:', error);
        const errorMessage = ErrorUtils.mapAuthError(error);
        return { data: null, error: errorMessage, success: false };
      }

      // 🎯 INSERTAR MEMBRESÍA PENDIENTE AUTOMÁTICAMENTE
      if (data.user?.id) {
        try {
          console.log('📍 [SignUp] Creando membresía PENDIENTE para:', data.user.id);
          
          const { error: membershipError } = await supabase
            .from('memberships')
            .insert([
              {
                conductor: data.user.id,
                status: 'PENDIENTE',
                costo: 157200,
                fecha_inicio: new Date().toISOString().split('T')[0],
                fecha_terminada: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                periodo: 30
              }
            ]);

          if (membershipError) {
            console.error('⚠️ [SignUp] Error creando membresía:', membershipError);
            // No fallar el signup si hay error en membresía
          } else {
            console.log('✅ [SignUp] Membresía PENDIENTE creada exitosamente');
          }
        } catch (membershipException) {
          console.error('❌ [SignUp] Excepción al crear membresía:', membershipException);
          // No fallar el signup
        }
      }

      return { data: data.user, error: null, success: true };
    } catch (error) {
      console.error('Error en signUp:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Cierra sesion del usuario actual
   */
  signOut: async (): Promise<AuthResult<null>> => {
    try {
      const response = await supabase.auth.signOut();
      const { error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: null, error: null, success: true };
    } catch (error) {
      console.error('Error en signOut:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Obtiene el usuario actual
   */
  getCurrentUser: async (): Promise<AuthResult<User>> => {
    try {
      const response = await supabase.auth.getUser();
      const { data: { user }, error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: user, error: null, success: true };
    } catch (error) {
      console.error('Error en getCurrentUser:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Obtiene la sesion actual
   */
  getCurrentSession: async (): Promise<AuthResult<Session>> => {
    try {
      const response = await supabase.auth.getSession();
      const { data: { session }, error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: session, error: null, success: true };
    } catch (error) {
      console.error('Error en getCurrentSession:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Verifica si el usuario esta autenticado
   */
  isAuthenticated: async (): Promise<boolean> => {
    const { data: session } = await SupabaseAuth.getCurrentSession();
    return !!session?.user;
  },

  /**
   * Solicita recuperacion de contraseña
   */
  resetPassword: async (request: PasswordResetRequest): Promise<AuthResult<null>> => {
    try {
      if (!ValidationUtils.isValidEmail(request.email)) {
        return { data: null, error: AUTH_ERRORS.INVALID_EMAIL, success: false };
      }

      // El enlace de recuperacion debe abrir la app (deep link) y NO el dashboard web.
      // tmasplus://reset-password lo maneja LoginScreen -> pantalla ResetPassword.
      const defaultRedirect = ExpoLinking.createURL('reset-password');
      const redirectTo = request.redirectTo || defaultRedirect;

      const response = await supabase.auth.resetPasswordForEmail(
        request.email.toLowerCase().trim(),
        {
          redirectTo
        }
      );

      const { error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: null, error: null, success: true };
    } catch (error) {
      console.error('Error en resetPassword:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Actualiza contraseña del usuario actual
   */
  updatePassword: async (request: PasswordUpdateRequest): Promise<AuthResult<User>> => {
    try {
      if (request.password !== request.confirmPassword) {
        return { data: null, error: AUTH_ERRORS.PASSWORDS_DONT_MATCH, success: false };
      }

      if (!ValidationUtils.isValidPassword(request.password)) {
        return { data: null, error: AUTH_ERRORS.WEAK_PASSWORD, success: false };
      }

      const response = await supabase.auth.updateUser({
        password: request.password
      });

      const { data, error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: data.user, error: null, success: true };
    } catch (error) {
      console.error('Error en updatePassword:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Actualiza datos del usuario actual
   */
  updateUserData: async (userData: UserUpdateData): Promise<AuthResult<User>> => {
    try {
      if (userData.email && !ValidationUtils.isValidEmail(userData.email)) {
        return { data: null, error: AUTH_ERRORS.INVALID_EMAIL, success: false };
      }

      const updateData: any = {};
      
      if (userData.email) updateData.email = userData.email.toLowerCase().trim();
      
      if (userData.fullName || userData.phone || userData.avatar_url) {
        updateData.data = {
          ...(userData.fullName && { full_name: userData.fullName }),
          ...(userData.phone && { phone: userData.phone }),
          ...(userData.avatar_url && { avatar_url: userData.avatar_url })
        };
      }

      const response = await supabase.auth.updateUser(updateData);
      const { data, error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: data.user, error: null, success: true };
    } catch (error) {
      console.error('Error en updateUserData:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  },

  /**
   * Refresca el token de sesion
   */
  refreshSession: async (): Promise<AuthResult<Session>> => {
    try {
      const response = await supabase.auth.refreshSession();
      const { data, error } = response as any;

      if (error) {
        return { data: null, error: error.message, success: false };
      }

      return { data: data.session, error: null, success: true };
    } catch (error) {
      console.error('Error en refreshSession:', error);
      return { data: null, error: AUTH_ERRORS.NETWORK_ERROR, success: false };
    }
  }
};

// ==================== LISTENER DE ESTADO DE AUTENTICACION ====================
export const AuthStateManager = {
  /**
   * Configura listener para cambios de estado de autenticacion
   */
  onAuthStateChange: (callback: (authState: AuthState) => void) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const authState: AuthState = {
        user: session?.user || null,
        session: session,
        loading: false,
        error: null
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('Auth State Change:', event, session?.user?.id || 'No user');
      }

      callback(authState);
    });

    return subscription;
  },

  /**
   * Obtiene el estado actual de autenticacion
   */
  getAuthState: async (): Promise<AuthState> => {
    const { data: session } = await SupabaseAuth.getCurrentSession();
    
    return {
      user: session?.user || null,
      session: session,
      loading: false,
      error: null
    };
  }
};

// ==================== EXPORTACIONES ====================
export default SupabaseAuth;
/*
export {
  ValidationUtils,
  AuthStateManager,
  AUTH_ERRORS,
  PASSWORD_MIN_LENGTH
};
*/
export type {
  LoginCredentials,
  RegisterCredentials,
  AuthResult,
  PasswordResetRequest,
  PasswordUpdateRequest,
  UserUpdateData,
  AuthState
};
