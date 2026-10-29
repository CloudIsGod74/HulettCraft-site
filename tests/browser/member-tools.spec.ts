import { test, expect } from "@playwright/test";
import { createSession } from "../../src/lib/adminSession";
import { creeperIcon } from "../fixtures/serverIcon";

const secret = "browser-test-only-secret-never-use-in-production";
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: await createSession("cloudisgod74", secret),
      url: "http://127.0.0.1:4321",
    },
  ]);
  await page.route("**/api/favicon.png?*", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "X-Favicon-Source": "mcstatus" },
      body: creeperIcon().bytes,
    }),
  );
});

test("member editor publishes Minecraft heads or resized uploads, retains failed uploads and hides inactive profiles", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.route("https://mc-heads.net/**", (route) =>
    route.fulfill({ contentType: "image/png", body: creeperIcon().bytes }),
  );
  const initial = await (await page.request.get("/api/admin/roster")).json();
  try {
    await page.goto("/admin/roster");
    await expect(page.locator("#roster-form")).toBeVisible();
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    await page.getByLabel("Minecraft username").fill("PortraitBuilder");
    await page.getByLabel("Display name").fill("Portrait Builder");
    await page
      .getByRole("combobox", { name: "Member image", exact: true })
      .selectOption("minecraft");
    await expect(page.locator(".roster-portrait-preview")).toBeVisible();
    await page.getByRole("button", { name: "Save roster" }).click();
    await expect(page.locator("#roster-result")).toContainText("Roster saved");
    await page.goto("/community");
    await expect(page.locator(".member-card img")).toHaveAttribute(
      "src",
      "https://mc-heads.net/avatar/PortraitBuilder/128",
    );
    await page.unroute("https://mc-heads.net/**");
    await page.route("https://mc-heads.net/**", (route) =>
      route.abort("failed"),
    );
    await page.reload();
    await expect(page.locator(".member-card img")).toBeHidden();
    await expect(page.locator(".member-avatar")).toContainText("PO");
    await expect(page.locator(".member-card h3")).toHaveText(
      "Portrait Builder",
    );
    await page.goto("/admin/roster");
    await page
      .getByRole("combobox", { name: "Member image", exact: true })
      .selectOption("upload");
    await page.route("**/api/admin/member-image", (route) =>
      route.fulfill({
        status: 503,
        body: "Image storage temporarily unavailable",
      }),
    );
    await page
      .getByLabel("Upload member image or screenshot")
      .setInputFiles("public/images/home/HCS4.jpg");
    await expect(page.locator("[data-avatar-status]")).toContainText(
      "previous image is retained",
    );
    expect(
      (await (await page.request.get("/api/admin/roster")).json()).members[0]
        .avatar.type,
    ).toBe("minecraft");
    await page.unroute("**/api/admin/member-image");
    await page
      .getByLabel("Upload member image or screenshot")
      .setInputFiles("public/images/home/HCS4.jpg");
    await expect(page.locator("[data-avatar-status]")).toContainText(
      "Image ready",
    );
    expect(
      await page
        .locator(".roster-portrait-preview")
        .evaluate((image: HTMLImageElement) =>
          Math.max(image.naturalWidth, image.naturalHeight),
        ),
    ).toBeLessThanOrEqual(256);
    await page.getByRole("button", { name: "Save roster" }).click();
    await expect(page.locator("#roster-result")).toContainText("Roster saved");
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Member image", exact: true }),
    ).toHaveValue("upload");
    await expect(page.locator(".roster-portrait-preview")).toBeVisible();
    await page.goto("/community");
    await expect(page.locator(".member-card img")).toHaveAttribute(
      "src",
      /^data:image\/webp;base64,/,
    );
    await page.locator("#members").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath("member-upload-desktop.png"),
    });
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("member-upload-mobile.png"),
    });
    await page.goto("/admin/roster");
    await page.getByLabel("Show in directory").uncheck();
    await page.getByRole("button", { name: "Save roster" }).click();
    await expect(page.locator("#roster-result")).toContainText("Roster saved");
    await page.goto("/community");
    expect(await page.content()).not.toContain("PortraitBuilder");
    await expect(page.locator(".member-card")).toHaveCount(0);
  } finally {
    const current = await (await page.request.get("/api/admin/roster")).json();
    expect(
      (
        await page.request.post("/api/admin/roster", {
          headers: { Origin: "http://127.0.0.1:4321" },
          data: { revision: current.revision, members: initial.members },
        })
      ).ok(),
    ).toBe(true);
  }
});

