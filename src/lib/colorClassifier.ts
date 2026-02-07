import type { CubeColor, StickerColor } from '../types/cube.ts';
import { SAMPLE_RADIUS } from './constants.ts';

// ── LAB Color Space Classification ──────────────────────────────────
// Uses Delta-E (CIE76) distance in CIELAB space for perceptually accurate
// color matching. Each cube color has a reference LAB value, and we classify
// by finding the nearest reference color.

/**
 * Convert sRGB [0-255] to CIELAB.
 * Uses D65 illuminant reference white.
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB → linear RGB
  let rl = r / 255;
  let gl = g / 255;
  let bl = b / 255;

  rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
  gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
  bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;

  // Linear RGB → XYZ (D65)
  let x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  let y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / 1.00000;
  let z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;

  // XYZ → LAB
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return [L, a, bVal];
}

/**
 * Convert RGB [0-255] to OpenCV-style HSV: H=[0-180], S=[0-255], V=[0-255]
 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  const v = max;
  const s = max === 0 ? 0 : delta / max;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  // Convert to OpenCV scale: H=0-180, S=0-255, V=0-255
  return [Math.round(h / 2), Math.round(s * 255), Math.round(v * 255)];
}

// ── Reference LAB Colors ────────────────────────────────────────────
// Measured from standard Rubik's Cube stickers under daylight.
// Multiple references per color handle lighting variation.

interface ColorRef {
  color: CubeColor;
  lab: [number, number, number];
}

const COLOR_REFS: ColorRef[] = [
  // Red — low L, high a, low-to-medium b
  { color: 'R', lab: [40, 55, 30] },
  { color: 'R', lab: [35, 60, 25] },
  { color: 'R', lab: [45, 50, 20] },
  // Orange — medium L, medium-high a, high b
  { color: 'O', lab: [62, 40, 60] },
  { color: 'O', lab: [58, 45, 55] },
  { color: 'O', lab: [65, 35, 65] },
  // Yellow — high L, low a, high b
  { color: 'Y', lab: [90, -5, 80] },
  { color: 'Y', lab: [85, 0, 75] },
  { color: 'Y', lab: [88, -10, 70] },
  // Green — medium L, negative a, positive b
  { color: 'G', lab: [48, -45, 30] },
  { color: 'G', lab: [45, -40, 25] },
  { color: 'G', lab: [52, -50, 35] },
  // Blue — low-medium L, positive a (slightly), large negative b
  { color: 'B', lab: [35, 20, -55] },
  { color: 'B', lab: [30, 15, -50] },
  { color: 'B', lab: [40, 10, -45] },
  // White — very high L, near-zero a and b
  { color: 'W', lab: [95, 0, 2] },
  { color: 'W', lab: [90, 2, 5] },
  { color: 'W', lab: [85, 0, 8] },
];

/** Delta-E (CIE76) — Euclidean distance in LAB space */
function deltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
  return Math.sqrt(
    (lab1[0] - lab2[0]) ** 2 +
    (lab1[1] - lab2[1]) ** 2 +
    (lab1[2] - lab2[2]) ** 2
  );
}

// ── Hybrid Classification ───────────────────────────────────────────
// Primary: Delta-E nearest-neighbor in LAB space (accurate for all colors).
// Secondary: HSV hard rules for white (saturation-based) as a guard.

/**
 * Classify a pixel into one of 6 cube colors.
 * Uses Delta-E distance in LAB space as the primary method,
 * with HSV saturation guard for white detection.
 */
export function classifyColor(
  h: number,
  s: number,
  v: number,
  rgb: [number, number, number]
): CubeColor {
  // White guard: very low saturation = white regardless of LAB
  if (s < 45 && v > 160) return 'W';
  if (s < 30) return 'W'; // very desaturated under any brightness

  const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);

  // Find nearest reference color by Delta-E
  let bestColor: CubeColor = 'W';
  let bestDist = Infinity;

  for (const ref of COLOR_REFS) {
    const d = deltaE(lab, ref.lab);
    if (d < bestDist) {
      bestDist = d;
      bestColor = ref.color;
    }
  }

  // If the best match is very far (deltaE > 60), use HSV fallback
  if (bestDist > 60) {
    return hsvFallback(h, s, v);
  }

  return bestColor;
}

/** HSV-based fallback for extreme lighting conditions */
function hsvFallback(h: number, s: number, v: number): CubeColor {
  if (s < 55 && v > 150) return 'W';
  if (h >= 90 && h <= 130 && s > 40) return 'B';
  if (h >= 36 && h <= 85 && s > 40) return 'G';
  if (h >= 21 && h <= 38 && s > 60 && v > 140) return 'Y';
  if ((h <= 25 || h >= 165) && s > 60) {
    return h >= 10 && h <= 25 ? 'O' : 'R';
  }
  return 'W';
}

