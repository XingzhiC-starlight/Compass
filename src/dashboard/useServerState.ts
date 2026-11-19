import { useState, type Dispatch, type SetStateAction } from "react";

export function useServerState<T>(serverValue: T, syncVersion: number): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(serverValue);
  const [adoptedAt, setAdoptedAt] = useState(syncVersion);
  if (adoptedAt !== syncVersion) {
    // Adjusting state while rendering: React re-runs this render with the
    // server value before anything reaches the screen.
    setAdoptedAt(syncVersion);
    setValue(serverValue);
    return [serverValue, setValue];
  }
  return [value, setValue];
}
