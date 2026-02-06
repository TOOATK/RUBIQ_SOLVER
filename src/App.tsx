import { useState, useEffect, useCallback } from 'react';
import type { AppScreen } from './types/cube.ts';
import { initSolver } from './lib/solver.ts';
import { useCubeStore } from './stores/useCubeStore.ts';
import LoadingScreen from './components/LoadingScreen.tsx';
import ScannerScreen from './components/ScannerScreen.tsx';
import ManualEditor from './components/ManualEditor.tsx';
import SolverScreen from './components/SolverScreen.tsx';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [solverReady, setSolverReady] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);

  // Initialize cubejs solver
  useEffect(() => {
    initSolver().then(() => setSolverReady(true));
  }, []);

  // Poll for OpenCV.js loaded
  useEffect(() => {
    const check = () => {
      if (window.cv && window.cv.Mat) {
        setOpencvReady(true);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  }, []);

  // Transition to scanner when both ready
  useEffect(() => {
    if (solverReady && opencvReady && screen === 'loading') {
      setScreen('scanner');
    }
  }, [solverReady, opencvReady, screen]);

  const handleScanComplete = useCallback(() => setScreen('solver'), []);
  const handleBackToScan = useCallback(() => {
    // Reset cube state when going back to scanner
    useCubeStore.getState().resetCube();
    setScreen('scanner');
  }, []);
  const handleManualEntry = useCallback(() => setScreen('manual'), []);
  const handleManualComplete = useCallback(() => {
    const { isValid, errors } = useCubeStore.getState();
    if (!isValid) {
      console.error('Cannot solve invalid cube:', errors);
      alert(`Cannot solve cube: ${errors.join(', ')}`);
      return;
    }
    setScreen('solver');
  }, []);

  if (screen === 'loading') {
    const msg = !solverReady
      ? 'Initializing solver...'
      : 'Loading OpenCV...';
    return <LoadingScreen message={msg} submessage="This takes a few seconds on first load" />;
  }

  if (screen === 'scanner') {
    return <ScannerScreen onComplete={handleScanComplete} onManualEntry={handleManualEntry} />;
  }

  if (screen === 'manual') {
    return <ManualEditor onComplete={handleManualComplete} onBack={handleBackToScan} />;
  }

  return <SolverScreen onBack={handleBackToScan} />;
}
