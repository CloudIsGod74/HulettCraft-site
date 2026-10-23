import {
  APPLICATION_QUESTIONS,
  ENGAGEMENT_OPTIONS,
} from "../config/applications";
import {
  applicationKey,
  applicationStore,
  type JoinApplication,
} from "./applications";
import { isRecord } from "./http";

export const APPLICATION_EMAIL_TO = "support@hulettcraft.com";
export const APPLICATION_EMAIL_PREFIX = "private:join-email:v1:";
export type EmailState = "sent" | "failed" | "unrecorded";

export function applicationEmailKey(locals: App.Locals, id: string) {
  // Reuse the application ID validation and environment isolation.
  return APPLICATION_EMAIL_PREFIX + applicationKey(id, locals.applicationScope);
}

export function emailConfiguration(locals: App.Locals) {
  const env = locals.runtime?.env;
  if (env?.APPLICATION_EMAIL_ENABLED !== "true") return undefined;
  if (
    locals.applicationScope !== "production" &&
    env.APPLICATION_EMAIL_PREVIEW_ENABLED !== "true"
  )
    return undefined;
  if (
    !env.RESEND_API_KEY ||
    !/^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)*hulettcraft\.com$/.test(
      env.APPLICATION_EMAIL_FROM ?? "",
    )
  )
    throw new Error("Application email sender or API key is not configured");
  return { key: env.RESEND_API_KEY, from: env.APPLICATION_EMAIL_FROM! };
}

export async function readApplicationEmail(
  locals: App.Locals,
  id: string,
): Promise<EmailState> {
  const saved = await applicationStore(locals).get(
    applicationEmailKey(locals, id),
  );
  if (!saved) return "unrecorded";
  const data: unknown = JSON.parse(saved);
  if (!isRecord(data) || !["sent", "failed"].includes(String(data.state)))
    throw new Error("Application email status unavailable");
  return data.state as EmailState;
}

function message(locals: App.Locals, application: JoinApplication) {
  const preview = locals.applicationScope !== "production";
  const scopeHost = locals.applicationScope?.replace(/^preview:/, "") ?? "";
  const host =
    preview && /^[a-z0-9-]+\.hulettcraft-site\.pages\.dev$/.test(scopeHost)
      ? scopeHost
      : "hulettcraft.com";
  return {
    to: [APPLICATION_EMAIL_TO],
    subject: `${preview ? "[PREVIEW TEST] " : ""}HulettCraft SMP application: ${application.minecraft}`,
    // Plain text prevents applicant answers from becoming HTML or email headers.
    text: [
      preview
        ? "PREVIEW TEST — this is not a production application."
        : "New HulettCraft SMP application",
      `Submitted: ${application.createdAt}`,
      `Minecraft: ${application.minecraft}`,
      `Discord: ${application.discord}`,
      ...APPLICATION_QUESTIONS.map(
        (q) => `\n${q.label}\n${application.answers[q.id] || "Not provided"}`,
      ),
      `\nPreferred engagement:\n${ENGAGEMENT_OPTIONS.find((o) => o.value === application.engagement)?.label}`,
      application.screenshot
        ? "\nA private screenshot is available in the admin portal (not attached to this email)."
        : "\nNo screenshot attached.",
      `\nReview (admin login required): https://${host}/admin/applications/${application.id}`,
      "\nNames are self-reported. Verify the applicant on Discord before granting access.",
    ].join("\n"),
  };
}

/** Save the application first. Email failure must never invite duplicate applications. */
export async function notifyApplication(
  locals: App.Locals,
  application: JoinApplication,
): Promise<EmailState | "disabled"> {
  let accepted = false;
  try {
    const config = emailConfiguration(locals);
    if (!config) return "disabled";
    if ((await readApplicationEmail(locals, application.id)) === "sent")
      return "sent";
    const hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(locals.applicationScope ?? "test"),
      ),
    );
    const scope = Array.from(hash, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "manual", // workerd supports follow/manual only; reject redirects below.
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `join-${scope}-${application.id}`,
      },
      body: JSON.stringify({
        from: config.from,
        ...message(locals, application),
      }),
    });
    // Consume the response within the timeout; provider acceptance is not inbox delivery.
    const result: unknown = response.ok ? await response.json() : undefined;
    if (
      !response.ok ||
      !isRecord(result) ||
      typeof result.id !== "string" ||
      !result.id
    )
      throw new Error("Email service did not confirm acceptance");
    accepted = true;
    await applicationStore(locals).put(
      applicationEmailKey(locals, application.id),
      JSON.stringify({ state: "sent", at: new Date().toISOString() }),
    );
    return "sent";
  } catch {
    // Never log applicant content, API credentials, or the provider response.
    console.error(
      "Application email could not be confirmed; review the private admin queue.",
    );
    if (!accepted) {
      try {
        await applicationStore(locals).put(
          applicationEmailKey(locals, application.id),
          JSON.stringify({ state: "failed", at: new Date().toISOString() }),
        );
      } catch {
        /* Saved application remains the source of truth. */
      }
    }
    return accepted ? "unrecorded" : "failed";
  }
}
