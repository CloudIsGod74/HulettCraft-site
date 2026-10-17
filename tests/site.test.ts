import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
test("public source contains no live-map services or embeds", async () => {
  const files = (await readdir("src", { recursive: true })).filter((f) =>
    /\.(astro|ts|css)$/.test(f),
  );
  for (const path of files) {
    const text = await readFile("src/" + path, "utf8");
    assert.doesNotMatch(
      text,
      /\b(?:map|modmap|hpmap)\.hulettcraft\.com|<iframe\b/i,
      path,
    );
  }
});
