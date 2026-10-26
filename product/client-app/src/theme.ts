// Light or dark look of the app; the choice is kept in the browser.
export type Theme = "light" | "dark";
export const THEMES: Theme[] = ["light", "dark"];

const STORAGE_KEY = "syngraph.theme";

/** The saved choice, else the system's. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage may be blocked: fall back to the system's theme
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // the choice just will not survive a reload
  }
}
