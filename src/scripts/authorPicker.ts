export function bindAuthorPicker(root: Element) {
  const picker = root.querySelector<HTMLSelectElement>("[data-author-picker]");
  const input = root.querySelector<HTMLInputElement>(".edit-author");
  if (!picker || !input) return;
  picker.addEventListener("change", () => {
    if (!picker.value) return; // Selecting custom must not erase a historical author.
    input.value = picker.value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.addEventListener("input", () => {
    picker.value = Array.from(picker.options).some(
      (option) => option.value === input.value,
    )
      ? input.value
      : "";
  });
}
document.querySelectorAll("[data-author-field]").forEach(bindAuthorPicker);
