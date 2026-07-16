# Special Mentions

A personal, single-page scrolling site listing friends by category, backed by Supabase, built with TanStack Start (React + TypeScript + Vite).

## Stack

- **Frontend**: React 19, TanStack Router, TanStack Start (SSR), Tailwind CSS v4, shadcn/ui (Radix UI)
- **Backend**: TanStack Start server functions (same process as the frontend — no separate server)
- **Database + Storage**: Supabase (project `zjmoeflmktpcaobuxcmm`)
- **Fonts**: Fraunces (headings), Inter (body) via Google Fonts
- **Target deployment**: Vercel

## Running locally (Replit preview)

```
PORT=5000 npm run dev
```

The workflow **Start application** handles this automatically. Requires Node.js 22+ (native WebSocket — the Supabase realtime client crashes on Node 20 during SSR dev mode).

## Required environment variables / secrets

| Name | Purpose |
|------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — server-side only, bypasses RLS |
| `ADMIN_PIN` | PIN to unlock the admin dashboard |
| `ADMIN_SESSION_SECRET` | 32+ char secret used to sign admin session tokens |

The anon/publishable key is hardcoded as a fallback in `src/integrations/supabase/client.ts` (it is safe to be public).

## Routes

- `/` — Public scrolling site: hero, five friend-category grids, count-up stat, footer
- `/admin` — PIN-gated dashboard: add/edit/delete friends, edit site settings and hero photo

## Photo upload flow

All photo uploads go through a server function (`uploadFriendPhoto` in `src/lib/admin.functions.ts`) using the service-role key — the browser never touches Supabase Storage directly. Images are resized to a 480×480 JPEG square before upload.

## User preferences

- Do not rebuild, redesign, or restructure anything without explicit approval
- Ask before adding any new package or dependency
- Ask before creating any new environment variable
- Deployment target is Vercel — do not configure Replit deployment
- Infrastructure is self-managed Supabase — do not provision Replit databases or storage
