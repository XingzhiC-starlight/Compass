/**
 * The desktop app's main process (spec §22). It is the glue and nothing more: what it decides
 * is in the pure modules beside it (`appFiles.ts`, `menuBar.ts`) and in the file's holder
 * (`dataFile.ts`), each with its own tests.
 *
 * One window shows the built app from the app's own folder; the page is a web page with one
 * extra, the bridge of `preload.cjs`, and has no Node and no disk. The data is one file in the
 * person's application-data folder, and this process is its only reader and writer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, protocol, shell, Tray } from "electron";
import { randomId } from "../src/lib/transforms";
import {
  APP_HEADERS,
  APP_ORIGIN,
  CAPTURE_CHANNEL,
  CAPTURE_KEYS,
  COMPANION_WINDOW,
  DATABASE_CHANNEL,
  SHOW_CHANNEL,
  contentType,
  fileFor,
  isTheApp,
  isTheCompanion,
  opensInTheBrowser,
} from "./appFiles";
import { diskFiles, fileBackend } from "./dataFile";
import { clockReading, clockTitle, menuLines, type ClockReading } from "./menuBar";
import { goalNotice, type Notice } from "./notices";
import { preferencesHolder, type PreferencesHolder } from "./preferences";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The built app, beside this file once built (`desktop/build.mjs`). */
const APP_FOLDER = path.join(HERE, "app");
const PRELOAD = path.join(HERE, "preload.cjs");
const ICON = path.join(HERE, "icons", "menuBarTemplate.png");

app.setName("Compass");
// A check hands the app a folder of its own, so it never opens the person's data.
if (process.env.COMPASS_DATA_FOLDER) app.setPath("userData", process.env.COMPASS_DATA_FOLDER);

