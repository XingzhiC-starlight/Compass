import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../lib/types";

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

const CONTINUE_TITLE = "Reset your password";
const CONTINUE_BODY = "Continue to choose a new password for your Compass account.";
const SET_TITLE = "Set a new password";
const USED_LINK_MESSAGE =
  "This reset link has already been used, or it has expired. Reset links work once.";
const OTHER_FAILURE_MESSAGE = "Something didn't go through — try again in a moment.";

const TOKEN = "tok_9f8e7d6c5b4a";
const PENDING_HASH_ADDRESS = `/#token_hash=${TOKEN}&type=recovery`;
const PENDING_QUERY_ADDRESS = `/?token_hash=${TOKEN}&type=recovery`;
const OLD_FORM_ADDRESS =
  "/#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery";

const RECOVERING_USER: User = { id: "user-1", email: "builder@example.com" };

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

async function press(label: string): Promise<void> {
  const target = button(label);
  expect(target, `a "${label}" button to press`).not.toBeNull();
  await act(async () => {
    target!.click();
  });
}

async function fireSignInEvent(): Promise<void> {
  await act(async () => {
    for (const cb of Array.from(seam.authListeners)) cb();
  });
  await settle();
}

function passwordFields(): number {
  return container.querySelectorAll('input[type="password"]').length;
}

function usedLinkError(): Error {
  return Object.assign(new Error("Email link is invalid or has expired"), {
    code: "otp_expired",
  });
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

describe("a token-carrying recovery address waits for Continue", () => {
  it.each([
    ["after `#`", PENDING_HASH_ADDRESS],
    ["in the query string", PENDING_QUERY_ADDRESS],
  ])(
    'Loading the app on a token-carrying recovery address shows "Reset your password" with a Continue button and makes no verification call; the token is gone from the address bar — token %s',
    async (_where, address) => {
      seam.user = null;
      await openCompassAt(address);
      await waitFor(() => screenText().includes(CONTINUE_TITLE));
      await settle();

      expect(screenText()).toContain(CONTINUE_TITLE);
      expect(screenText()).toContain(CONTINUE_BODY);
      expect(button("Continue"), "the Continue button").not.toBeNull();

      expect(screenText()).not.toContain(SET_TITLE);
      expect(passwordFields()).toBe(0);

      expect(seam.verifyRecoveryToken).not.toHaveBeenCalled();

      expect(window.location.href).not.toContain("token_hash");
      expect(window.location.href).not.toContain(TOKEN);
    },
  );
});

describe("pressing Continue", () => {
  it('Pressing Continue makes exactly one verification call; on success the screen shows "Set a new password" and stays there when a sign-in event for the same user arrives', async () => {
    seam.user = null;
    seam.verifyRecoveryToken.mockImplementation(async () => {
      seam.user = RECOVERING_USER;
    });

    await openCompassAt(PENDING_HASH_ADDRESS);
    await waitFor(() => button("Continue") !== null);
    expect(seam.verifyRecoveryToken).not.toHaveBeenCalled();

    await press("Continue");
    await waitFor(() => screenText().includes(SET_TITLE));

    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
    expect(seam.verifyRecoveryToken).toHaveBeenCalledWith(TOKEN);
    expect(screenText()).toContain(SET_TITLE);
    expect(button("Save password"), "the Save password button").not.toBeNull();
    expect(passwordFields()).toBe(2);
    expect(button("Continue")).toBeNull();

    expect(seam.authListeners.size, "App listens for auth changes").toBeGreaterThan(0);
    seam.user = RECOVERING_USER;
    await fireSignInEvent();
    await fireSignInEvent();

    expect(screenText()).toContain(SET_TITLE);
    expect(button("Save password")).not.toBeNull();
    expect(passwordFields()).toBe(2);
    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
  });

  it('Pressing Continue makes exactly one verification call; on success the screen shows "Set a new password" and stays there when a sign-in event for the same user arrives — even when that event fires while the verification call is still in flight (as Supabase does)', async () => {
    seam.user = null;
    let finishVerification: () => void = () => {};
    seam.verifyRecoveryToken.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishVerification = resolve;
        }),
    );

    await openCompassAt(PENDING_HASH_ADDRESS);
    await waitFor(() => button("Continue") !== null);
    await press("Continue");
    await settle();
    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);

    expect(seam.authListeners.size, "App listens for auth changes").toBeGreaterThan(0);
    seam.user = RECOVERING_USER;
    await fireSignInEvent();

    await act(async () => {
      finishVerification();
    });
    await waitFor(() => screenText().includes(SET_TITLE));

    expect(screenText()).toContain(SET_TITLE);
    expect(button("Save password"), "the Save password button").not.toBeNull();
    expect(passwordFields()).toBe(2);
    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
    expect(seam.verifyRecoveryToken).toHaveBeenCalledWith(TOKEN);
  });

  it('Pressing Continue… "stays there when a sign-in event for the same user arrives" — harness check: the very same sign-in event DOES move an ordinary signed-out screen on, so the "stays there" assertions above are not empty', async () => {
    seam.user = null;
    await openCompassAt("/?error=access_denied&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code");
    await waitFor(() => button("Sign in") !== null);
    expect(button("Sign in"), "the login screen").not.toBeNull();

    expect(seam.authListeners.size, "App listens for auth changes").toBeGreaterThan(0);
    seam.user = RECOVERING_USER;
    await fireSignInEvent();
    await waitFor(() => button("Sign in") === null);

    expect(button("Sign in")).toBeNull();
    expect(button("Continue with Google")).toBeNull();
    expect(screenText()).not.toContain(SET_TITLE);
  });

  it('Pressing Continue makes exactly one verification call — and while it is in flight the button reads "One moment…" (Behavior change, Part 2)', async () => {
    seam.user = null;
    let finishVerification: () => void = () => {};
    seam.verifyRecoveryToken.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishVerification = resolve;
        }),
    );

    await openCompassAt(PENDING_HASH_ADDRESS);
    await waitFor(() => button("Continue") !== null);
    await press("Continue");
    await settle();

    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
    expect(button("One moment…"), 'the busy label "One moment…"').not.toBeNull();
    expect(button("Continue")).toBeNull();

    await act(async () => {
      finishVerification();
    });
    await settle();
    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
  });

  it('Pressing Continue when verification fails with `otp_expired` shows "This reset link has already been used, or it has expired. Reset links work once." and a "Send a new reset link" button; pressing it shows the login screen in forgot mode ("Send reset link" is the submit label)', async () => {
    seam.user = null;
    seam.verifyRecoveryToken.mockRejectedValue(usedLinkError());

    await openCompassAt(PENDING_HASH_ADDRESS);
    await waitFor(() => button("Continue") !== null);
    await press("Continue");
    await waitFor(() => screenText().includes(USED_LINK_MESSAGE));

    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
    expect(seam.verifyRecoveryToken).toHaveBeenCalledWith(TOKEN);
    expect(screenText()).toContain(USED_LINK_MESSAGE);
    expect(button("Send a new reset link"), 'the "Send a new reset link" button').not.toBeNull();
    expect(button("Continue")).toBeNull();
    expect(screenText()).not.toContain(SET_TITLE);
    expect(passwordFields()).toBe(0);

    await press("Send a new reset link");
    await waitFor(() => button("Send reset link") !== null);

    expect(button("Send reset link"), 'the forgot-mode submit label "Send reset link"').not.toBeNull();
    expect(container.querySelector('input[placeholder="you@example.com"]')).not.toBeNull();
    expect(passwordFields()).toBe(0);
    expect(button("Sign in")).toBeNull();
    expect(screenText()).toContain("Back to sign in");
    expect(screenText()).not.toContain(USED_LINK_MESSAGE);
  });

  it('Pressing Continue when verification fails for any OTHER reason shows "Something didn\'t go through — try again in a moment." and keeps the Continue button (Behavior change, Part 2)', async () => {
    seam.user = null;
    seam.verifyRecoveryToken.mockRejectedValue(
      Object.assign(new Error("Failed to fetch"), { code: "unexpected_failure" }),
    );

    await openCompassAt(PENDING_HASH_ADDRESS);
    await waitFor(() => button("Continue") !== null);
    await press("Continue");
    await waitFor(() => screenText().includes(OTHER_FAILURE_MESSAGE));

    expect(seam.verifyRecoveryToken).toHaveBeenCalledTimes(1);
    expect(screenText()).toContain(OTHER_FAILURE_MESSAGE);
    expect(button("Continue"), "the Continue button is kept").not.toBeNull();
    expect(button("Send a new reset link")).toBeNull();
    expect(screenText()).not.toContain(USED_LINK_MESSAGE);
    expect(screenText()).not.toContain(SET_TITLE);
  });
});

