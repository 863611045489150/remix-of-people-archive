import { createServerFn } from "@tanstack/react-start";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CATEGORIES = [
  "Best Friend",
  "Close Female Friends",
  "Close Male Friends",
  "Just Friends",
  "Inspirational Friends",
] as const;
type Category = (typeof CATEGORIES)[number];

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function sessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be set to a 32+ character random value");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function issueToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(exp);
  return `${payload}.${sign(payload)}`;
}

function isTokenValid(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = raw.slice(0, idx);
  const provided = raw.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return true;
}

function requireToken(token: string | undefined) {
  if (!isTokenValid(token)) throw new Error("Unauthorized");
}

function pinMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function validateFriendInput(d: {
  name?: string;
  category?: string;
  instagram_url?: string;
  quote?: string | null;
  photo_url?: string;
}) {
  const name = String(d.name ?? "").trim().slice(0, 100);
  const category = String(d.category ?? "") as Category;
  const instagram_url = String(d.instagram_url ?? "").trim().slice(0, 500);
  const quote = d.quote == null ? null : String(d.quote).trim().slice(0, 60) || null;
  const photo_url = String(d.photo_url ?? "").trim().slice(0, 1000);
  if (!name) throw new Error("Name required");
  if (!CATEGORIES.includes(category)) throw new Error("Invalid category");
  if (!instagram_url) throw new Error("Instagram URL required");
  try {
    new URL(instagram_url);
  } catch {
    throw new Error("Instagram URL is not a valid URL");
  }
  if (!photo_url) throw new Error("Photo required");
  return { name, category, instagram_url, quote, photo_url };
}

export const checkAdminUnlocked = createServerFn({ method: "POST" })
  .inputValidator((d: { token?: string }) => ({ token: d?.token ? String(d.token) : "" }))
  .handler(async ({ data }) => {
    try {
      return { unlocked: isTokenValid(data.token) };
    } catch {
      return { unlocked: false };
    }
  });

// TEMPORARY DIAGNOSTIC — safe: returns booleans only, never values.
// Remove once the Vercel env-var visibility issue is confirmed and fixed.
export const debugAdminEnv = createServerFn({ method: "GET" }).handler(async () => {
  return {
    hasAdminPin: !!process.env.ADMIN_PIN,
    adminPinLength: process.env.ADMIN_PIN ? process.env.ADMIN_PIN.length : 0,
    hasSessionSecret: !!process.env.ADMIN_SESSION_SECRET,
    sessionSecretLength: process.env.ADMIN_SESSION_SECRET ? process.env.ADMIN_SESSION_SECRET.length : 0,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabasePublishableKey: !!process.env.SUPABASE_PUBLISHABLE_KEY,
    hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    processEnvKeyCount: Object.keys(process.env ?? {}).length,
    runtimeUA: typeof navigator !== "undefined" ? String(navigator.userAgent).slice(0, 80) : "no-navigator",
    isVercel: !!process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  };
});

export const unlockAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string }) => ({ pin: String(d.pin ?? "") }))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PIN;
    if (!expected) throw new Error("ADMIN_PIN is not configured");
    await new Promise((r) => setTimeout(r, 250));
    if (!data.pin || !pinMatches(data.pin, expected)) return { ok: false as const, token: "" };
    return { ok: true as const, token: issueToken() };
  });

export const uploadFriendPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { dataUrl: string; token: string }) => ({
    dataUrl: String(data.dataUrl ?? ""),
    token: String(data.token ?? ""),
  }))
  .handler(async ({ data }) => {
    requireToken(data.token);
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const mime = match[1];
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 2_000_000) throw new Error("Image too large");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("friend-photos")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("friend-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 100);
    if (sErr || !signed) throw sErr ?? new Error("Failed to sign URL");
    return { url: signed.signedUrl, path };
  });

export const addFriend = createServerFn({ method: "POST" })
  .inputValidator((d: {
    name: string;
    category: string;
    instagram_url: string;
    quote?: string | null;
    photo_url: string;
    token: string;
  }) => d)
  .handler(async ({ data }) => {
    requireToken(data.token);
    const clean = validateFriendInput(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("friends").insert(clean).select().single();
    if (error) throw error;
    return row;
  });

export const updateFriend = createServerFn({ method: "POST" })
  .inputValidator((d: {
    id: string;
    name: string;
    category: string;
    instagram_url: string;
    quote?: string | null;
    photo_url: string;
    token: string;
  }) => d)
  .handler(async ({ data }) => {
    requireToken(data.token);
    const clean = validateFriendInput(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("friends")
      .update(clean)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; token: string }) => ({
    id: String(d.id ?? ""),
    token: String(d.token ?? ""),
  }))
  .handler(async ({ data }) => {
    requireToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("friends").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const updateSiteSettings = createServerFn({ method: "POST" })
  .inputValidator((d: {
    hero_name?: string;
    hero_tagline?: string;
    hero_photo_url?: string | null;
    stat_label?: string;
    profile_url?: string;
    token: string;
  }) => d)
  .handler(async ({ data }) => {
    requireToken(data.token);
    const patch: {
      hero_name?: string;
      hero_tagline?: string;
      hero_photo_url?: string | null;
      stat_label?: string;
      profile_url?: string;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (data.hero_name !== undefined) patch.hero_name = String(data.hero_name).trim().slice(0, 200);
    if (data.hero_tagline !== undefined) patch.hero_tagline = String(data.hero_tagline).trim().slice(0, 300);
    if (data.hero_photo_url !== undefined) patch.hero_photo_url = data.hero_photo_url || null;
    if (data.stat_label !== undefined) patch.stat_label = String(data.stat_label).trim().slice(0, 100);
    if (data.profile_url !== undefined) patch.profile_url = String(data.profile_url).trim().slice(0, 500);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("site_settings")
      .update(patch)
      .eq("id", 1)
      .select()
      .single();
    if (error) throw error;
    return row;
  });
