/**
 * Shared class strings for the editor chrome, so the header, panels and
 * dialogs draw the same buttons. Colours are theme tokens (globals.css) only.
 */

import { FOCUS_RING } from "@/lib/uiClasses";

const DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";

/** 44px square bordered icon button (undo, redo, comments …). */
export const ICON_BTN = `flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-line bg-transparent text-ink transition-colors hover:bg-app aria-pressed:border-line-strong aria-pressed:bg-chip ${DISABLED} ${FOCUS_RING}`;

/** 44px bordered text button (Share, Present, Cancel …). */
export const TEXT_BTN = `flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-transparent px-4 text-sm font-medium text-ink transition-colors hover:bg-app ${DISABLED} ${FOCUS_RING}`;

/** 44px filled accent button (Export, Save in dialogs). */
export const ACCENT_BTN = `flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-[18px] text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 ${DISABLED} ${FOCUS_RING}`;

/** 44px round bordered button (playback step, loop). */
export const ROUND_BTN = `flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-chip aria-pressed:border-line-strong aria-pressed:bg-chip ${DISABLED} ${FOCUS_RING}`;

/** Uppercase condensed section label (ROSTER, SCENES, STEPS). */
export const SECTION_LABEL = "font-display text-base font-semibold uppercase tracking-[0.08em] text-muted";

/** Outer box of a segmented control; put SEGMENT buttons inside. */
export const SEGMENTED = "flex flex-none overflow-hidden rounded-lg border border-line";

/** One option of a segmented control; selected state follows aria-pressed. */
export const SEGMENT = `h-8 px-3 text-[13px] text-muted transition-colors hover:text-ink aria-pressed:bg-chip aria-pressed:text-ink ${FOCUS_RING}`;

/** Text input / select / textarea. */
export const FIELD =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-text";

/** Row of a dropdown menu. */
export const MENU_ITEM = `flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-ink transition-colors hover:bg-chip ${DISABLED} ${FOCUS_RING}`;

/** Floating surface of a dropdown menu / popover. */
export const POPOVER = "rounded-lg border border-line bg-surface shadow-lg shadow-black/10 dark:shadow-black/40";

/** Checkbox / radio tint: the fill accent is too light on white, so light uses the darker ring colour. */
export const ACCENT_CONTROL = "accent-control";
