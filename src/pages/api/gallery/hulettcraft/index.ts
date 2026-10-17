import type { APIRoute } from "astro";
import { seasonPreviews } from "../../../../lib/seasonPreviews";
import { getBucket } from "../../../../lib/runtime";
import { api, json } from "../../../../lib/http";
export const GET: APIRoute = ({ locals }) =>
  api(async () => json(await seasonPreviews(getBucket(locals))));
