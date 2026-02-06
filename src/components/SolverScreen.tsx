import { useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import RubiksCube from './RubiksCube.tsx';
import type { RubiksCubeHandle } from './RubiksCube.tsx';
import SolveControls from './SolveControls.tsx';
import { useSolverStore } from '../stores/useSolverStore.ts';
import { useCubeStore } from '../stores/useCubeStore.ts';
import { generateCubies, assignColorsFromFaces } from '../lib/cubeModel.ts';
import { solveCube, parseSolution } from '../lib/solver.ts';

interface SolverScreenProps {
  onBack: () => void;
}

export default function SolverScreen({ onBack }: SolverScreenProps) {
  const cubeRef = useRef<RubiksCubeHandle>(null);
  const faces = useCubeStore((s) => s.faces);
  const kociembaString = useCubeStore((s) => s.kociembaString);
  const solution = useSolverStore((s) => s.solution);
  const currentStep = useSolverStore((s) => s.currentStep);
  const isPlaying = useSolverStore((s) => s.isPlaying);
  const isAnimating = useSolverStore((s) => s.isAnimating);
  const solveError = useSolverStore((s) => s.solveError);
  const playingRef = useRef(false);

  // Initialize cubies and solve on mount
  useEffect(() => {
    try {
      const baseCubies = generateCubies();
      const colored = assignColorsFromFaces(baseCubies, faces);

      useSolverStore.getState().setCubies(colored);
      useSolverStore.getState().setInitialCubies(colored);

      if (kociembaString) {
        try {
          const solStr = solveCube(kociembaString);
          const steps = parseSolution(solStr);
          useSolverStore.getState().setSolution(steps, solStr);
        } catch (err) {
          console.error('Solve error:', err);
          useSolverStore.getState().setSolveError(
            err instanceof Error ? err.message : 'Failed to solve cube'
          );
        }
      } else {
        useSolverStore.getState().setSolveError('Invalid cube state - missing Kociemba string');
      }
    } catch (err) {
      console.error('Initialization error:', err);
      useSolverStore.getState().setSolveError(
        err instanceof Error ? err.message : 'Failed to initialize cube'
      );
    }
  }, [faces, kociembaString]);

  // Auto-play loop
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || isAnimating) return;

    const step = useSolverStore.getState().currentStep;
    const sol = useSolverStore.getState().solution;

    if (step >= sol.length) {
      useSolverStore.getState().pause();
      return;
    }

    const move = sol[step].move;
    cubeRef.current?.animateMove(move).then(() => {
      if (playingRef.current) {
        useSolverStore.getState().nextStep();
      }
    });
  }, [isPlaying, isAnimating, currentStep]);

  // Manual step handlers
  const handleNext = useCallback(() => {
    const { currentStep, solution, isAnimating } = useSolverStore.getState();
    if (isAnimating || currentStep >= solution.length) return;
    const move = solution[currentStep].move;
    cubeRef.current?.animateMove(move).then(() => {
      useSolverStore.getState().nextStep();
    });
  }, []);

  const handlePrev = useCallback(() => {
    const { currentStep, isAnimating, solution } = useSolverStore.getState();
    if (isAnimating || currentStep <= 0) return;

    // Undo last move
    const prevMove = solution[currentStep - 1].move;
    useSolverStore.getState().applyInverseMoveToState(prevMove);
    useSolverStore.getState().prevStep();

    // Visually animate the inverse (for now just snap — full inverse animation is complex)
    // The cubie state is already updated, R3F will re-render
  }, []);

  const handleReset = useCallback(() => {
    useSolverStore.getState().resetToStart();
  }, []);

  const currentMove = solution[currentStep];

  return (
    <div className="solver-screen">
      <div className="solver-header">
        <button className="back-btn" onClick={onBack}>
          Rescan
        </button>
        <h2>RUBIQ Solver</h2>
        <div style={{ width: 60 }} />
      </div>

      <div className="cube-canvas-container">
        {currentMove && (
          <div className="move-display">
            <div>{currentMove.move.notation} — {currentMove.description}</div>
            <div className="move-counter">
              Step {currentStep + 1} / {solution.length}
            </div>
          </div>
        )}
        {!currentMove && currentStep >= solution.length && solution.length > 0 && (
          <div className="move-display">
            <div>Solved!</div>
          </div>
        )}
        {solveError && (
          <div className="move-display" style={{ background: 'rgba(239,68,68,0.8)' }}>
            <div>{solveError}</div>
          </div>
        )}

        <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} />
          <directionalLight position={[-3, -4, -5]} intensity={0.3} />
          <RubiksCube ref={cubeRef} />
          <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
        </Canvas>
      </div>

      <SolveControls
        onNext={handleNext}
        onPrev={handlePrev}
        onReset={handleReset}
      />
    </div>
  );
}
