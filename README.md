# HulettCraft

An Astro community website for Minecraft and Hytale, deployed using the existing Cloudflare Pages adapter. The site uses Cloudflare R2 for screenshots, GitHub OAuth for administrators, and mcstatus.io for Minecraft status. Hytale status is unavailable until a reliable game-server health source is configured.

## Development

Use Node 22.22 or later and npm.

```sh
npm ci
npm run setup:local
npm run dev
```

The setup command preserves existing local files. The example bucket and KV namespace are emulated locally; they are not production resources. The generated browser-test configuration uses a separate bucket and state directory. Real GitHub login requires a separate local OAuth application; automated tests use signed local fixture sessions.

```sh
npm test
npm run check
npm run build
npm run test:e2e
```

In a managed environment without a writable default config directory, set `ASTRO_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=/tmp/hulettcraft-config` for Astro commands.

Browser tests build the site and run the compiled Pages output with local Wrangler, R2, and KV. They use an existing /usr/bin/chromium when available. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to another executable, or install the matching Playwright browser using `npx playwright install chromium`. Tests inspect desktop, tablet, and mobile layouts, keyboard navigation, private images, metadata saves, and moderation against local R2/KV. They mock the upstream Minecraft status response and do not prove live server availability.

## Organization

- src/pages: public pages, administrator pages, and API routes.
- src/components and src/scripts: shared galleries, status display, and browser interactions.
- src/lib: authentication, image validation, key boundaries, R2 pagination, metadata, and status-provider checks.
- src/config/hulettcraft.ts: season titles, descriptions, and current season.
- src/config/servers.ts: existing game-server addresses and status-provider targets.
- public/images: existing static photographs/screenshots, retained in place.
- tests: API/security tests with memory-only storage and browser tests with local Cloudflare emulation.

HulettCraft season galleries read Screenshots/hulettcraft/season-N/. Hytale and Modded galleries read their corresponding world prefixes and group approved screenshots by season. The existing static Hytale photographs remain visible. See [operations and deployment](docs/OPERATIONS.md) and the [future platform migration](docs/MIGRATION.md).

Public live maps have been removed. External map services, map screenshots in R2, DNS, Minecraft plugins, and game servers were not changed.
