import type { APIRoute } from "astro";
import { adminMutation, api, json } from "../../../lib/http";
import { requireAdmin } from "../../../lib/requireAdmin";
import { rosterStorage } from "../../../lib/communityRoster";
import { limitedForm } from "../../../lib/uploads";
import {
  memberImage,
  memberImageKey,
  readMemberImage,
} from "../../../lib/memberImages";

export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const form = await limitedForm(request, 128 * 1024);
    const file = form.get("image");
    if (!(file instanceof File))
      return new Response("Choose a member image.", { status: 400 });
    const image = await memberImage(file);
    const kv = rosterStorage(locals),
      key = memberImageKey(image.id);
    if ((await kv.get(key)) === null) await kv.put(key, image.src);
    return json(image);
  });
export const GET: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    const src = await readMemberImage(
      locals,
      new URL(request.url).searchParams.get("id") ?? "",
    );
    return src
      ? json({ src })
      : new Response("Member image unavailable", { status: 404 });
  });
