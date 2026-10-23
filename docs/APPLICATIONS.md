# HulettCraft SMP join applications

`/join` is a private introduction form for HulettCraft SMP (Minecraft Java), reachable through Join in the main navigation, the front page, and Community. It does not accept applications for Creative, Modded or Hytale.

Required: Minecraft Java username, Discord username, proudest Minecraft achievement, preferred building/activities, desired server/community, preferred interactions, engagement preference, and acknowledgement of private administrative review. Followed creators/communities, griefing experience, and a screenshot are optional. No age, real name, email, address, or Discord authentication is collected. Handles are self-reported; an administrator must verify who they are speaking to before granting access.

The form works without JavaScript. With JavaScript, failed submissions preserve typed answers and the selected file; successful submissions clear/hide the form and show a receipt. Unsaved text is held only in the page, with a navigation warning. No draft answers are saved to browser storage. There is no automatic Discord message, roster publication, whitelist command, or game-server change.

## Private storage

Applications use the existing private `SESSION` KV binding. Each submission is one JSON value under `private:join-application:v1:<scope>:<reverse timestamp>-<UUID>`, including the optional image encoded as base64. A 5 MiB image limit plus bounded text keeps records below KV's 25 MiB value limit. This keeps screenshots outside the R2 gallery entirely and avoids partial attachment writes. KV metadata contains only the Minecraft name, submission time and review status, enabling lists of 25 applications without loading attachments. No existing session, roster, favicon or R2 data is changed.

The namespace scope is set by middleware from the actual request hostname. `hulettcraft.com`, `www.hulettcraft.com`, and the production Pages alias `hulettcraft-site.pages.dev` share the production queue. Every other hostname has its own preview queue, so preview/local submissions stay separate even when the same KV binding is used. A hashed deployment and its branch alias consequently have separate test queues. Update the production-host allowlist in `src/config/applications.ts` if the website moves to another canonical domain. Tests that invoke handlers directly use an isolated test scope; normal Pages requests always run through middleware.

The namespace binding must support get/put/list/delete and be available in the Pages environment. Missing storage fails closed with HTTP 503; the public form is disabled when the binding is absent. Storage failures never return a successful receipt. Submissions remain stored until explicitly deleted by an administrator; there is no automatic retention purge. Deleting the one KV value removes its answers, notes and attached image together. There is no separate orphan attachment to reconcile. For large submission volumes or larger attachments, consider a dedicated transactional store and private attachment bucket later.

## Administrator review

Existing allowlisted GitHub administrators can open `/admin/applications`, linked from the admin tools. Lists are paginated newest first. A detail page shows all answers and the optional screenshot, with review status (New, In review, Accepted, Declined) and private notes. Screenshots require the same administrator session at `/api/admin/applications/<id>/screenshot` and use private/no-store, nosniff and sandbox headers. Detail JSON omits attachment bytes. Public gallery routes reject application keys, and public pages never serialize submissions.

Every review and deletion authenticates the existing signed allowlisted session and verifies exact Origin. Observed stale revisions return HTTP 409. KV is eventually consistent, so this is **not an atomic concurrent-review lock**; use one reviewer per application and allow about a minute for lists/updates/deletions to propagate. Deletion asks for confirmation. Failed review saves retain the administrator's edits. Accepted is an administrative decision record only: verify the Discord identity, follow up manually, and handle server access separately. Add confirmed active members to the roster separately when appropriate.

## Submission boundaries and abuse controls

POST `/api/join` verifies exact Origin and accepts bounded multipart data (5 MiB plus 64 KiB of form overhead). It rejects duplicate/unknown fields, missing required answers/acknowledgement, invalid Minecraft usernames, invalid engagement values and excessive/control-character text. One optional screenshot is validated using the existing raster byte/dimension checks: PNG, JPEG, GIF or WebP, up to 5 MiB and 40 megapixels; SVG and other active formats are rejected. Checks are structural, not a full decode/re-encode; original metadata is not stripped. All answer/credit text is escaped in HTML.

A honeypot rejects filled automated submissions. When the existing optional `UPLOAD_RATE_LIMITER` is bound, application submissions use a separate `join:<scope>:<IP>` key. The IP is used only for the limiter, not saved in the application. The honeypot and Origin check do **not** replace server-side rate limiting. Before public rollout, verify the native limiter or configure an authorized Cloudflare WAF rate-limit rule for POST `/api/join` (for example, three attempts per ten minutes per IP, adapted to the supported plan). No WAF, binding or credential setting has been changed by this implementation. Turnstile can be added later if needed, using explicitly configured credentials.

## Validation and live review

Unit tests use memory-only KV/R2. Browser tests use only generated isolated local Wrangler state and signed fixture admin sessions. They cover valid submissions with/without screenshots, validation, failures, authenticated review/deletion, private image boundaries, namespace separation, mobile layout and the no-JavaScript submission path.

Before production merge, review the form wording, real GitHub login, production/preview SESSION availability and rate protection. Preview records are intentionally separate from production. Use synthetic application data during preview review; no real applications or screenshots have been migrated or created by tests. The independent screenshot-rotation PR is not included in this feature branch.
