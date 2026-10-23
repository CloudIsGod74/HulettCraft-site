import type { APIRoute } from "astro";
import { adminMutation, api, json } from "../../../../../lib/http";
import { readApplication } from "../../../../../lib/applications";
import { notifyApplication } from "../../../../../lib/applicationEmail";

export const POST: APIRoute = ({ request, locals, params }) =>
  api(async () => {
    await adminMutation(request, locals);
    const application = await readApplication(locals, params.id ?? "");
    const state = await notifyApplication(locals, application);
    if (state !== "sent")
      return new Response(
        state === "disabled"
          ? "Email is not enabled in this environment."
          : "Email could not be confirmed. The application is still saved. Check email configuration and try again.",
        { status: 503 },
      );
    return json({ sent: true });
  });
