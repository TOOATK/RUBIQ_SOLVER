import type { CubeColor, FaceName } from '../types/cube.ts';

// ── HSV Color Ranges ────────────────────────────────────────────────
// OpenCV HSV: H=0-180, S=0-255, V=0-255

export interface HSVRange {
  h: [number, number];
  s: [number, number];
  v: [number, number];
}

export const COLOR_RANGES: Record<CubeColor, HSVRange[]> = {
  // Red wraps around 0/180 in HSV — very narrow range to avoid overlap with orange
  R: [
    { h: [0, 5],     s: [120, 255], v: [60, 255] },   // Pure red only
    { h: [170, 180], s: [120, 255], v: [60, 255] },   // Wrapped red
  ],
  // Orange: WIDE range, low thresholds - this is the problematic color
  O: [{ h: [6, 25],  s: [70, 255], v: [80, 255] }],   // Much wider, lower thresholds
  Y: [{ h: [26, 38],  s: [80, 255],  v: [150, 255] }],
  G: [{ h: [36, 85],  s: [50, 255],  v: [40, 255] }],
  B: [{ h: [90, 130], s: [50, 255],  v: [40, 255] }],
  W: [{ h: [0, 180],  s: [0, 55],    v: [170, 255] }],
};

// ── Detection Thresholds ────────────────────────────────────────────

export const MIN_CONTOUR_AREA = 8000;
export const STABILITY_THRESHOLD_MS = 1000; // 1 second of stable position before capture
export const STABILITY_POSITION_TOLERANCE = 20; // pixels
export const GRID_SIZE = 3;
export const SAMPLE_RADIUS = 8; // pixels to average around each cell center
export const WARP_SIZE = 300;   // perspective-warped square size in pixels

// ── Color Display Map ───────────────────────────────────────────────

export const COLOR_HEX: Record<CubeColor, string> = {
  R: '#DC2626',
  O: '#F97316',
  Y: '#FACC15',
  G: '#16A34A',
  B: '#2563EB',
  W: '#F9FAFB',
};

export const COLOR_NAMES: Record<CubeColor, string> = {
  R: 'Red',
  O: 'Orange',
  Y: 'Yellow',
  G: 'Green',
  B: 'Blue',
  W: 'White',
};

// ── Face Names ──────────────────────────────────────────────────────

export const FACE_NAMES: Record<FaceName, string> = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
};

/** Kociemba string order */
export const KOCIEMBA_FACE_ORDER: FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

// ── Standard center-color to face mapping ───────────────────────────
// Default Rubik's Cube: W=U, Y=D, R=F, O=B, B=R, G=L
// Standard orientation: white up, red front → blue right, green left

export const DEFAULT_CENTER_MAP: Record<CubeColor, FaceName> = {
  W: 'U',
  Y: 'D',
  R: 'F',
  O: 'B',
  B: 'R',
  G: 'L',
};
