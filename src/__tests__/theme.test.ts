/**
 * Theme resolution (src/lib/theme.ts): a stored choice wins; with none, the
 * device's colour scheme decides. Vitest runs in Node, so the DOM is faked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

describe("init script", () => {
  function run(stored: string | null, deviceDark: boolean, storageThrows = false): string | undefined {
    const dataset: { theme?: string } = {};
    const localStorage = {
      getItem: () => {
        if (storageThrows) throw new Error("blocked");
        return stored;
      },
    };
    const matchMedia = () => ({ matches: deviceDark });
    const scope: Record<string, unknown> = {};
    new Function("localStorage", "matchMedia", "document", "window", THEME_INIT_SCRIPT)(
      localStorage,
      matchMedia,
      { documentElement: { dataset } },
      scope,
    );
    return dataset.theme;
  }

  it("a stored choice wins over the device", () => {
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
  });

  it("no stored choice (or a junk value) follows the device", () => {
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
    expect(run("purple", true)).toBe("dark");
  });

  it("blocked storage still follows the device", () => {
    expect(run(null, true, true)).toBe("dark");
    expect(run(null, false, true)).toBe("light");
  });

  it("declares no globals", () => {
    expect(THEME_INIT_SCRIPT.startsWith("(function(){")).toBe(true);
    expect(THEME_INIT_SCRIPT.endsWith("})()")).toBe(true);
  });
});

describe("runtime: toggle, other tabs, device changes", () => {
  let store: Record<string, string>;
  let deviceDark: boolean;
  let handlers: Record<string, Array<(e: unknown) => void>>;
  let mediaHandlers: Array<() => void>;

  beforeEach(() => {
    store = {};
    deviceDark = false;
    handlers = {};
    mediaHandlers = [];
    const media = {
      get matches() {
        return deviceDark;
      },
      addEventListener: (_: string, h: () => void) => mediaHandlers.push(h),
      removeEventListener: (_: string, h: () => void) => {
        mediaHandlers = mediaHandlers.filter((x) => x !== h);
      },
    };
    vi.stubGlobal("document", { documentElement: { dataset: {} as { theme?: string } } });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    vi.stubGlobal("window", {
      matchMedia: () => media,
      addEventListener: (type: string, h: (e: unknown) => void) => (handlers[type] ??= []).push(h),
      removeEventListener: (type: string, h: (e: unknown) => void) => {
        handlers[type] = (handlers[type] ?? []).filter((x) => x !== h);
      },
    });
    vi.resetModules();
  });

  afterEach(() => vi.unstubAllGlobals());

  const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));

  it("toggle stores the choice, sets data-theme and notifies subscribers", async () => {
    const theme = await import("@/lib/theme");
    const seen: string[] = [];
    const off = theme.subscribeTheme(() => seen.push(theme.getTheme()));
    theme.toggleTheme();
    expect(theme.getTheme()).toBe("dark");
    expect(store[THEME_STORAGE_KEY]).toBe("dark");
    theme.toggleTheme();
    expect(seen).toEqual(["dark", "light"]);
    off();
    expect(handlers.storage).toEqual([]);
    expect(mediaHandlers).toEqual([]);
  });

  it("another tab storing or clearing the choice re-resolves with the same rule as a reload", async () => {
    const theme = await import("@/lib/theme");
    theme.subscribeTheme(() => {});
    store[THEME_STORAGE_KEY] = "dark";
    fire("storage", { key: THEME_STORAGE_KEY });
    expect(theme.getTheme()).toBe("dark");
    // cleared on a light device → light; cleared on a dark device → dark
    delete store[THEME_STORAGE_KEY];
    fire("storage", { key: THEME_STORAGE_KEY });
    expect(theme.getTheme()).toBe("light");
    deviceDark = true;
    fire("storage", { key: null }); // localStorage.clear()
    expect(theme.getTheme()).toBe("dark");
    fire("storage", { key: "something-else" });
    expect(theme.getTheme()).toBe("dark");
  });

  it("a device change is followed only while there is no stored choice", async () => {
    const theme = await import("@/lib/theme");
    theme.subscribeTheme(() => {});
    deviceDark = true;
    mediaHandlers.forEach((h) => h());
    expect(theme.getTheme()).toBe("dark");
    theme.setTheme("light");
    mediaHandlers.forEach((h) => h());
    expect(theme.getTheme()).toBe("light");
  });
});
