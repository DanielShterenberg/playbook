/**
 * Class names shared by the playbook dialogs (NewPlayModal, CreateTeamModal).
 * Colours come from the theme tokens (globals.css), so both themes are covered.
 */

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

export const MODAL_OVERLAY = "fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4";

export const MODAL_PANEL =
  "m-auto w-full rounded-xl border border-line bg-surface p-6 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.3)] sm:p-7";

export const MODAL_TITLE = "m-0 font-display text-[26px] font-bold uppercase leading-[1.2] tracking-[0.03em] text-ink";

export const FIELD_LABEL = "mb-1.5 block text-[13px] font-semibold text-ink";

/** Text input / select / textarea. Add FIELD_BORDER or FIELD_BORDER_ERROR. */
export const FIELD =
  "box-border w-full rounded-lg border bg-app px-3 text-sm text-ink placeholder:text-muted focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent-text";

export const FIELD_BORDER = "border-line";
export const FIELD_BORDER_ERROR = "border-danger";

export const FIELD_ERROR = "m-0 mt-1 text-[13px] text-danger";

export const BTN_PRIMARY = `h-11 whitespace-nowrap rounded-lg border-0 bg-accent px-[18px] text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const BTN_SECONDARY = `h-11 whitespace-nowrap rounded-lg border border-line bg-transparent px-4 text-sm font-medium text-ink transition-colors hover:bg-app disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

/** Two-way choice ("Save to"): the selected side is the filled one, like the filter chips. */
export const CHOICE = `h-11 min-w-0 flex-1 truncate rounded-lg border px-3 text-sm transition-colors ${FOCUS_RING}`;
export const CHOICE_ON = "border-ink bg-ink font-semibold text-app";
export const CHOICE_OFF = "border-line bg-transparent font-medium text-ink hover:bg-app";
