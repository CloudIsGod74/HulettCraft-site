# Operations, security, and deployment

## Existing hosting

This change retains Astro 5, Cloudflare adapter 12, server output, Astro.locals.runtime.env, and Cloudflare Pages compatibility. It does not migrate hosting or deploy anything. Use the existing Pages project and its established build command `npm run build` and output directory `dist`. Do not deploy wrangler.local.example.jsonc or the generated wrangler.jsonc.

Before any approved deployment, check the existing production and preview settings separately. They cannot be established from this repository alone.

## Cloudflare configuration

| Binding/variable     | Purpose                            | Requirement                                                                                            |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| HULETTCRAFT_BUCKET   | Existing R2 screenshot bucket      | Required for gallery and upload operations. Preserve the existing production bucket.                   |
| SESSION              | Cloudflare KV                      | Existing adapter session binding; also stores revocations for newly issued admin sessions.             |
| ADMIN_SESSION_SECRET | HMAC signing secret                | Required. Store as a Cloudflare secret; use a random value of at least 32 characters. Never commit it. |
| GITHUB_CLIENT_ID     | Existing GitHub OAuth application  | Required for actual admin login.                                                                       |
| GITHUB_CLIENT_SECRET | OAuth application secret           | Required for the callback.                                                                             |
| UPLOAD_RATE_LIMITER  | Optional native rate-limit binding | Enforces upload throttling if supported by the hosting configuration. See below.                       |

The OAuth callback remains /api/admin/auth/callback on the existing website. Preserve the application and callback configuration. Login uses a short-lived secure state cookie. Session cookies are HttpOnly, Secure, SameSite=Lax, and expire after seven days on both the browser and server.

KV-backed logout revokes newly issued session identifiers. Cloudflare KV is eventually consistent, so revocation is not instantaneous globally. Legacy signed cookies without an identifier remain usable until their seven-day expiry; logout clears the browser cookie. Rotating ADMIN_SESSION_SECRET revokes every session, including copied legacy tokens, but requires an approved production configuration change. Removing a username from the existing allowlist also denies access.

Administrator writes require a matching Origin, including JSON requests. All administrator responses are private and not cacheable. Do not configure a CDN cache rule that overrides these headers.

## Public submission controls

Uploads accept structurally recognized PNG, JPEG, GIF, and WebP bytes with sensible dimensions. The checks do not perform a full pixel decode/re-encode. SVG and other active formats are rejected, regardless of filename/MIME claims. The server supplies the detected raster content type and nosniff/sandbox headers when serving images.

Limits: 10 MiB per new image, 40 megapixels, maximum dimension 16384. Bulk uploads allow up to 20 images and a total multipart request of 25 MiB; the browser allows 24 MiB of files to leave room for form overhead. JSON administrator requests are limited to 64 KiB. Metadata edits to an existing image are supported up to 25 MiB.

The optional UPLOAD_RATE_LIMITER binding uses Cloudflare's native limit({key}) API. It is deliberately not simulated with a per-process counter or KV counter, which would not provide reliable global enforcement.

**Manual production control:** if that binding is unavailable on the current Pages project, configure a Cloudflare WAF rate-limiting rule for POST /api/screenshots/upload, grouped by client IP. Start with approximately five requests per minute per IP, adjusted to the plan's supported periods and community usage. No such rule has been created or verified by this task. The endpoint keeps working when the optional binding is absent, so server-side rate protection then depends on the manually configured Cloudflare rule. Consider Turnstile later if spam persists; credentials and a site policy would be needed.

## Storage boundaries and preservation

- Pending: Screenshots - Need Approval/<single filename>. Public image routes deny these keys. Authenticated administrators use /api/admin/preview.
- Approved: Screenshots/<hulettcraft|hytale|modded>/season-<number|unknown>/<filename>.
- R2 listing follows all pagination cursors and explicitly requests custom metadata.
- Submission filenames use UUIDs; bulk uploads use UUIDs plus normalized names. Conditional writes prevent overwrites.
- Approval preserves the pending filename and uses create-only writes. A destination conflict keeps the pending object and reports the conflict.
- Metadata writes preserve unrelated fields. Empty edits preserve existing descriptions/authors; the gallery asks for confirmation before sending an explicit clearFields request.
- Existing R2 objects are not migrated or renamed by installation. Existing map screenshots remain stored.
- HulettCraft submissions without a season default to the current season. Hytale/Modded submissions without a season use season-unknown. Existing unassigned HulettCraft screenshots remain accessible through an overview link.
- Approval copies before deleting its pending source. R2 does not provide a multi-object transaction. If copying succeeds but source deletion fails, both objects can remain: reconcile carefully after inspecting the reported error; do not retry with an overwrite.
- The old public image route cached arbitrary keys for one day. During an approved deployment, purge any previously cached pending-image URLs at Cloudflare. Browser copies already downloaded cannot be recalled; existing browser cache entries may last until their previous cache lifetime expires.

