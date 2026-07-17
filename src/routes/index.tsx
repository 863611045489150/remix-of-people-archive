import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, type FriendRow, type SiteSettings } from "@/lib/site-constants";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/")({
  component: Index,
});

function useReveal<T extends HTMLElement>(delayMs = 0) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const t = window.setTimeout(() => setShown(true), delayMs);
            io.disconnect();
            return () => window.clearTimeout(t);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delayMs]);
  return { ref, shown };
}

function Index() {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [f, s] = await Promise.all([
        supabase
          .from("friends")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("site_settings").select("*").eq("id", 1).single(),
      ]);
      if (cancelled) return;
      setFriends((f.data ?? []) as FriendRow[]);
      setSettings((s.data ?? null) as SiteSettings | null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, FriendRow[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const f of friends) map.get(f.category)?.push(f);
    return map;
  }, [friends]);

  return (
    <div style={{ backgroundColor: "#FAF6F0", color: "#1A1A1A", fontFamily: "Inter, sans-serif" }}>
      <Hero settings={settings} loaded={loaded} />
      {CATEGORIES.map((cat) => (
        <CategorySection key={cat} label={cat} items={grouped.get(cat) ?? []} />
      ))}
      <StatBlock count={friends.length} label={settings?.stat_label ?? "People Who Made the Cut"} />
      <Footer profileUrl={settings?.profile_url ?? "#"} />
    </div>
  );
}

function Hero({ settings, loaded }: { settings: SiteSettings | null; loaded: boolean }) {
  const name = settings?.hero_name ?? "Aarush's special mentions";
  const tagline = settings?.hero_tagline ?? "Not everyone stays close. These did.";
  const photo = settings?.hero_photo_url;

  return (
    <section
      style={{
        height: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "10svh",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "clamp(240px, 40vw, 320px)",
          aspectRatio: "1 / 1",
          borderRadius: "9999px",
          position: "relative",
          overflow: "hidden",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 600ms ease-out, transform 600ms ease-out",
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "saturate(0.88)",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#F2ECE0",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#E8823C",
            opacity: 0.12,
            mixBlendMode: "soft-light",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at center, rgba(250,246,240,0) 60%, #FAF6F0 100%)",
            pointerEvents: "none",
          }}
        />
      </div>

      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 600,
          fontSize: "clamp(40px, 6vw, 56px)",
          lineHeight: 1.2,
          color: "#1A1A1A",
          textAlign: "center",
          marginTop: 24,
          maxWidth: 720,
          padding: "0 24px",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 600ms ease-out 100ms, transform 600ms ease-out 100ms",
        }}
      >
        {name}
      </h1>

      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 400,
          fontSize: 16,
          lineHeight: 1.5,
          color: "#8A8378",
          textAlign: "center",
          maxWidth: 320,
          marginTop: 8,
          padding: "0 24px",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 600ms ease-out 200ms, transform 600ms ease-out 200ms",
        }}
      >
        {tagline}
      </p>

      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          width: 1,
          height: 32,
          backgroundColor: "#E8823C",
          animation: "scrollPulse 2s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes scrollPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </section>
  );
}

function CategorySection({ label, items }: { label: string; items: FriendRow[] }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const isMobile = useIsMobile();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!isMobile) return;
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const cards = Array.from(
        el.querySelectorAll<HTMLElement>("[data-friend-card]"),
      );
      if (cards.length === 0) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((c, i) => {
        const cc = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(cc - center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setActiveIdx(best);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    compute();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isMobile, items.length]);

  const scrollByCard = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const cards = Array.from(
      el.querySelectorAll<HTMLElement>("[data-friend-card]"),
    );
    if (cards.length === 0) return;
    const next = Math.max(0, Math.min(cards.length - 1, activeIdx + dir));
    const target = cards[next];
    const left =
      target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
    el.scrollTo({ left, behavior: "smooth" });
  };

  return (
    <section style={{ paddingLeft: 24, paddingRight: 24, marginTop: 96 }} className="lg-pad">
      <div
        ref={ref}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 500ms ease-out, transform 500ms ease-out",
        }}
      >
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 400,
            fontSize: 28,
            lineHeight: 1.2,
            color: "#1A1A1A",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </h2>
        <div style={{ flex: 1, height: 1, backgroundColor: "#E5DDD1" }} />
      </div>

      {items.length === 0 ? (
        <p
          style={{
            marginTop: 48,
            fontFamily: "Inter, sans-serif",
            fontStyle: "italic",
            fontSize: 14,
            lineHeight: 1.5,
            color: "#8A8378",
          }}
        >
          No one here yet.
        </p>
      ) : isMobile ? (
        <div style={{ position: "relative", marginTop: 32, marginLeft: -24, marginRight: -24 }}>
          <div
            ref={scrollerRef}
            className="mobile-scroller"
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              paddingLeft: "18%",
              paddingRight: "18%",
              paddingTop: 24,
              paddingBottom: 24,
            }}
          >
            {items.map((f, i) => (
              <div
                key={f.id}
                data-friend-card
                style={{
                  flex: "0 0 64%",
                  scrollSnapAlign: "center",
                  transform: i === activeIdx ? "scale(1)" : "scale(0.88)",
                  opacity: i === activeIdx ? 1 : 0.55,
                  transition:
                    "transform 300ms ease, opacity 300ms ease",
                  transformOrigin: "center center",
                  display: "flex",
                }}
              >
                <FriendCard friend={f} index={i} />
              </div>
            ))}
          </div>
          <button
            aria-label="Scroll left"
            onClick={() => scrollByCard(-1)}
            className="snap-arrow"
            style={{ left: 6, opacity: activeIdx === 0 ? 0.35 : 1 }}
            disabled={activeIdx === 0}
          >
            ‹
          </button>
          <button
            aria-label="Scroll right"
            onClick={() => scrollByCard(1)}
            className="snap-arrow"
            style={{
              right: 6,
              opacity: activeIdx === items.length - 1 ? 0.35 : 1,
            }}
            disabled={activeIdx === items.length - 1}
          >
            ›
          </button>
        </div>
      ) : (
        <div
          style={{
            marginTop: 48,
            display: "grid",
            gap: 24,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {items.map((f, i) => (
            <FriendCard key={f.id} friend={f} index={i} />
          ))}
        </div>
      )}

      <style>{`
        @media (min-width: 768px) {
          section.lg-pad { padding-left: 48px; padding-right: 48px; }
          .snap-arrow { display: none !important; }
        }
        .mobile-scroller::-webkit-scrollbar { display: none; }
        .snap-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 9999px;
          border: 1px solid #E5DDD1;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(8px);
          color: #1A1A1A;
          font-size: 24px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          z-index: 2;
        }
      `}</style>
    </section>
  );
}

