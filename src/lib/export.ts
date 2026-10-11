/**
 * Small text helpers shared by the exporters (PNG / MP4 / PDF).
 */

/**
 * File name (without extension) for an export of a play: the title with
 * letters and digits of any script kept, punctuation (everything unsafe in a
 * file name) dropped and spaces turned into dashes. "play" when nothing is left.
 */
export function exportFileBase(title: string | null | undefined): string {
  // ASCII and Latin-1 punctuation, control characters and general punctuation
  // (U+2000–206F) go; "-" and "_" stay. No \p{…} classes: the build targets ES5.
  const safe = (title ?? "")
    .replace(/[\u0000-\u001f!-,.\/:-@[-^`{-\u00bf\u2000-\u206f]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return safe || "play";
}

/**
 * True when jsPDF's built-in fonts cannot draw `text`: they cover Latin-1
 * only and do no right-to-left shaping, so Hebrew (or any other script)
 * would come out as garbage. Such text is drawn through a canvas instead.
 */
export function needsRasterText(text: string): boolean {
  return /[^ -~ -ÿ]/.test(text);
}

/** Shorten `text` with an ellipsis until `width(text)` fits `max`. */
export function fitText(text: string, max: number, width: (t: string) => number, ellipsis = "…"): string {
  if (width(text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && width(chars.join("") + ellipsis) > max) chars.pop();
  return chars.join("") + ellipsis;
}

export interface TextImage {
  /** PNG data URL, transparent background. */
  dataUrl: string;
  /** Size in canvas pixels. */
  width: number;
  height: number;
  /** Distance from the top of the image to the text baseline, in pixels. */
  baseline: number;
}

/**
 * One line of text drawn by the browser, which shapes right-to-left and
 * complex scripts correctly, cut with an ellipsis at `maxWidthPx`.
 * Browser only. Null when a canvas is unavailable.
 */
export function rasterTextImage(
  text: string,
  fontPx: number,
  color: readonly [number, number, number],
  maxWidthPx: number,
): TextImage | null {
  const font = `${fontPx}px Helvetica, Arial, sans-serif`;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return null;
  measure.font = font;
  const fitted = fitText(text, maxWidthPx, (t) => measure.measureText(t).width);
  const baseline = Math.ceil(fontPx);
  canvas.width = Math.ceil(measure.measureText(fitted).width) + 2;
  canvas.height = baseline + Math.ceil(fontPx * 0.35);

  // Resizing the canvas resets its state: set the font again.
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fitted, 1, baseline);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, baseline };
}
