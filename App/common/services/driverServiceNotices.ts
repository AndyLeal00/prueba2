import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTICES_KEY = 'driver_service_notices_v1';
const TAKEN_GHOSTS_KEY = 'driver_taken_reservation_ghosts_v1';

/** Tiempo que permanece visible un servicio/reserva ya tomado (3 minutos). */
export const TAKEN_SERVICE_TTL_MS = 3 * 60 * 1000;
/** @deprecated usar TAKEN_SERVICE_TTL_MS — alias para compatibilidad */
export const TAKEN_RESERVATION_TTL_MS = TAKEN_SERVICE_TTL_MS;

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
  /**
   * Si el servicio ya no está disponible: timestamp absoluto de desaparición.
   * Se fija UNA vez al detectar "tomado" y no se resetea al reabrir el modal.
   */
  takenExpiresAt?: number | null;
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
    takenExpiresAt: null,
  };
  const prev = await readJson<ServiceNotice[]>(NOTICES_KEY, []);
  // Reemplazar aviso del mismo booking (servicio disponible de nuevo = limpio)
  const next = [notice, ...prev.filter((n) => n.bookingId !== notice.bookingId)].slice(0, 80);
  await writeJson(NOTICES_KEY, next);
  return notice;
}

export async function listServiceNotices(): Promise<ServiceNotice[]> {
  const list = await readJson<ServiceNotice[]>(NOTICES_KEY, []);
  const now = Date.now();
  // Quitar notificaciones cuyo TTL de "tomado" ya venció
  const alive = list.filter((n) => !n.takenExpiresAt || n.takenExpiresAt > now);
  if (alive.length !== list.length) await writeJson(NOTICES_KEY, alive);
  return alive;
}

export async function clearServiceNotices(): Promise<void> {
  await writeJson(NOTICES_KEY, []);
}

/**
 * Marca una notificación como tomada.
 * Si ya tenía takenExpiresAt vigente, NO lo resetea (evita reiniciar el contador al abrir el modal).
 */
export async function markNoticeTaken(bookingId: string): Promise<ServiceNotice | null> {
  if (!bookingId) return null;
  const prev = await readJson<ServiceNotice[]>(NOTICES_KEY, []);
  const now = Date.now();
  let found: ServiceNotice | null = null;
  let changed = false;
  const next = prev.map((n) => {
    if (n.bookingId !== bookingId) return n;
    if (n.takenExpiresAt && n.takenExpiresAt > now) {
      found = n;
      return n;
    }
    changed = true;
    found = { ...n, takenExpiresAt: now + TAKEN_SERVICE_TTL_MS };
    return found;
  });
  if (changed) await writeJson(NOTICES_KEY, next);
  return found;
}

export async function getTakenReservationGhosts(): Promise<TakenReservationGhost[]> {
  const list = await readJson<TakenReservationGhost[]>(TAKEN_GHOSTS_KEY, []);
  const now = Date.now();
  const alive = list.filter((g) => g.expiresAt > now);
  if (alive.length !== list.length) await writeJson(TAKEN_GHOSTS_KEY, alive);
  return alive;
}

/**
 * Fantasma solo para RESERVAS en el tab Reservas (3 min tras ser aceptadas por otro).
 * Conserva expiresAt original si ya existía — no reinicia el contador.
 */
export async function upsertTakenReservationGhost(
  booking: Record<string, unknown>,
): Promise<TakenReservationGhost[]> {
  const bookingId = String(booking.id || '');
  if (!bookingId) return getTakenReservationGhosts();

  const bt = String(booking.booking_type || '').toLowerCase();
  // Solo reservas programadas permanecen en el listado de Reservas
  if (bt && !bt.includes('reserv')) {
    return getTakenReservationGhosts();
  }

  const now = Date.now();
  const prev = await getTakenReservationGhosts();
  const existing = prev.find((g) => g.bookingId === bookingId);
  if (existing) {
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
    expiresAt: now + TAKEN_SERVICE_TTL_MS,
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
