import { useState, useEffect, useCallback } from 'react';
import type { AppScreen } from './types/cube.ts';
import { initSolver } from './lib/solver.ts';
import { useCubeStore } from './stores/useCubeStore.ts';
import { useSolverStore } from './stores/useSolverStore.ts';
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

  // After scan completes, go to manual editor for review/edit
  const handleScanComplete = useCallback(() => setScreen('manual'), []);

  const handleBackToScan = useCallback(() => {
    useCubeStore.getState().resetCube();
    useSolverStore.getState().reset();
    setScreen('scanner');
  }, []);

  const handleManualEntry = useCallback(() => setScreen('manual'), []);

  const handleManualComplete = useCallback(() => {
    const { isValid, errors } = useCubeStore.getState();
    if (!isValid) {
      console.error('Cannot solve invalid cube:', errors);
      alert(`Cannot solve cube:\n${errors.join('\n')}\n\nPlease fix the colors and try again.`);
      return;
    }
    // Reset solver store before entering solver screen
    useSolverStore.getState().reset();
    setScreen('solver');
  }, []);

  const handleBackToEditor = useCallback(() => {
    useSolverStore.getState().reset();
    setScreen('manual');
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

  return <SolverScreen onBack={handleBackToEditor} />;
}