/**
 * Post-classification pass: resolve Red vs Orange using relative comparison
 * across all stickers on this face.
 *
 * Strategy: Collect LAB values for all R/O stickers. Sort by LAB b-value
 * (yellow axis). Find the natural gap to split Red from Orange.
 * On any given face, lighting is consistent, so relative differences matter
 * more than absolute thresholds.
 */
export function resolveRedOrange(stickers: StickerColor[]): StickerColor[] {
  const roIndices: { idx: number; bLab: number; aLab: number; lLab: number }[] = [];
  for (let i = 0; i < stickers.length; i++) {
    const s = stickers[i];
    if (s.color === 'R' || s.color === 'O') {
      const [l, a, b] = rgbToLab(s.rgb[0], s.rgb[1], s.rgb[2]);
      roIndices.push({ idx: i, bLab: b, aLab: a, lLab: l });
    }
  }

  if (roIndices.length <= 1) return stickers;

  // Sort by LAB b-value (low b = red, high b = orange)
  roIndices.sort((a, b) => a.bLab - b.bLab);

  const bValues = roIndices.map(r => r.bLab);
  const minB = bValues[0];
  const maxB = bValues[bValues.length - 1];
  const spread = maxB - minB;

  const result = [...stickers];

  // If spread is small (<12), they're all the same color
  if (spread < 12) {
    // Use average b AND a to decide
    const avgB = bValues.reduce((s, v) => s + v, 0) / bValues.length;
    const avgA = roIndices.reduce((s, r) => s + r.aLab, 0) / roIndices.length;
    // High a + low b = red. Lower a + high b = orange.
    const color: CubeColor = (avgB > 40 && avgA < 50) ? 'O' : 'R';
    for (const { idx } of roIndices) {
      result[idx] = { ...result[idx], color };
    }
    return result;
  }

  // Find the largest gap between consecutive b-values
  let bestGap = 0;
  let bestSplitIdx = 0;
  for (let i = 0; i < bValues.length - 1; i++) {
    const gap = bValues[i + 1] - bValues[i];
    if (gap > bestGap) {
      bestGap = gap;
      bestSplitIdx = i;
    }
  }

  // If gap is significant (>6), split into two groups
  if (bestGap > 6) {
    for (let i = 0; i <= bestSplitIdx; i++) {
      result[roIndices[i].idx] = { ...result[roIndices[i].idx], color: 'R' };
    }
    for (let i = bestSplitIdx + 1; i < roIndices.length; i++) {
      result[roIndices[i].idx] = { ...result[roIndices[i].idx], color: 'O' };
    }
  } else {
    // No clear gap — use average threshold
    const avgB = bValues.reduce((s, v) => s + v, 0) / bValues.length;
    const color: CubeColor = avgB > 40 ? 'O' : 'R';
    for (const { idx } of roIndices) {
      result[idx] = { ...result[idx], color };
    }
  }

  return result;
}

// ── Robust Pixel Sampling ───────────────────────────────────────────

/**
 * Sample a region with specular highlight rejection.
 * Takes a 5x5 grid of samples, discards the brightest 20% (specular highlights)
 * and the darkest 10% (shadows), then averages the rest.
 */
export function sampleRegionRobust(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number = SAMPLE_RADIUS
): [number, number, number] {
  const { data, width, height } = imageData;
  const samples: { r: number; g: number; b: number; brightness: number }[] = [];

  const step = Math.max(1, Math.floor(radius / 2.5));
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        samples.push({ r, g, b, brightness });
      }
    }
  }

  if (samples.length === 0) return [128, 128, 128];

  samples.sort((a, b) => a.brightness - b.brightness);

  // Discard bottom 10% (shadows) and top 20% (highlights)
  const lo = Math.floor(samples.length * 0.1);
  const hi = Math.ceil(samples.length * 0.8);
  const trimmed = samples.slice(lo, hi);

  if (trimmed.length === 0) return [128, 128, 128];

  let rSum = 0, gSum = 0, bSum = 0;
  for (const s of trimmed) {
    rSum += s.r;
    gSum += s.g;
    bSum += s.b;
  }

  return [
    rSum / trimmed.length,
    gSum / trimmed.length,
    bSum / trimmed.length,
  ];
}

/** @deprecated Use sampleRegionRobust instead */
export function sampleRegionRGB(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number = SAMPLE_RADIUS
): [number, number, number] {
  return sampleRegionRobust(imageData, cx, cy, radius);
}

/**
 * Validate that detected colors form a plausible cube face.
 */
