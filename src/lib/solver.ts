import Cube from 'cubejs';
import type { Move, SolutionStep, MoveFace } from '../types/cube.ts';
import { FACE_NAMES } from './constants.ts';

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

/**
 * Solve cube from Kociemba notation string.
 * Runs in a Web Worker with a timeout to prevent freezing on invalid states.
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

  // Create a blob-based worker to run solve() off the main thread
  // Uses iterative deepening to find the shortest solution
  const workerCode = `
    importScripts('https://cdn.jsdelivr.net/npm/cubejs@1.0.0/lib/cube.js');
    self.onmessage = function(e) {
      try {
        Cube.initSolver();
        var cube = Cube.fromString(e.data);
        var solution = null;
        for (var depth = 1; depth <= 22; depth++) {
          try {
            var sol = cube.solve(depth);
            if (sol !== null && sol !== undefined) {
              solution = sol;
              break;
            }
          } catch(ex) { /* no solution at this depth */ }
        }
        if (solution !== null) {
          self.postMessage({ ok: true, solution: solution });
        } else {
          self.postMessage({ ok: false, error: 'No solution found' });
        }
      } catch (err) {
        self.postMessage({ ok: false, error: err.message || 'Solve failed' });
      }
    };
  `;

  // Try worker approach first, fall back to main thread with timeout guard
  try {
    return await solveInWorker(workerCode, kociembaString, 30000);
  } catch {
    // Worker failed (e.g. CSP blocks blob workers), try main thread
    console.warn('Worker solve failed, trying main thread...');
    return solveCubeSync(kociembaString);
  }
}

function solveInWorker(workerCode: string, kociembaString: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error('Solver timed out — cube state may be invalid'));
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      if (e.data.ok) {
        resolve(e.data.solution);
      } else {
        reject(new Error(e.data.error));
      }
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(e.message || 'Worker error'));
    };

    worker.postMessage(kociembaString);
  });
}

/** Synchronous solve with iterative deepening — blocks main thread. Used as fallback. */
function solveCubeSync(kociembaString: string): string {
  const cube = Cube.fromString(kociembaString);
  for (let depth = 1; depth <= 22; depth++) {
    try {
      const sol = cube.solve(depth);
      if (sol !== null && sol !== undefined) return sol;
    } catch { /* no solution at this depth */ }
  }
  throw new Error('No solution found');
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
