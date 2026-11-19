import { accountDetails, emailsInTheInbox, newestEmailTo, recordAccount, resetLinkIn, signInAtThePracticeCopy } from "../lib.mjs";
import { dashboardShown, landingLogIn, loginShown, setupShown } from "../screens.mjs";

// React's development build warns when a checklist row flips from met to unmet, because the row's
// dot mixes the `border` shorthand with `borderColor` (src/auth/PasswordChecklist.tsx). It is
// the app's own noise, allowed by name here so that any other message still fails the step.
const CHECKLIST_WARNING = /a style property during rerender.*Removing borderColor border/;

const EMAIL_LINK_NOTICE =
  "That link from your email no longer works. Links can be used once. If you were resetting your password, “Forgot password?” sends a new one; if you were confirming your account, try signing in.";

async function toLogin(j) {
  await j.open("/");
  await landingLogIn(j.page).click();
  await j.expect(loginShown(j.page)).toBeVisible();
}

function rule(page, label) {
  return page.locator('[aria-label="Password requirements"] li').filter({ hasText: label });
}

async function ruleMet(page, label) {
  const background = await rule(page, label).locator("span").first().evaluate((dot) => dot.ownerDocument.defaultView.getComputedStyle(dot).backgroundColor);
  return background !== "rgba(0, 0, 0, 0)" && background !== "transparent";
}

// The practice copy sends one email to an address per second at most (max_frequency in
// supabase/config.toml) and answers a faster second request 429, so requests are spaced.
async function spaceEmails(j) {
  const since = Date.now() - (j.state.lastEmailAt ?? 0);
  if (since < 1_500) await new Promise((resolve) => setTimeout(resolve, 1_500 - since));
  j.state.lastEmailAt = Date.now();
}

async function askForAReset(j, email) {
  const { page, expect } = j;
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByPlaceholder("you@example.com").fill(email);
  const before = new Set((await emailsInTheInbox(j.where)).map((message) => message.ID));
  await spaceEmails(j);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  return before;
}

async function openTheLink(page, link) {
  await page.goto("about:blank");
  await page.goto(link);
}

