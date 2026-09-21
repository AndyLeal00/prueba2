import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// recordCallEvent — registra el evento de una llamada VoIP.
// ADAPTADO al esquema consolidado: actualiza el estado en `notificacion_llamada`
// (la vieja `call_notifications`). Resuelve customerId/driverId tanto si vienen
// como persona.id como auth.users.id.
//
// Body: { driverId, customerId, event: 'started'|'ended'|'failed'|'declined',
//         duration?, reason? }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// started (llamada aceptada/iniciada), ended, failed (perdida), declined
const EVENT_TO_ESTADO: Record<string, string> = {
  started: "accepted",
  ended: "ended",
  failed: "missed",
  declined: "declined",
};

async function resolverPersona(id: string): Promise<string | null> {
  const { data } = await supabase
    .from("persona")
    .select("id")
    .or(`id.eq.${id},auth_id.eq.${id}`)
    .maybeSingle();
  return data?.id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { driverId, customerId, event } = await req.json();
    if (!driverId || !customerId || !event) {
      return new Response(JSON.stringify({ error: "driverId, customerId y event son requeridos" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const idCliente = await resolverPersona(customerId);
    const idConductor = await resolverPersona(driverId);
    const estado = EVENT_TO_ESTADO[String(event)] ?? String(event);

    // Actualiza la llamada más reciente entre ese cliente y ese conductor.
    const { data: fila } = await supabase
      .from("notificacion_llamada")
      .select("id")
      .eq("id_cliente", idCliente)
      .eq("id_conductor", idConductor)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fila?.id) {
      await supabase.from("notificacion_llamada").update({ estado }).eq("id", fila.id);
    } else {
      // No había registro previo (p.ej. llamada iniciada sin notifyIncomingCall): crear uno.
      await supabase.from("notificacion_llamada").insert({
        id_cliente: idCliente, id_conductor: idConductor, canal: "", estado,
      });
    }

    return new Response(JSON.stringify({ success: true, estado }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ [recordCallEvent] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
