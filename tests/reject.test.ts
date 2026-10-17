import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/pages/api/admin/reject";
import { createSession } from "../src/lib/adminSession";

const secret = "test-only-session-secret-not-a-production-credential";
const pending = "Screenshots - Need Approval/123-example.jpg";
async function request(body: unknown, user: string | null = "cloudisgod74", origin = "https://example.test") {
  const deleted: string[] = [];
  const token = user ? await createSession(user, secret) : undefined;
  const req = new Request("https://example.test/api/admin/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, ...(token ? { cookie: `admin_session=${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST({ request: req, locals: { runtime: { env: {
    ADMIN_SESSION_SECRET: secret, HULETTCRAFT_BUCKET: { delete: async (key: string) => { deleted.push(key); } },
  } } } } as never);
  return { res, deleted };
}

test("unauthenticated and non-allowlisted requests cannot delete", async () => {
  for (const user of [null, "not-an-admin"]) {
    const { res, deleted } = await request({ key: pending }, user);
    assert.equal(res.status, 401); assert.deepEqual(deleted, []);
  }
});
test("authenticated same-origin single and bulk rejection work", async () => {
  for (const body of [{ key: pending }, { keys: [pending, pending] }]) {
    const { res, deleted } = await request(body);
    assert.equal(res.status, 200); assert.deepEqual(deleted, [pending]);
  }
});
test("published images and unrelated objects cannot be rejected", async () => {
  for (const key of ["Screenshots/hulettcraft/season-8/example.jpg", "Screenshots/Season_8_Map.JPG", "private.txt"]) {
    const { res, deleted } = await request({ key });
    assert.equal(res.status, 400); assert.deepEqual(deleted, []);
  }
});
test("traversal, encoded keys, controls, and prefix manipulation are rejected", async () => {
  for (const key of [pending + "/child", "Screenshots - Need ApprovalX/a.jpg", ...["../a.jpg", "..", ".", "%2e%2e%2fa.jpg", "a\\b.jpg", "a\n.jpg", "a?b.jpg", ""].map(s => "Screenshots - Need Approval/" + s)]) {
    const { res, deleted } = await request({ key });
    assert.equal(res.status, 400); assert.deepEqual(deleted, []);
  }
});
test("invalid batch members prevent all deletion", async () => {
  for (const keys of [[pending, "Screenshots/published.jpg"], [pending, null], [pending, {}], "not-an-array", [], Array(101).fill(pending)]) {
    const { res, deleted } = await request({ keys });
    assert.equal(res.status, 400); assert.deepEqual(deleted, []);
  }
});
test("malformed JSON and unexpected bodies fail safely", async () => {
  for (const body of ["{", "null", "[]", "true", "{}"] ) {
    const { res, deleted } = await request(body);
    assert.equal(res.status, 400); assert.deepEqual(deleted, []);
  }
});
test("cross-origin and missing-origin requests are forbidden", async () => {
  for (const origin of ["https://attacker.test", ""]) {
    const { res, deleted } = await request({ key: pending }, "cloudisgod74", origin);
    assert.equal(res.status, 403); assert.deepEqual(deleted, []);
  }
});
