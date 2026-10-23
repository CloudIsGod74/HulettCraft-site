export interface SpotlightPhoto {
  src: string;
  caption: string;
  credit: string;
  collection: string;
  href: string;
}
export const SPOTLIGHT_INTERVAL_MS = 12_000;
// Existing public archive images, including early screenshots kept outside R2.
export const LOCAL_ARCHIVE: SpotlightPhoto[] = [
  "/images/gallery/HulettCraft/season-4/HCS4.jpg",
  "/images/gallery/HulettCraft/season-6/HulettcraftS7.jpg",
  "/images/gallery/HulettCraft/season-6/S6 Shops.jpg",
  "/images/gallery/HulettCraft/season-6/tunnelbore.jpg",
  "/images/gallery/HulettCraft/season-2/slots.png",
  "/images/gallery/hytale/cloudnhwoarong.jpg",
  "/images/gallery/hytale/hytaleserver.jpg",
].map((src) => ({
  src,
  caption: src.includes("/hytale/")
    ? "A glimpse of our Hytale worlds."
    : "A moment from the HulettCraft archive.",
  credit: "",
  collection: src.includes("/hytale/")
    ? "Hytale archive"
    : "HulettCraft archive",
  href: src.includes("/hytale/") ? "/gallery/hytale" : "/gallery/hulettcraft",
}));
