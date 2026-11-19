---
name: verify-compass
description: Drives the real Compass web app — the practice app at http://localhost:5183, on the local practice copy — the way a person does, and keeps evidence of what was shown and what was stored. Reach for it before and after any change that could alter behavior, above all during the codebase cleanup (code and tests deleted), to prove every user-facing spec section (§5–§15) still works; and to check one behavior by hand from a plain terminal.
---

# Verify Compass

`scripts/verify/` drives Compass in a real Chromium through Playwright's library, from a plain
terminal: no test runner, no editor, no browser pane. Every step leaves a page outline, a
picture and, where it saved something, the rows read back as the signed-in account. Read
`features/README.md` before driving; each section's file there is the recipe.

The safety-net loop for a change:

1. Before changing anything, run the journeys the change touches (all, when unsure) on the
   unchanged code: `node scripts/verify/verify.mjs prove`. That is the baseline.
2. Make the change, then run the same command again. Every step that passed must still pass.
3. A step that now fails is a change in behavior. Fix the change; or, when the spec changes in
   the same pull request, change the journey and its feature file with it.
4. Put the closing lines of both runs in the pull request, and pictures for anything visual
   (`report.md` names them). Never attach `accounts.json`.

## Launch

```bash
node scripts/verify/verify.mjs launch
```

- Uses the practice copy when it is up; brings it up with `npm run practice:up` when it is down
  (and remembers that this run did, so cleanup throws it away again). It refuses, in the
  practice commands' own words, when the copy holds other migrations than the committed ones
  (`npm run practice:reset` remakes it), is not the one in `supabase/config.toml`, or the
  folder is linked to a hosted project.
- Starts the practice app from this checkout (`node scripts/practice/cli.mjs app`, the command
  behind `npm run practice:app`), so it serves the code under change, uncommitted edits
  included. Ready is its line "The practice app is at …" and an answer at
  http://localhost:5183.
- Opens a browser session at the landing page, for the commands under Drive by hand
  (`--no-browser` skips it; `--headed` shows the window).
- From nothing to usable: `practice:up` replays every migration and makes its two accounts;
  the journeys need no seed, since each signs up an account of its own.
- Refuses when anything answers at http://localhost:5183: another run's app,
  `npm run practice:app` or `npm run test:browser`. That app may serve another checkout's code,
  so it is never driven; stop it where it was started (an earlier run of this checkout:
  `cleanup`).

`prove` runs launch (without the browser session), doctor, the journeys and cleanup in one go,
and cleans up whatever happened. It takes about two minutes for all eleven journeys once the
practice copy is up.

## Doctor

```bash
node scripts/verify/verify.mjs doctor
```

Read-only. One line per check, `ok` or `NOT OK` with what to do; it exits 1 on any `NOT OK`.
Run it first whenever anything looks off.

- **checkout** — folder, branch, commit, and whether uncommitted changes are being served.
- **run** — a run is launched from this checkout (and from which commit).
- **practice copy** — up, ours, holding the committed migrations, not linked.
- **practice app** — the process this run started is alive; http://localhost:5183 answers with
  Compass; the code it serves is pointed at the practice copy and holds no CAPTCHA key.
- **browser session** — alive, on the practice app, and nothing it tried to reach was refused.
- **accounts** — the run's newest made-up accounts sign in.

## Drive

### The journeys

```bash
node scripts/verify/verify.mjs list
node scripts/verify/verify.mjs journey commitment timeline
node scripts/verify/verify.mjs journey all
```

One journey per spec section, each a file under `scripts/verify/journeys/`: auth (§5),
sidebar (§6), dashboard (§7), commitment (§8), timeline (§9), learning (§10), tasks (§11),
thoughts (§12), interview (§13), settings (§14), landing (§15). A journey signs up a fresh
made-up account (`verify-…@compass.test`), opens its own browser context, and runs its steps
in order; the first step that fails stops it, and the rest are reported "not run". A step also
fails when the page prints an error or warning the step does not expect by name, or tries to
reach any address but the practice app and the practice copy. `--headed` shows the window;
`--keep-video` keeps every journey's recording (a failed one keeps its own anyway).

### By hand

With a launched run, each command acts on the open session page and prints what it saw; an
action also saves a picture.

```bash
node scripts/verify/verify.mjs account
node scripts/verify/verify.mjs sign-in
node scripts/verify/verify.mjs setup --name "Hand test"
node scripts/verify/verify.mjs click --in .bubble-time --role button --name "Start work session"
node scripts/verify/verify.mjs fill "A task" --placeholder "Type a task, press Enter…"
node scripts/verify/verify.mjs press Enter Escape
node scripts/verify/verify.mjs snapshot --in .bubble-task
node scripts/verify/verify.mjs rows daily_tasks --select text,task_date --order sort_order
```

- Actions: `open [path]`, `reload`, `click`, `fill <text>`, `type <text>`, `press <keys…>`,
  `select <value>`, `check`, `uncheck`, `hover`,
  `drag … --to-css/--to-role/… [--to-nth N] [--position top|bottom]`, `viewport <w> <h>`,
  `motion reduce|no-preference`, `sign-in [email]`, `setup [--name N]`.
