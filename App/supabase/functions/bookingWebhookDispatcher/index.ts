// bookingWebhookDispatcher — recibe eventos de la tabla `reserva` desde un
// Database Webhook de Supabase y traduce cada evento relevante en una llamada
// a la Edge Function `sendPush`.
//
// ADAPTADO al esquema consolidado (aplicacioncore):
//   - webhook sobre `reserva` (no `bookings`)
//   - columnas nuevas: estado / id_cliente / id_conductor / id_categoria / origen_direccion
//   - el nombre de la categoría se resuelve desde id_categoria
//   - la elegibilidad de conductores usa la vista `cars` (driver_id/service_type/is_active)
//   - user_ids que se envían a sendPush = persona.id (id_cliente / id_conductor)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/sendPush`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, any> | null;
  old_record?: Record<string, any> | null;
}

interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "horn" | "notifi" | "default";
  channelId?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Función mal configurada: faltan SUPABASE_URL / SERVICE_ROLE" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Falta header Authorization" }, 401);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  if (payload.table !== "reserva") {
    return json({ skipped: true, reason: "table not reserva" });
  }

  const pushPayload = await decidePayload(payload);
  if (!pushPayload) return json({ skipped: true, reason: "no matching event" });

  try {
    const res = await fetch(SEND_PUSH_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(pushPayload),
    });
    const result = await res.json();
    return json({ dispatched: true, sendPush: result });
  } catch (err) {
    console.error("[bookingWebhookDispatcher] sendPush call failed:", err);
    return json({ error: "sendPush call failed", detail: String(err) }, 500);
  }
});

async function decidePayload(evt: WebhookPayload): Promise<PushPayload | null> {
  const record = evt.record;
  const oldRecord = evt.old_record ?? null;
  if (!record) return null;

  const esProgramado = record.tipo_reserva === "scheduled";
  const carTypeName = await getCarTypeName(record.id_categoria);

  // ─── INSERT con conductor asignado ─────────────────────────────────────
  if (evt.type === "INSERT" && record.id_conductor) {
    if (esProgramado) {
      return {
        user_ids: [record.id_conductor],
        title: "Servicio programado",
        body: buildDriverBody(record, carTypeName, "programado"),
        data: { type: "booking-scheduled", bookingId: record.id },
        sound: "default",
        channelId: "bookings-v2",
      };
    }
    return {
      user_ids: [record.id_conductor],
      title: "Nueva reserva",
      body: buildDriverBody(record, carTypeName, "inmediato"),
      data: { type: "new-service-loop", bookingId: record.id },
      sound: "horn",
      channelId: "new-service-loop",
    };
  }

  // ─── INSERT reserva SIN conductor → fan-out a conductores elegibles ─────
  if (evt.type === "INSERT" && !record.id_conductor && esProgramado && esEstadoAbierto(record.estado)) {
    const driverIds = await getEligibleDriverIds(record.id_categoria, carTypeName);
    if (driverIds.length === 0) {
      console.log("[bookingWebhookDispatcher] reserva nueva sin conductores elegibles", {
        bookingId: record.id, id_categoria: record.id_categoria,
      });
      return null;
    }
    return {
      user_ids: driverIds,
      title: "📅 Nueva reserva programada",
      body: buildDriverBody(record, carTypeName, "programado"),
      data: { type: "booking-scheduled", bookingId: record.id },
      sound: "default",
      channelId: "bookings-v2",
    };
  }

  // ─── UPDATE estado → estados que notifican al cliente ──────────────────
  if (evt.type === "UPDATE" && oldRecord && record.estado !== oldRecord.estado) {
    if (!record.id_cliente) return null;
    const common = (newStatus: string, title: string, body: string, sound: PushPayload["sound"] = "default") => ({
      user_ids: [record.id_cliente],
      title, body,
      data: { type: "booking-update", bookingId: record.id, newStatus },
      sound, channelId: "bookings-v2",
    });
    switch (record.estado) {
      case "ACCEPTED": return common("ACCEPTED", "Conductor asignado", buildAcceptedBody(record));
      case "ARRIVED":  return common("ARRIVED", "Tu conductor llegó", "Tu conductor está esperando en el punto de recogida");
      case "STARTED":  return common("STARTED", "Viaje iniciado", "Tu viaje está en camino al destino 🚗");
      case "COMPLETE": return common("COMPLETE", "Servicio finalizado", buildCompleteBody(record));
      default: return null;
    }
  }

  return null;
}

