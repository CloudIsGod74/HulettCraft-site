import { HULETTCRAFT } from "../config/hulettcraft";
import { WORLDS } from "../lib/galleryKeys";
import { bindAuthorPicker } from "./authorPicker";
type Row = {
  file: File;
  world: string;
  season: string;
  description: string;
  author: string;
  preview: string;
};
const dropzone = document.getElementById("dropzone"),
  fileInput = document.querySelector<HTMLInputElement>("#fileInput"),
  tableBody =
    document.querySelector<HTMLTableSectionElement>("#uploadTable tbody"),
  form = document.querySelector<HTMLFormElement>("#uploadForm"),
  bulkSeason = document.querySelector<HTMLSelectElement>("#bulkSeasonHeader"),
  status = document.getElementById("upload-result");
let rows: Row[] = [],
  busy = false;
if (dropzone && fileInput && tableBody && form && bulkSeason) {
  for (const season of Object.keys(HULETTCRAFT.seasons)) {
    const option = new Option(season, season);
    bulkSeason.add(option);
  }
  const syncHeader = () => {
    bulkSeason.value =
      rows.length && rows.every((r) => r.season === rows[0].season)
        ? rows[0].season
        : "";
  };
  function render() {
    tableBody!.replaceChildren();
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      const cell = () => {
        const td = document.createElement("td");
        tr.append(td);
        return td;
      };
      const img = document.createElement("img");
      img.className = "preview";
      img.src = row.preview;
      img.alt = "Preview of " + row.file.name;
      cell().append(img);
      cell().textContent = row.file.name;
      for (const key of ["world", "season", "description", "author"] as const) {
        const td = cell();
        const input =
          key === "world" || key === "season"
            ? document.createElement("select")
            : document.createElement("input");
        input.setAttribute("aria-label", key + " for image " + (i + 1));
        if (input instanceof HTMLSelectElement) {
          const values =
            key === "world"
              ? [...WORLDS]
              : ["", ...Object.keys(HULETTCRAFT.seasons)];
          for (const value of values)
            input.add(
              new Option(
                value ||
                  (row.world === "hulettcraft"
                    ? "Current season"
                    : "Unassigned"),
                value,
              ),
            );
        } else input.maxLength = key === "description" ? 2000 : 100;
        input.value = row[key];
        input.addEventListener("input", () => {
          row[key] = input.value;
          syncHeader();
        });
        td.append(input);
        if (key === "author") {
          input.classList.add("edit-author");
          const template = document.querySelector<HTMLTemplateElement>(
            "#upload-member-options",
          )!;
          const picker = template.content.firstElementChild!.cloneNode(
            true,
          ) as HTMLSelectElement;
          picker.setAttribute(
            "aria-label",
            "Choose member for image " + (i + 1),
          );
          picker.value = row.author;
          td.prepend(picker);
          bindAuthorPicker(td);
        }
      }
      tableBody!.append(tr);
    });
    syncHeader();
  }
  function addFiles(files: File[]) {
    if (busy) return;
    if (
      rows.length + files.length > 20 ||
      files.some((f) => f.size > 10 * 1024 * 1024) ||
      rows.reduce((sum, r) => sum + r.file.size, 0) +
        files.reduce((sum, f) => sum + f.size, 0) >
        24 * 1024 * 1024
    ) {
      if (status)
        status.textContent =
          "Choose up to 20 images, at most 10 MiB each and 24 MiB total.";
      return;
    }
    rows.push(
      ...files.map((file) => ({
        file,
        world: "hulettcraft",
        season: String(HULETTCRAFT.currentSeason),
        description: "",
        author: "",
        preview: URL.createObjectURL(file),
      })),
    );
    render();
  }
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer) addFiles([...e.dataTransfer.files]);
  });
  fileInput.addEventListener("change", () => {
    addFiles([...(fileInput.files ?? [])]);
    fileInput.value = "";
  });
  bulkSeason.addEventListener("change", () => {
    rows.forEach((r) => (r.season = bulkSeason.value));
    render();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !rows.length) return;
    const totalBytes = rows.reduce((sum, r) => sum + r.file.size, 0);
    if (totalBytes > 24 * 1024 * 1024) {
      if (status)
        status.textContent = "Upload at most 24 MiB of images in one batch.";
      return;
    }
    busy = true;
    const button = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (button) button.disabled = true;
    if (status) status.textContent = "Uploading…";
    const fd = new FormData();
    fd.set(
      "manifest",
      JSON.stringify(
        rows.map((r) => ({
          filename: r.file.name,
          world: r.world,
          season: r.season,
          description: r.description,
          author: r.author,
        })),
      ),
    );
    rows.forEach((r) => fd.append("files", r.file));
    try {
      const response = await fetch("/api/admin/bulk-upload", {
        method: "POST",
        body: fd,
      });
      if (!response.ok) throw new Error(await response.text());
      const data: { results: { ok: boolean; message?: string }[] } =
        await response.json();
      const failed: Row[] = [];
      data.results.forEach((result, i) => {
        if (result.ok) URL.revokeObjectURL(rows[i].preview);
        else failed.push(rows[i]);
      });
      rows = failed;
      render();
      if (status)
        status.textContent = failed.length
          ? failed.length +
            " images failed and remain ready to retry. Check the gallery before retrying."
          : "Upload complete.";
    } catch (error) {
      if (status)
        status.textContent =
          error instanceof Error
            ? error.message
            : "Upload failed. Check the gallery before retrying.";
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  });
}
