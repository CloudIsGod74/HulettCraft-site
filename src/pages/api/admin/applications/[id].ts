import type { APIRoute } from "astro";
import { APPLICATION_STATUSES } from "../../../../config/applications";
import { adminMutation, api, json, readJson } from "../../../../lib/http";
import {
  answerText,
  applicationKey,
  applicationStore,
  readApplication,
  saveApplication,
} from "../../../../lib/applications";
import { requireAdmin } from "../../../../lib/requireAdmin";
import { applicationEmailKey } from "../../../../lib/applicationEmail";

export const GET: APIRoute = ({ request, locals, params }) =>
  api(async () => {
    if (!(await requireAdmin(request, locals)))
      return new Response("Unauthorized", { status: 401 });
    const application = await readApplication(locals, params.id ?? "");
    const { screenshot, ...details } = application;
    return json({ ...details, hasScreenshot: !!screenshot });
  });
export const POST: APIRoute = ({ request, locals, params }) =>
  api(async () => {
    await adminMutation(request, locals);
    const body = await readJson(request);
    if (
      Object.keys(body).some(
        (key) => !["status", "note", "revision"].includes(key),
      ) ||
      typeof body.revision !== "string" ||
      !APPLICATION_STATUSES.some((status) => status.value === body.status)
    )
      return new Response("Invalid review", { status: 400 });
    const note = answerText(body.note, "a review note", 3000, false);
    const application = await readApplication(locals, params.id ?? "");
    if (application.revision !== body.revision)
      return new Response(
        "This application changed since you opened it. Keep your notes, then reload to review the latest version.",
        { status: 409 },
      );
    application.status = body.status as typeof application.status;
    application.note = note;
    application.updatedAt = new Date().toISOString();
    application.reviewedBy = await requireAdmin(request, locals);
    application.revision = crypto.randomUUID();
    await saveApplication(locals, application);
    return json({ saved: true, revision: application.revision });
  });
export const DELETE: APIRoute = ({ request, locals, params }) =>
  api(async () => {
    await adminMutation(request, locals);
    const body = await readJson(request);
    if (
      typeof body.revision !== "string" ||
      Object.keys(body).some((key) => key !== "revision")
    )
      return new Response("Invalid deletion request", { status: 400 });
    const application = await readApplication(locals, params.id ?? "");
    if (body.revision !== application.revision)
      return new Response(
        "This application changed. Reload before deleting it.",
        { status: 409 },
      );
    await applicationStore(locals).delete(
      applicationEmailKey(locals, application.id),
    );
    await applicationStore(locals).delete(
      applicationKey(application.id, locals.applicationScope),
    );
    return json({ deleted: true });
  });
