import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import supabase from '@/config/SupabaseConfig';
import { RootState } from '@/common/store';

/**
 * Bookings que están siendo mostrados ahora mismo por una ReservationTripScreen
 * montada. El watcher global ignora estos ids para no duplicar el modal: la
 * pantalla del viaje ya muestra su propio aviso y, además, navega de vuelta.
 * Es la coordinación determinista entre la Parte 1 (pantalla) y la Parte 2 (global).
 */
export const activeTripBookings = new Set<string>();

// Ventana de "cancelación reciente": el poll de respaldo alerta cualquier booking
// del conductor que pasó a CANCELLED dentro de este margen (usando updated_at, que
// un trigger pone en NOW() en cada UPDATE — sirve para cancelaciones del cliente y
// del admin web). Cubre el arranque en frío justo después de una cancelación sin
// spamear cancelaciones antiguas al abrir la app.
const RECENT_CANCEL_WINDOW_MS = 15 * 60 * 1000;

type ShowCancelModal = (args: {
  bookingId: string;
  reason: string | null;
  cancelledBy: string | null;
  customerName: string | null;
}) => void;

export function useDriverCancellationWatcher(showCancelModal: ShowCancelModal) {
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const driverId = user?.id;
  const isDriver = user?.usertype === 'driver' || user?.user_type === 'driver';
  const handledIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isDriver || !driverId) return;

    const handleCancellation = (row: any) => {
      if (!row?.id) return;
      const id = String(row.id);
      if (handledIdsRef.current.has(id)) return;
      handledIdsRef.current.add(id);
      // La pantalla del viaje activo se encarga de este booking (modal + volver).
      if (activeTripBookings.has(id)) return;
      showCancelModal({
        bookingId: id,
        reason: row.reason ?? null,
        cancelledBy: row.cancelled_by ?? null,
        customerName: row.customer_name ?? null,
      });
    };

    // Realtime: cualquier UPDATE de bookings asignados a este conductor.
    const channel = (supabase as any)
      .channel(`driver-cancel-watch-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reserva',
          filter: `id_conductor=eq.${driverId}`,
        },
        (payload: any) => {
          const next = payload?.new;
          const prev = payload?.old;
          if (!next) return;
          // reserva (nuevo): estado / cancelado_por / motivo_cancelacion
          const estado = next.status ?? next.estado;
          const estadoPrev = prev?.status ?? prev?.estado;
          // Solo si transicionó a CANCELLED (no si ya estaba cancelado).
          if (estado === 'CANCELLED' && estadoPrev !== 'CANCELLED') {
            handleCancellation({
              ...next,
              status: estado,
              cancelled_by: next.cancelled_by ?? next.cancelado_por,
              reason: next.reason ?? next.motivo_cancelacion,
            });
          }
        },
      )
      .subscribe();

    // Polling de respaldo cada 5s: alerta cualquier booking del conductor que esté
    // CANCELLED y se haya actualizado dentro de la ventana reciente. Respalda al
    // realtime (si se cae) y cubre el arranque en frío tras una cancelación.
    const poll = async () => {
      try {
        const sinceIso = new Date(Date.now() - RECENT_CANCEL_WINDOW_MS).toISOString();
        const { data, error } = await (supabase as any)
          .from('bookings')
          .select('id, status, cancelled_by, reason, customer_name, updated_at')
          .eq('driver_id', driverId)
          .eq('status', 'CANCELLED')
          .gt('updated_at', sinceIso)
          .order('updated_at', { ascending: false })
          .limit(20);
        if (error || !data) return;
        data.forEach(handleCancellation);
      } catch (e) {
        // silencio: el realtime es la fuente principal
      }
    };
    poll();
    const interval = setInterval(poll, 5000);

    return () => {
      clearInterval(interval);
      (supabase as any).removeChannel?.(channel);
    };
  }, [driverId, isDriver, showCancelModal]);
}
