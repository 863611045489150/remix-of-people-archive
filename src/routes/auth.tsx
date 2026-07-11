import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Special Mentions" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
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
  padding: "12px 24px",
  border: "1px solid #E5DDD1",
  borderRadius: 16,
  background: "transparent",
  color: "#1A1A1A",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
  cursor: "pointer",
};

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/admin" });
    });
  }, [router]);

  async function signIn() {
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else router.navigate({ to: "/admin" });
  }

  async function signUp() {
    setError("");
    setMessage("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setMessage("Check your email to confirm your account.");
  }

  async function signInWithGoogle() {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) setError(result.error.message);
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mode === "signin" ? signIn() : signUp();
        }}
        style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            fontSize: 28,
            lineHeight: 1.2,
            textAlign: "center",
          }}
        >
          Admin access
        </h1>
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error && <div style={{ color: "#B94A3A", fontSize: 14, lineHeight: 1.5 }}>{error}</div>}
        {message && <div style={{ color: "#2A6F3C", fontSize: 14, lineHeight: 1.5 }}>{message}</div>}
        <button type="submit" style={btnPrimary}>
          {mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button type="button" onClick={signInWithGoogle} style={btnGhost}>
          Continue with Google
        </button>
        <div style={{ textAlign: "center", fontSize: 14, color: "#8A8378" }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                style={{ background: "none", border: "none", color: "#E8823C", cursor: "pointer", padding: 0 }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                style={{ background: "none", border: "none", color: "#E8823C", cursor: "pointer", padding: 0 }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
        <Link
          to="/"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#8A8378",
            textAlign: "center",
            textDecoration: "none",
            opacity: 0.6,
          }}
        >
          ← Back to site
        </Link>
      </form>
    </div>
  );
}
