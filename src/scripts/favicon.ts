import { faviconUrl, FAVICON_INTERVAL_MS } from "../config/favicon";

let nextCheck = 0;
let pending = false;
let currentEtag: string | null = null;

async function refreshFavicon() {
  if (
    document.visibilityState === "hidden" ||
    pending ||
    Date.now() < nextCheck
  )
    return;
  const link = document.querySelector<HTMLLinkElement>(
    "link[data-server-favicon]",
  );
  if (!link) return;
  pending = true;
  nextCheck = Date.now() + FAVICON_INTERVAL_MS;
  try {
    // Check in the background. A redirect/error must never replace a displayed icon.
    const response = await fetch(faviconUrl(), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: currentEtag ? { "If-None-Match": currentEtag } : {},
    });
    if (response.status === 304) return;
    const source = response.headers.get("X-Favicon-Source");
    if (
      !response.ok ||
      (source !== "mcstatus" && source !== "last-known-good") ||
      response.headers.get("Content-Type")?.split(";", 1)[0].trim() !==
        "image/png"
    )
      return;
    if (Number(response.headers.get("Content-Length")) > 65536) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length > 65536 ||
      bytes.length < 33 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    )
      return;
    const view = new DataView(bytes.buffer);
    if (view.getUint32(16) !== 64 || view.getUint32(20) !== 64) return;
    // Compare actual content, so unchanged icons never replace the link.
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const etag = `"${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}"`;
    if (etag === currentEtag) return;
    const dataUrl =
      "data:image/png;base64," +
      btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    // Confirm browser decoding before replacing the previous icon.
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (image.naturalWidth !== 64 || image.naturalHeight !== 64) return;
    link.href = dataUrl;
    currentEtag = etag;
  } catch {
    // Keep the displayed icon through timeouts, offline periods and bad responses.
  } finally {
    pending = false;
  }
}
void refreshFavicon();
window.addEventListener("pageshow", () => void refreshFavicon());
window.addEventListener("focus", () => void refreshFavicon());
document.addEventListener("visibilitychange", () => void refreshFavicon());
window.setInterval(() => void refreshFavicon(), 30_000);
