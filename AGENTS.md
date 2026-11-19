# Compass — agent manual

Compass is a calm focus and pacing dashboard for solo builders (product: spec §1; setup
and hosting: `README.md`). Codex reads this file directly; `CLAUDE.md` imports it for
Claude Code. The owner is a non-technical founder: explain in plain words, and report what
you ran and what it printed.

## How a change goes

1. Fetch first (`git fetch`, then `git status`): check the checkout against GitHub before
   anything else.
2. The owner asks in chat. Say briefly what you will do, then do it on a branch of its own,
   in a worktree. The main folder stays on `main` and only moves by `git pull --ff-only`.
3. Run the checks the change touches (below), commit, push the branch and open a pull
   request without asking. One concern per commit; stage files by name, never `git add .`
   or `git commit -a`.
4. The owner merges. A merge to `main` deploys to production, so never push to `main`, never
   merge and never turn on auto-merge. Never merge red.
5. Stop and explain the approach in chat, then wait for the owner's OK before writing code,
   when a change touches the database schema or its access rules, sign-in, the security
   headers or secrets, or adds AI, sharing or payments (spec §17).
6. Keep the docs true in the same pull request. The spec in `docs/spec/` (behavior, one
   file per section, invariants `I-n` in §4) and `DESIGN-SYSTEM.md` (design, rules `D-n`)
   describe the app as it is: no plans, history, git state or dates in headings. Cite by
   ID; sections are appended, never renumbered. Ideas not yet built are in `docs/ideas.md`;
   building one removes its entry.

## Commands

- Setup and `.env.local`: README. `npm run dev` · `npm run lint` · `npm test` ·
  `npm run build`. Never commit `.env*`. `npm run typecheck:browser` too when a change
  touches `browser/`. A lint rule is switched off for a line only with its reason after
  `--` on that line.
- `npm run docs:check` (links, IDs, design drift, the routing table) before committing a
  docs, CSS or new-file change, chained in front of the commit with `&&`, unpiped.
- `node scripts/design-census.mjs --write` in the commit that changes CSS; CI fails without
  it.
- The practice copy (README, spec §19): `npm run practice:up` · `practice:app` ·
  `practice:reset` · `practice:down`. Run `npm run test:db` and `npm run practice:check`
  when a change touches the seam, the database or the practice commands;
  `npm run test:browser` walks the journeys in Chromium. Sign in only at the practice app's
  address (I18) with a practice account, never the usual address, which reaches the live
  project.
- Proving behavior by driving the app: the verify-compass skill
  (`.claude/skills/verify-compass/SKILL.md`, spec §19). Run
  `node scripts/verify/verify.mjs prove` before and after a change that could alter what a
  person sees or what is stored, and put both runs' closing lines in the pull request.
- Whether the spec alone is enough to rebuild the app: the spec-rebuild-quiz skill
  (`.claude/skills/spec-rebuild-quiz/SKILL.md`, spec §0). Run it after a change to the spec,
  the seam or the gate, and put its verdicts in the pull request.
- `npm audit --omit=dev --audit-level=high` before a deploy.
- CI (`.github/workflows/ci.yml`) runs the same checks on every pull request and on `main`
  (spec §19); `scripts/check-headers.sh` checks the live site after each deploy. To wait
  for CI, run one `gh run watch <id> --exit-status` in the background and read it once.
- Production runbook: `docs/deploy.md`. Read it before touching any production setting or
  applying a migration.

## Architecture

- Vite + React + TypeScript single-page app; Supabase (Postgres, Auth, owner-only RLS) behind
  one seam, `src/lib/db.ts` (I1); pure logic in `src/lib/transforms.ts`; screens switched by
  state in `App.tsx` (I9); hosted on Vercel with the headers in `vercel.json`. Spec §1–§4, and
  §21 for the layers, who owns which state, the seam's operations and the flows. A change to
  what `src/lib/db.ts` exports updates §21's table in the same pull request; the docs check
  fails otherwise.
- `scripts/` the docs check, the census, the practice commands, the CI helpers and the
  verification harness (`scripts/verify/`) · `supabase/` migrations, their rolled-back checks,
  the practice copy's settings · `.claude/settings.json` the permission rules ·
  `.claude/skills/` the project's skills.
- Most often at stake: I1 (the seam), I2 (secrets), I3 (per-project scoping), I4 (day keys),
  I5–I7 and I18 (auth, hosting), I8 with D1 (visual changes reuse existing units), I9.

