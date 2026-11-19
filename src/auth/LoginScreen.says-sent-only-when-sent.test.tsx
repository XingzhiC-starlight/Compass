import { act, Component, type ForwardedRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_WAITING =
  'While a reset request waits for its answer, the forgot form stays on screen, its button reads "One moment…" and cannot be pressed again, and neither "Email sent" nor "Check your email" is shown';
const CHECK_ACCEPTED =
  'An accepted reset request shows the inbox state: "Email sent", "Check your email", "If that address has a Compass account, a reset link is on its way to {address}." and the address in the pill';
const CHECK_REFUSED =
  'A refused reset request — refused by the server, or failed on the network — leaves the forgot form on screen with the address still in its field and "Something didn\'t go through — try again in a moment."; neither "Email sent" nor "Check your email" appears';
const CHECK_TOO_OFTEN =
  "A reset request refused for asking too often shows that same general line and no other";
const CHECK_SECOND_TRY =
  "After a refused reset request, a second request that is accepted shows the inbox state";
const CHECK_REFUSED_RESEND =
  'From the inbox state, a refused resend keeps "Check your email" on screen and shows the error inside the "Didn\'t get the email?" panel';
const CHECK_RESEND_COUNTDOWN =
  'A refused resend restarts the countdown: the resend button reads "Resend in 60s" again and cannot be pressed until the countdown ends. A resend blocked with "Complete the verification check to continue." restarts nothing: the button still reads "Resend reset link" and can be pressed';
const CHECK_REGISTRATION =
  "Registration is unchanged: a refused registration stays on its form, and an accepted one that needs confirmation shows the inbox state";
const CHECK_SENDING =
  'While a resend is being sent, the resend button reads "Sending…" and cannot be pressed';

const GENERAL_ERROR = "Something didn't go through — try again in a moment.";
const ADDRESS = "builder@example.com";
const PASSWORD = "Quiet-Harbor7!";
const RESET_BODY = `If that address has a Compass account, a reset link is on its way to ${ADDRESS}.`;
const CONFIRM_BODY = `If this address can create or confirm a Compass account, a confirmation link will arrive at ${ADDRESS}.`;

type Flow = "reset" | "confirmation";
const RESEND_LABEL: Record<Flow, string> = {
  reset: "Resend reset link",
  confirmation: "Resend confirmation link",
};

const seam = vi.hoisted(() => ({
  sendPasswordReset: vi.fn<(email: string, captchaToken?: string) => Promise<void>>(),
  signUpWithEmail:
    vi.fn<
      (email: string, password: string, captchaToken?: string) => Promise<{ needsConfirmation: boolean }>
    >(),
  resendEmailConfirmation: vi.fn<(email: string, captchaToken?: string) => Promise<void>>(),
}));

vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();

  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    safe[name] =
      typeof value === "function"
        ? vi.fn(async () => {
            throw new Error(`LoginScreen test: unexpected seam call ${name}()`);
          })
        : value;
  }

  return {
    ...safe,
    sendPasswordReset: seam.sendPasswordReset,
    signUpWithEmail: seam.signUpWithEmail,
    resendEmailConfirmation: seam.resendEmailConfirmation,
  };
});

type FakeCaptchaProps = {
  siteKey?: string;
  onSuccess?: (token: string) => void;
  options?: { theme?: string; size?: string; action?: string };
};
type FakeCaptcha = { props: FakeCaptchaProps; token: string | undefined };

const captcha = vi.hoisted(() => ({
  mounted: [] as Array<{
    props: {
      siteKey?: string;
      onSuccess?: (token: string) => void;
      options?: { theme?: string; size?: string; action?: string };
    };
    token: string | undefined;
  }>,
}));

