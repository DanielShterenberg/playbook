import { useSyncExternalStore } from "react";
import { DARK_COURT_PALETTE, LIGHT_COURT_PALETTE, type CourtPalette } from "@/lib/courtPalette";
import { getServerTheme, getTheme, subscribeTheme, type Theme } from "@/lib/theme";

/** The active theme. Light on the server and during hydration. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
}

/** Court, token and ball colours for the active theme. */
export function useCourtPalette(): CourtPalette {
  return useTheme() === "dark" ? DARK_COURT_PALETTE : LIGHT_COURT_PALETTE;
}
