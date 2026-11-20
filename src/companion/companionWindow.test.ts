import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPANION_NAME,
  COMPANION_SMALL_HEIGHT,
  COMPANION_WIDTH,
  followTheme,
  onCaptureAsked,
  openCompanionWindow,
  prepareCompanionDocument,
  showCompass,
} from "./companionWindow";

type Extras = { documentPictureInPicture?: unknown; compassDesktop?: unknown };

function emptyWindow(): Window {
  const doc = document.implementation.createHTMLDocument("");
  return { document: doc } as unknown as Window;
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  delete (window as Extras).documentPictureInPicture;
  delete (window as Extras).compassDesktop;
  document.head.querySelectorAll("style[data-check]").forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("making the companion's document ready", () => {
  it("gives it a title, the page's base address, a copy of every stylesheet's rules, and the companion's body class", () => {
    const style = document.createElement("style");
    style.setAttribute("data-check", "");
    style.textContent = ".bubble { padding: 32px; } .glance-hero { font-size: 31px; }";
    document.head.appendChild(style);

    const target = document.implementation.createHTMLDocument("");
    prepareCompanionDocument(document, target);

    expect(target.title).toBe("Compass Companion");
    expect(target.querySelector("base")!.getAttribute("href")).toBe(document.baseURI);
    const copied = [...target.querySelectorAll("style")].map((el) => el.textContent).join("\n");
    expect(copied).toContain(".bubble");
    expect(copied).toContain(".glance-hero");
    expect(target.body.classList.contains("companion-body")).toBe(true);
  });

  it("links a stylesheet whose rules cannot be read", () => {
    const unreadable = {
      href: "https://example.test/app.css",
      get cssRules(): CSSRuleList {
        throw new Error("not readable");
      },
    };
    const source = { baseURI: "https://example.test/", documentElement: { lang: "en" }, styleSheets: [unreadable] };
    const target = document.implementation.createHTMLDocument("");
    prepareCompanionDocument(source as unknown as Document, target);
    expect(target.querySelector("link")!.getAttribute("href")).toBe("https://example.test/app.css");
  });
});

describe("the companion wearing the dashboard's theme", () => {
  /** Lets the page's watchers hear a change just made. */
  const heard = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("takes the page's mark as it is, and no mark when the page has none", () => {
    const target = document.implementation.createHTMLDocument("");
    const stop = followTheme(document, target);
    expect(target.documentElement.hasAttribute("data-theme")).toBe(false);
    stop();

    document.documentElement.setAttribute("data-theme", "sand");
    const stopAgain = followTheme(document, target);
    expect(target.documentElement.getAttribute("data-theme")).toBe("sand");
    stopAgain();
  });

  it("follows the mark put on and taken off while it is open", async () => {
    const target = document.implementation.createHTMLDocument("");
    const stop = followTheme(document, target);

    document.documentElement.setAttribute("data-theme", "sand");
    await heard();
    expect(target.documentElement.getAttribute("data-theme")).toBe("sand");

    document.documentElement.removeAttribute("data-theme");
    await heard();
    expect(target.documentElement.hasAttribute("data-theme")).toBe(false);
    stop();
  });

  it("stops following once told to", async () => {
    const target = document.implementation.createHTMLDocument("");
    followTheme(document, target)();

    document.documentElement.setAttribute("data-theme", "sand");
    await heard();
    expect(target.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("opening the companion's window", () => {
  it("asks for a picture-in-picture window where the browser has them", async () => {
    const win = emptyWindow();
    const requestWindow = vi.fn(async () => win);
    (window as Extras).documentPictureInPicture = { requestWindow };
    const open = vi.spyOn(window, "open");

    expect(await openCompanionWindow()).toBe(win);
    expect(requestWindow).toHaveBeenCalledWith({ width: COMPANION_WIDTH, height: COMPANION_SMALL_HEIGHT });
    expect(open).not.toHaveBeenCalled();
    expect(win.document.body.classList.contains("companion-body")).toBe(true);
  });

  it("opens an empty window under the companion's name otherwise, and when picture-in-picture is refused", async () => {
    const win = emptyWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(win);
    expect(await openCompanionWindow()).toBe(win);
    expect(open).toHaveBeenCalledWith("", COMPANION_NAME, "popup=yes,width=300,height=250");

    (window as Extras).documentPictureInPicture = {
      requestWindow: async () => {
        throw new Error("refused");
      },
    };
    expect(await openCompanionWindow()).toBe(win);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("in the desktop app it is always the named window, which the app knows, picture-in-picture or not", async () => {
    const win = emptyWindow();
    const requestWindow = vi.fn(async () => emptyWindow());
    (window as Extras).documentPictureInPicture = { requestWindow };
    (window as Extras).compassDesktop = { send: vi.fn(), show: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(win);

    expect(await openCompanionWindow()).toBe(win);
    expect(requestWindow).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("", COMPANION_NAME, "popup=yes,width=300,height=250");
  });

  it("a window found again by its name keeps the document it has", async () => {
    const win = emptyWindow();
    vi.spyOn(window, "open").mockReturnValue(win);
    await openCompanionWindow();
    const styles = win.document.querySelectorAll("style, base").length;
    await openCompanionWindow();
    expect(win.document.querySelectorAll("style, base").length).toBe(styles);
  });

  it("answers null when the browser opens nothing", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(await openCompanionWindow()).toBeNull();
  });
});

describe("bringing the main window forward", () => {
  it("focuses the page, and in the desktop app asks through the bridge", () => {
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    showCompass();
    expect(focus).toHaveBeenCalledTimes(1);

    const show = vi.fn();
    (window as Extras).compassDesktop = { send: vi.fn(), show };
    showCompass();
    expect(show).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("a bridge that throws still leaves the page's own focus", () => {
    const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    (window as Extras).compassDesktop = {
      show: () => {
        throw new Error("gone");
      },
    };
    expect(() => showCompass()).not.toThrow();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("hearing the desktop app ask for a thought", () => {
  it("listens through the bridge, and stops with what the bridge answered", () => {
    const stop = vi.fn();
    const onCapture = vi.fn((_heard: () => void) => stop);
    (window as Extras).compassDesktop = { send: vi.fn(), show: vi.fn(), onCapture };
    const listener = vi.fn();

    const stopListening = onCaptureAsked(listener);
    expect(onCapture).toHaveBeenCalledWith(listener);
    stopListening();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("in a browser, or with a bridge that has no such way or throws, nothing listens and stopping does nothing", () => {
    expect(() => onCaptureAsked(vi.fn())()).not.toThrow();
    (window as Extras).compassDesktop = { send: vi.fn(), show: vi.fn() };
    expect(() => onCaptureAsked(vi.fn())()).not.toThrow();
    (window as Extras).compassDesktop = {
      onCapture: () => {
        throw new Error("gone");
      },
    };
    expect(() => onCaptureAsked(vi.fn())()).not.toThrow();
  });
});
