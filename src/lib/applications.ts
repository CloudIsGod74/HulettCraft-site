import {
  APPLICATION_QUESTIONS,
  APPLICATION_STATUSES,
  ENGAGEMENT_OPTIONS,
  type ApplicationStatus,
  type ApplicationView,
  isCompletedApplication,
  type QuestionId,
} from "../config/applications";
import { isRecord } from "./http";

export const APPLICATION_PREFIX = "private:join-application:v1:";
export const MAX_APPLICATION_IMAGE = 5 * 1024 * 1024;
export const APPLICATION_ID =
  /^[0-9]{13}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export interface Applicant {
  minecraft: string;
  discord: string;
  engagement: string;
  answers: Record<QuestionId, string>;
}
export interface JoinApplication extends Applicant {
  version: 1;
  id: string;
  server: "hulettcraft";
  createdAt: string;
  revision: string;
  status: ApplicationStatus;
  note: string;
  reviewedBy: string | null;
  updatedAt: string;
  screenshot?: { type: string; base64: string };
}
export interface ApplicationSummary {
  minecraft: string;
  createdAt: string;
  status: ApplicationStatus;
}
export function applicationStore(locals: App.Locals) {
  const kv = locals.runtime?.env?.SESSION;
  if (!kv)
    throw new Response(
      "Applications are temporarily unavailable. Please try again later.",
      { status: 503 },
    );
  return kv;
}
export function applicationKey(id: string, scope = "test") {
  if (!APPLICATION_ID.test(id))
    throw new Response("Application not found", { status: 404 });
  return APPLICATION_PREFIX + scope + ":" + id;
}
export function answerText(
  value: unknown,
  label: string,
  max: number,
  required = true,
) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) ||
    (required && !value.trim())
  )
    throw new Response(`Please enter ${label} (up to ${max} characters).`, {
      status: 400,
    });
  return value.trim();
}
export function validateApplicant(input: Record<string, unknown>): Applicant {
  const minecraft = answerText(
    input.minecraft,
    "your Minecraft Java username",
    16,
  );
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraft))
    throw new Response(
      "Use your Minecraft Java username: 3–16 letters, numbers or underscores.",
      { status: 400 },
    );
  const discord = answerText(input.discord, "your Discord username", 100);
  if (
    typeof input.engagement !== "string" ||
    !ENGAGEMENT_OPTIONS.some((option) => option.value === input.engagement)
  )
    throw new Response(
      "Choose how engaged you’d like to be with other players.",
      { status: 400 },
    );
  const answers = {} as Record<QuestionId, string>;
  for (const question of APPLICATION_QUESTIONS)
    answers[question.id] = answerText(
      input[question.id] ?? "",
      question.label,
      question.max,
      question.required,
    );
  return { minecraft, discord, engagement: input.engagement, answers };
}
export function newApplication(
  applicant: Applicant,
  screenshot?: JoinApplication["screenshot"],
  now = Date.now(),
): JoinApplication {
  const createdAt = new Date(now).toISOString();
  // Reverse timestamp orders KV listing pages newest first, without loading records.
  const id =
    String(9_999_999_999_999 - now).padStart(13, "0") +
    "-" +
    crypto.randomUUID();
  return {
    ...applicant,
    version: 1,
    id,
    server: "hulettcraft",
    createdAt,
    revision: crypto.randomUUID(),
    status: "new",
    note: "",
    reviewedBy: null,
    updatedAt: createdAt,
    ...(screenshot ? { screenshot } : {}),
  };
}
export function applicationSummary(
  application: JoinApplication,
): ApplicationSummary {
  return {
    minecraft: application.minecraft,
    createdAt: application.createdAt,
    status: application.status,
  };
}
export async function saveApplication(
  locals: App.Locals,
  application: JoinApplication,
) {
  // One private KV value contains the entire submission, including its attachment.
  // No partial image writes, public gallery objects or session keys are involved.
  await applicationStore(locals).put(
    applicationKey(application.id, locals.applicationScope),
    JSON.stringify(application),
    { metadata: applicationSummary(application) },
  );
}
export async function readApplication(
  locals: App.Locals,
  id: string,
): Promise<JoinApplication> {
  const saved = await applicationStore(locals).get(
    applicationKey(id, locals.applicationScope),
  );
  if (saved === null)
    throw new Response("Application not found", { status: 404 });
  try {
    const data: unknown = JSON.parse(saved);
    if (
      !isRecord(data) ||
      data.version !== 1 ||
      data.id !== id ||
      data.server !== "hulettcraft" ||
      !isRecord(data.answers) ||
      typeof data.revision !== "string" ||
      !/^[a-f0-9-]{36}$/.test(data.revision) ||
      typeof data.createdAt !== "string" ||
      !Number.isFinite(Date.parse(data.createdAt)) ||
      typeof data.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(data.updatedAt)) ||
      !APPLICATION_STATUSES.some((status) => status.value === data.status) ||
      typeof data.note !== "string" ||
      data.note.length > 3000 ||
      !(data.reviewedBy === null || typeof data.reviewedBy === "string")
    )
      throw new Error();
    validateApplicant({
      minecraft: data.minecraft,
      discord: data.discord,
      engagement: data.engagement,
      ...data.answers,
    });
    if (
      data.screenshot !== undefined &&
      (!isRecord(data.screenshot) ||
        !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
          String(data.screenshot.type),
        ) ||
        typeof data.screenshot.base64 !== "string" ||
        data.screenshot.base64.length >
          Math.ceil(MAX_APPLICATION_IMAGE / 3) * 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(data.screenshot.base64))
    )
      throw new Error();
    return data as unknown as JoinApplication;
  } catch {
    throw new Response(
      "This application could not be loaded. No changes have been made.",
      { status: 503 },
    );
  }
}
export async function listApplications(
  locals: App.Locals,
  cursor?: string,
  view: ApplicationView = "active",
) {
  if (cursor && cursor.length > 4096)
    throw new Response("Invalid page cursor", { status: 400 });
  const prefix = APPLICATION_PREFIX + (locals.applicationScope ?? "test") + ":";
  const applications: (ApplicationSummary & { id: string })[] = [];
  let next = cursor;
  // Filter metadata rather than loading private answers/attachments. Request only
  // the remaining places so the underlying cursor never skips a matching record.
  // Bound sparse scans; an unfinished scan keeps its continuation, even if empty.
  for (let scan = 0; scan < 10; scan++) {
    const page = await applicationStore(locals).list<ApplicationSummary>({
      prefix,
      limit: 25 - applications.length,
      ...(next ? { cursor: next } : {}),
    });
    for (const key of page.keys) {
      if (
        !key.name.startsWith(prefix) ||
        !APPLICATION_ID.test(key.name.slice(prefix.length))
      )
        continue;
      const summary = key.metadata;
      if (
        !summary ||
        typeof summary.minecraft !== "string" ||
        typeof summary.createdAt !== "string" ||
        !APPLICATION_STATUSES.some((status) => status.value === summary.status)
      )
        throw new Response(
          "Applications could not be listed. Please try again.",
          { status: 503 },
        );
      const completed = isCompletedApplication(summary.status);
      if (view !== "all" && (view === "completed") !== completed) continue;
      applications.push({
        id: key.name.slice(prefix.length),
        minecraft: summary.minecraft,
        createdAt: summary.createdAt,
        status: summary.status,
      });
    }
    if (page.list_complete) return { applications, cursor: undefined };
    if (!page.cursor || page.cursor === next)
      throw new Response(
        "Applications could not be listed. Please try again.",
        { status: 503 },
      );
    next = page.cursor;
    if (applications.length === 25) break;
  }
  return { applications, cursor: next };
}

export function encodeScreenshot(bytes: Uint8Array) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
