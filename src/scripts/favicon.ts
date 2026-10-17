import { faviconUrl } from "../config/favicon";
function refreshFavicon() {
  if (document.visibilityState === "hidden") return;
  const link = document.querySelector<HTMLLinkElement>(
    "link[data-server-favicon]",
  );
  const href = faviconUrl();
  if (link && link.getAttribute("href") !== href) link.href = href;
}
refreshFavicon();
// Revisit cached pages, resume sleeping tabs, and update long-lived visible tabs.
window.addEventListener("pageshow", refreshFavicon);
window.addEventListener("focus", refreshFavicon);
document.addEventListener("visibilitychange", refreshFavicon);
window.setInterval(refreshFavicon, 30_000);
