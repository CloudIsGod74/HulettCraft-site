import { BANNER_INTERVAL_MS, type BannerImage } from "../config/banners";
const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
const pauseKey = "hulettcraft:banner-paused";
for (const hero of document.querySelectorAll<HTMLElement>(
  "[data-hero-slideshow]",
)) {
  const photos = hero.querySelector<HTMLElement>(".hero-photos");
  const control = hero.querySelector<HTMLButtonElement>("[data-hero-pause]");
  if (!photos || !control) continue;
  let images: BannerImage[];
  try {
    images = JSON.parse(hero.dataset.heroImages ?? "[]");
  } catch {
    continue;
  }
  if (images.length < 2) continue;
  let paused = preference.matches;
  try {
    paused ||= sessionStorage.getItem(pauseKey) === "true";
  } catch {
    /* Storage is optional. */
  }
  let index = 0;
  let candidateIndex = 0;
  let timer: number | undefined;
  let loading = false;
  hero.dataset.heroIndex = "0";
  control.hidden = false;
  function updateControl() {
    control!.textContent = paused ? "Play photos" : "Pause photos";
    control!.setAttribute(
      "aria-label",
      paused
        ? "Play banner screenshot slideshow"
        : "Pause banner screenshot slideshow",
    );
    hero.dataset.heroPaused = String(paused);
  }
  function stop() {
    window.clearTimeout(timer);
    timer = undefined;
  }
  function schedule() {
    stop();
    if (!paused && !document.hidden)
      timer = window.setTimeout(() => void advance(), BANNER_INTERVAL_MS);
  }
  async function advance() {
    if (paused || document.hidden || loading) return;
    loading = true;
    const nextIndex = (candidateIndex + 1) % images.length;
    candidateIndex = nextIndex;
    const next = new Image();
    next.className = "hero-photo hero-photo-enter";
    next.alt = "";
    next.decoding = "async";
    next.style.objectPosition = images[nextIndex].position;
    next.src = images[nextIndex].src;
    try {
      // Leave the current screenshot in place until its replacement has decoded.
      await next.decode();
      if (paused || document.hidden) return;
      photos!.append(next);
      index = nextIndex;
      hero.dataset.heroIndex = String(index);
      window.setTimeout(() => {
        for (const old of photos!.querySelectorAll("img"))
          if (old !== next) old.remove();
      }, 900);
    } catch {
      /* Keep the current screenshot when another image is unavailable. */
    } finally {
      loading = false;
      schedule();
    }
  }
  control.addEventListener("click", () => {
    paused = !paused;
    try {
      sessionStorage.setItem(pauseKey, String(paused));
    } catch {
      /* Optional. */
    }
    updateControl();
    schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  preference.addEventListener("change", () => {
    if (preference.matches) paused = true;
    updateControl();
    schedule();
  });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", schedule);
  updateControl();
  schedule();
}
