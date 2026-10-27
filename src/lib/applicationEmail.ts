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
import {
  applicationForwardingHeader,
  APPLICATION_FORWARDING_HEADER,
} from "./applicationForwarding";

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
    !env.CLOUDFLARE_EMAIL_API_TOKEN ||
    !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") ||
    !/^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)*hulettcraft\.com$/.test(
      env.APPLICATION_EMAIL_FROM ?? "applications@hulettcraft.com",
    )
  )
    throw new Error(
      "Cloudflare email sender, account ID or sending token is not configured",
    );
  return {
    key: env.CLOUDFLARE_EMAIL_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID!,
    from: env.APPLICATION_EMAIL_FROM ?? "applications@hulettcraft.com",
  };
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
    to: APPLICATION_EMAIL_TO,
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

function cloudflareAccepted(value: unknown) {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.errors) ||
    value.errors.length !== 0 ||
    !isRecord(value.result)
  )
    return false;
  const { delivered, queued, permanent_bounces } = value.result;
  return (
    Array.isArray(delivered) &&
    Array.isArray(queued) &&
    Array.isArray(permanent_bounces) &&
    permanent_bounces.length === 0 &&
    delivered.length + queued.length === 1 &&
    (delivered[0] ?? queued[0]) === APPLICATION_EMAIL_TO
  );
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
    const email = message(locals, application);
    const forwardingMarker = await applicationForwardingHeader(
      locals.runtime?.env?.APPLICATION_FORWARDING_SECRET,
      application.id,
      email.subject,
    );
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
      {
        method: "POST",
        redirect: "manual", // workerd supports follow/manual only; reject redirects below.
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          ...email,
          ...(forwardingMarker
            ? { headers: { [APPLICATION_FORWARDING_HEADER]: forwardingMarker } }
            : {}),
        }),
      },
    );
    // Consume the response within the timeout; provider acceptance is not inbox delivery.
    const result: unknown = response.ok ? await response.json() : undefined;
    // HTTP 200 alone is insufficient: Cloudflare reports outcomes per recipient.
    // Only our fixed support address being delivered or queued counts as accepted.
    if (!response.ok || !cloudflareAccepted(result))
      throw new Error("Cloudflare did not confirm acceptance for support");
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
