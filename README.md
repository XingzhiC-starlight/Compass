# Compass

This is the open-source copy of Compass, under the MIT license (`LICENSE`). It is connected
to no host and no database. Run as it is, with no `.env.local`, it needs no account and
keeps everything you write on your own device (I19): `npm install`, `npm run dev`, and open
http://localhost:5173. The addresses and the deployment described below are those of the
closed hosted service, kept as the record of how it ran, and `your-project-ref` stands
wherever that service's Supabase project was named.

Compass is a calm focus and pacing dashboard for solo builders. A one-time interview sets a
project's daily time commitment, its phases and what to learn; a two-state dashboard then
tracks logged time, the timeline, the learning focus, daily tasks and a thought log, across
multiple projects, synced through Supabase. The service has closed: production serves only a closing page, at
https://builder-compass.vercel.app (spec §20).

## Running it

- Node 22.22.2 or newer, 24.15 or newer, or 26 (the range jsdom accepts). `npm install` — if it fails with an `~/.npm` EACCES error, use
  `npm install --cache /tmp/compass-npm-cache`.
- With no `.env.local`, Compass opens straight on the setup, with no sign-in, and keeps its
  data in the browser's storage for that address (spec §3): the same browser at the same
  address finds it again, and clearing the site's data deletes it. Nothing is sent anywhere.
