## §22 The desktop app

Code: `desktop/main.ts`, `desktop/preload.cjs`, `desktop/dataFile.ts`, `desktop/menuBar.ts`, `desktop/notices.ts`, `desktop/preferences.ts`, `desktop/appFiles.ts`, `desktop/build.mjs`, `desktop/package.config.mjs`, `desktop/icons/make-icons.mjs`, `.github/workflows/desktop-download.yml`, `src/lib/supabase.ts`, `src/lib/localClient.ts` · Keeps: I19, I20, I21

Compass also runs as a desktop app, built with Electron: the same page in a window of its
own, with its data in a file on the computer and a clock in the menu bar, keys that capture a
thought from anywhere, and one quiet note at the day's goal. Everything a person
does in the window is the behavior of §6 to §14, unchanged; this section is what the desktop
app adds around the page. It has no accounts and talks to no server (I19, I20).

### Running it

`npm run desktop` builds the app into `desktop/out/` and starts it. The build
(`desktop/build.mjs`) makes three things: the page, as `npm run build` makes it but with the
three `VITE_` values empty and no env file read, into `desktop/out/app/`; the main process,
`desktop/main.ts` with what it imports, as the one file `desktop/out/main.js`; and beside
them, copied as they are, `preload.cjs` and the menu-bar icons. Vite does both builds, the
second as a build for Node. The desktop app adds two packages, both development
dependencies: Electron, and electron-builder, which makes the download (below); nothing the
page ships changes.

### The window

