export {};
document
  .querySelectorAll<HTMLElement>("[data-gallery-editor]")
  .forEach((root) => {
    const boxes = Array.from(
      root.querySelectorAll<HTMLInputElement>("[data-select-image]"),
    );
    const apply = root.querySelector<HTMLButtonElement>("[data-apply-author]")!;
    const author = root.querySelector<HTMLInputElement>(
      ".bulk-author-controls .edit-author",
    )!;
    const clear = root.querySelector<HTMLInputElement>("[data-clear-author]")!;
    const status = root.querySelector<HTMLElement>("[data-bulk-result]")!;
    const selected = () => boxes.filter((box) => box.checked);
    const refresh = () => {
      root.querySelector("[data-selection-count]")!.textContent =
        `${selected().length} selected`;
      apply.disabled = !selected().length;
    };
    boxes.forEach((box) =>
      box.addEventListener("change", () => {
        if (selected().length > 50) {
          box.checked = false;
          status.textContent = "Select up to 50 screenshots at a time.";
        }
        refresh();
      }),
    );
    root
      .querySelector("[data-select-images]")!
      .addEventListener("click", () => {
        boxes.forEach((box, index) => {
          box.checked = index < 50;
        });
        refresh();
      });
    root
      .querySelector("[data-clear-selection]")!
      .addEventListener("click", () => {
        boxes.forEach((box) => {
          box.checked = false;
        });
        refresh();
      });
    apply.addEventListener("click", async () => {
      const targets = selected();
      if (!targets.length) return;
      if (!clear.checked && !author.value.trim()) {
        status.textContent = "Choose a member or enter an author first.";
        author.focus();
        return;
      }
      if (
        !confirm(
          `${clear.checked ? "Clear" : "Replace"} the author on ${targets.length} selected screenshots${clear.checked ? "" : ` with ${author.value.trim()}`}? Captions will be preserved.`,
        )
      )
        return;
      const controls = Array.from(
        root.querySelectorAll<
          | HTMLInputElement
          | HTMLButtonElement
          | HTMLSelectElement
          | HTMLTextAreaElement
        >("input,button,select,textarea"),
      );
      const disabled = controls.map((control) => control.disabled);
      controls.forEach((control) => {
        control.disabled = true;
      });
      status.textContent = "Saving selected authors…";
      try {
        const response = await fetch("/api/admin/bulk-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keys: targets.map(
              (box) => box.closest<HTMLElement>("figure")!.dataset.key,
            ),
            ...(clear.checked
              ? { clearAuthor: true }
              : { author: author.value.trim() }),
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        const data: {
          results: {
            key: string;
            ok: boolean;
            metadata?: { author?: string };
            message?: string;
          }[];
        } = await response.json();
        let saved = 0;
        for (const box of targets) {
          const figure = box.closest<HTMLElement>("figure")!;
          const result = data.results.find(
            (result) => result.key === figure.dataset.key,
          );
          const message = figure.querySelector<HTMLElement>(".save-result")!;
          if (result?.ok && result.metadata) {
            const input =
              figure.querySelector<HTMLInputElement>(".edit-author")!;
            input.value = input.defaultValue = result.metadata.author ?? "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            box.checked = false;
            message.textContent = "Author saved";
            saved++;
          } else
            message.textContent =
              result?.message ?? "Edit not confirmed. Refresh before retrying.";
        }
        status.textContent = `${saved} author edits saved.${saved < targets.length ? " Failed edits remain selected; check their messages before retrying." : ""}`;
      } catch (error) {
        status.textContent = `${error instanceof Error ? error.message : "Could not confirm author edits."} Selection and edits are retained. Refresh and check before retrying.`;
      } finally {
        controls.forEach((control, index) => {
          control.disabled = disabled[index];
        });
        refresh();
      }
    });
  });
