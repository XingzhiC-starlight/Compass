import { card, exactly, savedNote } from "../screens.mjs";

const FAILED_SAVE = [/^\[compass\] a save failed: /, /^Failed to load resource: net::ERR_/];

function panel(page) {
  return card(page, "task");
}

function thought(page, text) {
  return panel(page).locator("li.th-row:not(.th-add-row)").filter({ has: page.locator("p.th-text", { hasText: exactly(text) }) });
}

function group(page, name) {
  return panel(page).locator("li.th-group").filter({ has: page.locator(".th-group-name", { hasText: exactly(name) }) });
}

function actionBar(page) {
  return panel(page).locator(".th-action-bar");
}

/** The feed as a person reads it: loose thoughts by text, groups as [name: members]. */
async function feed(page) {
  return panel(page).locator("ul.th-feed").evaluate((list) => [...list.children]
    .filter((item) => !item.classList.contains("th-add-row"))
    .map((item) => (item.classList.contains("th-group")
      ? `[${item.querySelector(".th-group-name")?.textContent ?? ""}: ${[...item.querySelectorAll(".th-group-list p.th-text")].map((text) => text.textContent).join(", ")}]`
      : item.querySelector("p.th-text")?.textContent ?? "")));
}

async function stored(j) {
  const thoughts = await j.rows("thoughts", "select=id,title,text,sort_order,group_id&order=created_at");
  const groups = await j.rows("thought_groups", "select=id,name,sort_order");
  return { thoughts, groups, groupOf: (text) => groups.find((one) => one.id === thoughts.find((t) => t.text === text)?.group_id)?.name ?? null };
}

async function addThoughts(j, texts, key = "Enter") {
  const box = panel(j.page).getByPlaceholder("What's on your mind? Press Enter to add…");
  if (!(await box.isVisible())) await panel(j.page).getByRole("button", { name: "+ Add a thought" }).click();
  for (const text of texts) {
    await box.fill(text);
    await box.press(key);
    await j.expect(thought(j.page, text)).toBeVisible();
    await j.expect(box).toHaveValue("");
  }
  await box.press("Escape");
}

async function select(j, ...texts) {
  for (const text of texts) await thought(j.page, text).getByRole("checkbox", { name: "Select thought" }).check();
}

async function writesDuring(page, work) {
  const writes = [];
  const listen = (request) => {
    if (/\/rest\/v1\/(thoughts|thought_groups)/.test(request.url()) && request.method() !== "GET") writes.push(request.method());
  };
  page.on("request", listen);
  try {
    await work();
    await page.waitForTimeout(400);
  } finally {
    page.off("request", listen);
  }
  return writes.length;
}

async function opacity(locator) {
  return locator.evaluate((el) => Number(el.ownerDocument.defaultView.getComputedStyle(el).opacity));
}

