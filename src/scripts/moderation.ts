export {};
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".pending-card"));
const status = document.getElementById("moderation-result");
const selectAll = document.querySelector<HTMLInputElement>("#select-all");
selectAll?.addEventListener("change", () =>
  cards().forEach((card) => {
    const box = card.querySelector<HTMLInputElement>(".bulk-checkbox");
    if (box) box.checked = selectAll.checked;
  }),
);
let busy = false;
async function run(selected: HTMLElement[], approve: boolean) {
  if (busy || !selected.length) return;
  if (selected.length > 100) {
    if (status)
      status.textContent = "Select no more than 100 screenshots at a time.";
    return;
  }
  busy = true;
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    ".bulk-actions button,.pending-card button",
  );
  buttons.forEach((b) => (b.disabled = true));
  const keys = selected.map((card) => card.dataset.key!),
    updates: Record<string, Record<string, string>> = {};
  selected.forEach((card) => {
    const fields: Record<string, string> = {};
    for (const [name, selector] of [
      ["description", ".edit-description"],
      ["author", ".edit-author"],
    ]) {
      const input = card.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        selector,
      );
      if (input && input.value !== input.defaultValue)
        fields[name] = input.value;
    }
    updates[card.dataset.key!] = fields;
  });
  if (status) status.textContent = approve ? "Approving…" : "Rejecting…";
  try {
    const response = await fetch(
      "/api/admin/" + (approve ? "approve" : "reject"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, ...(approve ? { updates } : {}) }),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    if (approve) {
      const data: {
        results: { key: string; ok: boolean; message?: string }[];
      } = await response.json();
      const failures: string[] = [];
      for (const result of data.results) {
        const card = selected.find((c) => c.dataset.key === result.key);
        if (result.ok) card?.remove();
        else failures.push(result.message ?? "Approval failed");
      }
      if (status)
        status.textContent = failures.length
          ? "Some images remain pending: " + failures.join("; ")
          : "Selected screenshots approved.";
    } else {
      selected.forEach((card) => card.remove());
      if (status) status.textContent = "Selected screenshots rejected.";
    }
  } catch (error) {
    if (status)
      status.textContent =
        error instanceof Error
          ? error.message
          : "Action failed. Refresh before retrying.";
  } finally {
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
    if (selectAll) selectAll.checked = false;
  }
}
cards().forEach((card) => {
  card
    .querySelector(".approve")
    ?.addEventListener("click", () => void run([card], true));
  card
    .querySelector(".reject")
    ?.addEventListener("click", () => void run([card], false));
});
function selected() {
  return cards().filter(
    (c) => c.querySelector<HTMLInputElement>(".bulk-checkbox")?.checked,
  );
}
document
  .getElementById("bulk-approve")
  ?.addEventListener("click", () => void run(selected(), true));
document
  .getElementById("bulk-reject")
  ?.addEventListener("click", () => void run(selected(), false));
