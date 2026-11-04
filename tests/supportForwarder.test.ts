import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationForwardingHeader,
  APPLICATION_FORWARDING_HEADER,
} from "../src/lib/applicationForwarding";
import worker, {
  forwardingDestinations,
} from "../workers/support-forwarder/index";

async function message(to = "support@hulettcraft.com", signed = true) {
  const forwarded: string[] = [];
  const rejected: string[] = [];
  const raw = "A synthetic application and attachment must stay unchanged.";
  return {
    to,
    headers: new Headers({
      Subject: "HulettCraft SMP application: TestBuilder",
      ...(signed
        ? {
            [APPLICATION_FORWARDING_HEADER]: (await applicationForwardingHeader(
              secret,
              "synthetic-application-id",
              "HulettCraft SMP application: TestBuilder",
            ))!,
          }
        : {}),
    }),
    raw,
    forwarded,
    rejected,
    async forward(address: string) {
      forwarded.push(address);
    },
    setReject(reason: string) {
      rejected.push(reason);
    },
  };
}
const secret = "synthetic-forwarding-secret-not-real-123456";
const env = {
  APPLICATION_FORWARDING_SECRET: secret,
  SUPPORT_FORWARD_TO: "first@example.test,second@example.test",
};

test("support forwarding targets every configured inbox once without altering the original message", async (t) => {
  const info = t.mock.method(console, "info", () => {});
  const email = await message();
  await worker.email(email, env);
  assert.deepEqual(email.forwarded, [
    "first@example.test",
    "second@example.test",
  ]);
  assert.deepEqual(email.rejected, []);
  assert.equal(
    email.raw,
    "A synthetic application and attachment must stay unchanged.",
  );
  assert.equal(info.mock.callCount(), 1);
  assert.doesNotMatch(
    JSON.stringify(info.mock.calls),
    /first@example|second@example|synthetic application/,
  );
});

test("destination settings are case-insensitively deduplicated and support an ordinary single inbox", async (t) => {
  t.mock.method(console, "info", () => {});
  assert.deepEqual(
    forwardingDestinations(
      " First@Example.test,second@example.test,first@example.test ",
    ),
    ["first@example.test", "second@example.test"],
  );
  const email = await message();
  await worker.email(email, {
    ...env,
    SUPPORT_FORWARD_TO: "first@example.test",
  });
  assert.deepEqual(email.forwarded, ["first@example.test"]);
});

test("a temporary support test alias uses the same forwarding logic while unrelated addresses are rejected", async (t) => {
  t.mock.method(console, "info", () => {});
  const email = await message("SUPPORT-FORWARDING-TEST@HULETTCRAFT.COM");
  await worker.email(email, env);
  assert.equal(email.forwarded.length, 2);
  for (const to of [
    "other@hulettcraft.com",
    "support@attacker.example",
    "support+loop@hulettcraft.com",
  ]) {
    const unrelated = await message(to);
    await worker.email(unrelated, env);
    assert.equal(unrelated.forwarded.length, 0);
    assert.equal(unrelated.rejected.length, 1);
  }
});

test("missing, malformed, injected or excessive destinations reject before any forwarding", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  for (const value of [
    undefined,
    "",
    " ",
    "first@example.test,",
    "Name <first@example.test>",
    "first@example.test\r\nBcc:other@example.test",
    ".first@example.test",
    "first..last@example.test",
    "first@localhost",
    "x".repeat(2601),
    Array.from({ length: 11 }, (_, index) => `inbox${index}@example.test`).join(
      ",",
    ),
  ]) {
    const email = await message();
    await worker.email(email, { ...env, SUPPORT_FORWARD_TO: value });
    assert.deepEqual(email.forwarded, []);
    assert.equal(email.rejected.length, 1);
  }
  assert.doesNotMatch(
    JSON.stringify(errors.mock.calls),
    /first@example|Bcc|Name </,
  );
});

test("routing back into HulettCraft aliases is rejected to prevent forwarding loops", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const value of [
    "support@hulettcraft.com",
    "support+tag@hulettcraft.com",
    "support-forwarding-test@hulettcraft.com",
    "other@hulettcraft.com",
    "other@mail.hulettcraft.com",
    "first@example.test,support@hulettcraft.com",
  ]) {
    const email = await message();
    await worker.email(email, { ...env, SUPPORT_FORWARD_TO: value });
    assert.deepEqual(email.forwarded, []);
    assert.equal(email.rejected.length, 1);
  }
});

test("one failed destination does not prevent others being attempted and errors disclose no private addresses or contents", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const email = await message();
  const attempts: string[] = [];
  email.forward = async (address: string) => {
    attempts.push(address);
    if (address === "first@example.test")
      throw new Error(
        "PRIVATE-PROVIDER-ERROR first@example.test original application text",
      );
  };
  await assert.rejects(
    worker.email(email, env),
    /Support forwarding incomplete/,
  );
  assert.deepEqual(attempts, ["first@example.test", "second@example.test"]);
  assert.deepEqual(
    email.rejected,
    [],
    "do not issue a permanent rejection after a partial forward",
  );
  assert.deepEqual(errors.mock.calls[0].arguments, [
    "Support forwarding incomplete.",
    { requested: 2, failedSlots: [1] },
  ]);
  assert.doesNotMatch(
    JSON.stringify(errors.mock.calls),
    /PRIVATE-PROVIDER|first@example|second@example|application text/,
  );
});

test("all failed destinations surface a failure without falling back to an unconfigured inbox", async (t) => {
  t.mock.method(console, "error", () => {});
  const email = await message();
  const attempts: string[] = [];
  email.forward = async (address: string) => {
    attempts.push(address);
    throw new Error("synthetic failure");
  };
  await assert.rejects(
    worker.email(email, env),
    /Support forwarding incomplete/,
  );
  assert.deepEqual(attempts, ["first@example.test", "second@example.test"]);
});

test("untrusted incoming fields cannot choose recipients or expose forwarding configuration through an HTTP handler", async (t) => {
  t.mock.method(console, "info", () => {});
  const email = {
    ...(await message()),
    from: "attacker@example.test",
    headers: new Headers({
      To: "attacker@example.test",
      "X-Forward-To": "attacker@example.test",
    }),
  };
  await worker.email(email, env);
  assert.deepEqual(email.forwarded, ["first@example.test"]);
  assert.equal("fetch" in worker, false);
});

test("ordinary support mail stays only with the primary inbox even when it imitates the application sender and subject", async (t) => {
  t.mock.method(console, "info", () => {});
  const email = await message("support@hulettcraft.com", false);
  email.headers.set("From", "applications@hulettcraft.com");
  email.headers.set(APPLICATION_FORWARDING_HEADER, "forged");
  await worker.email(email, env);
  assert.deepEqual(email.forwarded, ["first@example.test"]);
});

test("a missing or changed signing key preserves primary support delivery and does not share the message", async (t) => {
  t.mock.method(console, "info", () => {});
  for (const signingSecret of [
    undefined,
    "short",
    "different-long-signing-secret-never-real-1234",
  ]) {
    const email = await message();
    await worker.email(email, {
      ...env,
      APPLICATION_FORWARDING_SECRET: signingSecret,
    });
    assert.deepEqual(email.forwarded, ["first@example.test"]);
  }
});
