import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTICES_KEY = 'driver_service_notices_v1';
const TAKEN_GHOSTS_KEY = 'driver_taken_reservation_ghosts_v1';

export const TAKEN_RESERVATION_TTL_MS = 5 * 60 * 1000;

export type ServiceNoticeKind = 'reservation' | 'immediate';

export type ServiceNotice = {
  id: string;
  bookingId: string;
  bookingType: ServiceNoticeKind;
  title: string;
  body: string;
  pickup?: string;
  drop?: string;
  reference?: string;
  createdAt: number;
  /** Snapshot parcial del booking al notificar */
  bookingSnapshot?: Record<string, unknown> | null;
};

export type TakenReservationGhost = {
  bookingId: string;
  booking: Record<string, unknown>;
  takenAt: number;
  expiresAt: number;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Registra una notificación de servicio (inmediato o programado) para el modal. */
export async function recordServiceNotice(
  partial: Omit<ServiceNotice, 'id' | 'createdAt'> & { id?: string },
): Promise<ServiceNotice> {
  const notice: ServiceNotice = {
    id: partial.id || `${partial.bookingId}-${Date.now()}`,
    bookingId: partial.bookingId,
    bookingType: partial.bookingType,
    title: partial.title,
    body: partial.body,
    pickup: partial.pickup,
    drop: partial.drop,
    reference: partial.reference,
    bookingSnapshot: partial.bookingSnapshot ?? null,
    createdAt: Date.now(),
  };
  const prev = await readJson<ServiceNotice[]>(NOTICES_KEY, []);
  // Evitar duplicados del mismo booking recientes (< 2 min)
  const filtered = prev.filter(
    (n) =>
      !(n.bookingId === notice.bookingId && Date.now() - n.createdAt < 120_000),
  );
  const next = [notice, ...filtered].slice(0, 80);
  await writeJson(NOTICES_KEY, next);
  return notice;
}

export async function listServiceNotices(): Promise<ServiceNotice[]> {
  return readJson<ServiceNotice[]>(NOTICES_KEY, []);
}

export async function clearServiceNotices(): Promise<void> {
  await writeJson(NOTICES_KEY, []);
}

export async function getTakenReservationGhosts(): Promise<TakenReservationGhost[]> {
  const list = await readJson<TakenReservationGhost[]>(TAKEN_GHOSTS_KEY, []);
  const now = Date.now();
  const alive = list.filter((g) => g.expiresAt > now);
  if (alive.length !== list.length) await writeJson(TAKEN_GHOSTS_KEY, alive);
  return alive;
}

export async function upsertTakenReservationGhost(
  booking: Record<string, unknown>,
): Promise<TakenReservationGhost[]> {
  const bookingId = String(booking.id || '');
  if (!bookingId) return getTakenReservationGhosts();
  const now = Date.now();
  const prev = await getTakenReservationGhosts();
  const existing = prev.find((g) => g.bookingId === bookingId);
  if (existing) {
    // Refrescar snapshot pero conservar expiresAt original
    const next = prev.map((g) =>
      g.bookingId === bookingId ? { ...g, booking: { ...g.booking, ...booking } } : g,
    );
    await writeJson(TAKEN_GHOSTS_KEY, next);
    return next;
  }
  const ghost: TakenReservationGhost = {
    bookingId,
    booking,
    takenAt: now,
    expiresAt: now + TAKEN_RESERVATION_TTL_MS,
  };
  const next = [ghost, ...prev].slice(0, 40);
  await writeJson(TAKEN_GHOSTS_KEY, next);
  return next;
}

export async function removeTakenReservationGhost(bookingId: string): Promise<void> {
  const prev = await getTakenReservationGhosts();
  await writeJson(
    TAKEN_GHOSTS_KEY,
    prev.filter((g) => g.bookingId !== bookingId),
  );
}

export function formatCountdown(msLeft: number): string {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