- Reads: `see`, `gone`, `count`, `text`, `value` (what a field holds), `focused`, `url`,
  `snapshot [--in css]`,
  `shot [--full]`, `console [--clear]`, `requests`, `wait <ms>`,
  `rows <table> [--select cols] [--where column=value] [--order column] [--account email]`.
- Targets, as a person finds things: `--role R --name N [--exact]`, `--placeholder P`,
  `--label L`, `--title T`, `--text T`, or `--css C`; `--in <css>` looks inside one part of the
  page and `--nth N` picks one of several. The handles each screen offers are in its feature
  file; `screens.mjs` holds the few class names the journeys rely on.
- `account` makes a made-up account and prints only its address; `sign-in` and `rows` use the
  newest such account unless given one.

### Writing a step

- Drive the user path: clicks, typing, keys and drags on what a person sees. Read stored rows
  only to prove a save (`j.rows`, as the signed-in account), never to set things up.
- Faults go in at the browser's own edge, never inside the app: `page.route` refuses a request
  the way a dropped connection does, holds one to show a waiting state, or fetches it and drops
  the reply.
- Time goes through Playwright's clock (`j.newVisit({ clock })`). It covers the whole browser
  context, so "the next morning" is a new visit, not a new tab.
- The driver sends a drag's dragover only on a move and not every one reaches the page: start a
  drag with `j.startDrag(handle)`, rest the pointer with `j.holdDrag(x, y, ms)`, and before
  trusting "nothing moved", check that the same drag without the cancel does move it.
- Name the step `<prefix>-<what>` and list it under Sub-features in its feature file;
  `node scripts/verify/verify.mjs map` fails until the map and the journeys agree.

## Evidence

Everything lands in `verify-results/<run>/`, which git ignores; cleanup never removes it.

- `report.md` — every step of every journey run in this run, passed or failed, with its files;
  the failures with their error; the steps not run. `report.json` holds the same.
- `journeys/<name>/NN-<step>.png` and `.aria.yml` — the screen and its accessibility outline as
  the step ended; `NN-<step>-<label>.*` for the moments in between (a waiting button, an open
  dialog); `NN-<step>.rows.json` for the rows read back.
- `journeys/<name>/console.log` (errors and warnings the page printed, by step),
  `error-answers.log` (every answer of 400 or more: status, method, path and error code — no
  bodies), `journey.webm` when the journey failed or `--keep-video` asked for it, and
  `journey.json`.
- `interactive/NNN-<command>.png` and `.aria.yml` for the commands driven by hand; `app.log`,
  `session.log` and `practice-copy.log` for the processes the run started; `run.json`.
- `accounts.json` holds the run's made-up passwords. It stays in the folder; never paste it.

What counts as proof:

- The user's own path, not a setter or a test-only endpoint.
- The action and the state it leaves: a picture alone is not proof of a save; the rows read back
  are.
- What a step says nothing happened (nothing sent, nothing stored, nothing moved) is checked by
  watching for it, and the check is shown able to fail.
- No reset link and no session token is ever written to evidence: the reset journey opens the
  link from the practice inbox without printing it.

## Cleanup

```bash
node scripts/verify/verify.mjs cleanup
```

- Stops the browser session and the practice app this run started, by the process numbers it
  recorded, and only while each still runs the command it was started with; never by name.
- Removes the run's accounts from the practice copy, and with them every row they owned.
  `--every-verify-account` also sweeps accounts that runs cut off before cleanup left behind.
- Throws the practice copy away only when this run brought it up (`--keep-copy` keeps it).
- Prints where the evidence is; the folder stays.

## Rules

- Only the practice app and the practice copy are ever reached: the page's every request to any
  other address is refused and fails the step. Never point the harness at
  http://localhost:5173 or the live site; the practice accounts exist nowhere else.
- One run at a time on a machine: the practice app's address and the practice copy are shared.
  Do not run it while `npm run test:browser`, `npm run test:db` or `npm run practice:check`
  runs; the rolled-back checks count rows, and a journey's writes would read as rows left
  behind.
- The Supabase tool's output is never shown: the harness asks it only for the practice copy's
  address and public key, through the practice commands.
- Every command stops itself at a time limit (a journey run after 35 minutes, a command by hand
  after 90 seconds).

## Helpers

All under `scripts/verify/`, run with `node`:

- `verify.mjs` — the commands above; `node scripts/verify/verify.mjs` alone prints them.
- `journey.mjs` — runs journeys: the guarded browser context, the shared user paths (`signIn`,
  `setUp`, `depth`, `tickEveryPhase`, `startDrag`, `holdDrag`, `newVisit`), evidence and the
  report.
- `journeys/<name>.mjs` — one journey per spec section, its steps in order.
- `screens.mjs` — how the screens are found: roles, names, labels, placeholders, and the few
  class names that have no better handle.
- `session.mjs` — the browser session `launch` starts, answering on 127.0.0.1 only.
- `lib.mjs` — the practice copy, the run's accounts and rows, the practice inbox, processes.

What `browser/` does that this does not: those Playwright checks are part of the CI run
(`npm run test:browser`, spec §19), retried once on GitHub, reported by the practice command
with a failure's picture and recording; they use the two recorded practice accounts. This
harness is not in CI, uses accounts of its own, keeps evidence for every step, and covers every
section from §5 to §15.

Keep the map honest as the app changes with `/pstack:maintain-verification-skill`.
