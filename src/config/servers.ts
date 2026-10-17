export const SERVERS = [
  {
    id: "hulettcraft",
    title: "HulettCraft SMP",
    address: "play.hulettcraft.com",
    host: "108.214.93.42",
    port: 25565,
    node: "HulettCraft",
    gallery: "/gallery/hulettcraft",
    description:
      "Our primary world. Long-running, lightly governed, and built around trust, cooperation, and player-driven projects.",
  },
  {
    id: "creative",
    title: "Creative Server",
    address: "creative.hulettcraft.com",
    host: "107.221.146.250",
    port: 25566,
    node: "CloudCraft",
    gallery: "/gallery",
    description:
      "A shared creative environment for large-scale builds, testing ideas, and collaborative construction.",
  },
  {
    id: "modded",
    title: "Seasonal / Modded",
    address: "modded.hulettcraft.com",
    host: "107.221.146.250",
    port: 25555,
    node: "CloudCraft",
    gallery: "/gallery/modded",
    description:
      "Rotating worlds with custom rules, mods, or limited-time themes. These worlds change as new ideas are explored.",
  },
  {
    id: "hytale",
    title: "Hytale (Beta)",
    address: "hytale.hulettcraft.com",
    node: "CloudCraft",
    gallery: "/gallery/hytale",
    description:
      "Our next-generation sandbox world, currently in active beta. Experimental features, evolving content, and early exploration.",
  },
] as const;
export type ServerId = (typeof SERVERS)[number]["id"];
