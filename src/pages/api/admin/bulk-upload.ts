import type { APIRoute } from "astro";
import { getBucket } from "../../../lib/runtime";
import { adminMutation, api, isRecord, json } from "../../../lib/http";
import { submissionMetadata } from "../../../lib/galleryKeys";
import {
  limitedForm,
  MAX_BULK_BYTES,
  safeFilename,
  validateImage,
} from "../../../lib/uploads";
export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    await adminMutation(request, locals);
    const form = await limitedForm(request, MAX_BULK_BYTES);
    const files = form.getAll("files"),
      raw = form.get("manifest");
    if (
      !files.length ||
      files.length > 20 ||
      files.some((f) => !(f instanceof File))
    )
      return new Response("Choose 1–20 images", { status: 400 });
    let manifest: unknown;
    try {
      if (typeof raw !== "string" || raw.length > 65536) throw new Error();
      manifest = JSON.parse(raw);
    } catch {
      return new Response("Invalid upload manifest", { status: 400 });
    }
    if (!Array.isArray(manifest) || manifest.length !== files.length)
      return new Response("Manifest must match every file in order", {
        status: 400,
      });
    // Validate the entire upload before writing any files.
    const prepared = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i] as File,
        entry: unknown = manifest[i];
      if (!isRecord(entry) || entry.filename !== file.name)
        return new Response("Manifest filename mismatch", { status: 400 });
      const metadata = submissionMetadata({
        get: (name: string) => entry[name],
      });
      prepared.push({ file, metadata, image: await validateImage(file) });
    }
    const results = [],
      bucket = getBucket(locals);
    for (const { file, metadata, image } of prepared) {
      const key =
        "Screenshots/" +
        metadata.world +
        "/season-" +
        metadata.season +
        "/" +
        crypto.randomUUID() +
        "-" +
        safeFilename(file.name) +
        "." +
        image.extension;
      try {
        const saved = await bucket.put(key, image.bytes, {
          httpMetadata: { contentType: image.type },
          customMetadata: metadata,
          onlyIf: { etagDoesNotMatch: "*" },
        });
        if (!saved) throw new Error("Filename conflict");
        results.push({ filename: file.name, ok: true, key });
      } catch {
        results.push({
          filename: file.name,
          ok: false,
          message: "Upload failed. Refresh the gallery before retrying.",
        });
      }
    }
    return json({ results }, results.every((r) => r.ok) ? 200 : 207);
  });
