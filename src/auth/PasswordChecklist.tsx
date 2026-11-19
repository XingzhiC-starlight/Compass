import type { CSSProperties } from "react";
import { getPasswordRuleResults } from "./passwordRules";

export default function PasswordChecklist({
  password,
  confirmation,
}: {
  password: string;
  confirmation: string;
}) {
  return (
    <div style={wrap} aria-label="Password requirements">
      <p style={label}>Password should include</p>
      <ul style={list}>
        {getPasswordRuleResults(password, confirmation).map((rule) => (
          <li key={rule.id} style={{ ...item, ...(rule.met ? itemMet : null) }}>
            <span aria-hidden="true" style={{ ...dot, ...(rule.met ? dotMet : null) }} />
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const wrap: CSSProperties = {
  textAlign: "left",
  border: "1px solid var(--primary-200)",
  borderRadius: "var(--r-input)",
  padding: "12px 14px",
  background: "var(--primary-50)",
};
const label: CSSProperties = {
  fontFamily: "var(--font-label)",
  fontSize: 12,
  letterSpacing: 0,
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 8,
};
const list: CSSProperties = {
  listStyle: "none",
  display: "grid",
  gap: 6,
};
const item: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-muted)",
};
const itemMet: CSSProperties = {
  color: "var(--text)",
};
const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  border: "1px solid currentColor",
  flexShrink: 0,
};
const dotMet: CSSProperties = {
  background: "var(--ink-timeline)",
  borderColor: "var(--ink-timeline)",
};
