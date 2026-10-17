import test from "node:test";
import assert from "node:assert/strict";
import { listGallery, listPending, mergeMetadata } from "../src/lib/gallery";
import { POST as approve } from "../src/pages/api/admin/approve";
import { POST as update } from "../src/pages/api/admin/update-metadata";
import { POST as bulk } from "../src/pages/api/admin/bulk-upload";
import { POST as reject } from "../src/pages/api/admin/reject";
import { GET as summary } from "../src/pages/api/gallery/hulettcraft";
import { MemoryBucket, locals, request, context, png } from "./helpers";
test("all mutating administrator endpoints require authentication and a matching Origin", async () => {
  for (const route of [approve, update, bulk, reject]) {
    assert.equal(
      (await route(context(await request("/api/admin/action", {}, false))))
        .status,
      401,
    );
    assert.equal(
      (
        await route(
          context(
            await request(
              "/api/admin/action",
              {},
              true,
              "https://attacker.test",
            ),
          ),
        )
      ).status,
      403,
    );
  }
});
test("gallery and pending listings traverse every page and retain custom metadata", async () => {
  const bucket = new MemoryBucket();
  for (let i = 0; i < 5; i++) {
    await bucket.put("Screenshots/hulettcraft/season-8/" + i + ".png", png, {
      customMetadata: { description: "Image " + i, author: "Builder" },
    });
    await bucket.put("Screenshots - Need Approval/" + i + ".png", png, {
      customMetadata: {
        world: "hulettcraft",
        season: "8",
        description: "Pending " + i,
      },
    });
  }
  const gallery = await listGallery(bucket as never, "hulettcraft", "8"),
    pending = await listPending(bucket as never);
  assert.equal(gallery.length, 5);
  assert.equal(pending.length, 5);
  assert.equal(gallery[4].metadata.description, "Image 4");
  assert.equal(pending[4].metadata.description, "Pending 4");
  assert.ok(bucket.listCalls.some((c) => c.cursor === "4"));
  assert.ok(
    bucket.listCalls.every((c) =>
      (c.include as string[]).includes("customMetadata"),
    ),
  );
  const response = await summary(
    context(await request("/api/gallery/hulettcraft"), locals(bucket)),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).find((s: { season: number }) => s.season === 8)
      .count,
    5,
  );
});
test("blank metadata preserves existing values and clearing must be explicit", () => {
  const original = {
    description: "A build",
    author: "Builder",
    world: "hulettcraft",
    season: "8",
  };
  assert.deepEqual(
    mergeMetadata(original, { description: "", author: "  " }),
    original,
  );
  assert.equal(
    mergeMetadata(original, { description: "New caption" }).author,
    "Builder",
  );
  assert.equal(
    mergeMetadata(original, { clearFields: ["description"] }).description,
    "",
  );
  assert.throws(() => mergeMetadata(original, { world: "modded" }));
});
test("metadata API retains image bytes and unrelated metadata", async () => {
  const bucket = new MemoryBucket(),
    key = "Screenshots/hulettcraft/season-8/build.png";
  await bucket.put(key, png, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      description: "Old caption",
      author: "Builder",
      season: "8",
    },
  });
  const res = await update(
    context(
      await request("/api/admin/update-metadata", {
        key,
        updates: { description: "New caption", author: "" },
      }),
      locals(bucket),
    ),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(bucket.objects.get(key)!.bytes, png);
  assert.equal(bucket.objects.get(key)!.customMetadata.author, "Builder");
  assert.equal(
    bucket.objects.get(key)!.customMetadata.description,
    "New caption",
  );
});
test("approval retains descriptions and publishes safely, then rejection removes only a pending object", async () => {
  const bucket = new MemoryBucket(),
    key = "Screenshots - Need Approval/unique.png",
    env = locals(bucket);
  await bucket.put(key, png, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      world: "hulettcraft",
      season: "8",
      description: "Original",
      author: "Builder",
    },
  });
  const res = await approve(
    context(
      await request("/api/admin/approve", {
        key,
        updates: { [key]: { description: "", author: "" } },
      }),
      env,
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(bucket.objects.has(key), false);
  const published = bucket.objects.get(
    "Screenshots/hulettcraft/season-8/unique.png",
  )!;
  assert.equal(published.customMetadata.description, "Original");
  assert.equal(published.customMetadata.author, "Builder");
  await bucket.put(key, png, {
    customMetadata: { world: "hulettcraft", season: "8" },
  });
  const conflict = await approve(
    context(await request("/api/admin/approve", { key }), env),
  );
  assert.equal(conflict.status, 207);
  assert.equal((await conflict.json()).results[0].ok, false);
  assert.ok(bucket.objects.has(key));
  assert.equal(published.customMetadata.description, "Original");
  assert.equal(
    (await reject(context(await request("/api/admin/reject", { key }), env)))
      .status,
    200,
  );
  assert.ok(bucket.objects.has("Screenshots/hulettcraft/season-8/unique.png"));
});
test("bulk uploads use unique keys for duplicate filenames and validate the whole manifest before writing", async () => {
  const bucket = new MemoryBucket(),
    env = locals(bucket);
  async function send(invalid = false) {
    const form = new FormData();
    form.append("files", new File([png], "same.png"));
    form.append("files", new File([invalid ? "<svg/>" : png], "same.png"));
    form.set(
      "manifest",
      JSON.stringify([
        { filename: "same.png", world: "hytale", description: "One" },
        { filename: "same.png", world: "modded", description: "Two" },
      ]),
    );
    return bulk(
      context(
        new Request("https://example.test/api/admin/bulk-upload", {
          method: "POST",
          headers: {
            origin: "https://example.test",
            cookie: (await request("/")).headers.get("cookie")!,
          },
          body: form,
        }),
        env,
      ),
    );
  }
  assert.equal((await send(true)).status, 415);
  assert.equal(bucket.objects.size, 0);
  assert.equal((await send()).status, 200);
  assert.equal(bucket.objects.size, 2);
  assert.equal((await listGallery(bucket as never, "hytale")).length, 1);
  assert.equal((await listGallery(bucket as never, "modded")).length, 1);
});
