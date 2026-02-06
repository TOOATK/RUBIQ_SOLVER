import { useSolverStore } from '../stores/useSolverStore.ts';

interface SolveControlsProps {
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
}

export default function SolveControls({ onNext, onPrev, onReset }: SolveControlsProps) {
  const isPlaying = useSolverStore((s) => s.isPlaying);
  const currentStep = useSolverStore((s) => s.currentStep);
  const totalSteps = useSolverStore((s) => s.solution.length);
  const isAnimating = useSolverStore((s) => s.isAnimating);
  const speed = useSolverStore((s) => s.speed);
  const play = useSolverStore((s) => s.play);
  const pause = useSolverStore((s) => s.pause);
  const setSpeed = useSolverStore((s) => s.setSpeed);

  const atStart = currentStep === 0;
  const atEnd = currentStep >= totalSteps;

  return (
    <div className="solve-controls">
      <button
        className="ctrl-btn"
        onClick={onReset}
        disabled={atStart && !isPlaying}
        title="Reset"
      >
        ⏮
      </button>

      <button
        className="ctrl-btn"
        onClick={onPrev}
        disabled={atStart || isAnimating}
        title="Previous"
      >
        ⏪
      </button>

      <button
        className="ctrl-btn play"
        onClick={() => (isPlaying ? pause() : play())}
        disabled={atEnd && !isPlaying}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <button
        className="ctrl-btn"
        onClick={onNext}
        disabled={atEnd || isAnimating}
        title="Next"
      >
        ⏩
      </button>

      <div className="speed-control">
        <span>Speed</span>
        <input
          type="range"
          min={200}
          max={1500}
          step={100}
          value={1700 - speed}
          onChange={(e) => setSpeed(1700 - Number(e.target.value))}
        />
      </div>
    </div>
  );
}
