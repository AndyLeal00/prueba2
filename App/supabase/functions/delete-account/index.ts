import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Borrado de cuenta exigido por la Guideline 5.1.1(v) de Apple.
// ADAPTADO al esquema consolidado (aplicacioncore): anonimiza `persona` +
// `perfil_conductor`, borra documentos (documento_persona/documento_vehiculo)
// y tokens (dispositivo_push), y banea la cuenta de auth. No se borra la
// persona (los viajes ya realizados conservan valor); se anonimiza.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ACTIVE_STATES = ["NEW", "PENDING", "ACCEPTED", "ARRIVED", "STARTED", "REACHED", "PAID"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return jsonResponse({ error: "Credenciales de Supabase no configuradas" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Falta el token de sesion" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const jwt = authHeader.slice("Bearer ".length).trim();
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Sesion invalida", detalle: userError?.message ?? "sin usuario" }, 401);
  }
  const authId = userData.user.id;

  // 1. Localizar la persona
  const { data: persona, error: pErr } = await admin
    .from("persona")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();
  if (pErr) return jsonResponse({ error: `No se pudo leer el perfil: ${pErr.message}` }, 500);

  const pid = persona?.id as string | undefined;

  // 2. Bloquear si hay un viaje activo (como cliente o conductor)
  if (pid) {
    const { data: enCurso } = await admin
      .from("reserva")
      .select("id")
      .or(`id_cliente.eq.${pid},id_conductor.eq.${pid}`)
      .in("estado", ACTIVE_STATES)
      .limit(1);
    if (enCurso && enCurso.length > 0) {
      return jsonResponse(
        { error: "VIAJE_ACTIVO", message: "Tienes un viaje en curso. Finalizalo antes de eliminar tu cuenta." },
        409,
      );
    }
  }

  // 3. Anonimizar + borrar PII
  if (pid) {
    const sufijo = authId.slice(0, 8);

    const { error: upErr } = await admin
      .from("persona")
      .update({
        nombre: "Usuario",
        apellido: "eliminado",
        email: `eliminado+${sufijo}@invalid.local`,
        telefono: `eliminado-${sufijo}`,
        imagen_perfil: null,
        numero_documento: null,
        id_tipo_documento: null,
        id_ciudad_actual: null,
        id_ciudad_origen: null,
        codigo_referido_usado: null,
        ultima_lat: null,
        ultima_lng: null,
        bloqueado: true,
        verificado: false,
      })
      .eq("id", pid);
    if (upErr) return jsonResponse({ error: `No se pudo anonimizar: ${upErr.message}` }, 500);

    // Perfil de conductor (si aplica)
    await admin.from("perfil_conductor").update({
      aprobado: false, en_servicio: false, activo: false,
      numero_licencia: null, numero_cuenta_bancaria: null,
    }).eq("id_persona", pid);

    // Documentos (contienen rutas de imágenes = PII)
    await admin.from("documento_persona").delete().eq("id_persona", pid);
    const { data: vehs } = await admin.from("vehiculo").select("id").eq("id_conductor", pid);
    const vehIds = (vehs ?? []).map((v: { id: string }) => v.id);
    if (vehIds.length > 0) {
      await admin.from("documento_vehiculo").delete().in("id_vehiculo", vehIds);
    }

    // Tokens push
    await admin.from("dispositivo_push").delete().eq("id_persona", pid);
  }

  // 4. Inutilizar el acceso (ban, sin deleteUser para no romper FKs/historial)
  const sufijo = authId.slice(0, 8);
  const { error: banError } = await admin.auth.admin.updateUserById(authId, {
    email: `eliminado+${sufijo}@invalid.local`,
    password: crypto.randomUUID() + crypto.randomUUID(),
    ban_duration: "876000h",
    user_metadata: { deleted_at: new Date().toISOString() },
  });
  if (banError) {
    return jsonResponse({ error: `Perfil anonimizado, pero no se pudo cerrar el acceso: ${banError.message}` }, 500);
  }

  await admin.auth.admin.signOut(authId).catch(() => {});
  return jsonResponse({ ok: true, message: "Cuenta eliminada" });
});
