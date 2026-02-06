import type { CubeColor, StickerColor } from '../types/cube.ts';
import { COLOR_RANGES, SAMPLE_RADIUS } from './constants.ts';

/**
 * Classify a single pixel into one of 6 cube colors.
 * Uses HSV ranges first, then RGB ratios to break ties (especially Red vs Orange).
 */
export function classifyColor(
  h: number,
  s: number,
  v: number,
  rgb: [number, number, number]
): CubeColor {
  // --- White check first: low saturation, high brightness ---
  if (s < 55 && v > 170) return 'W';

  // --- Low saturation but not bright enough for white → skip to hue-based ---
  if (s < 40) return 'W'; // very desaturated = white under any lighting

  // --- Hue-based classification ---
  // Yellow: distinct hue range
  if (h >= 21 && h <= 38 && s > 80 && v > 150) return 'Y';

  // Green: wide hue range
  if (h >= 36 && h <= 85 && s > 50) return 'G';

  // Blue: wide hue range
  if (h >= 90 && h <= 130 && s > 50) return 'B';

  // --- Red / Orange discrimination (the tricky part) ---
  // Both live in low hue range, but with clear gap: Red ≤7 or ≥168, Orange ≥10
  if ((h <= 20 || h >= 165) && s > 70) {
    return discriminateRedOrange(h, s, v, rgb);
  }

  // --- Fallback: score-based matching ---
  return scoreBased(h, s, v);
}

/**
 * Distinguish Red from Orange - HEAVILY FAVOR ORANGE since it's harder to detect
 */
function discriminateRedOrange(
  h: number,
  s: number,
  v: number,
  rgb: [number, number, number]
): CubeColor {
  const [r, g, b] = rgb;
  const rgRatio = g > 0 ? r / g : 10;

  // If hue is clearly in orange range (6-25), it's orange
  if (h >= 6 && h <= 25) {
    return 'O';
  }

  // If hue is very low (0-5) or very high (170+) with strong red dominance, it's red
  if ((h <= 5 || h >= 170) && rgRatio > 2.5) {
    return 'R';
  }

  // Default to orange (it's the harder color to detect)
  return 'O';
}

/** Fallback score-based classifier for edge cases */
function scoreBased(h: number, s: number, v: number): CubeColor {
  let bestColor: CubeColor = 'W';
  let bestScore = -Infinity;

  for (const [colorKey, ranges] of Object.entries(COLOR_RANGES)) {
    const color = colorKey as CubeColor;
    for (const range of ranges) {
      const score = scoreMatch(h, s, v, range);
      if (score > bestScore) {
        bestScore = score;
        bestColor = color;
      }
    }
  }

  return bestColor;
}

function scoreMatch(
  h: number,
  s: number,
  v: number,
  range: { h: [number, number]; s: [number, number]; v: [number, number] }
): number {
  let score = 0;

  if (h >= range.h[0] && h <= range.h[1]) {
    score += 3;
  } else {
    const hDist = Math.min(Math.abs(h - range.h[0]), Math.abs(h - range.h[1]));
    score -= hDist * 0.15;
  }

  if (s >= range.s[0] && s <= range.s[1]) {
    score += 2;
  } else {
    const sDist = Math.min(Math.abs(s - range.s[0]), Math.abs(s - range.s[1]));
    score -= sDist * 0.05;
  }

  if (v >= range.v[0] && v <= range.v[1]) {
    score += 1;
  } else {
    const vDist = Math.min(Math.abs(v - range.v[0]), Math.abs(v - range.v[1]));
    score -= vDist * 0.05;
  }

  return score;
}

// ── Kept for backward compat (used by extractStickersFromWarped) ──

/** @deprecated Use classifyColor instead */
export function classifyHSV(h: number, s: number, v: number): CubeColor {
  return scoreBased(h, s, v);
}

/**
 * Sample a region of the frame around (cx, cy) and return average RGB.
 */
export function sampleRegionRGB(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number = SAMPLE_RADIUS
): [number, number, number] {
  const { data, width, height } = imageData;
  let r = 0, g = 0, b = 0, count = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        count++;
      }
    }
  }

  return [r / count, g / count, b / count];
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

/**
 * Validate that detected colors form a plausible cube face.
 * Returns true if the face looks valid.
 */
export function validateFaceColors(stickers: StickerColor[]): { valid: boolean; reason?: string } {
  if (stickers.length !== 9) {
    return { valid: false, reason: 'Not 9 stickers' };
  }

  // Count color frequencies
  const colorCounts: Record<string, number> = {};
  stickers.forEach((s) => {
    colorCounts[s.color] = (colorCounts[s.color] || 0) + 1;
  });

  // Check 1: Center must not be white on a colored face (unlikely in real cube)
  const centerColor = stickers[4].color;
  
  // Check 2: Cannot have all same color (except white face)
  const uniqueColors = Object.keys(colorCounts).length;
  if (uniqueColors === 1 && centerColor !== 'W') {
    return { valid: false, reason: 'All same color (not white)' };
  }

  // Check 3: Cannot have more than 5 of any non-center color
  for (const [color, count] of Object.entries(colorCounts)) {
    if (color !== centerColor && count > 5) {
      return { valid: false, reason: `Too many ${color}: ${count}` };
    }
  }

  // Check 4: White should not dominate a colored face
  if (centerColor !== 'W' && (colorCounts['W'] || 0) > 4) {
    return { valid: false, reason: 'Too much white on colored face' };
  }

  // Check 5: Check saturation quality - too many desaturated colors = bad lighting
  const avgSaturation = stickers.reduce((sum, s) => sum + s.hsv[1], 0) / 9;
  if (centerColor !== 'W' && avgSaturation < 60) {
    return { valid: false, reason: `Low saturation: ${avgSaturation.toFixed(0)}` };
  }

  return { valid: true };
}

/**
 * Extract 9 sticker colors from a warped face image (ImageData of WARP_SIZE x WARP_SIZE).
 * Uses the improved classifyColor with RGB ratios for Red/Orange disambiguation.
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

      const rgb = sampleRegionRGB(imageData, cx, cy, SAMPLE_RADIUS);
      const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      const color = classifyColor(hsv[0], hsv[1], hsv[2], rgb);

      stickers.push({ color, rgb, hsv });
    }
  }

  return stickers;
}
