import type { APIRoute } from "astro";
import { listGallery } from "../../../../../../lib/gallery";
import { getBucket } from "../../../../../../lib/runtime";
import { api, json } from "../../../../../../lib/http";
export const GET: APIRoute = ({ params, locals }) =>
  api(async () => {
    if (!params.season || !/^([1-9][0-9]{0,3}|unknown)$/.test(params.season))
      return new Response("Invalid season", { status: 400 });
    return json(
      await listGallery(getBucket(locals), "hulettcraft", params.season),
    );
  });
