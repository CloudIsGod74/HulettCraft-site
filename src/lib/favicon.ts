import { FAVICON_INTERVAL_MS } from "../config/favicon";
import { SERVERS } from "../config/servers";
import { boundedBytes, parseServerIcon } from "./serverIcon";

export const FAVICON_KV_KEY = "public:server-favicon:v1:hulettcraft";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=300, must-revalidate",
};
interface Snapshot {
  checkedAt: number;
  icon: string | null;
}
interface IconStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
}
interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<unknown>;
}
interface Options {
  fetcher?: typeof fetch;
  now?: () => number;
  cache?: EdgeCache;
}
export function createFaviconService({
  fetcher = fetch,
  now = Date.now,
  cache,
}: Options = {}) {
  let memory: Snapshot | undefined;
  let pending: Promise<Snapshot> | undefined;
  async function readSnapshot(
    raw: string | null,
  ): Promise<Snapshot | undefined> {
    try {
      const value = JSON.parse(raw ?? "null");
      if (
        !value ||
        !Number.isFinite(value.checkedAt) ||
        value.checkedAt < 0 ||
        value.checkedAt > now()
      )
        return;
      if (value.icon !== null && !(await parseServerIcon(value.icon))) return;
      return { checkedAt: value.checkedAt, icon: value.icon };
    } catch {
      return;
    }
  }
  async function refresh(key: Request, store?: IconStore): Promise<Snapshot> {
    let previous = memory;
    if (!previous && cache) {
      try {
        previous = await readSnapshot(
          (await (await cache.match(key))?.text()) ?? null,
        );
      } catch {
        /* Cache eviction/unavailability is harmless. */
      }
    }
    if (previous && now() - previous.checkedAt < FAVICON_INTERVAL_MS)
      return (memory = previous);
    // KV retains only successful icons, across isolate restarts and edge evictions.
    if (store) {
      try {
        const saved = await readSnapshot(await store.get(FAVICON_KV_KEY));
        if (
          saved?.icon &&
          (!previous?.icon || saved.checkedAt > previous.checkedAt)
        )
          previous = saved;
      } catch {
        /* Existing storage may temporarily be unavailable. */
      }
    }
    if (previous && now() - previous.checkedAt < FAVICON_INTERVAL_MS)
      return (memory = previous);
    let icon = previous?.icon ?? null;
    let success = false;
    try {
      const server = SERVERS.find((server) => server.id === "hulettcraft")!;
      const response = await fetcher(
        `https://api.mcstatus.io/v2/status/java/${server.address}`,
        {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("Status provider unavailable");
      const status = JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 256 * 1024)),
      );
      if (status?.online === true && (await parseServerIcon(status.icon))) {
        icon = status.icon;
        success = true;
      }
    } catch {
      /* Keep the last good icon on timeout, outage, or invalid response. */
    }
    const snapshot = { checkedAt: now(), icon };
    memory = snapshot;
    if (success && store) {
      try {
        await store.put(FAVICON_KV_KEY, JSON.stringify(snapshot));
      } catch {
        /* Memory/edge cache remain usable. */
      }
    }
    if (cache) {
      try {
        await cache.put(
          key,
          new Response(JSON.stringify(snapshot), {
            headers: {
              "Cache-Control": "public, max-age=604800",
              "Content-Type": "application/json",
            },
          }),
        );
      } catch {
        /* Best effort. */
      }
    }
    return snapshot;
  }
  return async function favicon(
    request: Request,
    store?: IconStore,
  ): Promise<Response> {
    // Browser cache-busting queries must not multiply upstream requests/cache entries.
    const key = new Request(new URL("/api/favicon-cache-v1", request.url));
    if (!pending)
      pending = refresh(key, store).finally(() => {
        pending = undefined;
      });
    const snapshot = await pending;
    if (!snapshot.icon)
      return new Response(null, {
        status: 302,
        headers: { ...CACHE_HEADERS, Location: "/favicon.ico" },
      });
    const bytes = (await parseServerIcon(snapshot.icon))!;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const etag = `"${Array.from(digest, (n) => n.toString(16).padStart(2, "0")).join("")}"`;
    const headers = {
      ...CACHE_HEADERS,
      ETag: etag,
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    };
    const matches = request.headers
      .get("If-None-Match")
      ?.split(",")
      .some(
        (value) =>
          value.trim().replace(/^W\//, "") === etag || value.trim() === "*",
      );
    return new Response(matches ? null : bytes, {
      status: matches ? 304 : 200,
      headers,
    });
  };
}
