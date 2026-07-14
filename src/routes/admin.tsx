import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, type FriendRow, type SiteSettings } from "@/lib/site-constants";
import {
  addFriend,
  checkAdminUnlocked,
  debugAdminEnv,
  deleteFriend,
  getFriendPhotoUrl,
  unlockAdmin,
  updateFriend,
  updateSiteSettings,
  uploadFriendPhoto,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Special Mentions" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  border: "1px solid #E5DDD1",
  borderRadius: 16,
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(20px)",
  fontFamily: "Inter, sans-serif",
  fontSize: 16,
  lineHeight: 1.5,
  color: "#1A1A1A",
};

const btnPrimary: React.CSSProperties = {
  padding: "12px 24px",
  border: "none",
  borderRadius: 16,
  background: "#E8823C",
  color: "#FFFFFF",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 16px",
  border: "1px solid #E5DDD1",
  borderRadius: 16,
  background: "transparent",
  color: "#1A1A1A",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
  cursor: "pointer",
};

const TOKEN_KEY = "sm_admin_token";
const getToken = () => (typeof window === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) ?? "");
const setToken = (t: string) => {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

function AdminPage() {
  const check = useServerFn(checkAdminUnlocked);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUnlocked(false);
      return;
    }
    check({ data: { token } })
      .then((r) => {
        if (!r.unlocked) setToken("");
        setUnlocked(!!r.unlocked);
      })
      .catch(() => setUnlocked(false));
  }, [check]);

  if (unlocked === null) return <div style={{ minHeight: "100svh", background: "#FAF6F0" }} />;
  if (!unlocked) return <PinGate onUnlocked={() => setUnlocked(true)} />;
  return <Dashboard onLocked={() => setUnlocked(false)} />;
}

function PinGate({ onUnlocked }: { onUnlocked: () => void }) {
  const unlock = useServerFn(unlockAdmin);
  const debug = useServerFn(debugAdminEnv);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diag, setDiag] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await unlock({ data: { pin } });
      if (r.ok && r.token) {
        setToken(r.token);
        onUnlocked();
      } else setError("Incorrect PIN");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        background: "#FAF6F0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 28, lineHeight: 1.2, textAlign: "center" }}>
          Admin access
        </h1>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          autoFocus
          style={inputStyle}
        />
        {error && <div style={{ color: "#B94A3A", fontSize: 14, lineHeight: 1.5, textAlign: "center" }}>{error}</div>}
        <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }} disabled={busy || !pin}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        <button
          type="button"
          style={btnGhost}
          onClick={async () => {
            try {
              const r = await debug();
              setDiag(JSON.stringify(r, null, 2));
            } catch (e) {
              setDiag(e instanceof Error ? e.message : "diag failed");
            }
          }}
        >
          Check env (diagnostic)
        </button>
        {diag && (
          <pre
            style={{
              fontSize: 12,
              background: "#FFF",
              border: "1px solid #E5DDD1",
              borderRadius: 12,
              padding: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {diag}
          </pre>
        )}
      </form>
    </div>
  );
}

type EditingFriend = Partial<FriendRow> & { id?: string };

function Dashboard({ onLocked }: { onLocked: () => void }) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [editing, setEditing] = useState<EditingFriend | null>(null);
  const [tab, setTab] = useState<"friends" | "settings">("friends");

  async function refresh() {
    const [f, s] = await Promise.all([
      supabase.from("friends").select("*").order("created_at", { ascending: true }),
      supabase.from("site_settings").select("*").eq("id", 1).single(),
    ]);
    setFriends((f.data ?? []) as FriendRow[]);
    setSettings((s.data ?? null) as SiteSettings | null);
  }
  useEffect(() => {
    refresh();
  }, []);

  function signOut() {
    setToken("");
    onLocked();
  }

  return (
    <div style={{ minHeight: "100svh", background: "#FAF6F0", padding: 24, fontFamily: "Inter, sans-serif" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 28, lineHeight: 1.2 }}>Admin</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...btnGhost, background: tab === "friends" ? "#FFFFFF" : "transparent" }}
              onClick={() => setTab("friends")}
            >
              Friends
            </button>
            <button
              style={{ ...btnGhost, background: tab === "settings" ? "#FFFFFF" : "transparent" }}
              onClick={() => setTab("settings")}
            >
              Site settings
            </button>
            <button style={btnGhost} onClick={signOut}>
              Lock
            </button>
          </div>
        </header>

        {tab === "friends" && (
          <FriendsTab friends={friends} editing={editing} setEditing={setEditing} refresh={refresh} />
        )}
        {tab === "settings" && settings && <SettingsTab settings={settings} refresh={refresh} />}
      </div>
    </div>
  );
}