test("gallery member dropdowns and bulk edits preserve captions and drafts, report partial failure and support retry", async ({
  page,
  browser,
}) => {
  const initial = await (await page.request.get("/api/admin/roster")).json();
  const original = await (
    await page.request.get("/api/gallery/hulettcraft/season/8")
  ).json();
  try {
    expect(
      (
        await page.request.post("/api/admin/roster", {
          headers: { Origin: "http://127.0.0.1:4321" },
          data: {
            revision: initial.revision,
            members: [
              {
                username: "ImageBuilder",
                displayName: "Image Builder",
                active: true,
              },
              {
                username: "RetiredBuilder",
                displayName: "Former Builder",
                active: false,
              },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/gallery/hulettcraft/season-8");
    const figures = page.locator("figure[data-key]");
    const first = figures.nth(0),
      second = figures.nth(1);
    await first
      .locator(".edit-description")
      .fill("Keep this unsaved caption draft");
    await first.locator("[data-select-image]").check();
    await second.locator("[data-select-image]").check();
    const toolbar = page.locator(".bulk-author-controls");
    await toolbar.getByLabel("Choose member").selectOption("ImageBuilder");
    await expect(
      toolbar.getByLabel("Author for selected screenshots"),
    ).toHaveValue("ImageBuilder");
    let calls = 0;
    await page.route("**/api/admin/bulk-metadata", async (route) => {
      calls++;
      const body = route.request().postDataJSON();
      const response = await route.fetch({
        postData: { ...body, keys: [body.keys[0]] },
      });
      const data = await response.json();
      await route.fulfill({
        status: 207,
        json: {
          results: [
            ...data.results,
            {
              key: body.keys[1],
              ok: false,
              message: "Image changed. Refresh before editing again.",
            },
          ],
        },
      });
    });
    page.once("dialog", (dialog) => dialog.dismiss());
    await toolbar
      .getByRole("button", { name: "Apply author to selected" })
      .click();
    expect(calls).toBe(0);
    page.once("dialog", (dialog) => dialog.accept());
    await toolbar
      .getByRole("button", { name: "Apply author to selected" })
      .click();
    await expect(toolbar.locator("[data-bulk-result]")).toContainText(
      "1 author edits saved",
    );
    await expect(first.locator(".edit-author")).toHaveValue("ImageBuilder");
    await expect(first.locator(".edit-description")).toHaveValue(
      "Keep this unsaved caption draft",
    );
    await expect(first.locator("[data-select-image]")).not.toBeChecked();
    await expect(second.locator("[data-select-image]")).toBeChecked();
    await expect(second.locator(".save-result")).toContainText("Image changed");
    await page.unroute("**/api/admin/bulk-metadata");
    page.once("dialog", (dialog) => dialog.accept());
    await toolbar
      .getByRole("button", { name: "Apply author to selected" })
      .click();
    await expect(second.locator(".edit-author")).toHaveValue("ImageBuilder");
    const after = await (
      await page.request.get("/api/gallery/hulettcraft/season/8")
    ).json();
    for (const image of after)
      expect(image.metadata.description).toBe(
        original.find((old: { key: string }) => old.key === image.key).metadata
          .description,
      );
    await second.getByLabel("Choose member").selectOption("RetiredBuilder");
    await second.getByRole("button", { name: "Save", exact: true }).click();
    await expect(second.locator(".save-result")).toHaveText("Saved");
    await page.reload();
    await expect(second.locator(".edit-author")).toHaveValue("RetiredBuilder");
    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath("bulk-author-desktop.png"),
    });
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("bulk-author-mobile.png"),
    });
    const guest = await browser.newContext();
    try {
      const visitor = await guest.newPage();
      await visitor.goto("http://127.0.0.1:4321/gallery/hulettcraft/season-8");
      await expect(visitor.locator("[data-gallery-editor]")).toHaveCount(0);
      expect(await visitor.content()).not.toContain("Former Builder");
    } finally {
      await guest.close();
    }
    await page.goto("/admin/bulk-upload");
    await page
      .locator("#fileInput")
      .setInputFiles("public/images/home/HCS4.jpg");
    await page
      .getByLabel("Choose member for image 1")
      .selectOption("ImageBuilder");
    await page.locator("#bulkSeasonHeader").selectOption("7");
    await expect(
      page.getByLabel("author for image 1", { exact: true }),
    ).toHaveValue("ImageBuilder");
    await page.goto("/gallery/hytale");
    await expect(page.locator(".bulk-author-controls")).toBeVisible();
    await page.goto("/gallery/modded");
    await expect(page.locator(".bulk-author-controls")).toBeVisible();
  } finally {
    for (const image of original)
      await page.request.post("/api/admin/update-metadata", {
        headers: { Origin: "http://127.0.0.1:4321" },
        data: {
          key: image.key,
          updates: image.metadata.author
            ? { author: image.metadata.author }
            : { clearFields: ["author"] },
        },
      });
    const current = await (await page.request.get("/api/admin/roster")).json();
    await page.request.post("/api/admin/roster", {
      headers: { Origin: "http://127.0.0.1:4321" },
      data: { revision: current.revision, members: initial.members },
    });
  }
});
