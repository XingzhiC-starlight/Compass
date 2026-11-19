import { useLayoutEffect, useRef } from "react";

export default function AutoTextarea({
  className,
  value,
  placeholder,
  autoFocus,
  onChange,
  onBlur,
  onKeyDown,
  maxLength,
  readOnly,
  "aria-busy": ariaBusy,
}: {
  className?: string;
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  maxLength?: number;
  readOnly?: boolean;
  "aria-busy"?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={1}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      maxLength={maxLength}
      readOnly={readOnly}
      aria-busy={ariaBusy}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}
