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
const DEVICE_DARK = "(prefers-color-scheme: dark)";

/** Current theme, read from <html data-theme>. */
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Server / hydration snapshot — the server always renders light. */
export function getServerTheme(): Theme {
  return "light";
}

/** The stored choice, or null when there is none (or storage is unavailable). */
function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/** The one rule: a stored choice wins; with none, the device's colour scheme decides. */
function resolveTheme(): Theme {
  return storedTheme() ?? (window.matchMedia(DEVICE_DARK).matches ? "dark" : "light");
}

function apply(theme: Theme): void {
  if (getTheme() === theme && document.documentElement.dataset.theme) return;
  document.documentElement.dataset.theme = theme;
  listeners.forEach((l) => l());
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode) — the choice lasts for this page only.
  }
  apply(theme);
}

export function toggleTheme(): void {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    window.matchMedia(DEVICE_DARK).addEventListener("change", onDeviceChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      window.matchMedia(DEVICE_DARK).removeEventListener("change", onDeviceChange);
    }
  };
}

/** Another tab changed (or cleared) the choice: re-resolve so canvas colours and CSS stay in step. */
function onStorage(e: StorageEvent): void {
  if (e.key !== null && e.key !== THEME_STORAGE_KEY) return;
  apply(resolveTheme());
}

/** The device switched light / dark: follow it unless the user has chosen. */
function onDeviceChange(): void {
  if (storedTheme() === null) apply(resolveTheme());
}

/**
 * Runs in <head> before first paint so the chrome never flashes the wrong
 * theme. Same rule as resolveTheme: a stored choice (the toggle) wins; with
 * none — or with storage blocked — the device's colour scheme decides.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}if(t!=="light"&&t!=="dark"){try{t=matchMedia("${DEVICE_DARK}").matches?"dark":"light"}catch(e){t="light"}}document.documentElement.dataset.theme=t})()`;
