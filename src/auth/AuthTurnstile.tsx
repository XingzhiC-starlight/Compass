import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { captchaSizeForWidth } from "./captchaSize";

type AuthTurnstileProps = {
  action: string;
  onToken: (token: string) => void;
  onClear: () => void;
};

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

// eslint-disable-next-line react-refresh/only-export-components -- a one-line check that belongs with the widget; editing this file reloads the page in development
export function isTurnstileConfigured(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

export default function AuthTurnstile({ action, onToken, onClear }: AuthTurnstileProps) {
  // Decided once, when the CAPTCHA appears: changing the box later would
  // re-create the widget and throw away a check the person already solved.
  const [size] = useState(() => captchaSizeForWidth(window.innerWidth));

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div style={wrap}>
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={onToken}
        onExpire={onClear}
        onError={onClear}
        onTimeout={onClear}
        onUnsupported={onClear}
        options={{
          action,
          size,
          theme: "light",
        }}
      />
    </div>
  );
}

const wrap: React.CSSProperties = {
  width: "100%",
  minHeight: 65,
  display: "grid",
  placeItems: "center",
};
