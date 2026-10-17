import type { APIRoute } from "astro";
import { createFaviconService } from "../../lib/favicon";
export const prerender = false;
// Cloudflare's default cache is optional in ordinary Node development/tests.
const edgeCache =
  typeof caches === "undefined"
    ? undefined
    : (caches as CacheStorage & { default?: Cache }).default;
const favicon = createFaviconService({ cache: edgeCache });
export const GET: APIRoute = ({ request, locals }) =>
  favicon(request, locals.runtime?.env?.SESSION);
