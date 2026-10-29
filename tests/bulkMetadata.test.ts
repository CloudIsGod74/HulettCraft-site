import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/pages/api/admin/bulk-metadata";
import { MemoryBucket, locals, request, context, png } from "./helpers";
const first = "Screenshots/hulettcraft/season-8/first.png";
const second = "Screenshots/hytale/season-8/second.png";

test("bulk author edits require admin and exact Origin, and validate the entire selection before writing", async () => {
  const bucket = new MemoryBucket(),
    env = locals(bucket);
  await bucket.put(first, png, { customMetadata: { author: "Original" } });
  const body = { keys: [first], author: "Builder" };
  assert.equal(
    (
      await POST(
        context(await request("/api/admin/bulk-metadata", body, false), env),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await POST(
        context(
          await request(
            "/api/admin/bulk-metadata",
            body,
            true,
            "https://attacker.test",
          ),
          env,
        ),
      )
    ).status,
    403,
  );
  for (const invalid of [
    { ...body, keys: [] },
    { ...body, keys: Array(51).fill(first) },
    { ...body, keys: [first, "Screenshots - Need Approval/private.png"] },
    { ...body, keys: [first, "private:application"] },
    { ...body, author: " " },
    { ...body, author: "x".repeat(101) },
    { ...body, description: "Do not change captions" },
    { ...body, clearAuthor: true },
    { keys: [first], clearAuthor: "true" },
  ])
    assert.equal(
      (
        await POST(
          context(await request("/api/admin/bulk-metadata", invalid), env),
        )
      ).status,
      400,
    );
  assert.equal(bucket.objects.get(first)!.customMetadata.author, "Original");
});
test("bulk author edits preserve bytes, captions, HTTP metadata and unrelated metadata across worlds", async () => {
  const bucket = new MemoryBucket();
  for (const key of [first, second])
    await bucket.put(key, png, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: { author: "Old", description: "Caption", other: "Keep" },
    });
  const response = await POST(
    context(
      await request("/api/admin/bulk-metadata", {
        keys: [first, second, first],
        author: "NewBuilder",
      }),
      locals(bucket),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results.length, 2);
  for (const key of [first, second]) {
    const obj = bucket.objects.get(key)!;
    assert.deepEqual(obj.bytes, png);
    assert.deepEqual(obj.customMetadata, {
      author: "NewBuilder",
      description: "Caption",
      other: "Keep",
    });
    assert.equal(obj.httpMetadata.contentType, "image/png");
  }
  const cleared = await POST(
    context(
      await request("/api/admin/bulk-metadata", {
        keys: [first],
        clearAuthor: true,
      }),
      locals(bucket),
    ),
  );
  assert.equal(cleared.status, 200);
  assert.equal(bucket.objects.get(first)!.customMetadata.author, "");
  assert.equal(bucket.objects.get(second)!.customMetadata.author, "NewBuilder");
});
test("partial failures and concurrent changes are reported individually without overwriting conflicted images", async () => {
  const bucket = new MemoryBucket();
  for (const key of [first, second])
    await bucket.put(key, png, { customMetadata: { author: "Old" } });
  const put = bucket.put.bind(bucket);
  bucket.put = async (key, bytes, options) =>
    key === second ? null : put(key, bytes, options);
  const missing = "Screenshots/modded/season-2/missing.png";
  const response = await POST(
    context(
      await request("/api/admin/bulk-metadata", {
        keys: [first, second, missing],
        author: "NewBuilder",
      }),
      locals(bucket),
    ),
  );
  assert.equal(response.status, 207);
  const { results } = await response.json();
  assert.deepEqual(
    results.map((result: { ok: boolean }) => result.ok),
    [true, false, false],
  );
  assert.match(results[1].message, /Image changed/);
  assert.match(results[2].message, /not found/);
  assert.equal(bucket.objects.get(second)!.customMetadata.author, "Old");
});
