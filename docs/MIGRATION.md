# Future Astro and Cloudflare migration

This task keeps Astro 5 and Cloudflare adapter 12. Compatible updates are pinned to Astro 5.18.2 and adapter 12.6.13. The unused AWS S3 packages were removed because all application storage uses the R2 Worker binding directly.

These changes do not eliminate every published dependency advisory. Some current advisories are fixed only on newer Astro/adapter lines. Dependency scanner matches are not evidence that every affected feature is reachable: this site uses ordinary raster images and a passthrough image service, with no runtime AVIF optimization, server islands, or public development server. Review actual exposure and advisory updates regularly. The final local npm audit reports eight affected packages (one critical, six high, one low), including inherited framework/tooling findings. Compatible transitive updates reduced that count from nineteen after the initial framework patches. The remaining packages are astro, @astrojs/cloudflare, esbuild, miniflare, sharp, undici, wrangler, and ws; clearing all of them requires a separately tested platform/tooling upgrade. No incompatible overrides were added.

A major migration needs a separate project:

1. Inventory the actual Cloudflare Pages project, preview policies, bindings, Node build version, secrets, OAuth callbacks, and cache rules.
2. Select a supported Astro/adapter pair from the then-current registry. The audit observed Astro 7.4 and adapter 14.4; do not assume those remain the right targets later.
3. Plan Pages-to-Workers hosting migration: newer Cloudflare adapters removed Pages support.
4. Replace Astro.locals.runtime.env with the new adapter's supported Cloudflare environment access; update runtime types, middleware, build entrypoint, assets, and local emulation.
5. Preserve existing R2 object names and bucket selection, session secret handling, allowlist, and OAuth redirect URL.
6. Run the security and browser suites on both implementations, using separate local/preview R2 and KV.
7. Prepare a cutover and rollback plan and obtain explicit production approval.

Do not force incompatible dependency overrides to silence scanner results. In particular, replacing the Cloudflare adapter's runtime/tooling outside its supported range can break local emulation or deployed behavior. Maintain a separate tested upgrade branch.
