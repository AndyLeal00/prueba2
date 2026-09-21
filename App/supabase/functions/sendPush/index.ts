// sendPush — envía notificaciones push al Expo Push Service.
// ADAPTADO al esquema consolidado (aplicacioncore):
//   - tokens desde `dispositivo_push` (multi-dispositivo por persona), no `users.push_token`
//   - auditoría en `evento_notificacion` (id_persona, tipo_evento, id_reserva, ...)
//
// Contrato (sin cambios para el llamador):
//   POST /functions/v1/sendPush
//   Body: { user_ids: string[]  // = persona.id
//           title, body, data?, sound?, channelId? }
//   Response: { sent, failed, cleaned, skipped }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

const EXPO_BATCH_SIZE = 100;
const INTER_BATCH_DELAY_MS = 500;

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

interface SendPushBody {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "horn" | "notifi" | "default";
  channelId?: string;
}

// Fila de dispositivo_push (un token por dispositivo; una persona puede tener varios).
interface DeviceRow {
  id_persona: string;
  push_token: string | null;
  plataforma: string | null;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Función mal configurada: faltan SUPABASE_URL / SERVICE_ROLE" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Falta header Authorization" }, 401);
  }

  let payload: SendPushBody;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido (JSON esperado)" }, 400);
  }

  const { user_ids, title, body, data, sound, channelId } = payload;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return json({ error: "user_ids debe ser array no vacío" }, 400);
  }
  if (!title || !body) {
    return json({ error: "title y body son requeridos" }, 400);
  }

  // 1. Traer TODOS los dispositivos (tokens) de esas personas
  const { data: devices, error: devErr } = await admin
    .from("dispositivo_push")
    .select("id_persona, push_token, plataforma")
    .in("id_persona", user_ids)
    .not("push_token", "is", null);

  if (devErr) {
    console.error("[sendPush] dispositivo_push query failed:", devErr);
    return json({ error: "No se pudieron cargar los tokens" }, 500);
  }

  const eligible = (devices || []).filter((d: DeviceRow) =>
    typeof d.push_token === "string" && d.push_token.startsWith("ExponentPushToken[")
  );

  const usersWithDevice = new Set(eligible.map((d: DeviceRow) => d.id_persona));
  const skippedIds = user_ids.filter((id) => !usersWithDevice.has(id));

  if (eligible.length === 0) {
    await recordSkipped(skippedIds, data, title, body);
    return json({ sent: 0, failed: 0, cleaned: 0, skipped: skippedIds.length });
  }

  const soundValue =
    sound === "horn" ? "horn.wav" : sound === "notifi" ? "notifi.mpeg" : "default";

  // Un mensaje por DISPOSITIVO
  const messages = eligible.map((d: DeviceRow) => ({
    to: d.push_token,
    title,
    body,
    data: data ?? {},
    sound: soundValue,
    channelId,
    priority: "high" as const,
    _userId: d.id_persona,
    _token: d.push_token as string,
  }));

  const chunks = chunk(messages, EXPO_BATCH_SIZE);
  const allTickets: Array<{ userId: string; token: string; ticket: ExpoTicket }> = [];
  let failedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const wireBody = c.map(({ _userId, _token, ...rest }) => rest);
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(wireBody),
      });
      const jsonRes = await res.json();
      const tickets: ExpoTicket[] = jsonRes?.data ?? [];
      c.forEach((msg, idx) => {
        const ticket = tickets[idx] ?? { status: "error", message: "sin ticket" };
        allTickets.push({ userId: msg._userId, token: msg._token, ticket });
        if (ticket.status === "error") failedCount++;
      });
    } catch (err) {
      console.error("[sendPush] chunk failed:", err);
      c.forEach((msg) => {
        allTickets.push({ userId: msg._userId, token: msg._token, ticket: { status: "error", message: String(err) } });
        failedCount++;
      });
    }
    if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
  }

  // 3. Cleanup: borrar los dispositivos cuyo token quedó DeviceNotRegistered
  const tokensToClean = allTickets
    .filter((t) => t.ticket.status === "error" && t.ticket.details?.error === "DeviceNotRegistered")
    .map((t) => t.token);

  let cleanedCount = 0;
  if (tokensToClean.length > 0) {
    const { error: cleanErr, count } = await admin
      .from("dispositivo_push")
      .delete()
      .in("push_token", tokensToClean);
    if (cleanErr) console.error("[sendPush] cleanup failed:", cleanErr);
    else cleanedCount = count ?? tokensToClean.length;
  }

  // 4. Auditoría en evento_notificacion
  const eventType = String(data?.type ?? "unknown");
  const bookingId = (data?.bookingId ?? data?.booking_id ?? data?.id_reserva ?? null) as string | null;

  const auditRows = allTickets.map((t) => ({
    id_persona: t.userId,
    tipo_evento: eventType,
    id_reserva: bookingId,
    titulo: title,
    cuerpo: body,
    estado:
      t.ticket.status === "ok" ? "sent"
      : t.ticket.details?.error === "DeviceNotRegistered" ? "not_registered"
      : "failed",
    expo_receipt_id: t.ticket.id ?? null,
    mensaje_error:
      t.ticket.status === "error"
        ? (t.ticket.message ?? t.ticket.details?.error ?? "unknown error")
        : null,
  }));

  if (auditRows.length > 0) {
    const { error: auditErr } = await admin.from("evento_notificacion").insert(auditRows);
    if (auditErr) console.warn("[sendPush] audit insert failed:", auditErr);
  }

  if (skippedIds.length > 0) await recordSkipped(skippedIds, data, title, body);

  const okCount = allTickets.filter((t) => t.ticket.status === "ok").length;
  return json({ sent: okCount, failed: failedCount, cleaned: cleanedCount, skipped: skippedIds.length });
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function recordSkipped(
  userIds: string[],
  data?: Record<string, unknown>,
  title?: string,
  body?: string,
) {
  if (userIds.length === 0) return;
  const eventType = String(data?.type ?? "unknown");
  const bookingId = (data?.bookingId ?? data?.booking_id ?? data?.id_reserva ?? null) as string | null;
  try {
    await admin.from("evento_notificacion").insert(
      userIds.map((id) => ({
        id_persona: id,
        tipo_evento: eventType,
        id_reserva: bookingId,
        titulo: title ?? null,
        cuerpo: body ?? null,
        estado: "skipped",
        mensaje_error: "persona sin push_token válido",
      })),
    );
  } catch (e) {
    console.warn("[sendPush] audit skipped failed:", e);
  }
}
