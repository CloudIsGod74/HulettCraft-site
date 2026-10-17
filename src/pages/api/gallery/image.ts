import type { APIRoute } from "astro";
import { isPublishedKey } from "../../../lib/galleryKeys";
import { getBucket } from "../../../lib/runtime";
import { api } from "../../../lib/http";
import { imageResponse } from "../../../lib/images";
export const GET: APIRoute = ({ url, locals }) =>
  api(async () => {
    const key = url.searchParams.get("key");
    if (!isPublishedKey(key)) return new Response("Not found", { status: 404 });
    const obj = await getBucket(locals).get(key);
    return obj
      ? imageResponse(obj, true)
      : new Response("Not found", { status: 404 });
  });
