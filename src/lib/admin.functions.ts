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
  .inputValidator((data: { imageBase64: string; mime: string; token: string }) => ({
    imageBase64: String(data.imageBase64 ?? ""),
    mime: String(data.mime ?? ""),
    token: String(data.token ?? ""),
  }))
  .handler(async ({ data }) => {
    requireToken(data.token);
    const mime = data.mime.toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(mime)) throw new Error("Invalid image type");
    const buffer = Buffer.from(data.imageBase64, "base64");
    if (buffer.byteLength > 5_000_000) throw new Error("Image too large (max 5 MB after resize)");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("friend-photos")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      console.error("[uploadFriendPhoto] upload error:", uploadError);
      throw new Error(`upload: ${uploadError.message ?? JSON.stringify(uploadError)}`);
    }
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("friend-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 100);
    if (signError || !signed) {
      console.error("[uploadFriendPhoto] sign error:", signError);
      throw new Error(`sign: ${signError?.message ?? "Failed to sign URL"}`);
    }
    return { url: signed.signedUrl, path };
  });

export const getFriendPhotoUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { path: string; token: string }) => ({
    path: String(data.path ?? ""),
    token: String(data.token ?? ""),
  }))
  .handler(async ({ data }) => {
    requireToken(data.token);
    const path = data.path.trim();
    if (!/^[a-f0-9-]+\.(jpg|png|webp|gif|avif)$/i.test(path)) throw new Error("Invalid photo path");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("friend-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 100);
    if (sErr || !signed) {
      console.error("[uploadFriendPhoto] sign error:", sErr);
      throw new Error(`sign: ${sErr?.message ?? "Failed to sign URL"}`);
    }
    return { url: signed.signedUrl, path };
  });

// ---------------------------------------------------------------------------
// Storage cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Extract the file path (e.g. "uuid.jpg") from a Supabase signed or public URL.
 * Returns null for any URL that doesn't match the expected pattern.
 */
function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/object\/(?:sign|public)\/friend-photos\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Delete a file from the friend-photos bucket. Swallows all errors so that a
 * cleanup failure never prevents the main DB operation from completing.
 */
async function tryDeleteStorageFile(path: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("friend-photos").remove([path]);
    if (error) console.error("[tryDeleteStorageFile] remove error:", error);
  } catch (e) {
    console.error("[tryDeleteStorageFile] unexpected error for path:", path, e);
  }
}

// ---------------------------------------------------------------------------

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
    // Fetch old photo URL before overwriting so we can clean up storage
    const { data: existing } = await supabaseAdmin
      .from("friends")
      .select("photo_url")
      .eq("id", data.id)
      .single();
    const { data: row, error } = await supabaseAdmin
      .from("friends")
      .update(clean)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    // Delete old photo from storage if it was replaced
    if (existing?.photo_url && existing.photo_url !== clean.photo_url) {
      const oldPath = extractStoragePath(existing.photo_url);
      if (oldPath) await tryDeleteStorageFile(oldPath);
    }
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
    // Fetch photo URL before deletion so we can clean up storage
    const { data: existing } = await supabaseAdmin
      .from("friends")
      .select("photo_url")
      .eq("id", data.id)
      .single();
    const { error } = await supabaseAdmin.from("friends").delete().eq("id", data.id);
    if (error) throw error;
    // Delete photo from storage after record is gone
    if (existing?.photo_url) {
      const path = extractStoragePath(existing.photo_url);
      if (path) await tryDeleteStorageFile(path);
    }
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
    // Fetch old hero photo URL so we can clean up storage if it changed
    const { data: existing } = await supabaseAdmin
      .from("site_settings")
      .select("hero_photo_url")
      .eq("id", 1)
      .single();
    const { data: row, error } = await supabaseAdmin
      .from("site_settings")
      .update(patch)
      .eq("id", 1)
      .select()
      .single();
    if (error) throw error;
    // Delete old hero photo from storage if it was replaced
    const newHeroPhoto = data.hero_photo_url !== undefined ? (data.hero_photo_url || null) : undefined;
    if (
      newHeroPhoto !== undefined &&
      existing?.hero_photo_url &&
      existing.hero_photo_url !== newHeroPhoto
    ) {
      const oldPath = extractStoragePath(existing.hero_photo_url);
      if (oldPath) await tryDeleteStorageFile(oldPath);
    }
    return row;
  });
