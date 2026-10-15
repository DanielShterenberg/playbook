/**
 * Small text helpers shared by the exporters (PNG / MP4 / PDF).
 */

/**
 * File name (without extension) for an export of a play: the title with
 * letters and digits of any script kept, punctuation (everything unsafe in a
 * file name) dropped and spaces turned into dashes. "play" when nothing is left.
 */
export function exportFileBase(title: string | null | undefined): string {
  const safe = (title ?? "")
    // Any whitespace (tabs, line breaks, NBSP) and any dash separates words.
    .replace(/[\s\u00a0\u2010-\u2015]+/g, " ")
    // ASCII and Latin-1 punctuation, control characters and general punctuation
    // (U+2000–206F) go; "-" and "_" stay. No \p{…} classes: the build targets ES5.
    .replace(/[\u0000-\u001f!-,.\/:-@[-^`{-\u00bf\u2000-\u206f]/g, "")
    .trim()
    .replace(/ +/g, "-");
  return safe || "play";
}

/**
 * Typographic characters a keyboard inserts on its own (curly quotes, long
 * dashes, the ellipsis) as their ASCII look-alikes, so an otherwise Latin
 * title stays real PDF text.
 */
export function asciiPunctuation(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...");
}

/**
 * True when jsPDF's built-in fonts cannot draw `text`: they cover Latin-1
 * only and do no right-to-left shaping, so Hebrew (or any other script)
 * would come out as garbage. Such text is drawn through a canvas instead.
 */
export function needsRasterText(text: string): boolean {
  return /[^\u0020-\u007e\u00a0-\u00ff]/.test(text);
}

/** True when the first strong character of `text` is right-to-left (Hebrew, Arabic …). */
export function startsRightToLeft(text: string): boolean {
  const strong = /[A-Za-z\u00c0-\u024f\u0370-\u058f\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/.exec(text);
  return strong !== null && /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/.test(strong[0]);
}

/** `text` split into user-perceived characters (a letter with its marks, a whole emoji). */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new () => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  return Segmenter ? Array.from(new Segmenter().segment(text), (s) => s.segment) : Array.from(text);
}

/**
 * Shorten `text` with an ellipsis until `width(text)` fits `max`. At least one
 * character is kept, so a hopelessly narrow slot still shows something.
 */
export function fitText(text: string, max: number, width: (t: string) => number, ellipsis = "…"): string {
  if (width(text) <= max) return text;
  const chars = graphemes(text);
  const cut = () => chars.join("").trimEnd() + ellipsis;
  while (chars.length > 1 && width(cut()) > max) chars.pop();
  return cut();
}

/**
 * `text` broken into lines no wider than `max`: its own line breaks are kept
 * (blank lines too), words wrap at spaces, and a word wider than a line is
 * split between characters.
 */
export function wrapText(text: string, max: number, width: (t: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/[ \t]+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= max) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      // A word longer than a line goes over several.
      let rest = graphemes(word);
      while (rest.length > 0) {
        let n = rest.length;
        while (n > 1 && width(rest.slice(0, n).join("")) > max) n--;
        const piece = rest.slice(0, n).join("");
        rest = rest.slice(n);
        if (rest.length > 0) lines.push(piece);
        else line = piece;
      }
    }
    lines.push(line);
  }
  return lines;
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
  // Base direction from the text itself, as dir="auto" does on screen: it
  // decides the order of mixed Hebrew / Latin runs and which end "…" is on.
  ctx.direction = startsRightToLeft(fitted) ? "rtl" : "ltr";
  ctx.textAlign = "left";
  ctx.fillText(fitted, 1, baseline);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, baseline };
}
