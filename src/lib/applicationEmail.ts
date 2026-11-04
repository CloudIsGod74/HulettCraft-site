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

const failureMessages = {
  authentication:
    "Cloudflare rejected the sending token. Check its validity and token type.",
  permission:
    "The token lacks permission. Check Email Sending: Edit and the account scope.",
  entitlement:
    "Cloudflare did not allow sending on this account. Check whether support@hulettcraft.com is a verified destination before considering a paid plan.",
  disabled:
    "Cloudflare has disabled or paused sending for this account or domain.",
  throttled: "Cloudflare limited sending. Wait before retrying.",
  rejected:
    "Cloudflare rejected the request. Check the sender and recipient verification.",
  response:
    "Cloudflare did not confirm acceptance for support@hulettcraft.com. Check activity before retrying.",
  network:
    "The sending request failed or timed out. It may have been accepted; check activity before retrying.",
  provider:
    "Cloudflare's sending service is temporarily unavailable. Check activity before retrying.",
} as const;
type FailureReason = keyof typeof failureMessages;
export interface EmailFailure {
  reason: FailureReason;
  httpStatus?: number;
  providerCode?: number;
}
export interface EmailDetails {
  state: EmailState;
  failure?: EmailFailure;
}
export function emailFailureMessage(failure: EmailFailure) {
  return (
    failureMessages[failure.reason] +
    (failure.httpStatus ? ` HTTP ${failure.httpStatus}.` : "") +
    (failure.providerCode ? ` Cloudflare code ${failure.providerCode}.` : "")
  );
}
function validFailure(value: unknown): value is EmailFailure {
  return (
    isRecord(value) &&
    typeof value.reason === "string" &&
    Object.hasOwn(failureMessages, value.reason) &&
    (value.httpStatus === undefined ||
      (Number.isInteger(value.httpStatus) &&
        Number(value.httpStatus) >= 100 &&
        Number(value.httpStatus) <= 599)) &&
    (value.providerCode === undefined ||
      (Number.isSafeInteger(value.providerCode) &&
        Number(value.providerCode) > 0))
  );
}

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

export async function readApplicationEmailDetails(
  locals: App.Locals,
  id: string,
): Promise<EmailDetails> {
  const saved = await applicationStore(locals).get(
    applicationEmailKey(locals, id),
  );
  if (!saved) return { state: "unrecorded" };
  const data: unknown = JSON.parse(saved);
  if (!isRecord(data) || !["sent", "failed"].includes(String(data.state)))
    throw new Error("Application email status unavailable");
  if (data.failure !== undefined && !validFailure(data.failure))
    throw new Error("Application email status unavailable");
  return {
    state: data.state as EmailState,
    ...(data.failure ? { failure: data.failure as EmailFailure } : {}),
  };
}

export async function readApplicationEmail(
  locals: App.Locals,
  id: string,
): Promise<EmailState> {
  return (await readApplicationEmailDetails(locals, id)).state;
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

function providerFailure(status: number, value: unknown): EmailFailure {
  const code =
    isRecord(value) &&
    Array.isArray(value.errors) &&
    isRecord(value.errors[0]) &&
    Number.isSafeInteger(value.errors[0].code) &&
    Number(value.errors[0].code) > 0
      ? (value.errors[0].code as number)
      : undefined;
  const reason: FailureReason =
    code === 10101 || code === 10103 || status === 401
      ? "authentication"
      : code === 10102
        ? "permission"
        : code === 10105
          ? "entitlement"
          : code === 10203 || code === 10207
            ? "disabled"
            : code === 10004 || status === 429
              ? "throttled"
              : status >= 500
                ? "provider"
                : status >= 400
                  ? "rejected"
                  : "response";
  return {
    reason,
    httpStatus: status,
    ...(code ? { providerCode: code } : {}),
  };
}
async function providerJson(response: Response): Promise<unknown> {
  // Read errors as well as success results, without retaining unbounded provider data.
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return undefined;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Save the application first. Email failure must never invite duplicate applications. */
export async function notifyApplication(
  locals: App.Locals,
  application: JoinApplication,
): Promise<EmailState | "disabled"> {
  let accepted = false;
  let canRecordFailure = false;
  let failure: EmailFailure = { reason: "network" };
  try {
    const config = emailConfiguration(locals);
    if (!config) return "disabled";
    if ((await readApplicationEmail(locals, application.id)) === "sent")
      return "sent";
    canRecordFailure = true;
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
    const result = await providerJson(response);
    failure = providerFailure(response.status, result);
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
    if (!accepted && canRecordFailure) {
      try {
        await applicationStore(locals).put(
          applicationEmailKey(locals, application.id),
          JSON.stringify({
            state: "failed",
            failure,
            at: new Date().toISOString(),
          }),
        );
      } catch {
        /* Saved application remains the source of truth. */
      }
    }
    return accepted ? "unrecorded" : "failed";
  }
}
