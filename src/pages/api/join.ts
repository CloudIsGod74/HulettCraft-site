import type { APIRoute } from "astro";
import { APPLICATION_QUESTIONS } from "../../config/applications";
import { api, json } from "../../lib/http";
import {
  applicationStore,
  encodeScreenshot,
  MAX_APPLICATION_IMAGE,
  newApplication,
  saveApplication,
  validateApplicant,
} from "../../lib/applications";
import { limitedForm, validateImage } from "../../lib/uploads";

export const POST: APIRoute = ({ request, locals }) =>
  api(async () => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return new Response("Forbidden origin", { status: 403 });
    applicationStore(locals); // Fail closed before reading an upload if private storage is absent.
    const limiter = locals.runtime?.env?.UPLOAD_RATE_LIMITER;
    if (
      limiter &&
      !(
        await limiter.limit({
          key:
            "join:" +
            (locals.applicationScope ?? "test") +
            ":" +
            (request.headers.get("CF-Connecting-IP") ?? "unknown"),
        })
      ).success
    )
      return new Response(
        "Too many applications. Please wait before trying again.",
        { status: 429, headers: { "Retry-After": "60" } },
      );
    const form = await limitedForm(request, MAX_APPLICATION_IMAGE + 64 * 1024);
    if (form.get("website"))
      return new Response("Unable to submit this application.", {
        status: 400,
      });
    const fields = [
      "minecraft",
      "discord",
      "engagement",
      "acknowledgement",
      "website",
      "screenshot",
      ...APPLICATION_QUESTIONS.map((question) => question.id),
    ];
    for (const key of form.keys())
      if (!fields.includes(key) || form.getAll(key).length !== 1)
        return new Response("Invalid application fields", { status: 400 });
    if (form.get("acknowledgement") !== "yes")
      return new Response(
        "Please confirm you understand how your application will be reviewed.",
        { status: 400 },
      );
    const applicant = validateApplicant(Object.fromEntries(form));
    const file = form.get("screenshot");
    let screenshot;
    if (file instanceof File && (file.size || file.name)) {
      if (file.size > MAX_APPLICATION_IMAGE)
        return new Response(
          "The optional screenshot must be no larger than 5 MiB.",
          { status: 413 },
        );
      const image = await validateImage(file);
      screenshot = { type: image.type, base64: encodeScreenshot(image.bytes) };
      // Native empty file inputs may be parsed as an empty string by workerd.
    } else if (file !== null && file !== "" && !(file instanceof File))
      return new Response("Choose a screenshot file or leave it empty.", {
        status: 400,
      });
    const application = newApplication(applicant, screenshot);
    await saveApplication(locals, application);
    return request.headers.get("accept")?.includes("application/json")
      ? json({ received: true }, 201)
      : new Response(null, {
          status: 303,
          headers: { Location: "/join/thanks", "Cache-Control": "no-store" },
        });
  });
