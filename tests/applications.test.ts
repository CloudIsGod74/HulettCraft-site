import { applicationScopeForHost } from "../src/config/applications";
import test from "node:test";
import assert from "node:assert/strict";
import { POST as submit } from "../src/pages/api/join";
import {
  GET as details,
  POST as review,
  DELETE as remove,
} from "../src/pages/api/admin/applications/[id]";
import { GET as screenshot } from "../src/pages/api/admin/applications/[id]/screenshot";
import { GET as publicImage } from "../src/pages/api/gallery/image";
import { applicationEmailKey } from "../src/lib/applicationEmail";
import {
  APPLICATION_PREFIX,
  MAX_APPLICATION_IMAGE,
  applicationKey,
  listApplications,
  newApplication,
  readApplication,
  saveApplication,
  validateApplicant,
} from "../src/lib/applications";
import { context, locals, request, png } from "./helpers";

class PrivateKV {
  values = new Map<string, string>();
  metadata = new Map<string, unknown>();
  writes: string[] = [];
  deleted: string[] = [];
  failRead = false;
  failWrite = false;
  failList = false;
  async get(key: string) {
    if (this.failRead && key.startsWith(APPLICATION_PREFIX))
      throw new Error("Unavailable");
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string, options?: { metadata?: unknown }) {
    if (this.failWrite) throw new Error("Unavailable");
    this.values.set(key, value);
    this.metadata.set(key, options?.metadata);
    this.writes.push(key);
  }
  async delete(key: string) {
    this.values.delete(key);
    this.metadata.delete(key);
    this.deleted.push(key);
  }
  async list(options: { prefix: string; limit: number; cursor?: string }) {
    if (this.failList) throw new Error("Unavailable");
    const names = [...this.values.keys()]
      .filter((key) => key.startsWith(options.prefix))
      .sort();
    const start = Number(options.cursor ?? "0");
    const keys = names
      .slice(start, start + options.limit)
      .map((name) => ({ name, metadata: this.metadata.get(name) }));
    return {
      keys,
      list_complete: start + options.limit >= names.length,
      cursor: String(start + options.limit),
    };
  }
}
const answers = {
  minecraft: "NewBuilder",
  discord: "builder.discord",
  engagement: "balanced",
  proud: "A village with friends",
  building: "Cozy towns and farms",
  hopes: "A lasting world with kind people",
  interactions: "Trading and shared builds",
  creators: "",
  griefing: "",
};
function submission(
  overrides: Record<string, string> = {},
  file?: File,
  origin = "https://example.test",
  accept = "application/json",
) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    ...answers,
    acknowledgement: "yes",
    website: "",
    ...overrides,
  }))
    form.set(key, value);
  if (file) form.set("screenshot", file);
  return new Request("https://example.test/api/join", {
    method: "POST",
    headers: { Origin: origin, Accept: accept },
    body: form,
  });
}
async function stored(kv: PrivateKV) {
  const env = locals(undefined, { SESSION: kv });
  const application = newApplication(validateApplicant(answers));
  await saveApplication(env, application);
  return { env, application };
}

test("public SMP application saves one private record and returns no applicant data", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  kv.values.set("public:community-roster:v1", "unchanged roster");
  const response = await submit(context(submission(), env));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { received: true });
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  assert.equal(kv.writes.length, 1);
  assert.ok(kv.writes[0].startsWith(APPLICATION_PREFIX));
  const record = JSON.parse(kv.values.get(kv.writes[0])!);
  assert.equal(record.server, "hulettcraft");
  assert.equal(record.minecraft, "NewBuilder");
  assert.equal(record.discord, "builder.discord");
  assert.equal(record.status, "new");
  assert.equal(record.screenshot, undefined);
  assert.equal(record.answers.creators, "");
  assert.equal(kv.values.get("public:community-roster:v1"), "unchanged roster");
});

