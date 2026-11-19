# design-sync notes — Compass

Repo-specific gotchas for re-syncs. Read before running the converter.

## Shape & entry
- Compass is an **app, not a packaged library**: no `module`/`main`/`exports`, `dist/` is a Vite
  app build. The converter runs off the hand-authored entry **`.design-sync/ds-entry.ts`**
  (named re-exports of the app's default-export components), pinned as `entry` in config.json.
  Adding a component to the DS = add a line there + a `componentSrcMap` line in config.json.
- Excluded on purpose: `Dashboard` and `ArchiveScreen` (fetch from Supabase on mount — can't
  render standalone), `AuthTurnstile` (renders null without a Turnstile site key), `App`.

## Environment
- `npm install` needs `--cache /tmp/compass-npm-cache` (the `~/.npm` EACCES sandbox quirk).
- Playwright: chromium build **1223** is cached in `~/Library/Caches/ms-playwright` →
  `playwright@1.60.0` is the matching release (installed into `.ds-sync/`).

## Forks
- `.design-sync/overrides/css.mjs` (declared in `cfg.libOverrides`): styles.css references fonts
  as root-absolute `url(/fonts/*.ttf)` served from Vite's `public/` web root. The stock resolver
  only looks relative to the css file, so every font dangled. The fork resolves absolute urls
  against `<root>/public/` first. On re-sync, diff against the bundled `lib/css.mjs` for upstream
  changes worth merging.

## Preview authoring rules learned in the solo round
- List/row styles are scoped under `.dashboard` — wrap dashboard components in
  `<div className="dashboard">` (+ ` depth` when passing `depth={true}`), fixed width ~380–460px.
- Flex:1 roots (ThoughtLog's `.th-log`) need a flex-column parent with explicit height.
- Supabase is safe in previews: `import.meta.env` is shimmed WITHOUT `VITE_*` keys, the client is
  lazy, and db writes fire only on interaction — static renders never touch it.
- `body { display: grid; place-items: center }` ships in the CSS closure (styles.css appended to
  `_ds_bundle.css`) — rendered designs inherit a centering body; conventions.md must warn the
  design agent.

## Preview authoring rules learned in wave 1 (all 12 authored)
- **Clock-relative components** (TimeCard, TimelineCard): previews compute `startedAt` /
  `completedAt` / the 49-entry `initialDaily` with a `daysAgo(n)` helper, never hardcoded dates —
  recaptures stay self-consistent on any date. TimeCard's `initialDaily` contract: exactly 49
  entries, oldest first, today last; `initialLoggedSeconds` is what shows as today.
- **Height-less bubbles** (`.bubble` roots): host in a `.dashboard` wrapper with `display: grid`
  (grid stretches both axes; flex only cross-axis). TaskPanel used 700×420.
- Sidebar hosts in a plain `220×500 display:grid` wrapper — `.sidebar` styles are top-level.
- AutoTextarea is invisible bare — stage it inside `.task-item.task-add-row.adding` in a task list.
- PasswordChecklist is self-contained (inline styles + tokens); group is **auth**; Interview's
  group is **general**.
- **Full screens in the 900×700 capture viewport**: Interview zoom-fits via `zoom: 0.56` on the
  host div. Alternative if native-size capture is ever wanted:
  `cfg.overrides.Interview.viewport = "1100x1300"` (would clear + re-require its grade).
- LoginScreen/SetNewPassword self-wrap in inline `100vw/100vh` grids — neutralized with a host
  class + `<style>` rule using `!important` (beats inline styles), 520px hosts.
- `body:has(.setup)` (interview.css) repaints the page body when an Interview cell is in the DOM —
  harmless while each story captures on its own page.
- **Statically unreachable states, skipped by design**: Sidebar archive view + open settings
  popover; TimeCard weeks history; TaskPanel thoughts tab (ThoughtLog has its own card);
  LoginScreen register/forgot/check-your-email modes; SetNewPassword met/error states; all
  click-to-edit inputs, drag cues, and hover-only affordances (delete ×, grips).

## Re-sync risks
- `.design-sync/ds-entry.ts` + `componentSrcMap` are a hand-maintained pair — a new app component
  ships to the DS only when BOTH gain a line; nothing detects drift automatically.
- The css.mjs fork can silently fall behind the bundled `lib/css.mjs` — diff on every re-sync.
- Date-driven previews (TimeCard/TimelineCard) recompute from the real clock; if a capture ever
  disagrees with a carried-forward grade, suspect date math, not pipeline churn.
- Auth-screen previews neutralize inline viewport wraps with `!important` CSS — if LoginScreen/
  SetNewPassword change their self-wrap markup (first-child div), those previews break visibly.
- Playwright/chromium pin (1.60.0 ↔ build 1223) is machine-local; a different machine needs its
  own matching pair.

## Known render warns
- (none recorded yet — floor-card RENDER_BLANK warns on CSlider/AutoTextarea disappeared once
  authored previews replaced the floor attempt)
