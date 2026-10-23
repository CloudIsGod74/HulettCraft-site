export const APPLICATION_QUESTIONS = [
  {
    id: "proud",
    label: "What are you most proud of in Minecraft?",
    help: "A build, a clever solution, a shared adventure—tell us about something that matters to you.",
    max: 2000,
    required: true,
  },
  {
    id: "building",
    label: "What do you enjoy building or doing?",
    help: "Building styles, redstone, farms, exploring, community projects—what keeps you coming back?",
    max: 1500,
    required: true,
  },
  {
    id: "hopes",
    label:
      "What are you looking for in a server, and what would you like from HulettCraft?",
    help: "Tell us what would make a server feel like a good home for you.",
    max: 2000,
    required: true,
  },
  {
    id: "interactions",
    label: "What kinds of interactions would you enjoy with other players?",
    help: "For example: trading, chatting, group builds, events, or quietly sharing a world.",
    max: 1500,
    required: true,
  },
  {
    id: "creators",
    label: "Which Minecraft creators, streamers, or communities do you enjoy?",
    help: "Share a few favorites if you have them. It’s completely fine to leave this blank.",
    max: 1000,
    required: false,
  },
  {
    id: "griefing",
    label: "Have you ever had a server or world griefed?",
    help: "If you’d like, share your experience and how you think a community should handle it. You can skip this question.",
    max: 1500,
    required: false,
  },
] as const;
export type QuestionId = (typeof APPLICATION_QUESTIONS)[number]["id"];
export const ENGAGEMENT_OPTIONS = [
  {
    value: "independent",
    label: "Mostly independent, with occasional interaction",
  },
  { value: "balanced", label: "A mix of solo play and playing with others" },
  {
    value: "collaborative",
    label: "Regular collaboration and community activities",
  },
  {
    value: "finding-out",
    label: "I’m still figuring out my preferred balance",
  },
] as const;
export const APPLICATION_STATUSES = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "In review" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]["value"];

export function applicationScopeForHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return [
    "hulettcraft.com",
    "www.hulettcraft.com",
    "hulettcraft-site.pages.dev",
  ].includes(host)
    ? "production"
    : "preview:" + host;
}
