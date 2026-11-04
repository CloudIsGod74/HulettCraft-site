import { isRecord } from "./http";

export const MODDED_GUIDE_KEY = "public:modded-guide:v1";
export const LOADERS = [
  "Forge",
  "NeoForge",
  "Fabric",
  "Quilt",
  "Other",
] as const;
export interface ModdedChange {
  date: string;
  title: string;
  notes: string;
  version?: string;
}
export interface ModdedGuide {
  published: boolean;
  mode: "pack" | "custom";
  packName: string;
  packVersion: string;
  minecraftVersion: string;
  loader: string;
  loaderVersion: string;
  packUrl: string;
  requiredMods: string;
  instructions: string;
  changelog?: ModdedChange[];
}
export interface ModdedGuideDocument {
  revision: string;
  updatedAt: string | null;
  guide: ModdedGuide;
}
export const EMPTY_MODDED_GUIDE: ModdedGuide = {
  published: false,
  mode: "pack",
  packName: "",
  packVersion: "",
  minecraftVersion: "",
  loader: "",
  loaderVersion: "",
  packUrl: "",
  requiredMods: "",
  instructions: "",
};
function invalid(message: string): never {
  throw new Response(message, { status: 400 });
}
function validateChanges(value: unknown): ModdedChange[] {
  if (!Array.isArray(value) || value.length > 20)
    return invalid("Keep at most 20 changelog entries.");
  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      Object.keys(entry).some(
        (key) => !["date", "title", "notes", "version"].includes(key),
      )
    )
      return invalid("Invalid changelog entry.");
    const text = (key: string, max: number, optional = false) => {
      const value = optional && entry[key] === undefined ? "" : entry[key];
      if (
        typeof value !== "string" ||
        value.length > max ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) ||
        (!optional && !value.trim())
      )
        return invalid(
          `Changelog ${key} must be text of at most ${max} characters.`,
        );
      return value.trim();
    };
    const date = text("date", 10),
      title = text("title", 120),
      notes = text("notes", 1000),
      version = text("version", 80, true);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
    )
      return invalid("Choose a valid calendar date for each changelog entry.");
    return { date, title, notes, ...(version ? { version } : {}) };
  });
}
export function validateModdedGuide(value: unknown): ModdedGuide {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => key !== "changelog" && !Object.hasOwn(EMPTY_MODDED_GUIDE, key),
    ) ||
    typeof value.published !== "boolean" ||
    typeof value.mode !== "string" ||
    !["pack", "custom"].includes(value.mode)
  )
    return invalid("Invalid client setup.");
  const field = (key: string, max: number) => {
    if (
      typeof value[key] !== "string" ||
      value[key].length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value[key])
    )
      return invalid(`${key} must be text of at most ${max} characters.`);
    return value[key].trim();
  };
  const guide: ModdedGuide = {
    published: value.published,
    mode: value.mode as ModdedGuide["mode"],
    packName: field("packName", 120),
    packVersion: field("packVersion", 80),
    minecraftVersion: field("minecraftVersion", 60),
    loader: field("loader", 20),
    loaderVersion: field("loaderVersion", 80),
    packUrl: field("packUrl", 2048),
    requiredMods: field("requiredMods", 12000),
    instructions: field("instructions", 6000),
    ...(value.changelog !== undefined
      ? { changelog: validateChanges(value.changelog) }
      : {}),
  };
  if (guide.loader && !(LOADERS as readonly string[]).includes(guide.loader))
    return invalid("Choose a supported loader.");
  if (guide.packUrl)
    try {
      const url = new URL(guide.packUrl);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
    } catch {
      return invalid(
        "The pack/download link must use HTTPS without embedded credentials.",
      );
    }
  if (guide.published) {
    if (!guide.minecraftVersion || !guide.loader || !guide.loaderVersion)
      return invalid(
        "Enter the Minecraft version, loader and loader version before publishing.",
      );
    if (
      guide.mode === "pack" &&
      (!guide.packName || !guide.packVersion || !guide.packUrl)
    )
      return invalid(
        "Enter the modpack name, exact pack version and download link before publishing.",
      );
    if (guide.mode === "custom" && !guide.requiredMods)
      return invalid(
        "List the required client mods and versions before publishing a custom setup.",
      );
  }
  return guide;
}
export function moddedGuideStorage(locals: App.Locals) {
  const kv = locals.runtime?.env?.SESSION;
  if (!kv)
    throw new Response(
      "Client setup storage is unavailable. Please try again later.",
      { status: 503 },
    );
  return kv;
}
export async function readModdedGuide(
  locals: App.Locals,
): Promise<ModdedGuideDocument> {
  const raw = await moddedGuideStorage(locals).get(MODDED_GUIDE_KEY);
  if (raw === null)
    return {
      revision: "unpublished",
      updatedAt: null,
      guide: { ...EMPTY_MODDED_GUIDE },
    };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      typeof value.revision !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.revision) ||
      typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt))
    )
      throw new Error();
    return {
      revision: value.revision,
      updatedAt: value.updatedAt,
      guide: validateModdedGuide(value.guide),
    };
  } catch {
    throw new Response(
      "The saved client setup could not be loaded. No changes have been saved.",
      { status: 503 },
    );
  }
}
