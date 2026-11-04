import type {
  ModdedChange,
  ModdedGuide,
  ModdedGuideDocument,
} from "../lib/moddedGuide";
const form = document.querySelector<HTMLFormElement>("#modded-setup-form");
if (form) {
  const fields = form.querySelector<HTMLFieldSetElement>("fieldset")!;
  const result = document.querySelector<HTMLElement>("#modded-setup-result")!;
  const save = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const input = (name: Exclude<keyof ModdedGuide, "changelog">) =>
    form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
  const published = input("published") as HTMLInputElement;
  const changes = document.querySelector<HTMLElement>(
    "#modded-changelog-entries",
  )!;
  const addChange =
    document.querySelector<HTMLButtonElement>("#add-modded-change")!;
  const changeTemplate = document.querySelector<HTMLTemplateElement>(
    "#modded-change-template",
  )!;
  let revision = "",
    dirty = false;
  function changeField(row: Element, name: keyof ModdedChange) {
    return row.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-change-field="${name}"]`,
    )!;
  }
  function appendChange(entry?: ModdedChange) {
    const row = changeTemplate.content.firstElementChild!.cloneNode(
      true,
    ) as HTMLElement;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (name: string) =>
      parts.find((part) => part.type === name)!.value;
    changeField(row, "date").value =
      entry?.date ?? `${part("year")}-${part("month")}-${part("day")}`;
    for (const name of ["title", "notes", "version"] as const)
      changeField(row, name).value = entry?.[name] ?? "";
    row.querySelector("[data-remove-change]")!.addEventListener("click", () => {
      row.remove();
      dirty = true;
      refresh();
      addChange.focus();
    });
    changes.prepend(row);
    return row;
  }
  function changelog(): ModdedChange[] {
    return Array.from(changes.children).map((row) => ({
      date: changeField(row, "date").value,
      title: changeField(row, "title").value,
      notes: changeField(row, "notes").value,
      version: changeField(row, "version").value,
    }));
  }
  addChange.addEventListener("click", () => {
    if (changes.children.length >= 20) return;
    const row = appendChange();
    dirty = true;
    refresh();
    changeField(row, "title").focus();
  });
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
    addChange.disabled = changes.children.length >= 20;
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
      const guide: Record<string, unknown> = {
        published: published.checked,
        changelog: changelog(),
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
        if (name === "changelog") continue;
        if (name === "published") published.checked = value as boolean;
        else
          input(name as Exclude<keyof ModdedGuide, "changelog">).value =
            String(value);
      }
      for (const entry of [...(saved.guide.changelog ?? [])].reverse())
        appendChange(entry);
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
