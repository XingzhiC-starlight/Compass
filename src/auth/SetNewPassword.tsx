import { useRef, useState } from "react";
import { updatePassword, verifyRecoveryToken } from "../lib/db";
import { isUsedOrExpiredLinkError, passwordResetErrorMessage } from "./authErrors";
import PasswordChecklist from "./PasswordChecklist";
import { validatePasswordPair } from "./passwordRules";

type Step = "continue" | "password" | "dead";

export default function SetNewPassword({
  onDone,
  pendingToken = null,
  onSendNewLink,
}: {
  onDone: () => void;
  pendingToken?: string | null;
  onSendNewLink?: () => void;
}) {
  const [step, setStep] = useState<Step>(pendingToken ? "continue" : "password");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!pendingToken || verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setVerifyError(null);
    try {
      await verifyRecoveryToken(pendingToken);
      setStep("password");
    } catch (err) {
      if (isUsedOrExpiredLinkError(err)) setStep("dead");
      else setVerifyError("Something didn't go through — try again in a moment.");
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const passwordError = validatePasswordPair(password, passwordConfirm);
    if (passwordError) return setError(passwordError);

    setBusy(true);
    try {
      await updatePassword(password);
      onDone();
    } catch (err) {
      setError(passwordResetErrorMessage(err));
      setBusy(false);
    }
  }

  if (step === "continue") {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={title}>Reset your password</h1>
          <p style={tagline}>Continue to choose a new password for your Compass account.</p>
          <button
            type="button"
            className="auth-primary-button"
            style={button}
            onClick={handleContinue}
            disabled={verifying}
            autoFocus
          >
            {verifying ? "One moment…" : "Continue"}
          </button>
          {verifyError && <p style={note}>{verifyError}</p>}
        </div>
      </div>
    );
  }

  if (step === "dead") {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={title}>Reset your password</h1>
          <p style={tagline}>
            This reset link has already been used, or it has expired. Reset links work once.
          </p>
          <button type="button" className="auth-primary-button" style={button} onClick={onSendNewLink}>
            Send a new reset link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={title}>Set a new password</h1>
        <p style={tagline}>Choose a new password for your Compass account.</p>
        <form onSubmit={handleSubmit} style={form}>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="auth-input"
            style={input}
            disabled={busy}
            autoFocus
          />
          <input
            id="new-password-confirm"
            name="newPasswordConfirm"
            type="password"
            placeholder="Confirm new password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            className="auth-input"
            style={input}
            disabled={busy}
          />
          <PasswordChecklist password={password} confirmation={passwordConfirm} />
          <button type="submit" className="auth-primary-button" style={button} disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
        {error && <p style={note}>{error}</p>}
      </div>
    </div>
  );
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
const title: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 26,
  color: "var(--text)",
  marginBottom: 12,
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
const note: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
  marginTop: 18,
  lineHeight: 1.55,
};
