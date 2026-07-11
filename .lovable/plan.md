Make the app deployable on Vercel (or any non-Lovable host) without needing the hidden `SUPABASE_SERVICE_ROLE_KEY`, while keeping admin access secure.

## Problem
Right now the admin panel uses a PIN plus the Supabase service role key (`supabaseAdmin`). Lovable Cloud does not expose that key, so admin features break on Vercel. The public site works fine with only `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`, but uploads, edits, and settings changes fail.

## Solution
Replace the PIN/session gate with Lovable Cloud authentication, then enforce admin rights through RLS instead of the service role key. Server functions will run as the signed-in admin user, so the only Vercel env vars needed are the public Supabase ones.

## What will change

### 1. Database schema & RLS (new migration)
- Create `public.app_role` enum and `public.user_roles` table.
- Add a `public.has_role(_user_id uuid, _role app_role)` security-definer function.
- Grant `authenticated` SELECT on `user_roles`, `service_role` ALL on `user_roles`.
- Update `public.friends` and `public.site_settings` RLS policies:
  - Keep `anon`/`authenticated` SELECT for public reads.
  - Add `authenticated` INSERT/UPDATE/DELETE for admin users using `public.has_role(auth.uid(), 'admin')`.
  - Keep `service_role` grants for future flexibility, but admin code will stop using them.
- Update storage policies on `friend-photos`:
  - Keep `SELECT` public for signed URL reads.
  - Add `INSERT`/`UPDATE`/`DELETE` for authenticated admin users.

### 2. Admin functions (`src/lib/admin.functions.ts`)
- Replace `requireAdmin()` (PIN/session check) with `.middleware([requireSupabaseAuth])` plus a role check via `has_role(context.userId, 'admin')`.
- Replace every `supabaseAdmin` call with `context.supabase`:
  - `uploadFriendPhoto` — upload using the authenticated client, then create a signed URL for the stored path (still long-lived for normal browsing).
  - `addFriend`, `updateFriend`, `deleteFriend`, `updateSiteSettings` — perform CRUD through the authenticated client; RLS now enforces the admin role.
- Remove PIN session functions (`verifyAdminPin`, `checkAdminSession`, `adminLogout`) and the `ADMIN_PIN`/`ADMIN_SESSION_SECRET` dependency.

### 3. Admin UI (`src/routes/admin.tsx`)
- Replace the PIN gate with a Lovable Cloud sign-in button (Google + email/password by default).
- Add a sign-out button that calls `supabase.auth.signOut()`.
- After sign-in, refresh the page / call `router.invalidate()` so the admin server functions receive the bearer token.
- Keep the existing friends/settings forms; only the auth entry point changes.

### 4. Route & middleware
- Move `/admin` under the authenticated layout (`src/routes/_authenticated/admin.tsx`) OR keep it public and gate via `requireSupabaseAuth` inside server functions. The safer pattern is to use the integration-managed `src/routes/_authenticated/route.tsx` so unauthenticated users are redirected to `/auth` before the admin UI renders.
- Confirm `src/start.ts` already registers `attachSupabaseAuth` in `functionMiddleware`; it does, so no change there.

### 5. Environment variables on Vercel
Required:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

No longer needed (will be removed from code):
- `ADMIN_PIN`
- `ADMIN_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` for admin flows (still never exposed; only used if you later add edge functions or admin maintenance that truly need it).

## Trade-off
This turns admin access into a real user account. You will sign in to `/admin` with email/password or Google instead of typing a PIN. One Lovable Cloud user must be granted the `admin` role in the `user_roles` table after first signing up.

## Security posture
- No service role key in the deployment.
- Admin actions protected by Supabase JWT + RLS.
- Photo storage remains private; public reads only through signed URLs or storage policy.
- Admin route stays `noindex` in `head()` and `robots.txt` already blocks `/admin`.

## Seeding the first admin
After deploying, the first sign-in creates the user. I will add a one-time seed migration or a secure server function that grants the `admin` role to the first user who signs up (or to a specific email you control).