## Which spec to read

Before you change a file, read the spec sections in its row, and §4, whose invariants every
change keeps. A folder covers everything under it. A file covers its own tests too:
`LearningCard.tsx` covers `LearningCard.text-limits.test.tsx`. The docs check fails when a
file under `src/`, `supabase/`, `scripts/` or `browser/` is in no row.

| Code | Read |
|---|---|
| `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts`, `src/App/`, `src/lib/projectRouting.ts` | §2, §21 |
| `src/auth/`, `src/lib/recoveryLink.ts`, `supabase/templates/` | §5, §17 |
| `src/dashboard/Sidebar.tsx`, `src/dashboard/Sidebar/`, `src/archive/`, `src/dashboard/DeleteConfirm.tsx`, `src/dashboard/useDeleteConfirm.tsx` | §6, §14 |
| `src/dashboard/Dashboard.tsx`, `src/dashboard/dashboardLoad.ts`, `src/dashboard/useServerState.ts`, `src/dashboard/a-drop-after-a-refresh.test.tsx`, `src/dashboard/the-boxes-under-strict-mode.test.tsx`, `src/dashboard/markup-shaped-text-appears-as-typed.test.tsx` | §7, §21 |
| `src/dashboard/TimeCard.tsx`, `src/dashboard/TimeCard/`, `src/dashboard/hoursEdit.ts`, `src/dashboard/projectTime.ts` | §8 |
| `src/dashboard/TimelineCard.tsx` | §9 |
| `src/dashboard/TaskPanel.tsx` | §11 |
| `src/dashboard/LearningCard.tsx`, `src/dashboard/learningFocus.ts`, `src/dashboard/CSlider.tsx` | §10 |
| `src/dashboard/ThoughtLog.tsx` | §12 |
| `src/dashboard/AutoTextarea.tsx`, `src/dashboard/keys.ts`, `src/dashboard/useAddBox.ts`, `src/dashboard/useDragReorder.ts`, `src/dashboard/useEdgeAutoScroll.ts` | §7, §11, §12 |
| `src/interview/`, `src/styles/interview.css` | §13 |
| `src/landing/`, `src/styles/landing.css` | §15 |
| `src/styles/styles.css` | §16 |
| `src/lib/db.ts`, `src/lib/db/`, `src/lib/supabase.ts`, `src/lib/types.ts`, `src/lib/transforms.ts`, `src/lib/transforms/`, `src/lib/limits.ts` | §3, §17, §21 |
| `supabase/migrations/`, `supabase/checks/`, `supabase/config.toml` | §3, §17, §18 |
| `supabase/practice/`, `src/lib/practiceCopy.ts`, `src/lib/fakeSupabase.ts`, `src/lib/the-suite-and-the-database.test.ts`, `scripts/practice/`, `scripts/ci/`, `browser/` | §19 |
| `scripts/what-the-code-holds.ts`, `scripts/the-hosting-build-finds-every-import.test.ts`, `scripts/check-headers.sh` | §17, §19 |
| `scripts/docs-check.mjs`, `scripts/design-census.mjs` | §0, §16, §21 |
| `scripts/verify/`, `.claude/skills/verify-compass/` | §19, and the section a journey walks (§5–§15) |
| `closed/`, `vercel.json` | §17, §20 |

## Things to avoid

- Logging or forwarding a row payload or a user's text: thoughts are diary-grade (spec
  §17). Auth stays bearer-token based.
- Adding a package when React, Vite or Supabase can do the job, or without verifying its
  exact name. The lockfile stays committed.
- Linking the Supabase folder or pushing from it (`supabase link`, `config push`, `db push`):
  the practice copy's settings must never reach the live project (`docs/deploy.md` §8). Never
  show what the Supabase tool prints: it lists every key.
- Running a command you just built without a time limit, or starting a second copy of a tool
  on a cache or a port the owner's running copy uses.
- Re-running the `.design-sync/` converter without reading `.design-sync/NOTES.md`; its
  `ds-entry.ts` and `config.json` are a hand-maintained pair.
- Expecting a branch's Vercel preview to sign in: it cannot (spec §17), and is for layout
  and copy only.
- Taking a green CI run as a reason to skip the local checks.
- Saving agent memory: it is off (`.claude/settings.json`). When the owner says "remember …",
  propose a line for this file instead.
