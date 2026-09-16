import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/common/store/store';
import supabase, { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';
import { isActiveTripStatus } from '@/common/services/ActiveTripNotificationService';

export type ActiveTripBannerBooking = {
  id: string;
  status?: string;
  reference?: string;
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
 * Detecta el viaje activo del conductor o cliente (post-aceptación)
 * para mostrar el banner flotante en las pestañas principales.
 */
export function useActiveTripBanner() {
  const user = useSelector((state: RootState) => (state as any).auth?.user as any);
  const profile = useSelector((state: RootState) => (state as any).auth?.profile as any);

  const userType = pickUserType(user, profile);
  const isDriver = userType === 'driver';
  const isCustomer = userType === 'customer' || userType === 'company';

  const [booking, setBooking] = useState<ActiveTripBannerBooking | null>(null);

  const candidatesKey = [user?.id, user?.auth_id, profile?.id, profile?.auth_id]
    .filter(Boolean)
    .join('|');

  const refresh = useCallback(async () => {
    const idCandidates = candidatesKey.split('|').filter(Boolean);
    if ((!isDriver && !isCustomer) || idCandidates.length === 0) {
      setBooking(null);
      return;
    }

    try {
      const headers = await getSupabaseAuthHeaders();
      const uid = await resolvePublicUserId(idCandidates, headers);
      if (!uid) {
        setBooking(null);
        return;
      }

      const statuses = ACTIVE_STATUSES.map((s) => `"${s}"`).join(',');
      const filter = isDriver
        ? `driver_id=eq.${uid}`
        : `customer=eq.${uid}`;
      const url =
        `${SUPABASE_URL}/rest/v1/bookings?${filter}` +
        `&status=in.(${statuses})&order=created_at.desc&limit=1&select=*`;

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        console.warn('[ActiveTripBanner] fetch failed', resp.status, body.slice(0, 200));
        return;
      }

      const rows = await resp.json();
      const row = Array.isArray(rows) ? rows[0] : null;

      if (row?.id && isActiveTripStatus(row.status)) {
        const counterpartId = isDriver
          ? row.customer || row.customer_id
          : row.driver_id || row.driver;
        const fallbackPhoto = pickHttpPhoto(
          isDriver ? row.customer_image : row.driver_image,
        );
        const counterpart_photo = await resolveCounterpartPhoto(
          counterpartId,
          fallbackPhoto,
          headers,
        );

        setBooking({ ...row, counterpart_photo });
      } else {
        setBooking(null);
      }
    } catch (e) {
      console.warn('[ActiveTripBanner] refresh error', e);
    }
  }, [isDriver, isCustomer, candidatesKey]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const id = booking?.id;
    if (!id) return;

    const channel = supabase
      .channel(`active-trip-banner-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as ActiveTripBannerBooking | null;
          if (!updated) return;
          if (!isActiveTripStatus(updated.status)) {
            setBooking(null);
            return;
          }
          setBooking((prev) =>
            prev
              ? { ...prev, ...updated, counterpart_photo: prev.counterpart_photo }
              : updated,
          );
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [booking?.id]);

  return {
    booking,
    isDriver,
    isCustomer,
    hasActiveTrip: !!booking?.id,
    refresh,
  };
}