- To run it with accounts on a Supabase project of your own instead, copy `.env.example` to
  `.env.local` and fill in `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, both or neither: with one alone, or one left empty, the page stays
  blank and the browser's console says both are needed (both public by design — Row-Level Security limits what they can
  do) and `VITE_TURNSTILE_SITE_KEY` (the public Turnstile site key; email auth needs it because
  CAPTCHA is enabled on the Supabase project — the widget renders only when the key is
  present). The Turnstile secret key lives only in Supabase.
- `npm run desktop` builds and starts the desktop app (spec §22): the same Compass in a
  window of its own, with its data in a file on your computer and a clock in the menu bar.
  It needs nothing but `npm install`, has no accounts and uses no network. There is no
  installer yet: it runs from the source. `npm run test:desktop` starts the real app and
  drives it (on Linux with no screen, `xvfb-run -a npm run test:desktop`), and
  `npm run typecheck:desktop` type-checks its code.
- `npm run dev` serves http://localhost:5173. The port is fixed in `vite.config.ts`
  (`strictPort`): when 5173 is busy the dev server refuses to start rather than moving to
  another port, because only that origin is in the Supabase redirect allowlist.
- `npm test` runs the Vitest suite in jsdom; it needs nothing running and reads no env file
  (§19). `npm run lint` runs ESLint over the code (§19). `npm run build` type-checks with
  `tsc` and builds with Vite into `dist/`.
  `npm run preview` serves that build.
- The practice copy is a throwaway Compass backend on the developer's machine, for the checks
  that need a real database and for anyone, a person or an agent, who has to sign in without
  touching the live project (§19). It needs Docker running and the Supabase command-line tool
  (the checks on GitHub install 2.116.0), and nothing else: no `.env.local`, no key and no
  CAPTCHA, since the practice app is told the practice copy's address as it starts and the
  practice copy has no CAPTCHA. `npm run practice:up` brings it up and returns, having made
  the two practice accounts recorded in `supabase/practice/accounts.json`; either signs in,
  and there are two so that a check can show one not seeing the other's rows.
  `npm run practice:app` serves Compass pointed at it, at http://localhost:5183 (I18), and
  keeps running until it is stopped; `npm run test:db` runs the database checks and
  `npm run practice:check` the rolled-back checks (§18); `npm run test:browser` runs the
  browser checks, starting a practice app of its own at that address, so it refuses while
  something else holds it — `npm run practice:app` included — and needs Chromium, downloaded
  once with `npx playwright install chromium`; `npm run practice:reset` remakes its
  database from nothing; `npm run practice:down` throws it away, data included. Its inbox,
  which catches every email it sends, answers at http://127.0.0.1:55324. An agent opens the
  practice app and never http://localhost:5173, which is the developer's own app, pointed at
  the live project.
- Hosting: on every push to `main`, Vercel runs the closing build that `vercel.json` sets,
  which copies `closed/index.html` alone into `dist/`, and serves it at
  https://builder-compass.vercel.app (spec §20); `vercel.json` sets the security headers. GitHub
  Actions runs the checks in §19 once per push — in full on a pull request, but for the
  database checks on a pull request into `main` that brings only documents, once `main`'s
  own run passed them on the commit it is merged with, and after a push that changed only
  documents since a run that passed them; and on `main` without the checks that start the
  test runner from a subfolder — and re-verifies the §17 headers on the live URL after every
  production deploy. The backend is the Supabase project `compass` (`your-project-ref`).
  Runbook: `docs/deploy.md`.

## The spec

What Compass does, section by section. Each section is one file in `docs/spec/`, cited as
`spec §N`; design is in `DESIGN-SYSTEM.md`. Agents start at `AGENTS.md`, whose routing table
says which sections to read for the code they touch.

| § | Section | Covers |
|---|---|---|
| §0 | [About this document](docs/spec/00-about.md) | How the spec is written, cited and kept true. |
| §1 | [Product](docs/spec/01-product.md) | What Compass is, who it is for and what it refuses to be. |
| §2 | [Screens and routing](docs/spec/02-screens-and-routing.md) | Which screen shows when, switched by state in `App.tsx`. |
| §3 | [Object model](docs/spec/03-object-model.md) | The seven tables, their columns and the matching types, and how they are kept on this device. |
| §4 | [Core invariants](docs/spec/04-invariants.md) | The rules the code keeps, `I1`–`I20`, one line each. |
| §5 | [Auth](docs/spec/05-auth.md) | Sign-in, sign-up, email links, password reset and the CAPTCHA. |
| §6 | [Projects, sidebar and archive](docs/spec/06-projects-sidebar-archive.md) | The sidebar, switching, renaming, archiving and deleting projects. |
| §7 | [Dashboard shell](docs/spec/07-dashboard-shell.md) | The dashboard layout, the summary and depth views, loading and saving. |
| §8 | [Commitment card](docs/spec/08-commitment-card.md) | Logged hours, the work-session clock and the daily commitment. |
| §9 | [Timeline card](docs/spec/09-timeline-card.md) | The phases and where the project is in them. |
| §10 | [Learning card](docs/spec/10-learning-card.md) | Learning items and the focus slider. |
| §11 | [Daily Task panel](docs/spec/11-daily-tasks.md) | The task list that carries across days. |
| §12 | [Thought log](docs/spec/12-thought-log.md) | The thoughts feed, its groups and dragging. |
| §13 | [Interview (setup)](docs/spec/13-interview.md) | The one-page setup that creates a project. |
| §14 | [Settings and privacy](docs/spec/14-settings-and-privacy.md) | The Settings dialog, the privacy notice and `index.html`. |
| §15 | [Landing page](docs/spec/15-landing-page.md) | The signed-out marketing page and its demo. |
| §16 | [Design](docs/spec/16-design.md) | Where design is ratified and the rules behavior depends on. |
| §17 | [Security posture](docs/spec/17-security.md) | The security posture as configured, with verification dates. |
| §18 | [Persistence and migration](docs/spec/18-persistence-and-migration.md) | Migrations, the schema of record and the rolled-back checks. |
| §19 | [Testing](docs/spec/19-testing.md) | Unit, database and browser checks, the practice copy and CI. |
| §20 | [Closure](docs/spec/20-closure.md) | The closing page production serves, and what closed when. |
| §21 | [Architecture](docs/spec/21-architecture.md) | The layers, who owns which state, the seam's operations and the flows. |
| §22 | [The desktop app](docs/spec/22-desktop-app.md) | The window, the data file, the bridge and the menu-bar clock. |
