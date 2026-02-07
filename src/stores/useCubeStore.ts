import { create } from 'zustand';
import type { CubeState, ScannedFace, FaceName, CubeColor, StickerColor } from '../types/cube.ts';
import { KOCIEMBA_FACE_ORDER, DEFAULT_CENTER_MAP } from '../lib/constants.ts';

interface CubeStore extends CubeState {
  // Actions
  addScannedFace: (stickers: StickerColor[]) => boolean;
  setAllFaces: (faceColors: Record<FaceName, CubeColor[]>) => void;
  removeFace: (faceName: FaceName) => void;
  resetCube: () => void;

  // Queries
  getScannedCenterColors: () => CubeColor[];
  canScanFace: (centerColor: CubeColor) => boolean;
}

const initialState: CubeState = {
  faces: {},
  scannedCount: 0,
  isComplete: false,
  isValid: false,
  kociembaString: null,
  errors: [],
};

export const useCubeStore = create<CubeStore>()((set, get) => ({
  ...initialState,

  addScannedFace: (stickers: StickerColor[]) => {
    const state = get();
    if (stickers.length !== 9) return false;

    const centerColor = stickers[4].color;

    // Prevent duplicate center colors
    if (!state.canScanFace(centerColor)) return false;

    // Map center color to face name
    const faceName = DEFAULT_CENTER_MAP[centerColor];

    const face: ScannedFace = {
      name: faceName,
      stickers,
      timestamp: Date.now(),
    };

    const newFaces = { ...state.faces, [faceName]: face };
    const scannedCount = Object.keys(newFaces).length;
    const isComplete = scannedCount === 6;

    // Validate and build Kociemba string when complete
    let isValid = false;
    let kociembaString: string | null = null;
    let errors: string[] = [];

    if (isComplete) {
      const validation = validateFaces(newFaces as Record<FaceName, ScannedFace>);
      isValid = validation.valid;
      errors = validation.errors;
      if (isValid) {
        kociembaString = buildKociembaString(newFaces as Record<FaceName, ScannedFace>);
        if (!kociembaString) {
          isValid = false;
          errors.push('Failed to build solver string — color mapping error');
        }
      }
    }

    set({
      faces: newFaces,
      scannedCount,
      isComplete,
      isValid,
      kociembaString,
      errors,
    });

    return true;
  },

  setAllFaces: (faceColors: Record<FaceName, CubeColor[]>) => {
    const newFaces: Record<string, ScannedFace> = {};
    for (const [fn, colors] of Object.entries(faceColors) as [FaceName, CubeColor[]][]) {
      newFaces[fn] = {
        name: fn,
        stickers: colors.map(color => ({ color, rgb: [0, 0, 0] as [number, number, number], hsv: [0, 0, 0] as [number, number, number] })),
        timestamp: Date.now(),
      };
    }

    const scannedCount = Object.keys(newFaces).length;
    const isComplete = scannedCount === 6;
    let isValid = false;
    let kociembaString: string | null = null;
    let errors: string[] = [];

    if (isComplete) {
      const validation = validateFaces(newFaces as Record<FaceName, ScannedFace>);
      isValid = validation.valid;
      errors = validation.errors;
      if (isValid) {
        kociembaString = buildKociembaString(newFaces as Record<FaceName, ScannedFace>);
        if (!kociembaString) {
          isValid = false;
          errors.push('Failed to build solver string — color mapping error');
        }
      }
    }

    set({ faces: newFaces, scannedCount, isComplete, isValid, kociembaString, errors });
  },

  removeFace: (faceName: FaceName) => {
    const state = get();
    const newFaces = { ...state.faces };
    delete newFaces[faceName];
    
    set({
      faces: newFaces,
      scannedCount: Object.keys(newFaces).length,
      isComplete: false,
      isValid: false,
      kociembaString: null,
      errors: [],
    });
  },

  resetCube: () => {
    set(initialState);
  },

  getScannedCenterColors: () => {
    const faces = get().faces;
    return Object.values(faces).map((f) => f.stickers[4].color);
  },

  canScanFace: (centerColor: CubeColor) => {
    const scannedCenters = get().getScannedCenterColors();
    return !scannedCenters.includes(centerColor);
  },
}));

// ── Validation ──────────────────────────────────────────────────────

function validateFaces(
  faces: Record<FaceName, ScannedFace>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check 6 unique center colors
  const centers = Object.values(faces).map((f) => f.stickers[4].color);
  const uniqueCenters = new Set(centers);
  if (uniqueCenters.size !== 6) {
    errors.push(`Expected 6 unique center colors, got ${uniqueCenters.size}`);
  }

  // Check each color appears exactly 9 times
  const counts: Record<string, number> = {};
  for (const face of Object.values(faces)) {
    for (const sticker of face.stickers) {
      counts[sticker.color] = (counts[sticker.color] || 0) + 1;
    }
  }
  for (const [color, count] of Object.entries(counts)) {
    if (count !== 9) {
      errors.push(`Color ${color}: ${count} stickers (expected 9)`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Kociemba String Builder ─────────────────────────────────────────
// Format: 54 chars in order U R F D L B, each face 9 stickers
// Each char is the face letter whose center matches that sticker's color

function buildKociembaString(faces: Record<FaceName, ScannedFace>): string | null {
  // Build color→face mapping from centers
  const colorToFace: Record<string, FaceName> = {};
  for (const face of Object.values(faces)) {
    colorToFace[face.stickers[4].color] = face.name;
  }

  let result = '';
  for (const faceName of KOCIEMBA_FACE_ORDER) {
    const face = faces[faceName];
    for (const sticker of face.stickers) {
      const mapped = colorToFace[sticker.color];
      if (!mapped) {
        console.error(`Kociemba: color '${sticker.color}' has no center face`);
        return null;
      }
      result += mapped;
    }
  }

  if (result.length !== 54) return null;
  return result;
}
