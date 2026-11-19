import { useEffect, useState } from "react";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  resendEmailConfirmation,
} from "../lib/db";
import AuthTurnstile, { isTurnstileConfigured } from "./AuthTurnstile";
import PasswordChecklist from "./PasswordChecklist";
import { validatePasswordPair } from "./passwordRules";

type Mode = "signin" | "register" | "forgot";
type PendingEmail = { kind: "signup" | "reset"; email: string; resendAt: number };
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;

export default function LoginScreen({
  notice,
  onBack,
  initialMode = "signin",
}: {
  notice?: string | null;
  initialMode?: "signin" | "forgot";
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<PendingEmail | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    if (!pendingEmail) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingEmail]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPendingEmail(null);
    setResendNote(null);
    setPassword("");
    setPasswordConfirm("");
    resetCaptcha();
  }

  function backToSignIn() {
    setMode("signin");
    setError(null);
    setPendingEmail(null);
    setResendNote(null);
    setPassword("");
    setPasswordConfirm("");
    resetCaptcha();
  }

  function useDifferentEmail() {
    setMode(pendingEmail?.kind === "reset" ? "forgot" : "register");
    setError(null);
    setPendingEmail(null);
    setResendNote(null);
    setPassword("");
    setPasswordConfirm("");
    resetCaptcha();
  }

  function makePendingEmail(kind: PendingEmail["kind"], addr: string): PendingEmail {
    const sentAt = Date.now();
    setNow(sentAt);
    return { kind, email: addr, resendAt: sentAt + RESEND_COOLDOWN_MS };
  }

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaKey((key) => key + 1);
  }

  function currentCaptchaToken(): string | undefined | null {
    if (isTurnstileConfigured() && !captchaToken) {
      setError("Complete the verification check to continue.");
      return null;
    }
    return captchaToken ?? undefined;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResendNote(null);

    const addr = email.trim();
    if (!addr) return setError("Enter your email to continue.");
    if (mode === "signin" && !password) return setError("Enter your password to continue.");
    if (mode === "register") {
      const passwordError = validatePasswordPair(password, passwordConfirm);
      if (passwordError) return setError(passwordError);
    }
    const token = currentCaptchaToken();
    if (token === null) return;

    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(addr, password, token);
      } else if (mode === "register") {
        const { needsConfirmation } = await signUpWithEmail(addr, password, token);
        if (needsConfirmation) {
          setPendingEmail(makePendingEmail("signup", addr));
          setPassword("");
          setPasswordConfirm("");
          resetCaptcha();
        }
      } else {
        await sendPasswordReset(addr, token);
        setPendingEmail(makePendingEmail("reset", addr));
        resetCaptcha();
      }
    } catch (err) {
      setError(friendlyError(err, mode));
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    setPendingEmail(null);
    setResendNote(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("Couldn't reach Google sign-in just now — try again.");
      setBusy(false);
    }
  }

  async function handleResendEmail() {
    if (!pendingEmail) return;
    const secondsLeft = Math.max(0, Math.ceil((pendingEmail.resendAt - now) / 1000));
    if (secondsLeft > 0) return;

    setError(null);
    setResendNote(null);
    const token = currentCaptchaToken();
    if (token === null) return;
    setResendBusy(true);
    try {
      if (pendingEmail.kind === "signup") {
        await resendEmailConfirmation(pendingEmail.email, token);
        setResendNote("We sent another confirmation link. Use the newest email if more than one arrives.");
      } else {
        await sendPasswordReset(pendingEmail.email, token);
        setResendNote("If that address has a Compass account, another reset link is on its way.");
      }
      setPendingEmail(makePendingEmail(pendingEmail.kind, pendingEmail.email));
      resetCaptcha();
    } catch (err) {
      setError(friendlyError(err, pendingEmail.kind === "signup" ? "register" : "forgot"));
      setPendingEmail(makePendingEmail(pendingEmail.kind, pendingEmail.email));
      resetCaptcha();
    } finally {
      setResendBusy(false);
    }
  }

  if (pendingEmail) {
    const isSignup = pendingEmail.kind === "signup";
    const resendSeconds = Math.max(0, Math.ceil((pendingEmail.resendAt - now) / 1000));
    const canResend = resendSeconds === 0 && !resendBusy;
    const resendLabel = resendBusy
      ? "Sending…"
      : resendSeconds > 0
        ? `Resend in ${resendSeconds}s`
        : isSignup
          ? "Resend confirmation link"
          : "Resend reset link";
    return (
      <div style={wrap}>
        <div style={card}>
          <p style={eyebrow}>Email sent</p>
          <h1 style={title}>Check your email</h1>
          <p style={tagline}>
            {isSignup
              ? `If this address can create or confirm a Compass account, a confirmation link will arrive at ${pendingEmail.email}. Already created one? Sign in instead.`
              : `If that address has a Compass account, a reset link is on its way to ${pendingEmail.email}.`}
          </p>
          <div style={emailBadge}>{pendingEmail.email}</div>
          <div style={resendPanel}>
            <p style={resendLine}>Didn't get the email?</p>
            {canResend && isTurnstileConfigured() && (
              <div style={resendCaptcha}>
                <AuthTurnstile
                  key={`resend-${pendingEmail.kind}-${captchaKey}`}
                  action={isSignup ? "auth_resend_signup" : "auth_resend_reset"}
                  onToken={setCaptchaToken}
                  onClear={() => setCaptchaToken(null)}
                />
              </div>
            )}
            <button
              type="button"
              className="auth-resend-button"
              style={{ ...resendButton, ...(!canResend ? resendButtonDisabled : null) }}
              onClick={handleResendEmail}
              disabled={!canResend}
            >
              {resendLabel}
            </button>
            {resendNote && <p style={resendNoteStyle}>{resendNote}</p>}
            {error && <p style={note}>{error}</p>}
          </div>
          <div style={actionStack}>
            <button type="button" className="auth-primary-button" style={button} onClick={backToSignIn}>
              Back to sign in
            </button>
            <button type="button" className="auth-secondary-button" style={secondaryButton} onClick={useDifferentEmail}>
              Use a different email
            </button>
          </div>
          <p style={privacyFootnote}>
            Questions about your data?{" "}
            <a href="/privacy.html" target="_blank" rel="noreferrer" style={inlineAnchor}>
              Read the privacy notice
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const submitLabel =
    mode === "signin" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link";

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={title}>
          {onBack ? (
            <button
              type="button"
              style={wordmarkButton}
              onClick={onBack}
              aria-label="Back to the Compass home page"
            >
              Compass
            </button>
          ) : (
            "Compass"
          )}
        </h1>
        <p style={tagline}>
          A quiet place to see where you are — in time, in plan, in learning.
        </p>
        {notice && !error && <p style={noticeStyle}>{notice}</p>}

        <form onSubmit={handleEmailSubmit} style={form}>
          <input
            id="auth-email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="auth-input"
            style={input}
            disabled={busy}
          />
          {mode !== "forgot" && (
            <input
              id="auth-password"
              name="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="auth-input"
              style={input}
              disabled={busy}
            />
          )}
          {mode === "register" && (
            <>
              <input
                id="auth-password-confirm"
                name="passwordConfirm"
                type="password"
                placeholder="Confirm password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                className="auth-input"
                style={input}
                disabled={busy}
              />
              <PasswordChecklist password={password} confirmation={passwordConfirm} />
            </>
          )}
          <AuthTurnstile
            key={`${mode}-${captchaKey}`}
            action={`auth_${mode}`}
            onToken={setCaptchaToken}
            onClear={() => setCaptchaToken(null)}
          />
          <button type="submit" className="auth-primary-button" style={button} disabled={busy}>
            {busy ? "One moment…" : submitLabel}
          </button>
        </form>

        <div style={links}>
          {mode === "signin" && (
            <>
              <button type="button" className="auth-link" style={link} onClick={() => switchMode("register")}>
                New here? Create an account
              </button>
              <button type="button" className="auth-link" style={link} onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
            </>
          )}
          {mode === "register" && (
            <button type="button" className="auth-link" style={link} onClick={() => switchMode("signin")}>
              Already have an account? Sign in
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" className="auth-link" style={link} onClick={() => switchMode("signin")}>
              Back to sign in
            </button>
          )}
        </div>

        <div style={divider}>
          <span style={dividerLine} />
          <span style={dividerText}>or</span>
          <span style={dividerLine} />
        </div>

        <button className="auth-secondary-button" style={googleButton} onClick={handleGoogle} disabled={busy}>
          Continue with Google
        </button>

        {error && <p style={note}>{error}</p>}
        <p style={privacyFootnote}>
          You can{" "}
          <a href="/privacy.html" target="_blank" rel="noreferrer" style={inlineAnchor}>
            read how Compass handles privacy
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function friendlyError(err: unknown, mode: Mode): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (mode === "register" && msg.includes("already registered")) {
    return "That email is already registered — try signing in instead.";
  }
  if (msg.includes("leaked") || msg.includes("breach") || msg.includes("pwned")) {
    return "Use a different password. Avoid common or reused passwords.";
  }
  if (msg.includes("captcha")) {
    return "Complete the verification check to continue.";
  }
  if (msg.includes("password")) {
    return "Use a password that meets all the requirements below.";
  }
  if (mode === "signin" && (msg.includes("invalid") || msg.includes("credentials"))) {
    return "That email and password don't match. Try again.";
  }
  if (msg.includes("email") && msg.includes("confirm")) {
    return "Please confirm your email first — check your inbox for the link.";
  }
  return "Something didn't go through — try again in a moment.";
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  width: "100vw",
  display: "grid",
  placeItems: "center",
  background: "var(--primary-50)",
  padding: 24,
  boxSizing: "border-box",
};
const card: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "var(--r-bubble)",
  boxShadow: "var(--shadow-rest)",
  border: "1px solid var(--primary-200)",
  padding: "clamp(30px, 6vw, 48px) clamp(24px, 6vw, 44px)",
  width: "100%",
  maxWidth: 460,
  textAlign: "center",
};
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-label)",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  textTransform: "uppercase",
  color: "var(--primary-700)",
  marginBottom: 12,
};
const title: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 30,
  color: "var(--text)",
  marginBottom: 12,
};
const wordmarkButton: React.CSSProperties = {
  font: "inherit",
  color: "inherit",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};
