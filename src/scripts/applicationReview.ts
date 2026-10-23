export {};
const form = document.querySelector<HTMLFormElement>("#application-review");
if (form) {
  const result = form.querySelector<HTMLElement>("#review-result")!;
  const status = form.querySelector<HTMLSelectElement>('[name="status"]')!;
  const note = form.querySelector<HTMLTextAreaElement>('[name="note"]')!;
  const buttons = Array.from(form.querySelectorAll("button"));
  let dirty = false,
    saving = false;
  form.addEventListener("input", () => {
    dirty = true;
  });
  form.addEventListener("change", () => {
    dirty = true;
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) event.preventDefault();
  });
  async function send(remove: boolean) {
    if (saving) return;
    if (
      remove &&
      !confirm(
        "Permanently delete this application, its notes and its screenshot? This cannot be undone.",
      )
    )
      return;
    saving = true;
    for (const button of buttons) button.disabled = true;
    // Disable fields after collecting their values so edits cannot race the response.
    const body = {
      revision: form!.dataset.revision,
      ...(remove ? {} : { status: status.value, note: note.value }),
    };
    status.disabled = true;
    note.disabled = true;
    result.textContent = remove ? "Deleting…" : "Saving review…";
    try {
      const response = await fetch(
        "/api/admin/applications/" + form!.dataset.id,
        {
          method: remove ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const saved = await response.json();
      dirty = false;
      if (remove) {
        location.assign("/admin/applications");
        return;
      }
      form!.dataset.revision = saved.revision;
      result.textContent =
        "Review saved. No Discord message or server access change was made.";
    } catch (error) {
      result.textContent = `${error instanceof Error ? error.message : "The change could not be saved."} Your review edits are still here.`;
    } finally {
      saving = false;
      for (const button of buttons) button.disabled = false;
      status.disabled = false;
      note.disabled = false;
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (form.reportValidity()) void send(false);
  });
  form
    .querySelector("#delete-application")!
    .addEventListener("click", () => void send(true));
}