export default {
  name: "thoughts",
  section: "§12",
  title: "Thought log",
  steps: [
    {
      id: "th-view",
      what: "The panel's Thought log view is titled \"Thoughts\", with \"+ Add a thought\" as its last row",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Thinking");
        await panel(page).getByRole("button", { name: "Thought log" }).click();
        await expect(panel(page).getByRole("heading", { level: 2, name: "Thoughts" })).toBeVisible();
        await expect(panel(page).getByRole("group", { name: "Switch panel view" }).getByRole("button", { name: "Thought log" })).toHaveAttribute("aria-pressed", "true");
        await expect(panel(page).locator("ul.th-feed > li").last()).toHaveText("+ Add a thought");
      },
    },
    {
      id: "th-add",
      what: "\"What's on your mind? Press Enter to add…\" adds a loose thought on Enter (Shift+Enter too), each waiting for its save, in the thought font; they are stored with no group",
      async run(j) {
        const { page, expect } = j;
        await addThoughts(j, ["Alpha thought", "Beta thought"]);
        await addThoughts(j, ["Gamma thought"], "Shift+Enter");
        await addThoughts(j, ["Delta thought"]);
        await expect.poll(() => feed(page)).toEqual(["Alpha thought", "Beta thought", "Gamma thought", "Delta thought"]);
        await expect(thought(page, "Alpha thought").locator("p.th-text")).toHaveCSS("font-family", /Libre Baskerville/);
        const { thoughts } = await stored(j);
        if (JSON.stringify(thoughts.map((one) => [one.text, one.group_id])) !== JSON.stringify([["Alpha thought", null], ["Beta thought", null], ["Gamma thought", null], ["Delta thought", null]])) {
          throw new Error(`Stored ${JSON.stringify(thoughts)}.`);
        }
      },
    },
    {
      id: "th-hover",
      what: "A row's checkbox and empty title (\"Add a title…\") are hidden until the row is hovered, then shown (the title faintly)",
      async run(j) {
        const { page, expect } = j;
        const row = thought(page, "Alpha thought");
        const check = row.getByRole("checkbox", { name: "Select thought" });
        const title = row.locator(".th-title");
        await panel(page).getByRole("heading", { name: "Thoughts" }).hover();
        await expect.poll(() => opacity(check)).toBe(0);
        await expect.poll(() => opacity(title)).toBe(0);
        await row.hover();
        await expect.poll(() => opacity(check)).toBe(1);
        await expect.poll(() => opacity(title)).toBeCloseTo(0.6, 1);
        await expect(title).toHaveText("Add a title…");
        await expect(title).toHaveAttribute("title", "Click to edit title");
      },
    },
    {
      id: "th-title",
      what: "Clicking the title adds one (Enter commits, Shift+Enter too) and it is stored; an empty title clears it",
      async run(j) {
        const { page, expect } = j;
        const row = thought(page, "Alpha thought");
        const field = row.getByPlaceholder("Add a title…");
        await row.locator(".th-title").click();
        await field.fill("Morning");
        await field.press("Enter");
        await expect(row.locator(".th-title")).toHaveText("Morning");
        await expect.poll(async () => (await stored(j)).thoughts[0].title).toBe("Morning");
        await row.locator(".th-title").click();
        await field.fill("");
        await field.press("Enter");
        await expect(row.locator(".th-title")).toHaveText("Add a title…");
        await expect.poll(async () => (await stored(j)).thoughts[0].title ?? "").toBe("");
        await row.locator(".th-title").click();
        await field.fill("Evening");
        await field.press("Shift+Enter");
        await expect(row.locator(".th-title")).toHaveText("Evening");
        await expect.poll(async () => (await stored(j)).thoughts[0].title).toBe("Evening");
      },
    },
    {
      id: "th-edit-body",
      what: "The body edits in place: Shift+Enter inserts a line break, Enter commits and stores it; committing unchanged text writes nothing",
      async run(j) {
        const { page, expect } = j;
        await thought(page, "Beta thought").locator("p.th-text").click();
        const field = panel(page).locator("textarea.th-text-input");
        await expect(field).toBeFocused();
        await field.press("End");
        await field.press("Shift+Enter");
        await field.pressSequentially("second line");
        await expect(field).toHaveValue("Beta thought\nsecond line");
        await field.press("Enter");
        await expect(field).toHaveCount(0);
        await expect.poll(async () => (await stored(j)).thoughts[1].text).toBe("Beta thought\nsecond line");
        const written = await writesDuring(page, async () => {
          await panel(page).locator("li.th-row").filter({ hasText: "second line" }).locator("p.th-text").click();
          await panel(page).locator("textarea.th-text-input").press("Enter");
        });
        if (written !== 0) throw new Error(`Committing unchanged text sent ${written} writes.`);
        await panel(page).locator("li.th-row").filter({ hasText: "second line" }).locator("p.th-text").click();
        const again = panel(page).locator("textarea.th-text-input");
        await again.fill("Beta thought");
        await again.press("Enter");
        await expect(thought(page, "Beta thought")).toBeVisible();
      },
    },
    {
      id: "th-edit-fails",
      what: "When a body edit's save fails, the calm note shows and the field reopens with the words typed, without taking the cursor",
      console: FAILED_SAVE,
      async run(j) {
        const { page, expect } = j;
        await page.route("**/rest/v1/thoughts**", (route) => (route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.fallback()));
        await thought(page, "Gamma thought").locator("p.th-text").click();
        const field = panel(page).locator("textarea.th-text-input");
        await field.fill("Gamma, not saved");
        await field.press("Enter");
        await expect(savedNote(page)).toBeVisible();
        await expect(field).toHaveValue("Gamma, not saved");
        await expect(field).not.toBeFocused();
        await j.snap("reopened");
        await page.unroute("**/rest/v1/thoughts**");
        await field.click();
        await field.fill("Gamma thought");
        await field.press("Enter");
        await expect(thought(page, "Gamma thought")).toBeVisible();
      },
    },
    {
      id: "th-delete",
      what: "× (\"Delete thought\") removes the thought from the feed and from storage",
      async run(j) {
        const { page, expect } = j;
        await addThoughts(j, ["Short-lived"]);
        await thought(page, "Short-lived").getByRole("button", { name: "Delete thought" }).click();
        await expect(thought(page, "Short-lived")).toHaveCount(0);
        await expect.poll(async () => (await stored(j)).thoughts.map((one) => one.text)).toEqual(["Alpha thought", "Beta thought", "Gamma thought", "Delta thought"]);
      },
    },
    {
      id: "th-group",
      what: "Ticking two thoughts shows the bar \"2 selected\" with Group and ×; Group makes a dashed group in their place, opens \"Name this group…\", and stores the name; the header reads \"2 thoughts\"",
      async run(j) {
        const { page, expect } = j;
        await select(j, "Alpha thought", "Beta thought");
        await expect(actionBar(page).getByText("2 selected", { exact: true })).toBeVisible();
        await expect(actionBar(page).getByRole("button", { name: "Group", exact: true })).toBeVisible();
        await expect(actionBar(page).getByRole("button", { name: "De-group" })).toHaveCount(0);
        await actionBar(page).getByRole("button", { name: "Group", exact: true }).click();
        const name = panel(page).getByPlaceholder("Name this group…");
        await expect(name).toBeFocused();
        await name.fill("Morning pages");
        await name.press("Enter");
        await expect(group(page, "Morning pages")).toBeVisible();
        await expect(group(page, "Morning pages").locator(".th-group-chip")).toHaveText("2 thoughts");
        await expect(group(page, "Morning pages")).toHaveCSS("border-top-style", "dashed");
        await expect(actionBar(page)).toHaveCount(0);
        await expect.poll(() => feed(page)).toEqual(["[Morning pages: Alpha thought, Beta thought]", "Gamma thought", "Delta thought"]);
        const kept = await stored(j);
        if (kept.groupOf("Alpha thought") !== "Morning pages" || kept.groupOf("Beta thought") !== "Morning pages") throw new Error("The group is not stored with its members.");
      },
    },
    {
      id: "th-untitled",
      what: "A group dismissed without a name is called \"Untitled group\"",
      async run(j) {
        const { page, expect } = j;
        await select(j, "Gamma thought", "Delta thought");
        await actionBar(page).getByRole("button", { name: "Group", exact: true }).click();
        await panel(page).getByPlaceholder("Name this group…").press("Escape");
        await expect(group(page, "Untitled group")).toBeVisible();
        await expect.poll(() => feed(page)).toEqual(["[Morning pages: Alpha thought, Beta thought]", "[Untitled group: Gamma thought, Delta thought]"]);
        await expect.poll(async () => (await stored(j)).groupOf("Gamma thought")).toBe("Untitled group");
      },
    },
    {
      id: "th-select-all",
      what: "A group header's checkbox (\"Select all thoughts in this group\") is mixed while only some members are selected, and selects them all",
      async run(j) {
        const { page, expect } = j;
        const all = group(page, "Morning pages").getByRole("checkbox", { name: "Select all thoughts in this group" });
        await select(j, "Alpha thought");
        await expect.poll(() => all.evaluate((box) => box.indeterminate)).toBe(true);
        await j.snap("mixed");
        await all.check();
        await expect.poll(() => all.evaluate((box) => box.indeterminate)).toBe(false);
        await expect(actionBar(page).getByText("2 selected", { exact: true })).toBeVisible();
      },
    },
    {
      id: "th-same-group",
      what: "With exactly one whole group selected the button still reads Group; pressing it writes nothing and closes the bar",
      async run(j) {
        const { page, expect } = j;
        await expect(actionBar(page).getByRole("button", { name: "Group", exact: true })).toBeVisible();
        const written = await writesDuring(page, () => actionBar(page).getByRole("button", { name: "Group", exact: true }).click());
        await expect(actionBar(page)).toHaveCount(0);
        if (written !== 0) throw new Error(`Grouping a group with itself sent ${written} writes.`);
      },
    },
    {
      id: "th-merge",
      what: "A whole group selected with something outside it turns Group into Merge: everything joins that group, newcomers last, and the group keeps its name",
      async run(j) {
        const { page, expect } = j;
        await addThoughts(j, ["Epsilon thought"]);
        await group(page, "Morning pages").getByRole("checkbox", { name: "Select all thoughts in this group" }).check();
        await select(j, "Epsilon thought");
        await expect(actionBar(page).getByText("3 selected", { exact: true })).toBeVisible();
        await actionBar(page).getByRole("button", { name: "Merge", exact: true }).click();
        await expect.poll(() => feed(page)).toEqual(["[Morning pages: Alpha thought, Beta thought, Epsilon thought]", "[Untitled group: Gamma thought, Delta thought]"]);
        await expect.poll(async () => (await stored(j)).groupOf("Epsilon thought")).toBe("Morning pages");
      },
    },
    {
      id: "th-degroup",
      what: "De-group (\"Remove the selected thoughts from their group\") moves only the selected grouped thoughts to the bottom of the feed, oldest first; the group stays while it has members",
      async run(j) {
        const { page, expect } = j;
        await select(j, "Beta thought", "Alpha thought");
        const degroup = actionBar(page).getByRole("button", { name: "De-group" });
        await expect(degroup).toHaveAttribute("title", "Remove the selected thoughts from their group");
        await degroup.click();
        await expect.poll(() => feed(page)).toEqual(["[Morning pages: Epsilon thought]", "[Untitled group: Gamma thought, Delta thought]", "Alpha thought", "Beta thought"]);
        const kept = await stored(j);
        if (kept.groupOf("Alpha thought") !== null || kept.groupOf("Epsilon thought") !== "Morning pages") throw new Error("De-group stored the wrong groups.");
      },
    },
    {
      id: "th-pop-out",
      what: "A grouped thought's pop-out (\"Pop thought out of group\") does the same for one thought; a group left with no member disappears",
      async run(j) {
        const { page, expect } = j;
        await thought(page, "Epsilon thought").getByRole("button", { name: "Pop thought out of group" }).click();
        await expect(group(page, "Morning pages")).toHaveCount(0);
        await expect.poll(() => feed(page)).toEqual(["[Untitled group: Gamma thought, Delta thought]", "Alpha thought", "Beta thought", "Epsilon thought"]);
        await expect.poll(async () => (await stored(j)).groups.map((one) => one.name)).toEqual(["Untitled group"]);
      },
    },
    {
      id: "th-ungroup",
      what: "Ungroup dissolves a group and returns its thoughts to the end of the feed in creation order",
      async run(j) {
        const { page, expect } = j;
        await panel(page).locator("li.th-group").getByRole("button", { name: "Ungroup" }).click();
        await expect(panel(page).locator("li.th-group")).toHaveCount(0);
        await expect.poll(() => feed(page)).toEqual(["Alpha thought", "Beta thought", "Epsilon thought", "Gamma thought", "Delta thought"]);
        await expect.poll(async () => (await stored(j)).groups.length).toBe(0);
      },
    },
    {
      id: "th-reorder",
      what: "A loose thought, a whole group, and a thought inside a group each drag by their grip to a new place; the order survives a reload",
      async run(j) {
        const { page, expect } = j;
        await select(j, "Gamma thought", "Delta thought");
        await actionBar(page).getByRole("button", { name: "Group", exact: true }).click();
        await panel(page).getByPlaceholder("Name this group…").fill("Later");
        await panel(page).getByPlaceholder("Name this group…").press("Enter");
        await expect.poll(() => feed(page)).toEqual(["Alpha thought", "Beta thought", "Epsilon thought", "[Later: Gamma thought, Delta thought]"]);
        const rows = panel(page).locator("ul.th-feed > li");
        await thought(page, "Epsilon thought").locator(".th-handle").dragTo(rows.first(), { targetPosition: { x: 60, y: 3 } });
        await expect.poll(() => feed(page)).toEqual(["Epsilon thought", "Alpha thought", "Beta thought", "[Later: Gamma thought, Delta thought]"]);
        await group(page, "Later").locator(".th-group-header .th-handle").dragTo(rows.first(), { targetPosition: { x: 60, y: 3 } });
        await expect.poll(() => feed(page)).toEqual(["[Later: Gamma thought, Delta thought]", "Epsilon thought", "Alpha thought", "Beta thought"]);
        await thought(page, "Delta thought").locator(".th-handle").dragTo(thought(page, "Gamma thought"), { targetPosition: { x: 60, y: 3 } });
        await expect.poll(() => feed(page)).toEqual(["[Later: Delta thought, Gamma thought]", "Epsilon thought", "Alpha thought", "Beta thought"]);
        await page.reload();
        await panel(page).getByRole("button", { name: "Thought log" }).click();
        await expect.poll(() => feed(page)).toEqual(["[Later: Delta thought, Gamma thought]", "Epsilon thought", "Alpha thought", "Beta thought"]);
      },
    },
    {
      id: "th-into-group",
      what: "Dragging a loose thought onto a group header moves it into that group, stored as the group's last member",
      async run(j) {
        const { page, expect } = j;
        await thought(page, "Beta thought").locator(".th-handle").dragTo(group(page, "Later").locator(".th-group-header"));
        await expect(group(page, "Later").locator(".th-group-chip")).toHaveText("3 thoughts");
        await expect(group(page, "Later").locator("p.th-text", { hasText: exactly("Beta thought") })).toBeVisible();
        const kept = await stored(j);
        const members = kept.thoughts.filter((one) => kept.groupOf(one.text) === "Later").sort((a, b) => a.sort_order - b.sort_order);
        if (members.at(-1)?.text !== "Beta thought") throw new Error(`Stored members in order: ${members.map((one) => one.text).join(", ")}.`);
      },
    },
    {
      id: "th-clear",
      what: "× in the action bar clears the selection and closes the bar",
      async run(j) {
        const { page, expect } = j;
        await select(j, "Alpha thought", "Epsilon thought");
        await expect(actionBar(page).getByText("2 selected", { exact: true })).toBeVisible();
        await actionBar(page).getByRole("button", { name: "×" }).click();
        await expect(actionBar(page)).toHaveCount(0);
        await expect(panel(page).getByRole("checkbox", { name: "Select thought", checked: true })).toHaveCount(0);
      },
    },
    {
      id: "th-edge-scroll",
      what: "While a thought is dragged within 56 px of the feed's bottom edge the feed scrolls, and moving back to the middle stops it; Escape then cancels the drag, leaving the feed where it scrolled and the thought in its old place",
      limit: 120_000,
      async run(j) {
        const { page, expect } = j;
        await addThoughts(j, Array.from({ length: 18 }, (_, i) => `Filler ${String(i + 1).padStart(2, "0")}`));
        const list = panel(page).locator("ul.th-feed");
        await list.evaluate((el) => { el.scrollTop = 0; });
        const before = await feed(page);
        const box = await list.boundingBox();
        const x = box.x + box.width / 2;
        await j.startDrag(thought(page, "Epsilon thought").locator(".th-handle"));
        await page.mouse.move(x, box.y + box.height - 20, { steps: 8 });
        await j.holdDrag(x, box.y + box.height - 20, 600);
        if ((await list.evaluate((el) => el.scrollTop)) < 100) throw new Error("Held at the bottom edge, the feed did not scroll.");
        const middle = box.y + box.height / 2;
        await page.mouse.move(x, middle, { steps: 4 });
        await j.holdDrag(x, middle, 250);
        const stopped = await list.evaluate((el) => el.scrollTop);
        await j.holdDrag(x, middle, 400);
        if (Math.abs((await list.evaluate((el) => el.scrollTop)) - stopped) > 1) throw new Error("The feed kept scrolling with the pointer in the middle.");
        await page.keyboard.press("Escape");
        // Were the drag still held, these moves' dragover would make the release a drop on the row
        // under the pointer (as the tasks journey's edge scroll shows), so an unchanged feed
        // afterwards shows that Escape cancelled the drag.
        await j.holdDrag(x, middle, 150);
        await page.mouse.up();
        const scrolled = await list.evaluate((el) => el.scrollTop);
        j.note(`The feed scrolled ${Math.round(stopped)} px, stopped in the middle, and stayed at ${Math.round(scrolled)} px after Escape.`);
        if (Math.abs(scrolled - stopped) > 1) throw new Error("The feed moved after Escape.");
        await expect.poll(() => feed(page)).toEqual(before);
      },
    },
  ],
};
