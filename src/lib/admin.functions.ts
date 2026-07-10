import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

const sessionConfig = {
  password: (process.env.ADMIN_SESSION_SECRET ?? "dev-insecure-secret-please-set-env-variable-32chars"),
  name: "admin_session",
  maxAge: 60 * 60 * 8, // 8 hours
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  },
};

type AdminSession = { unlocked?: boolean; ts?: number };

function pinMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function requireAdmin() {
  const session = await useSession<AdminSession>(sessionConfig);
  if (!session.data.unlocked) throw new Error("Unauthorized");
  return session;
}

export const checkAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig);
  return { unlocked: !!session.data.unlocked };
});

export const verifyAdminPin = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string }) => ({ pin: String(data.pin ?? "") }))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PIN;
    if (!expected) throw new Error("ADMIN_PIN not configured");
    if (!data.pin || !pinMatches(data.pin, expected)) {
      return { ok: false as const };
    }
    const session = await useSession<AdminSession>(sessionConfig);
    await session.update({ unlocked: true, ts: Date.now() });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig);
  await session.clear();
  return { ok: true as const };
});

const CATEGORIES = [
  "Best Friend",
  "Close Female Friends",
  "Close Male Friends",
  "Just Friends",
  "Inspirational Friends",
] as const;
type Category = (typeof CATEGORIES)[number];

function validateFriendInput(d: {
  name?: string;
  category?: string;
  instagram_url?: string;
  quote?: string | null;
  photo_url?: string;
}) {
  const name = String(d.name ?? "").trim();
  const category = String(d.category ?? "") as Category;
  const instagram_url = String(d.instagram_url ?? "").trim();
  const quote = d.quote == null ? null : String(d.quote).trim().slice(0, 60) || null;
  const photo_url = String(d.photo_url ?? "").trim();
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

export const uploadFriendPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { dataUrl: string }) => ({ dataUrl: String(data.dataUrl ?? "") }))
  .handler(async ({ data }) => {
    await requireAdmin();
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
    // 100-year signed URL (private bucket, blocked from being public)
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
    await requireAdmin();
    const clean = validateFriendInput(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("friends")
      .insert(clean)
      .select()
      .single();
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
    await requireAdmin();
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
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
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
    await requireAdmin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.hero_name !== undefined) patch.hero_name = String(data.hero_name).trim();
    if (data.hero_tagline !== undefined) patch.hero_tagline = String(data.hero_tagline).trim();
    if (data.hero_photo_url !== undefined) patch.hero_photo_url = data.hero_photo_url || null;
    if (data.stat_label !== undefined) patch.stat_label = String(data.stat_label).trim();
    if (data.profile_url !== undefined) patch.profile_url = String(data.profile_url).trim();
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