test("optional validated screenshot stays in the private KV value and out of public image routes", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  const response = await submit(
    context(
      submission({}, new File([png], "my-build.png", { type: "text/plain" })),
      env,
    ),
  );
  assert.equal(response.status, 201);
  const record = JSON.parse(kv.values.get(kv.writes[0])!);
  const image = await screenshot(
    context(
      await request("/api/admin/applications/" + record.id + "/screenshot"),
      env,
      { id: record.id },
    ),
  );
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.match(image.headers.get("cache-control")!, /private, no-store/);
  assert.match(image.headers.get("Content-Security-Policy")!, /sandbox/);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), png);
  const guest = await screenshot(
    context(
      await request(
        "/api/admin/applications/" + record.id + "/screenshot",
        undefined,
        false,
      ),
      env,
      { id: record.id },
    ),
  );
  assert.equal(guest.status, 401);
  const publicResponse = await publicImage(
    context(
      await request(
        "/api/gallery/image?key=" + encodeURIComponent(kv.writes[0]),
        undefined,
        false,
      ),
      env,
    ),
  );
  assert.equal(publicResponse.status, 404);
  assert.equal(kv.writes.length, 1);
});

test("required answers, names, engagement, acknowledgement and bounds are validated before storage", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  const invalidCases: Record<string, string>[] = [
    { minecraft: "bad name" },
    { minecraft: "ab" },
    { discord: "" },
    { proud: " " },
    { building: "" },
    { hopes: "" },
    { interactions: "" },
    { engagement: "unknown" },
    { acknowledgement: "" },
    { proud: "a".repeat(2001) },
    { griefing: "a".repeat(1501) },
    { creators: "\u0000" },
    { website: "spam.example" },
    { server: "creative" },
  ];
  for (const invalid of invalidCases) {
    assert.equal(
      (await submit(context(submission(invalid), env))).status,
      400,
      JSON.stringify(invalid).slice(0, 100),
    );
  }
  assert.deepEqual(kv.writes, []);
});

