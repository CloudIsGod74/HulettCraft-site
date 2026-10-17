# HulettCraft development

- Keep Astro 5 and @astrojs/cloudflare 12 compatible with the existing Cloudflare Pages hosting model. Do not perform a major migration in routine fixes.
- Preserve the existing visual identity, server addresses, administrator allowlist, and world/season organization.
- Read README.md and docs/OPERATIONS.md before changing storage or authentication.
- Never use production R2/KV for destructive tests. Browser tests seed only the generated .wrangler/browser configuration and local state.
- Never deploy, merge, change DNS/plugins, or change Cloudflare settings without explicit user authorization.
- Every moderation, metadata, and administrator upload mutation must authenticate and verify the request Origin. Logout must verify Origin and may revoke only a verified session. Reject operations may only delete single-file keys under Screenshots - Need Approval/.
- Public image routes may serve only approved raster images under validated world/season prefixes. Pending previews require administrator access.
- Preserve existing object names and metadata. Do not relocate existing production objects as a maintenance action.
- No public live-map links, embeds, or map-derived status checks belong in src.
- Use npm install to update the lockfile. Keep local wrangler.jsonc, .dev.vars, .wrangler, build output, and browser artifacts out of Git.
- Validate changes with npm test, npm run check, npm run build, and npm run test:e2e when UI or storage workflows change.
- Browser tests use Chromium; PLAYWRIGHT_CHROMIUM_EXECUTABLE can select an installed executable. Otherwise install Playwright Chromium.
