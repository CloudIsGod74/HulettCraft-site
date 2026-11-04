import type { APIRoute } from "astro";
import { getBucket } from "../../../lib/runtime";
import { adminMutation, api, json, readJson } from "../../../lib/http";
import { isPublishedKey } from "../../../lib/galleryKeys";
import { updateMetadata } from "../../../lib/updateMetadata";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const { key, updates } = await readJson(request);
    if (!isPublishedKey(key))
      return new Response("Invalid published screenshot key", { status: 400 });
    const metadata = await updateMetadata(getBucket(locals), key, updates);
    return json({ metadata });
  });
