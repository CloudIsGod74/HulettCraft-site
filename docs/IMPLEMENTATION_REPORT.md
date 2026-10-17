# HulettCraft improvement report

## Reviewable changes

The urgent deletion repair was completed and presented first, with seven focused tests and a successful build. It is independently reviewable in [draft PR #1](https://github.com/CloudIsGod74/HulettCraft-site/pull/1), branch codex/secure-gallery-rejection.

The broader project is on codex/hulettcraft-improvements and builds on that urgent repair. Its draft PR targets the urgent branch so the security patch can be reviewed first. After the urgent PR merges, retarget the follow-up to main before merging it. No PR was merged and no production deployment was performed.

The existing configured remote is CloudIsGod74/HulettCraft-site. The project remains Astro 5 plus Cloudflare adapter 12 and retains the Cloudflare Pages architecture. Static gallery assets and existing production R2 objects were not renamed, relocated, or deleted.

## Phase 1 — Security

- Rejection authenticates administrators, verifies Origin, validates every key before deletion, limits batches to 100, and permits only single-file pending keys.
- Published files, map screenshot keys, unexpected paths, encoded pending paths, malformed batches, and unauthorized requests are rejected.
- Public image streaming permits only validated published world/season keys. Pending previews authenticate administrators and are private/no-store.
- New uploads are recognized from raster bytes and structure, not claimed MIME type; support PNG, JPEG, GIF, and WebP; reject SVG and malformed/oversized inputs. This is structural validation, not a complete image decode/re-encode.
- Limits: 10 MiB/new image, 40 megapixels, 16384 maximum dimension; bulk 20 images and 25 MiB multipart body.
- Optional native Cloudflare rate-limit support is implemented. A production WAF rule or supported native binding still requires manual configuration and verification.
- Sessions enforce seven-day expiry server-side, preserve recent legacy sessions within that lifetime, use secure cookie attributes, and reject malformed cookies safely.
- OAuth uses a random state nonce in a short-lived secure cookie, verifies it before code exchange, checks GitHub response failures, and preserves the original allowlist.
- Logout clears the cookie and can revoke newly issued session identifiers using SESSION KV. KV consistency and legacy-token limitations are documented.
- Moderation, metadata, and bulk-upload writes require a matching Origin and administrator authentication.
- Private administrator cache headers and basic browser security headers are enforced.

## Phase 2 — Gallery

- Metadata controls select the containing figure correctly, submit only edits, preserve unrelated fields, and require explicit confirmation before clearing descriptions/authors.
- Textarea values render as escaped text without indentation becoming part of their values.
- R2 listings request custom/HTTP metadata and follow pagination cursors.
- Season overview previews now use actual R2 screenshots.
- Native dialog lightboxes support keyboard opening, arrows, Escape, and focus restoration.
- The incomplete /api/gallery/hulettcraft endpoint was repaired as a real season-summary API; its shared service also drives overview previews.
- Hytale and Modded galleries display approved R2 uploads grouped by season. Existing static Hytale images remain.
- Submission, approval, and bulk upload remain operational in local end-to-end tests.
- New upload names use UUIDs. Conditional writes prevent accidental overwrites; approval conflicts retain pending files.
- Bulk uploads validate all files/manifest entries before writes, preserve edits when controls rerender, safely display filenames, and report per-file results. Approval also reports partial failures.
- Server-rendered pages read R2 directly rather than fetching the production site from local/preview environments.
- Loading failures have distinct messages rather than appearing as empty galleries or a cleared moderation queue.

## Phase 3 — All public maps removed

- Removed the SMP Current World Map section, its linked preview, and the SMP Status map link.
- Removed the Modded Status map link.
- Removed the Hytale iframe, fallback links/text, Status map link, and map-availability status check.
- No public source contains the three live-map hosts or iframe embeds.
- Minecraft status/player counts and game-server addresses remain.
- Hytale explicitly reports Status unavailable: no reliable game-server health source exists in the repository.
- External map services, map screenshot storage, DNS, Minecraft plugins, and game servers were not changed.

## Phase 4 — Reliability and accessibility

- Mobile menu visibility, toggle behavior, aria-expanded, Escape, focus return, and desktop reset are repaired; navigation remains available without JavaScript.
- Added a skip link, visible keyboard focus, accessible image controls, copy buttons, and reduced-motion support.
- Layouts were checked at 375, 768, and 1440 pixels with no horizontal page overflow.
- Worlds and Status share server configuration, the same status service, failure handling, and periodic refresh.
- The original string-valued /api/status.json contract remains available but now reflects real checks.
- Minecraft responses are validated, time out, and distinguish offline from unavailable.
- External status strings and filenames render as text, not HTML.
- Removed the unknown Discord placeholder URL; the page directs users to a community administrator rather than inventing an invite.

## Phase 5 — Maintenance

- Consolidated season data and shared gallery/status/browser logic.
- Added Cloudflare runtime types and direct TypeScript coverage for source, tests, and scripts.
- Removed the obsolete public administrator hello route.
- Removed unused AWS S3 dependencies.
- Pinned compatible framework updates: Astro 5.18.2 and Cloudflare adapter 12.6.13. No major Astro/adapter migration or incompatible override was performed.
- Updated compatible transitive dependencies. The final npm audit reports eight affected packages: one critical, six high, one low. These include inherited framework/build/emulator findings; the result does not establish every advisory is reachable in this application. Remaining major-line fixes are documented in MIGRATION.md.
- Added project AGENTS.md, operations/migration documentation, local setup examples, formatting configuration, and a CI workflow.
- Local Wrangler configuration, emulator state, secrets, generated output, and browser artifacts are ignored.

## Phase 6 — Verification

| Check                                              | Result                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Urgent focused deletion patch                      | 7 tests passed; build passed                                            |
| Final API/security/function tests                  | 24 passed                                                               |
| Astro check                                        | 64 files; 0 errors, warnings, or hints                                  |
| TypeScript no-emit check                           | Passed                                                                  |
| Production Astro/Cloudflare build                  | Passed                                                                  |
| Chromium end-to-end suite on compiled Pages output | 8 passed, using local R2/KV                                             |
| Desktop/tablet/mobile rendering                    | 12 public routes at 375/768/1440 pixels; no horizontal overflow         |
| Visual inspection                                  | Desktop gallery/worlds and mobile menu screenshots inspected            |
| Map removal regression                             | Source and rendered pages checked                                       |
| Dependency audit                                   | 8 affected packages remain; migration required for complete remediation |

Browser coverage includes mobile keyboard navigation, lightbox arrows/Escape/focus, world galleries, safe status rendering, actual metadata persistence, local approval/rejection, public submission privacy, and actual bulk uploads. The suite uses a dedicated generated project/manifest so Pages loads isolated test bindings, not ordinary local bindings. No destructive tests used production data.

The local workerd process logged a connection-reset diagnostic during navigation; all final browser assertions passed. The live Cloudflare site and real GitHub OAuth flow were not tested. GitHub-provider responses and Minecraft status responses are mocked in the automated suites.

## Remaining configuration and validation

1. Review the urgent PR independently, then the broader follow-up. Production merge/deployment remains subject to explicit approval.
2. Verify the existing Pages R2 and SESSION bindings, OAuth application settings, secrets, Node build version, preview isolation, and cache rules.
3. Configure/verify upload throttling through a supported native binding or Cloudflare WAF rule; none was changed by this task.
4. On an approved deployment, purge formerly cached pending-image URLs; prior browser copies can persist until their old cache lifetime ends.
5. Verify real OAuth login/logout, actual R2 galleries and any unusual legacy keys/MIME types, real mcstatus.io connectivity from Cloudflare, and throttling.
6. Supply a real Discord invitation if it should be published. Add Hytale health reporting only when a reliable source is available.
7. Schedule the separate Astro/adapter and Pages-to-Workers migration described in MIGRATION.md to address remaining dependency advisories.
8. Establish/verify bucket backup and recovery procedures before production rollout. Approval is copy-then-delete and cannot be a multi-object R2 transaction.

See OPERATIONS.md for exact settings, limitations, rollback/reconciliation considerations, and local test setup.

## Modified files

The following list records the complete change set relative to the reviewed repository snapshot. Some existing files also receive consistent formatting.

- .dev.vars.example
- .github/workflows/ci.yml
- .gitignore
- .prettierignore
- .prettierrc.json
- AGENTS.md
- README.md
- astro.config.mjs
- docs/IMPLEMENTATION_REPORT.md
- docs/MIGRATION.md
- docs/OPERATIONS.md
- package-lock.json
- package.json
- playwright.config.ts
- scripts/seed-browser.ts
- scripts/setup-local.mjs
- src/components/GalleryGrid.astro
- src/components/ServerState.astro
- src/components/WorldGallery.astro
- src/config/hulettcraft.ts
- src/config/hulettcraftSeasons.ts
- src/config/servers.ts
- src/env.d.ts
- src/layouts/BaseLayout.astro
- src/lib/adminSession.ts
- src/lib/gallery.ts
- src/lib/galleryKeys.ts
- src/lib/http.ts
- src/lib/images.ts
- src/lib/requireAdmin.ts
- src/lib/runtime.ts
- src/lib/seasonPreviews.ts
- src/lib/serverStatus.ts
- src/lib/uploads.ts
- src/middleware.ts
- src/pages/admin/bulk-upload.astro
- src/pages/admin/hello.astro
- src/pages/admin/index.astro
- src/pages/admin/pending.astro
- src/pages/api/admin/approve.ts
- src/pages/api/admin/auth/callback.ts
- src/pages/api/admin/auth/login.ts
- src/pages/api/admin/auth/logout.ts
- src/pages/api/admin/bulk-upload.ts
- src/pages/api/admin/pending.ts
- src/pages/api/admin/preview.ts
- src/pages/api/admin/reject.ts
- src/pages/api/admin/update-metadata.ts
- src/pages/api/gallery/hulettcraft/index.ts
- src/pages/api/gallery/hulettcraft/season/[season]/index.ts
- src/pages/api/gallery/image.ts
- src/pages/api/screenshots/upload.ts
- src/pages/api/server-status.json.ts
- src/pages/api/status.json.ts
- src/pages/community.astro
- src/pages/gallery.astro
- src/pages/gallery/hulettcraft.astro
- src/pages/gallery/hulettcraft/[season].astro
- src/pages/gallery/hytale.astro
- src/pages/gallery/modded.astro
- src/pages/gallery/upload.astro
- src/pages/hytale.astro
- src/pages/status.astro
- src/pages/worlds.astro
- src/scripts/bulkUpload.ts
- src/scripts/gallery.ts
- src/scripts/moderation.ts
- src/scripts/navigation.ts
- src/scripts/serverStatus.ts
- src/styles/global.css
- tests/browser/site.spec.ts
- tests/gallery.test.ts
- tests/helpers.ts
- tests/reject.test.ts
- tests/security.test.ts
- tests/site.test.ts
- tests/status.test.ts
- tsconfig.json
- wrangler.local.example.jsonc
