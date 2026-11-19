# Compass — deployment runbook (Vercel + Supabase)

How Compass is put on the web and kept signing people in. The app is a static Vite build;
Vercel serves the `dist/` output, and Supabase (project ref `your-project-ref`) provides
Auth and Postgres. This is a checklist to re-run for a redeploy or for domain and auth
troubleshooting; steps marked **(dashboard)** happen in a browser, not in code. The security
rules it implements are I2, I5, I6 and I7, and the posture as configured is spec §17.

**Compass has closed.** Production serves only the closing page (spec §20); §9 below is the
closing checklist. The rest of this runbook describes how the app was served and stays true for
reopening it.

**Production facts.** The production URL is `https://builder-compass.vercel.app`, which serves
the closing page. `system-compass.com` and `www.system-compass.com` are attached to the Vercel
project with no redirect and serve the same closing page until the domain's other product needs
them; then they are removed in Vercel → Settings → Domains. Hosting is Vercel; the Supabase project runs in
`us-east-1` on the free tier (which gates leaked-password protection and the backup options);
auth email goes through Resend; email auth is gated by Cloudflare Turnstile, whose widget was
deleted at the closing (§9), so only Google sign-in works.

**The one rule that explains half of this runbook.** Every auth redirect is
`window.location.origin` (`redirectTo`, or `emailRedirectTo` for the confirmation emails;
`src/lib/db.ts`, I5). That one value serves the
Google OAuth return, email-confirmation links and password-reset links, so **every origin the app
is served from must be in Supabase's redirect allowlist** or those links bounce. The origin is
not hardcoded, so the same build works on `localhost` and in production — each origin is simply
allowlisted.

## 0. Prerequisites

- The repo is on GitHub (`github.com/XingzhiC-starlight/Builder-Compass`); Vercel deploys from it.
- Access to the Supabase, Vercel and Google Cloud dashboards.
- `.env.local` holds the public client values (table at the bottom).

## 1. Supabase Auth — providers and policy **(dashboard)**

Authentication → Providers / Settings:

- Email provider on; **Confirm email on** — new accounts click an emailed link.
- Password policy: minimum length 8. The client additionally requires lowercase, uppercase, a
  number, a special character and a matching confirmation (spec §5). Leaked-password
  protection is **not enabled** — it is gated by the Supabase plan.
- Google provider configured (the OAuth client secret lives only here).
- Custom SMTP: Resend, for confirmation and reset emails. Click tracking stays off for these
  emails: it rewrites links.
- Email templates: the Reset Password template's link is
  `<a href="{{ .RedirectTo }}/#token_hash={{ .TokenHash }}&type=recovery">`. It opens Compass,
  not Supabase, and the app verifies the token only when a person presses Continue (spec
  §5), so a mail scanner cannot spend it. The other templates keep `{{ .ConfirmationURL }}`.
  After editing any template, request that email once and confirm it arrives: a template that
  does not parse makes Supabase refuse the request, and no email is sent.
- Bot and Abuse Protection: Cloudflare Turnstile. The Turnstile secret key lives only here,
  never in frontend env vars or git (I6). The widget itself is configured on the Cloudflare
  side, where its **hostname allowlist** holds the production host, `localhost` and
  `127.0.0.1`; a new domain or a new dev host must be added there or the CAPTCHA fails to
  render. The widget was deleted at the closing (§9): email auth works again only with a new
  widget, its site key in `VITE_TURNSTILE_SITE_KEY` and its secret key here.
- Access-token lifetime stays at the Supabase default (one hour); do not extend it.

## 2. Push to GitHub

Work on a branch per change and open a pull request with its first push: the CI check runs
in full on the pull request, on every push to its branch — but for the database checks,
skipped and shown as skipped on the documents-only runs spec §19 describes — and a branch
with no pull request gets none; after the merge it runs once more on `main`, without the
checks that start the test runner from a subfolder (spec §19). Merge or push `main` only
when that check is green. Vercel builds every push to `main` with `npm run build` and serves `dist/`. A push
to `main` is a production deploy: get the go-ahead first (`AGENTS.md`).

## 3. Vercel — project and env vars **(dashboard)**

- Import the GitHub repo; the Vite preset is auto-detected (build `npm run build`, output
  `dist`). `vercel.json` provides the security headers; no overrides.
- Settings → Environment Variables, for Production **and** Preview — the anon/publishable key
  only; the `service_role` key must never be set here (I2):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`. Re-deploy after
  adding them if the first build ran without.

## 4. Supabase Auth — URLs **(dashboard)**

Authentication → URL Configuration:

- Site URL: `https://builder-compass.vercel.app`.
- Redirect URLs: `https://builder-compass.vercel.app/**`, plus `http://localhost:5173/**` for local
  development (I18). This one allowlist covers OAuth return, email confirmation and
  password reset.
- No `*.vercel.app` wildcard, by decision: preview deploys render but cannot complete sign-in.
  Add a wildcard only if previews should log in.

## 5. Google OAuth **(dashboard, usually no change)**

