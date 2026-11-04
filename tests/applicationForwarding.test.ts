import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  applicationForwardingHeader,
  isApplicationNotification,
} from "../src/lib/applicationForwarding";
const secret = "test-only-marker-secret-never-a-real-key-12345";
const id = "synthetic-application-id";
const subject = "HulettCraft SMP application: TestBuilder";
const now = Date.UTC(2026, 9, 27, 12);

test("a signed marker matches an independent HMAC and verifies for its exact application subject", async () => {
  const marker = await applicationForwardingHeader(secret, id, subject, now);
  const issued = String(Math.floor(now / 1000));
  const expected = createHmac("sha256", secret)
    .update(`hulettcraft-application-v1\n${issued}\n${id}\n${subject}`)
    .digest("hex");
  assert.equal(marker, `v1:${issued}:${id}:${expected}`);
  assert.equal(
    await isApplicationNotification(secret, marker!, subject, now),
    true,
  );
  assert.equal(
    await isApplicationNotification(
      secret,
      marker!,
      "Ordinary support message",
      now,
    ),
    false,
  );
});

test("tampering, forged markers and a different signing key never authorize an additional recipient", async () => {
  const marker = (await applicationForwardingHeader(secret, id, subject, now))!;
  for (const value of [
    null,
    "forged",
    marker.replace(id, "other-application"),
    marker.slice(0, -1),
    "x".repeat(301),
    marker.replace(/^v1:/, "v2:"),
  ])
    assert.equal(
      await isApplicationNotification(secret, value, subject, now),
      false,
    );
  assert.equal(
    await isApplicationNotification(
      "a-different-secret-longer-than-32-characters",
      marker,
      subject,
      now,
    ),
    false,
  );
});

test("markers expire after seven days and reject future clocks beyond five minutes", async () => {
  const marker = (await applicationForwardingHeader(secret, id, subject, now))!;
  assert.equal(
    await isApplicationNotification(
      secret,
      marker,
      subject,
      now + 7 * 86400_000,
    ),
    true,
  );
  assert.equal(
    await isApplicationNotification(
      secret,
      marker,
      subject,
      now + 7 * 86400_000 + 1000,
    ),
    false,
  );
  assert.equal(
    await isApplicationNotification(secret, marker, subject, now - 300_000),
    true,
  );
  assert.equal(
    await isApplicationNotification(secret, marker, subject, now - 301_000),
    false,
  );
});

test("missing or invalid marker keys leave existing notification sending and primary forwarding available", async () => {
  for (const value of [
    undefined,
    "",
    "short",
    "x".repeat(257),
    "test-secret-with-newline-123456789012345\n",
  ])
    assert.equal(
      await applicationForwardingHeader(value, id, subject, now),
      undefined,
    );
  assert.equal(
    await isApplicationNotification(undefined, "forged", subject, now),
    false,
  );
});

test("marker inputs are bounded and cannot introduce email header lines", async () => {
  await assert.rejects(
    applicationForwardingHeader(secret, "bad\r\nid", subject, now),
  );
  await assert.rejects(
    applicationForwardingHeader(
      secret,
      id,
      subject + "\r\nBcc: other@example.test",
      now,
    ),
  );
  await assert.rejects(
    applicationForwardingHeader(secret, id, "x".repeat(161), now),
  );
});
