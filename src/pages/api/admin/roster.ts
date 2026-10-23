import type { APIRoute } from "astro";
import { adminMutation, api, json, readJson } from "../../../lib/http";
import { requireAdmin } from "../../../lib/requireAdmin";
import {
  readRoster,
  rosterStorage,
  ROSTER_KEY,
  validateMembers,
} from "../../../lib/communityRoster";

export const GET: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    return json(await readRoster(locals));
  });
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const body = await readJson(request);
    if (
      typeof body.revision !== "string" ||
      Object.keys(body).some((key) => !["revision", "members"].includes(key))
    )
      return new Response("Invalid roster request", { status: 400 });
    const members = validateMembers(body.members);
    const current = await readRoster(locals);
    if (body.revision !== current.revision)
      return new Response(
        "The roster changed since you loaded it. Copy your edits before reloading and reviewing the latest roster.",
        { status: 409 },
      );
    const roster = {
      revision: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      members,
    };
    // KV is eventually consistent. This revision check detects observed stale edits,
    // but is not a global atomic lock: keep to one roster editor at a time.
    await rosterStorage(locals).put(ROSTER_KEY, JSON.stringify(roster));
    return json(roster);
  });
