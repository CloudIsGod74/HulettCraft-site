import { BANNER_INTERVAL_MS, type BannerImage } from "../config/banners";
const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
const pauseKey = "hulettcraft:banner-paused";
for (const hero of document.querySelectorAll<HTMLElement>(
  "[data-hero-slideshow]",
)) {
  const photos = hero.querySelector<HTMLElement>(".hero-photos");
  const controls = hero.querySelector<HTMLElement>("[data-hero-controls]");
  const control = hero.querySelector<HTMLButtonElement>("[data-hero-pause]");
  const previous = hero.querySelector<HTMLButtonElement>(
    "[data-hero-previous]",
  );
  const next = hero.querySelector<HTMLButtonElement>("[data-hero-next]");
  const message = hero.querySelector<HTMLElement>("[data-hero-message]");
  if (!photos || !controls || !control || !previous || !next || !message)
    continue;
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
  let cleanupTimer: number | undefined;
  let loading = false;
  let pageActive = true;
  let currentPhoto = photos.querySelector("img");
  hero.dataset.heroIndex = "0";
  controls.hidden = false;
  hero.classList.add("hero-swipe-ready");
  function updateControl() {
    control!
      .querySelector("[data-hero-symbol]")
      ?.setAttribute(
        "d",
        paused ? "M8 5v14l11-7z" : "M6 5h4v14H6zM14 5h4v14h-4z",
      );
    control!.title = paused ? "Play photos" : "Pause photos";
    control!.setAttribute(
      "aria-label",
      paused
        ? "Play photos in banner slideshow"
        : "Pause photos in banner slideshow",
    );
    previous!.disabled = loading;
    next!.disabled = loading;
    hero.dataset.heroPaused = String(paused);
  }
  function setPaused(value: boolean) {
    paused = value;
    try {
      sessionStorage.setItem(pauseKey, String(paused));
    } catch {
      /* Optional. */
    }
    updateControl();
    schedule();
  }
  function stop() {
    window.clearTimeout(timer);
    timer = undefined;
  }
  function schedule() {
    stop();
    if (!paused && !document.hidden && pageActive && !loading)
      timer = window.setTimeout(() => void advance(), BANNER_INTERVAL_MS);
  }
  async function decode(image: HTMLImageElement) {
    let timeout: number | undefined;
    try {
      await Promise.race([
        image.decode(),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(
            () => reject(new Error("Image timed out")),
            8000,
          );
        }),
      ]);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  async function advance(direction = 1, manual = false) {
    if (document.hidden || !pageActive || loading || (!manual && paused))
      return;
    // A visitor's selection stays put until they explicitly choose Play.
    if (manual) {
      setPaused(true);
      candidateIndex = index;
    }
    loading = true;
    stop();
    updateControl();
    try {
      // Manual navigation skips broken pictures; automatic rotation tries one per tick.
      const attempts = manual ? images.length - 1 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (document.hidden || !pageActive || (!manual && paused)) return;
        const nextIndex =
          (candidateIndex + direction + images.length) % images.length;
        candidateIndex = nextIndex;
        const image = new Image();
        image.className = "hero-photo hero-photo-enter";
        image.alt = "";
        image.decoding = "async";
        image.style.objectPosition = images[nextIndex].position;
        image.src = images[nextIndex].src;
        try {
          // Leave the current screenshot in place until its replacement has decoded.
          await decode(image);
        } catch {
          continue;
        }
        if (document.hidden || !pageActive || (!manual && paused)) return;
        // Fast repeated taps must not let an old fade's cleanup remove a newer photo.
        window.clearTimeout(cleanupTimer);
        for (const old of photos!.querySelectorAll("img"))
          if (old !== currentPhoto) old.remove();
        photos!.append(image);
        currentPhoto = image;
        index = nextIndex;
        hero.dataset.heroIndex = String(index);
        cleanupTimer = window.setTimeout(() => {
          for (const old of photos!.querySelectorAll("img"))
            if (old !== image) old.remove();
        }, 900);
        if (manual)
          message!.textContent = `Banner photo ${index + 1} of ${images.length}.${paused ? " Automatic rotation paused." : ""}`;
        return;
      }
      if (manual)
        message!.textContent =
          "Another banner photo could not be loaded. Keeping the current photo.";
    } finally {
      if (manual) candidateIndex = index;
      loading = false;
      updateControl();
      schedule();
    }
  }
  control.addEventListener("click", () => setPaused(!paused));
  previous.addEventListener("click", () => void advance(-1, true));
  next.addEventListener("click", () => void advance(1, true));
  let swipe: { id: number; x: number; y: number } | undefined;
  hero.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    if (!event.isPrimary) {
      swipe = undefined; // A second finger belongs to a native pinch gesture.
      return;
    }
    if (
      loading ||
      (window.visualViewport?.scale ?? 1) > 1 ||
      (event.target instanceof Element &&
        event.target.closest(
          "a, button, input, textarea, select, [contenteditable], [role='button']",
        ))
    )
      return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    // Touch pointers already capture their initial target; events bubble here.
    // Leave capture to the browser so subsequent taps retain their native target.
  });
  hero.addEventListener("pointercancel", () => {
    swipe = undefined;
  });
  hero.addEventListener("pointerup", (event) => {
    const start = swipe;
    if (!start || event.pointerId !== start.id) return;
    swipe = undefined;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Native vertical scrolling and pinch zoom remain available. Ignore taps and jitter.
    if (
      (window.visualViewport?.scale ?? 1) <= 1 &&
      Math.abs(dx) >= 48 &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    )
      void advance(dx < 0 ? 1 : -1, true);
  });
  document.addEventListener("visibilitychange", schedule);
  preference.addEventListener("change", () => {
    if (preference.matches) paused = true;
    updateControl();
    schedule();
  });
  window.addEventListener("pagehide", () => {
    swipe = undefined;
    pageActive = false;
    stop();
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
    schedule();
  });
  updateControl();
  schedule();
}
