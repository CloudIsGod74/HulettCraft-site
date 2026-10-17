export interface Season {
  title: string;
  tagline: string;
  description: string;
}
export const HULETTCRAFT: {
  currentSeason: number;
  seasons: Record<number, Season>;
} = {
  currentSeason: 8,
  seasons: {
    "1": {
      title: "Season 1",
      tagline:
        "The beginning — early survival, first community builds, and the foundations of HulettCraft.",
      description:
        "The earliest days of HulettCraft — learning, surviving, and building the foundation.",
    },
    "2": {
      title: "Season 2",
      tagline: "Expansion and exploration, as the community found its footing.",
      description: "A completed season in the ongoing history of HulettCraft.",
    },
    "3": {
      title: "Season 3",
      tagline:
        "Growing ambitions, experimental mods with Create and Biomes O' Plenty.",
      description: "A completed season in the ongoing history of HulettCraft.",
    },
    "4": {
      title: "Season 4",
      tagline:
        "A mature survival era defined by megabases and long-term projects.",
      description: "A completed season in the ongoing history of HulettCraft.",
    },
    "5": {
      title: "Season 5",
      tagline:
        "Experimentation and refinement, shaping how HulettCraft would play going forward.",
      description: "A completed season in the ongoing history of HulettCraft.",
    },
    "6": {
      title: "Season 6",
      tagline: "Late-era survival with established networks and shared spaces.",
      description: "A completed season in the ongoing history of HulettCraft.",
    },
    "7": {
      title: "Season 7",
      tagline: "A transition season bridging old ideas and new directions.",
      description: "A completed season in the ongoing history of HulettCraft.",
    },
    "8": {
      title: "Season 8",
      tagline:
        "The current era — active survival, ongoing builds, and a living world.",
      description:
        "The active season of HulettCraft, featuring ongoing survival and community builds.",
    },
  },
};
