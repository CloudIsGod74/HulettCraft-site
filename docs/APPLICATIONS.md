# HulettCraft SMP join applications

`/join` is a private introduction form for HulettCraft SMP (Minecraft Java), linked from Community and the front page. The primary navigation stays focused on the existing sections. It does not accept applications for Creative, Modded or Hytale.

Required: Minecraft Java username, Discord username, proudest Minecraft achievement, preferred building/activities, desired server/community, preferred interactions, engagement preference, and acknowledgement of private administrative review. Followed creators/communities, griefing experience, and a screenshot are optional. No age, real name, email, address, or Discord authentication is collected. Handles are self-reported; an administrator must verify who they are speaking to before granting access.

The form works without JavaScript. With JavaScript, failed submissions preserve typed answers and the selected file; successful submissions clear/hide the form and show a receipt. Unsaved text is held only in the page, with a navigation warning. No draft answers are saved to browser storage. There is no automatic Discord message, roster publication, whitelist command, or game-server change.

## Private storage

Applications use the existing private `SESSION` KV binding. Each submission is one JSON value under `private:join-application:v1:<scope>:<reverse timestamp>-<UUID>`, including the optional image encoded as base64. A 5 MiB image limit plus bounded text keeps records below KV's 25 MiB value limit. This keeps screenshots outside the R2 gallery entirely and avoids partial attachment writes. KV metadata contains only the Minecraft name, submission time and review status, enabling lists of 25 applications without loading attachments. No existing session, roster, favicon or R2 data is changed.

The namespace scope is set by middleware from the actual request hostname. `hulettcraft.com`, `www.hulettcraft.com`, and the production Pages alias `hulettcraft-site.pages.dev` share the production queue. Every other hostname has its own preview queue, so preview/local submissions stay separate even when the same KV binding is used. A hashed deployment and its branch alias consequently have separate test queues. Update the production-host allowlist in `src/config/applications.ts` if the website moves to another canonical domain. Tests that invoke handlers directly use an isolated test scope; normal Pages requests always run through middleware.

The namespace binding must support get/put/list/delete and be available in the Pages environment. Missing storage fails closed with HTTP 503. The form fields remain editable even when the binding is absent; an availability notice is shown, and JavaScript preserves answers after a failed send. Fields are temporarily disabled only while a submission is in progress, then re-enabled after failure. Storage failures never return a successful receipt or trigger email delivery. Submissions remain stored until explicitly deleted by an administrator; there is no automatic retention purge. Deleting the one KV value removes its answers, notes and attached image together. There is no separate orphan attachment to reconcile. For large submission volumes or larger attachments, consider a dedicated transactional store and private attachment bucket later.

### Preview form troubleshooting

`GET /join` includes the diagnostic response header `X-Application-Storage: bound` or `missing`. This reports whether the deployed page sees the SESSION binding; it does not prove a successful read/write. It exposes no credentials or application data. Inspect it in browser developer tools under Network after reloading the page. A missing binding should display an availability notice rather than lock the text fields.

The binding name must be exactly `SESSION`, assigned to the **Preview** environment with an appropriate preview/test KV namespace. Save the setting and deploy the review branch again: changing a Pages setting does not retrofit bindings into existing deployments. Open the branch alias after the new deployment completes; an older hashed deployment URL continues to refer to its original deployment. If the header says `bound` but a submission fails, inspect Pages Functions logs for the failing private-storage operation. Mail settings do not control field editability, and an email outage after successful storage does not reject the application.

## Administrator review

Existing allowlisted GitHub administrators can open `/admin/applications`, linked from the admin tools. Lists are paginated newest first. A detail page shows all answers and the optional screenshot, with review status (New, In review, Accepted, Declined) and private notes. Screenshots require the same administrator session at `/api/admin/applications/<id>/screenshot` and use private/no-store, nosniff and sandbox headers. Detail JSON omits attachment bytes. Public gallery routes reject application keys, and public pages never serialize submissions.

### Preview login setup

`GitHub login is unavailable` at `/api/admin/auth/login` means the deployed environment has no `GITHUB_CLIENT_ID`. A working `SESSION` binding enables application storage; it does not configure GitHub login or email. Production settings are separate from Preview settings.

