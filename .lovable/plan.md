
## Goal
Fix only the "ADMIN_PIN is not configured" error on the Vercel deployment. No UI changes, no auth redesign.

## Root cause (to confirm)
The project builds with the Cloudflare Workers Nitro preset (default from `@lovable.dev/vite-tanstack-config`). Deployed on Vercel, that output doesn't wire Vercel's dashboard Environment Variables into `process.env` at request time, so `process.env.ADMIN_PIN` is `undefined` inside `unlockAdmin` even though the variable exists in the Vercel project.

## Step 1 — Confirm (one small, temporary diagnostic)
Add a **temporary, read-only** server function `debugAdminEnv` in `src/lib/admin.functions.ts` that returns:
- `hasAdminPin: boolean` (just `!!process.env.ADMIN_PIN`, never the value)
- `hasSessionSecret: boolean`
- `runtime: string` (e.g. `typeof navigator !== "undefined" && navigator.userAgent` — tells us if it's running on Workers vs Node)

Wire it to a temporary button on `/admin` (or just call it from the browser console). This proves whether the runtime sees the vars. No values are ever exposed.

Delete this diagnostic in Step 3 once confirmed.

## Step 2 — Fix (based on Step 1 result)

### If `hasAdminPin` is `false` (expected result — confirms the preset mismatch)
Switch the deployed build to a Vercel-native target so Vercel's env vars land in `process.env`:

- Update `vite.config.ts` to pass Nitro a Vercel preset when building for Vercel, e.g.:
  ```ts
  export default defineConfig({
    tanstackStart: { server: { entry: "server" } },
    vite: {
      // Nitro reads NITRO_PRESET at build time
    },
  });
  ```
  and set `NITRO_PRESET=vercel` in Vercel → Project → Settings → Environment Variables (build-time). No code path changes; `process.env.ADMIN_PIN` will resolve at runtime under Vercel's Node runtime.
- If `@lovable.dev/vite-tanstack-config` hard-codes `cloudflare` and doesn't honor `NITRO_PRESET`, add a minimal `nitro` override in `vite.config.ts` (via the `nitro` option that plugin exposes) to set `preset: "vercel"` when `process.env.VERCEL` is truthy.

No other files change. `admin.functions.ts` already reads env inside the handler correctly.

### If `hasAdminPin` is `true` (unexpected)
Then the vars *are* reaching the runtime and something else is stripping them. In that case I'd narrow to whether the Vite build is inlining `process.env.ADMIN_PIN` as `undefined` at build time (a define/replace step) and pin the fix there. I won't guess this branch until Step 1 rules it in.

## Step 3 — Cleanup
Remove `debugAdminEnv` and the temporary UI hook. Nothing else touched.

## Files that will change
1. `src/lib/admin.functions.ts` — add then remove the diagnostic export. Final diff = zero net change.
2. `src/routes/admin.tsx` — add then remove a temporary "Check env" button. Final diff = zero net change.
3. `vite.config.ts` — one small edit to select the Vercel Nitro preset when deploying to Vercel. This is the actual persistent fix.

Explicitly **not** touched: PIN flow, session token logic, RLS, Supabase clients, admin UI layout, `.lovable/plan.md`, any migration.

## Approval needed
Please confirm you want me to proceed with Step 1 (the temporary diagnostic) so I can verify the root cause before editing `vite.config.ts`. If you'd rather skip verification and go straight to the preset fix, say "skip diagnostic" and I'll only edit `vite.config.ts`.
