import type { CubeColor, StickerColor } from '../types/cube.ts';
import { SAMPLE_RADIUS } from './constants.ts';

// ── LAB Color Space Classification ──────────────────────────────────
// Uses CIEDE2000 distance in CIELAB space for perceptually accurate
// color matching. CIEDE2000 is much better than CIE76 (Euclidean) for
// distinguishing red vs orange thanks to its hue rotation term.
// Inspired by github.com/exactful/rubiks-cube-face-detection

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
// Single reference per color using Rubik's brand-ish sRGB values.
// CIEDE2000 is accurate enough that one reference per color suffices.

interface ColorRef {
  color: CubeColor;
  lab: [number, number, number];
}

// Pure saturated RGB references — same as exactful's approach.
// CIEDE2000's weighting handles the saturation gap between these
// ideal colors and real camera captures.
const COLOR_REFS: ColorRef[] = [
  { color: 'R', lab: rgbToLab(255, 0, 0) },        // Pure red
  { color: 'O', lab: rgbToLab(255, 165, 0) },       // Pure orange
  { color: 'Y', lab: rgbToLab(255, 255, 0) },       // Pure yellow
  { color: 'G', lab: rgbToLab(0, 255, 0) },         // Pure green
  { color: 'B', lab: rgbToLab(0, 0, 255) },         // Pure blue
  { color: 'W', lab: rgbToLab(255, 255, 255) },     // White
];

// ── CIEDE2000 Color Difference ──────────────────────────────────────
// Full implementation of the CIEDE2000 formula (CIE Technical Report).
// Much better than CIE76 for red/orange/yellow discrimination.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const POW25_7 = 6103515625; // 25^7

