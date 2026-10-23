import { FAVICON_INTERVAL_MS } from "../config/favicon";
import { SERVERS } from "../config/servers";
import {
  boundedBytes,
  parseServerIcon,
  validateServerPng,
  serverIconDataUri,
  MAX_ICON_BYTES,
} from "./serverIcon";

export const FAVICON_KV_KEY = "public:server-favicon:v1:hulettcraft";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=300, must-revalidate",
};
const FAILURES = [
  "network",
  "http",
  "content-type",
  "invalid-png",
  "provider-default",
] as const;
type Failure = (typeof FAILURES)[number];
class IconError extends Error {
  constructor(readonly reason: Failure) {
    super(reason);
  }
}
interface Snapshot {
  checkedAt: number;
  icon: string | null;
  failure?: Failure;
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
      return {
        checkedAt: value.checkedAt,
        icon: value.icon,
        ...(FAILURES.includes(value.failure) ? { failure: value.failure } : {}),
      };
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
    let failure: Failure | undefined;
    async function retrieve(url: string): Promise<Uint8Array<ArrayBuffer>> {
      const response = await fetcher(url, {
        // Allow the provider's own five-second server timeout to complete.
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
        headers: { Accept: "image/png" },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new IconError("http");
      }
      if (
        response.headers
          .get("Content-Type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() !== "image/png"
      ) {
        await response.body?.cancel();
        throw new IconError("content-type");
      }
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await boundedBytes(response, MAX_ICON_BYTES);
      } catch {
        throw new IconError("invalid-png");
      }
      if (!(await validateServerPng(bytes))) throw new IconError("invalid-png");
      return bytes;
    }
    try {
      const server = SERVERS.find((server) => server.id === "hulettcraft")!;
      // The icon API also returns HTTP 200 + a default PNG for offline servers.
      // Compare against that fixed endpoint; a valid PNG alone is not proof of success.
      const [candidate, providerDefault] = await Promise.all([
        retrieve(`https://api.mcstatus.io/v2/icon/${server.address}`),
        retrieve("https://api.mcstatus.io/v2/icon/"),
      ]);
      if (
        candidate.length === providerDefault.length &&
        candidate.every((byte, i) => byte === providerDefault[i])
      )
        throw new IconError("provider-default");
      icon = serverIconDataUri(candidate);
      success = true;
    } catch (error) {
      failure = error instanceof IconError ? error.reason : "network";
      console.warn(
        "[favicon] refresh failed",
        failure,
        error instanceof Error ? error.message : "unknown error",
      );
      // Never overwrite last-good KV data with an outage/default/malformed response.
    }
    const snapshot: Snapshot = {
      checkedAt: now(),
      icon,
      ...(failure ? { failure } : {}),
    };
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
    const key = new Request(new URL("/api/favicon-cache-v2", request.url));
    if (!pending)
      pending = refresh(key, store).finally(() => {
        pending = undefined;
      });
    const snapshot = await pending;
    const diagnosticHeaders: Record<string, string> = {
      "X-Favicon-Source": snapshot.icon
        ? snapshot.failure
          ? "last-known-good"
          : "mcstatus"
        : "local-fallback",
      ...(snapshot.failure ? { "X-Favicon-Failure": snapshot.failure } : {}),
    };
    if (!snapshot.icon)
      return new Response(null, {
        status: 302,
        headers: {
          ...CACHE_HEADERS,
          ...diagnosticHeaders,
          Location: "/favicon.ico",
        },
      });
    const bytes = (await parseServerIcon(snapshot.icon))!;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const etag = `"${Array.from(digest, (n) => n.toString(16).padStart(2, "0")).join("")}"`;
    const headers = {
      ...CACHE_HEADERS,
      ...diagnosticHeaders,
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
