/**
 * App theme (light / dark).
 *
 * The source of truth is the `data-theme` attribute on <html>: an inline
 * script in the root layout sets it before first paint (THEME_INIT_SCRIPT), and
 * setTheme updates it and remembers the choice in localStorage.
 *
 * Deliberately NOT part of the Zustand editor store: every write there goes
 * through undo history, and a theme toggle must not become an undo step.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "playbook-theme";

const listeners = new Set<() => void>();

/** Current theme, read from <html data-theme>. */
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Server / hydration snapshot — the server always renders light. */
export function getServerTheme(): Theme {
  return "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode) — the choice lasts for this page only.
  }
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs in <head> before first paint so a stored dark choice never flashes
 * light. Only an explicit stored choice is honoured for now; following the
 * device setting is switched on once every screen is themed.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
