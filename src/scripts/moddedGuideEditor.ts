import type { ModdedGuide, ModdedGuideDocument } from "../lib/moddedGuide";
const form = document.querySelector<HTMLFormElement>("#modded-setup-form");
if (form) {
  const fields = form.querySelector<HTMLFieldSetElement>("fieldset")!;
  const result = document.querySelector<HTMLElement>("#modded-setup-result")!;
  const save = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const input = (name: keyof ModdedGuide) =>
    form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
  const published = input("published") as HTMLInputElement;
  let revision = "",
    dirty = false;
  function refresh() {
    const isPack = input("mode").value === "pack";
    form!.querySelector<HTMLElement>("[data-pack-fields]")!.hidden = !isPack;
    for (const name of [
      "minecraftVersion",
      "loader",
      "loaderVersion",
      "packName",
      "packVersion",
      "packUrl",
      "requiredMods",
    ] as const)
      input(name).required =
        published.checked &&
        (name === "requiredMods"
          ? !isPack
          : ["packName", "packVersion", "packUrl"].includes(name)
            ? isPack
            : true);
    document.querySelector("#modded-setup-dirty")!.textContent = dirty
      ? "Unsaved changes."
      : "No unsaved changes.";
    save.disabled = !dirty;
  }
  form.addEventListener("input", () => {
    dirty = true;
    refresh();
  });
  form.addEventListener("change", () => {
    dirty = true;
    refresh();
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dirty || !form!.reportValidity()) return;
    fields.disabled = true;
    result.textContent = "Saving client setup…";
    try {
      const guide: Record<string, string | boolean> = {
        published: published.checked,
      };
      for (const name of [
        "mode",
        "packName",
        "packVersion",
        "minecraftVersion",
        "loader",
        "loaderVersion",
        "packUrl",
        "requiredMods",
        "instructions",
      ] as const)
        guide[name] = input(name).value;
      const response = await fetch("/api/admin/modded-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, guide }),
      });
      if (!response.ok) throw new Error(await response.text());
      const saved: ModdedGuideDocument = await response.json();
      revision = saved.revision;
      dirty = false;
      result.textContent = saved.guide.published
        ? "Client setup published. Updates may take about a minute to appear."
        : "Draft saved. Client requirements are not published.";
    } catch (error) {
      result.textContent = `${error instanceof Error ? error.message : "Could not save client setup."} Your edits are still here.`;
    } finally {
      fields.disabled = false;
      refresh();
    }
  });
  void (async () => {
    try {
      const response = await fetch("/api/admin/modded-guide", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await response.text());
      const saved: ModdedGuideDocument = await response.json();
      revision = saved.revision;
      for (const [name, value] of Object.entries(saved.guide)) {
        if (name === "published") published.checked = value as boolean;
        else input(name as keyof ModdedGuide).value = String(value);
      }
      form!.hidden = false;
      result.textContent = saved.guide.published
        ? "Published client setup loaded."
        : "Draft loaded. Confirm the current server requirements before publishing.";
      refresh();
    } catch (error) {
      result.textContent = `${error instanceof Error ? error.message : "Could not load client setup."} Editing is disabled until saved data can be loaded.`;
    }
  })();
}
