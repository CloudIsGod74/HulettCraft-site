# Community roster and banner screenshots

The Community directory is designed for all confirmed active members, including people without social channels. It is curated separately from online-player status: being offline does not make someone inactive, and a historical whitelist alone may contain former members.

## Editing the directory

Sign in through the existing **Admin** link using an allowlisted GitHub account, then choose **Manage member roster** on the Pending Screenshots page, or visit `/admin/roster` directly. No new account system or OAuth scopes are introduced.

Add a Minecraft username and display name for each confirmed member. Short bios and up to eight HTTPS social links are optional. “Show in directory” controls whether a profile is publicly visible; hidden entries remain editable. Removing a row is only published when you save. The editor warns about unsaved changes, retains edits after failed saves, and asks before saving an empty roster. Nothing is imported from online-player samples or Discord.

Saving updates the Community page without a rebuild. The existing `SESSION` KV namespace stores the roster under `public:community-roster:v1`, with no expiration, separately from session, revocation and favicon keys. No R2 objects are changed. If no roster has been saved, the initial list in `src/config/community.ts` is used (currently empty). Once saved, KV is the source of truth; changing that initial list will not overwrite the saved roster.

Administrator reads require the existing signed, allowlisted session. Writes also require the exact request Origin and validate the entire list before saving: a maximum of 200 unique Minecraft usernames, bounded display names/bios/links, and only HTTPS links without credentials. Invalid requests cannot partially replace the roster. Public rendering escapes all text, shows only active members, and announces new-tab links to assistive technology. The public page never serializes inactive records.

Storage errors disable initial editing and show an honest public unavailable message rather than treating failure as an empty roster. Failed writes retain the unsaved form. A revision check rejects observed stale edits with HTTP 409; **KV is eventually consistent and this is not an atomic multi-editor lock**. Use one editor at a time and allow about a minute for propagation. Concurrent global editing would need a transactional store such as a Durable Object or D1. Administrator responses and the Community page use `no-store`; don't override those headers with a CDN cache rule.

The namespace binding must be available separately in each Pages environment. Before editing in a preview, confirm its `SESSION` namespace is isolated from production; previews sharing production KV can change the live roster. Automated tests use memory storage and generated local Wrangler state only. No real profiles, Discord invite, bot credentials, or Cloudflare settings have been added.

## Future Discord integration

The Discord invitation is still unknown, so the page retains the instruction to ask an administrator. Add the real invitation when supplied.

For future automation, first choose a trusted guild and membership/active role, then map stable Discord user IDs to Minecraft usernames. A server-side bot or scheduled sync can propose roster changes for administrator review while preserving bios, social links and manual overrides. Offline Minecraft players must not automatically become inactive. Avoid treating all Discord members or display names as a verified Minecraft roster. This would require a bot token, appropriate Discord member-list access and a defined sync policy; no Discord integration is enabled by this change.

## Screenshot banners

`src/config/banners.ts` defines curated existing local screenshots. Hytale pages use Hytale images; other pages use Minecraft images. A route-specific initial image renders even without JavaScript. In the browser, banners cycle every eight seconds, loading/decoding the next image before replacing the current one. A pause/play control is available, pausing is remembered across pages in the current browser session, and rotation stops in hidden tabs. Reduced-motion users start with a static image and may explicitly choose Play. Failed image loads preserve the existing photo. No R2 listings or gallery mutations are needed for this rotation. Add other approved screenshots to the configuration as desired.
