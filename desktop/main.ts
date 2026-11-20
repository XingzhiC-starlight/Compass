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
import { app, BrowserWindow, ipcMain, Menu, nativeImage, protocol, shell, Tray } from "electron";
import { randomId } from "../src/lib/transforms";
import {
  APP_HEADERS,
  APP_ORIGIN,
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
import { clockTitle, menuLines } from "./menuBar";

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
let tray: Tray | null = null;
let quitting = false;

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
  window.webContents.on("did-create-window", (companion) => {
    // Above other apps' windows too, and on a Mac on every desktop and beside a full-screen app.
    companion.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") {
      companion.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    // The page draws into it; it goes nowhere and opens nothing itself.
    companion.webContents.setWindowOpenHandler(({ url }) => {
      if (opensInTheBrowser(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    companion.webContents.on("will-navigate", (event) => event.preventDefault());
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

function refreshMenuBar(title: string): void {
  if (!tray) return;
  // The text beside the icon is the Mac's; elsewhere the clock is in the tooltip.
  if (process.platform === "darwin") tray.setTitle(title ? ` ${title}` : "");
  tray.setToolTip(title ? `Compass · ${title} today` : "Compass");
}

function buildMenu(): Menu {
  const lines = menuLines({ installed: app.isPackaged, opensAtLogin: app.getLoginItemSettings().openAtLogin });
  return Menu.buildFromTemplate(
    lines.map((line) => {
      if (line.kind === "line") return { type: "separator" as const };
      return {
        label: line.label,
        type: line.kind === "tick" ? ("checkbox" as const) : ("normal" as const),
        checked: line.ticked,
        enabled: line.enabled ?? true,
        click: () => {
          if (line.does === "open") showWindow();
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
  app.on("activate", showWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  void app.whenReady().then(() => {
    const dataFile = path.join(app.getPath("userData"), "compass-data.json");
    const backend = fileBackend(
      diskFiles({ ...fs, dirname: path.dirname }),
      dataFile,
      { now: () => new Date().toISOString(), newId: randomId },
      (tables) => refreshMenuBar(clockTitle(tables, new Date())),
    );

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

    const icon = nativeImage.createFromPath(ICON);
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setContextMenu(buildMenu());
    refreshMenuBar("");
    // The minutes move on while a clock runs, with no save to say so.
    setInterval(() => refreshMenuBar(clockTitle(backend.held(), new Date())), 5000);

    showWindow();
  });
}
