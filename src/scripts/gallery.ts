export {};
const dialog = document.querySelector<HTMLDialogElement>(".gallery-dialog");
const buttons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-gallery-open]"),
);
let index = 0;
function showImage(next: number) {
  if (!dialog || !buttons.length) return;
  index = (next + buttons.length) % buttons.length;
  const source = buttons[index].querySelector("img"),
    target = dialog.querySelector("img");
  if (source && target) {
    target.src = source.src;
    target.alt = source.alt;
  }
  const caption = dialog.querySelector(".gallery-caption");
  if (caption)
    caption.textContent =
      (source?.alt ?? "Screenshot") +
      " (" +
      (index + 1) +
      "/" +
      buttons.length +
      ")";
}
buttons.forEach((button, i) =>
  button.addEventListener("click", () => {
    showImage(i);
    dialog?.showModal();
  }),
);
dialog
  ?.querySelector(".gallery-close")
  ?.addEventListener("click", () => dialog.close());
dialog
  ?.querySelector(".gallery-prev")
  ?.addEventListener("click", () => showImage(index - 1));
dialog
  ?.querySelector(".gallery-next")
  ?.addEventListener("click", () => showImage(index + 1));
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    event.preventDefault();
    showImage(index + 1);
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showImage(index - 1);
  }
});
document.querySelectorAll<HTMLButtonElement>(".save-meta").forEach((button) =>
  button.addEventListener("click", async () => {
    const figure = button.closest<HTMLElement>("figure[data-key]");
    const description =
      figure?.querySelector<HTMLTextAreaElement>(".edit-description");
    const author = figure?.querySelector<HTMLInputElement>(".edit-author");
    const status = figure?.querySelector<HTMLElement>(".save-result");
    if (!figure || !description || !author || !status) return;
    const updates: Record<string, unknown> = {},
      clearFields: string[] = [];
    for (const [field, input] of [
      ["description", description],
      ["author", author],
    ] as const) {
      if (input.value === input.defaultValue) continue;
      if (!input.value.trim() && input.defaultValue.trim()) {
        if (!confirm("Clear the existing " + field + "?")) return;
        clearFields.push(field);
      } else updates[field] = input.value;
    }
    if (clearFields.length) updates.clearFields = clearFields;
    if (!Object.keys(updates).length) {
      status.textContent = "No changes";
      return;
    }
    button.disabled = true;
    status.textContent = "Saving…";
    try {
      const response = await fetch("/api/admin/update-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: figure.dataset.key, updates }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      description.value = description.defaultValue =
        data.metadata.description ?? "";
      author.value = author.defaultValue = data.metadata.author ?? "";
      status.textContent = "Saved";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Save failed. Try again.";
    } finally {
      button.disabled = false;
    }
  }),
);
