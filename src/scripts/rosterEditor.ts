import type { CommunityMember } from "../config/community";
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

  function field<
    T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement,
  >(root: Element, name: string) {
    return root.querySelector<T>(`[data-field="${name}"]`)!;
  }
  function refresh() {
    document.querySelector("#roster-count")!.textContent =
      `${list.children.length} ${list.children.length === 1 ? "member" : "members"} · ${list.querySelectorAll('[data-field="active"]:checked').length} visible`;
    add.disabled = list.children.length >= 200;
    save.disabled = !dirty;
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
    return Array.from(list.children).map((row) => ({
      username: field(row, "username").value,
      displayName: field(row, "displayName").value,
      active: field(row, "active").checked,
      bio: field(row, "bio").value,
      links: Array.from(row.querySelectorAll(".roster-link")).map((link) => ({
        label: field(link, "label").value,
        url: field(link, "url").value,
      })),
    }));
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
    if (!dirty || !form.reportValidity()) return;
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
