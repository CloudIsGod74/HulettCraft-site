import type { APIRoute } from "astro";
import { adminMutation, api, json, readJson } from "../../../lib/http";
import { requireAdmin } from "../../../lib/requireAdmin";
import {
  readModdedGuide,
  moddedGuideStorage,
  MODDED_GUIDE_KEY,
  validateModdedGuide,
} from "../../../lib/moddedGuide";

export const GET: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    return json(await readModdedGuide(locals));
  });
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const body = await readJson(request);
    if (
      typeof body.revision !== "string" ||
      Object.keys(body).some((key) => !["revision", "guide"].includes(key))
    )
      return new Response("Invalid client setup request", { status: 400 });
    const guide = validateModdedGuide(body.guide),
      current = await readModdedGuide(locals);
    if (body.revision !== current.revision)
      return new Response(
        "Client setup changed since you loaded it. Copy your edits before reloading and reviewing the latest version.",
        { status: 409 },
      );
    const saved = {
      revision: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      guide,
    };
    await moddedGuideStorage(locals).put(
      MODDED_GUIDE_KEY,
      JSON.stringify(saved),
    );
    return json(saved);
  });
