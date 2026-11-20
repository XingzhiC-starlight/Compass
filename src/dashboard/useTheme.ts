import { useEffect, useState } from "react";

export type Theme = "classic" | "sand";

export const THEMES: { id: Theme; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "sand", label: "Sand" },
];

const THEME_KEY = "compass.theme";

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "sand" ? "sand" : "classic";
  } catch {
    return "classic";
  }
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage may be unavailable; the choice still holds until the page is closed */
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "classic") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  function chooseTheme(next: Theme) {
    setTheme(next);
    saveTheme(next);
  }

  return [theme, chooseTheme];
}
