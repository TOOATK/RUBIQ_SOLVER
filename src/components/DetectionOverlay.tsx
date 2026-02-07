import { useRef, useEffect } from 'react';
import { useScannerStore } from '../stores/useScannerStore.ts';
import { COLOR_HEX, STABILITY_THRESHOLD_MS } from '../lib/constants.ts';

interface DetectionOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Canvas overlay showing where the app is detecting the cube:
 * - Corner brackets around the detected face
 * - 3x3 grid lines inside the detected quad
 * - Rounded colored squares at each sticker position
 * - Circular progress indicator as stability builds
 * - Color transitions: purple (detecting) -> green (stable/ready)
 */
export default function DetectionOverlay({ videoRef }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detection = useScannerStore((s) => s.currentDetection);
  const colors = useScannerStore((s) => s.currentColors);
  const isStable = useScannerStore((s) => s.isStable);
  const stableMs = useScannerStore((s) => s.stableMs);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d')!;
    let rafId = 0;

    const draw = () => {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();
      const detected = detection?.detected && detection.corners;
      const corners = detection?.corners;
      const stabilityPct = Math.min(1, stableMs / STABILITY_THRESHOLD_MS);

      if (!detected || !corners) {
        // Nothing detected — show subtle crosshair hint in center
        const cx = w / 2;
        const cy = h / 2;
        const breath = Math.sin(now / 1200) * 0.1 + 0.2;
        ctx.strokeStyle = `rgba(255, 255, 255, ${breath})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        // Small crosshair
        const sz = 20;
        ctx.beginPath();
        ctx.moveTo(cx - sz, cy);
        ctx.lineTo(cx + sz, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - sz);
        ctx.lineTo(cx, cy + sz);
        ctx.stroke();

        rafId = requestAnimationFrame(draw);
        return;
      }

      const c = corners;

      // Compute quad dimensions for sizing
      const quadW = Math.sqrt((c[1].x - c[0].x) ** 2 + (c[1].y - c[0].y) ** 2);
      const quadH = Math.sqrt((c[3].x - c[0].x) ** 2 + (c[3].y - c[0].y) ** 2);

      // Colors transition: purple -> green based on stability
      const hue = isStable ? 142 : 250;
      const saturation = 70;
      const lightness = 60;
      const alpha = 0.6 + stabilityPct * 0.35;

      // === 1. Corner brackets at detected quad corners ===
      const bracketLen = Math.min(quadW, quadH) * 0.12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Glow when stable
      if (isStable) {
        ctx.shadowColor = `hsla(142, 80%, 50%, ${stabilityPct * 0.5})`;
        ctx.shadowBlur = 10 + stabilityPct * 6;
      }

      ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
      ctx.lineWidth = 3;

      // Top-left
      drawCornerBracket(ctx, c[0], c[1], c[3], bracketLen);
      // Top-right
      drawCornerBracket(ctx, c[1], c[0], c[2], bracketLen);
      // Bottom-right
      drawCornerBracket(ctx, c[2], c[3], c[1], bracketLen);
      // Bottom-left
      drawCornerBracket(ctx, c[3], c[2], c[0], bracketLen);

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // === 2. Detected quad border ===
      ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
      ctx.closePath();
      ctx.stroke();

      // === 3. 3x3 grid lines inside detected quad ===
      const gridAlpha = 0.2 + stabilityPct * 0.25;
      ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${gridAlpha})`;
      ctx.lineWidth = 1;

      for (let i = 1; i < 3; i++) {
        const t = i / 3;
        // Horizontal
        const left = lerp2D(c[0], c[3], t);
        const right = lerp2D(c[1], c[2], t);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
        // Vertical
        const top = lerp2D(c[0], c[1], t);
        const bottom = lerp2D(c[3], c[2], t);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
      }

      // === 4. Sticker color indicators ===
      if (colors && colors.length === 9) {
        const cellSize = Math.min(quadW, quadH) / 3;
        const stickerSize = cellSize * 0.5;
        const radius = stickerSize * 0.22;

        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            const tx = (col + 0.5) / 3;
            const ty = (row + 0.5) / 3;

            const topPt = lerp2D(c[0], c[1], tx);
            const botPt = lerp2D(c[3], c[2], tx);
            const pt = lerp2D(topPt, botPt, ty);

            const sticker = colors[row * 3 + col];
            const hex = COLOR_HEX[sticker.color];
            const half = stickerSize / 2;

            // Drop shadow
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 1;

            // Filled rounded square
            ctx.fillStyle = hex;
            ctx.beginPath();
            roundedRect(ctx, pt.x - half, pt.y - half, stickerSize, stickerSize, radius);
            ctx.fill();
            ctx.restore();

            // Thin dark border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            roundedRect(ctx, pt.x - half, pt.y - half, stickerSize, stickerSize, radius);
            ctx.stroke();

            // White highlight on center sticker (row=1, col=1)
            if (row === 1 && col === 1) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              roundedRect(ctx, pt.x - half - 2, pt.y - half - 2, stickerSize + 4, stickerSize + 4, radius + 1);
              ctx.stroke();
            }
          }
        }
      }

      // === 5. Stability progress ring (top center of detected quad) ===
      if (stabilityPct > 0.05) {
        // Position above the top edge of the quad
        const topMid = lerp2D(c[0], c[1], 0.5);
        const ringCx = topMid.x;
        const ringCy = topMid.y - 28;
        const ringRadius = 14;

        // Background ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Progress arc
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + stabilityPct * Math.PI * 2;
        ctx.strokeStyle = stabilityPct >= 1
          ? `rgba(34, 197, 94, ${0.8 + Math.sin(now / 150) * 0.2})`
          : `hsla(${hue}, 70%, 60%, 0.85)`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringRadius, startAngle, endAngle);
        ctx.stroke();

        // Checkmark icon when fully stable
        if (stabilityPct >= 1) {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(ringCx - 5, ringCy);
          ctx.lineTo(ringCx - 1, ringCy + 5);
          ctx.lineTo(ringCx + 6, ringCy - 4);
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [detection, colors, isStable, stableMs, videoRef]);

  return <canvas ref={canvasRef} className="detection-canvas" />;
}

// ── Drawing helpers ──────────────────────────────────────────────

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

/** Draw an L-shaped bracket at a quad corner, following the quad edges */
function drawCornerBracket(
  ctx: CanvasRenderingContext2D,
  corner: { x: number; y: number },
  neighbor1: { x: number; y: number },
  neighbor2: { x: number; y: number },
  len: number
) {
  // Direction toward each neighbor
  const d1x = neighbor1.x - corner.x;
  const d1y = neighbor1.y - corner.y;
  const d1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const d2x = neighbor2.x - corner.x;
  const d2y = neighbor2.y - corner.y;
  const d2 = Math.sqrt(d2x * d2x + d2y * d2y);

  const p1x = corner.x + (d1x / d1) * len;
  const p1y = corner.y + (d1y / d1) * len;
  const p2x = corner.x + (d2x / d2) * len;
  const p2y = corner.y + (d2y / d2) * len;

  ctx.beginPath();
  ctx.moveTo(p1x, p1y);
  ctx.lineTo(corner.x, corner.y);
  ctx.lineTo(p2x, p2y);
  ctx.stroke();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}
