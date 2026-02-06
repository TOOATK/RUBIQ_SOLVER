// ── Color & Face Types ──────────────────────────────────────────────

export type CubeColor = 'R' | 'O' | 'Y' | 'G' | 'B' | 'W';

/** Standard face names matching Kociemba notation order */
export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export interface StickerColor {
  color: CubeColor;
  rgb: [number, number, number];
  hsv: [number, number, number];
}

export interface ScannedFace {
  name: FaceName;
  stickers: StickerColor[]; // 9 stickers, row-major: [0]=top-left → [8]=bottom-right
  timestamp: number;
}

// ── Cube State ──────────────────────────────────────────────────────

export interface CubeState {
  faces: Partial<Record<FaceName, ScannedFace>>;
  scannedCount: number;
  isComplete: boolean;
  isValid: boolean;
  kociembaString: string | null;
  errors: string[];
}

// ── 3D Cubie Types ──────────────────────────────────────────────────

export interface Position3D {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  z: -1 | 0 | 1;
}

export type CubieFace = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

export interface Cubie {
  id: string;
  position: Position3D;
  colors: Partial<Record<CubieFace, CubeColor>>;
}

// ── Solver Types ────────────────────────────────────────────────────

export type MoveFace = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

export interface Move {
  notation: string;        // e.g. "R", "U'", "F2"
  face: MoveFace;
  direction: 1 | -1;      // 1 = CW, -1 = CCW
  double: boolean;         // true for 180-degree moves
}

export interface SolutionStep {
  move: Move;
  index: number;
  description: string;
}

// ── Scanner Types ───────────────────────────────────────────────────

export interface DetectionResult {
  detected: boolean;
  corners: { x: number; y: number }[] | null; // 4 corners of detected quad
  boundingArea: number;
}

export interface ExtractionResult {
  stickers: StickerColor[];
  success: boolean;
}

// ── App State ───────────────────────────────────────────────────────

export type AppScreen = 'loading' | 'scanner' | 'manual' | 'solver';

// ── OpenCV global declaration ───────────────────────────────────────

declare global {
  interface Window {
    cv: any;
  }
}
