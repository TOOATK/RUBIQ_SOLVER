import type { CubeColor, StickerColor } from '../types/cube.ts';

/**
 * Adaptive color classifier that learns from the cube itself.
 * Builds color profiles from detected stickers and uses distance metrics
 * to classify colors more accurately than fixed HSV ranges.
 */

interface ColorProfile {
  color: CubeColor;
  samples: number;
  avgHsv: [number, number, number];
  avgRgb: [number, number, number];
}

export class AdaptiveColorClassifier {
  private profiles: Map<CubeColor, ColorProfile> = new Map();

  /**
   * Add a sticker sample to build the color profile
   */
  addSample(sticker: StickerColor): void {
    const { color, hsv, rgb } = sticker;
    const existing = this.profiles.get(color);

    if (!existing) {
      this.profiles.set(color, {
        color,
        samples: 1,
        avgHsv: [...hsv] as [number, number, number],
        avgRgb: [...rgb] as [number, number, number],
      });
    } else {
      // Running average
      const n = existing.samples;
      existing.avgHsv = [
        (existing.avgHsv[0] * n + hsv[0]) / (n + 1),
        (existing.avgHsv[1] * n + hsv[1]) / (n + 1),
        (existing.avgHsv[2] * n + hsv[2]) / (n + 1),
      ];
      existing.avgRgb = [
        (existing.avgRgb[0] * n + rgb[0]) / (n + 1),
        (existing.avgRgb[1] * n + rgb[1]) / (n + 1),
        (existing.avgRgb[2] * n + rgb[2]) / (n + 1),
      ];
      existing.samples = n + 1;
    }
  }

  /**
   * Add multiple samples from a face (usually 9 stickers)
   */
  addFaceSamples(stickers: StickerColor[]): void {
    stickers.forEach(s => this.addSample(s));
  }

  /**
   * Classify a sticker based on learned profiles using distance metrics.
   * Returns the closest matching color only if confident.
   */
  classify(hsv: [number, number, number], rgb: [number, number, number]): CubeColor | null {
    if (this.profiles.size === 0) return null;

    let bestColor: CubeColor | null = null;
    let bestDistance = Infinity;
    let secondBestDistance = Infinity;

    for (const profile of this.profiles.values()) {
      const distance = this.calculateDistance(hsv, rgb, profile);
      if (distance < bestDistance) {
        secondBestDistance = bestDistance;
        bestDistance = distance;
        bestColor = profile.color;
      } else if (distance < secondBestDistance) {
        secondBestDistance = distance;
      }
    }

    // Only reclassify if confident (clear winner)
    // Require at least 20% better match to change classification
    const confidenceMargin = bestDistance * 1.2;
    if (secondBestDistance < confidenceMargin) {
      // Too close, not confident enough to reclassify
      return null;
    }

    return bestColor;
  }

