import { useRef, useEffect } from 'react';
import { useScannerStore } from '../stores/useScannerStore.ts';
import { COLOR_HEX } from '../lib/constants.ts';

interface DetectionOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Canvas overlay that draws:
 * - Green border around detected quad
 * - 3x3 grid lines inside the quad
 * - Colored dots at each sticker position
 */
export default function DetectionOverlay({ videoRef }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detection = useScannerStore((s) => s.currentDetection);
  const colors = useScannerStore((s) => s.currentColors);
  const isStable = useScannerStore((s) => s.isStable);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d')!;

    const draw = () => {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detection?.detected && detection.corners) {
        const corners = detection.corners;
        const lineColor = isStable ? '#22c55e' : '#6d5dfc';

        // Draw quad outline
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) {
          ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw 3x3 grid inside quad
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;

        for (let i = 1; i < 3; i++) {
          const t = i / 3;
          // Horizontal lines
          const left = lerp2D(corners[0], corners[3], t);
          const right = lerp2D(corners[1], corners[2], t);
          ctx.beginPath();
          ctx.moveTo(left.x, left.y);
          ctx.lineTo(right.x, right.y);
          ctx.stroke();

          // Vertical lines
          const top = lerp2D(corners[0], corners[1], t);
          const bottom = lerp2D(corners[3], corners[2], t);
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(bottom.x, bottom.y);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;

        // Draw colored dots at sticker centers
        if (colors && colors.length === 9) {
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const t_x = (col + 0.5) / 3;
              const t_y = (row + 0.5) / 3;

              const topPt = lerp2D(corners[0], corners[1], t_x);
              const botPt = lerp2D(corners[3], corners[2], t_x);
              const pt = lerp2D(topPt, botPt, t_y);

              const sticker = colors[row * 3 + col];
              const hex = COLOR_HEX[sticker.color];

              ctx.fillStyle = hex;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
              ctx.fill();

              ctx.strokeStyle = '#000';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
        }
      }

      requestAnimationFrame(draw);
    };

    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [detection, colors, isStable, videoRef]);

  return <canvas ref={canvasRef} className="detection-canvas" />;
}

function lerp2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
): { x: number; y: number } {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}