protocol.registerSchemesAsPrivileged([
  { scheme: "compass", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let window: BrowserWindow | null = null;
let companion: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let preferences: PreferencesHolder | null = null;
/** Whether the system let the app have the capture keys. */
let captureKeysHeld = false;
/** The clock as it was at the look before this one, for the note at the goal. */
let lastReading: ClockReading | null = null;
/** The note showing, held so it is not cleared away while it shows. */
let shown: Notification | null = null;

function showWindow(): void {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  window = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 960,
    minHeight: 640,
    title: "Compass",
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.once("ready-to-show", () => window?.show());

  // The window shows the app and nothing else: the one window the page may open is its own
  // companion, a link to the web opens in the person's browser, and anything else goes nowhere.
  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isTheCompanion(url, frameName)) {
      return { action: "allow", overrideBrowserWindowOptions: { ...COMPANION_WINDOW } };
    }
    if (opensInTheBrowser(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("did-create-window", (made) => {
    companion = made;
    made.on("closed", () => {
      if (companion === made) companion = null;
    });
    // Above other apps' windows too, and on a Mac on every desktop and beside a full-screen app.
    made.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") {
      made.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    // The page draws into it; it goes nowhere and opens nothing itself.
    made.webContents.setWindowOpenHandler(({ url }) => {
      if (opensInTheBrowser(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    made.webContents.on("will-navigate", (event) => event.preventDefault());
    // Opened for a thought, it is where the next key press goes.
    made.focus();
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isTheApp(url)) return;
    event.preventDefault();
    if (opensInTheBrowser(url)) void shell.openExternal(url);
  });

  // On a Mac, closing the window leaves Compass in the menu bar with its clock.
  window.on("close", (event) => {
    if (quitting || process.platform !== "darwin") return;
    event.preventDefault();
    window?.hide();
  });
  window.on("closed", () => {
    window = null;
  });

  void window.loadURL(`${APP_ORIGIN}/`);
}

/**
 * A thought is to be captured, asked for by the keys or by the menu: the page is told, and
 * opens the companion ready for typing (spec §23). The companion is brought to the front
 * here, since a page cannot take the keyboard from another app.
 */
function capture(): void {
  if (!window || window.isDestroyed()) {
    showWindow();
    return;
  }
  window.webContents.send(CAPTURE_CHANNEL);
  if (process.platform === "darwin") app.focus({ steal: true });
  if (companion && !companion.isDestroyed()) {
    companion.show();
    companion.focus();
  }
}

/** Show the note, quietly; a press on it opens Compass. */
function tell(notice: Notice): void {
  // Said on the app itself too, so a check can hear a note the test machine cannot show.
  app.emit("compass-goal-notice", notice);
  if (!Notification.isSupported()) return;
  shown = new Notification({ title: notice.title, body: notice.body, silent: true });
  shown.on("click", showWindow);
  shown.show();
}

/** One look at the clock: the menu bar's text, and the note when the goal was just reached. */
function lookAtTheClock(tables: Parameters<typeof clockReading>[0]): void {
  const now = new Date();
  const reading = clockReading(tables, now);
  refreshMenuBar(clockTitle(tables, now));
  const notice = preferences?.get().goalNotice ? goalNotice(lastReading, reading) : null;
  lastReading = reading;
  if (notice) tell(notice);
}

function refreshMenuBar(title: string): void {
  if (!tray) return;
  // The text beside the icon is the Mac's; elsewhere the clock is in the tooltip.
  if (process.platform === "darwin") tray.setTitle(title ? ` ${title}` : "");
  tray.setToolTip(title ? `Compass · ${title} today` : "Compass");
}

function buildMenu(): Menu {
  const lines = menuLines({
    installed: app.isPackaged,
    opensAtLogin: app.getLoginItemSettings().openAtLogin,
    goalNotice: preferences?.get().goalNotice ?? true,
    captureKeys: captureKeysHeld ? CAPTURE_KEYS : null,
  });
  return Menu.buildFromTemplate(
    lines.map((line) => {
      if (line.kind === "line") return { type: "separator" as const };
      return {
        label: line.label,
        type: line.kind === "tick" ? ("checkbox" as const) : ("normal" as const),
        checked: line.ticked,
        enabled: line.enabled ?? true,
        ...(line.keys ? { accelerator: line.keys, registerAccelerator: false } : {}),
        click: () => {
          if (line.does === "open") showWindow();
          if (line.does === "capture") capture();
          if (line.does === "goal-notice" && preferences) {
            preferences.set({ goalNotice: !preferences.get().goalNotice });
            tray?.setContextMenu(buildMenu());
          }
          if (line.does === "quit") app.quit();
          if (line.does === "open-at-login") {
            app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin });
            tray?.setContextMenu(buildMenu());
          }
        },
      };
    }),
  );
}

if (!app.requestSingleInstanceLock()) {
  // The file has one writer: a second copy hands over to the first and ends.
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("activate", showWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  void app.whenReady().then(() => {
    const dataFile = path.join(app.getPath("userData"), "compass-data.json");
    const disk = diskFiles({ ...fs, dirname: path.dirname });
    preferences = preferencesHolder(disk, path.join(app.getPath("userData"), "compass-preferences.json"));
    const backend = fileBackend(disk, dataFile, { now: () => new Date().toISOString(), newId: randomId }, lookAtTheClock);

    protocol.handle("compass", async (request) => {
      const file = fileFor(request.url, APP_FOLDER, path.join);
      if (!file) return new Response("Not found", { status: 404, headers: APP_HEADERS });
      try {
        const body = await fs.promises.readFile(file);
        return new Response(new Uint8Array(body), { headers: { ...APP_HEADERS, "Content-Type": contentType(file) } });
      } catch {
        return new Response("Not found", { status: 404, headers: APP_HEADERS });
      }
    });

    // Only the app's own page may ask for the data.
    ipcMain.handle(DATABASE_CHANNEL, (event, request) => {
      if (!isTheApp(event.senderFrame?.url)) throw new Error("only Compass's own page may ask for its data");
      return backend.send(request);
    });

    // The page may ask for its main window to be shown, which a hidden window cannot do itself.
    ipcMain.on(SHOW_CHANNEL, (event) => {
      if (isTheApp(event.senderFrame?.url)) showWindow();
    });

    // The keys work from any app. When another program holds them the menu's line still does.
    captureKeysHeld = globalShortcut.register(CAPTURE_KEYS, capture);

    const icon = nativeImage.createFromPath(ICON);
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setContextMenu(buildMenu());
    refreshMenuBar("");
    // The minutes move on while a clock runs, with no save to say so.
    setInterval(() => lookAtTheClock(backend.held()), 5000);

    showWindow();
  });
}
