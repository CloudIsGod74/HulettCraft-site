import test from "node:test";
import assert from "node:assert/strict";
import {
  notifyApplication,
  applicationEmailKey,
  readApplicationEmail,
} from "../src/lib/applicationEmail";
import {
  applicationKey,
  newApplication,
  saveApplication,
  validateApplicant,
} from "../src/lib/applications";
import { POST as submit } from "../src/pages/api/join";
import { POST as retry } from "../src/pages/api/admin/applications/[id]/email";
import { context, locals, request, png } from "./helpers";
import {
  emailTestAccount,
  cloudflareEmailPath,
  cloudflareQueued,
  cloudflareDelivered,
} from "./fixtures/applicationEmail";

const answers = {
  minecraft: "MailTestBuilder",
  discord: "synthetic.discord",
  engagement: "balanced",
  proud: "A test village <script>not HTML</script>",
  building: "Test builds",
  hopes: "Friendly builders",
  interactions: "Trading",
  creators: "",
  griefing: "",
};
class KV {
  values = new Map<string, string>();
  failApplication = false;
  failEmail = false;
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string) {
    if (this.failApplication && key.startsWith("private:join-application:"))
      throw new Error("KV unavailable");
    if (this.failEmail && key.startsWith("private:join-email:"))
      throw new Error("KV unavailable");
    this.values.set(key, value);
  }
}
function setup(overrides: Record<string, unknown> = {}) {
  const kv = new KV();
  const env = locals(undefined, {
    SESSION: kv,
    APPLICATION_EMAIL_ENABLED: "true",
    APPLICATION_EMAIL_FROM: "applications@hulettcraft.com",
    CLOUDFLARE_ACCOUNT_ID: emailTestAccount,
    CLOUDFLARE_EMAIL_API_TOKEN: "test-only-not-a-real-key",
    ...overrides,
  });
  env.applicationScope = "production";
  return { kv, env };
}
function submission(invalid = false) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    ...answers,
    minecraft: invalid ? "bad username" : answers.minecraft,
    acknowledgement: "yes",
  }))
    form.set(key, value);
  return new Request("https://example.test/api/join", {
    method: "POST",
    headers: { Origin: "https://example.test", Accept: "application/json" },
    body: form,
  });
}

test("saved application is emailed to the fixed support address with safe text and a private screenshot link", async (t) => {
  const { kv, env } = setup();
  let sent: Record<string, unknown> = {};
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init: RequestInit) => {
      assert.equal(url, "https://api.cloudflare.com" + cloudflareEmailPath);
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal);
      assert.ok(
        [...kv.values.keys()].some((key) =>
          key.startsWith("private:join-application:"),
        ),
        "saved before email",
      );
      sent = JSON.parse(init.body as string);
      assert.equal(
        new Headers(init.headers).get("authorization"),
        "Bearer test-only-not-a-real-key",
      );
      return Response.json(cloudflareQueued);
    },
  );
  const data = await submission().formData();
  data.set("screenshot", new File([png], "build.png"));
  const response = await submit(
    context(
      new Request("https://example.test/api/join", {
        method: "POST",
        headers: { Origin: "https://example.test", Accept: "application/json" },
        body: data,
      }),
      env,
    ),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(sent.to, "support@hulettcraft.com");
  assert.equal(sent.from, "applications@hulettcraft.com");
  assert.equal(sent.subject, "HulettCraft SMP application: MailTestBuilder");
  assert.match(sent.text as string, /synthetic\.discord/);
  assert.match(sent.text as string, /<script>not HTML<\/script>/);
  assert.match(
    sent.text as string,
    /A mix of solo play and playing with others/,
  );
  assert.match(
    sent.text as string,
    /https:\/\/hulettcraft.com\/admin\/applications\//,
  );
  assert.match(sent.text as string, /private screenshot/);
  assert.equal(sent.html, undefined);
  assert.equal(sent.attachments, undefined);
  assert.ok(
    !JSON.stringify(sent).includes(Buffer.from(png).toString("base64")),
  );
  const app = JSON.parse(
    [...kv.values.entries()].find(([key]) =>
      key.startsWith("private:join-application:"),
    )![1],
  );
  assert.equal(await readApplicationEmail(env, app.id), "sent");
  assert.equal(await notifyApplication(env, app), "sent");
  assert.equal(fetch.mock.callCount(), 1, "accepted emails are not resent");
});

