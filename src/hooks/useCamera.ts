import { useRef, useCallback, useState } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    setReady(false);
  }, []);

  const start = useCallback(async (videoEl: HTMLVideoElement) => {
    // Stop any previous session first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    abortRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      // If stop() was called while we were awaiting getUserMedia, discard
      if (abortRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoEl.srcObject = stream;

      // Wait for the video to be ready to play, rather than calling play() immediately
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          videoEl.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        videoEl.addEventListener('canplay', onCanPlay);
        // If already ready
        if (videoEl.readyState >= 3) {
          videoEl.removeEventListener('canplay', onCanPlay);
          resolve();
        }
        // Timeout fallback
        setTimeout(() => {
          videoEl.removeEventListener('canplay', onCanPlay);
          resolve();
        }, 3000);
      });

      if (abortRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        videoEl.srcObject = null;
        return;
      }

      await videoEl.play();

      videoRef.current = videoEl;
      streamRef.current = stream;
      setReady(true);
      setError(null);
    } catch (err) {
      if (abortRef.current) return; // Ignore errors from aborted starts
      const msg = err instanceof Error ? err.message : 'Camera access denied';
      setError(msg);
      setReady(false);
    }
  }, []);

  return { videoRef, ready, error, start, stop };
}
