export interface CommunityMember {
  username: string;
  displayName: string;
  active: boolean;
  bio?: string;
  links?: { label: string; url: string }[];
  avatar?: { type: "minecraft" } | { type: "upload"; id: string };
}
// Initial roster before the first admin save. Social links are optional.
// This is a curated directory, not the currently-online player list.
export const COMMUNITY_MEMBERS: CommunityMember[] = [];

export function minecraftAvatar(username: string) {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username)
    ? `https://mc-heads.net/avatar/${username}/128`
    : "";
}

export function activeMembers(members = COMMUNITY_MEMBERS) {
  return members.filter((member) => member.active);
}

export function memberLinks(member: CommunityMember) {
  return (member.links ?? []).filter((link) => {
    try {
      const url = new URL(link.url);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        link.label.trim().length > 0
      );
    } catch {
      return false;
    }
  });
}
