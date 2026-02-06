import { useEffect, useRef } from 'react';
import { detectFace, extractFaceColors } from '../lib/faceDetector.ts';
import { useScannerStore } from '../stores/useScannerStore.ts';
import { useCubeStore } from '../stores/useCubeStore.ts';
import { STABILITY_THRESHOLD_MS, STABILITY_POSITION_TOLERANCE, FACE_NAMES, DEFAULT_CENTER_MAP } from '../lib/constants.ts';
import type { CubeColor } from '../types/cube.ts';

/**
 * Runs the CV scanning pipeline in a requestAnimationFrame loop.
 * Detects face → checks stability → auto-captures when stable for 500ms.
 */
export function useScannerLoop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean
) {
  const rafRef = useRef<number>(0);
  const lastCornersRef = useRef<{ x: number; y: number }[] | null>(null);
  const stableStartRef = useRef<number>(0);
  const cooldownRef = useRef<number>(0);
  const debugTimerRef = useRef<number>(0);

  const setDetection = useScannerStore((s) => s.setDetection);
  const setCurrentColors = useScannerStore((s) => s.setCurrentColors);
  const setStability = useScannerStore((s) => s.setStability);
  const resetStability = useScannerStore((s) => s.resetStability);
  const setGuidanceText = useScannerStore((s) => s.setGuidanceText);
  const addScannedFace = useCubeStore((s) => s.addScannedFace);
  const scannedCount = useCubeStore((s) => s.scannedCount);

  useEffect(() => {
    if (!active) return;

    const processFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2 || !window.cv?.Mat) {
        rafRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Draw video frame to canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);

      // Read frame into OpenCV Mat
      let frame: any;
      try {
        frame = window.cv.imread(canvas);
      } catch (e) {
        console.warn('cv.imread failed:', e);
        rafRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // 1. Detect face
      const detection = detectFace(frame);
      setDetection(detection);

      const now = Date.now();

      // Debug logging every 2 seconds
      if (now - debugTimerRef.current > 2000) {
        debugTimerRef.current = now;
        console.log('[Scanner]', {
          detected: detection.detected,
          area: detection.boundingArea,
          hasCorners: !!detection.corners,
          videoSize: `${video.videoWidth}x${video.videoHeight}`,
        });
      }

      if (!detection.detected || !detection.corners) {
        lastCornersRef.current = null;
        stableStartRef.current = 0;
        resetStability();
        setCurrentColors(null);
        updateGuidance(scannedCount, false, setGuidanceText);
        frame.delete();
        rafRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // 2. Extract colors for preview
      let stickers = extractFaceColors(frame, detection.corners);
      setCurrentColors(stickers);

      // Debug: log extracted colors once on detection
      if (stickers && now - debugTimerRef.current < 100) {
        console.log('[Scanner] Colors:', stickers.map((s) => s.color).join(''),
          'HSV center:', stickers[4]?.hsv);
      }

      // 3. Check stability
      const isStable = isSimilarDetection(lastCornersRef.current, detection.corners);
      lastCornersRef.current = detection.corners;

      if (!isStable) {
        stableStartRef.current = now;
        setStability(0);
      } else {
        const elapsed = now - stableStartRef.current;
        setStability(elapsed);

        // 4. Auto-capture when stable enough and not in cooldown
        if (elapsed >= STABILITY_THRESHOLD_MS && stickers && now > cooldownRef.current) {
          const centerColor = stickers[4].color;
          const canScan = useCubeStore.getState().canScanFace(centerColor);
          const scannedCenters = useCubeStore.getState().getScannedCenterColors();
          const faceName = DEFAULT_CENTER_MAP[centerColor];

          console.log('[Scanner] STABLE - attempting capture:', {
            centerColor,
            faceName: FACE_NAMES[faceName],
            canScan,
            scannedCenters: scannedCenters.join(','),
            allColors: stickers.map((s) => s.color).join(''),
            centerHSV: stickers[4].hsv,
            centerRGB: stickers[4].rgb,
          });

          if (canScan) {
            console.log('[Scanner] ✅ CAPTURING face!');
            const added = addScannedFace(stickers);
            if (added) {
              cooldownRef.current = now + 1500; // 1.5s cooldown
              stableStartRef.current = 0;
              resetStability();
              lastCornersRef.current = null;
            } else {
              console.error('[Scanner] ❌ addScannedFace returned false');
            }
          } else {
            console.log('[Scanner] ❌ Face already scanned!');
            setGuidanceText(`${FACE_NAMES[faceName]} already scanned! Show ${getMissingFaces()}`);
          }
        }
      }

      updateGuidance(useCubeStore.getState().scannedCount, detection.detected, setGuidanceText);
      frame.delete();
      rafRef.current = requestAnimationFrame(processFrame);
    };

    rafRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, videoRef, canvasRef]);
}

function isSimilarDetection(
  prev: { x: number; y: number }[] | null,
  curr: { x: number; y: number }[]
): boolean {
  if (!prev || prev.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const dx = Math.abs(prev[i].x - curr[i].x);
    const dy = Math.abs(prev[i].y - curr[i].y);
    if (dx > STABILITY_POSITION_TOLERANCE || dy > STABILITY_POSITION_TOLERANCE) {
      return false;
    }
  }
  return true;
}

function getMissingFaces(): string {
  const scannedCenters = useCubeStore.getState().getScannedCenterColors();
  const allColors: CubeColor[] = ['W', 'R', 'G', 'O', 'B', 'Y'];
  const missingColors = allColors.filter(c => !scannedCenters.includes(c));
  const missingNames = missingColors.map(c => {
    const faceName = DEFAULT_CENTER_MAP[c];
    return FACE_NAMES[faceName];
  });
  return missingNames.join(' or ');
}

function updateGuidance(
  scannedCount: number,
  faceDetected: boolean,
  setGuidanceText: (text: string) => void
) {
  if (scannedCount >= 6) {
    setGuidanceText('All faces scanned! Generating solution...');
    return;
  }

  // Get which faces are missing
  const scannedCenters = useCubeStore.getState().getScannedCenterColors();
  const allColors: CubeColor[] = ['W', 'R', 'G', 'O', 'B', 'Y'];
  const missingColors = allColors.filter(c => !scannedCenters.includes(c));
  const missingNames = missingColors.map(c => {
    const faceName = DEFAULT_CENTER_MAP[c];
    return FACE_NAMES[faceName];
  });

  if (!faceDetected) {
    if (missingNames.length > 0) {
      setGuidanceText(`Show ${missingNames.join(' or ')} face (${scannedCount}/6)`);
    } else {
      setGuidanceText(`Hold cube face in front of camera (${scannedCount}/6)`);
    }
  } else {
    setGuidanceText(`Hold steady... (${scannedCount}/6 scanned)`);
  }
}
