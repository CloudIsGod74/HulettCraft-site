import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/pages/api/admin/roster";
import {
  readRoster,
  ROSTER_KEY,
  validateMembers,
} from "../src/lib/communityRoster";
import { activeMembers } from "../src/config/community";
import { context, locals, request } from "./helpers";

class MemoryKV {
  values = new Map<string, string>();
  writes: string[] = [];
  failRead = false;
  failWrite = false;
  async get(key: string) {
    if (this.failRead && key === ROSTER_KEY)
      throw new Error("Storage unavailable");
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string) {
    if (this.failWrite) throw new Error("Storage unavailable");
    this.writes.push(key);
    this.values.set(key, value);
  }
}
const member = {
  username: "Builder_1",
  displayName: "Builder",
  active: true,
  bio: "Builds with friends",
  links: [{ label: "Website", url: "https://example.com/builder" }],
};

test("roster API requires an administrator for reading and writing and exact Origin for writing", async () => {
  const kv = new MemoryKV(),
    env = locals(undefined, { SESSION: kv });
  assert.equal(
    (
      await GET(
        context(await request("/api/admin/roster", undefined, false), env),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await POST(
        context(
          await request(
            "/api/admin/roster",
            { revision: "unpublished", members: [member] },
            false,
          ),
          env,
        ),
      )
    ).status,
    401,
  );
  for (const origin of [
    "",
    "https://attacker.test",
    "https://example.test.attacker.test",
  ]) {
    assert.equal(
      (
        await POST(
          context(
            await request(
              "/api/admin/roster",
              { revision: "unpublished", members: [member] },
              true,
              origin,
            ),
            env,
          ),
        )
      ).status,
      403,
    );
  }
  assert.deepEqual(kv.writes, []);
});

test("saving and reloading a roster persists active and hidden members without touching other KV keys", async () => {
  const kv = new MemoryKV(),
    env = locals(undefined, { SESSION: kv });
  kv.values.set("public:server-favicon:v1:hulettcraft", "saved icon");
  const hidden = {
    username: "FormerBuilder",
    displayName: "Former builder",
    active: false,
  };
  const initial = await GET(context(await request("/api/admin/roster"), env));
  assert.match(initial.headers.get("cache-control")!, /no-store/);
  const revision = (await initial.json()).revision;
  const response = await POST(
    context(
      await request("/api/admin/roster", {
        revision,
        members: [member, hidden],
      }),
      env,
    ),
  );
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.notEqual(saved.revision, revision);
  assert.ok(Date.parse(saved.updatedAt));
  assert.deepEqual((await readRoster(env)).members, [member, hidden]);
  assert.deepEqual(activeMembers((await readRoster(env)).members), [member]);
  assert.deepEqual(kv.writes, [ROSTER_KEY]);
  assert.equal(
    kv.values.get("public:server-favicon:v1:hulettcraft"),
    "saved icon",
  );
  // No expiration option is supplied; saved profiles survive deployment/restarts.
});

test("observed stale revisions cannot overwrite the saved roster", async () => {
  const kv = new MemoryKV(),
    env = locals(undefined, { SESSION: kv });
  const first = await POST(
    context(
      await request("/api/admin/roster", {
        revision: "unpublished",
        members: [member],
      }),
      env,
    ),
  );
  assert.equal(first.status, 200);
  const response = await POST(
    context(
      await request("/api/admin/roster", {
        revision: "unpublished",
        members: [],
      }),
      env,
    ),
  );
  assert.equal(response.status, 409);
  assert.deepEqual((await readRoster(env)).members, [member]);
});

test("validation rejects duplicates, unsafe links, malformed fields and oversized lists before writing", async () => {
  const kv = new MemoryKV(),
    env = locals(undefined, { SESSION: kv });
  const invalid = [
    null,
    {},
    [member, { ...member, username: "builder_1" }],
    [{ ...member, active: "true" }],
    [{ ...member, username: "bad name" }],
    [{ ...member, extra: "discard me" }],
    [{ ...member, displayName: " " }],
    [{ ...member, bio: "x".repeat(501) }],
    [{ ...member, links: Array(9).fill(member.links[0]) }],
    Array(201).fill(member),
    ...[
      "javascript:alert(1)",
      "data:text/html,<script>",
      "http://example.com",
      "https://user:pass@example.com",
      "/relative",
    ].map((url) => [{ ...member, links: [{ label: "Unsafe", url }] }]),
  ];
  for (const members of invalid) {
    const response = await POST(
      context(
        await request("/api/admin/roster", {
          revision: "unpublished",
          members,
        }),
        env,
      ),
    );
    assert.equal(response.status, 400, JSON.stringify(members).slice(0, 200));
  }
  assert.deepEqual(kv.writes, []);
});

test("validation normalizes whitespace and permits social-free active members and an empty roster", () => {
  assert.deepEqual(
    validateMembers([
      {
        username: " Builder ",
        displayName: " Builder ",
        active: true,
        bio: " ",
      },
    ]),
    [{ username: "Builder", displayName: "Builder", active: true }],
  );
  assert.deepEqual(validateMembers([]), []);
});

test("missing, failed or corrupt roster storage returns 503 rather than saving over missing data", async () => {
  assert.equal(
    (await GET(context(await request("/api/admin/roster")))).status,
    503,
  );
  for (const mode of ["read", "write", "corrupt", "invalid-schema"]) {
    const kv = new MemoryKV(),
      env = locals(undefined, { SESSION: kv });
    kv.failRead = mode === "read";
    kv.failWrite = mode === "write";
    if (mode === "corrupt") kv.values.set(ROSTER_KEY, "broken JSON");
    if (mode === "invalid-schema")
      kv.values.set(
        ROSTER_KEY,
        JSON.stringify({
          revision: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
          members: [
            {
              ...member,
              links: [{ label: "Bad", url: "javascript:alert(1)" }],
            },
          ],
        }),
      );
    const before = kv.values.get(ROSTER_KEY);
    const response = await POST(
      context(
        await request("/api/admin/roster", {
          revision: "unpublished",
          members: [member],
        }),
        env,
      ),
    );
    assert.equal(response.status, 503, mode);
    assert.equal(kv.values.get(ROSTER_KEY), before);
    assert.deepEqual(kv.writes, []);
  }
});

test("malformed JSON and oversized requests cannot change the saved roster", async () => {
  const kv = new MemoryKV(),
    env = locals(undefined, { SESSION: kv });
  const authenticated = await request("/api/admin/roster", {});
  for (const [body, contentType, status] of [
    ["{", "application/json", 400],
    ["x".repeat(65537), "application/json", 413],
    ["{}", "text/plain", 415],
  ] as const) {
    const headers = new Headers(authenticated.headers);
    headers.set("Content-Type", contentType);
    const req = new Request(authenticated.url, {
      method: "POST",
      headers,
      body,
    });
    assert.equal((await POST(context(req, env))).status, status);
  }
  assert.deepEqual(kv.writes, []);
});
