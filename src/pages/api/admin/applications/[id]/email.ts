import type { APIRoute } from "astro";
import { adminMutation, api, json } from "../../../../../lib/http";
import { readApplication } from "../../../../../lib/applications";
import {
  notifyApplication,
  readApplicationEmailDetails,
  emailFailureMessage,
} from "../../../../../lib/applicationEmail";

export const POST: APIRoute = ({ request, locals, params }) =>
  api(async () => {
    await adminMutation(request, locals);
    const application = await readApplication(locals, params.id ?? "");
    const state = await notifyApplication(locals, application);
    if (state !== "sent") {
      let message =
        state === "disabled"
          ? "Email is not enabled in this environment."
          : state === "unrecorded"
            ? "Email acceptance could not be recorded. Check Cloudflare activity before retrying to avoid duplicates."
            : "Email could not be confirmed. The application is still saved.";
      if (state === "failed") {
        try {
          const details = await readApplicationEmailDetails(
            locals,
            application.id,
          );
          if (details.failure)
            message += " " + emailFailureMessage(details.failure);
        } catch {
          /* Keep a generic result if private delivery state is unavailable. */
        }
      }
      return new Response(message, {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
    return json({ sent: true });
  });
