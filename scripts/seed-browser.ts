import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../src/lib/runtime";
const directory = ".wrangler/browser",
  state = directory + "/state/v3";
await mkdir(directory, { recursive: true });
// Pages uses the nearest package.json to select its temporary bundle root.
await writeFile(
  directory + "/package.json",
  JSON.stringify({ private: true, type: "module" }),
);
await rm(directory + "/state", { recursive: true, force: true });
await rm(directory + "/dist", { recursive: true, force: true });
await writeFile(
  directory + "/wrangler.jsonc",
  JSON.stringify({
    name: "hulettcraft-browser-test",
    compatibility_date: "2026-01-01",
    pages_build_output_dir: "./dist",
    r2_buckets: [
      { binding: "HULETTCRAFT_BUCKET", bucket_name: "codex-browser-test" },
    ],
    kv_namespaces: [{ binding: "SESSION", id: "browser-test-session" }],
  }),
);
await writeFile(
  directory + "/.dev.vars",
  "ADMIN_SESSION_SECRET=browser-test-only-secret-never-use-in-production\nGITHUB_CLIENT_ID=browser-test-client\n",
);
const proxy = await getPlatformProxy<Env>({
  configPath: directory + "/wrangler.jsonc",
  persist: { path: state },
});
try {
  const bucket = proxy.env.HULETTCRAFT_BUCKET!;
  for (const [name, description, file] of [
    ["first", "Browser build one", "HCS4.jpg"],
    ["second", "Browser build two", "HulettcraftS7.jpg"],
    ["third", "Browser build three", "S6 Shops.jpg"],
  ]) {
    const bytes = new Uint8Array(await readFile("public/images/home/" + file))
      .buffer;
    for (const world of ["hulettcraft", "hytale", "modded"]) {
      await bucket.put(
        "Screenshots/" + world + "/season-8/browser-" + name + ".jpg",
        bytes,
        {
          httpMetadata: { contentType: "image/jpeg" },
          customMetadata: {
            world,
            season: "8",
            description,
            author: "BrowserBuilder",
          },
        },
      );
    }
    await bucket.put(
      "Screenshots - Need Approval/pending-browser-" + name + ".jpg",
      bytes,
      {
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: {
          world: "hulettcraft",
          season: "8",
          description: "Pending " + name,
          author: "PendingBuilder",
        },
      },
    );
  }
  console.log("Seeded isolated local browser-test R2 and KV.");
} finally {
  await proxy.dispose();
}
