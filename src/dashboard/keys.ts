import type { KeyboardEvent } from "react";

/** True when Enter should submit — a *real* Enter, NOT one pressed to confirm
   an IME composition (Chinese / Japanese / Korean input methods use Enter to
   pick the candidate characters). The check is the same for every language:
   non-IME input (e.g. English) never composes, so `isComposing` is always
   false and the behaviour is unchanged; while composing CJK text, the Enter is
   left to the IME instead of submitting. (`keyCode === 229` is the legacy
   signal that a key event is part of a composition.) */
export function isSubmitEnter(e: KeyboardEvent): boolean {
  return e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;
}