export default {
  name: "auth",
  section: "§5",
  title: "Auth",
  steps: [
    {
      id: "auth-login-screen",
      what: "Log in from the landing page: the login screen shows the wordmark button, the tagline, email and password, Sign in, the two mode links, Continue with Google below an \"or\", a privacy link opening /privacy.html in a new tab, and no CAPTCHA box (the practice app has no site key)",
      async run(j) {
        const { page, expect } = j;
        await toLogin(j);
        await expect(page.getByText("A quiet place to see where you are — in time, in plan, in learning.", { exact: true })).toBeVisible();
        await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
        await expect(page.getByPlaceholder("Password", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "New here? Create an account" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
        await expect(page.getByText("or", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
        const privacy = page.getByRole("link", { name: "read how Compass handles privacy" });
        await expect(privacy).toHaveAttribute("href", "/privacy.html");
        await expect(privacy).toHaveAttribute("target", "_blank");
        await expect(page.locator('iframe[src*="challenges.cloudflare.com"]')).toHaveCount(0);
      },
    },
    {
      id: "auth-client-checks",
      what: "Sign in with no email says \"Enter your email to continue.\", with an email and no password \"Enter your password to continue.\", and neither sends anything",
      async run(j) {
        const { page, expect } = j;
        const sent = [];
        const listen = (request) => { if (request.url().includes("/auth/v1/")) sent.push(request.url()); };
        page.on("request", listen);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page.getByText("Enter your email to continue.", { exact: true })).toBeVisible();
        await page.getByPlaceholder("you@example.com").fill(j.account.email);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page.getByText("Enter your password to continue.", { exact: true })).toBeVisible();
        page.off("request", listen);
        if (sent.length > 0) throw new Error(`A request went to sign-in although the form was refused: ${sent.length}.`);
      },
    },
    {
      id: "auth-modes",
      what: "The quiet links switch modes: register adds Confirm password and the \"Password should include\" checklist, forgot drops the password and reads \"Send reset link\", and each switch clears the error and the password",
      async run(j) {
        const { page, expect } = j;
        await page.getByPlaceholder("Password", { exact: true }).fill("not-kept");
        await page.getByRole("button", { name: "New here? Create an account" }).click();
        await expect(page.getByPlaceholder("Confirm password")).toBeVisible();
        await expect(page.getByText("Password should include", { exact: true })).toBeVisible();
        await expect(page.locator('[aria-label="Password requirements"] li')).toHaveCount(6);
        await expect(page.getByPlaceholder("Password", { exact: true })).toHaveValue("");
        await expect(page.getByText("Enter your password to continue.", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
        await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Forgot password?" }).click();
        await expect(page.getByPlaceholder("Password", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Back to sign in" }).click();
        await expect(page.getByPlaceholder("Password", { exact: true })).toBeVisible();
      },
    },
    {
      id: "auth-password-rules",
      console: [CHECKLIST_WARNING],
      what: "In register the checklist rows fill as their rules are met, and the first unmet rule blocks: a weak password says \"Use a password that meets all the requirements below.\", two different ones \"Enter the same password twice.\"",
      async run(j) {
        const { page, expect } = j;
        j.state.registered = accountDetails(j.run, "auth-registered");
        recordAccount(j.run, j.state.registered);
        await page.getByRole("button", { name: "New here? Create an account" }).click();
        await page.getByPlaceholder("you@example.com").fill(j.state.registered.email);
        await page.getByPlaceholder("Password", { exact: true }).fill("weak");
        await page.getByPlaceholder("Confirm password").fill("weak");
        const met = {};
        for (const label of ["At least 8 characters", "One lowercase letter", "One uppercase letter", "One number", "One special character", "Passwords match"]) {
          met[label] = await ruleMet(page, label);
        }
        j.note(`With "weak" typed twice: ${Object.entries(met).map(([label, yes]) => `${label} ${yes ? "filled" : "muted"}`).join(", ")}`);
        if (!met["One lowercase letter"] || !met["Passwords match"] || met["One uppercase letter"] || met["At least 8 characters"]) {
          throw new Error("The checklist does not fill the rows whose rules \"weak\" meets, and only those.");
        }
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(page.getByText("Use a password that meets all the requirements below.", { exact: true })).toBeVisible();
        await page.getByPlaceholder("Password", { exact: true }).fill(j.state.registered.password);
        await page.getByPlaceholder("Confirm password").fill(`${j.state.registered.password}x`);
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(page.getByText("Enter the same password twice.", { exact: true })).toBeVisible();
        if (!(await ruleMet(page, "One special character")) || (await ruleMet(page, "Passwords match"))) {
          throw new Error("With a strong password and a different confirmation, the checklist should fill every row but Passwords match.");
        }
      },
    },
    {
      id: "auth-register",
      console: [CHECKLIST_WARNING],
      what: "Create account with a password that meets every rule signs straight in to the first-run setup (the practice copy asks for no confirmation), and the new account can sign in at the practice copy and owns no project",
      async run(j) {
        const { page, expect } = j;
        await page.getByPlaceholder("Confirm password").fill(j.state.registered.password);
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(setupShown(page)).toBeVisible();
        const projects = await j.rows("projects", "select=id", j.state.registered);
        if (projects.length !== 0) throw new Error(`A new account should own no project; it owns ${projects.length}.`);
      },
    },
    {
      id: "auth-register-taken",
      what: "Registering an address that already has an account says \"That email is already registered — try signing in instead.\"",
      async run(j) {
        await j.newVisit();
        const { page, expect } = j;
        await toLogin(j);
        await page.getByRole("button", { name: "New here? Create an account" }).click();
        await page.getByPlaceholder("you@example.com").fill(j.account.email);
        await page.getByPlaceholder("Password", { exact: true }).fill(j.account.password);
        await page.getByPlaceholder("Confirm password").fill(j.account.password);
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(page.getByText("That email is already registered — try signing in instead.", { exact: true })).toBeVisible();
      },
      console: [/status of 422/],
    },
    {
      id: "auth-sign-in-refused",
      what: "A wrong password says \"That email and password don't match. Try again.\"",
      async run(j) {
        const { page, expect } = j;
        await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
        await page.getByPlaceholder("you@example.com").fill(j.account.email);
        await page.getByPlaceholder("Password", { exact: true }).fill(`${j.account.password}-wrong`);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page.getByText("That email and password don't match. Try again.", { exact: true })).toBeVisible();
      },
      console: [/status of 400/],
    },
    {
      id: "auth-sign-in",
      what: "The right password signs in; an account with no project lands on the first-run setup",
      async run(j) {
        const { page, expect } = j;
        await page.getByPlaceholder("Password", { exact: true }).fill(j.account.password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(setupShown(page)).toBeVisible();
        await expect(page.getByRole("button", { name: "← Back" })).toHaveCount(0);
      },
    },
    {
      id: "auth-sign-out",
      what: "Signed in with a project, Log out in Settings ends the session: the landing page shows, and a reload stays signed out",
      async run(j) {
        const { page, expect } = j;
        await j.setUp("Signed in once");
        await j.signOut();
        await page.reload();
        await expect(landingLogIn(page)).toBeVisible();
        await expect(dashboardShown(page)).toHaveCount(0);
      },
    },
    {
      id: "auth-forgot-inbox",
      what: "Forgot password? waits for the answer (\"One moment…\", the form disabled), then shows \"Check your email\" with the address in a pill, a line that never says whether an account exists, the resend counting down, Back to sign in, Use a different email and the privacy link",
      async run(j) {
        const { page, expect } = j;
        await toLogin(j);
        await page.getByRole("button", { name: "Forgot password?" }).click();
        await page.getByPlaceholder("you@example.com").fill(j.account.email);
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        await page.route("**/auth/v1/recover**", async (route) => {
          await held;
          await route.fallback();
        });
        await spaceEmails(j);
        await page.getByRole("button", { name: "Send reset link", exact: true }).click();
        await expect(page.getByRole("button", { name: "One moment…" })).toBeDisabled();
        await expect(page.getByPlaceholder("you@example.com")).toBeDisabled();
        await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
        await j.snap("in-flight");
        release();
        await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
        await page.unroute("**/auth/v1/recover**");
        await expect(page.getByText("Email sent", { exact: true })).toBeVisible();
        await expect(page.getByText(`If that address has a Compass account, a reset link is on its way to ${j.account.email}.`, { exact: true })).toBeVisible();
        await expect(page.getByText(j.account.email, { exact: true })).toBeVisible();
        await expect(page.getByText("Didn't get the email?", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Resend in \d+s$/ })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Back to sign in" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Use a different email" })).toBeVisible();
        const privacy = page.getByRole("link", { name: "Read the privacy notice" });
        await expect(privacy).toHaveAttribute("href", "/privacy.html");
        await expect(privacy).toHaveAttribute("target", "_blank");
      },
    },
    {
      id: "auth-forgot-no-account",
      what: "An address with no account gets the very same card, so the screen never tells whether an account exists",
      async run(j) {
        const { page, expect } = j;
        const nobody = accountDetails(j.run, "nobody").email;
        await page.getByRole("button", { name: "Use a different email" }).click();
        await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
        await page.getByPlaceholder("you@example.com").fill(nobody);
        await page.getByRole("button", { name: "Send reset link", exact: true }).click();
        await expect(page.getByText(`If that address has a Compass account, a reset link is on its way to ${nobody}.`, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Back to sign in" }).click();
        await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      },
    },
    {
      id: "auth-resend",
      what: "Sixty seconds after the email the resend reads \"Resend reset link\"; resending notes \"If that address has a Compass account, another reset link is on its way.\", restarts the countdown and sends a second email",
      async run(j) {
        await j.newVisit({ clock: new Date() });
        const { page, expect } = j;
        await toLogin(j);
        const before = await askForAReset(j, j.account.email);
        await newestEmailTo(j.where, j.account.email, before);
        const afterFirst = new Set((await emailsInTheInbox(j.where)).map((message) => message.ID));
        await page.clock.fastForward("01:01");
        const resend = page.getByRole("button", { name: "Resend reset link" });
        await expect(resend).toBeEnabled();
        await j.snap("countdown-over");
        await spaceEmails(j);
        await resend.click();
        await expect(page.getByText("If that address has a Compass account, another reset link is on its way.", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Resend in (60|59)s$/ })).toBeDisabled();
        const second = await newestEmailTo(j.where, j.account.email, afterFirst);
        j.note(`A second email reached the practice inbox: "${second.subject}".`);
      },
    },
    {
      id: "auth-reset-link",
      what: "The reset email's link opens \"Reset your password\" with one Continue button, takes the token out of the address bar at once, and opening it spends nothing: the same link, opened again, still continues to \"Set a new password\"",
      async run(j) {
        const { expect } = j;
        await j.newVisit();
        await toLogin(j);
        const before = await askForAReset(j, j.account.email);
        j.state.link = resetLinkIn(await newestEmailTo(j.where, j.account.email, before));
        await openTheLink(j.page, j.state.link);
        await expect(j.page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
        await expect(j.page.getByText("Continue to choose a new password for your Compass account.", { exact: true })).toBeVisible();
        await expect(j.page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
        if (j.page.url().includes("token_hash")) throw new Error("The token is still in the address bar.");
        await expect(j.page.getByRole("link")).toHaveCount(0);
        await j.snap("opened-not-continued");
        await j.newVisit();
        await openTheLink(j.page, j.state.link);
        await j.page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(j.page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
        await expect(j.page.getByText("Choose a new password for your Compass account.", { exact: true })).toBeVisible();
        await expect(j.page.getByPlaceholder("New password", { exact: true })).toBeVisible();
        await expect(j.page.getByPlaceholder("Confirm new password")).toBeVisible();
        await expect(j.page.getByText("Password should include", { exact: true })).toBeVisible();
        await expect(j.page.getByRole("link")).toHaveCount(0);
      },
    },
    {
      id: "auth-new-password",
      console: [CHECKLIST_WARNING],
      what: "A weak new password is refused with the checklist's line; a good one saves (\"Save password\") and signs in; afterwards the old password no longer signs in and the new one does",
      async run(j) {
        const { page, expect } = j;
        await page.getByPlaceholder("New password", { exact: true }).fill("weak");
        await page.getByPlaceholder("Confirm new password").fill("weak");
        await page.getByRole("button", { name: "Save password" }).click();
        await expect(page.getByText("Use a password that meets all the requirements below.", { exact: true })).toBeVisible();
        const renewed = { ...j.account, password: accountDetails(j.run, "renewed").password };
        await page.getByPlaceholder("New password", { exact: true }).fill(renewed.password);
        await page.getByPlaceholder("Confirm new password").fill(renewed.password);
        await page.getByRole("button", { name: "Save password" }).click();
        await expect(dashboardShown(page).or(setupShown(page))).toBeVisible();
        const old = await signInAtThePracticeCopy(j.where, j.account).then(() => "signed in", () => "refused");
        if (old !== "refused") throw new Error("The old password still signs in.");
        await signInAtThePracticeCopy(j.where, renewed);
        j.account.password = renewed.password;
        recordAccount(j.run, j.account);
        j.note("The old password is refused at the practice copy; the new one signs in.");
      },
    },
    {
      id: "auth-dead-link",
      what: "The used link, opened again, still shows Continue; pressing it reads \"This reset link has already been used, or it has expired. Reset links work once.\", and \"Send a new reset link\" opens the login screen in its forgot mode",
      async run(j) {
        await j.newVisit();
        const { page, expect } = j;
        await openTheLink(page, j.state.link);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(page.getByText("This reset link has already been used, or it has expired. Reset links work once.", { exact: true })).toBeVisible();
        await j.snap("used");
        await page.getByRole("button", { name: "Send a new reset link" }).click();
        await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
        await expect(page.getByPlaceholder("Password", { exact: true })).toHaveCount(0);
      },
      console: [/status of 403/],
    },
    {
      id: "auth-redirect-notices",
      what: "Arriving from a failed auth redirect shows one notice above the login form, chosen from the error (a used email link, an expired Google sign-in, anything else); the error leaves the address bar, so a reload shows the landing page",
      async run(j) {
        const { expect } = j;
        for (const [address, notice] of [
          ["/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", EMAIL_LINK_NOTICE],
          ["/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+parameter+missing", "That Google sign-in link expired. Try continuing with Google again."],
          ["/?error=server_error&error_description=Unexpected+failure", "Google sign-in didn't finish. Try again when you're ready."],
        ]) {
          await j.newVisit();
          await j.open(address);
          await expect(j.page.getByText(notice, { exact: true })).toBeVisible();
          await expect(j.page.getByPlaceholder("you@example.com")).toBeVisible();
          const left = new URL(j.page.url());
          if (left.search.includes("error") || left.hash.includes("error")) throw new Error(`The error stayed in the address bar: ${left.search}${left.hash}`);
          if (notice === EMAIL_LINK_NOTICE) await j.snap("used-email-link");
          await j.page.reload();
          await expect(landingLogIn(j.page)).toBeVisible();
        }
      },
    },
  ],
};
