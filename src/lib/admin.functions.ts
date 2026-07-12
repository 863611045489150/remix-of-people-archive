import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CATEGORIES = [
  "Best Friend",
  "Close Female Friends",
  "Close Male Friends",
  "Just Friends",
  "Inspirational Friends",
] as const;
type Category = (typeof CATEGORIES)[number];

const COOKIE_NAME = "sm_admin";
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

function issueSessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(exp);
  const value = `${payload}.${sign(payload)}`;
  setCookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

function clearSessionCookie() {
  setCookie(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function isUnlocked(): boolean {
  const raw = getCookie(COOKIE_NAME);
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

function requireUnlocked() {
  if (!isUnlocked()) throw new Error("Unauthorized");
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

export const checkAdminUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return { unlocked: isUnlocked() };
  } catch {
    return { unlocked: false };
  }
});

export const unlockAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string }) => ({ pin: String(d.pin ?? "") }))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PIN;
    if (!expected) throw new Error("ADMIN_PIN is not configured");
    // Blunt brute-force timing across requests.
    await new Promise((r) => setTimeout(r, 250));
    if (!data.pin || !pinMatches(data.pin, expected)) return { ok: false as const };
    issueSessionCookie();
    return { ok: true as const };
  });

export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookie();
  return { ok: true as const };
});

export const uploadFriendPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { dataUrl: string }) => ({ dataUrl: String(data.dataUrl ?? "") }))
  .handler(async ({ data }) => {
    requireUnlocked();
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
  }) => d)
  .handler(async ({ data }) => {
    requireUnlocked();
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
  }) => d)
  .handler(async ({ data }) => {
    requireUnlocked();
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
  .inputValidator((d: { id: string }) => ({ id: String(d.id ?? "") }))
  .handler(async ({ data }) => {
    requireUnlocked();
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
  }) => d)
  .handler(async ({ data }) => {
    requireUnlocked();
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