Use the stable branch alias `https://codex-join-applications.hulettcraft-site.pages.dev` for both submissions and review. Create a separate preview GitHub OAuth application with that homepage and callback `https://codex-join-applications.hulettcraft-site.pages.dev/api/admin/auth/callback`; preserve the production OAuth application's callback. In Cloudflare Pages **Preview** settings, set its `GITHUB_CLIENT_ID`, store its `GITHUB_CLIENT_SECRET` as a Secret, and set a separate random `ADMIN_SESSION_SECRET` (at least 32 characters) as a Secret. Redeploy the review branch and sign in through the branch alias. Never paste secret values into screenshots or chat.

The login route uses the OAuth application's registered callback. Reusing the production client normally returns the browser to production, where its preview-host state cookie is unavailable. Changing from a hashed preview host to the branch alias also changes the application queue: an earlier hashed-host test remains in its original KV scope and will not appear in the branch-alias list. After configuring the preview, use the branch alias throughout the new synthetic test rather than repeatedly submitting real answers on different hosts.

Every review and deletion authenticates the existing signed allowlisted session and verifies exact Origin. Observed stale revisions return HTTP 409. KV is eventually consistent, so this is **not an atomic concurrent-review lock**; use one reviewer per application and allow about a minute for lists/updates/deletions to propagate. Deletion asks for confirmation. Failed review saves retain the administrator's edits. Accepted is an administrative decision record only: verify the Discord identity, follow up manually, and handle server access separately. Add confirmed active members to the roster separately when appropriate.

## Email to support@hulettcraft.com

After saving an application, the server sends its answers directly to **Cloudflare Email Service**, addressed only to **support@hulettcraft.com**. The existing Cloudflare Email Routing rule then forwards the message to the owner's inbox. No mailbox at the support address, external sending service, new Worker, new dependency or hosting migration is required. The Pages function uses Cloudflare's [documented REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/) because Pages does not expose every Workers binding.

The plain-text message contains the Minecraft/Discord handles, answers, engagement preference, submission time and authenticated admin link. Applicant content cannot become HTML or email headers. Screenshots stay private in KV, accessible through the admin portal; neither screenshot bytes nor admin notes are emailed. Applicants receive no outgoing email.

### Cloudflare setup

Receiving/forwarding and sending are separate capabilities. Preserve the existing support forwarding rule and MX records. Before a live send, confirm that Cloudflare permits sending **to the support address**, not only to the personal address behind its forwarding rule. A routed alias is not automatically a verified destination.