Public image streaming accepts common stored raster MIME types and known raster extensions when content type is missing. Files with unsafe or unsupported content types are not publicly served. Existing unusual legacy keys/formats may require manual inventory and review; no production inventory was available.

## Local testing

npm test uses Node's default process isolation, which works on the CI version Node 22.22.0. Do not add `--test-isolation=none`; that option requires a newer Node release.

npm run test:e2e generates .wrangler/browser/wrangler.jsonc, dummy-only .dev.vars, and isolated state. Its seed script resets only that test state. It never uses a remote R2 binding. Do not point it at production configuration.

Ordinary local development can use npm run setup:local; existing wrangler.jsonc and .dev.vars are preserved. Local configuration and emulator data are ignored by Git. CI uses the same checks and local emulation.

## Deployment review

1. Review the urgent deletion PR independently, then the broader follow-up.
2. Confirm the existing Pages bindings/secrets and isolate preview storage from production.
3. Confirm upload throttling and cache rules; inspect backup/export and recovery procedures for the existing bucket.
4. Run tests, check, build, and browser tests; review an isolated preview.
5. After explicit approval, deploy through the established Cloudflare workflow and purge legacy pending-image caches.
6. Manually verify real GitHub OAuth, session/logout behavior, existing R2 screenshots, real mcstatus.io responses, and upload throttling.

No deploy, merge, production cache purge, DNS change, plugin change, map-service shutdown, or production data mutation has been performed. The Discord invitation is unknown, so the placeholder link was replaced with a request to contact an administrator. Hytale status is explicitly unavailable.

## Map removal

The public SMP map section and preview, the SMP/Modded/Hytale Status links, and the Hytale iframe/fallback/check have been removed. No public source references the map services. Screenshot galleries, Minecraft player counts, server addresses, and external map infrastructure remain intact.

## Dynamic SMP favicon

`/api/favicon.png` retrieves the Java server icon from `https://api.mcstatus.io/v2/status/java/play.hulettcraft.com`. The address comes from the HulettCraft SMP entry in `src/config/servers.ts`. It requires an online response and a canonical PNG data URI. Validation checks 64×64 dimensions, PNG chunks and CRCs, legal color/depth combinations, bounded decompression, and scanline filters. Arbitrary remote icon URLs and other image formats are rejected. Upstream calls have a five-second timeout and bounded response sizes.

Refreshes are traffic-driven with a five-minute freshness interval; no cron job, rebuild, or redeployment is needed when the Minecraft icon changes. The public response and fallback redirect cache for five minutes and use ETags when an icon is available. BaseLayout uses a five-minute version in the favicon URL, and the browser checks every 30 seconds while visible and on return/focus. This lets open and returning tabs request the new icon despite persistent browser favicon caches. Allow roughly 5–10 minutes after mcstatus.io sees the change, occasionally longer due to browser scheduling or upstream caching. Browsers ultimately control their tab/favicon UI.

An isolate cache and Cloudflare Cache API coalesce requests, ignoring browser version queries. Edge snapshots last up to seven days, with freshness enforced by the application. The existing `SESSION` KV binding additionally keeps the last successful icon indefinitely under the separate key `public:server-favicon:v1:hulettcraft`. It is not an admin session and never touches R2 or gallery objects. Successful refreshes update this one small KV value; writes can happen in multiple active Cloudflare locations. Review KV usage for a very busy globally distributed site. No new binding or secret is required. KV is eventually consistent. Without that binding, retention across restarts/edge eviction is best effort.

Offline servers, bad icons, timeouts, and provider/storage failures do not overwrite a saved good icon. Failed attempts are throttled locally for five minutes. If there is no valid saved icon, the endpoint redirects to the existing `/favicon.ico` asset (PNG bytes despite its historical filename). The next refresh can recover automatically. Keep that asset available. Do not apply an immutable favicon cache rule or override the endpoint's cache headers.

Tests use generated PNG fixtures and isolated local KV; they do not contact the live Minecraft server or mcstatus.io. Before an approved deployment, verify a real mcstatus.io response, the existing Pages `SESSION` binding, and any site-wide cache rules. No production configuration or data was changed while implementing this endpoint.
