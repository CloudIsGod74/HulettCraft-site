import { test, expect } from "@playwright/test";
import { createSession } from "../../src/lib/adminSession";
import { creeperIcon } from "../fixtures/serverIcon";
const secret = "browser-test-only-secret-never-use-in-production";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/favicon.png?*", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "X-Favicon-Source": "mcstatus" },
      body: creeperIcon().bytes,
    }),
  );
  await page.route("**/api/server-status.json", (route) =>
    route.fulfill({
      json: {
        hulettcraft: { state: "online" },
        creative: { state: "offline" },
        modded: {
          state: "online",
          players: { online: 2, max: 20 },
          version: "test",
        },
        hytale: {
          state: "online",
          players: { online: 0, max: 40 },
          version: "2026.test <img src=x>",
        },
      },
    }),
  );
});
test("Hytale renders a real query result across its page, Worlds and Status and handles unavailable checks", async ({
  page,
}) => {
  for (const path of ["/hytale", "/worlds", "/status"]) {
    await page.goto(path);
    const status = page.locator('[data-status-server="hytale"]');
    await expect(status).toContainText("Online");
    if (path !== "/worlds") {
      await expect(status).toContainText("0/40 players");
      await expect(status).toContainText("2026.test <img src=x>");
    }
    await expect(status.locator("img")).toHaveCount(0);
  }
  await page.route("**/api/server-status.json", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.reload();
  await expect(page.locator('[data-status-server="hytale"]')).toContainText(
    "Status unavailable",
  );
});
test("admins save drafts, publish exact modpack versions and switch to a custom list without rebuilding", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  await context.addCookies([
    {
      name: "admin_session",
      value: await createSession("cloudisgod74", secret),
      url: "http://127.0.0.1:4321",
    },
  ]);
  const initial = await (
    await page.request.get("/api/admin/modded-guide")
  ).json();
  try {
    await page.goto("/admin/pending");
    await page
      .getByRole("link", { name: "Modded client setup", exact: true })
      .click();
    await expect(page.locator("#modded-setup-form")).toBeVisible();
    await page
      .getByLabel("Modpack name", { exact: true })
      .fill("Private unconfirmed draft");
    await page.getByRole("button", { name: "Save client setup" }).click();
    await expect(page.locator("#modded-setup-result")).toContainText(
      "Draft saved",
    );
    await page.goto("/modded");
    expect(await page.content()).not.toContain("Private unconfirmed draft");
    await expect(page.getByRole("status").last()).toContainText(
      "requirements are being confirmed",
    );
    await page.goto("/admin/modded");
    await page
      .getByLabel("Modpack name", { exact: true })
      .fill("Example Pack <em>2</em>");
    await page.getByLabel("Exact pack version").fill("2.1.0");
    await page
      .getByLabel("Minecraft version", { exact: true })
      .fill("test-game-1");
    await page
      .getByRole("combobox", { name: "Mod loader", exact: true })
      .selectOption("NeoForge");
    await page
      .getByLabel("Loader version", { exact: true })
      .fill("test-loader-1");
    await page
      .getByLabel("Pack or download link")
      .fill(
        "https://www.curseforge.com/minecraft/modpacks/example/files/12345",
      );
    await page
      .getByLabel("Installation and joining instructions")
      .fill("Choose release 2.1.0.\n<img src=x onerror=alert(1)>");
    await page.getByLabel("Publish these client requirements").check();
    await page.route("**/api/admin/modded-guide", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 409,
            body: "Setup changed. Review before saving.",
          })
        : route.continue(),
    );
    await page.getByRole("button", { name: "Save client setup" }).click();
    await expect(page.locator("#modded-setup-result")).toContainText(
      "Your edits are still here",
    );
    await expect(page.getByLabel("Exact pack version")).toHaveValue("2.1.0");
    await page.unroute("**/api/admin/modded-guide");
    await page.getByRole("button", { name: "Save client setup" }).click();
    await expect(page.locator("#modded-setup-result")).toContainText(
      "Client setup published",
    );
    await page.reload();
    await expect(page.getByLabel("Exact pack version")).toHaveValue("2.1.0");
    await page.goto("/modded");
    const guide = page.locator(".modded-client-guide");
    await expect(guide).toContainText("Example Pack <em>2</em>");
    await expect(guide).toContainText("2.1.0");
    await expect(guide).toContainText("NeoForge test-loader-1");
    await expect(guide.locator("img, em")).toHaveCount(0);
    await expect(
      guide.getByRole("link", { name: /Get this modpack/ }),
    ).toHaveAttribute("href", /files\/12345$/);
    await guide.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath("modded-pack-desktop.png"),
    });
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("modded-pack-mobile.png"),
    });
    await page.goto("/admin/modded");
    await page
      .getByRole("combobox", { name: "Setup type" })
      .selectOption("custom");
    await expect(page.getByLabel("Modpack name", { exact: true })).toBeHidden();
    await page
      .getByLabel("Required client mods and versions")
      .fill("Test mod 1.2\nAnother test mod 3.4");
    await page.getByRole("button", { name: "Save client setup" }).click();
    await expect(page.locator("#modded-setup-result")).toContainText(
      "Client setup published",
    );
    await page.goto("/modded");
    await expect(guide).toContainText("Custom mod setup");
    await expect(guide.locator("li")).toHaveText([
      "Test mod 1.2",
      "Another test mod 3.4",
    ]);
    await page.goto("/worlds");
    await page
      .getByRole("link", { name: "Seasonal / Modded", exact: true })
      .click();
    await expect(page).toHaveURL(/\/modded$/);
    await page
      .getByRole("link", { name: /Explore the Modded gallery/ })
      .click();
    await page
      .getByRole("link", { name: /View required mods and setup/ })
      .click();
    await expect(page).toHaveURL(/\/modded$/);
    const guest = await browser.newContext();
    try {
      const visitor = await guest.newPage();
      await visitor.goto("http://127.0.0.1:4321/admin/modded");
      await expect(visitor).toHaveURL(/\/admin\/login$/);
      expect(
        (
          await visitor.request.get(
            "http://127.0.0.1:4321/api/admin/modded-guide",
          )
        ).status(),
      ).toBe(401);
    } finally {
      await guest.close();
    }
    await page.goto("/admin/modded");
    await page.getByLabel("Publish these client requirements").uncheck();
    await page.getByRole("button", { name: "Save client setup" }).click();
    await expect(page.locator("#modded-setup-result")).toContainText(
      "Draft saved",
    );
    await page.goto("/modded");
    expect(await page.content()).not.toContain("Another test mod");
  } finally {
    const current = await (
      await page.request.get("/api/admin/modded-guide")
    ).json();
    await page.request.post("/api/admin/modded-guide", {
      headers: { Origin: "http://127.0.0.1:4321" },
      data: { revision: current.revision, guide: initial.guide },
    });
  }
});
