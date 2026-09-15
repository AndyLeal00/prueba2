/**
 * Cálculo de tarifa TmasPlus (cotización y cierre).
 *
 *   total_conductor = ROUNDUP((base + km×precio_km + min×precio_min
 *                              + delta_aeropuerto + delta_programado
 *                              + delta_protocolo + peajes + parqueadero
 *                              + extras) / 100) * 100
 *   total_conductor = MAX(total_conductor, min_fare)
 *   valor_rango_max = ROUNDUP(total_conductor × 1.25 / 100) * 100
 *
 * Precio/min: preferir rate_per_hour ($/min); si falta, valor_hora/60.
 * Deltas: de rateDetails (BD) si vienen; si no, constants/fare.ts.
 *
 * Al cierre (addActualsToBooking) se persiste el mismo valor para ambos lados
 * (price = trip_cost = driver_share = estimate).
 *
 * context:
 *   isAirport        - origen o destino ≤1 km de un aeropuerto (airports.ts)
 *   isScheduled      - reserva programada
 *   isProtocol       - protocolo
 *   tollsTotal       - peajes
 *   parking          - parqueadero
 *   isIntermunicipal - distancia > umbral → tarifas _inter
 */
import {
  DELTA_AEROPUERTO,
  DELTA_PROGRAMADO,
  DELTA_PROTOCOLO,
  maxFromMinConductor,
} from '@/constants/fare';

/** Delta desde BD o fallback de constants/fare.ts. */
const resolveDelta = (fromRates: any, fallback: number): number => {
  if (fromRates == null || fromRates === '') return fallback;
  const n = parseFloat(fromRates);
  return Number.isFinite(n) ? n : fallback;
};

export const FareCalculator = (
  distance: number,
  time: number,
  rateDetails: any,
  instructionData: any,
  _decimal: number,
  context: {
    isAirport?: boolean;
    isScheduled?: boolean;
    isProtocol?: boolean;
    tollsTotal?: number;
    parking?: number;
    isIntermunicipal?: boolean;
  } = {}
) => {
  const {
    isAirport = false,
    isScheduled = false,
    isProtocol = false,
    tollsTotal = 0,
    parking = 0,
    isIntermunicipal = false,
  } = context;

  const pick = (urban: any, inter: any) =>
    isIntermunicipal && inter != null ? inter : urban;

  const ratePerUnitDistance = Math.round(
    parseFloat(pick(rateDetails.rate_per_unit_distance, rateDetails.rate_per_unit_distance_inter))
  );

  // Precio por minuto: preferir rate_per_hour; si no, valor_hora/60.
  const ratePerHourRaw = parseFloat(
    pick(rateDetails.rate_per_hour, rateDetails.rate_per_hour_inter) || 0
  );
  const valorHora = parseFloat(rateDetails.valor_hora || 0);
  let ratePerMinute: number;
  if (ratePerHourRaw > 0) {
    ratePerMinute = ratePerHourRaw;
  } else if (valorHora > 0) {
    const ratePerMinuteUrban = valorHora / 60;
    ratePerMinute = isIntermunicipal ? ratePerMinuteUrban / 0.5 : ratePerMinuteUrban;
  } else {
    ratePerMinute = 0;
  }

  const baseFare = Math.round(
    parseFloat(pick(rateDetails.base_fare, rateDetails.base_fare_inter) || 0)
  );
  const minFare = Math.round(
    parseFloat(pick(rateDetails.min_fare, rateDetails.min_fare_inter) || 0)
  );
  const convenienceFees = Math.round(parseFloat(rateDetails.convenience_fees || 0));

  const deltaAeropuerto = resolveDelta(rateDetails.delta_aeropuerto, DELTA_AEROPUERTO);
  const deltaProgramado = resolveDelta(rateDetails.delta_aeropuerto_prog, DELTA_PROGRAMADO);

  if (minFare <= 0) {
    console.warn(
      '[FareCalculator] min_fare=0 o ausente para categoría',
      rateDetails.id ?? rateDetails.name
    );
  }

  if (
    isNaN(distance) || isNaN(time) || isNaN(ratePerUnitDistance) ||
    isNaN(ratePerMinute) || isNaN(baseFare) || isNaN(minFare) || isNaN(convenienceFees)
  ) {
    console.error('Invalid numeric value in FareCalculator:', {
      distance, time, ratePerUnitDistance, ratePerMinute, baseFare, minFare, convenienceFees,
    });
    return { totalCost: 0, grandTotal: 0, clientTotal: 0, convenience_fees: 0 };
  }

  // Componentes (time en segundos → minutos)
  let sumaComponentes = Math.round(
    (ratePerUnitDistance * distance) + (ratePerMinute * (time / 60))
  );

  if (baseFare > 0) sumaComponentes += baseFare;

  if (instructionData?.parcelTypeSelected) sumaComponentes += instructionData.parcelTypeSelected.amount;
  if (instructionData?.optionSelected) sumaComponentes += instructionData.optionSelected.amount;

  if (isAirport) sumaComponentes += deltaAeropuerto;
  if (isScheduled) sumaComponentes += deltaProgramado;
  if (isProtocol) sumaComponentes += DELTA_PROTOCOLO;
  if (tollsTotal > 0) sumaComponentes += tollsTotal;
  if (parking > 0) sumaComponentes += parking;

  let totalConductor = Math.ceil(sumaComponentes / 100) * 100;
  if (totalConductor < minFare) totalConductor = minFare;

  // Máximo del rango (mismo para conductor y cliente en cotización)
  const clientTotal = maxFromMinConductor(totalConductor);

  let convenienceFee = 0;
  if (rateDetails.convenience_fee_type === 'flat') {
    convenienceFee = convenienceFees;
  } else {
    convenienceFee = Math.round((totalConductor * convenienceFees) / 100);
  }

  const grand = totalConductor + convenienceFee;

  return {
    totalCost: totalConductor,   // mínimo del rango
    grandTotal: grand,
    clientTotal,                 // máximo del rango
    convenience_fees: Math.round(convenienceFee),
  };
};
