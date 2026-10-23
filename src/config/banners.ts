export const BANNER_INTERVAL_MS = 8_000;
export interface BannerImage {
  src: string;
  position: string;
}
const minecraft: BannerImage[] = [
  { src: "/images/home/HCS4.jpg", position: "center 60%" },
  { src: "/images/home/S6 Shops.jpg", position: "center 55%" },
  { src: "/images/home/HulettcraftS7.jpg", position: "center 65%" },
];
const hytale: BannerImage[] = [
  { src: "/images/gallery/hytale/hytaleserver.jpg", position: "center" },
  { src: "/images/gallery/hytale/cloudnhwoarong.jpg", position: "center" },
];
export function bannerImages(path: string): BannerImage[] {
  const images = /^\/(?:gallery\/)?hytale(?:\/|$)/.test(path)
    ? hytale
    : minecraft;
  // Render a different initial photo by route, including without JavaScript.
  const offset =
    Array.from(path).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    images.length;
  return [...images.slice(offset), ...images.slice(0, offset)];
}