describe("reset emails sent before this change", () => {
  it('An old-form recovery address (session already in the address) shows "Set a new password" with no Continue step', async () => {
    seam.user = RECOVERING_USER;
    await openCompassAt(OLD_FORM_ADDRESS);
    await waitFor(() => screenText().includes(SET_TITLE));
    await settle();

    expect(screenText()).toContain(SET_TITLE);
    expect(button("Save password"), "the Save password button").not.toBeNull();
    expect(passwordFields()).toBe(2);

    expect(screenText()).not.toContain(CONTINUE_TITLE);
    expect(button("Continue")).toBeNull();
    expect(seam.verifyRecoveryToken).not.toHaveBeenCalled();
  });

  it('An old-form recovery address (session already in the address) shows "Set a new password" with no Continue step — and keeps working as ratified: it stays there when the sign-in event for its temporary session arrives (spec §2)', async () => {
    seam.user = RECOVERING_USER;
    await openCompassAt(OLD_FORM_ADDRESS);
    await waitFor(() => screenText().includes(SET_TITLE));

    expect(seam.authListeners.size, "App listens for auth changes").toBeGreaterThan(0);
    await fireSignInEvent();
    await fireSignInEvent();

    expect(screenText()).toContain(SET_TITLE);
    expect(button("Save password")).not.toBeNull();
    expect(button("Continue")).toBeNull();
    expect(seam.verifyRecoveryToken).not.toHaveBeenCalled();
  });
});
