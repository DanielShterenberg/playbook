/**
 * Minimal type declarations for the gifenc package (no official @types).
 * Reference: https://github.com/mattdesl/gifenc
 */

declare module "gifenc" {
  /** A single palette entry: [r, g, b] or [r, g, b, a] */
  export type PaletteColor = [number, number, number] | [number, number, number, number];

  export interface WriteFrameOptions {
    /** Palette for this frame (required for the first frame). */
    palette?: PaletteColor[];
    /** Frame delay in milliseconds. */
    delay?: number;
    /** Repeat count: 0 = infinite, -1 = no repeat. Default 0. */
    repeat?: number;
    /** Whether this is the first frame (auto-writes header). */
    first?: boolean;
    /** Enable transparency. */
    transparent?: boolean;
    /** Index in the palette to use as transparent color. */
    transparentIndex?: number;
    /** Dispose method. */
    dispose?: number;
    /** Color depth (bits). Default 8. */
    colorDepth?: number;
  }

  export interface GIFEncoderInstance {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    readonly buffer: ArrayBuffer;
    writeHeader(): void;
    writeFrame(
      indexedPixels: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
  }

  export interface GIFEncoderOptions {
    initialCapacity?: number;
    auto?: boolean;
  }

  export function GIFEncoder(options?: GIFEncoderOptions): GIFEncoderInstance;

  /**
   * Quantize RGBA pixel data down to at most `maxColors` palette entries.
   */
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: "rgb565" | "rgb444" | "rgba4444";
      oneBitAlpha?: boolean;
      clearAlpha?: boolean;
      clearAlphaColor?: number;
      clearAlphaThreshold?: number;
    },
  ): PaletteColor[];

  /**
   * Map each RGBA pixel to the nearest palette index.
   */
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: PaletteColor[],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;

  export default GIFEncoder;
}