Cloudflare documents [free sending to verified destination addresses](https://developers.cloudflare.com/email-service/platform/limits/), including routing-only accounts, from their routing domains. Check whether `support@hulettcraft.com` can be added and verified in the account's destination-address list; its verification message can arrive through the existing forwarding rule. Adding a verified destination does not require assigning it to a routing rule. Do not point the support rule back to itself. Otherwise arbitrary-recipient sending requires eligible Email Sending setup and a Workers Paid plan. Account eligibility, recipient verification and sender-domain readiness have not been verified here. Do not change plans, DNS or forwarding as part of a code deployment without approval.

Create a dedicated Cloudflare API token with **Email Sending: Edit** permission, restricted to the existing account. The token is for sending only; the website does not need DNS-edit, routing-edit, KV or R2 permissions on it. Store it directly in Pages settings as a Secret, never in chat, screenshots, Git, or a `PUBLIC_` variable. Configure the environment being tested:

| Runtime setting                     | Value/purpose                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_ACCOUNT_ID`             | Existing 32-character account ID, as Text.                                                                                                                                     |
| `CLOUDFLARE_EMAIL_API_TOKEN`        | Dedicated sending token, as a Secret.                                                                                                                                          |
| `APPLICATION_EMAIL_ENABLED`         | Literal `true` enables sending; off by default.                                                                                                                                |
| `APPLICATION_EMAIL_PREVIEW_ENABLED` | Literal `true` additionally required for the authorized preview test; ordinary previews leave it off.                                                                          |
| `APPLICATION_EMAIL_FROM`            | Optional plain address under hulettcraft.com; defaults to `applications@hulettcraft.com`. It needs permission to send from that routing/sending domain, not an actual mailbox. |

Save the **Preview** settings, then redeploy `codex/join-applications`. Production configuration remains separate. Use the stable branch alias throughout the test: `https://codex-join-applications.hulettcraft-site.pages.dev`. This implementation does not change account plans, routing rules, DNS, secrets or credentials automatically.

### Delivery and retry behavior

An `Application received` receipt confirms the private application was saved. It does not confirm email sending, forwarding or inbox delivery. Sending is synchronous with an eight-second timeout and happens only after storage succeeds. The endpoint rejects redirects. A Cloudflare HTTP 200 counts as acceptance only when the JSON reports `success: true`, no errors or bounces, and exactly the fixed support recipient in `delivered` or `queued`. Empty/malformed results, another recipient, permanent bounces, HTTP errors and timeouts never produce a confirmed-send state.

An email failure preserves the saved application and receipt. The private admin detail shows acceptance status and supports an authenticated, exact-Origin retry. There is no background retry queue. Minimal state (`sent` or `failed`, plus time) remains separate under `private:join-email:v1:private:join-application:v1:<scope>:<id>`; answers and review revisions are untouched. Existing accepted states remain valid and suppress sending again when visible, including messages accepted before this sender change.

Cloudflare's documented endpoint does not promise provider-side idempotency for an `Idempotency-Key` header, so none is assumed. A timeout or failed acceptance-state write may happen after Cloudflare accepted a message. Every manual retry asks the administrator to check Cloudflare Email Sending activity first and warns that resending can duplicate mail. KV is eventually consistent and does not supply an atomic concurrent-send lock: use one reviewer, check activity before retrying any uncertain send, and do not treat the state check as exactly-once delivery. Deleting an application also removes its delivery state; it cannot recall already-sent mail or copies in the forwarded inbox. Apply retention rules there separately.

### Delivery test before enabling production

Automated unit and compiled Pages/workerd tests intercept Cloudflare's API and use synthetic submissions with isolated KV. They verify the exact URL, fixed recipient, actual answers, accepted delivered/queued responses, bounced/wrong-recipient/malformed responses, disabled previews, outages, retained submissions, authenticated retries, and suppression after recorded acceptance. Browser coverage checks the retry confirmation and that cancellation sends nothing. Tests never email support or change live storage.

After configuring an authorized preview, submit **one synthetic application** through the stable branch alias's `/join`. The subject starts with `[PREVIEW TEST]`. Confirm its status in the same host's private admin detail or Cloudflare's Email Sending activity, then check forwarding and the destination inbox/spam folder. If accepted, do not submit again to diagnose forwarding. If unconfirmed, inspect Cloudflare activity before using the admin retry. Test provider failures only in local emulation. Remove the synthetic record through the admin UI after review and disable preview sending afterward.

A hashed deployment and its branch alias have different application scopes. A previous hashed-host test is retained in that original scope and will not appear in the branch alias's admin queue. Real preview OAuth still needs the separate setup above. This environment has no Cloudflare sending credentials, account-management access or mailbox access; intercepted API success does not prove live delivery. A real Cloudflare send and forwarded inbox receipt remain required before production approval.

## Submission boundaries and abuse controls

POST `/api/join` verifies exact Origin and accepts bounded multipart data (5 MiB plus 64 KiB of form overhead). It rejects duplicate/unknown fields, missing required answers/acknowledgement, invalid Minecraft usernames, invalid engagement values and excessive/control-character text. One optional screenshot is validated using the existing raster byte/dimension checks: PNG, JPEG, GIF or WebP, up to 5 MiB and 40 megapixels; SVG and other active formats are rejected. Checks are structural, not a full decode/re-encode; original metadata is not stripped. All answer/credit text is escaped in HTML.

A honeypot rejects filled automated submissions. When the existing optional `UPLOAD_RATE_LIMITER` is bound, application submissions use a separate `join:<scope>:<IP>` key. The IP is used only for the limiter, not saved in the application. The honeypot and Origin check do **not** replace server-side rate limiting. Before public rollout, verify the native limiter or configure an authorized Cloudflare WAF rate-limit rule for POST `/api/join` (for example, three attempts per ten minutes per IP, adapted to the supported plan). No WAF, binding or credential setting has been changed by this implementation. Turnstile can be added later if needed, using explicitly configured credentials.

## Validation and live review

Unit tests use memory-only KV/R2. Browser tests use only generated isolated local Wrangler state and signed fixture admin sessions. They cover valid submissions with/without screenshots, validation, failures, authenticated review/deletion, private image boundaries, namespace separation, mobile layout and the no-JavaScript submission path.

Before production merge, review the form wording, real GitHub login, production/preview SESSION availability and rate protection. Preview records are intentionally separate from production. Use synthetic application data during preview review; no real applications or screenshots have been migrated or created by tests. The review branch also includes the two-frame home-page archive slideshow described in [front-page screenshots](HOME_SCREENSHOTS.md).
