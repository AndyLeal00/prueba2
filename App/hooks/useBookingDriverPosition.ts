import { useState, useEffect } from 'react';
import supabase from '@/config/SupabaseConfig';

export interface DriverPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  createdAt: string;
}

/**
 * Suscribe al cliente a la posición en tiempo real del conductor para un booking.
 *
 * Flujo:
 *  1. Query inicial → obtiene el último punto en booking_tracking (por created_at DESC).
 *  2. Canal Supabase Realtime → escucha INSERT filtrado por booking_id y actualiza el estado.
 *  3. Cleanup → elimina el canal al desmontar o cuando cambia bookingId.
 *
 * @param bookingId  UUID del booking activo, o null/undefined para desactivar.
 */
export function useBookingDriverPosition(bookingId: string | null | undefined): {
  driverPosition: DriverPosition | null;
  isLoading: boolean;
  error: string | null;
} {
  const [driverPosition, setDriverPosition] = useState<DriverPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setIsLoading(false);
      setDriverPosition(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // ── 1. Query inicial ───────────────────────────────────────────────────────
    const fetchLatest = async () => {
      const { data, error: fetchError } = await supabase
        .from('booking_tracking_v2' as any)
        .select('lat, lng, accuracy, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (fetchError) {
        console.warn('[useBookingDriverPosition] query error:', fetchError.message);
        setError(fetchError.message);
      } else if (data && (data as any[]).length > 0) {
        const row = (data as any[])[0];
        setDriverPosition({
          lat: Number(row.lat),
          lng: Number(row.lng),
          accuracy: row.accuracy ?? undefined,
          createdAt: row.created_at,
        });
      }

      setIsLoading(false);
    };

    fetchLatest();

    // ── 2. Suscripción Realtime ────────────────────────────────────────────────
    // Nombre único por suscripción: si la pantalla se remonta (navegación,
    // hot reload, cambio de status que reinicia el efecto), reutilizar el mismo
    // nombre hace que Supabase Realtime falle silenciosamente al re-suscribirse
    // y los INSERT dejen de llegar — entonces el carro se queda quieto.
    const channel = supabase
      .channel(`driver-pos-${bookingId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_tracking',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as any;
          if (row?.lat != null && row?.lng != null) {
            setDriverPosition({
              lat: Number(row.lat),
              lng: Number(row.lng),
              accuracy: row.accuracy ?? undefined,
              createdAt: row.created_at,
            });
            setIsLoading(false);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIPTION_ERROR') {
          console.warn('[useBookingDriverPosition] realtime subscription error');
          setError('Error al conectar al canal en tiempo real');
        }
      });

    // ── 3. Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  return { driverPosition, isLoading, error };
}