test("invalid, oversized and duplicate upload fields fail without a partial application", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  assert.equal(
    (
      await submit(
        context(submission({}, new File(["<svg/>"], "bad.png")), env),
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await submit(
        context(
          submission(
            {},
            new File([new Uint8Array(MAX_APPLICATION_IMAGE + 1)], "large.png"),
          ),
          env,
        ),
      )
    ).status,
    413,
  );
  const req = submission();
  const data = await req.formData();
  data.append("minecraft", "Duplicate");
  assert.equal(
    (
      await submit(
        context(
          new Request(req.url, {
            method: "POST",
            headers: { Origin: "https://example.test" },
            body: data,
          }),
          env,
        ),
      )
    ).status,
    400,
  );
  const wrongType = new Request(req.url, {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal((await submit(context(wrongType, env))).status, 415);
  assert.deepEqual(kv.writes, []);
});

test("same-origin checks and native upload rate limiting protect submissions", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  for (const origin of [
    "",
    "https://attacker.test",
    "https://example.test.attacker.test",
  ])
    assert.equal(
      (await submit(context(submission({}, undefined, origin), env))).status,
      403,
    );
  let limiterKey = "";
  const blocked = locals(undefined, {
    SESSION: kv,
    UPLOAD_RATE_LIMITER: {
      async limit({ key }: { key: string }) {
        limiterKey = key;
        return { success: false };
      },
    },
  });
  const response = await submit(context(submission(), blocked));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(limiterKey, "join:test:unknown");
  assert.deepEqual(kv.writes, []);
});

test("missing or failed private storage cannot report a successful submission", async () => {
  assert.equal((await submit(context(submission()))).status, 503);
  const kv = new PrivateKV();
  kv.failWrite = true;
  assert.equal(
    (await submit(context(submission(), locals(undefined, { SESSION: kv }))))
      .status,
    503,
  );
  assert.deepEqual(kv.writes, []);
});

test("non-JavaScript submissions redirect only after saving", async () => {
  const kv = new PrivateKV();
  const response = await submit(
    context(
      submission({}, undefined, "https://example.test", "text/html"),
      locals(undefined, { SESSION: kv }),
    ),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/join/thanks");
  assert.equal(kv.writes.length, 1);
});

test("private detail reads and every review/delete mutation require an administrator and exact Origin", async () => {
  const kv = new PrivateKV(),
    { env, application } = await stored(kv);
  const path = "/api/admin/applications/" + application.id;
  assert.equal(
    (
      await details(
        context(await request(path, undefined, false), env, {
          id: application.id,
        }),
      )
    ).status,
    401,
  );
  for (const route of [review, remove]) {
    const body = {
      revision: application.revision,
      status: "accepted",
      note: "Private note",
    };
    assert.equal(
      (
        await route(
          context(await request(path, body, false), env, {
            id: application.id,
          }),
        )
      ).status,
      401,
    );
    for (const origin of ["", "https://attacker.test"])
      assert.equal(
        (
          await route(
            context(await request(path, body, true, origin), env, {
              id: application.id,
            }),
          )
        ).status,
        403,
      );
  }
  assert.deepEqual(kv.deleted, []);
  assert.equal(kv.writes.length, 1);
});

test("admin review preserves answers, detects observed stale edits, and does not publish a roster", async () => {
  const kv = new PrivateKV(),
    { env, application } = await stored(kv);
  const path = "/api/admin/applications/" + application.id;
  const response = await review(
    context(
      await request(path, {
        revision: application.revision,
        status: "accepted",
        note: "Discuss in Discord",
      }),
      env,
      { id: application.id },
    ),
  );
  assert.equal(response.status, 200);
  const saved = await readApplication(env, application.id);
  assert.equal(saved.status, "accepted");
  assert.equal(saved.note, "Discuss in Discord");
  assert.equal(saved.reviewedBy, "cloudisgod74");
  assert.deepEqual(saved.answers, application.answers);
  assert.notEqual(saved.revision, application.revision);
  assert.equal(
    (
      await review(
        context(
          await request(path, {
            revision: application.revision,
            status: "declined",
            note: "stale",
          }),
          env,
          { id: application.id },
        ),
      )
    ).status,
    409,
  );
  assert.ok(kv.writes.every((key) => key === applicationKey(application.id)));
});

test("deleting an application removes its single private value and cannot target sessions or galleries", async () => {
  const kv = new PrivateKV(),
    { env, application } = await stored(kv);
  const path = "/api/admin/applications/" + application.id;
  assert.equal(
    (
      await remove(
        context(await request(path, { revision: "stale" }), env, {
          id: application.id,
        }),
      )
    ).status,
    409,
  );
  for (const id of [
    "../revoked:test",
    "public:community-roster:v1",
    "Screenshots/hulettcraft/season-8/test.png",
    "",
  ]) {
    assert.equal(
      (
        await remove(
          context(
            await request(path, { revision: application.revision }),
            env,
            { id },
          ),
        )
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await remove(
        context(await request(path, { revision: application.revision }), env, {
          id: application.id,
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(kv.deleted, [
    applicationEmailKey(env, application.id),
    applicationKey(application.id),
  ]);
  assert.equal(
    (await details(context(await request(path), env, { id: application.id })))
      .status,
    404,
  );
});

test("paginated admin summaries contain only applications, newest first, without reading attachments", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  for (let i = 0; i < 27; i++)
    await saveApplication(
      env,
      newApplication(
        validateApplicant(answers),
        undefined,
        Date.UTC(2026, 9, 23) + i,
      ),
    );
  kv.values.set("public:community-roster:v1", "unrelated");
  const first = await listApplications(env),
    second = await listApplications(env, first.cursor);
  assert.equal(first.applications.length, 25);
  assert.equal(second.applications.length, 2);
  assert.ok(first.applications[0].createdAt > second.applications[0].createdAt);
  assert.ok(
    first.applications.every(
      (item) =>
        !Object.hasOwn(item, "discord") &&
        !Object.hasOwn(item, "answers") &&
        !Object.hasOwn(item, "screenshot"),
    ),
  );
  assert.equal(second.cursor, undefined);
});

test("corrupt or unavailable saved records cannot be overwritten by a review", async () => {
  const kv = new PrivateKV(),
    { env, application } = await stored(kv);
  kv.values.set(applicationKey(application.id), "bad JSON");
  const response = await review(
    context(
      await request("/api/admin/applications/" + application.id, {
        revision: application.revision,
        status: "accepted",
        note: "",
      }),
      env,
      { id: application.id },
    ),
  );
  assert.equal(response.status, 503);
  assert.equal(kv.values.get(applicationKey(application.id)), "bad JSON");
  kv.failRead = true;
  assert.equal(
    (
      await details(
        context(
          await request("/api/admin/applications/" + application.id),
          env,
          { id: application.id },
        ),
      )
    ).status,
    503,
  );
});

test("production and preview application namespaces stay separate even with the same KV binding", async () => {
  const kv = new PrivateKV();
  const production = locals(undefined, { SESSION: kv });
  production.applicationScope = "production";
  const preview = locals(undefined, { SESSION: kv });
  preview.applicationScope = "preview:test.pages.dev";
  const application = newApplication(validateApplicant(answers));
  await saveApplication(production, application);
  assert.equal((await listApplications(preview)).applications.length, 0);
  await assert.rejects(
    () => readApplication(preview, application.id),
    (error) => error instanceof Response && error.status === 404,
  );
  await saveApplication(
    preview,
    newApplication(
      validateApplicant({ ...answers, minecraft: "PreviewPlayer" }),
    ),
  );
  assert.deepEqual(
    (await listApplications(production)).applications.map(
      (item) => item.minecraft,
    ),
    ["NewBuilder"],
  );
  assert.deepEqual(
    (await listApplications(preview)).applications.map(
      (item) => item.minecraft,
    ),
    ["PreviewPlayer"],
  );
});

test("an empty native file input is optional but a nonempty text upload is rejected", async () => {
  const kv = new PrivateKV(),
    env = locals(undefined, { SESSION: kv });
  assert.equal(
    (await submit(context(submission({ screenshot: "" }), env))).status,
    201,
  );
  assert.equal(
    (await submit(context(submission({ screenshot: "not a file" }), env)))
      .status,
    400,
  );
  assert.equal(kv.writes.length, 1);
});

test("only canonical production hosts share the production queue", () => {
  for (const host of [
    "hulettcraft.com",
    "www.hulettcraft.com",
    "hulettcraft-site.pages.dev",
    "HULETTCRAFT.COM.",
  ])
    assert.equal(applicationScopeForHost(host), "production");
  for (const host of [
    "hash.hulettcraft-site.pages.dev",
    "codex-join-applications.hulettcraft-site.pages.dev",
    "127.0.0.1",
    "hulettcraft.com.attacker.test",
    "www-hulettcraft.com",
  ])
    assert.equal(applicationScopeForHost(host), "preview:" + host);
});

test("active, completed and all views use saved status while keeping decisions, notes, screenshots and email state intact", async () => {
  const kv = new PrivateKV();
  const env = locals(undefined, { SESSION: kv });
  const records = [];
  for (const status of ["new", "reviewing", "accepted", "declined"] as const) {
    const app = newApplication(validateApplicant(answers), {
      type: "image/png",
      base64: Buffer.from(png).toString("base64"),
    });
    app.status = status;
    app.note = "Keep this private note";
    await saveApplication(env, app);
    records.push(app);
    kv.values.set(
      applicationEmailKey(env, app.id),
      JSON.stringify({ state: "sent" }),
    );
  }
  const before = [...kv.values.entries()];
  const writes = kv.writes.length;
  kv.failRead = true; // Listing must use metadata, never attachments or full answers.
  assert.deepEqual(
    (await listApplications(env)).applications.map((row) => row.status).sort(),
    ["new", "reviewing"],
  );
  assert.deepEqual(
    (await listApplications(env, undefined, "completed")).applications
      .map((row) => row.status)
      .sort(),
    ["accepted", "declined"],
  );
  assert.equal(
    (await listApplications(env, undefined, "all")).applications.length,
    4,
  );
  assert.equal(kv.writes.length, writes);
  assert.deepEqual([...kv.values.entries()], before);
  kv.failRead = false;
  for (const app of records)
    assert.deepEqual(await readApplication(env, app.id), app);
});

test("accepting and declining hide a request from Active and reopening returns it without deleting private data", async () => {
  const kv = new PrivateKV();
  const { env, application } = await stored(kv);
  const path = `/api/admin/applications/${application.id}`;
  for (const status of ["accepted", "reviewing", "declined", "new"] as const) {
    const previous = await readApplication(env, application.id);
    const response = await review(
      context(
        await request(path, {
          revision: previous.revision,
          status,
          note: "Retain my notes",
        }),
        env,
        { id: application.id },
      ),
    );
    assert.equal(response.status, 200);
    const completed = status === "accepted" || status === "declined";
    assert.equal(
      (await listApplications(env)).applications.length,
      completed ? 0 : 1,
    );
    assert.equal(
      (await listApplications(env, undefined, "completed")).applications.length,
      completed ? 1 : 0,
    );
    const saved = await readApplication(env, application.id);
    assert.deepEqual(saved.answers, application.answers);
    assert.equal(saved.note, "Retain my notes");
    assert.deepEqual(kv.deleted, []);
  }
});

test("filtered pagination scans past other statuses and never skips or duplicates matching submissions", async () => {
  const kv = new PrivateKV();
  const env = locals(undefined, { SESSION: kv });
  const records = [];
  for (let i = 0; i < 82; i++) {
    const app = newApplication(
      validateApplicant(answers),
      undefined,
      Date.UTC(2026, 9, 23) + i,
    );
    app.status = i % 3 === 0 ? "reviewing" : i % 2 ? "accepted" : "declined";
    await saveApplication(env, app);
    records.push(app);
  }
  kv.failRead = true;
  for (const view of ["active", "completed", "all"] as const) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listApplications(env, cursor, view);
      assert.ok(page.applications.length <= 25);
      ids.push(...page.applications.map((row) => row.id));
      cursor = page.cursor;
    } while (cursor);
    const expected = records
      .filter(
        (app) =>
          view === "all" ||
          (view === "completed") ===
            ["accepted", "declined"].includes(app.status),
      )
      .map((app) => app.id)
      .sort();
    assert.deepEqual(ids, expected);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("a bounded empty scan preserves a continuation to older open requests and rejects non-advancing cursors", async () => {
  const kv = new PrivateKV();
  const env = locals(undefined, { SESSION: kv });
  for (let i = 0; i < 276; i++) {
    const app = newApplication(
      validateApplicant(answers),
      undefined,
      Date.UTC(2026, 9, 23) + i,
    );
    app.status = i === 0 ? "new" : "accepted";
    await saveApplication(env, app);
  }
  const first = await listApplications(env);
  assert.deepEqual(first.applications, []);
  assert.ok(
    first.cursor,
    "empty bounded scans must not claim the end of the queue",
  );
  const next = await listApplications(env, first.cursor);
  assert.equal(next.applications.length, 1);
  assert.equal(next.applications[0].status, "new");
  assert.equal(next.cursor, undefined);
  kv.list = async () => ({ keys: [], cursor: "", list_complete: false });
  await assert.rejects(
    listApplications(env),
    (error: unknown) => error instanceof Response && error.status === 503,
  );
});