Google Cloud → Credentials → the OAuth client: the authorized redirect URI is the Supabase
callback `https://your-project-ref.supabase.co/auth/v1/callback`, which does not depend on
the app's domain. Only if Google rejects the flow, add the production origin to the
authorized JavaScript origins.

## 6. Verify on the live URL

After every production deploy, whatever it touched, the owner's two-minute pass on the live
site: sign in, make one write (add a task, say), sign out.

What a running Compass can show without the live services is checked on the practice copy
(spec §19), during the build: a first sign-in and setup, the reset link's steps, one account
not seeing another's rows. The list below keeps what only the live services show.

Run after any change to auth, security or deploy settings, and after a deploy that touches them:

- Google sign-in → dashboard.
- Email: register → confirm via the emailed link → sign in with the password.
- Password reset: "Forgot password?" → reset email → Continue → set-new-password screen →
  signed in. Repeat with a Microsoft-hosted mailbox, whose scanner opens the link first.
- CSP: DevTools console shows no blocked first-party requests. Warnings from
  `challenges.cloudflare.com` are expected noise; loosen a directive only if a real user flow
  breaks, and never add `'unsafe-eval'` (I7).
- RLS: test as a real user, never as admin. The Supabase SQL editor and the MCP server's
  `execute_sql` run as superuser and **bypass RLS**, so seeing only your rows there proves
  nothing. Sign in as account A in the app, then from the console run
  `createClient(url, anonKey).from("projects").select("*")` against the persisted session and
  confirm it returns none of account B's rows; cross-check from the superuser side that B's
  rows exist under a different owner (I2).
- Headers and CSP can only be validated on a deploy: `vercel.json` is inert under `vite dev`,
  `vite build` and `vite preview`. A workflow (`verify-deploy.yml`) runs on every successful
  production deployment: it runs `scripts/check-headers.sh` against
  `https://builder-compass.vercel.app`, which fetches the headers with `curl -sI` and requires
  every header that `vercel.json` sets for all paths, each with exactly the value
  `vercel.json` gives it, and a `Content-Security-Policy` that contains
  `frame-ancestors 'none'` and does not contain `'unsafe-eval'`, and fails otherwise. The
  same script runs by hand against any URL; it reads `vercel.json` from its own checkout. The manual sign-in checks above are unchanged.
- Cross-check rows landed, through the Supabase dashboard or the attached MCP server.

### Email troubleshooting

- An account created from `http://localhost:5173` gets confirmation and reset links that point
  back to `localhost`; they work only on the machine running the dev server. For phone testing,
  create the account from the production URL.
- A reset or confirmation link is single-use, and mail scanners (Microsoft's Safe Links, most
  corporate gateways) open links before the person does. The reset link survives that (spec
  §5). A confirmation link does not: the scanner confirms the account, and the person's own
  click then lands on the login screen with the email-link notice, where signing in works.
- If auth emails stop arriving: Supabase Auth email logs and rate limits, Resend delivery logs,
  DNS and domain verification — before touching app code.
- A custom email template must use `{{ .RedirectTo }}` in its links, not only `{{ .SiteURL }}`,
  or the app's `redirectTo` option stops controlling where the link lands.

## 7. Open operational items

Operations to complete, in priority order. A provider setting with no user-visible behavior
lives here. A setting that changes anything the spec describes waits for the owner's OK in
chat and lands with a pull request that updates the spec (`AGENTS.md`). Product ideas are in
`docs/ideas.md`.

1. Done 2026-09-21 — MFA is on for the GitHub, Vercel, Supabase and Google admin accounts
   (spec §17). The number stays so the items below keep theirs.
2. Invite the first beta cohort — small (around thirty people) — and watch the Supabase auth
   and email logs and the Resend delivery logs during the first days.
3. Confirm the Supabase backup schedule and rehearse a restore.
4. Write a one-page incident plan: who notices, where the logs are, how to rotate each key
   (see the table below), how to pause the project.
5. Monitoring: decide what is watched and where (Supabase logs, Vercel logs) and how an alert
   reaches a person; today nothing pages anyone.
6. Dependency audit: `npm audit` (the known findings are all dev-only: `undici` under jsdom in
   the Vitest chain, and `vite`, `vitest`, `postcss`, `nanoid`, `browserslist` and
   `baseline-browser-mapping` in the Vite and Babel chains; none ships in the browser bundle,
   and `npm audit --omit=dev` reports none),
   and a Vite major upgrade. Dependabot alerts are on (Settings → Code security), and
   `.github/dependabot.yml` opens weekly grouped update pull requests for npm and for the
   GitHub Actions used by the workflows, and ignores React major versions until a change asks
   for them; its alerts to date are all in development tooling.
7. Review Supabase Auth rate limits against the expected cohort size.
8. Leaked-password protection, when the Supabase plan allows it. Enabling it changes spec
   §5's password rules, so spec §5 is updated when it is turned on.
9. Confirm and record how Supabase treats a Google sign-in and an email account that share
   one address (linked into one account, or two accounts); spec §5 is silent until it is
   verified in the dashboard.
10. Least privilege for any future collaborator on the provider dashboards: a named account
    per person, the minimum role, no shared credentials.

## 8. Applying a database change

