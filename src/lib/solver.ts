import Cube from 'cubejs';
import type { Move, SolutionStep, MoveFace } from '../types/cube.ts';
import { FACE_NAMES } from './constants.ts';
import { useSolverStore } from '../stores/useSolverStore.ts';

let initialized = false;

/** Initialize the Kociemba solver tables (~4s). Call once at startup. */
export function initSolver(): Promise<void> {
  return new Promise((resolve) => {
    if (initialized) {
      resolve();
      return;
    }
    Cube.initSolver();
    initialized = true;
    resolve();
  });
}

// Allows external code to cancel the optimization loop
let skipOptimizationFlag = false;

export function skipOptimization() {
  skipOptimizationFlag = true;
}

/**
 * Solve cube from Kociemba notation string.
 * Uses iterative deepening on the main thread with setTimeout yielding
 * to prevent UI freezes. Returns the shortest solution found.
 */
export async function solveCubeAsync(kociembaString: string): Promise<string> {
  if (!initialized) throw new Error('Solver not initialized');

  // Validate the string format first
  if (!kociembaString || kociembaString.length !== 54) {
    throw new Error(`Invalid Kociemba string length: ${kociembaString?.length ?? 0} (expected 54)`);
  }
  const validChars = new Set(['U', 'R', 'F', 'D', 'L', 'B']);
  for (const ch of kociembaString) {
    if (!validChars.has(ch)) {
      throw new Error(`Invalid character '${ch}' in Kociemba string`);
    }
  }

  // Each face letter must appear exactly 9 times
  const counts: Record<string, number> = {};
  for (const ch of kociembaString) {
    counts[ch] = (counts[ch] || 0) + 1;
  }
  for (const [ch, count] of Object.entries(counts)) {
    if (count !== 9) {
      throw new Error(`Face ${ch} appears ${count} times (expected 9)`);
    }
  }

  const store = useSolverStore.getState();
  store.setSolveStatus('Finding initial solution...');

  // Phase 1: Get a fast solution (this is quick, ~100ms)
  const cube = Cube.fromString(kociembaString);
  const initial = cube.solve();
  if (initial === null || initial === undefined) {
    throw new Error('No solution found');
  }

  let best = initial;
  let bestLen = best.trim().split(/\s+/).length;

  // Send initial solution immediately so user can see/use it
  const initialSteps = parseSolution(best);
  store.setSolution(initialSteps, best);
  store.setSolveStatus(`Found ${bestLen}-move solution, optimizing...`);

  // Phase 2: Iterative deepening — try depths 1..10 max, then stop
  // Cap at 10 to avoid long waits on complex scrambles; Kociemba default is good enough beyond that
  skipOptimizationFlag = false;
  const maxOptimizeDepth = Math.min(10, bestLen - 1);
  for (let depth = 1; depth <= maxOptimizeDepth; depth++) {
    // Yield to browser so UI stays responsive
    await new Promise<void>((r) => setTimeout(r, 0));

    if (skipOptimizationFlag) {
      store.setSolveStatus(null);
      break;
    }

    store.setSolveStatus(`Optimizing: trying ${depth} moves (best: ${bestLen})...`);

    try {
      const sol = cube.solve(depth);
      if (sol !== null && sol !== undefined) {
        const solLen = sol.trim().split(/\s+/).length;
        if (solLen < bestLen) {
          best = sol;
          bestLen = solLen;
          const steps = parseSolution(best);
          store.setSolution(steps, best);
        }
        // Found a solution at this depth — it's optimal since we're ascending
        break;
      }
    } catch {
      // No solution at this depth, continue
      continue;
    }
  }

  store.setSolveStatus(null);
  return best;
}

/** @deprecated Use solveCubeAsync instead */
export function solveCube(kociembaString: string): string {
  if (!initialized) throw new Error('Solver not initialized');
  const cube = Cube.fromString(kociembaString);
  return cube.solve();
}

/** Parse "U R' F2 ..." into SolutionStep[] */
export function parseSolution(solutionString: string): SolutionStep[] {
  const trimmed = solutionString.trim();
  if (!trimmed) return [];

  return trimmed.split(/\s+/).map((notation, index) => {
    const move = parseMove(notation);
    return {
      move,
      index,
      description: describeMove(move),
    };
  });
}

function parseMove(notation: string): Move {
  const face = notation[0] as MoveFace;
  const modifier = notation.slice(1);

  return {
    notation,
    face,
    direction: modifier === "'" ? -1 : 1,
    double: modifier === '2',
  };
}

function describeMove(move: Move): string {
  const faceName = FACE_NAMES[move.face as keyof typeof FACE_NAMES] || move.face;
  if (move.double) return `${faceName} 180°`;
  return `${faceName} ${move.direction === 1 ? 'CW' : 'CCW'}`;
}
