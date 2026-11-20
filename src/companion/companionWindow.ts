/**
 * The companion's window (spec §23): a small second window the dashboard draws into. In the
 * desktop app it is a window of the app's own that stays above every other (§22), always the
 * one opened by name. In a browser it is a picture-in-picture window where the browser has
 * them, which also stays on top, and otherwise a plain small popup.
 *
 * Either way the window opens empty, at `about:blank`, so before anything is drawn into it its
 * document is given a title, a base address and a copy of every stylesheet the page has: that
 * copy is how the design system's tokens and classes reach it.
 */

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

/** The name the window is opened under. The desktop app knows the companion by it (§22). */
export const COMPANION_NAME = "compass-companion";
export const COMPANION_WIDTH = 300;
export const COMPANION_HEIGHT = 640;
/** The height with the clock alone. */
export const COMPANION_SMALL_HEIGHT = 250;

/** Make an empty window's document ready to be drawn into. */
export function prepareCompanionDocument(source: Document, target: Document): void {
  target.title = "Compass Companion";
  target.documentElement.lang = source.documentElement.lang;

  // Addresses in the copied rules, the fonts', are written from the root of the app.
  const base = target.createElement("base");
  base.href = source.baseURI;
  target.head.appendChild(base);

  for (const sheet of Array.from(source.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      target.head.appendChild(style);
    } catch {
      // A sheet whose rules cannot be read is linked instead.
      if (!sheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
  target.body.classList.add("companion-body");
}

/**
 * Open the companion's window, from inside a click, and make its document ready. Null when the
 * browser refused it.
 */
export async function openCompanionWindow(): Promise<Window | null> {
  let win: Window | null = null;
  const pip = (window as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
  // The desktop app keeps the companion above the others itself, and knows it by its name (§22).
  const inTheDesktopApp = "compassDesktop" in window;
  if (pip && !inTheDesktopApp) {
    try {
      win = await pip.requestWindow({ width: COMPANION_WIDTH, height: COMPANION_SMALL_HEIGHT });
    } catch {
      win = null;
    }
  }
  if (!win) {
    win = window.open("", COMPANION_NAME, `popup=yes,width=${COMPANION_WIDTH},height=${COMPANION_SMALL_HEIGHT}`);
  }
  if (!win) return null;
  // A window still open from before is found again by its name, with its document as it was.
  if (!win.document.body.classList.contains("companion-body")) prepareCompanionDocument(document, win.document);
  return win;
}

/**
 * Bring the main window forward. In the desktop app the window may be hidden, which a page
 * cannot undo, so the app is asked through the bridge (§22).
 */
export function showCompass(): void {
  const desktop = (window as { compassDesktop?: { show?: () => void } }).compassDesktop;
  try {
    desktop?.show?.();
  } catch {
    /* the page's own focus below is what is left */
  }
  window.focus();
}
