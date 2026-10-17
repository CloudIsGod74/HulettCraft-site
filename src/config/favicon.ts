// Shared by server rendering and the browser; do not import worker code here.
export const FAVICON_INTERVAL_MS = 5 * 60 * 1000;
export function faviconUrl(now = Date.now()): string {
  return `/api/favicon.png?v=${Math.floor(now / FAVICON_INTERVAL_MS)}`;
}