function esEstadoAbierto(status: unknown): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === "PENDING" || s === "NEW";
}

const CANONICAL_BY_KEY: Record<string, string> = {
  "taxiplus": "TaxiPlus", "t+plus taxi": "TaxiPlus", "taxi_plus": "TaxiPlus", "taxi plus": "TaxiPlus", "treas-t": "TaxiPlus",
  "vanplus": "VanPlus", "t+plus van": "VanPlus", "van_plus": "VanPlus", "van plus": "VanPlus", "treas-van": "VanPlus",
  "xplus": "XPlus", "t+plus particular": "XPlus", "particular": "XPlus", "treas-x": "XPlus",
  "confortplus": "ConfortPlus", "comfortplus": "ConfortPlus", "t+plus especial": "ConfortPlus",
  "servicio_especial": "ConfortPlus", "especial": "ConfortPlus", "treas-e": "ConfortPlus",
};

function toCanonicalCarType(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return CANONICAL_BY_KEY[raw.toLowerCase()] || raw;
}

async function getCarTypeName(idCategoria: any): Promise<string | null> {
  if (idCategoria == null) return null;
  const { data } = await admin.from("categoria_vehiculo").select("nombre").eq("id", idCategoria).maybeSingle();
  return data?.nombre ?? null;
}

// Conductores elegibles: vehículo ACTIVO cuya categoría (id o tipo_servicio canónico)
// coincide con la de la reserva. Usa la vista de compatibilidad `cars`
// (driver_id = persona.id, service_type = tipo_servicio, is_active = activo).
async function getEligibleDriverIds(idCategoria: any, carTypeName: string | null): Promise<string[]> {
  const canonical = toCanonicalCarType(carTypeName);
  const { data: cars, error } = await admin
    .from("cars")
    .select("driver_id, service_type, car_type_id")
    .eq("is_active", true);
  if (error) {
    console.error("[bookingWebhookDispatcher] cars query failed:", error);
    return [];
  }
  const ids = (cars ?? [])
    .filter((c: any) =>
      (idCategoria != null && c.car_type_id === idCategoria) ||
      (canonical && toCanonicalCarType(c.service_type) === canonical)
    )
    .map((c: any) => c.driver_id)
    .filter((id: any): id is string => Boolean(id));
  return [...new Set(ids)];
}

function buildDriverBody(record: Record<string, any>, carTypeName: string | null, tipo: "inmediato" | "programado"): string {
  const car = carTypeName ?? "Servicio";
  const pickup = truncate(record.origen_direccion ?? "Ubicación por definir", 60);
  if (tipo === "programado") {
    const when = record.solicitado_en ? formatShortDate(record.solicitado_en) : "";
    return when ? `${car} · ${when} · ${pickup}` : `${car} · ${pickup}`;
  }
  return `${car} · ${pickup}`;
}

function buildAcceptedBody(_record: Record<string, any>): string {
  // driver_name/placa son denormalizados; en el payload de reserva no vienen.
  // Se usa un texto genérico (la app ya muestra los datos del conductor por JOIN).
  return "Tu conductor va en camino";
}

function buildCompleteBody(record: Record<string, any>): string {
  const total = record.costo_total;
  if (total == null) return "Gracias por viajar con T+Plus";
  return `Total: $${Number(total).toLocaleString("es-CO")}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
    });
  } catch {
    return "";
  }
}
