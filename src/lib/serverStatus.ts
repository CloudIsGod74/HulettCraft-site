import { SERVERS, type ServerId } from "../config/servers";
import { isRecord } from "./http";
export interface ServerStatus {
  state: "online" | "offline" | "unavailable";
  players?: { online: number; max: number };
  version?: string;
}
export async function getServerStatuses(
  fetcher: typeof fetch = fetch,
): Promise<Record<ServerId, ServerStatus>> {
  const pairs = await Promise.all(
    SERVERS.map(async (server): Promise<[ServerId, ServerStatus]> => {
      if (!("host" in server)) return [server.id, { state: "unavailable" }];
      try {
        const res = await fetcher(
          "https://api.mcstatus.io/v2/status/java/" +
            server.host +
            ":" +
            server.port,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) throw new Error("Status provider unavailable");
        const data: unknown = await res.json();
        if (!isRecord(data) || typeof data.online !== "boolean")
          throw new Error("Invalid status");
        if (!data.online) return [server.id, { state: "offline" }];
        if (!isRecord(data.players) || !isRecord(data.version))
          throw new Error("Missing server details");
        const online = data.players.online,
          max = data.players.max,
          version = data.version.name_clean;
        if (
          typeof online !== "number" ||
          !Number.isSafeInteger(online) ||
          online < 0 ||
          typeof max !== "number" ||
          !Number.isSafeInteger(max) ||
          max < 0 ||
          typeof version !== "string"
        )
          throw new Error("Invalid server details");
        return [
          server.id,
          {
            state: "online",
            players: { online, max },
            version: version.slice(0, 120),
          },
        ];
      } catch {
        return [server.id, { state: "unavailable" }];
      }
    }),
  );
  return Object.fromEntries(pairs) as Record<ServerId, ServerStatus>;
}
export const statusHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=30, s-maxage=30",
  "X-Content-Type-Options": "nosniff",
};
