import { minecraftAvatar, type CommunityMember } from "../config/community";
import type { CommunityRoster } from "../lib/communityRoster";

const form = document.querySelector<HTMLFormElement>("#roster-form");
if (form) {
  const controls =
    document.querySelector<HTMLFieldSetElement>("#roster-controls")!;
  const list = document.querySelector<HTMLDivElement>("#roster-members")!;
  const result =
    document.querySelector<HTMLParagraphElement>("#roster-result")!;
  const dirtyText =
    document.querySelector<HTMLParagraphElement>("#roster-dirty")!;
  const save = document.querySelector<HTMLButtonElement>("#save-roster")!;
  const add = document.querySelector<HTMLButtonElement>("#add-member")!;
  const memberTemplate = document.querySelector<HTMLTemplateElement>(
    "#roster-member-template",
  )!;
  const linkTemplate = document.querySelector<HTMLTemplateElement>(
    "#roster-link-template",
  )!;
  let revision = "",
    dirty = false;
  let imageUploads = 0;
  const avatarIds = new WeakMap<Element, string>();

  function field<
    T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =
      HTMLInputElement,
  >(root: Element, name: string) {
    return root.querySelector<T>(`[data-field="${name}"]`)!;
  }
  function refresh() {
    document.querySelector("#roster-count")!.textContent =
      `${list.children.length} ${list.children.length === 1 ? "member" : "members"} · ${list.querySelectorAll('[data-field="active"]:checked').length} visible`;
    add.disabled = list.children.length >= 200;
    save.disabled = !dirty || imageUploads > 0;
    dirtyText.textContent = dirty ? "Unsaved changes." : "No unsaved changes.";
  }
  function changed() {
    dirty = true;
    refresh();
  }
  function addLink(row: Element, link = { label: "", url: "" }) {
    const links = row.querySelector(".roster-links")!;
    if (links.children.length >= 8) return;
    const node = linkTemplate.content.firstElementChild!.cloneNode(
      true,
    ) as HTMLElement;
    field(node, "label").value = link.label;
    field(node, "url").value = link.url;
    node.querySelector("button")!.addEventListener("click", () => {
      node.remove();
      row.querySelector<HTMLButtonElement>(
        '[data-action="add-link"]',
      )!.disabled = false;
      changed();
      row.querySelector<HTMLButtonElement>('[data-action="add-link"]')!.focus();
    });
    links.append(node);
    row.querySelector<HTMLButtonElement>('[data-action="add-link"]')!.disabled =
      links.children.length >= 8;
    return node;
  }
  function addMember(
    member: CommunityMember = { username: "", displayName: "", active: true },
  ) {
    const row = memberTemplate.content.firstElementChild!.cloneNode(
      true,
    ) as HTMLFieldSetElement;
    field(row, "username").value = member.username;
    field(row, "displayName").value = member.displayName;
    field(row, "active").checked = member.active;
    field(row, "bio").value = member.bio ?? "";
    const avatarType = field<HTMLSelectElement>(row, "avatarType");
    const preview = row.querySelector<HTMLImageElement>(
      ".roster-portrait-preview",
    )!;
    const imageStatus = row.querySelector<HTMLElement>("[data-avatar-status]")!;
    let uploadVersion = 0;
    avatarType.value = member.avatar?.type ?? "none";
    if (member.avatar?.type === "upload") avatarIds.set(row, member.avatar.id);
    function updateAvatar() {
      row.querySelector<HTMLElement>("[data-avatar-upload]")!.hidden =
        avatarType.value !== "upload";
      if (avatarType.value === "minecraft") {
        preview.src = minecraftAvatar(field(row, "username").value);
        preview.hidden = !preview.getAttribute("src");
      } else if (avatarType.value === "none") preview.hidden = true;
      else {
        preview.hidden = true;
        const id = avatarIds.get(row);
        if (id)
          void fetch(`/api/admin/member-image?id=${id}`, { cache: "no-store" })
            .then(async (response) => {
              if (!response.ok) throw new Error();
              const image: { src: string } = await response.json();
              if (avatarType.value === "upload" && avatarIds.get(row) === id) {
                preview.src = image.src;
                preview.hidden = false;
              }
            })
            .catch(() => {
              imageStatus.textContent =
                "Preview unavailable; the saved image is retained.";
            });
      }
    }
    preview.addEventListener("error", () => {
      preview.hidden = true;
    });
    avatarType.addEventListener("change", () => {
      uploadVersion++;
      imageStatus.textContent = "";
      updateAvatar();
    });
    field(row, "username").addEventListener("change", () => {
      if (avatarType.value === "minecraft") updateAvatar();
    });
    field(row, "avatarFile").addEventListener("change", async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const version = ++uploadVersion;
      imageUploads++;
      refresh();
      imageStatus.textContent = "Resizing and uploading image…";
      let objectUrl = "";
      try {
        if (
          file.size > 10 * 1024 * 1024 ||
          !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
            file.type,
          )
        )
          throw new Error(
            "Choose a PNG, JPEG, GIF or WebP image up to 10 MiB.",
          );
        const image = new Image();
        objectUrl = URL.createObjectURL(file);
        image.src = objectUrl;
        await image.decode();
        if (image.naturalWidth * image.naturalHeight > 40_000_000)
          throw new Error("Choose an image up to 40 megapixels.");
        const scale = Math.min(
          1,
          256 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas
          .getContext("2d")!
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.85),
        );
        if (!blob || blob.size > 96 * 1024)
          throw new Error(
            "The resized image is too large. Please try another image.",
          );
        if (version !== uploadVersion || !row.isConnected) return;
        const body = new FormData();
        body.set("image", new File([blob], "member.webp", { type: blob.type }));
        const response = await fetch("/api/admin/member-image", {
          method: "POST",
          body,
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error(await response.text());
        const uploaded: { id: string; src: string } = await response.json();
        if (version !== uploadVersion || !row.isConnected) return;
        avatarIds.set(row, uploaded.id);
        preview.src = uploaded.src;
        preview.hidden = false;
        imageStatus.textContent =
          "Image ready. Save the roster to publish this choice.";
        changed();
      } catch (error) {
        if (version === uploadVersion)
          imageStatus.textContent = `${error instanceof Error ? error.message : "Image upload failed."} The previous image is retained.`;
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        input.value = "";
        imageUploads--;
        refresh();
      }
    });
    updateAvatar();
    const title = () => {
      row.querySelector("legend")!.textContent =
        field(row, "displayName").value || "New member";
    };
    title();
    field(row, "displayName").addEventListener("input", title);
    for (const link of member.links ?? []) addLink(row, link);
    row
      .querySelector('[data-action="add-link"]')!
      .addEventListener("click", () => {
        const link = addLink(row);
        changed();
        link?.querySelector("input")?.focus();
      });
    row
      .querySelector('[data-action="remove-member"]')!
      .addEventListener("click", () => {
        row.remove();
        changed();
        add.focus();
      });
    list.append(row);
    return row;
  }
  function members(): CommunityMember[] {
    return Array.from(list.children).map((row) => {
      const type = field(row, "avatarType").value;
      const id = avatarIds.get(row);
      if (type === "upload" && !id)
        throw new Error(
          "Upload an image for each selected member, or choose Minecraft skin head or Initials.",
        );
      return {
        username: field(row, "username").value,
        displayName: field(row, "displayName").value,
        active: field(row, "active").checked,
        bio: field(row, "bio").value,
        links: Array.from(row.querySelectorAll(".roster-link")).map((link) => ({
          label: field(link, "label").value,
          url: field(link, "url").value,
        })),
        ...(type === "minecraft"
          ? { avatar: { type: "minecraft" as const } }
          : type === "upload" && id
            ? { avatar: { type: "upload" as const, id } }
            : {}),
      };
    });
  }
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  add.addEventListener("click", () => {
    if (list.children.length >= 200) return;
    const row = addMember();
    changed();
    field(row, "username").focus();
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dirty || imageUploads || !form.reportValidity()) return;
    if (
      list.children.length === 0 &&
      !confirm(
        "Save an empty roster? This removes all member profiles from the directory.",
      )
    )
      return;
    controls.disabled = true;
    result.textContent = "Saving roster…";
    try {
      const response = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, members: members() }),
      });
      if (!response.ok) throw new Error(await response.text());
      const saved: CommunityRoster = await response.json();
      revision = saved.revision;
      dirty = false;
      result.textContent =
        "Roster saved. Updates may take about a minute to appear on the Community page.";
    } catch (error) {
      result.textContent = `${error instanceof Error ? error.message : "Could not save the roster."} Your edits are still here. Save again after resolving the problem.`;
    } finally {
      controls.disabled = false;
      refresh();
    }
  });
  void (async () => {
    try {
      const response = await fetch("/api/admin/roster", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const roster: CommunityRoster = await response.json();
      revision = roster.revision;
      for (const member of roster.members) addMember(member);
      result.textContent = roster.updatedAt
        ? `Last saved ${new Date(roster.updatedAt).toLocaleString()}.`
        : "Add your confirmed roster, then save to publish it.";
      form.hidden = false;
      refresh();
    } catch (error) {
      result.textContent = `${error instanceof Error ? error.message : "Could not load the roster."} Refresh to try again. Editing is disabled until the saved roster can be loaded.`;
    }
  })();
}
