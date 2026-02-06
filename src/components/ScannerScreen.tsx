import { useRef, useEffect } from 'react';
import { useCamera } from '../hooks/useCamera.ts';
import { useScannerLoop } from '../hooks/useScannerLoop.ts';
import { useScannerStore } from '../stores/useScannerStore.ts';
import { useCubeStore } from '../stores/useCubeStore.ts';
import DetectionOverlay from './DetectionOverlay.tsx';
import ScanProgress from './ScanProgress.tsx';
import { STABILITY_THRESHOLD_MS } from '../lib/constants.ts';

interface ScannerScreenProps {
  onComplete: () => void;
  onManualEntry: () => void;
}

export default function ScannerScreen({ onComplete, onManualEntry }: ScannerScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const { ready, error, start, stop } = useCamera();
  const guidanceText = useScannerStore((s) => s.guidanceText);
  const stableMs = useScannerStore((s) => s.stableMs);
  const isComplete = useCubeStore((s) => s.isComplete);

  // Start camera on mount
  useEffect(() => {
    if (videoRef.current) {
      start(videoRef.current);
    }
    return stop;
  }, [start, stop]);

  // Run scanner loop
  useScannerLoop(videoRef, processingCanvasRef, ready);

  // Transition when all 6 faces scanned
  useEffect(() => {
    if (isComplete) {
      // Small delay so user sees "All faces scanned!" message
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  if (error) {
    return (
      <div className="error-screen">
        <h2>Camera Error</h2>
        <p>{error}</p>
        <button className="retry-btn" onClick={() => videoRef.current && start(videoRef.current)}>
          Retry
        </button>
      </div>
    );
  }

  const stabilityPct = Math.min(100, (stableMs / STABILITY_THRESHOLD_MS) * 100);

  return (
    <div className="scanner-screen">
      <div className="camera-container">
        <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        <DetectionOverlay videoRef={videoRef} />
        {/* Hidden canvas for OpenCV processing */}
        <canvas ref={processingCanvasRef} style={{ display: 'none' }} />
      </div>

      <div className="scanner-hud">
        <div className="guidance-text">{guidanceText}</div>

        <div className="stability-bar">
          <div
            className={`stability-fill ${stabilityPct >= 100 ? 'ready' : ''}`}
            style={{ width: `${stabilityPct}%` }}
          />
        </div>

        <ScanProgress />
        
        <button onClick={onManualEntry} className="manual-entry-btn">
          ✏️ Manual Entry / Edit
        </button>
      </div>
    </div>
  );
}
