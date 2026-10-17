import { HULETTCRAFT } from "../config/hulettcraft";
export const PENDING_PREFIX = "Screenshots - Need Approval/";
export const WORLDS = ["hulettcraft", "hytale", "modded"] as const;
export type World = (typeof WORLDS)[number];
export function isWorld(value: unknown): value is World {
  return typeof value === "string" && WORLDS.includes(value as World);
}
function safeLeaf(filename: string) {
  return (
    filename.length > 0 &&
    filename.length <= 512 &&
    filename !== "." &&
    filename !== ".." &&
    !/[\\/\x00-\x1f\x7f]/.test(filename)
  );
}
export function isPendingKey(key: unknown): key is string {
  if (typeof key !== "string" || !key.startsWith(PENDING_PREFIX)) return false;
  const filename = key.slice(PENDING_PREFIX.length);
  return safeLeaf(filename) && !/[%?#]/.test(filename);
}
export function isPublishedKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const match = key.match(
    /^Screenshots\/(hulettcraft|hytale|modded)\/season-(unknown|[1-9][0-9]*)\/(.+)$/,
  );
  return !!match && safeLeaf(match[3]);
}
export function normalizedSeason(value: unknown, world: World): string {
  if (value === "" || value === undefined || value === null)
    return world === "hulettcraft"
      ? String(HULETTCRAFT.currentSeason)
      : "unknown";
  if (value === "unknown") return "unknown";
  const str = String(value);
  if (!/^[1-9][0-9]{0,3}$/.test(str))
    throw new Response("Invalid season", { status: 400 });
  return str;
}
export function submissionMetadata(form: { get(name: string): unknown }) {
  const world = form.get("world");
  if (!isWorld(world))
    throw new Response("Choose a valid world", { status: 400 });
  return {
    world,
    season: normalizedSeason(form.get("season"), world),
    description: metadataText(form.get("description"), 2000),
    author: metadataText(form.get("author"), 100),
  };
}
export function metadataText(value: unknown, max: number): string {
  if (value === undefined || value === null) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
  )
    throw new Response("Invalid or excessive metadata", { status: 400 });
  return value.trim();
}
