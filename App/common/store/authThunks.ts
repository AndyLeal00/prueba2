import { createAsyncThunk } from '@reduxjs/toolkit';
import { SupabaseAuth } from '@/config/SupabaseAuth';
import { SupabaseDatabase } from '@/config/SupabaseDatabase';
import { supabase } from '@/config/SupabaseConfig';
import { loginSuccess, setProfile, setError, setLoading } from './authSlice';
import type { LoginCredentials, RegisterCredentials } from '@/config/SupabaseAuth';
import type { UserProfile } from './authSlice'; // ✅ TIPO UNIFICADO
import type { RootState } from './store';

// ==================== THUNK PARA LOGIN ====================
export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));

      // 1. Autenticar con Supabase
      const authResult = await SupabaseAuth.signIn(credentials);
      
      if (!authResult.success || !authResult.data) {
        dispatch(setError({ flag: true, msg: authResult.error || 'Error de login' }));
        return rejectWithValue(authResult.error);
      }

      const session = authResult.data;

      // 2. Obtener perfil vía RPC get_perfil_movil (mapea persona+perfil+wallet+roles
      //    a la forma UserProfile que consumen las pantallas). Esquema consolidado.
      const { data: profileData, error: profileError } = await supabase.rpc('get_perfil_movil');

      if (profileError || !profileData) {
        dispatch(setError({ flag: true, msg: 'Error obteniendo perfil de usuario' }));
        return rejectWithValue('Perfil no encontrado');
      }

      // ✅ CAST DIRECTO A TIPO UNIFICADO
      const profile = profileData as UserProfile;

      // 2.1 Bloquear acceso si la cuenta está bloqueada (Conductor o Cliente)
      if (profile.blocked) {
        await SupabaseAuth.signOut();
        const blockedMsg = 'Su cuenta está bloqueada. Comuníquese con soporte.';
        dispatch(setError({ flag: true, msg: blockedMsg }));
        return rejectWithValue(blockedMsg);
      }

      // 3. Actualizar estado
      dispatch(loginSuccess({ user: session.user, session }));
      dispatch(setProfile(profile));

      return {
        user: session.user,
        session,
        profile
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      dispatch(setError({ flag: true, msg: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

// ==================== THUNK PARA REGISTRO ====================
export const registerThunk = createAsyncThunk(
  'auth/register',
  async (credentials: RegisterCredentials, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));

      const authResult = await SupabaseAuth.signUp(credentials);
      
      if (!authResult.success || !authResult.data) {
        dispatch(setError({ flag: true, msg: authResult.error || 'Error de registro' }));
        return rejectWithValue(authResult.error);
      }

      if (authResult.data.id) {
        const nameParts = credentials.fullName?.split(' ') || ['', ''];
        
        // ✅ DATOS COMPATIBLES CON UserProfile
        const profileData: Partial<UserProfile> = {
          auth_id: authResult.data.id,
          email: credentials.email.toLowerCase(),
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          mobile: credentials.phone || null,
          user_type: 'customer',
          wallet_balance: 0,
          rating: 0,
          total_rides: 0,
          is_verified: false,
          approved: true,
          blocked: false,
          driver_active_status: false
        };

        const profileResult = await SupabaseDatabase.insert('users', profileData);
        
        if (!profileResult.success) {
          console.warn('Error creando perfil:', profileResult.error);
        }
      }

      return {
        user: authResult.data,
        message: 'Registro exitoso. Verifica tu email para activar la cuenta.'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      dispatch(setError({ flag: true, msg: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

// ==================== THUNK PARA LOGOUT ====================
export const logoutThunk = createAsyncThunk(
  'auth/logout',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));

      const result = await SupabaseAuth.signOut();
      
      if (!result.success) {
        dispatch(setError({ flag: true, msg: result.error || 'Error cerrando sesión' }));
        return rejectWithValue(result.error);
      }

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      dispatch(setError({ flag: true, msg: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

// ==================== THUNK PARA VERIFICAR SESION ====================
export const checkAuthThunk = createAsyncThunk(
  'auth/checkAuth',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));

      const sessionResult = await SupabaseAuth.getCurrentSession();
      
      if (!sessionResult.success || !sessionResult.data) {
        return { authenticated: false };
      }

      const session = sessionResult.data;

      const { data: profileData } = await supabase.rpc('get_perfil_movil');

      if (profileData) {
        // ✅ CAST DIRECTO A TIPO UNIFICADO
        const profile = profileData as UserProfile;

        // Si la cuenta fue bloqueada, cerrar sesión y negar acceso
        if (profile.blocked) {
          await SupabaseAuth.signOut();
          const blockedMsg = 'Su cuenta está bloqueada. Comuníquese con soporte.';
          dispatch(setError({ flag: true, msg: blockedMsg }));
          return rejectWithValue(blockedMsg);
        }

        dispatch(loginSuccess({ user: session.user, session }));
        dispatch(setProfile(profile));

        return {
          authenticated: true,
          user: session.user,
          session,
          profile
        };
      }

      return { authenticated: false };

    } catch (error) {
      console.error('Error verificando autenticación:', error);
      return { authenticated: false };
    }
  }
);

// ==================== THUNK PARA ACTUALIZAR PERFIL ====================
export const updateProfileThunk = createAsyncThunk(
  'auth/updateProfile',
  async (profileData: Partial<UserProfile>, { getState, dispatch, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const currentProfile = state.auth.profile;
      
      // ✅ VALIDACIÓN TYPE-SAFE
      if (!currentProfile) {
        return rejectWithValue('No hay perfil de usuario');
      }

      // ✅ VERIFICAR QUE TIENE ID - USAR TYPE ASSERTION
      const profileId = (currentProfile as any).id;
      if (!profileId) {
        return rejectWithValue('ID de perfil no encontrado');
      }

      dispatch(setLoading(true));

      const result = await SupabaseDatabase.update('users', profileId, profileData);
      
      if (!result.success || !result.data) {
        dispatch(setError({ flag: true, msg: result.error || 'Error actualizando perfil' }));
        return rejectWithValue(result.error);
      }

      // ✅ CAST DIRECTO A TIPO UNIFICADO
      const updatedProfile = result.data as UserProfile;
      dispatch(setProfile(updatedProfile));
      
      return updatedProfile;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      dispatch(setError({ flag: true, msg: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

// ==================== THUNK PARA RESET PASSWORD ====================
export const resetPasswordThunk = createAsyncThunk(
  'auth/resetPassword',
  async (email: string, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));

      const result = await SupabaseAuth.resetPassword({ email });
      
      if (!result.success) {
        dispatch(setError({ flag: true, msg: result.error || 'Error enviando email' }));
        return rejectWithValue(result.error);
      }

      return { 
        success: true, 
        message: 'Email de recuperación enviado exitosamente' 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      dispatch(setError({ flag: true, msg: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);
