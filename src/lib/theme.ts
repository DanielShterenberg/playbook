/**
 * App theme (light / dark).
 *
 * The source of truth is the `data-theme` attribute on <html>: an inline
 * script in the root layout sets it before first paint (THEME_INIT_SCRIPT) from
 * the stored choice, else the device's colour scheme; setTheme updates it and
 * remembers the choice in localStorage.
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
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Another tab changed the theme: follow it so canvas colours and CSS stay in step. */
function onStorage(e: StorageEvent): void {
  if (e.key !== THEME_STORAGE_KEY) return;
  document.documentElement.dataset.theme = e.newValue === "dark" ? "dark" : "light";
  listeners.forEach((l) => l());
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong
 * theme. A stored choice (the toggle) wins; with none, the device's colour
 * scheme decides.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;
