import { COMMUNITY_MEMBERS, type CommunityMember } from "../config/community";
import { isRecord } from "./http";

export const ROSTER_KEY = "public:community-roster:v1";
export const MAX_MEMBERS = 200;
export interface CommunityRoster {
  revision: string;
  updatedAt: string | null;
  members: CommunityMember[];
}

function invalid(message: string): never {
  throw new Response(message, { status: 400 });
}
function text(value: unknown, name: string, max: number, optional = false) {
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > max)
    return invalid(`${name} must be text of at most ${max} characters.`);
  const result = value.trim();
  if (!optional && !result) return invalid(`${name} is required.`);
  return result;
}
export function validateMembers(value: unknown): CommunityMember[] {
  if (!Array.isArray(value) || value.length > MAX_MEMBERS)
    return invalid(`The roster must contain at most ${MAX_MEMBERS} members.`);
  const usernames = new Set<string>();
  const members = value.map((entry, index): CommunityMember => {
    const name = `Member ${index + 1}`;
    if (
      !isRecord(entry) ||
      Object.keys(entry).some(
        (key) =>
          ![
            "username",
            "displayName",
            "active",
            "bio",
            "links",
            "avatar",
          ].includes(key),
      )
    )
      return invalid(`${name} has invalid fields.`);
    const username = text(entry.username, `${name} Minecraft username`, 16);
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username))
      return invalid(
        `${name} needs a Minecraft username (3–16 letters, numbers or underscores).`,
      );
    if (usernames.has(username.toLowerCase()))
      return invalid(`Duplicate Minecraft username: ${username}.`);
    usernames.add(username.toLowerCase());
    const displayName = text(entry.displayName, `${name} display name`, 80);
    if (typeof entry.active !== "boolean")
      return invalid(`${name} needs an active status.`);
    const bio = text(entry.bio, `${name} bio`, 500, true);
    const rawLinks = entry.links ?? [];
    if (!Array.isArray(rawLinks) || rawLinks.length > 8)
      return invalid(`${name} may have up to eight links.`);
    const links = rawLinks.map((link) => {
      if (
        !isRecord(link) ||
        Object.keys(link).some((key) => !["label", "url"].includes(key))
      )
        return invalid(`${name} has an invalid link.`);
      const label = text(link.label, `${name} link label`, 40);
      const url = text(link.url, `${name} link URL`, 2048);
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password)
          throw new Error();
      } catch {
        return invalid(
          `${name} links must use HTTPS without embedded credentials.`,
        );
      }
      return { label, url };
    });
    let avatar: CommunityMember["avatar"];
    if (entry.avatar !== undefined) {
      const value = entry.avatar;
      if (!isRecord(value))
        return invalid(`${name} has an invalid member image.`);
      if (value.type === "minecraft" && Object.keys(value).length === 1)
        avatar = { type: "minecraft" };
      else if (
        value.type === "upload" &&
        Object.keys(value).length === 2 &&
        typeof value.id === "string" &&
        /^[a-f0-9]{64}$/.test(value.id)
      )
        avatar = { type: "upload", id: value.id };
      else return invalid(`${name} has an invalid member image.`);
    }
    return {
      username,
      displayName,
      active: entry.active,
      ...(bio ? { bio } : {}),
      ...(links.length ? { links } : {}),
      ...(avatar ? { avatar } : {}),
    };
  });
  if (new TextEncoder().encode(JSON.stringify(members)).length > 60000)
    return invalid(
      "The roster is too large. Shorten biographies or links and try again.",
    );
  return members;
}

export function rosterStorage(locals: App.Locals) {
  const kv = locals.runtime?.env?.SESSION;
  if (!kv)
    throw new Response(
      "Member storage is unavailable. Please try again later.",
      { status: 503 },
    );
  return kv;
}
export async function readRoster(locals: App.Locals): Promise<CommunityRoster> {
  const saved = await rosterStorage(locals).get(ROSTER_KEY);
  if (saved === null)
    return {
      revision: "unpublished",
      updatedAt: null,
      members: validateMembers(COMMUNITY_MEMBERS),
    };
  try {
    const parsed: unknown = JSON.parse(saved);
    if (
      !isRecord(parsed) ||
      typeof parsed.revision !== "string" ||
      !/^[a-f0-9-]{36}$/.test(parsed.revision) ||
      typeof parsed.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.updatedAt))
    )
      throw new Error();
    return {
      revision: parsed.revision,
      updatedAt: parsed.updatedAt,
      members: validateMembers(parsed.members),
    };
  } catch {
    throw new Response(
      "The saved roster could not be loaded. No changes have been saved.",
      { status: 503 },
    );
  }
}
