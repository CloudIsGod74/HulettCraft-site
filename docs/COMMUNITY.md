# Community roster and banner screenshots

The Community directory is designed for all confirmed active members, including people without social channels. It is curated separately from online-player status: being offline does not make someone inactive, and a historical whitelist alone may contain former members.

Populate `src/config/community.ts` once the roster is ready. Each entry needs a Minecraft username, display name, and `active: true`; a short biography and public social links are optional. Set `active: false` to hide a profile without deleting its record. The directory uses initials rather than requesting avatars from a third-party service. Real local avatar images can be added later if desired.

```ts
// Format example only; do not publish this as a real member.
{
  username: "MinecraftUsername",
  displayName: "Public display name",
  active: true,
  bio: "A short introduction supplied for the directory.",
  links: [{ label: "YouTube", url: "https://www.youtube.com/@confirmed-handle" }],
}
```

Use confirmed public links. Only HTTPS links without embedded credentials render; all text is escaped. Links open in a new tab with that behavior announced to assistive technology. No unconfirmed profiles, member counts or guessed social URLs are included. The current directory shows an honest empty state until data is supplied. The Discord invitation is still unknown, so the page retains the instruction to ask an administrator.

The first version is intentionally a simple version-controlled roster; it requires a normal website build to update. It introduces no accounts, database, server plugin, OAuth scopes or new production storage. An authenticated admin roster editor can be a later feature once maintenance needs are clear.

`src/config/banners.ts` defines curated existing local screenshots. Hytale pages use Hytale images; other pages use Minecraft images. A route-specific initial image renders even without JavaScript. In the browser, banners cycle every eight seconds, loading/decoding the next image before replacing the current one. A pause/play control is available, pausing is remembered across pages in the current browser session, and rotation stops in hidden tabs. Reduced-motion users start with a static image and may explicitly choose Play. Failed image loads preserve the existing photo. No R2 listings or gallery mutations are needed for this rotation. Add other approved screenshots to the configuration as desired.