export function validateFaceColors(stickers: StickerColor[]): { valid: boolean; reason?: string } {
  if (stickers.length !== 9) {
    return { valid: false, reason: 'Not 9 stickers' };
  }

  const colorCounts: Record<string, number> = {};
  stickers.forEach((s) => {
    colorCounts[s.color] = (colorCounts[s.color] || 0) + 1;
  });

  const centerColor = stickers[4].color;

  if (Object.keys(colorCounts).length === 1 && centerColor !== 'W') {
    return { valid: false, reason: 'All same color (not white)' };
  }

  for (const [color, count] of Object.entries(colorCounts)) {
    if (color !== centerColor && count > 5) {
      return { valid: false, reason: `Too many ${color}: ${count}` };
    }
  }

  if (centerColor !== 'W' && (colorCounts['W'] || 0) > 4) {
    return { valid: false, reason: 'Too much white on colored face' };
  }

  return { valid: true };
}

/**
 * Extract 9 sticker colors from a warped face image.
 */
export function extractStickersFromWarped(
  imageData: ImageData,
  size: number
): StickerColor[] {
  const cellSize = size / 3;
  const stickers: StickerColor[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = Math.floor(col * cellSize + cellSize / 2);
      const cy = Math.floor(row * cellSize + cellSize / 2);

      const rgb = sampleRegionRobust(imageData, cx, cy, SAMPLE_RADIUS);
      const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      const color = classifyColor(hsv[0], hsv[1], hsv[2], rgb);

      stickers.push({ color, rgb, hsv });
    }
  }

  // Resolve Red vs Orange using relative clustering
  return resolveRedOrange(stickers);
}

// ── Frame Voting ────────────────────────────────────────────────────

/**
 * Maintains a buffer of recent frame classifications and returns
 * the majority-vote result when consensus is reached.
 */
export class FrameVotingBuffer {
  private buffer: CubeColor[][] = [];
  private readonly maxFrames: number;
  private readonly consensusThreshold: number;

  constructor(maxFrames: number = 10, consensusThreshold: number = 0.6) {
    this.maxFrames = maxFrames;
    this.consensusThreshold = consensusThreshold;
  }

  addFrame(colors: CubeColor[]): CubeColor[] | null {
    if (colors.length !== 9) return null;

    this.buffer.push([...colors]);
    if (this.buffer.length > this.maxFrames) {
      this.buffer.shift();
    }

    if (this.buffer.length < 5) return null;

    return this.getConsensus();
  }

  private getConsensus(): CubeColor[] | null {
    const result: CubeColor[] = [];
    const threshold = Math.ceil(this.buffer.length * this.consensusThreshold);

    for (let i = 0; i < 9; i++) {
      const counts: Record<CubeColor, number> = { R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0 };
      for (const frame of this.buffer) {
        counts[frame[i]]++;
      }

      let bestColor: CubeColor = 'W';
      let bestCount = 0;
      for (const [color, count] of Object.entries(counts) as [CubeColor, number][]) {
        if (count > bestCount) {
          bestCount = count;
          bestColor = color;
        }
      }

      if (bestCount < threshold) return null;

      result.push(bestColor);
    }

    return result;
  }

  reset() {
    this.buffer = [];
  }
}

/**
 * Post-process sticker colors using center-anchored correction.
 */
export function centerAnchoredCorrection(
  stickers: StickerColor[],
  scannedFaces: Record<string, { stickers: StickerColor[] }>
): StickerColor[] {
  const globalCounts: Record<CubeColor, number> = { R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0 };

  for (const face of Object.values(scannedFaces)) {
    for (const s of face.stickers) {
      globalCounts[s.color]++;
    }
  }
  for (const s of stickers) {
    globalCounts[s.color]++;
  }

  const overCounts = Object.entries(globalCounts).filter(([, c]) => c > 9) as [CubeColor, number][];
  const underCounts = Object.entries(globalCounts).filter(([, c]) => c < 9) as [CubeColor, number][];

  if (overCounts.length === 0 || underCounts.length === 0) return stickers;

  // Known confusable pairs — all directions
  const confusable: [CubeColor, CubeColor][] = [
    ['R', 'O'], ['O', 'Y'], ['W', 'Y'], ['O', 'R'], ['Y', 'O'], ['Y', 'W'],
  ];
  const corrected = [...stickers];

  for (const [over, overCount] of overCounts) {
    for (const [under] of underCounts) {
      const pair = confusable.find(
        ([a, b]) => (a === over && b === under) || (b === over && a === under)
      );
      if (!pair) continue;

      const excess = overCount - 9;
      let swapped = 0;
      for (let i = 0; i < 9 && swapped < excess; i++) {
        if (i === 4) continue;
        if (corrected[i].color === over) {
          corrected[i] = { ...corrected[i], color: under };
          swapped++;
        }
      }
    }
  }

  return corrected;
}
