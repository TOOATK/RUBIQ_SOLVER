import { useEffect, useRef, useCallback, useState, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import RubiksCube from './RubiksCube.tsx';
import type { RubiksCubeHandle } from './RubiksCube.tsx';
import SolveControls from './SolveControls.tsx';
import { useSolverStore } from '../stores/useSolverStore.ts';
import { useCubeStore } from '../stores/useCubeStore.ts';
import { generateCubies, assignColorsFromFaces } from '../lib/cubeModel.ts';
import { solveCubeAsync, parseSolution, skipOptimization } from '../lib/solver.ts';

// ── Error Boundary for Three.js Canvas ──────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class CanvasErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('Canvas error:', error);
    this.props.onError(error.message || 'Canvas rendering failed');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
          3D rendering failed. Try going back and re-entering.
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Solver Screen ───────────────────────────────────────────────────

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
  const solveError = useSolverStore((s) => s.solveError);
  const cubies = useSolverStore((s) => s.cubies);
  const solveStatus = useSolverStore((s) => s.solveStatus);
  const playingRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Initialize cubies and solve on mount
  useEffect(() => {
    let cancelled = false;
    const store = useSolverStore.getState();
    store.setSolveError(null);

    try {
      const baseCubies = generateCubies();
      const colored = assignColorsFromFaces(baseCubies, faces);

      store.setCubies(colored);
      store.setInitialCubies(colored);
      setReady(true);

      if (kociembaString) {
        solveCubeAsync(kociembaString)
          .then((solStr) => {
            if (cancelled) return;
            const steps = parseSolution(solStr);
            useSolverStore.getState().setSolution(steps, solStr);
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('Solve error:', err);
            useSolverStore.getState().setSolveError(
              err instanceof Error ? err.message : 'Failed to solve cube. The cube colors may be incorrect.'
            );
          });
      } else {
        store.setSolveError('Invalid cube state — no Kociemba string. Go back and check colors.');
      }
    } catch (err) {
      console.error('Initialization error:', err);
      useSolverStore.getState().setSolveError(
        err instanceof Error ? err.message : 'Failed to initialize cube'
      );
    }

    return () => { cancelled = true; };
  }, [faces, kociembaString]);

  // Auto-play: use a ref-based loop to avoid React effect double-firing
  useEffect(() => {
    playingRef.current = isPlaying;
    if (isPlaying) {
      playNextMove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const playNextMove = useCallback(() => {
    if (!playingRef.current) return;

    const { currentStep: step, solution: sol, isAnimating: animating } = useSolverStore.getState();
    if (animating) return; // wait for current animation to finish

    if (step >= sol.length) {
      useSolverStore.getState().pause();
      return;
    }

    const move = sol[step].move;
    cubeRef.current?.animateMove(move).then(() => {
      // Always advance the step counter — the animation already applied the move to cube state.
      // If we skip nextStep here, cube state and step counter get out of sync.
      useSolverStore.getState().nextStep();
      // Only continue auto-play if still playing
      if (!playingRef.current) return;
      requestAnimationFrame(() => playNextMove());
    });
  }, []);

  const handleNext = useCallback(() => {
    const { currentStep: step, solution, isAnimating } = useSolverStore.getState();
    if (isAnimating || step >= solution.length) return;
    const stepSnapshot = step;
    const move = solution[step].move;
    cubeRef.current?.animateMove(move).then(() => {
      // Only advance if step hasn't changed (e.g. due to reset)
      if (useSolverStore.getState().currentStep === stepSnapshot) {
        useSolverStore.getState().nextStep();
      }
    });
  }, []);

  const handlePrev = useCallback(() => {
    const { currentStep, isAnimating, solution } = useSolverStore.getState();
    // Cancel any in-flight animation first
    if (isAnimating) {
      cubeRef.current?.cancelAnimation();
    }
    if (currentStep <= 0) return;

    const prevMove = solution[currentStep - 1].move;
    useSolverStore.getState().applyInverseMoveToState(prevMove);
    useSolverStore.getState().prevStep();
  }, []);

  const handleReset = useCallback(() => {
    // Cancel any in-flight animation before resetting
    playingRef.current = false;
    cubeRef.current?.cancelAnimation();
    useSolverStore.getState().pause();
    useSolverStore.getState().resetToStart();
  }, []);

  const handleCanvasError = useCallback((error: string) => {
    useSolverStore.getState().setSolveError(`Rendering error: ${error}`);
  }, []);

  const currentMove = solution[currentStep];

  return (
    <div className="solver-screen">
      <div className="solver-header">
        <button className="back-btn" onClick={onBack}>
          Edit Colors
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
        {solveStatus && !solveError && (
          <div className="solve-status-banner">
            {solveStatus}
            <button className="skip-btn" onClick={skipOptimization}>Skip</button>
          </div>
        )}
        {solveError && (
          <div className="solve-error-banner">
            <div>{solveError}</div>
            <button className="back-btn" onClick={onBack} style={{ marginTop: 8 }}>
              Go back and fix colors
            </button>
          </div>
        )}

        <CanvasErrorBoundary onError={handleCanvasError}>
          {ready && cubies.length > 0 ? (
            <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 8, 5]} intensity={0.8} />
              <directionalLight position={[-3, -4, -5]} intensity={0.3} />
              <RubiksCube ref={cubeRef} />
              <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
            </Canvas>
          ) : !solveError ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
              Loading cube...
            </div>
          ) : null}
        </CanvasErrorBoundary>
      </div>

      <SolveControls
        onNext={handleNext}
        onPrev={handlePrev}
        onReset={handleReset}
      />
    </div>
  );
}
