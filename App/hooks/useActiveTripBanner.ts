import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/common/store/store';
import supabase, { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { isActiveTripStatus } from '@/common/services/ActiveTripNotificationService';

export type ActiveTripBannerBooking = {
  id: string;
  status?: string;
  reference?: string;
  booking_type?: string;
  customer?: string;
  customer_id?: string;
  customer_name?: string;
  customer_image?: string;
  driver?: string;
  driver_id?: string;
  driver_name?: string;
  driver_image?: string;
  pickup_address?: string;
  drop_address?: string;
  /** Foto resuelta desde users.profile_image */
  counterpart_photo?: string | null;
  [key: string]: unknown;
};

const ACTIVE_STATUSES = ['ACCEPTED', 'ARRIVED', 'STARTED', 'IN_PROGRESS', 'TRIP_STARTED'];
/** Cliente esperando que un conductor acepte (aún sin viaje en curso). */
const WAITING_STATUSES = ['PENDING', 'NEW'];

export function isWaitingAcceptanceStatus(status?: string): boolean {
  return WAITING_STATUSES.includes(String(status || '').toUpperCase());
}

export function isBannerBookingStatus(status?: string, isDriver = false): boolean {
  if (isActiveTripStatus(status)) return true;
  // Solo el cliente ve banner en PENDING/NEW
  if (!isDriver && isWaitingAcceptanceStatus(status)) return true;
  return false;
}

export function isImmediateBookingType(type?: string | null): boolean {
  const t = String(type || '').trim().toLowerCase();
  return t === 'immediate' || t === 'now' || t === '';
}

export function isReservationBookingType(type?: string | null): boolean {
  const t = String(type || '').trim().toLowerCase();
  return t === 'reservation' || t === 'scheduled' || t === 'book_later';
}

/** Título del banner según tipo / fase. */
export function activeTripTitle(booking?: ActiveTripBannerBooking | null): string {
  if (!booking) return 'Viaje en curso';
  if (isWaitingAcceptanceStatus(booking.status)) {
    return 'Esperando aceptación de viaje';
  }
  if (isReservationBookingType(booking.booking_type as string)) {
    return 'Viaje en curso de reserva';
  }
  if (isImmediateBookingType(booking.booking_type as string)) {
    return 'Viaje en curso inmediato';
  }
  return 'Viaje en curso';
}

function pickUserType(user: any, profile: any): string {
  return String(
    profile?.user_type ||
      user?.usertype ||
      user?.user_type ||
      user?.userType ||
      user?.user_metadata?.usertype ||
      user?.user_metadata?.user_type ||
      user?.user_metadata?.userType ||
      '',
  )
    .trim()
    .toLowerCase();
}

function pickHttpPhoto(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (u.startsWith('http') || u.startsWith('file:') || u.startsWith('content:')) return u;
  }
  return null;
}

async function resolvePublicUserId(
  candidates: string[],
  headers: Record<string, string>,
): Promise<string | null> {
  for (const c of candidates) {
    if (!c) continue;
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?or=(id.eq.${c},auth_id.eq.${c})&select=id&limit=1`,
        { headers },
      );
      if (r.ok) {
        const rows = await r.json();
        if (rows?.[0]?.id) return rows[0].id;
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return null;
}

async function resolveCounterpartPhoto(
  targetId: string | undefined | null,
  fallback: string | null,
  headers: Record<string, string>,
): Promise<string | null> {
  if (fallback) return fallback;
  const id = String(targetId || '').trim();
  if (!id) return null;

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/users` +
      `?or=(id.eq.${encodeURIComponent(id)},auth_id.eq.${encodeURIComponent(id)})` +
      `&select=profile_image&limit=1`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    const u = Array.isArray(rows) ? rows[0] : null;
    return pickHttpPhoto(u?.profile_image);
  } catch {
    return null;
  }
}

/**
 * Detecta viajes activos del conductor o cliente (post-aceptación).
 * Puede haber más de uno (p. ej. inmediato + reserva a la vez).
 */