One window, 1280 by 832, no smaller than 960 by 640, titled "Compass". It shows one address
and no other, `compass://app/`, a scheme of the app's own that the main process answers from
`desktop/out/app/`, and registers before the app is ready as a standard, secure scheme the
page may fetch its own files from, so `'self'` in the policy and the page's own storage work
there as at a web address: the path names the file, `/` is `index.html`, and an address that is not
the app's, or that names anything outside that folder, finds nothing (`fileFor` in
`desktop/appFiles.ts`). Every file goes out with a policy made from the hosted app's (§17), with every
other host taken out and tighter where the desktop app needs less (it connects to nothing,
posts no form and sends no referrer): `default-src 'self'`; `script-src 'self'`; `style-src 'self'
'unsafe-inline'`; `font-src 'self'`; `img-src 'self' data:`; `connect-src 'none'`;
`frame-src 'none'`; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`;
`form-action 'none'`; with `X-Content-Type-Options: nosniff` and `Referrer-Policy:
no-referrer`. So the page loads its own files and connects to nothing.

The page is a web page and no more (I20): context isolation and the sandbox are on and Node
is off, so it has no `require`, no `process` and no disk. A link to a web address, `http` or
`https`, opens in the person's browser; the window itself never leaves the app's address,
and any other kind of link goes nowhere. The one window the page may open is its companion
(below). The page's own storage holds what it holds in a
browser, the active project's id (§3), and not the tables.

On a Mac, closing the window hides it and leaves Compass running in the menu bar; the Dock
icon or the menu's "Open Compass" shows it again, and Quit ends it. On other systems closing
the window ends the app. A second copy of the app does not start: it hands over to the first,
which shows its window, and ends.

### The data file

The tables of §3 are one file, `compass-data.json`, in the app's folder under the person's
application data, which on a Mac is `~/Library/Application Support/Compass/`. Its text is the
local database's (§3): `{"format": "compass-local-database", "version": 1, "tables": {…}}`.
The main process is its only reader and writer (I20), through the holder in
`desktop/dataFile.ts`, which is a backend of the local client (§21) over the same pure
engine the browser's backend uses.

- The file is read once, at the first request, and the tables are held from then on; a
  request is run against the held tables and, when it changed a row, the whole text is
  written before the request is answered. A read writes nothing, and there is no file until
  the first save.
- A save writes a second file beside the first, `compass-data.json.saving`, readable by its
  owner alone, and renames it over the first, so a save cut short leaves the old file whole.
- A file that cannot be read, or that is not this format and version, is left exactly as it
  is: every request is refused with `COMPASS_LOCAL_UNREADABLE`, and the file is read again
  at the next request, so mending or removing it needs no restart. A save the disk refuses
  changes nothing and is answered with `COMPASS_LOCAL_NOT_SAVED`. A request the local
  database throws on, something that is not a request among them, is refused with
  `COMPASS_LOCAL_BAD_REQUEST`, a code the file's holder alone gives. The page shows each as
  it shows any refused read or save (§2, §3).
- A check starts the app with `COMPASS_DATA_FOLDER` naming a folder of its own, which
  replaces the application-data folder, so it never opens the person's file.

### The companion's window

The companion (§23) is the same in the desktop app as in a browser, drawn by the page into a
window the page opens. The app's part is the window. The main window's open handler allows
one window and no other: an empty one, at `about:blank`, opened under the name
`compass-companion` (`isTheCompanion` in `desktop/appFiles.ts`), which is how the page asks
for it (§23). It is given the app's own shape for it (`COMPANION_WINDOW`), whatever the page
asked: 300 by 250, no smaller than 240 by 160, titled "Compass Companion", above other
windows, never full screen, never maximized, and with no entry of its own in a taskbar.
When it has been made it is set to float above other apps' windows too and, on a Mac, to
show on every desktop and beside a full-screen app. The page can resize it, which is how it
grows for the summary. It is a window of the page's, not a page: its document stays at
`about:blank` and is given no bridge, it may navigate nowhere, and it may open nothing; a
link to a web address in it opens in the person's browser. Since it shares the page, it
needs no channel for the data.

On a Mac, closing the main window hides it and leaves the companion where it is, with its
clock ticking and its saves going to the file; the companion's **Open Compass** shows the
main window again through the bridge's `show`. Closing the companion closes that window
alone. Where closing the main window ends the app, the companion goes with it.

### The bridge

The page reaches the app by one way. `desktop/preload.cjs` gives it `window.compassDesktop`
with three functions. `send(request)` hands a request of the local client (§21), as
plain data, to the main process on the channel `compass:database` and answers the answer.
`show()` asks, on the channel `compass:show-window`, for the main window to be shown, as the
menu's "Open Compass" shows it; it carries nothing and answers nothing, and
`src/companion/companionWindow.ts` is its one caller (§23).
`onCapture(listener)` is the one way the app speaks to the page: the listener is called, with
nothing, each time the app says on the channel `compass:capture` that a thought is to be
captured (below), and the function answers the way to stop listening;
`src/companion/companionWindow.ts` is its one caller too.
The main process answers only a page at the app's own address, on either channel the page
sends on, and sends on the third to the main window's page alone. In the page,
`getSupabase()` looks for the bridge first: when it is there the client is
`createLocalClient(desktopBackend(window.compassDesktop))`, whatever the two Supabase values
are, so the desktop app is never over a Supabase project (I19). A request whose bridge call
fails, because the main process refuses the sender or nothing listens on the channel, is
answered in the page with `COMPASS_LOCAL_UNREACHABLE` and not thrown. There is no time limit:
a request the main process has not answered yet stays waiting (§7).

### The capture keys

Option, Shift and T on a Mac, Alt, Shift and T elsewhere (`CAPTURE_KEYS`, Electron's
`Alt+Shift+T`), pressed in any app, ask for a thought to be captured. The app registers them
with the system when it starts and gives them back when it quits. When another program
already holds them the keys do nothing here, and the menu's **Capture a Thought** does the
same thing.

Either way the main process tells the page (`onCapture`, above), and the dashboard opens the
companion, or brings it forward, with its summary open and the cursor in its thought box
(§23); what is typed and entered there is a thought like any other (§12). The main process
also brings the companion to the front itself, since a page cannot take the keyboard from
another app: on a Mac it brings the app forward, an open companion is shown and focused, and
a companion just made is focused as it is made. A main window hidden on a Mac is told like
any other and stays hidden. With no main window at all the keys open one and nothing more,
and on a screen with no dashboard, the setup, nothing listens.

### The note at the goal

The app sends one notification and no other: the day's goal reached. It is the operating
system's own notification, silent, titled with the project's name ("Compass" when it has
none) and reading "You've reached today's goal of 2h.", the hours written as the cards
write them (`fmtH`, §21). A press on it shows the main window. It carries the project's name
and the goal and nothing else a person typed (§17).

The rule is `goalNotice(before, now)` in `desktop/notices.ts`, over two readings of the
running clock (`clockReading` in `desktop/menuBar.ts`: the project, the local day, today's
seconds on it with the running session counted, its daily goal in seconds, and the instant of
the reading; no reading when no clock runs today). The note is sent only when the crossing is
seen and the clock made it. All of these hold: the look before was at the same project on the
same day; its seconds were under this look's goal; this look's seconds are at the goal or
past it; and the seconds grew by no more than the time that passed between the two looks,
with two seconds' slack. So opening the app or starting a clock with the goal already behind
says nothing; a goal lowered under the time already done says nothing; a project with no
goal, or a clock stopped, sends none; and time typed in by hand sends none, since it moves
the total in one step, also when the save of it is looked at half done, with the new total
and the running session both still counted. A look that comes late, as after the computer
slept with the clock running, still sends it. It is once for each crossing the clock makes,
not once a day: after a total typed lower, or a goal raised, the next crossing says it again.

The app looks whenever it works out the menu bar's text: when the file is first read, after
every save, and every five seconds. It keeps the look before in memory alone, and keeps it
while the note is turned off too, so turning the note on never announces a crossing that
happened while it was off. Every look takes the place of the one before, a look with no
reading too, so a clock stopped and started again begins from nothing.

The note can be turned off with the menu's **Tell Me When I Reach Today's Goal**, which is
ticked at first. That choice is the one thing in the app's preferences
(`desktop/preferences.ts`): a file of its own, `compass-preferences.json`, beside the data
file and written as the data file is, holding `{"format": "compass-preferences", "version":
1, "goalNotice": true}`. It is read once, when first asked; a file that is missing, cannot be
read or is not understood gives the default, on; nothing is written until the tick is
changed; and a change the disk refuses still holds until the app closes. Each note is also
announced inside the main process, on Electron's `app` as the event `compass-goal-notice`,
which is how the check hears a note on a machine that shows none.

### The menu bar

An icon sits in the menu bar while the app runs: a ring with a needle, a template image the
Mac tints for a light or a dark bar (`desktop/icons/`, drawn by `make-icons.mjs`). Beside it,
on a Mac, is the clock (`clockTitle` in `desktop/menuBar.ts`): when a work session is running
that was started today, today's time on that session's project, the running session counted
to the minute, as hours and minutes, `0:25` or `2:30`, seconds dropped; otherwise nothing. A
session left running from an earlier day shows nothing: the page closes it at that day's end
when it next reads the time (§8), and the main process changes nothing in the data file of its own accord. The text is empty until the file is first read, and is
worked out from the held tables when it is first read, after every save and every five
seconds. On every system the same text is in the icon's tooltip, "Compass · 0:25 today", and
the tooltip is "Compass" when no clock runs; other systems have the tooltip alone.

The icon's menu, in order (`menuLines`): **Open Compass**, which shows the window; **Capture
a Thought**, with the capture keys beside it when the system gave them to the app; a
separator; **Tell Me When I Reach Today's Goal**, a tick; **Open at Login**, a tick; a
separator; and **Quit Compass**. Open at Login is the operating system's own setting for an installed app:
pressed, it flips the setting and the tick follows. Run from the source the line is shown
and cannot be pressed, since the setting would open the bare Electron program.

### The app as downloaded

`npm run desktop:package` builds the app as above and hands it to electron-builder with the
settings in `desktop/package.config.mjs`, which writes into `desktop/release/`, a folder git
does not keep. What goes into the package is `package.json`, whose `main` names
`desktop/out/main.js`, and `desktop/out/`, in one archive, and nothing else: no package from
`node_modules`, since the main process is one file and the page is already bundled.

On a Mac it makes `Compass.app`, one app for Apple Silicon and Intel alike, with the id
`io.github.xingzhic-starlight.compass`, in the productivity category, and as one file to
download, `Compass-<version>-mac.dmg`, the version being `package.json`'s; it is about 230
MB, since it carries Electron twice, once for each kind of Mac. Its icon is `desktop/icons/appIcon.png`, drawn by `make-icons.mjs` with
the menu-bar icons: the same ring, its needle in the Time accent, on a rounded square of the
sidebar's cream (DS §2). The app is signed ad hoc, with no Apple Developer certificate, and
is not notarized: an Apple Silicon Mac starts no program that is not signed at all, and an
ad hoc signature is the least it accepts. So macOS stops the first open of a downloaded copy
and the person allows it once, in System Settings under Privacy & Security (README). On
Linux the same settings make only a folder, `desktop/release/linux-unpacked/`, which is
there for the check below; there is no download for Linux or Windows, where the app runs
from the source.

The downloaded app is the same program as the one run from the source. It has the same
name, so the same data folder and the same data file, and the one-copy rule (I20) holds
between the two: with one open, the other hands over to it and ends. Two things differ.
Open at Login can be pressed (below). And nothing in it looks for a newer version or
fetches one: an update is a new download, put in the old one's place, and the data file
stays where it is.

The download is made on GitHub, by `.github/workflows/desktop-download.yml`. Its first job
runs on a Mac: `npm ci`, `npm run desktop:package`, then it checks that the app's signature
is ad hoc and covers every file and that the program is made for both kinds of Mac, runs
the desktop check on the packaged app, writes the file's SHA-256 sum to
`SHA256SUMS.txt` and keeps both on the run's page. On a pull request electron-builder signs
nothing unless told to, so the job tells it to (`CSC_FOR_PULL_REQUEST`): the signature needs
no certificate and no secret, and the app checked is then the app released. It runs on a pull request that
changes `desktop/`, `package.json`, `package-lock.json` or the workflow itself, and
publishes nothing. Started by hand on `main`, a second job then drafts a GitHub release
named `v<version>` with the two files attached, and refuses when that version already has
a release. A draft is seen by the repository's owners alone; the release is public, and its
tag made, only when a person publishes it on GitHub. Nothing publishes one by itself.

### What checks it

The pure parts each have tests in the suite (§19): the file's holder over a pretend disk,
the menu bar's text and menu, the running clock's reading, the note's rule, the preferences'
holder over a pretend disk, the files the window is handed and the policy they carry, which
window the page may open and its shape, and
in `src/lib/` the choice of the bridge and the bridge's backend. `npm run test:desktop`
builds the app, starts the real one with Playwright on a data folder of its own and drives
its window (`desktop/the-desktop-app.desktop.ts`): a first open shows the setup at
`compass://app/` with no sign-in; a project, a task and a running clock are in the file,
the page's storage holds no tables and Settings says "Saved on this device" (§14); opened again, the same project, task and running clock
are there; the companion opens from the sidebar as a second window at `about:blank`, it
alone is above the others and its document has no bridge, a press on the clock in either
window moves the other, its summary shows the phase and the focus, a task ticked and a
thought typed there are in the file and on the dashboard, a task added on the dashboard
appears in it, and with the main window hidden its Open Compass shows it again; the app holds the capture keys, and told that a thought is to be
captured the page opens the companion with its summary open and the cursor in the thought
box, what is typed there is in the file, and asked again it opens no second window; with the
running clock's start moved so the goal is ten seconds on, the app announces the note for
"Garden" once, and with the preferences file saying off it announces none; the page has the bridge's three functions and no Node, a request to a web address
from the page is refused, and a second copy opens no window. On a machine with no screen it
runs under `xvfb-run`, and on Linux it starts the app with Chromium's sandbox off, which
test machines there lack the setting for. With `COMPASS_DESKTOP_APP` naming a packaged
app's program, the same check drives that program in place of the build in `desktop/out/`
(started as `npx playwright test -c desktop/playwright.config.ts`, which builds nothing):
this is how the download's workflow checks the Mac app, and how the Linux folder is checked
by hand. The menu bar's icon, its text on a real Mac, the
hiding window, Open at Login, the companion staying above other apps, on every desktop
and beside a full-screen app, the capture keys pressed in another app, the notification
as the system shows it, and the first open of a downloaded copy, with what macOS asks
there, are checked by no test: they are the operating system's, and are tried by hand on a
Mac. The drafting of a release runs only when started by hand on `main`.