test("invalid submissions and failed durable storage never trigger email", async (t) => {
  const { kv, env } = setup();
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not send");
  });
  assert.equal((await submit(context(submission(true), env))).status, 400);
  kv.failApplication = true;
  assert.equal((await submit(context(submission(), env))).status, 503);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(kv.values.size, 0);
});

test("Cloudflare failures preserve the saved application and authenticated retry leaves answers unchanged", async (t) => {
  const { kv, env } = setup();
  const recipients: string[] = [];
  let working = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      recipients.push(JSON.parse(init.body as string).to);
      return working
        ? Response.json(cloudflareDelivered)
        : new Response("provider outage", { status: 503 });
    },
  );
  assert.equal((await submit(context(submission(), env))).status, 201);
  const [key, value] = [...kv.values.entries()].find(([key]) =>
    key.startsWith("private:join-application:"),
  )!;
  const app = JSON.parse(value);
  assert.equal(await readApplicationEmail(env, app.id), "failed");
  working = true;
  const response = await retry(
    context(await request(`/api/admin/applications/${app.id}/email`, {}), env, {
      id: app.id,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.equal(await readApplicationEmail(env, app.id), "sent");
  assert.equal(
    kv.values.get(key),
    value,
    "retry never changes answers, notes or revisions",
  );
  assert.deepEqual(recipients, [
    "support@hulettcraft.com",
    "support@hulettcraft.com",
  ]);
});

test("redirects, invalid acceptance payloads, and network timeouts are failures rather than confirmed sends", async (t) => {
  const { env } = setup();
  const responses = [
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://untrusted.test" },
      }),
    () => new Response("invalid JSON"),
    () => Response.json({}),
    () => Response.json({ id: "" }),
    () => Response.json({ ...cloudflareQueued, success: false }),
    () => Response.json({ ...cloudflareQueued, errors: [{ code: 10102 }] }),
    () => Response.json({ ...cloudflareQueued, result: null }),
    () =>
      Response.json({
        ...cloudflareQueued,
        result: { ...cloudflareQueued.result, queued: ["other@example.test"] },
      }),
    () =>
      Response.json({
        ...cloudflareQueued,
        result: { ...cloudflareQueued.result, queued: [] },
      }),
    () =>
      Response.json({
        ...cloudflareQueued,
        result: { ...cloudflareQueued.result, queued: null },
      }),
    () =>
      Response.json({
        ...cloudflareQueued,
        result: {
          ...cloudflareQueued.result,
          permanent_bounces: ["support@hulettcraft.com"],
        },
      }),
    () =>
      Response.json({
        ...cloudflareQueued,
        result: {
          ...cloudflareQueued.result,
          delivered: ["support@hulettcraft.com"],
        },
      }),
    () => {
      throw new DOMException("Timed out", "TimeoutError");
    },
  ];
  let index = 0;
  t.mock.method(globalThis, "fetch", async () => responses[index++]());
  for (let attempt = 0; attempt < responses.length; attempt++) {
    const app = newApplication(validateApplicant(answers));
    await saveApplication(env, app);
    assert.equal(await notifyApplication(env, app), "failed");
    assert.equal(await readApplicationEmail(env, app.id), "failed");
  }
});

test("Cloudflare delivered and queued results are accepted only for the fixed support recipient, with a default sender", async (t) => {
  const { env } = setup({ APPLICATION_EMAIL_FROM: undefined });
  let count = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      assert.equal(payload.from, "applications@hulettcraft.com");
      assert.equal(payload.to, "support@hulettcraft.com");
      return Response.json([cloudflareDelivered, cloudflareQueued][count++]);
    },
  );
  for (let i = 0; i < 2; i++) {
    const app = newApplication(validateApplicant(answers));
    await saveApplication(env, app);
    assert.equal(await notifyApplication(env, app), "sent");
    assert.equal(await readApplicationEmail(env, app.id), "sent");
  }
});

