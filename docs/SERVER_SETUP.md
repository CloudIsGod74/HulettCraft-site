# Hytale status and Modded client setup

## Hytale: what the website checks

The site can query a running Hytale server through Nitrado Query. This is recommended in the [official Hytale server manual](https://support.hytale.com/hc/en-us/articles/45326769420827-Hytale-Server-Manual), and works with the existing Astro/Cloudflare Pages HTTP runtime. It is independent of a map, website availability, a TCP port-open test, and the Minecraft Java status API. The game itself uses QUIC over UDP; a Pages function does not implement a native game-protocol probe.

The default query target is `https://hytale.hulettcraft.com:5523/Nitrado/Query`. **That is a documented default port, not a verified existing HulettCraft endpoint.** No server update, plugin installation, port forwarding, DNS change, certificate configuration, or Cloudflare setting change has been performed. Those require access to the existing server and an authorized setup session. The live server/plugin versions and endpoint have not been verified from this development environment.

The adapter explicitly requests Nitrado's version-1 JSON representation and accepts the minimal `Basic` section: `CurrentPlayers`, `MaxPlayers`, and `Version`. It also supports older `Server` plus `Universe` responses. Only validated counts and a bounded version string are returned publicly. Player names/UUIDs, worlds, server addresses and plugin inventories from the query are discarded.

A valid response establishes Online. Failed TLS, missing plugins, timeouts, permission errors, HTTP errors/redirects, HTML pages, malformed JSON and oversized responses yield **Status unavailable**, not a guessed Online or Offline state. The query cannot distinguish a stopped game from an inaccessible query service. Minecraft's explicit offline results retain their existing meaning. An online game can still reject an incompatible client build.

Both `/api/server-status.json` and the legacy string-valued `/api/status.json` share checks in each running isolate. Results and concurrent requests are reused for 30 seconds; responses also have 30-second browser/shared-cache headers. Visible status pages refresh once a minute. There is no stale-online retention after a failed fresh check. Caches are per isolate, not a global scheduler, so a busy site may make checks from multiple locations. No third-party Hytale monitoring account or polling API is used.

## Connecting the existing Hytale server

These are setup instructions for a later authorized server session, not changes made by this PR.

1. Identify the existing hosting panel/process, game build, game port and installed plugins. Back up the server before updating it through its normal maintenance process. Install plugin releases compatible with that game build; do not assume an old JAR will work with an updated server.
2. Check for [Nitrado WebServer](https://github.com/nitrado/hytale-plugin-webserver) and [Nitrado Query](https://github.com/nitrado/hytale-plugin-query). Query depends on WebServer. These plugins are not restricted to Nitrado hosting. The web service's default port is the game port plus three, normally 5523 when the game uses 5520; verify the actual bind settings.
3. Merge only `nitrado.query.web.read.basic` into the existing `ANONYMOUS` permissions if anonymous public totals are desired. Preserve other groups and permissions. There is no need to expose player identities or plugin lists. Follow the plugin instructions for stopping/restarting before editing server files.
4. Provide HTTPS with a publicly trusted certificate, following the WebServer administrator guide or an existing reverse proxy. The plugin's default self-signed certificate will not be accepted by Cloudflare fetch. The adapter never disables certificate checks. Keep the game address/DNS unchanged. Cloudflare's ordinary proxy does not proxy HTTPS on port 5523; use an appropriate direct endpoint or an existing HTTPS reverse proxy on a supported port. No proxy or DNS resources are created here.
5. From a permitted machine, verify the query itself:

   ```sh
   curl --fail --max-time 8 \
     -H 'Accept: application/x.hytale.nitrado.query+json;version=1' \
     'https://hytale.hulettcraft.com:5523/Nitrado/Query'
   ```

   Expect HTTP 200 and numeric counts plus a nonempty version in `Basic`, rather than an HTML page. A running web service alone is insufficient.

6. If the existing query is exposed at another supported URL, set the optional Pages runtime text variable `HYTALE_QUERY_URL` separately for the intended environment. Allowed hosts are exactly `hytale.hulettcraft.com` and `hytale-status.hulettcraft.com`, HTTPS only, with the exact `/Nitrado/Query` path and no credentials, query parameters or fragment. Ports may match the existing service. An explicit empty value disables the optional query. Activating changed Pages environment settings requires a new deployment. Do not create a new hostname or change DNS merely to match the example.
7. On an authorized preview, check `/api/server-status.json`, `/api/status.json`, `/status`, `/worlds`, and `/hytale`. Compare counts/version with the actual game; test a maintenance stop and restore. Check both Pages runtime logs and server query logs if the result is unavailable. No credentials belong in the query URL or browser code.

## Modded: publishing what players must install

Sign in as an existing allowlisted administrator, choose **Modded client setup** on the Pending Screenshots or Member roster page, or open `/admin/modded`. No new account or service is needed. The public `/modded` page is linked from the Modded Worlds/Status card and its gallery. The top navigation remains unchanged.

Choose **Published modpack** for a CurseForge/Modrinth or other pack: enter its name, exact release, Minecraft version, loader and loader version, plus an HTTPS download page. Prefer a link to the exact release/file when possible. Additional required client mods and instructions are optional.

Choose **Custom mod list** for a collection maintained by the server owner: list required client mods with exact versions, one per line, and include installation instructions. The Minecraft and loader versions are required before publishing. A custom download/setup link is optional. Review all versions, instructions and any retained download link when changing setups; nothing is inferred or cleared silently.

Leave **Publish these client requirements** unchecked while details are unknown. Drafts are saved privately and are never serialized into the public page. With no published setup, visitors are told to ask an administrator rather than being shown invented pack details. All instructions are plain escaped text, not HTML or executable markup. Links must be HTTPS without embedded credentials; the website never fetches them or hosts modpack archives.

Check the actual game server before publishing a change. Minecraft status alone does not reliably identify an exact pack release or distinguish required client mods from server-only mods. An Online indicator is not proof that the published instructions match the current world. Updating the guide is a manual administrator action and does not install/change any server mods.

Saving uses the existing `SESSION` KV key `public:modded-guide:v1`, without expiration, independently of roster, authentication, favicon and application keys. It needs no rebuild and introduces no R2 writes, migration or new binding. A revision check rejects observed stale edits (409), but KV is eventually consistent and is not an atomic multi-editor lock. Use one editor at a time; allow about a minute for propagation. Failed saves retain the form. Storage load failures disable editing rather than presenting an empty configuration, and the public page gives an unavailable message. Admin responses and the public setup page are `no-store`; do not override their headers.

As with the roster, isolate preview KV before editing real configuration. Automated tests use synthetic requirements, local KV, and mocked external queries. They do not establish the current real modpack, Hytale reachability, TLS, plugin permissions, or live client compatibility.
