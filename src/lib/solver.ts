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

/** Solve cube from Kociemba notation string. Returns solution string. */
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