function ciede2000(lab1: [number, number, number], lab2: [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  // Step 1: Calculate C'ab, h'ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;
  const Cab7 = Cab ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + POW25_7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * DEG;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * DEG;
  if (h2p < 0) h2p += 360;

  // Step 2: Calculate delta L', delta C', delta H'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  // Step 3: Calculate CIEDE2000 weighting functions
  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp: number;
  if (C1p * C2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp - 30) * RAD)
    + 0.24 * Math.cos(2 * hp * RAD)
    + 0.32 * Math.cos((3 * hp + 6) * RAD)
    - 0.20 * Math.cos((4 * hp - 63) * RAD);

  const Lp50sq = (Lp - 50) ** 2;
  const SL = 1 + 0.015 * Lp50sq / Math.sqrt(20 + Lp50sq);
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7 = Cp ** 7;
  const RC = 2 * Math.sqrt(Cp7 / (Cp7 + POW25_7));
  const dTheta = 30 * Math.exp(-(((hp - 275) / 25) ** 2));
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  // Final CIEDE2000
  const dL = dLp / SL;
  const dC = dCp / SC;
  const dH = dHp / SH;

  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

// ── Face-Level Classification ────────────────────────────────────────
// Classify all 9 stickers together using their relative CIEDE2000 distances.
// This gives the algorithm context: it can see that some stickers are
// "redder" and others are "more orange" relative to each other, instead
// of classifying each pixel in isolation.

const ALL_COLORS: CubeColor[] = ['R', 'O', 'Y', 'G', 'B', 'W'];

/**
 * Classify a single pixel into one of 6 cube colors.
 * Returns the best match and the full distance vector for face-level refinement.
 */
function classifySingle(rgb: [number, number, number]): { color: CubeColor; dists: number[] } {
  const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
  const dists: number[] = [];
  let bestColor: CubeColor = 'W';
  let bestDist = Infinity;

  for (let i = 0; i < COLOR_REFS.length; i++) {
    const d = ciede2000(lab, COLOR_REFS[i].lab);
    dists.push(d);
    if (d < bestDist) {
      bestDist = d;
      bestColor = COLOR_REFS[i].color;
    }
  }

  return { color: bestColor, dists };
}

// Keep the export for any code that still calls classifyColor directly
export function classifyColor(
  _h: number,
  _s: number,
  _v: number,
  rgb: [number, number, number]
): CubeColor {
  return classifySingle(rgb).color;
}

/**
 * Classify all 9 stickers as a face using contextual refinement.
 *
 * Phase 1: Compute CIEDE2000 distances for each sticker to all 6 refs.
 * Phase 2: For confusable pairs (W/Y, R/O, O/Y), use relative ranking
 *          across the face to disambiguate.
 */
export function classifyFace(
  rgbs: [number, number, number][],
  hsvs: [number, number, number][]
): CubeColor[] {
  // Phase 1: Get initial classification + full distance matrix
  const items = rgbs.map((rgb, i) => {
    const { color, dists } = classifySingle(rgb);
    return { color, dists, rgb, hsv: hsvs[i] };
  });

  // Phase 2: Resolve confusable pairs using relative distances
  // For each confusable pair, look at stickers assigned to either color
  // and use the relative distance gap to re-assign.
  resolveConfusablePair(items, 'W', 'Y');   // white ↔ yellow
  resolveConfusablePair(items, 'R', 'O');   // red ↔ orange
  resolveConfusablePair(items, 'O', 'Y');   // orange ↔ yellow

  return items.map(it => it.color);
}

/**
 * For a pair of confusable colors (e.g. W/Y), examine all stickers
 * assigned to either. Use KMeans(k=2) on CIEDE2000 distance ratios
 * to split them into two groups, then assign each group to the
 * closer reference.
 */
function resolveConfusablePair(
  items: { color: CubeColor; dists: number[]; rgb: [number, number, number]; hsv: [number, number, number] }[],
  colorA: CubeColor,
  colorB: CubeColor
): void {
  const idxA = ALL_COLORS.indexOf(colorA);
  const idxB = ALL_COLORS.indexOf(colorB);

  // Find stickers assigned to either color
  const candidates: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].color === colorA || items[i].color === colorB) {
      candidates.push(i);
    }
  }

  if (candidates.length < 2) return;

  // Compute the "preference score" for each candidate:
  // score = dist(colorA) - dist(colorB)
  // Negative → closer to A, Positive → closer to B
  const scores = candidates.map(ci => items[ci].dists[idxA] - items[ci].dists[idxB]);

  // Check if there's meaningful spread
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const spread = maxScore - minScore;

  if (spread < 3) {
    // All the same — assign to whichever ref is closer on average
    const avgDistA = candidates.reduce((s, ci) => s + items[ci].dists[idxA], 0) / candidates.length;
    const avgDistB = candidates.reduce((s, ci) => s + items[ci].dists[idxB], 0) / candidates.length;
    const color = avgDistA < avgDistB ? colorA : colorB;
    for (const ci of candidates) {
      items[ci].color = color;
    }
    return;
  }

  // Find the natural gap in scores to split into two groups
  const sortedScores = [...scores].sort((a, b) => a - b);
  let bestGap = 0;
  let bestGapIdx = 0;
  for (let i = 0; i < sortedScores.length - 1; i++) {
    const gap = sortedScores[i + 1] - sortedScores[i];
    if (gap > bestGap) {
      bestGap = gap;
      bestGapIdx = i;
    }
  }

  const threshold = (sortedScores[bestGapIdx] + sortedScores[bestGapIdx + 1]) / 2;

  // Assign: score < threshold → colorA (closer to A), score >= threshold → colorB
  for (let i = 0; i < candidates.length; i++) {
    items[candidates[i]].color = scores[i] < threshold ? colorA : colorB;
  }
}

// ── Robust Pixel Sampling ───────────────────────────────────────────

/**
 * Sample a region using simple mean — equivalent to KMeans(k=1).
 * This matches exactful's cv.kmeans(data, 1, ...) which just computes
 * the centroid of all pixels in the region.
 */
export function sampleRegionRobust(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number = SAMPLE_RADIUS
): [number, number, number] {
  const { data, width, height } = imageData;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) return [128, 128, 128];

  return [rSum / count, gSum / count, bSum / count];
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
 * Uses face-level contextual classification — all 9 stickers are
 * classified together so relative distances help disambiguate
 * confusable pairs (W/Y, R/O, O/Y).
 */
export function extractStickersFromWarped(
  imageData: ImageData,
  size: number
): StickerColor[] {
  const cellSize = size / 3;
  const rgbs: [number, number, number][] = [];
  const hsvs: [number, number, number][] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = Math.floor(col * cellSize + cellSize / 2);
      const cy = Math.floor(row * cellSize + cellSize / 2);

      const rgb = sampleRegionRobust(imageData, cx, cy, SAMPLE_RADIUS);
      const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      rgbs.push(rgb);
      hsvs.push(hsv);
    }
  }

  // Classify all 9 together with contextual refinement
  const colors = classifyFace(rgbs, hsvs);

  return colors.map((color, i) => ({
    color,
    rgb: rgbs[i],
    hsv: hsvs[i],
  }));
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