A change to the database is a migration under `supabase/migrations/`, numbered in order, and
reaches production only through this section, after the owner's OK on the approach (`AGENTS.md`).
The schema of record and how migrations are recorded are spec §18.

**Rehearse on the practice copy first.** `npm run practice:reset` replays every migration,
the new one included, onto an empty database, and names the one that cannot replay;
`npm run practice:check` runs the rolled-back checks; `npm run test:db` runs the database
checks (spec §19). Nothing below begins until all three are green.

**The practice copy's settings never reach the live project.** `supabase/config.toml`
switches CAPTCHA and the confirmation wait off, for the practice copy alone. The repository's
Supabase folder is never linked to the hosted project (`supabase link`), and nothing is pushed
from it (`supabase config push`, `supabase db push`); the practice commands refuse to run when
a link exists, and Supabase's GitHub integration stays off. After the first push of a change
that edits those settings, the owner confirms in the dashboard that CAPTCHA and confirmation
are still on.

1. **The owner reads it.** The exact file, as committed on the change's branch, is shown to the
   owner in plain words; nothing runs before the owner's word.
2. **Before.** A read-only count of the rows the change could touch, kept for step 5.
3. **Apply.** Through the attached Supabase connection, `apply_migration` with the file's
   contents unchanged (confirm the file matches its commit first) and a snake_case name. The
   SQL editor works too, but records nothing in the migration history.
4. **Confirm.** `list_migrations` lists the new name after the earlier ones. For a function:
   it exists, `anon` cannot execute it, `authenticated` can, and it is not security definer
   (`has_function_privilege`, `pg_proc`).
5. **Prove.** Run the change's rolled-back check from `supabase/checks/` unchanged. It always
   ends in an error; the expected one reads "… all checks passed …", and any other names the
   check that did not hold. Then the step-2 count again: it must not have moved.
6. **Advisors.** Security and performance (`get_advisors`); nothing new beyond what spec §17
   already records.
7. **As a real user.** The SQL editor and the connection's own queries run as `postgres` and
   bypass row-level security, so the owner-scoped behavior is checked in the app, signed in,
   as in §6's RLS step — the change's manual checks, performed on the practice copy during
   the build and on the live site here.

A change that only adds (a function) is applied before the app that calls it is merged:
`npm run dev` reaches the production project, and the live app does not call it yet, so
nothing changes for people in between. A change that alters or removes something the live app uses needs its
own ordering, written into its pull request. Undoing a migration is a later migration.

## 9. Closing the service

Compass closed on 2026-10-26 (spec §20). Every account was emailed, from the owner's own
address with the recipients in BCC, that the service had closed, that a reply by the deletion
date brings a copy of that person's data, and that their account and everything they stored
is deleted on that date. The owner's account stays, for the owner's own use from `npm run dev`.

| Step | When | Who |
|---|---|---|
| Merge the closing pull request: production serves `closed/index.html` alone | 2026-10-26 | owner |
| Vercel → Settings → Domains: `system-compass.com` and `www.system-compass.com` stay attached with no redirect, so they serve the closing page, until the domain's other product needs them; the Cloudflare DNS records stay | 2026-10-26 | owner |
| Supabase → Authentication → Sign In / Providers: turn off "Allow new users to sign up"; URL Configuration: Site URL and redirect list as §4, with no `system-compass.com` entry | 2026-10-26 | owner |
| Cloudflare Turnstile: the widget is deleted. Google sign-in never uses the CAPTCHA (spec §5) and still works, locally too; email sign-up, sign-in and password reset cannot pass the check | 2026-10-26 | owner |
| Email every account (the addresses from Supabase → Authentication → Users) | 2026-10-26 | owner |
| Each reply asking for data: one read of that person's rows, sent to them as a JSON file and a readable text file; nothing else is read | until 2026-11-02 | agent reads with the owner's approval; owner sends |
| Supabase → Authentication → Users: delete every account but the owner's, with no backup; each deletion removes that account's rows in all seven tables (`on delete cascade`). The project, the Google OAuth client and Resend stay, for the owner's local use. Update spec §20 and the closing page to say the data was deleted | 2026-11-02 | owner, confirmed again on the day |

## Environment variables

Both Supabase values are public by design — Row-Level Security is what protects data. Any
variable named `VITE_…` is inlined into the public browser bundle by Vite, which is why these
three may carry the prefix and a secret never may (I2); a server-side secret (such as account deletion's, `docs/ideas.md`) belongs
in a function's own environment under a name without the prefix. Vercel may warn that a
`VITE_` value looks sensitive — mark it safe.

| Name | Value | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://your-project-ref.supabase.co` | the Supabase client (`src/lib/supabase.ts`) |
| `VITE_SUPABASE_ANON_KEY` | the `sb_publishable_…` key, from Supabase → Settings → API | the Supabase client |
| `VITE_TURNSTILE_SITE_KEY` | the public Cloudflare Turnstile site key | the email-auth CAPTCHA widget (`src/auth/AuthTurnstile.tsx`) |

The Supabase `service_role` key and the Turnstile secret key are never set in Vercel env vars
or committed. If a secret ever leaks, rotate it in the provider dashboard; removing it from git
history is not enough.
