import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/roles";

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

export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!isAdmin };
  });

export const bootstrapAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin) return { ok: true, wasBootstrapped: false };
    const { data: bootstrapped, error } = await context.supabase.rpc("bootstrap_first_admin");
    if (error) throw error;
    return { ok: !!bootstrapped, wasBootstrapped: !!bootstrapped };
  });

export const uploadFriendPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { dataUrl: string }) => ({ dataUrl: String(data.dataUrl ?? "") }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const mime = match[1];
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 2_000_000) throw new Error("Image too large");
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await context.supabase.storage
      .from("friend-photos")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("friend-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 100);
    if (sErr || !signed) throw sErr ?? new Error("Failed to sign URL");
    return { url: signed.signedUrl, path };
  });

export const addFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    category: string;
    instagram_url: string;
    quote?: string | null;
    photo_url: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const clean = validateFriendInput(data);
    const { data: row, error } = await context.supabase.from("friends").insert(clean).select().single();
    if (error) throw error;
    return row;
  });

export const updateFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    name: string;
    category: string;
    instagram_url: string;
    quote?: string | null;
    photo_url: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const clean = validateFriendInput(data);
    const { data: row, error } = await context.supabase
      .from("friends")
      .update(clean)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("friends").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    hero_name?: string;
    hero_tagline?: string;
    hero_photo_url?: string | null;
    stat_label?: string;
    profile_url?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: {
      hero_name?: string;
      hero_tagline?: string;
      hero_photo_url?: string | null;
      stat_label?: string;
      profile_url?: string;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (data.hero_name !== undefined) patch.hero_name = String(data.hero_name).trim();
    if (data.hero_tagline !== undefined) patch.hero_tagline = String(data.hero_tagline).trim();
    if (data.hero_photo_url !== undefined) patch.hero_photo_url = data.hero_photo_url || null;
    if (data.stat_label !== undefined) patch.stat_label = String(data.stat_label).trim();
    if (data.profile_url !== undefined) patch.profile_url = String(data.profile_url).trim();
    const { data: row, error } = await context.supabase
      .from("site_settings")
      .update(patch)
      .eq("id", 1)
      .select()
      .single();
    if (error) throw error;
    return row;
  });
