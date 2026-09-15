/**
 * Constantes oficiales del modelo de tarifas TmasPlus.
 *
 * Fallbacks cuando la fila de categoría en `car_types` no trae
 * delta_aeropuerto / delta_aeropuerto_prog.
 *
 * Cada concepto es independiente. Si dos aplican (aeropuerto + programado),
 * se SUMAN. `delta_aeropuerto_prog` en BD es el delta de PROGRAMADO solo
 * (nombre histórico; no es aero+prog pre-sumado).
 */

/** Fallback si `car_types.delta_aeropuerto` no viene en rateDetails. */
export const DELTA_AEROPUERTO = 12_000;
/** Fallback si `car_types.delta_aeropuerto_prog` no viene (delta PROGRAMADO). */
export const DELTA_PROGRAMADO = 4_800;
export const DELTA_PROTOCOLO = 5_000;

/**
 * Margen del rango de cotización: max = min × (1 + MARGEN) = min / 0.8.
 * Solo para el máximo del pronóstico (min–max). Al cierre no aplica:
 * cliente y conductor reciben el mismo valor mínimo recalculado.
 */
export const MARGEN_CLIENTE = 0.25;

export const DEFAULT_UMBRAL_INTERMUNICIPAL_KM = 29;

/** Redondeo a centena hacia arriba. */
export const roundUpToHundred = (n: number): number =>
  Math.ceil(Number(n) / 100) * 100;

/**
 * Máximo del rango a partir del mínimo conductor.
 * max = ROUNDUP(min × 1.25, centena) ≡ ROUNDUP(min / 0.8, centena).
 */
export const maxFromMinConductor = (minConductor: number): number =>
  roundUpToHundred(Number(minConductor) * (1 + MARGEN_CLIENTE));

/**
 * Rango unificado a mostrar en UI (conductor y cliente).
 * Cotización / en curso: min = trip_cost|driver_share, max = estimate|price.
 * COMPLETE: un solo valor (price|trip_cost|estimate).
 */
export function getBookingFareRange(booking: any): {
  min: number;
  max: number;
  isComplete: boolean;
} {
  const status = String(booking?.status || '').toUpperCase();
  const isComplete =
    status === 'COMPLETE' ||
    status === 'COMPLETED' ||
    status === 'PAID';

  const num = (v: any) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  if (isComplete) {
    const final =
      num(booking?.price) ||
      num(booking?.trip_cost) ||
      num(booking?.driver_share) ||
      num(booking?.estimate);
    return { min: final, max: final, isComplete: true };
  }

  const min =
    num(booking?.trip_cost) ||
    num(booking?.driver_share) ||
    num(booking?.price) ||
    num(booking?.estimate);
  const max =
    num(booking?.estimate) ||
    num(booking?.price) ||
    min;
  return {
    min,
    max: max >= min ? max : min,
    isComplete: false,
  };
}

/** Texto `$ min - $ max` o `$ final` si ya cerró. */
export function formatBookingFareRange(booking: any): string {
  const { min, max, isComplete } = getBookingFareRange(booking);
  if (!min && !max) return '$ 0';
  if (isComplete || min === max) {
    return `$ ${min.toLocaleString('es-CO')}`;
  }
  return `$ ${min.toLocaleString('es-CO')} - $ ${max.toLocaleString('es-CO')}`;
}
