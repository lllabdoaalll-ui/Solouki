// Solouki STEP 68 / 72+ — Read-only catalog bridge for external teacher systems.
// Returns violations, locations, AND merit categories so رصد can show the same
// dropdowns as the Solouki UI (merits.html).
//
// Deploy:
//   supabase functions deploy teacher-behavior-catalog
// Secret:
//   TEACHER_BEHAVIOR_BRIDGE_SECRET
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-solouki-bridge-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const expected = Deno.env.get("TEACHER_BEHAVIOR_BRIDGE_SECRET") || "";
    const supplied = req.headers.get("x-solouki-bridge-secret") || "";

    // Do not permit an unprotected public catalog endpoint in production.
    if (!expected || !supplied || !safeEqual(expected, supplied)) {
      return json({ ok: false, error: "invalid_bridge_secret" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: "server_configuration_error" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const [violationsRes, locationsRes, meritsRes] = await Promise.all([
      admin
        .from("violations_catalog")
        .select("id, code, description_ar, degree_id, is_active, is_custom")
        .eq("is_active", true)
        .order("degree_id")
        .order("code"),
      // violation_locations has NO `code` column — only id, name_ar, is_custom, is_active, sort_order
      admin
        .from("violation_locations")
        .select("id, name_ar, is_active, is_custom, sort_order")
        .eq("is_active", true)
        .order("sort_order")
        .order("id"),
      admin
        .from("merit_categories")
        .select("id, code, label_ar, default_points, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order")
        .order("id"),
    ]);

    if (violationsRes.error) {
      console.error("violations_catalog", violationsRes.error);
      return json({ ok: false, error: "catalog_load_failed" }, 500);
    }
    if (locationsRes.error) {
      console.error("violation_locations", locationsRes.error);
      return json({ ok: false, error: "locations_load_failed" }, 500);
    }
    // merit_categories is optional for older deployments — don't fail the whole catalog
    if (meritsRes.error) {
      console.warn("merit_categories", meritsRes.error);
    }

    // Normalize violation labels so external systems (رصد) can show Arabic titles
    // without knowing Solouki column names (description_ar / code).
    const violations = (violationsRes.data || []).map((v: Record<string, unknown>) => ({
      ...v,
      title: v.description_ar || v.code || null,
      name: v.description_ar || v.code || null,
      label: v.description_ar || v.code || null,
    }));

    const meritCategories = (meritsRes.data || []).map((c: Record<string, unknown>) => ({
      ...c,
      label: c.label_ar || c.code || null,
      title: c.label_ar || c.code || null,
      points: c.default_points != null ? Number(c.default_points) : 10,
    }));

    return json({
      ok: true,
      source: "solouki",
      read_only: true,
      violations,
      locations: locationsRes.data || [],
      merit_categories: meritCategories,
      merits: meritCategories, // alias for convenience
    });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "unexpected_error" }, 500);
  }
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}
