import { create } from 'zustand';
import type { DetectionResult, StickerColor } from '../types/cube.ts';

interface ScannerStore {
  // Camera
  stream: MediaStream | null;
  cameraReady: boolean;
  cameraError: string | null;

  // Detection
  currentDetection: DetectionResult | null;
  currentColors: StickerColor[] | null;

  // Stability tracking
  stableMs: number;
  isStable: boolean;

  // OpenCV
  opencvReady: boolean;

  // Guidance
  guidanceText: string;

  // Actions
  setStream: (stream: MediaStream | null) => void;
  setCameraReady: (ready: boolean) => void;
  setCameraError: (error: string | null) => void;
  setDetection: (detection: DetectionResult | null) => void;
  setCurrentColors: (colors: StickerColor[] | null) => void;
  setStability: (ms: number) => void;
  resetStability: () => void;
  setOpencvReady: (ready: boolean) => void;
  setGuidanceText: (text: string) => void;
  reset: () => void;
}

export const useScannerStore = create<ScannerStore>()((set) => ({
  stream: null,
  cameraReady: false,
  cameraError: null,
  currentDetection: null,
  currentColors: null,
  stableMs: 0,
  isStable: false,
  opencvReady: false,
  guidanceText: 'Hold cube face in front of camera',

  setStream: (stream) => set({ stream }),
  setCameraReady: (ready) => set({ cameraReady: ready }),
  setCameraError: (error) => set({ cameraError: error }),
  setDetection: (detection) => set({ currentDetection: detection }),
  setCurrentColors: (colors) => set({ currentColors: colors }),
  setStability: (ms) => set({ stableMs: ms, isStable: ms >= 500 }),
  resetStability: () => set({ stableMs: 0, isStable: false }),
  setOpencvReady: (ready) => set({ opencvReady: ready }),
  setGuidanceText: (text) => set({ guidanceText: text }),
  reset: () =>
    set({
      stream: null,
      cameraReady: false,
      cameraError: null,
      currentDetection: null,
      currentColors: null,
      stableMs: 0,
      isStable: false,
      guidanceText: 'Hold cube face in front of camera',
    }),
}));
