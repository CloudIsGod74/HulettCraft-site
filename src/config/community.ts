export interface CommunityMember {
  username: string;
  displayName: string;
  active: boolean;
  bio?: string;
  links?: { label: string; url: string }[];
}
// Add the confirmed active roster here. Social links are optional.
// This is a curated directory, not the currently-online player list.
export const COMMUNITY_MEMBERS: CommunityMember[] = [];

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
