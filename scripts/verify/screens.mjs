// How Compass's screens are found the way a person finds them: by role, accessible name, label,
// placeholder and visible text. The class names used are the ones the journeys cannot do without.

export function dashboardShown(page) {
  return page.getByRole("button", { name: "Settings", exact: true });
}

export function setupShown(page) {
  return page.getByRole("button", { name: /Open my dashboard|Opening…/ });
}

export function landingLogIn(page) {
  return page.getByRole("banner").getByRole("button", { name: "Log in", exact: true });
}

export function loginShown(page) {
  return page.getByRole("button", { name: "Back to the Compass home page" });
}

export function projectPills(page) {
  return page.locator(".project-pills .project-pill:not(.new-pill)");
}

export function exactly(text) {
  return new RegExp(`^${String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

/** A live project's pill, by its whole name. */
export function projectPill(page, name) {
  return projectPills(page).filter({ has: page.locator(".pill-name", { hasText: exactly(name) }) });
}

/** One of the four bubbles: "time", "timeline", "learning" or "task". */
export function card(page, which) {
  return page.locator(`.bubble-${which}`);
}

export function savedNote(page) {
  return page.getByRole("status").filter({ hasText: "Couldn't save just now — try again in a moment." });
}

export const STANDARD_ANSWERS = {
  planned: "2",
  actual: "3",
  days: "10",
  phases: [["Sketch the screens", "4"], ["Build the first page", "6"]],
  learning: [["Layout basics", "10"], ["Colour", "30"]],
};

/** The local calendar day, as Compass writes its day keys (I4). */
export function localDay(at = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

export function daysAgo(days, hours = 12, minutes = 0) {
  const at = new Date();
  at.setDate(at.getDate() - days);
  at.setHours(hours, minutes, 0, 0);
  return at;
}
