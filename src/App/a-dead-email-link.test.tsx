import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seam = vi.hoisted(() => ({
  user: null as { id: string; email: string; name?: string } | null,
  authListeners: new Set<() => void>(),
  recoveryListeners: new Set<() => void>(),
  verifyRecoveryToken: vi.fn<(tokenHash: string) => Promise<void>>(),
}));

const KEEP_REAL = vi.hoisted(
  () =>
    new Set([
      "isPasswordRecoveryUrl",
      "getAuthRedirectError",
      "cleanAuthRedirectErrorUrl",
      "consumeAuthRedirectError",
      "getActiveProjectId",
      "todayDate",
    ]),
);

vi.mock("../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/db")>();

  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(real)) {
    safe[name] =
      typeof value === "function" && !KEEP_REAL.has(name)
        ? vi.fn(async () => {
            throw new Error(`App test: unexpected seam call ${name}()`);
          })
        : value;
  }

  return {
    ...safe,
    getCurrentUser: vi.fn(async () => seam.user),
    onAuthChange: vi.fn((cb: () => void) => {
      seam.authListeners.add(cb);
      return () => {
        seam.authListeners.delete(cb);
      };
    }),
    onPasswordRecovery: vi.fn((cb: () => void) => {
      seam.recoveryListeners.add(cb);
      return () => {
        seam.recoveryListeners.delete(cb);
      };
    }),
    onWriteError: vi.fn(() => () => {}),
    verifyRecoveryToken: seam.verifyRecoveryToken,
    getDashboardShellData: vi.fn(async () => ({ projects: [], archived: [], completion: {} })),
    listProjects: vi.fn(async () => []),
    listArchivedProjects: vi.fn(async () => []),
    listProjectCompletion: vi.fn(async () => ({})),
    setActiveProject: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    signInWithGoogle: vi.fn(async () => {}),
    signInWithEmail: vi.fn(async () => {}),
    signUpWithEmail: vi.fn(async () => ({ needsConfirmation: true })),
    resendEmailConfirmation: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    __setTestUser: vi.fn(),
  };
});

const EMAIL_LINK_NOTICE =
  "That link from your email no longer works. Links can be used once. If you were resetting your password, “Forgot password?” sends a new one; if you were confirming your account, try signing in.";
const GOOGLE_EXPIRED_NOTICE = "That Google sign-in link expired. Try continuing with Google again.";
const GOOGLE_GENERAL_NOTICE = "Google sign-in didn't finish. Try again when you're ready.";

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function waitFor(check: () => boolean, ms = 1500): Promise<void> {
  const start = Date.now();
  while (!check() && Date.now() - start < ms) {
    await settle(1);
  }
}

async function openCompassAt(address: string): Promise<void> {
  window.history.replaceState(null, "", address);
  vi.resetModules();
  const { default: App } = await import("../App");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<App />);
  });
  await settle();
}

function screenText(): string {
  return container.textContent ?? "";
}

function button(label: string): HTMLButtonElement | null {
  const all = Array.from(container.querySelectorAll("button"));
  return all.find((b) => (b.textContent ?? "").trim() === label) ?? null;
}

beforeEach(() => {
  seam.user = null;
  seam.authListeners.clear();
  seam.recoveryListeners.clear();
  seam.verifyRecoveryToken.mockReset();
  seam.verifyRecoveryToken.mockResolvedValue(undefined);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("a signed-out page load from a dead email link", () => {
  const DESCRIPTION = "error_description=Email+link+is+invalid+or+has+expired";
  const PARAMS = `error=access_denied&error_code=otp_expired&${DESCRIPTION}`;

  it.each([
    ["in the query string and after `#` (how Supabase sends it)", `/?${PARAMS}#${PARAMS}`],
    ["in the query string only", `/?${PARAMS}`],
    ["after `#` only", `/#${PARAMS}`],
  ])(
    "A signed-out page load whose address carries the `otp_expired` error shows the login screen with the email-link notice, and the address bar no longer holds the error parameters — error %s",
    async (_where, address) => {
      seam.user = null;
      await openCompassAt(address);
      await waitFor(() => button("Sign in") !== null);

      expect(button("Sign in"), "the login screen's Sign in button").not.toBeNull();
      expect(button("Continue with Google")).not.toBeNull();
      expect(container.querySelector('input[placeholder="you@example.com"]')).not.toBeNull();

      expect(screenText()).toContain(EMAIL_LINK_NOTICE);
      expect(screenText()).not.toContain(GOOGLE_EXPIRED_NOTICE);
      expect(screenText()).not.toContain(GOOGLE_GENERAL_NOTICE);

      expect(window.location.href).not.toContain("error");
      expect(window.location.href).not.toContain("otp_expired");
      expect(window.location.search).toBe("");
      expect(window.location.hash).toBe("");
    },
  );
});
