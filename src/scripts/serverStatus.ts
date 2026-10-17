export {};
type Status = {
  state: string;
  players?: { online: number; max: number };
  version?: string;
};
const elements = document.querySelectorAll<HTMLElement>("[data-status-server]");
function render(element: HTMLElement, data?: Status) {
  const text = element.querySelector(".server-state-text"),
    dot = element.querySelector(".status-dot");
  if (!text || !dot) return;
  const state =
    data?.state === "online" || data?.state === "offline"
      ? data.state
      : "unavailable";
  dot.className = "status-dot " + state;
  let message =
    state === "online"
      ? "Online"
      : state === "offline"
        ? "Offline"
        : "Status unavailable";
  if (
    state === "online" &&
    element.dataset.detailed === "true" &&
    data?.players
  ) {
    message +=
      " — " + data.players.online + "/" + data.players.max + " players";
    if (data.version) message += " · Version: " + data.version;
  }
  text.textContent = message;
}
async function refresh() {
  try {
    const response = await fetch("/api/server-status.json", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Status unavailable");
    const data: Record<string, Status> = await response.json();
    elements.forEach((el) => render(el, data[el.dataset.statusServer ?? ""]));
  } catch {
    elements.forEach((el) => render(el));
  }
}
void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, 60_000);