function FriendsTab({
  friends,
  editing,
  setEditing,
  refresh,
}: {
  friends: FriendRow[];
  editing: EditingFriend | null;
  setEditing: (v: EditingFriend | null) => void;
  refresh: () => Promise<void>;
}) {
  const del = useServerFn(deleteFriend);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={btnPrimary} onClick={() => setEditing({})}>
          + Add Friend
        </button>
      </div>
      <div
        style={{
          border: "1px solid #E5DDD1",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px)",
        }}
      >
        {friends.length === 0 && (
          <div style={{ padding: 24, color: "#8A8378", textAlign: "center" }}>No friends yet.</div>
        )}
        {friends.map((f) => (
          <div
            key={f.id}
            style={{
              display: "grid",
              gridTemplateColumns: "64px 1fr auto",
              gap: 16,
              alignItems: "center",
              padding: 16,
              borderTop: "1px solid #E5DDD1",
            }}
          >
            <img
              src={f.photo_url}
              alt=""
              style={{ width: 48, height: 48, borderRadius: "9999px", objectFit: "cover" }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 20, lineHeight: 1.2 }}>
                {f.name}
              </div>
              <div style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>
                {f.category} ·{" "}
                <a
                  href={f.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#E8823C", textDecoration: "none" }}
                >
                  Instagram
                </a>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnGhost} onClick={() => setEditing(f)}>
                Edit
              </button>
              <button
                style={{ ...btnGhost, color: "#B94A3A" }}
                onClick={async () => {
                  if (!confirm(`Delete ${f.name}? This cannot be undone.`)) return;
                  await del({ data: { id: f.id, token: getToken() } });
                  await refresh();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <FriendForm
          key={editing.id ?? "new"}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function FriendForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: EditingFriend;
  onClose: () => void;
  onSaved: () => void;
}) {
  const add = useServerFn(addFriend);
  const upd = useServerFn(updateFriend);
  const uploadPhoto = useServerFn(uploadFriendPhoto);
  const getPhotoUrl = useServerFn(getFriendPhotoUrl);

  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState<string>(initial.category ?? CATEGORIES[0]);
  const [instagram, setInstagram] = useState(initial.instagram_url ?? "");
  const [quote, setQuote] = useState(initial.quote ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial.photo_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const blob = await resizeToSquare(file, 480);
      if (blob.size > 2_000_000) throw new Error("Image too large");
      const token = getToken();
      const upload = await uploadPhoto({ data: { mime: blob.type, token } });
      const { error: uploadError } = await supabase.storage
        .from("friend-photos")
        .uploadToSignedUrl(upload.path, upload.uploadToken, blob, { contentType: blob.type, upsert: false });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);
      const signed = await getPhotoUrl({ data: { path: upload.path, token } });
      setPhotoUrl(signed.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("[uploadPhoto] failed:", e);
      setError(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        name,
        category,
        instagram_url: instagram,
        quote: quote.trim() || null,
        photo_url: photoUrl,
      };
      if (initial.id) {
        await upd({ data: { id: initial.id, ...payload, token: getToken() } });
      } else {
        await add({ data: { ...payload, token: getToken() } });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,26,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 50,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#FFFFFF",
          border: "1px solid #E5DDD1",
          borderRadius: 16,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "90svh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: 28, lineHeight: 1.2 }}>
          {initial.id ? "Edit friend" : "Add friend"}
        </h2>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Photo</span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "9999px",
                overflow: "hidden",
                background: "#F2ECE0",
                flexShrink: 0,
              }}
            >
              {photoUrl && <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
              style={{ display: "none" }}
            />
            <button type="button" style={btnGhost} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : photoUrl ? "Replace" : "Upload"}
            </button>
          </div>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} required>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Instagram URL</span>
          <input
            type="url"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="https://instagram.com/username"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>
            Quote (optional) — {quote.length}/60
          </span>
          <input
            value={quote}
            maxLength={60}
            onChange={(e) => setQuote(e.target.value.slice(0, 60))}
            style={inputStyle}
          />
        </label>

        {error && <div style={{ color: "#B94A3A", fontSize: 14, lineHeight: 1.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button type="button" style={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            style={{ ...btnPrimary, opacity: busy || !photoUrl ? 0.5 : 1 }}
            disabled={busy || !photoUrl}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsTab({ settings, refresh }: { settings: SiteSettings; refresh: () => Promise<void> }) {
  const save = useServerFn(updateSiteSettings);
  const uploadPhoto = useServerFn(uploadFriendPhoto);
  const getPhotoUrl = useServerFn(getFriendPhotoUrl);
  const [heroName, setHeroName] = useState(settings.hero_name);
  const [tagline, setTagline] = useState(settings.hero_tagline);
  const [statLabel, setStatLabel] = useState(settings.stat_label);
  const [profileUrl, setProfileUrl] = useState(settings.profile_url);
  const [photoUrl, setPhotoUrl] = useState(settings.hero_photo_url ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File) {
    setUploading(true);
    try {
      setMsg("");
      const blob = await resizeToSquare(file, 640);
      if (blob.size > 2_000_000) throw new Error("Image too large");
      const token = getToken();
      const upload = await uploadPhoto({ data: { mime: blob.type, token } });
      const { error: uploadError } = await supabase.storage
        .from("friend-photos")
        .uploadToSignedUrl(upload.path, upload.uploadToken, blob, { contentType: blob.type, upsert: false });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);
      const signed = await getPhotoUrl({ data: { path: upload.path, token } });
      setPhotoUrl(signed.url);
    } catch (e) {
      setMsg(`Upload failed: ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await save({
        data: {
          hero_name: heroName,
          hero_tagline: tagline,
          hero_photo_url: photoUrl || null,
          stat_label: statLabel,
          profile_url: profileUrl,
          token: getToken(),
        },
      });
      await refresh();
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 32,
        border: "1px solid #E5DDD1",
        borderRadius: 16,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(20px)",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Hero photo</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "9999px",
              overflow: "hidden",
              background: "#F2ECE0",
            }}
          >
            {photoUrl && <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
            style={{ display: "none" }}
          />
          <button type="button" style={btnGhost} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : photoUrl ? "Replace" : "Upload"}
          </button>
        </div>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Hero name</span>
        <input value={heroName} onChange={(e) => setHeroName(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Tagline</span>
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>Stat label</span>
        <input value={statLabel} onChange={(e) => setStatLabel(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>
          "View My Profile" URL (footer link)
        </span>
        <input value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} style={inputStyle} />
      </label>

      {msg && <div style={{ fontSize: 14, color: "#8A8378", lineHeight: 1.5 }}>{msg}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

async function resizeToSquare(file: File, size: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("Image export failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