vi.mock("@marsidev/react-turnstile", async () => {
  const React = await import("react");
  const Turnstile = React.forwardRef(function FakeTurnstile(
    props: FakeCaptchaProps,
    ref: ForwardedRef<unknown>,
  ) {
    const self = React.useRef<FakeCaptcha | null>(null);
    if (self.current === null) self.current = { props, token: undefined };
    self.current.props = props;

    React.useEffect(() => {
      const me = self.current as FakeCaptcha;
      captcha.mounted.push(me);
      return () => {
        const at = captcha.mounted.indexOf(me);
        if (at >= 0) captcha.mounted.splice(at, 1);
      };
    }, []);

    React.useImperativeHandle(ref, () => {
      const me = self.current as FakeCaptcha;
      return {
        render: () => "fake-widget",
        execute: () => undefined,
        reset: () => {
          me.token = undefined;
        },
        remove: () => {
          me.token = undefined;
        },
        getResponse: () => me.token,
        getResponsePromise: () =>
          me.token !== undefined ? Promise.resolve(me.token) : new Promise<string>(() => undefined),
        isExpired: () => false,
      };
    });

    return React.createElement("div", { "data-fake-captcha": "" });
  });

  return {
    Turnstile,
    SCRIPT_URL: "https://challenges.cloudflare.com/turnstile/v0/api.js",
    DEFAULT_SCRIPT_ID: "cf-turnstile-script",
    DEFAULT_CONTAINER_ID: "cf-turnstile",
    DEFAULT_ONLOAD_NAME: "onloadTurnstileCallback",
  };
});

function mediaMatches(query: string, width: number): boolean {
  return query
    .toLowerCase()
    .split(",")
    .some((part) => {
      const conditions = part.match(/\([^)]*\)/g) ?? [];
      if (conditions.length === 0) return false;
      return conditions.every((condition) => {
        const px = (amount: string, unit: string) => Number(amount) * (unit === "px" ? 1 : 16);
        let m = condition.match(/max-width:\s*([\d.]+)(px|em|rem)/);
        if (m) return width <= px(m[1], m[2]);
        m = condition.match(/min-width:\s*([\d.]+)(px|em|rem)/);
        if (m) return width >= px(m[1], m[2]);
        m = condition.match(/width\s*(<=|>=|<|>)\s*([\d.]+)(px|em|rem)/);
        if (m) {
          const limit = px(m[2], m[3]);
          if (m[1] === "<=") return width <= limit;
          if (m[1] === ">=") return width >= limit;
          if (m[1] === "<") return width < limit;
          return width > limit;
        }
        return false;
      });
    });
}

function setProperty(target: object, name: string, value: number): void {
  try {
    Object.defineProperty(target, name, { configurable: true, writable: true, value });
  } catch {
    (target as Record<string, unknown>)[name] = value;
  }
}

