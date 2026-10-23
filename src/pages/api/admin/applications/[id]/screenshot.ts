import type { APIRoute } from "astro";
import { api } from "../../../../../lib/http";
import { readApplication } from "../../../../../lib/applications";
import { requireAdmin } from "../../../../../lib/requireAdmin";
export const GET: APIRoute = ({ request, locals, params }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    const { screenshot } = await readApplication(locals, params.id ?? "");
    if (!screenshot)
      return new Response("No screenshot attached", { status: 404 });
    const bytes = Uint8Array.from(atob(screenshot.base64), (character) =>
      character.charCodeAt(0),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": screenshot.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
