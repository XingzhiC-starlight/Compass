import { card, daysAgo, exactly, localDay, projectPill, savedNote } from "../screens.mjs";

const FAILED_SAVE = [/^\[compass\] a save failed: /, /^Failed to load resource: net::ERR_/];

function panel(page) {
  return card(page, "task");
}

function tasks(page) {
  return panel(page).locator("li.task-item:not(.task-add-row)");
}

function task(page, text) {
  return tasks(page).filter({ has: page.locator("span.task-text", { hasText: exactly(text) }) });
}

async function shown(page) {
  return (await panel(page).locator("li.task-item span.task-text").allTextContents()).map((text) => text.trim());
}

async function stored(j) {
  return j.rows("daily_tasks", "select=text,is_done,sort_order,task_date&order=sort_order");
}

async function addTasks(j, texts, key = "Enter") {
  const box = panel(j.page).getByPlaceholder("Type a task, press Enter…");
  if (!(await box.isVisible())) await panel(j.page).getByRole("button", { name: "+ Add a task" }).click();
  for (const text of texts) {
    await box.fill(text);
    await box.press(key);
    await j.expect(task(j.page, text)).toBeVisible();
    await j.expect(box).toHaveValue("");
  }
  await box.press("Escape");
}

export default {
  name: "tasks",
  section: "§11",
  title: "Daily Task panel",
  steps: [
    {
      id: "tk-panel",
      what: "The lower panel is titled \"Daily Task\" and carries the group \"Switch panel view\": Task list (pressed) and Thought log",
      async run(j) {
        const { page, expect } = j;
        await j.signIn();
        await j.setUp("Tasks");
        await expect(panel(page).getByRole("heading", { level: 2, name: "Daily Task" })).toBeVisible();
        const group = panel(page).getByRole("group", { name: "Switch panel view" });
        await expect(group.getByRole("button", { name: "Task list" })).toHaveAttribute("aria-pressed", "true");
        await expect(group.getByRole("button", { name: "Thought log" })).toHaveAttribute("aria-pressed", "false");
      },
    },
    {
      id: "tk-add",
      what: "+ Add a task opens \"Type a task, press Enter…\", which stays open after each Enter (Shift+Enter submits too); each task goes last in Libre Baskerville and is stored with today as its day",
      async run(j) {
        const { page, expect } = j;
        await addTasks(j, ["First task", "Second task"]);
        await addTasks(j, ["Third task"], "Shift+Enter");
        await expect.poll(() => shown(page)).toEqual(["First task", "Second task", "Third task"]);
        await expect(task(page, "First task").locator(".task-text")).toHaveCSS("font-family", /Libre Baskerville/);
        const kept = await stored(j);
        const want = [["First task", false, localDay()], ["Second task", false, localDay()], ["Third task", false, localDay()]];
        if (JSON.stringify(kept.map((one) => [one.text, one.is_done, one.task_date])) !== JSON.stringify(want)) throw new Error(`Stored ${JSON.stringify(kept)}.`);
      },
    },
    {
      id: "tk-check",
      what: "Ticking a task (\"Mark task complete\") marks it done and sinks it to the bottom on screen only, the stored order unchanged; unticking returns it to its place",
      async run(j) {
        const { page, expect } = j;
        await task(page, "First task").getByRole("button", { name: "Mark task complete" }).click();
        await expect(task(page, "First task").getByRole("button", { name: "Mark task incomplete" })).toHaveAttribute("aria-pressed", "true");
        await expect(task(page, "First task")).toHaveClass(/\bchecked\b/);
        await expect.poll(() => shown(page)).toEqual(["Second task", "Third task", "First task"]);
        await expect.poll(async () => (await stored(j)).map((one) => [one.text, one.is_done])).toEqual([["First task", true], ["Second task", false], ["Third task", false]]);
        await j.snap("ticked");
        await task(page, "First task").getByRole("button", { name: "Mark task incomplete" }).click();
        await expect.poll(() => shown(page)).toEqual(["First task", "Second task", "Third task"]);
      },
    },
    {
      id: "tk-edit",
      what: "A task's text (\"Click to edit\") edits in place: Enter or a click away stores it, Escape cancels, and an empty text leaves it unchanged",
      async run(j) {
        const { page, expect } = j;
        const field = () => panel(page).locator("textarea.task-text-input");
        await expect(task(page, "Second task").locator("span.task-text")).toHaveAttribute("title", "Click to edit");
        await task(page, "Second task").locator("span.task-text").click();
        await field().fill("Second task, edited");
        await field().press("Enter");
        await expect(task(page, "Second task, edited")).toBeVisible();
        await task(page, "Second task, edited").locator("span.task-text").click();
        await field().fill("Not kept");
        await field().press("Escape");
        await expect(task(page, "Second task, edited")).toBeVisible();
        await task(page, "Second task, edited").locator("span.task-text").click();
        await field().fill("");
        await field().press("Enter");
        await expect(task(page, "Second task, edited")).toBeVisible();
        await task(page, "Third task").locator("span.task-text").click();
        await field().fill("Third task, blurred");
        await panel(page).getByRole("heading", { name: "Daily Task" }).click();
        await expect(task(page, "Third task, blurred")).toBeVisible();
        await expect.poll(async () => (await stored(j)).map((one) => one.text)).toEqual(["First task", "Second task, edited", "Third task, blurred"]);
      },
    },
    {
      id: "tk-edit-fails",
      what: "When an edit's save fails, the calm note shows and the field reopens with the words typed, without taking the cursor; once the connection is back the edit saves",
      console: FAILED_SAVE,
      async run(j) {
        const { page, expect } = j;
        await page.route("**/rest/v1/daily_tasks**", (route) => (route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.fallback()));
        await task(page, "First task").locator("span.task-text").click();
        const field = panel(page).locator("textarea.task-text-input");
        await field.fill("First task, lost");
        await field.press("Enter");
        await expect(savedNote(page)).toBeVisible();
        await expect(field).toHaveValue("First task, lost");
        await expect(field).not.toBeFocused();
        await j.snap("reopened");
        await page.unroute("**/rest/v1/daily_tasks**");
        await field.click();
        await field.press("Enter");
        await expect(task(page, "First task, lost")).toBeVisible();
        await expect.poll(async () => (await stored(j))[0].text).toBe("First task, lost");
      },
    },
    {
      id: "tk-long-text",
      what: "Text that runs over several lines shows in full: the add field grows with it as it is typed, and the saved task shows every word, nothing cut off",
      async run(j) {
        const { page, expect } = j;
        const long = "A long task that keeps going ".repeat(12).trim();
        await panel(page).getByRole("button", { name: "+ Add a task" }).click();
        const box = panel(page).getByPlaceholder("Type a task, press Enter…");
        const before = (await box.boundingBox()).height;
        await box.fill(long);
        await expect.poll(async () => (await box.boundingBox()).height).toBeGreaterThan(before * 2);
        if (await box.evaluate((el) => el.scrollHeight > el.clientHeight + 1)) throw new Error("The add field hides part of its text.");
        await box.press("Enter");
        await box.press("Escape");
        const kept = task(page, long).locator("span.task-text");
        await expect(kept).toHaveText(long);
        if (await kept.evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) throw new Error("The saved task is cut off.");
        j.note(`The add field grew from ${Math.round(before)} px; the saved task spans ${Math.round((await kept.boundingBox()).height)} px.`);
      },
    },
    {
      id: "tk-delete",
      what: "× (\"Delete task\") removes the task from the list and from storage",
      async run(j) {
        const { page, expect } = j;
        const long = tasks(page).filter({ hasText: "A long task that keeps going" });
        await long.getByRole("button", { name: "Delete task" }).click();
        await expect(long).toHaveCount(0);
        await expect.poll(async () => (await stored(j)).length).toBe(3);
      },
    },
    {
      id: "tk-reorder",
      what: "A task drags by its grip to a new place; the order is stored and survives a reload",
      async run(j) {
        const { page, expect } = j;
        await task(page, "Third task, blurred").locator(".task-handle").dragTo(tasks(page).first(), { targetPosition: { x: 40, y: 3 } });
        await expect.poll(() => shown(page)).toEqual(["Third task, blurred", "First task, lost", "Second task, edited"]);
        await page.reload();
        await expect.poll(() => shown(page)).toEqual(["Third task, blurred", "First task, lost", "Second task, edited"]);
        await expect.poll(async () => (await stored(j)).map((one) => one.text)).toEqual(["Third task, blurred", "First task, lost", "Second task, edited"]);
      },
    },
    {
      id: "tk-reorder-finished",
      what: "A drag stores only the new order of the tasks that are finished, or unfinished, like the one dragged: a finished task keeps its stored place, so unticking it after a drag returns it there",
      async run(j) {
        const { page, expect } = j;
        await task(page, "Third task, blurred").getByRole("button", { name: "Mark task complete" }).click();
        await expect.poll(() => shown(page)).toEqual(["First task, lost", "Second task, edited", "Third task, blurred"]);
        await task(page, "Second task, edited").locator(".task-handle").dragTo(tasks(page).first(), { targetPosition: { x: 40, y: 3 } });
        await expect.poll(() => shown(page)).toEqual(["Second task, edited", "First task, lost", "Third task, blurred"]);
        await expect.poll(async () => (await stored(j)).map((one) => one.text)).toEqual(["Third task, blurred", "Second task, edited", "First task, lost"]);
        await j.snap("dragged");
        await task(page, "Third task, blurred").getByRole("button", { name: "Mark task incomplete" }).click();
        await expect.poll(() => shown(page)).toEqual(["Third task, blurred", "Second task, edited", "First task, lost"]);
        await page.reload();
        await expect.poll(() => shown(page)).toEqual(["Third task, blurred", "Second task, edited", "First task, lost"]);
      },
    },
    {
      id: "tk-across-days",
      what: "Tasks persist across days: one added yesterday, stored with yesterday as its day, is still listed today, finished or not",
      limit: 90_000,
      async run(j) {
        const { expect } = j;
        await j.newVisit({ clock: daysAgo(1) });
        await j.signIn();
        await expect(projectPill(j.page, "Tasks")).toHaveClass(/\bactive\b/);
        await addTasks(j, ["From yesterday"]);
        await task(j.page, "From yesterday").getByRole("button", { name: "Mark task complete" }).click();
        await expect.poll(async () => (await stored(j)).find((one) => one.text === "From yesterday")?.task_date).toBe(localDay(daysAgo(1)));
        await j.newVisit();
        await j.signIn();
        await expect(task(j.page, "From yesterday")).toBeVisible();
        await expect(task(j.page, "From yesterday")).toHaveClass(/\bchecked\b/);
        await expect.poll(() => shown(j.page)).toEqual(["Third task, blurred", "Second task, edited", "First task, lost", "From yesterday"]);
      },
    },
    {
      id: "tk-edge-scroll",
      what: "While a task is dragged within 56 px of the list's bottom edge the list scrolls; back in the middle it stops, and the drop lands where it is let go, beside the row under the pointer",
      limit: 120_000,
      async run(j) {
        const { page, expect } = j;
        await addTasks(j, Array.from({ length: 22 }, (_, i) => `Filler ${String(i + 1).padStart(2, "0")}`));
        const list = panel(page).locator("ul.task-list");
        await list.evaluate((el) => { el.scrollTop = 0; });
        const box = await list.boundingBox();
        const x = box.x + box.width / 2;
        await j.startDrag(task(page, "Third task, blurred").locator(".task-handle"));
        await page.mouse.move(x, box.y + box.height - 20, { steps: 8 });
        await j.holdDrag(x, box.y + box.height - 20, 600);
        const scrolled = await list.evaluate((el) => el.scrollTop);
        if (scrolled < 100) throw new Error(`Held at the bottom edge, the list scrolled ${Math.round(scrolled)} px.`);
        const middle = box.y + box.height / 2;
        await page.mouse.move(x, middle, { steps: 4 });
        await j.holdDrag(x, middle, 250);
        const stopped = await list.evaluate((el) => el.scrollTop);
        await j.holdDrag(x, middle, 400);
        if (Math.abs((await list.evaluate((el) => el.scrollTop)) - stopped) > 1) throw new Error("The list kept scrolling with the pointer in the middle.");
        const under = await page.evaluate(([px, py]) => globalThis.document.elementFromPoint(px, py)?.closest("li.task-item")?.querySelector("span.task-text")?.textContent ?? "", [x, middle]);
        await page.mouse.up();
        const order = await shown(page);
        const at = order.indexOf("Third task, blurred");
        j.note(`The list scrolled ${Math.round(scrolled)} px at the edge and stopped at ${Math.round(stopped)} px; let go over "${under}", the task landed at place ${at + 1}.`);
        if (!under || (order[at - 1] !== under && order[at + 1] !== under)) throw new Error(`The task landed at place ${at + 1}, not beside "${under}", the row it was let go over.`);
        await expect.poll(async () => (await stored(j)).filter((one) => !one.is_done).map((one) => one.text)).toEqual(order.filter((text) => text !== "From yesterday"));
      },
    },
    {
      id: "tk-views-stay-mounted",
      what: "Both views stay mounted: the task list's scroll and the thought log's selection survive switching between them",
      async run(j) {
        const { page, expect } = j;
        const group = panel(page).getByRole("group", { name: "Switch panel view" });
        await group.getByRole("button", { name: "Thought log" }).click();
        await expect(panel(page).getByRole("heading", { name: "Thoughts" })).toBeVisible();
        await panel(page).getByRole("button", { name: "+ Add a thought" }).click();
        const box = panel(page).getByPlaceholder("What's on your mind? Press Enter to add…");
        for (const text of ["One thought", "Another thought"]) {
          await box.fill(text);
          await box.press("Enter");
          await expect(box).toHaveValue("");
        }
        await box.press("Escape");
        for (const checkbox of await panel(page).getByRole("checkbox", { name: "Select thought" }).all()) await checkbox.check();
        await expect(panel(page).getByText("2 selected", { exact: true })).toBeVisible();
        await group.getByRole("button", { name: "Task list" }).click();
        const list = panel(page).locator("ul.task-list");
        await list.evaluate((el) => { el.scrollTop = 240; });
        await group.getByRole("button", { name: "Thought log" }).click();
        await expect(panel(page).getByText("2 selected", { exact: true })).toBeVisible();
        await group.getByRole("button", { name: "Task list" }).click();
        await expect.poll(() => list.evaluate((el) => Math.round(el.scrollTop))).toBe(240);
      },
    },
  ],
};
