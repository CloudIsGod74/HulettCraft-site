export {};
const header = document.querySelector<HTMLElement>(".site-header"),
  toggle = document.querySelector<HTMLButtonElement>(".nav-toggle"),
  nav = document.getElementById("site-navigation");
if (header && toggle && nav) {
  header.classList.add("nav-ready");
  function setOpen(open: boolean) {
    toggle!.setAttribute("aria-expanded", String(open));
    toggle!.classList.toggle("open", open);
    nav!.classList.toggle("open", open);
  }
  toggle.addEventListener("click", () =>
    setOpen(toggle.getAttribute("aria-expanded") !== "true"),
  );
  nav
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      setOpen(false);
      toggle.focus();
    }
  });
  window
    .matchMedia("(min-width: 641px)")
    .addEventListener("change", () => setOpen(false));
}
document.querySelectorAll<HTMLButtonElement>(".copyable").forEach((button) =>
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied!";
      setTimeout(() => (button.textContent = value), 1200);
    } catch {
      button.textContent = "Copy unavailable: " + value;
    }
  }),
);