  /**
   * Calculate distance between a sample and a profile.
   * Uses weighted combination of HSV and RGB distances.
   * Special handling for Red/Orange distinction.
   */
  private calculateDistance(
    hsv: [number, number, number],
    rgb: [number, number, number],
    profile: ColorProfile
  ): number {
    // HSV distance with hue wrapping
    const hDist = this.hueDistance(hsv[0], profile.avgHsv[0]);
    const sDist = Math.abs(hsv[1] - profile.avgHsv[1]);
    const vDist = Math.abs(hsv[2] - profile.avgHsv[2]);

    // RGB distance
    const rDist = Math.abs(rgb[0] - profile.avgRgb[0]);
    const gDist = Math.abs(rgb[1] - profile.avgRgb[1]);
    const bDist = Math.abs(rgb[2] - profile.avgRgb[2]);

    // Special handling for Red/Orange distinction
    // These colors are very close in hue, so RGB ratio is critical
    const isRedOrOrange = profile.color === 'R' || profile.color === 'O';
    const sampleInRedOrangeZone = (hsv[0] <= 22 || hsv[0] >= 168);
    
    if (isRedOrOrange && sampleInRedOrangeZone) {
      // Calculate R/G ratio distance (most important for red/orange)
      const sampleRgRatio = rgb[1] > 0 ? rgb[0] / rgb[1] : 10;
      const profileRgRatio = profile.avgRgb[1] > 0 ? 
        profile.avgRgb[0] / profile.avgRgb[1] : 10;
      const rgRatioDist = Math.abs(sampleRgRatio - profileRgRatio);
      
      // For red/orange, heavily weight RGB ratio and brightness
      return (
        hDist * 1.5 +           // Hue still matters
        sDist * 0.3 +           // Saturation less important
        vDist * 0.8 +           // Brightness important (orange brighter)
        rgRatioDist * 3.0 +     // RGB ratio is CRITICAL
        gDist * 1.2 +           // Green channel very important
        rDist * 0.4 +           // Red channel less discriminative
        bDist * 0.2             // Blue channel least important
      );
    }

    // Standard weighted combination for other colors
    return (
      hDist * 2.0 +     // Hue is very important
      sDist * 0.4 +     // Saturation matters
      vDist * 0.3 +     // Value matters less
      rDist * 0.5 +     // RGB for fine distinction
      gDist * 0.5 +
      bDist * 0.3
    );
  }

  /**
   * Calculate hue distance with wrapping (0 and 180 are close)
   */
  private hueDistance(h1: number, h2: number): number {
    const diff = Math.abs(h1 - h2);
    // Hue wraps around at 180
    return Math.min(diff, 180 - diff);
  }

  /**
   * Get the learned profile for a color
   */
  getProfile(color: CubeColor): ColorProfile | undefined {
    return this.profiles.get(color);
  }

  /**
   * Get all learned profiles
   */
  getAllProfiles(): ColorProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Check if we have enough data for reliable classification
   */
  isReady(): boolean {
    // Need at least 3 different colors with at least 2 samples each
    // Lower threshold to enable faster learning
    return this.profiles.size >= 3 && 
           Array.from(this.profiles.values()).every(p => p.samples >= 2);
  }

  /**
   * Reset all learned data
   */
  reset(): void {
    this.profiles.clear();
  }

  /**
   * Reclassify a face using learned profiles.
   * Returns new stickers if any changes were made, null otherwise.
   * Only changes colors when confident.
   */
  reclassifyFace(stickers: StickerColor[]): StickerColor[] | null {
    if (!this.isReady()) return null;

    let hasChanges = false;
    const newStickers = stickers.map(sticker => {
      const newColor = this.classify(sticker.hsv, sticker.rgb);
      // Only change if adaptive classifier returned a confident result
      // AND it's different from current classification
      if (newColor && newColor !== sticker.color) {
        console.log(`  Reclassifying sticker: ${sticker.color} → ${newColor}`,
          `HSV: [${sticker.hsv.map(v => v.toFixed(0)).join(',')}]`,
          `RGB: [${sticker.rgb.map(v => v.toFixed(0)).join(',')}]`);
        hasChanges = true;
        return { ...sticker, color: newColor };
      }
      return sticker;
    });

    return hasChanges ? newStickers : null;
  }

  /**
   * Debug: log all learned profiles with R/G ratios for red/orange
   */
  logProfiles(): void {
    console.log('[AdaptiveClassifier] Learned profiles:');
    for (const profile of this.profiles.values()) {
      const rgRatio = profile.avgRgb[1] > 0 ? 
        (profile.avgRgb[0] / profile.avgRgb[1]).toFixed(2) : 'N/A';
      
      console.log(`  ${profile.color}: ${profile.samples} samples, ` +
        `HSV avg: [${profile.avgHsv.map(v => v.toFixed(1)).join(', ')}], ` +
        `RGB avg: [${profile.avgRgb.map(v => v.toFixed(1)).join(', ')}], ` +
        `R/G ratio: ${rgRatio}`);
    }
  }
}
