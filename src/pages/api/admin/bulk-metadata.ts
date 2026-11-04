import type { APIRoute } from "astro";
import { adminMutation, api, json, readJson } from "../../../lib/http";
import { isPublishedKey, metadataText } from "../../../lib/galleryKeys";
import { getBucket } from "../../../lib/runtime";
import { updateMetadata } from "../../../lib/updateMetadata";

export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const body = await readJson(request);
    if (
      Object.keys(body).some(
        (key) => !["keys", "author", "clearAuthor"].includes(key),
      ) ||
      !Array.isArray(body.keys) ||
      !body.keys.length ||
      body.keys.length > 50 ||
      !body.keys.every(isPublishedKey) ||
      (body.clearAuthor !== undefined && typeof body.clearAuthor !== "boolean")
    )
      return new Response(
        "Choose 1–50 published screenshots and a valid author action.",
        { status: 400 },
      );
    const author = metadataText(body.author, 100);
    if ((body.clearAuthor && author) || (!body.clearAuthor && !author))
      return new Response("Enter an author or explicitly choose to clear it.", {
        status: 400,
      });
    const keys = [...new Set(body.keys as string[])];
    const updates = body.clearAuthor ? { clearFields: ["author"] } : { author };
    const bucket = getBucket(locals),
      results = [];
    // R2 has no multi-object transaction. Report each result and never retry invisibly.
    for (const key of keys) {
      try {
        const metadata = await updateMetadata(bucket, key, updates);
        results.push({ key, ok: true, metadata });
      } catch (error) {
        results.push({
          key,
          ok: false,
          message:
            error instanceof Response
              ? await error.text()
              : "Could not confirm this edit. Refresh before retrying.",
        });
      }
    }
    return json({ results }, results.every((result) => result.ok) ? 200 : 207);
  });
