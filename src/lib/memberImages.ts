import { minecraftAvatar, type CommunityMember } from "../config/community";
import { rosterStorage } from "./communityRoster";
import { validateImage } from "./uploads";

export const MEMBER_IMAGE_PREFIX = "public:member-image:v1:";
export const MAX_MEMBER_IMAGE_BYTES = 96 * 1024;
export function memberImageKey(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new Response("Invalid member image", { status: 400 });
  return MEMBER_IMAGE_PREFIX + id;
}
export async function memberImage(file: File) {
  if (!file.size || file.size > MAX_MEMBER_IMAGE_BYTES)
    throw new Response("Member images must be at most 96 KiB after resizing.", {
      status: 413,
    });
  const image = await validateImage(file);
  if (image.width > 512 || image.height > 512)
    throw new Response("Member images must be at most 512 × 512 pixels.", {
      status: 400,
    });
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", image.bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const src = `data:${image.type};base64,${btoa(Array.from(image.bytes, (b) => String.fromCharCode(b)).join(""))}`;
  return { id, src };
}
export async function readMemberImage(locals: App.Locals, id: string) {
  const src = await rosterStorage(locals).get(memberImageKey(id));
  if (!src || src.length > 132000) return null;
  const match = src.match(
    /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    const checked = await memberImage(new File([bytes], "member"));
    return checked.id === id && checked.src === src ? src : null;
  } catch {
    return null;
  }
}
export async function memberAvatarSource(
  member: CommunityMember,
  locals: App.Locals,
) {
  if (member.avatar?.type === "minecraft")
    return minecraftAvatar(member.username);
  if (member.avatar?.type === "upload") {
    try {
      return await readMemberImage(locals, member.avatar.id);
    } catch {
      return null;
    } // Image outages must not hide the member's profile.
  }
  return null;
}
