## §20 Closure

Code: `closed/index.html`, `vercel.json`

Compass is closed. The build Vercel runs for production is the one `vercel.json` sets: it copies
the static page `closed/index.html` alone into `dist/`, and a rewrite serves that page at every
path, so production shows no landing page, no sign-in and no dashboard. The §17 headers still
apply to it. The app's code stays in the repository: `npm run build` still builds it, the
practice app still serves it, and every check in §19 still runs on it. Reopening is removing the
build command, the output directory and the rewrite from `vercel.json`.

The page says, in English and then in Chinese, that Compass has closed; that a person who had
an account can reply to the closing email by the deletion date to receive a copy of their
data; and that the reader's account, and everything they stored in Compass, is deleted on that
date. It
names no email address. It loads no script and no font, and asks search engines not to index
it.

| Fact | State | Since |
|---|---|---|
| Production address | `https://builder-compass.vercel.app`; `system-compass.com` and `www.system-compass.com` serve the same closing page until the domain's other product needs them | 2026-10-26 |
| New accounts | none: sign-up is off in Supabase | 2026-10-26 |
| Sign-in | Google only: the Turnstile widget is deleted, so email sign-up, sign-in and password reset cannot pass the CAPTCHA (§5), locally too; Google sign-in never uses it | 2026-10-26 |
| Deletion date | 2026-11-02: every account but the owner's is deleted, with no backup, and with it every row it owned; the owner's account and rows stay, so the owner can keep using Compass from `npm run dev` | — |
