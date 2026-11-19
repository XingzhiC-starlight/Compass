import { act, Component, type ForwardedRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK_LIGHT = "The CAPTCHA is asked for its light look, on the form and on the resend";
const CHECK_SIZE =
  "At phone width (375px) the compact CAPTCHA is the one asked for; at laptop width (1280px) the normal one";

type FakeCaptchaProps = {
  siteKey?: string;
  onSuccess?: (token: string) => void;
  options?: { theme?: string; size?: string; action?: string };
};
type FakeCaptcha = { props: FakeCaptchaProps };

const captcha = vi.hoisted(() => ({
  mounted: [] as Array<{
    props: {
      siteKey?: string;
      onSuccess?: (token: string) => void;
      options?: { theme?: string; size?: string; action?: string };
    };
  }>,
}));

vi.mock("@marsidev/react-turnstile", async () => {
  const React = await import("react");
  const Turnstile = React.forwardRef(function FakeTurnstile(
    props: FakeCaptchaProps,
    ref: ForwardedRef<unknown>,
  ) {
    const self = React.useRef<FakeCaptcha | null>(null);
    if (self.current === null) self.current = { props };
    self.current.props = props;

    React.useEffect(() => {
      const me = self.current as FakeCaptcha;
      captcha.mounted.push(me);
      return () => {
        const at = captcha.mounted.indexOf(me);
        if (at >= 0) captcha.mounted.splice(at, 1);
      };
    }, []);

    React.useImperativeHandle(ref, () => ({
      render: () => "fake-widget",
      execute: () => undefined,
      reset: () => undefined,
      remove: () => undefined,
      getResponse: () => undefined,
      getResponsePromise: () => new Promise<string>(() => undefined),
      isExpired: () => false,
    }));

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

function mediaMatches(query: string, width: number, dark: boolean): boolean {
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
        if (condition.includes("prefers-color-scheme")) return condition.includes("dark") === dark;
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

function pretendDevice(width: number, dark: boolean): void {
  setProperty(window, "innerWidth", width);
  setProperty(window, "outerWidth", width);
  setProperty(document.documentElement, "clientWidth", width);
  setProperty(window.screen, "width", width);
  setProperty(window.screen, "availWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mediaMatches(query, width, dark),
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

function forgetDevice(): void {
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

async function settle(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function showCaptcha(device: { width: number; dark?: boolean; action: string }): Promise<void> {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
  pretendDevice(device.width, device.dark ?? false);
  vi.resetModules();
  const { default: AuthTurnstile, isTurnstileConfigured } = await import("./AuthTurnstile");
  expect(isTurnstileConfigured(), "harness: the public site key is present").toBe(true);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Boundary>
        <AuthTurnstile action={device.action} onToken={() => {}} onClear={() => {}} />
      </Boundary>,
    );
  });
  await settle();
}

async function closeCaptcha(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  captcha.mounted.length = 0;
}

function askedFor(): { widgets: number; theme: string; size: string } {
  const widget = captcha.mounted[captcha.mounted.length - 1];
  return {
    widgets: captcha.mounted.length,
    theme: widget?.props.options?.theme ?? "auto (none asked for — it follows the computer)",
    size: widget?.props.options?.size ?? "normal",
  };
}

afterEach(async () => {
  await closeCaptcha();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  forgetDevice();
});

describe("the look Compass asks Cloudflare for", () => {
  it.each([["a form's check"], ["the resend's check"]])(
    `${CHECK_LIGHT} — mounted for %s`,
    async (where) => {
      await showCaptcha({ width: 1280, action: where === "a form's check" ? "forgot" : "resend" });

      expect(askedFor().widgets, "harness: the CAPTCHA is on screen").toBe(1);
      expect(askedFor().theme).toBe("light");
    },
  );

  it(`${CHECK_LIGHT} — still light when the computer is in dark mode`, async () => {
    await showCaptcha({ width: 1280, dark: true, action: "forgot" });

    expect(askedFor().widgets, "harness: the CAPTCHA is on screen").toBe(1);
    expect(askedFor().theme).toBe("light");
  });

  it(`${CHECK_LIGHT} — still light on a phone`, async () => {
    await showCaptcha({ width: 375, dark: true, action: "forgot" });

    expect(askedFor().widgets, "harness: the CAPTCHA is on screen").toBe(1);
    expect(askedFor().theme).toBe("light");
  });
});

describe("the box Compass asks Cloudflare for", () => {
  it(`${CHECK_SIZE}`, async () => {
    await showCaptcha({ width: 375, action: "forgot" });
    expect(askedFor().widgets, "harness: the CAPTCHA is on screen at 375px").toBe(1);
    const onPhone = askedFor().size;
    await closeCaptcha();

    await showCaptcha({ width: 1280, action: "forgot" });
    expect(askedFor().widgets, "harness: the CAPTCHA is on screen at 1280px").toBe(1);
    const onLaptop = askedFor().size;

    expect.soft(onPhone, "the box asked for at 375px").toBe("compact");
    expect.soft(onLaptop, "the box asked for at 1280px").toBe("normal");
  });
});
