import { isRecord } from "./http";
import type { ServerStatus } from "./serverStatus";

export const DEFAULT_HYTALE_QUERY_URL =
  "https://hytale.hulettcraft.com:5523/Nitrado/Query";
export const HYTALE_QUERY_ACCEPT =
  "application/x.hytale.nitrado.query+json;version=1";
let lastFailure = "";

export function hytaleQueryUrl(value = DEFAULT_HYTALE_QUERY_URL) {
  if (!value) return null; // An explicit empty setting disables the optional check.
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["hytale.hulettcraft.com", "hytale-status.hulettcraft.com"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.pathname !== "/Nitrado/Query" ||
      url.search ||
      url.hash
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
async function queryJson(response: Response): Promise<unknown> {
  if (response.status === 401 || response.status === 403)
    throw new Error("Query permission denied");
  const type = response.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    !response.ok ||
    !["application/json", "application/x.hytale.nitrado.query+json"].includes(
      type ?? "",
    ) ||
    Number(response.headers.get("Content-Length")) > 65536 ||
    !response.body
  )
    throw new Error("Invalid query response");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new Error("Query response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function parseHytaleQuery(data: unknown): ServerStatus {
  if (!isRecord(data)) throw new Error("Invalid Hytale query");
  // Basic is the documented minimal permission. Older plugins may provide
  // Server + Universe instead. Never return player identities or plugin lists.
  const basic = data.Basic;
  const details = basic === undefined ? data.Server : basic;
  const universe = basic === undefined ? data.Universe : basic;
  if (!isRecord(details) || !isRecord(universe))
    throw new Error("Missing query details");
  const online = universe.CurrentPlayers,
    max = details.MaxPlayers,
    version = details.Version;
  if (
    typeof online !== "number" ||
    !Number.isSafeInteger(online) ||
    online < 0 ||
    typeof max !== "number" ||
    !Number.isSafeInteger(max) ||
    max < 0 ||
    typeof version !== "string" ||
    !version.trim()
  )
    throw new Error("Invalid query details");
  return {
    state: "online",
    players: { online, max },
    version: version.slice(0, 120),
  };
}
export async function getHytaleStatus(
  fetcher: typeof fetch = fetch,
  configuredUrl?: string,
): Promise<ServerStatus> {
  const url = hytaleQueryUrl(configuredUrl);
  if (!url) return { state: "unavailable" };
  try {
    const response = await fetcher(url, {
      headers: { Accept: HYTALE_QUERY_ACCEPT },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const status = parseHytaleQuery(await queryJson(response));
    lastFailure = "";
    return status;
  } catch (error) {
    // A missing plugin, invalid TLS certificate or denied query does not prove
    // the game is offline. Only a valid response establishes online status.
    const known = [
      "Query permission denied",
      "Invalid query response",
      "Query response too large",
      "Invalid Hytale query",
      "Missing query details",
      "Invalid query details",
    ];
    const reason =
      error instanceof Error && known.includes(error.message)
        ? error.message
        : "Query connection or JSON parsing failed";
    if (lastFailure !== reason) console.warn("[hytale-query]", reason);
    lastFailure = reason;
    return { state: "unavailable" };
  }
}
