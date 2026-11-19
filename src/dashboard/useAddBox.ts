import { useEffect, useRef, useState } from "react";

export const SLOW_SAVE_MS = 500;

export function useAddBox<T>(save: (words: string) => Promise<T>, onSaved: (created: T) => void) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [slow, setSlow] = useState(false);
  const waitingRef = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  // Whether the box is still on screen when its save answers. Set on every
  // mount, not only at creation: in development StrictMode mounts, unmounts
  // and mounts again, and a flag only the cleanup touched stayed false, which
  // left the box frozen after its save answered.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function commit() {
    if (waitingRef.current) return;
    const words = text.trim();
    if (!words) {
      setAdding(false);
      setText("");
      return;
    }
    waitingRef.current = true;
    setWaiting(true);
    const slowTimer = setTimeout(() => {
      if (mounted.current) setSlow(true);
    }, SLOW_SAVE_MS);
    try {
      const created = await save(words);
      if (mounted.current) {
        setText("");
        onSavedRef.current(created);
      }
    } catch {
      // Reported once by the seam already; the words stay for another try.
    } finally {
      clearTimeout(slowTimer);
      waitingRef.current = false;
      if (mounted.current) {
        setWaiting(false);
        setSlow(false);
      }
    }
  }

  return {
    adding,
    open: () => setAdding(true),
    text,
    change: (next: string) => {
      if (!waitingRef.current) setText(next);
    },
    commit,
    cancel: () => {
      if (waitingRef.current) return;
      setAdding(false);
      setText("");
    },
    waiting,
    slow,
    fieldProps: {
      readOnly: waiting,
      "aria-busy": waiting || undefined,
    },
  };
}