export function useActiveTripBanner() {
  const user = useSelector((state: RootState) => (state as any).auth?.user as any);
  const profile = useSelector((state: RootState) => (state as any).auth?.profile as any);

  const userType = pickUserType(user, profile);
  const isDriver = userType === 'driver';
  const isCustomer = userType === 'customer' || userType === 'company';

  const [bookings, setBookings] = useState<ActiveTripBannerBooking[]>([]);
  // Nombre de canal único por instancia (TabBar + lista de servicios montan el hook a la vez).
  const instanceIdRef = useRef(`atb-${Math.random().toString(36).slice(2, 9)}`);

  const candidatesKey = [user?.id, user?.auth_id, profile?.id, profile?.auth_id]
    .filter(Boolean)
    .join('|');

  const refresh = useCallback(async () => {
    const idCandidates = candidatesKey.split('|').filter(Boolean);
    if ((!isDriver && !isCustomer) || idCandidates.length === 0) {
      setBookings([]);
      return;
    }

    try {
      const headers = await getSupabaseAuthHeaders();
      const uid = await resolvePublicUserId(idCandidates, headers);
      if (!uid) {
        setBookings([]);
        return;
      }

      const statusList = isDriver
        ? ACTIVE_STATUSES
        : [...ACTIVE_STATUSES, ...WAITING_STATUSES];
      const statuses = statusList.map((s) => `"${s}"`).join(',');
      const filter = isDriver
        ? `driver_id=eq.${uid}`
        : `customer=eq.${uid}`;
      // Varios viajes activos a la vez (inmediato + reserva).
      const url =
        `${SUPABASE_URL}/rest/v1/bookings?${filter}` +
        `&status=in.(${statuses})&order=created_at.desc&limit=10&select=*`;

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        console.warn('[ActiveTripBanner] fetch failed', resp.status, body.slice(0, 200));
        return;
      }

      const rows = await resp.json();
      const list = (Array.isArray(rows) ? rows : []).filter(
        (row: any) => row?.id && isBannerBookingStatus(row.status, isDriver),
      ) as ActiveTripBannerBooking[];

      const enriched: ActiveTripBannerBooking[] = [];
      for (const row of list) {
        // En espera de aceptación aún no hay conductor: no resolvemos foto
        if (isWaitingAcceptanceStatus(row.status)) {
          enriched.push({ ...row, counterpart_photo: null });
          continue;
        }
        const counterpartId = isDriver
          ? row.customer || row.customer_id
          : row.driver_id || row.driver;
        const fallbackPhoto = pickHttpPhoto(
          isDriver ? row.customer_image : row.driver_image,
        );
        const counterpart_photo = await resolveCounterpartPhoto(
          counterpartId as string,
          fallbackPhoto,
          headers,
        );
        enriched.push({ ...row, counterpart_photo });
      }

      setBookings(enriched);
    } catch (e) {
      console.warn('[ActiveTripBanner] refresh error', e);
    }
  }, [isDriver, isCustomer, candidatesKey]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const bookingIdsKey = bookings.map((b) => b.id).sort().join('|');

  useEffect(() => {
    if (!bookingIdsKey) return;

    const ids = bookingIdsKey.split('|').filter(Boolean);
    const topic = `active-trip-banner-multi-${instanceIdRef.current}`;
    try {
      const existing = supabase.getChannels().find((ch) => ch.topic === `realtime:${topic}` || ch.topic === topic);
      if (existing) supabase.removeChannel(existing);
    } catch {
      // ignore
    }

    let channel = supabase.channel(topic);
    for (const id of ids) {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as ActiveTripBannerBooking | null;
          if (!updated?.id) return;
          setBookings((prev) => {
            if (!isBannerBookingStatus(updated.status, isDriver)) {
              return prev.filter((b) => b.id !== updated.id);
            }
            return prev.map((b) =>
              b.id === updated.id
                ? { ...b, ...updated, counterpart_photo: b.counterpart_photo }
                : b,
            );
          });
        },
      );
    }
    channel.subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [bookingIdsKey, isDriver]);

  const booking = bookings[0] ?? null;

  const activeImmediate = useMemo(
    () => bookings.find((b) => isImmediateBookingType(b.booking_type as string)) ?? null,
    [bookings],
  );
  const activeReservation = useMemo(
    () => bookings.find((b) => isReservationBookingType(b.booking_type as string)) ?? null,
    [bookings],
  );

  return {
    booking,
    bookings,
    activeImmediate,
    activeReservation,
    isDriver,
    isCustomer,
    hasActiveTrip: bookings.length > 0,
    refresh,
  };
}