function pretendScreenWidth(width: number): void {
  setProperty(window, "innerWidth", width);
  setProperty(window, "outerWidth", width);
  setProperty(document.documentElement, "clientWidth", width);
  setProperty(window.screen, "width", width);
  setProperty(window.screen, "availWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mediaMatches(query, width),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function forgetScreenWidth(): void {
  setProperty(window, "innerWidth", 1024);
  setProperty(window, "outerWidth", 1024);
  delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
  delete (window.screen as unknown as Record<string, unknown>).width;
  delete (window.screen as unknown as Record<string, unknown>).availWidth;
}

class Boundary extends Component<{ children: ReactNode }, { crash: string | null }> {
  state: { crash: string | null } = { crash: null };
  static getDerivedStateFromError(error: unknown): { crash: string } {
    return { crash: error instanceof Error ? error.message : String(error) };
  }
  render(): ReactNode {
    if (this.state.crash !== null) return <p>[the screen crashed: {this.state.crash}]</p>;
    return this.props.children;
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      else await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function passSeconds(seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

type OpenOptions = { mode?: "signin" | "forgot"; withCaptcha: boolean; width?: number };

async function openLogin({ mode = "signin", withCaptcha, width = 1280 }: OpenOptions): Promise<void> {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", withCaptcha ? "1x00000000000000000000AA" : "");
  pretendScreenWidth(width);
  vi.resetModules();
  const { default: LoginScreen } = await import("./LoginScreen");
  const { isTurnstileConfigured } = await import("./AuthTurnstile");
  expect(isTurnstileConfigured(), "harness: whether the CAPTCHA site key is present").toBe(
    withCaptcha,
  );

  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Boundary>
        <LoginScreen initialMode={mode} onBack={() => {}} />
      </Boundary>,
    );
  });
  await settle();
}

async function closeLogin(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  vi.useRealTimers();
  captcha.mounted.length = 0;
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

function screenText(): string {
  return tidy(container?.textContent);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container?.querySelectorAll("button") ?? []);
}

function buttonLabels(): string[] {
  return buttons().map((b) => tidy(b.textContent));
}

function button(label: string): HTMLButtonElement | null {
  return buttons().find((b) => tidy(b.textContent) === label) ?? null;
}

function clickable(label: string): HTMLElement | null {
  const all = Array.from(
    container?.querySelectorAll<HTMLElement>("button, a, [role='button'], [role='link']") ?? [],
  );
  return all.find((el) => tidy(el.textContent) === label) ?? null;
}

function cannotBePressed(b: HTMLButtonElement): boolean {
  return b.disabled || b.getAttribute("aria-disabled") === "true";
}

function emailField(): HTMLInputElement | null {
  return (
    container?.querySelector<HTMLInputElement>('input[placeholder="you@example.com"]') ??
    container?.querySelector<HTMLInputElement>('input[type="email"]') ??
    null
  );
}

function passwordFields(): HTMLInputElement[] {
  return Array.from(container?.querySelectorAll<HTMLInputElement>('input[type="password"]') ?? []);
}

function cardOnScreen(): string {
  const text = screenText();
  if (text.includes("[the screen crashed")) return text;
  const inbox = text.includes("Check your email") || text.includes("Email sent");
  const form = emailField() !== null;
  if (inbox && form) return "the inbox state and a form at once";
  if (inbox) return "the inbox state";
  if (!form) return "neither a form nor the inbox state";
  const passwords = passwordFields().length;
  if (passwords === 0) return "the forgot form";
  return passwords === 1 ? "the sign-in form" : "the register form";
}

function resendPanel(): HTMLElement | null {
  let heading: HTMLElement | null = null;
  for (const el of Array.from(container?.querySelectorAll<HTMLElement>("*") ?? [])) {
    const text = tidy(el.textContent);
    if (!text.includes("Didn't get the email?")) continue;
    if (heading === null || text.length <= tidy(heading.textContent).length) heading = el;
  }
  let region: HTMLElement | null = heading;
  while (region !== null && region !== container) {
    const holdsResend = Array.from(region.querySelectorAll("button")).some((b) =>
      /^(Resend|Sending)/.test(tidy(b.textContent)),
    );
    if (holdsResend) return region;
    region = region.parentElement;
  }
  return null;
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function press(label: string): Promise<void> {
  const target = button(label);
  expect(target, `a "${label}" button to press (buttons on screen: ${buttonLabels().join(" | ")})`).not.toBeNull();
  await act(async () => {
    target!.click();
  });
  await settle();
}

async function follow(...labels: string[]): Promise<void> {
  const target = labels.map(clickable).find((el) => el !== null) ?? null;
  expect(target, `a "${labels[0]}" link to follow`).not.toBeNull();
  await act(async () => {
    target!.click();
  });
  await settle();
}

async function solveCaptcha(token: string): Promise<void> {
  const widget = captcha.mounted[captcha.mounted.length - 1];
  expect(widget, "harness: a CAPTCHA on screen to solve").toBeDefined();
  await act(async () => {
    widget.token = token;
    widget.props.onSuccess?.(token);
  });
  await settle(1);
}

async function fillForgotForm(withCaptcha: boolean, token = "captcha-token-1"): Promise<void> {
  expect(cardOnScreen(), "harness: the forgot form is open").toBe("the forgot form");
  await typeInto(emailField()!, ADDRESS);
  if (withCaptcha) await solveCaptcha(token);
}

async function openForgotAndFill(withCaptcha: boolean, width = 1280): Promise<void> {
  await openLogin({ mode: "forgot", withCaptcha, width });
  await fillForgotForm(withCaptcha);
}

async function openRegister(withCaptcha: boolean, width = 1280): Promise<void> {
  await openLogin({ mode: "signin", withCaptcha, width });
  await follow("New here? Create an account", "Create an account");
  expect(cardOnScreen(), "harness: the register form is open").toBe("the register form");
}

async function openRegisterAndFill(withCaptcha: boolean, width = 1280): Promise<void> {
  await openRegister(withCaptcha, width);
  await typeInto(emailField()!, ADDRESS);
  const [password, confirm] = passwordFields();
  await typeInto(password, PASSWORD);
  await typeInto(confirm, PASSWORD);
  if (withCaptcha) await solveCaptcha("captcha-token-register");
}

async function reachInbox(flow: Flow, withCaptcha: boolean, width = 1280): Promise<void> {
  if (flow === "reset") {
    await openForgotAndFill(withCaptcha, width);
    await press("Send reset link");
  } else {
    await openRegisterAndFill(withCaptcha, width);
    await press("Create account");
  }
  await settle();
  expect(cardOnScreen(), "harness: an accepted request reaches the inbox state").toBe(
    "the inbox state",
  );
}

async function waitOutTheCountdown(flow: Flow): Promise<void> {
  await passSeconds(61);
  expect(buttonLabels(), "harness: after 60 seconds the resend button is ready").toContain(
    RESEND_LABEL[flow],
  );
}

function sendsSoFar(flow: Flow): number {
  return flow === "reset"
    ? seam.sendPasswordReset.mock.calls.length
    : seam.resendEmailConfirmation.mock.calls.length;
}

function resendButton(): HTMLButtonElement | null {
  return buttons().find((b) => /^(Resend|Sending)/.test(tidy(b.textContent))) ?? null;
}

function resendButtonLabel(): string {
  const found = resendButton();
  return found === null
    ? `no resend button (buttons on screen: ${buttonLabels().join(" | ")})`
    : tidy(found.textContent);
}

async function pressResendButtonAnyway(): Promise<void> {
  const target = resendButton();
  expect(target, "a resend button to press").not.toBeNull();
  await act(async () => {
    target!.click();
  });
  await settle();
}

async function refuseOneResend(
  flow: Flow,
  withCaptcha: boolean,
  makeError: () => Error,
): Promise<number> {
  if (flow === "reset") {
    seam.sendPasswordReset.mockResolvedValueOnce(undefined).mockRejectedValueOnce(makeError());
  } else {
    seam.resendEmailConfirmation.mockRejectedValueOnce(makeError());
  }
  await reachInbox(flow, withCaptcha);
  expect(resendButtonLabel(), "harness: a fresh inbox state starts its countdown at 60").toBe(
    "Resend in 60s",
  );
  await waitOutTheCountdown(flow);
  const before = sendsSoFar(flow);

  if (withCaptcha) await solveCaptcha("captcha-token-resend");
  await press(RESEND_LABEL[flow]);

  expect(sendsSoFar(flow), "harness: the resend went out").toBe(before + 1);
  expect(cardOnScreen(), "harness: a refused resend keeps the inbox state").toBe("the inbox state");
  return sendsSoFar(flow);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function authApiError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { name: "AuthApiError", status, code, __isAuthError: true });
}

function serverRefusal(): Error {
  return authApiError("Error sending recovery email", 500, "unexpected_failure");
}

type Refusal = [how: string, makeError: () => Error];

const REFUSALS: Refusal[] = [
  ["refused by the server (the incident: a 500 about the recovery email)", serverRefusal],
  ["failed on the network (the browser could not reach Supabase)", () => new TypeError("Failed to fetch")],
  [
    "failed on the network (Supabase's own fetch error)",
    () =>
      Object.assign(new Error("Failed to fetch"), {
        name: "AuthRetryableFetchError",
        status: 0,
        __isAuthError: true,
      }),
  ],
];

const TOO_OFTEN: Refusal[] = [
  [
    "the per-address wait",
    () =>
      authApiError(
        "For security purposes, you can only request this after 52 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
  ],
  ["the email rate limit", () => authApiError("email rate limit exceeded", 429, "over_email_send_rate_limit")],
  ["the request rate limit", () => authApiError("Request rate limit reached", 429, "over_request_rate_limit")],
];

const REFUSED_RESENDS: Array<[flow: Flow, how: string, makeError: () => Error]> = [
  ["reset", "refused by the server", serverRefusal],
  ["reset", "failed on the network", () => new TypeError("Failed to fetch")],
  ["reset", "refused for asking too often", TOO_OFTEN[0][1]],
  ["confirmation", "refused by the server", serverRefusal],
  ["confirmation", "refused for asking too often", TOO_OFTEN[0][1]],
];

beforeEach(() => {
  seam.sendPasswordReset.mockReset();
  seam.sendPasswordReset.mockResolvedValue(undefined);
  seam.signUpWithEmail.mockReset();
  seam.signUpWithEmail.mockResolvedValue({ needsConfirmation: true });
  seam.resendEmailConfirmation.mockReset();
  seam.resendEmailConfirmation.mockResolvedValue(undefined);
});

afterEach(async () => {
  await closeLogin();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  forgetScreenWidth();
});

describe.each([
  ["with the CAPTCHA configured, as on the live site", true],
  ["without a CAPTCHA site key (I6)", false],
] as Array<[string, boolean]>)("%s", (_setup, withCaptcha) => {
  it(`${CHECK_WAITING} — the form stays and nothing says an email was sent`, async () => {
    seam.sendPasswordReset.mockReturnValue(deferred<void>().promise);
    await openForgotAndFill(withCaptcha);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the forgot form");
    expect(emailField()?.value).toBe(ADDRESS);
    expect(screenText()).not.toContain("Email sent");
    expect(screenText()).not.toContain("Check your email");
    expect(screenText()).not.toContain("a reset link is on its way");
  });

  it(`${CHECK_WAITING} — the button reads "One moment…" and a second press sends nothing`, async () => {
    seam.sendPasswordReset.mockReturnValue(deferred<void>().promise);
    await openForgotAndFill(withCaptcha);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(buttonLabels()).toContain("One moment…");
    expect(buttonLabels()).not.toContain("Send reset link");

    const busy = button("One moment…")!;
    expect(cannotBePressed(busy), '"One moment…" cannot be pressed').toBe(true);
    await act(async () => {
      busy.click();
    });
    await settle();
    expect(seam.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it(`${CHECK_WAITING} — and a slow answer changes nothing: half a minute later it is still so`, async () => {
    seam.sendPasswordReset.mockReturnValue(deferred<void>().promise);
    await openForgotAndFill(withCaptcha);
    await press("Send reset link");
    await passSeconds(30);

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the forgot form");
    expect(buttonLabels()).toContain("One moment…");
    expect(screenText()).not.toContain("Email sent");
    expect(screenText()).not.toContain("Check your email");
  });

  it(`${CHECK_ACCEPTED} — shown once the request has been accepted, not before`, async () => {
    const answer = deferred<void>();
    seam.sendPasswordReset.mockReturnValue(answer.promise);
    await openForgotAndFill(withCaptcha);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(seam.sendPasswordReset.mock.calls[0][0]).toBe(ADDRESS);
    expect(cardOnScreen(), "before Supabase has accepted the request").toBe("the forgot form");

    await act(async () => {
      answer.resolve();
    });
    await settle();

    expect(cardOnScreen(), "once Supabase has accepted the request").toBe("the inbox state");
    expect(screenText()).toContain("Email sent");
    expect(screenText()).toContain("Check your email");
    expect(screenText()).toContain(RESET_BODY);
    expect(occurrences(screenText(), ADDRESS)).toBeGreaterThanOrEqual(2);
    expect(screenText()).not.toContain(GENERAL_ERROR);
  });

  it.each(REFUSALS)(`${CHECK_REFUSED} — %s`, async (_how, makeError) => {
    seam.sendPasswordReset.mockRejectedValueOnce(makeError());
    await openForgotAndFill(withCaptcha);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the forgot form");
    expect(emailField()?.value, "the address is still in its field").toBe(ADDRESS);
    expect(screenText()).toContain(GENERAL_ERROR);
    expect(screenText()).not.toContain("Email sent");
    expect(screenText()).not.toContain("Check your email");
    expect(screenText()).not.toContain("a reset link is on its way");

    expect(buttonLabels()).toContain("Send reset link");
    expect(cannotBePressed(button("Send reset link")!), '"Send reset link" cannot be pressed').toBe(false);
  });

  it(`${CHECK_REFUSED} — the same when the forgot form was reached through "Forgot password?"`, async () => {
    seam.sendPasswordReset.mockRejectedValueOnce(serverRefusal());
    await openLogin({ mode: "signin", withCaptcha });
    await follow("Forgot password?");
    await fillForgotForm(withCaptcha);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the forgot form");
    expect(emailField()?.value, "the address is still in its field").toBe(ADDRESS);
    expect(screenText()).toContain(GENERAL_ERROR);
    expect(screenText()).not.toContain("Email sent");
    expect(screenText()).not.toContain("Check your email");
  });

  it.each(TOO_OFTEN)(`${CHECK_TOO_OFTEN} — %s`, async (_which, makeError) => {
    const refusal = makeError();
    seam.sendPasswordReset.mockRejectedValueOnce(refusal);
    await openLogin({ mode: "forgot", withCaptcha });
    const untouchedForm = screenText();
    await fillForgotForm(withCaptcha);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the forgot form");
    expect(occurrences(screenText(), GENERAL_ERROR), "the general line, once").toBe(1);
    expect(screenText(), "Supabase's own wording stays off the screen").not.toContain(refusal.message);
    expect(tidy(screenText().replace(GENERAL_ERROR, ""))).toBe(untouchedForm);
  });

  it(`${CHECK_SECOND_TRY}`, async () => {
    seam.sendPasswordReset.mockRejectedValueOnce(serverRefusal()).mockResolvedValueOnce(undefined);
    await openForgotAndFill(withCaptcha, 1280);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the first request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen(), "after the refusal").toBe("the forgot form");

    if (withCaptcha) await solveCaptcha("captcha-token-2");
    await press("Send reset link");

    expect(seam.sendPasswordReset, "the second request went out").toHaveBeenCalledTimes(2);
    expect(seam.sendPasswordReset.mock.calls[1][0]).toBe(ADDRESS);
    if (withCaptcha) {
      expect(seam.sendPasswordReset.mock.calls[1][1], "the fresh answer travels, not the spent one").toBe(
        "captcha-token-2",
      );
    }
    expect(cardOnScreen(), "after the accepted second request").toBe("the inbox state");
    expect(screenText()).toContain("Email sent");
    expect(screenText()).toContain("Check your email");
    expect(screenText()).toContain(RESET_BODY);
    expect(screenText()).not.toContain(GENERAL_ERROR);
  });

  it.each([["reset"], ["confirmation"]] as Array<[Flow]>)(
    `${CHECK_REFUSED_RESEND} — resending the %s link`,
    async (flow) => {
      if (flow === "reset") {
        seam.sendPasswordReset.mockResolvedValueOnce(undefined).mockRejectedValueOnce(serverRefusal());
      } else {
        seam.resendEmailConfirmation.mockRejectedValueOnce(serverRefusal());
      }
      await reachInbox(flow, withCaptcha);
      await waitOutTheCountdown(flow);
      expect(screenText(), "no error before the resend").not.toContain(GENERAL_ERROR);
      const before = sendsSoFar(flow);

      if (withCaptcha) await solveCaptcha("captcha-token-resend");
      await press(RESEND_LABEL[flow]);

      expect(sendsSoFar(flow), "harness: the resend went out").toBe(before + 1);
      expect(cardOnScreen()).toBe("the inbox state");
      expect(screenText()).toContain("Check your email");

      const panel = resendPanel();
      expect(panel, 'the "Didn\'t get the email?" panel').not.toBeNull();
      const panelText = tidy(panel!.textContent);
      expect(panelText, "the panel is a region of the card, not the whole card").not.toContain(
        "Check your email",
      );
      expect(panelText).toContain(GENERAL_ERROR);
      expect(occurrences(screenText(), GENERAL_ERROR), "the error shows once, in the panel").toBe(1);
    },
  );

  it.each(REFUSED_RESENDS)(
    `${CHECK_RESEND_COUNTDOWN} — resending the %s link, %s: the button reads "Resend in 60s" again and a press sends nothing`,
    async (flow, _how, makeError) => {
      const sent = await refuseOneResend(flow, withCaptcha, makeError);

      expect(resendButtonLabel(), "the resend button, right after the refused resend").toBe(
        "Resend in 60s",
      );
      expect(buttonLabels()).not.toContain(RESEND_LABEL[flow]);
      expect(cannotBePressed(resendButton()!), '"Resend in 60s" cannot be pressed').toBe(true);

      await pressResendButtonAnyway();
      expect(sendsSoFar(flow), "a press during the countdown sends nothing").toBe(sent);
      expect(cardOnScreen()).toBe("the inbox state");
    },
  );

  it.each([["reset"], ["confirmation"]] as Array<[Flow]>)(
    `${CHECK_RESEND_COUNTDOWN} — resending the %s link: it stays locked through the minute, and can be pressed again once the countdown ends`,
    async (flow) => {
      const sent = await refuseOneResend(flow, withCaptcha, serverRefusal);

      await passSeconds(30);
      const partWay = resendButtonLabel().match(/^Resend in (\d+)s$/);
      expect(partWay, `half a minute in, the button reads "Resend in Ns" (it reads "${resendButtonLabel()}")`).not.toBeNull();
      expect(Number(partWay![1]), "the seconds left, half a minute in").toBeGreaterThan(0);
      expect(Number(partWay![1]), "the seconds left, half a minute in").toBeLessThan(60);
      expect(cannotBePressed(resendButton()!), "half a minute in, the button cannot be pressed").toBe(true);
      await pressResendButtonAnyway();
      expect(sendsSoFar(flow), "a press half a minute in sends nothing").toBe(sent);

      await passSeconds(29);
      expect(resendButtonLabel(), "one second before the countdown ends").toMatch(/^Resend in \d+s$/);
      expect(cannotBePressed(resendButton()!), "one second before the end, the button cannot be pressed").toBe(true);

      await passSeconds(2);
      expect(resendButtonLabel(), "once the countdown has ended").toBe(RESEND_LABEL[flow]);
      expect(cannotBePressed(resendButton()!), `"${RESEND_LABEL[flow]}" cannot be pressed`).toBe(false);

      if (withCaptcha) await solveCaptcha("captcha-token-resend-2");
      await press(RESEND_LABEL[flow]);
      expect(sendsSoFar(flow), "the next try goes out once the minute is over").toBe(sent + 1);
    },
  );

  it.each([["reset"], ["confirmation"]] as Array<[Flow]>)(
    `${CHECK_SENDING} — resending the %s link`,
    async (flow) => {
      const never = deferred<void>().promise;
      if (flow === "reset") {
        seam.sendPasswordReset.mockResolvedValueOnce(undefined).mockReturnValueOnce(never);
      } else {
        seam.resendEmailConfirmation.mockReturnValueOnce(never);
      }
      await reachInbox(flow, withCaptcha);
      await waitOutTheCountdown(flow);
      const before = sendsSoFar(flow);

      if (withCaptcha) await solveCaptcha("captcha-token-resend");
      await press(RESEND_LABEL[flow]);

      expect(sendsSoFar(flow), "harness: the resend went out").toBe(before + 1);
      expect(buttonLabels()).toContain("Sending…");

      const busy = button("Sending…")!;
      expect(cannotBePressed(busy), '"Sending…" cannot be pressed').toBe(true);
      await act(async () => {
        busy.click();
      });
      await settle();
      expect(sendsSoFar(flow), "a press while sending sends nothing more").toBe(before + 1);
      expect(cardOnScreen()).toBe("the inbox state");
    },
  );

  it(`${CHECK_REGISTRATION} — a refused registration stays on its form`, async () => {
    seam.signUpWithEmail.mockRejectedValueOnce(authApiError("Database error saving new user", 500, "unexpected_failure"));
    await openRegisterAndFill(withCaptcha);
    await press("Create account");

    expect(seam.signUpWithEmail, "harness: the registration went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the register form");
    expect(emailField()?.value).toBe(ADDRESS);
    expect(screenText()).toContain(GENERAL_ERROR);
    expect(screenText()).not.toContain("Email sent");
    expect(screenText()).not.toContain("Check your email");
    expect(buttonLabels()).toContain("Create account");
  });

  it(`${CHECK_REGISTRATION} — an accepted one that needs confirmation shows the inbox state`, async () => {
    seam.signUpWithEmail.mockResolvedValueOnce({ needsConfirmation: true });
    await openRegisterAndFill(withCaptcha);
    await press("Create account");

    expect(seam.signUpWithEmail, "harness: the registration went out").toHaveBeenCalledTimes(1);
    expect(seam.signUpWithEmail.mock.calls[0][0]).toBe(ADDRESS);
    expect(cardOnScreen()).toBe("the inbox state");
    expect(screenText()).toContain("Email sent");
    expect(screenText()).toContain("Check your email");
    expect(screenText()).toContain(CONFIRM_BODY);
    expect(occurrences(screenText(), ADDRESS)).toBeGreaterThanOrEqual(2);
    expect(screenText()).not.toContain(GENERAL_ERROR);
  });
});
