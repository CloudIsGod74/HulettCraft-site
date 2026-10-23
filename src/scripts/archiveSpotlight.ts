import {
  LOCAL_ARCHIVE,
  SPOTLIGHT_INTERVAL_MS,
  type SpotlightPhoto,
} from "../config/spotlight";
import { isPublishedKey } from "../lib/galleryKeys";

const root = document.querySelector<HTMLElement>("[data-archive-spotlight]");
if (root) {
  const cards = Array.from(
    root.querySelectorAll<HTMLElement>(".spotlight-card"),
  );
  const controls = root.querySelector<HTMLElement>(".spotlight-controls")!;
  const pause = root.querySelector<HTMLButtonElement>(
    "[data-spotlight-pause]",
  )!;
  const shuffle = root.querySelector<HTMLButtonElement>(
    "[data-spotlight-shuffle]",
  )!;
  const message = root.querySelector<HTMLElement>("[data-spotlight-message]")!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const pauseKey = "hulettcraft:archive-paused";
  let paused = motion.matches,
    visible = false,
    pageActive = true;
  let loading = false,
    initialized = false,
    timer: number | undefined;
  let current = cards.map(
    (card) => card.querySelector("img")!.getAttribute("src")!,
  );
  try {
    paused ||= sessionStorage.getItem(pauseKey) === "true";
  } catch {
    /* Optional preference. */
  }

  function validPhoto(value: unknown): value is SpotlightPhoto {
    if (!value || typeof value !== "object") return false;
    const photo = value as SpotlightPhoto;
    if (
      typeof photo.src !== "string" ||
      !photo.src.startsWith("/") ||
      photo.src.startsWith("//")
    )
      return false;
    const url = new URL(photo.src, location.origin);
    const allowed =
      LOCAL_ARCHIVE.some((local) => local.src === photo.src) ||
      (url.origin === location.origin &&
        url.pathname === "/api/gallery/image" &&
        url.searchParams.size === 1 &&
        isPublishedKey(url.searchParams.get("key")));
    return (
      allowed &&
      ["/gallery/hulettcraft", "/gallery/hytale", "/gallery/modded"].includes(
        photo.href,
      ) &&
      typeof photo.caption === "string" &&
      photo.caption.length <= 2000 &&
      typeof photo.credit === "string" &&
      photo.credit.length <= 100 &&
      typeof photo.collection === "string" &&
      photo.collection.length <= 80
    );
  }
  function updateControl() {
    pause.textContent = paused ? "Play slideshow" : "Pause slideshow";
    root!.dataset.spotlightPaused = String(paused);
  }
  function stop() {
    clearTimeout(timer);
    timer = undefined;
  }
  function schedule() {
    stop();
    if (!paused && visible && pageActive && !document.hidden && !loading)
      timer = window.setTimeout(
        () => void advance(false),
        SPOTLIGHT_INTERVAL_MS,
      );
  }
  async function decode(photo: SpotlightPhoto) {
    const img = new Image(640, 360);
    img.alt = photo.caption;
    img.decoding = "async";
    img.src = photo.src;
    let timeout: number | undefined;
    try {
      await Promise.race([
        img.decode(),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(
            () => reject(new Error("Image timed out")),
            8000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    return img;
  }
  async function advance(manual: boolean, initial = false) {
    if (
      loading ||
      !pageActive ||
      document.hidden ||
      (!manual && !initial && (paused || !visible))
    )
      return;
    // Keep a focused gallery link pointing at the screenshot the visitor selected.
    if (!manual && root!.querySelector(".spotlight-frame:focus")) {
      schedule();
      return;
    }
    loading = true;
    stop();
    shuffle.disabled = true;
    if (manual) message.textContent = "Finding more moments from the archive…";
    try {
      const url = new URL("/api/gallery/spotlight.json", location.origin);
      for (const src of current) url.searchParams.append("exclude", src);
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || response.redirected)
        throw new Error("Archive unavailable");
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("photos" in data) ||
        !Array.isArray(data.photos) ||
        data.photos.length < 1 ||
        data.photos.length > 2 ||
        !data.photos.every(validPhoto)
      )
        throw new Error("Invalid photos");
      const photos: SpotlightPhoto[] = data.photos;
      if (new Set(photos.map((photo) => photo.src)).size !== photos.length)
        throw new Error("Repeated photos");
      // Decode the full pair before swapping either card; errors preserve both.
      const images = await Promise.all(photos.map(decode));
      if (
        !pageActive ||
        document.hidden ||
        (!manual && !initial && (paused || !visible))
      )
        return;
      cards.forEach((card, index) => {
        const photo = photos[index];
        card.hidden = !photo;
        if (!photo) return;
        card.querySelector("img")!.replaceWith(images[index]);
        card.querySelector<HTMLAnchorElement>("a")!.href = photo.href;
        card.querySelector("[data-photo-caption]")!.textContent = photo.caption;
        card.querySelector("[data-photo-collection]")!.textContent =
          photo.collection;
        const credit = card.querySelector<HTMLElement>("[data-photo-credit]")!;
        credit.textContent = photo.credit
          ? "Screenshot by " + photo.credit
          : "";
        credit.hidden = !photo.credit;
      });
      current = photos.map((photo) => photo.src);
      root!.dataset.spotlightLoaded = "true";
      if (manual) message.textContent = "New screenshots from the archive.";
    } catch {
      if (manual)
        message.textContent =
          "New screenshots couldn’t be loaded. Keeping the current photos; try shuffling again.";
    } finally {
      loading = false;
      shuffle.disabled = false;
      schedule();
    }
  }
  function activate() {
    if (visible && pageActive && !document.hidden && !initialized) {
      initialized = true;
      void advance(false, true);
    } else schedule();
  }
  pause.addEventListener("click", () => {
    paused = !paused;
    try {
      sessionStorage.setItem(pauseKey, String(paused));
    } catch {
      /* Optional. */
    }
    updateControl();
    schedule();
  });
  shuffle.addEventListener("click", () => void advance(true));
  motion.addEventListener("change", () => {
    if (motion.matches) paused = true;
    updateControl();
    schedule();
  });
  document.addEventListener("visibilitychange", activate);
  window.addEventListener("pagehide", () => {
    pageActive = false;
    stop();
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
    activate();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        activate();
      },
      { threshold: 0.1 },
    ).observe(root);
  } else {
    visible = true;
    activate();
  }
  controls.hidden = false;
  updateControl();
}