function FriendCard({ friend, index }: { friend: FriendRow; index: number }) {
  const { ref, shown } = useReveal<HTMLAnchorElement>(index * 80);
  const [hover, setHover] = useState(false);
  return (
    <a
      ref={ref}
      href={friend.instagram_url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block",
        padding: 24,
        borderRadius: 16,
        border: "1px solid #E5DDD1",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(20px)",
        boxShadow: hover
          ? "0 8px 24px rgba(0,0,0,0.10)"
          : "0 2px 8px rgba(0,0,0,0.06)",
        textAlign: "center",
        textDecoration: "none",
        color: "inherit",
        transform: shown ? (hover ? "translateY(-3px)" : "translateY(0)") : "translateY(16px)",
        opacity: shown ? 1 : 0,
        transition:
          "opacity 500ms ease-out, transform 200ms ease-out, box-shadow 200ms ease-out",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "9999px",
          overflow: "hidden",
          margin: "16px auto 0",
          backgroundColor: "#F2ECE0",
        }}
      >
        <img
          src={friend.photo_url}
          alt={friend.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 500,
          fontSize: 20,
          lineHeight: 1.2,
          color: "#1A1A1A",
          marginTop: 16,
          overflowWrap: "break-word",
        }}
      >
        {friend.name}
      </div>
      {friend.quote && friend.quote.trim() && (
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 14,
            lineHeight: 1.5,
            color: "#8A8378",
            marginTop: 8,
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            overflowWrap: "break-word",
          }}
        >
          “{friend.quote}”
        </div>
      )}
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          lineHeight: 1.5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#E8823C",
          opacity: hover ? 1 : 0.7,
          textDecoration: hover ? "underline" : "none",
          marginTop: 16,
          transition: "opacity 200ms ease",
        }}
      >
        View Profile →
      </div>
    </a>
  );
}

function StatBlock({ count, label }: { count: number; label: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!shown || count <= 0) {
      setDisplay(count);
      return;
    }
    const start = Math.floor(count * 0.65);
    const end = count;
    const duration = 1000;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, count]);

  return (
    <section
      ref={ref}
      style={{
        marginTop: 96,
        paddingLeft: 24,
        paddingRight: 24,
        textAlign: "center",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 300,
          fontSize: 56,
          lineHeight: 1.2,
          color: "#1A1A1A",
        }}
      >
        {display}
      </div>
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          lineHeight: 1.5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#8A8378",
          marginTop: 16,
        }}
      >
        {label}
      </div>
    </section>
  );
}

function Footer({ profileUrl }: { profileUrl: string }) {
  const [hover, setHover] = useState(false);
  return (
    <footer
      style={{
        marginTop: 96,
        paddingTop: 64,
        paddingBottom: 64,
        paddingLeft: 24,
        paddingRight: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 48,
      }}
    >
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          lineHeight: 1.5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#E8823C",
          opacity: hover ? 1 : 0.7,
          textDecoration: hover ? "underline" : "none",
          transition: "opacity 200ms ease",
        }}
      >
        View My Profile
      </a>

      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          lineHeight: 1.5,
          color: "#8A8378",
        }}
      >
        <span style={{ opacity: 0.6 }}>Crafted by AGX Studios</span>
        <a
          href="/admin"
          style={{
            color: "#8A8378",
            opacity: 0.4,
            textDecoration: "none",
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Access
        </a>
      </div>
    </footer>
  );
}
