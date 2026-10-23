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

`/api/favicon.png` now retrieves PNG bytes directly from `https://api.mcstatus.io/v2/icon/play.hulettcraft.com`. The address comes from the existing HulettCraft SMP configuration. It does not depend on JSON status properties, the `online` flag, or upstream base64 formatting. An eight-second request timeout allows mcstatus.io's own default five-second timeout to complete. Redirects are rejected. Responses must be successful `image/png`, at most 64 KiB, with valid 64×64 dimensions, chunk CRCs, color/depth combinations, bounded decompression and scanline filters.

**Provider default:** [mcstatus.io documents](https://mcstatus.io/docs/#icon) that the icon endpoint returns its default image for offline/unreachable servers. Each refresh also fetches the fixed no-address `/v2/icon/` image and compares bytes. A candidate identical to that default is not a successful custom-icon retrieval, even with HTTP 200. Both images must be retrieved and validated; if comparison is unavailable, retain the last good icon or use the emergency fallback. A server deliberately using the exact provider default will also be treated as having no custom icon. No images or server addresses supplied by visitors are fetched.

Refreshes remain traffic-driven with a five-minute freshness interval. Successful PNG responses and emergency redirects cache for five minutes; PNG responses support ETags. Visible tabs check the favicon URL every 30 seconds and on return/focus. The URL rotates in five-minute buckets and includes `source=icon-v2` to avoid reusing redirects cached by the original implementation. The internal edge snapshot key is also versioned. Allow roughly 5–10 minutes plus upstream caching and browser scheduling. No rebuild is needed when the server icon changes.

Memory and Cloudflare Cache API snapshots retain recent results. Snapshots can remain at the edge for seven days, but the application enforces five-minute freshness. The existing `SESSION` KV key `public:server-favicon:v1:hulettcraft` still stores only successful icons, indefinitely; old valid saved icons remain compatible. No gallery/R2 objects, administrator session keys, binding names or credentials are changed. KV is eventually consistent; review write usage for a busy globally distributed site. Without KV, retention across isolate/edge eviction is best effort.

Failed HTTP requests, timeouts, corrupt/non-PNG images and provider defaults never overwrite saved good icon bytes. The last good icon is served with HTTP 200 during an outage. Only when no valid saved icon exists does the endpoint return HTTP 302 to the original `/favicon.ico`. Keep that asset available as an emergency fallback.

Diagnostic response headers distinguish these outcomes without following redirects:

| Header                              | Meaning                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `X-Favicon-Source: mcstatus`        | Successful custom icon or its fresh cached copy                                                  |
| `X-Favicon-Source: last-known-good` | Saved icon retained after a failed refresh                                                       |
| `X-Favicon-Source: local-fallback`  | Emergency redirect; no valid saved icon exists                                                   |
| `X-Favicon-Failure`                 | Failed refresh category: `network`, `http`, `content-type`, `invalid-png`, or `provider-default` |

Do not configure an immutable favicon cache rule or override its headers. A matching ETag returns HTTP 304, which should retain the client's previously verified PNG.

### Investigation and verification limits

The original implementation passed `redirect: "error"` to `fetch`. **The Cloudflare workerd runtime rejects that mode before making an upstream request**, with `TypeError: Invalid redirect value, must be one of "follow" or "manual"`. This is reproduced in both a minimal workerd test and the built Astro Pages worker with empty KV. The surrounding catch hid the exception, then returned HTTP 302 to `/favicon.ico` because no successful icon had been saved. The repair uses `redirect: "manual"` and rejects non-success/redirect responses explicitly, so it does not follow an untrusted redirect.

The previous compiled Pages test preloaded KV and never entered that failing fetch path. Node-only fetch mocks also accepted the unsupported mode. New worker tests cover actual outbound fetch behavior starting with empty local KV. The direct PNG endpoint additionally removes reliance on JSON status properties and base64 formatting. The old five-second timeout competed with the provider's own timeout; the new timeout is eight seconds.

This development environment cannot reach either the live website or mcstatus.io API: its network proxy rejects those destinations with CONNECT 403. The actual live redirect/status, Creeper bytes, Cloudflare logs and production cache rules remain unverified. The runtime incompatibility and resulting fallback redirect are confirmed locally, but live logs would establish that the same failure occurred in the deployed request. No live JSON extraction or PNG validation defect has been established.

Tests use a clearly synthetic green Creeper PNG and a separate provider-default fixture. Worker integration tests run the built Astro Pages worker in workerd/Miniflare with empty local KV and intercepted upstream responses. They assert exact returned bytes, HTTP 200, no Location redirect, KV persistence, ETags, last-good retention and explicit emergency fallback. Existing browser tests also run compiled output through local Wrangler. Tests never contact a live Minecraft server or production storage.

Before an approved deployment, inspect the live response without following redirects (`curl -D - --max-redirs 0 -o favicon.png https://hulettcraft.com/api/favicon.png`), compare a successful HTTP 200 PNG with the direct server-icon endpoint, and inspect `X-Favicon-Source`/`X-Favicon-Failure`. Verify the existing SESSION binding, logs and cache rules, then confirm updates and outage retention on an authorized preview. A synthetic fixture is not proof of the current production icon.

Review commits use Cloudflare's documented `[CF-Pages-Skip]` prefix to prevent automatic Pages preview deployment while leaving GitHub Actions enabled. No Cloudflare settings are changed. Remove that prefix from a future approved deployment commit as appropriate.
