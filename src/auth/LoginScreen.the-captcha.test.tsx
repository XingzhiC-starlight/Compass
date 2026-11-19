import { act, Component, type ForwardedRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_SOLVE_AGAIN =
  'After a refused reset request the verification check must be solved again: pressing "Send reset link" before that shows "Complete the verification check to continue." and sends nothing';
const CHECK_RESEND_COUNTDOWN =
  'A refused resend restarts the countdown: the resend button reads "Resend in 60s" again and cannot be pressed until the countdown ends. A resend blocked with "Complete the verification check to continue." restarts nothing: the button still reads "Resend reset link" and can be pressed';
const CHECK_LIGHT = "The CAPTCHA is asked for its light look, on the form and on the resend";
const CHECK_SIZE =
  "At phone width (375px) the compact CAPTCHA is the one asked for; at laptop width (1280px) the normal one";

const VERIFY_FIRST = "Complete the verification check to continue.";
const ADDRESS = "builder@example.com";
const PASSWORD = "Quiet-Harbor7!";

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

function askedFor(): { theme: string; size: string } {
  const widget = captcha.mounted[captcha.mounted.length - 1];
  return {
    theme: widget?.props.options?.theme ?? "auto (none asked for — it follows the computer)",
    size: widget?.props.options?.size ?? "normal",
  };
}

function authApiError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { name: "AuthApiError", status, code, __isAuthError: true });
}

function serverRefusal(): Error {
  return authApiError("Error sending recovery email", 500, "unexpected_failure");
}

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

describe("the verification check after a refusal", () => {
  it(`${CHECK_SOLVE_AGAIN}`, async () => {
    seam.sendPasswordReset.mockRejectedValueOnce(serverRefusal());
    await openForgotAndFill(true);
    await press("Send reset link");

    expect(seam.sendPasswordReset, "harness: the first request went out").toHaveBeenCalledTimes(1);
    expect(cardOnScreen(), "after the refusal").toBe("the forgot form");
    expect(screenText()).not.toContain(VERIFY_FIRST);

    await press("Send reset link");

    expect(screenText()).toContain(VERIFY_FIRST);
    expect(seam.sendPasswordReset, "nothing more was sent").toHaveBeenCalledTimes(1);
    expect(cardOnScreen()).toBe("the forgot form");
    expect(emailField()?.value).toBe(ADDRESS);
  });
});

describe("a resend blocked by the verification check", () => {
  it.each([["reset"], ["confirmation"]] as Array<[Flow]>)(
    `${CHECK_RESEND_COUNTDOWN} — a blocked resend of the %s link sends nothing, starts no countdown, and the button still works`,
    async (flow) => {
      await reachInbox(flow, true);
      await waitOutTheCountdown(flow);
      const before = sendsSoFar(flow);

      await press(RESEND_LABEL[flow]);

      expect(screenText()).toContain(VERIFY_FIRST);
      expect(sendsSoFar(flow), "a blocked resend sends nothing").toBe(before);
      expect(resendButtonLabel(), "the resend button, right after the blocked resend").toBe(
        RESEND_LABEL[flow],
      );
      expect(cannotBePressed(resendButton()!), `"${RESEND_LABEL[flow]}" cannot be pressed`).toBe(false);

      await passSeconds(5);
      expect(resendButtonLabel(), "a few seconds after the blocked resend").toBe(RESEND_LABEL[flow]);
      expect(cannotBePressed(resendButton()!), `"${RESEND_LABEL[flow]}" cannot be pressed`).toBe(false);

      await solveCaptcha("captcha-token-resend");
      await press(RESEND_LABEL[flow]);
      expect(sendsSoFar(flow), "once the check is solved, the press sends the resend").toBe(before + 1);
    },
  );

  it.each([["reset"], ["confirmation"]] as Array<[Flow]>)(
    `${CHECK_RESEND_COUNTDOWN} — the two together, resending the %s link: a refused resend restarts the countdown, and a blocked press after it has ended restarts nothing`,
    async (flow) => {
      const sent = await refuseOneResend(flow, true, serverRefusal);
      expect(resendButtonLabel(), "the resend button, right after the refused resend").toBe(
        "Resend in 60s",
      );

      await passSeconds(61);
      expect(resendButtonLabel(), "once the restarted countdown has ended").toBe(RESEND_LABEL[flow]);

      await press(RESEND_LABEL[flow]);

      expect(screenText()).toContain(VERIFY_FIRST);
      expect(sendsSoFar(flow), "a blocked resend sends nothing").toBe(sent);
      expect(resendButtonLabel(), "the resend button, right after the blocked resend").toBe(
        RESEND_LABEL[flow],
      );
      expect(cannotBePressed(resendButton()!), `"${RESEND_LABEL[flow]}" cannot be pressed`).toBe(false);
    },
  );
});

describe("the CAPTCHA the login screen asks for", () => {
  const FORMS: Array<[string, () => Promise<void>, (width: number) => Promise<void>]> = [
    ["the sign-in form", () => openLogin({ mode: "signin", withCaptcha: true }), (width) => openLogin({ mode: "signin", withCaptcha: true, width })],
    ["the register form", () => openRegister(true), (width) => openRegister(true, width)],
    ["the forgot form", () => openLogin({ mode: "forgot", withCaptcha: true }), (width) => openLogin({ mode: "forgot", withCaptcha: true, width })],
  ];

  it.each(FORMS)(`${CHECK_LIGHT} — on %s`, async (_form, open) => {
    await open();

    expect(captcha.mounted.length, "harness: the form shows a CAPTCHA").toBeGreaterThan(0);
    expect(askedFor().theme).toBe("light");
  });

  it.each([["reset"], ["confirmation"]] as Array<[Flow]>)(
    `${CHECK_LIGHT} — on the resend of the %s link`,
    async (flow) => {
      await reachInbox(flow, true);
      await waitOutTheCountdown(flow);

      expect(captcha.mounted.length, "harness: the resend panel shows a CAPTCHA").toBeGreaterThan(0);
      expect(askedFor().theme).toBe("light");
    },
  );

  it.each(FORMS)(`${CHECK_SIZE} — on %s`, async (_form, _open, openAt) => {
    await openAt(375);
    expect(captcha.mounted.length, "harness: the form shows a CAPTCHA at 375px").toBeGreaterThan(0);
    const onPhone = askedFor().size;
    await closeLogin();

    await openAt(1280);
    expect(captcha.mounted.length, "harness: the form shows a CAPTCHA at 1280px").toBeGreaterThan(0);
    const onLaptop = askedFor().size;

    expect.soft(onPhone, "the box asked for at 375px").toBe("compact");
    expect.soft(onLaptop, "the box asked for at 1280px").toBe("normal");
  });

  it(`${CHECK_SIZE} — on the resend`, async () => {
    await reachInbox("reset", true, 375);
    await waitOutTheCountdown("reset");
    expect(captcha.mounted.length, "harness: the resend panel shows a CAPTCHA at 375px").toBeGreaterThan(0);
    const onPhone = askedFor().size;
    await closeLogin();

    await reachInbox("reset", true, 1280);
    await waitOutTheCountdown("reset");
    expect(captcha.mounted.length, "harness: the resend panel shows a CAPTCHA at 1280px").toBeGreaterThan(0);
    const onLaptop = askedFor().size;

    expect.soft(onPhone, "the box asked for at 375px").toBe("compact");
    expect.soft(onLaptop, "the box asked for at 1280px").toBe("normal");
  });
});