test("an accepted delivery saved by the previous sender is preserved without sending again through Cloudflare", async (t) => {
  const { kv, env } = setup();
  const app = newApplication(validateApplicant(answers));
  await saveApplication(env, app);
  await kv.put(
    applicationEmailKey(env, app.id),
    JSON.stringify({ state: "sent", at: "2026-01-01T00:00:00Z" }),
  );
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw Error("must not resend");
  });
  assert.equal(await notifyApplication(env, app), "sent");
  assert.equal(fetch.mock.callCount(), 0);
});

test("mail is disabled by default and previews require explicit opt-in, even with production secrets", async (t) => {
  const { env } = setup();
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(cloudflareQueued),
  );
  env.runtime.env.APPLICATION_EMAIL_ENABLED = undefined;
  const app = newApplication(validateApplicant(answers));
  assert.equal(await notifyApplication(env, app), "disabled");
  env.runtime.env.APPLICATION_EMAIL_ENABLED = "true";
  env.applicationScope = "preview:test.hulettcraft-site.pages.dev";
  assert.equal(await notifyApplication(env, app), "disabled");
  assert.equal(fetch.mock.callCount(), 0);
  env.runtime.env.APPLICATION_EMAIL_PREVIEW_ENABLED = "true";
  assert.equal(await notifyApplication(env, app), "sent");
  const body = JSON.parse(fetch.mock.calls[0].arguments[1]!.body as string);
  assert.match(body.subject, /^\[PREVIEW TEST\]/);
  assert.match(
    body.text,
    /https:\/\/test.hulettcraft-site.pages.dev\/admin\/applications\//,
  );
});

test("missing credentials and unsafe sender headers cannot send mail or lose applications", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not send");
  });
  for (const overrides of [
    { CLOUDFLARE_EMAIL_API_TOKEN: "" },
    { CLOUDFLARE_ACCOUNT_ID: "" },
    { CLOUDFLARE_ACCOUNT_ID: "../different-account?token=unsafe" },
    { APPLICATION_EMAIL_FROM: "bad\r\nBcc: attacker@test.com" },
    { APPLICATION_EMAIL_FROM: "sender@unrelated.test" },
  ]) {
    const { kv, env } = setup(overrides);
    assert.equal((await submit(context(submission(), env))).status, 201);
    assert.equal(kv.values.size, 2);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("email retry authenticates and checks Origin, cannot fetch deleted or arbitrary records", async (t) => {
  const { kv, env } = setup();
  const app = newApplication(validateApplicant(answers));
  await saveApplication(env, app);
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(cloudflareQueued),
  );
  const path = `/api/admin/applications/${app.id}/email`;
  assert.equal(
    (await retry(context(await request(path, {}, false), env, { id: app.id })))
      .status,
    401,
  );
  assert.equal(
    (
      await retry(
        context(await request(path, {}, true, "https://attacker.test"), env, {
          id: app.id,
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await retry(
        context(await request(path, {}), env, {
          id: "../public:community-roster:v1",
        }),
      )
    ).status,
    404,
  );
  kv.values.delete(applicationKey(app.id, env.applicationScope));
  assert.equal(
    (await retry(context(await request(path, {}), env, { id: app.id }))).status,
    404,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("failure to record provider acceptance never changes the saved application or claims confirmed delivery", async (t) => {
  const { kv, env } = setup();
  const app = newApplication(validateApplicant(answers));
  await saveApplication(env, app);
  kv.failEmail = true;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(cloudflareQueued),
  );
  assert.equal(await notifyApplication(env, app), "unrecorded");
  assert.equal(await readApplicationEmail(env, app.id), "unrecorded");
  assert.equal(
    kv.values.has(applicationKey(app.id, env.applicationScope)),
    true,
  );
  assert.equal(kv.values.has(applicationEmailKey(env, app.id)), false);
});
