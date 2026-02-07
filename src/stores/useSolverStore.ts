import { create } from 'zustand';
import type { Cubie, SolutionStep, Move } from '../types/cube.ts';

interface SolverStore {
  // Solution
  solution: SolutionStep[];
  solutionString: string | null;
  solveError: string | null;
  solveStatus: string | null; // "Solving...", "Optimizing (12 → trying 8)...", etc.

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
  setSolveStatus: (status: string | null) => void;
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
  solveStatus: null,
  isPlaying: false,
  currentStep: 0,
  speed: 600,
  isAnimating: false,
  cubies: [],
  initialCubies: [],
  highlightFace: null,

  setSolution: (steps, solutionStr) =>
    set({ solution: steps, solutionString: solutionStr, solveError: null, solveStatus: null }),
  setSolveError: (error) => set({ solveError: error, solveStatus: null }),
  setSolveStatus: (status) => set({ solveStatus: status }),
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
      solveStatus: null,
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

  // All moves are "CW as viewed from outside looking at that face".
  // For +axis faces (U/R/F), CW from outside = one direction in world coords.
  // For -axis faces (D/L/B), CW from outside = the OPPOSITE direction in world coords.
  //
  // We always apply 1 "CW step" per iteration. For CCW moves (dir=-1), we do 3 steps.
  // For double moves (dir=2), we do 2 steps.
  const times = dir === 2 ? 2 : dir === -1 ? 3 : 1;

  return cubies.map((cubie) => {
    if (cubie.position[axis] !== layer) return cubie;

    let { x, y, z } = cubie.position;
    let colors = { ...cubie.colors };

    for (let t = 0; t < times; t++) {
      if (axis === 'y') {
        if (layer === 1) {
          // U CW (from above): back→right→front→left
          // Position: (x,z)→(-z,x)
          const newX = -z as -1 | 0 | 1;
          const newZ = x as -1 | 0 | 1;
          x = newX; z = newZ;
          const { front: f1, right: r1, back: b1, left: l1 } = colors;
          colors = { ...colors, right: b1, front: r1, left: f1, back: l1 };
        } else {
          // D CW (from below): front→right→back→left
          // Position: (x,z)→(z,-x)
          const newX = z as -1 | 0 | 1;
          const newZ = -x as -1 | 0 | 1;
          x = newX; z = newZ;
          const { front: f1, right: r1, back: b1, left: l1 } = colors;
          colors = { ...colors, right: f1, back: r1, left: b1, front: l1 };
        }
      } else if (axis === 'x') {
        if (layer === 1) {
          // R CW: (y,z)→(z,-y), front→top→back→bottom
          const newY = z as -1 | 0 | 1;
          const newZ = -y as -1 | 0 | 1;
          y = newY; z = newZ;
          const { top: t1, front: f1, bottom: b1, back: k1 } = colors;
          colors = { ...colors, top: f1, back: t1, bottom: k1, front: b1 };
        } else {
          // L CW: (y,z)→(-z,y), top→front→bottom→back
          const newY = -z as -1 | 0 | 1;
          const newZ = y as -1 | 0 | 1;
          y = newY; z = newZ;
          const { top: t1, front: f1, bottom: b1, back: k1 } = colors;
          colors = { ...colors, top: k1, front: t1, bottom: f1, back: b1 };
        }
      } else {
        if (layer === 1) {
          // F CW: (x,y)→(y,-x), top→right→bottom→left
          const newX = y as -1 | 0 | 1;
          const newY = -x as -1 | 0 | 1;
          x = newX; y = newY;
          const { top: t1, right: r1, bottom: b1, left: l1 } = colors;
          colors = { ...colors, right: t1, bottom: r1, left: b1, top: l1 };
        } else {
          // B CW: (x,y)→(-y,x), top→left→bottom→right
          const newX = -y as -1 | 0 | 1;
          const newY = x as -1 | 0 | 1;
          x = newX; y = newY;
          const { top: t1, right: r1, bottom: b1, left: l1 } = colors;
          colors = { ...colors, left: t1, bottom: l1, right: b1, top: r1 };
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
