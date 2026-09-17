import { useEffect } from 'react';
import { Platform } from 'react-native';
import supabase from '@/config/SupabaseConfig';
import { useDispatch, useSelector } from 'react-redux';
import GetPushToken from '@/components/GetPushToken';
import { updatePushToken } from '@/common/actions/authactions';
import type { AppDispatch, RootState } from '@/common/store';

/**
 * Registra el Expo Push Token cuando hay sesión.
 * Vive en el layout raíz porque GetPushToken en (tabs)/_layout nunca se
 * monta: la navegación real está en app/_layout.tsx → Navigation.
 */
export function usePushTokenRegistration() {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const authId = useSelector((state: RootState) => {
    const user = state.auth.user as any;
    return user?.auth_id || user?.id || null;
  });

  useEffect(() => {
    if (!isAuthenticated || !authId) return;

    let cancelled = false;
    // Diferir: no hacer I/O de auth/Supabase dentro del callback de
    // onAuthStateChange (puede deadlockear el lock de GoTrue).
    const timer = setTimeout(async () => {
      try {
        console.log('[PushToken] registrando para', authId);
        const token = await GetPushToken();
        if (cancelled) return;
        if (!token) {
          console.warn('[PushToken] no se obtuvo token (permiso denegado, emulador sin Play, o error de Expo)');
          return;
        }
        await dispatch(updatePushToken(token, Platform.OS === 'ios' ? 'IOS' : 'ANDROID') as any);
        if (cancelled) return;
        const {error} = await (supabase as any).schema('booking_v2').rpc('register_push_device', {
          p_token:token,p_platform:Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        });
        if(error) throw new Error(error.message);
      } catch (e) {
        console.warn('[PushToken] registro falló:', e);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, authId, dispatch]);
}
