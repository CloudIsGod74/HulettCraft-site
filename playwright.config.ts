import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
const executable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4321",
    headless: true,
    launchOptions: {
      ...(executable ? { executablePath: executable } : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: [
    {
      command:
        "node --import tsx scripts/seed-browser.ts && astro build && cp -R dist .wrangler/browser/dist && cd .wrangler/browser && ../../node_modules/.bin/wrangler pages dev dist --ip 127.0.0.1 --port 4321 --persist-to state",
      url: "http://127.0.0.1:4321",
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
        WRANGLER_SEND_METRICS: "false",
        XDG_CONFIG_HOME: tmpdir() + "/hulettcraft-test-config",
        HULETTCRAFT_LOCAL_CONFIG: ".wrangler/browser/wrangler.jsonc",
        HULETTCRAFT_LOCAL_STATE: ".wrangler/browser/state/v3",
      },
    },
    {
      command:
        "cd .wrangler/browser/unavailable && ../../../node_modules/.bin/wrangler pages dev ../dist --ip 127.0.0.1 --port 4322 --persist-to state",
      url: "http://127.0.0.1:4322/join",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
        WRANGLER_SEND_METRICS: "false",
        XDG_CONFIG_HOME: tmpdir() + "/hulettcraft-test-config",
      },
    },
  ],
});
