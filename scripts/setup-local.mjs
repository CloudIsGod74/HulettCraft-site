import { copyFile } from "node:fs/promises";
import { constants } from "node:fs";
for (const [from, to] of [
  ["wrangler.local.example.jsonc", "wrangler.jsonc"],
  [".dev.vars.example", ".dev.vars"],
]) {
  try {
    await copyFile(from, to, constants.COPYFILE_EXCL);
    console.log("Created " + to + " for local emulation.");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log("Preserved existing " + to);
  }
}
