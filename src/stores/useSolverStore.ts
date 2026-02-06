import { create } from 'zustand';
import type { Cubie, SolutionStep, Move } from '../types/cube.ts';

interface SolverStore {
  // Solution
  solution: SolutionStep[];
  solutionString: string | null;
  solveError: string | null;

  // Animation playback
  isPlaying: boolean;
  currentStep: number;
  speed: number; // ms per move
  isAnimating: boolean; // true during a single move animation

  // 3D cube state
  cubies: Cubie[];
  initialCubies: Cubie[]; // snapshot for reset
  highlightFace: string | null; // face being rotated

  // Actions
  setSolution: (steps: SolutionStep[], solutionStr: string) => void;
  setSolveError: (error: string | null) => void;
  setCubies: (cubies: Cubie[]) => void;
  setInitialCubies: (cubies: Cubie[]) => void;

  // Playback
  play: () => void;
  pause: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  resetToStart: () => void;
  setSpeed: (speed: number) => void;
  setIsAnimating: (animating: boolean) => void;
  setHighlightFace: (face: string | null) => void;

  // Cube mutation
  applyMoveToState: (move: Move) => void;
  applyInverseMoveToState: (move: Move) => void;

  reset: () => void;
}

export const useSolverStore = create<SolverStore>()((set, get) => ({
  solution: [],
  solutionString: null,
  solveError: null,
  isPlaying: false,
  currentStep: 0,
  speed: 600,
  isAnimating: false,
  cubies: [],
  initialCubies: [],
  highlightFace: null,

  setSolution: (steps, solutionStr) =>
    set({ solution: steps, solutionString: solutionStr, solveError: null }),
  setSolveError: (error) => set({ solveError: error }),
  setCubies: (cubies) => set({ cubies }),
  setInitialCubies: (cubies) => set({ initialCubies: cubies.map((c) => ({ ...c, colors: { ...c.colors } })) }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  nextStep: () => {
    const { currentStep, solution } = get();
    if (currentStep < solution.length) {
      set({ currentStep: currentStep + 1 });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 });
    }
  },

  goToStep: (step) => set({ currentStep: step }),

  resetToStart: () => {
    const { initialCubies } = get();
    set({
      currentStep: 0,
      isPlaying: false,
      cubies: initialCubies.map((c) => ({ ...c, colors: { ...c.colors } })),
    });
  },

  setSpeed: (speed) => set({ speed }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  setHighlightFace: (face) => set({ highlightFace: face }),

  applyMoveToState: (move: Move) => {
    const cubies = get().cubies;
    set({ cubies: rotateFace(cubies, move.face, move.double ? 2 : move.direction) });
  },

  applyInverseMoveToState: (move: Move) => {
    const cubies = get().cubies;
    // Inverse: reverse direction, or same for double
    const dir = move.double ? 2 : -move.direction as (1 | -1);
    set({ cubies: rotateFace(cubies, move.face, dir) });
  },

  reset: () =>
    set({
      solution: [],
      solutionString: null,
      solveError: null,
      isPlaying: false,
      currentStep: 0,
      isAnimating: false,
      cubies: [],
      initialCubies: [],
      highlightFace: null,
    }),
}));

// ── Face Rotation Logic ─────────────────────────────────────────────
// Rotate cubies on a given face by 90° (dir=1 CW, dir=-1 CCW, dir=2 180°)

function rotateFace(cubies: Cubie[], face: string, dir: number): Cubie[] {
  const axis = face === 'U' || face === 'D' ? 'y'
             : face === 'R' || face === 'L' ? 'x'
             : 'z';
  const layer = face === 'U' || face === 'R' || face === 'F' ? 1 : -1;

  // Determine rotation: which axes cycle
  // For Y axis (U/D): x,z cycle. U CW: (x,z)→(z,-x). D CW: (x,z)→(-z,x)
  // For X axis (R/L): y,z cycle. R CW: (y,z)→(-z,y). L CW: (y,z)→(z,-y)
  // For Z axis (F/B): x,y cycle. F CW: (x,y)→(y,-x). B CW: (x,y)→(-y,x)

  const times = dir === 2 ? 2 : dir === -1 ? 3 : 1; // CCW = 3x CW

  return cubies.map((cubie) => {
    if (cubie.position[axis] !== layer) return cubie;

    let { x, y, z } = cubie.position;
    let colors = { ...cubie.colors };

    for (let t = 0; t < times; t++) {
      if (axis === 'y') {
        // U face CW viewed from top: (x,z) → (z,-x)
        const cw = layer === 1;
        const newX = cw ? z : (-z as -1 | 0 | 1);
        const newZ = cw ? (-x as -1 | 0 | 1) : x;
        x = newX as -1 | 0 | 1;
        z = newZ as -1 | 0 | 1;
        // Cycle face colors: front→right→back→left (for U CW from top)
        if (cw) {
          const { front, right, back, left } = colors;
          colors = { ...colors, right: front, back: right, left: back, front: left };
        } else {
          const { front, right, back, left } = colors;
          colors = { ...colors, left: front, front: right, right: back, back: left };
        }
      } else if (axis === 'x') {
        // R face CW viewed from right: (y,z) → (-z,y)
        const cw = layer === 1;
        const newY = cw ? z : (-z as -1 | 0 | 1);
        const newZ = cw ? (-y as -1 | 0 | 1) : y;
        y = newY as -1 | 0 | 1;
        z = newZ as -1 | 0 | 1;
        if (cw) {
          const { top, front, bottom, back } = colors;
          colors = { ...colors, top: front, back: top, bottom: back, front: bottom };
        } else {
          const { top, front, bottom, back } = colors;
          colors = { ...colors, front: top, top: back, back: bottom, bottom: front };
        }
      } else {
        // F face CW viewed from front: (x,y) → (y,-x)
        const cw = layer === 1;
        const newX = cw ? y : (-y as -1 | 0 | 1);
        const newY = cw ? (-x as -1 | 0 | 1) : x;
        x = newX as -1 | 0 | 1;
        y = newY as -1 | 0 | 1;
        if (cw) {
          const { top, right, bottom, left } = colors;
          colors = { ...colors, right: top, bottom: right, left: bottom, top: left };
        } else {
          const { top, right, bottom, left } = colors;
          colors = { ...colors, left: top, top: right, right: bottom, bottom: left };
        }
      }
    }

    return {
      ...cubie,
      position: { x, y, z } as Cubie['position'],
      colors,
    };
  });
}
