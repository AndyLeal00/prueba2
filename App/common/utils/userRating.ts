import { SUPABASE_URL, getSupabaseAuthHeaders } from '@/config/SupabaseConfig';

export type UserRatingRole = 'customer' | 'driver';

/**
 * Promedio de estrellas recibidas:
 * - customer ← AVG(bookings.customer_rating)
 * - driver   ← AVG(bookings.driver_rating)
 * Opcionalmente sincroniza users.rating.
 */
export async function fetchAndSyncUserRating(
  userId: string,
  role: UserRatingRole,
  opts?: { syncToProfile?: boolean },
): Promise<{ average: number | null; count: number }> {
  if (!userId) return { average: null, count: 0 };

  const sync = opts?.syncToProfile !== false;
  const headers = await getSupabaseAuthHeaders(true);
  const headersRead = await getSupabaseAuthHeaders();

  const col = role === 'driver' ? 'driver_rating' : 'customer_rating';
  const idCols =
    role === 'driver'
      ? `or=(driver_id.eq.${userId},driver.eq.${userId})`
      : `or=(customer_id.eq.${userId},customer.eq.${userId})`;

  const url =
    `${SUPABASE_URL}/rest/v1/bookings?${idCols}` +
    `&${col}=not.is.null&select=${col}`;

  const res = await fetch(url, { headers: headersRead });
  if (!res.ok) return { average: null, count: 0 };

  const rows: Array<Record<string, number>> = await res.json();
  const values = (rows || [])
    .map((r) => Number(r[col]))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!values.length) {
    if (sync) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ rating: 0 }),
        });
      } catch { /* ignore */ }
    }
    return { average: null, count: 0 };
  }

  const average = Math.round(
    (values.reduce((a, b) => a + b, 0) / values.length) * 10,
  ) / 10;

  if (sync) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ rating: average }),
      });
    } catch { /* ignore */ }
  }

  return { average, count: values.length };
}