const tagline: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--text-muted)",
  lineHeight: 1.6,
  marginBottom: 28,
};
const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const input: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--text)",
  borderRadius: "var(--r-pill)",
  padding: "12px 16px",
  width: "100%",
  boxSizing: "border-box",
};
const button: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 15,
  color: "#fff",
  border: "none",
  borderRadius: "var(--r-pill)",
  padding: "13px 26px",
  cursor: "pointer",
  width: "100%",
};
const secondaryButton: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 15,
  color: "var(--text)",
  borderRadius: "var(--r-pill)",
  padding: "13px 26px",
  cursor: "pointer",
  width: "100%",
};
const googleButton: React.CSSProperties = {
  ...secondaryButton,
};
const links: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 14,
};
const link: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--text-muted)",
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
};
const divider: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "22px 0 18px",
};
const dividerLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "var(--primary-200)",
};
const dividerText: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--text-muted)",
};
const note: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
  marginTop: 18,
  lineHeight: 1.55,
};
const noticeStyle: React.CSSProperties = {
  ...note,
  marginTop: -12,
  marginBottom: 18,
};
const emailBadge: React.CSSProperties = {
  display: "inline-block",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--text)",
  background: "var(--primary-100)",
  border: "1px solid var(--primary-300)",
  borderRadius: "var(--r-pill)",
  padding: "8px 14px",
  marginBottom: 24,
};
const resendPanel: React.CSSProperties = {
  background: "var(--primary-50)",
  border: "1px solid var(--primary-200)",
  borderRadius: "var(--r-input)",
  padding: "14px 16px",
  marginBottom: 18,
};
const resendLine: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--text-muted)",
  marginBottom: 10,
};
const resendCaptcha: React.CSSProperties = {
  marginBottom: 10,
};
const resendButton: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 13,
  color: "var(--text)",
  borderRadius: "var(--r-pill)",
  padding: "9px 16px",
  cursor: "pointer",
  width: "100%",
};
const resendButtonDisabled: React.CSSProperties = {
  color: "var(--text-muted)",
  borderColor: "var(--primary-200)",
  cursor: "default",
  opacity: 0.72,
};
const resendNoteStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginTop: 10,
};
const actionStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const privacyFootnote: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginTop: 18,
};
const inlineAnchor: React.CSSProperties = {
  color: "var(--text)",
  textDecorationColor: "rgba(45, 45, 45, 0.35)",
  textUnderlineOffset: 3,
};
