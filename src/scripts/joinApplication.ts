export {};
const form = document.querySelector<HTMLFormElement>("#join-form");
if (form) {
  const controls = form.querySelector<HTMLFieldSetElement>(".join-controls")!;
  const result = form.querySelector<HTMLElement>("#join-result")!;
  const receipt = document.querySelector<HTMLElement>("#join-success")!;
  let dirty = false,
    submitting = false;
  form.addEventListener("input", () => {
    dirty = true;
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    const data = new FormData(form);
    const file = data.get("screenshot");
    if (file instanceof File && file.size > 5 * 1024 * 1024) {
      result.textContent =
        "Please choose a screenshot no larger than 5 MiB, or submit without one.";
      result.focus();
      return;
    }
    submitting = true;
    controls.disabled = true;
    result.textContent = "Sending your application…";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(await response.text());
      const receiptData = await response.json();
      if (receiptData.received !== true)
        throw new Error(
          "We couldn’t confirm your submission. Please try again.",
        );
      dirty = false;
      form.reset();
      form.hidden = true;
      receipt.hidden = false;
      receipt.focus();
    } catch (error) {
      result.textContent = `${error instanceof Error ? error.message : "We couldn’t send your application."} Your answers are still here.`;
      controls.disabled = false;
      result.focus();
    } finally {
      submitting = false;
    }
  });
}
