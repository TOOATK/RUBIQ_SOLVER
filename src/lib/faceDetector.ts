import type { DetectionResult, StickerColor } from '../types/cube.ts';
import { WARP_SIZE } from './constants.ts';
import { extractStickersFromWarped } from './colorClassifier.ts';

/**
 * Detect a Rubik's cube face using a multi-strategy approach.
 * Works for both bordered and edgeless/stickerless cubes.
 *
 * Strategy 1 (primary): Color blob grid detection
 *   - Downscale frame for speed
 *   - Segment by saturation + value to find colored/white blobs
 *   - Find sticker-sized blobs and check for 3×3 grid pattern
 *
 * Strategy 2 (fallback): Edge-based grid detection for bordered cubes
 *
 * Strategy 3 (fallback): Large color region with grid validation
 */
export function detectFace(frame: any): DetectionResult {
  const cv = window.cv;
  if (!cv) return { detected: false, corners: null, boundingArea: 0 };

  // Try edge-based grid detection first (most reliable — works for bordered cubes)
  const edgeResult = detectByEdgeGrid(frame, cv);
  if (edgeResult) {
    return {
      detected: true,
      corners: edgeResult.corners,
      boundingArea: edgeResult.area,
    };
  }

  // Try color-blob grid detection (for edgeless/stickerless cubes)
  const blobResult = detectByColorBlobGrid(frame, cv);
  if (blobResult) {
    return {
      detected: true,
      corners: blobResult.corners,
      boundingArea: blobResult.area,
    };
  }

  return { detected: false, corners: null, boundingArea: 0 };
}

// ── Strategy 1: Color Blob Grid Detection ─────────────────────────────

interface Blob {
  cx: number;
  cy: number;
  area: number;
}

function detectByColorBlobGrid(
  frame: any,
  cv: any
): { corners: { x: number; y: number }[]; area: number } | null {
  // Downscale for speed — work at ~320px width
  const scale = Math.min(1, 320 / frame.cols);
  const small = new cv.Mat();
  const hsv = new cv.Mat();
  const mask = new cv.Mat();
  const morphed = new cv.Mat();
  const contoursMat = new cv.MatVector();
  const hierarchyMat = new cv.Mat();

  try {
    if (scale < 1) {
      cv.resize(frame, small, new cv.Size(
        Math.round(frame.cols * scale),
        Math.round(frame.rows * scale)
      ));
    } else {
      frame.copyTo(small);
    }

    const rgb = new cv.Mat();
    cv.cvtColor(small, rgb, cv.COLOR_RGBA2RGB);
    // Fast Gaussian blur instead of expensive bilateral filter
    cv.GaussianBlur(rgb, rgb, new cv.Size(5, 5), 0);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    rgb.delete();

    const sRows = small.rows;
    const sCols = small.cols;
    const smallArea = sRows * sCols;

    // Create combined mask: any pixel that is a saturated Rubik's color OR white
    // S > 50, V > 40 — balanced thresholds for various lighting conditions
    const lowColor = new cv.Mat(sRows, sCols, cv.CV_8UC3, new cv.Scalar(0, 50, 40));
    const highColor = new cv.Mat(sRows, sCols, cv.CV_8UC3, new cv.Scalar(180, 255, 255));
    cv.inRange(hsv, lowColor, highColor, mask);
    lowColor.delete();
    highColor.delete();

    // White: S < 50, V > 150
    const whiteMask = new cv.Mat();
    const lowW = new cv.Mat(sRows, sCols, cv.CV_8UC3, new cv.Scalar(0, 0, 150));
    const highW = new cv.Mat(sRows, sCols, cv.CV_8UC3, new cv.Scalar(180, 50, 255));
    cv.inRange(hsv, lowW, highW, whiteMask);
    cv.bitwise_or(mask, whiteMask, mask);
    whiteMask.delete();
    lowW.delete();
    highW.delete();

    // Morphological: close to fill gaps within stickers, open to remove noise
    const kernelClose = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    const kernelOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(mask, morphed, cv.MORPH_CLOSE, kernelClose);
    cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernelOpen);
    kernelClose.delete();
    kernelOpen.delete();

    // Find blobs
    cv.findContours(morphed, contoursMat, hierarchyMat, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Sticker size bounds (in downscaled frame)
    // Cube face = ~10-60% of frame, each sticker = ~1/9 of face
    const minBlobArea = smallArea * 0.003;
    const maxBlobArea = smallArea * 0.09;

    const blobs: Blob[] = [];

    for (let i = 0; i < contoursMat.size(); i++) {
      const contour = contoursMat.get(i);
      const area = cv.contourArea(contour);

      if (area < minBlobArea || area > maxBlobArea) continue;

      // Compactness check — stickers should be roughly square/round, not elongated
      const peri = cv.arcLength(contour, true);
      const circularity = (4 * Math.PI * area) / (peri * peri);
      if (circularity < 0.25) continue;

      // Aspect ratio check — must be roughly square
      const rect = cv.boundingRect(contour);
      const aspect = Math.min(rect.width, rect.height) / Math.max(rect.width, rect.height);
      if (aspect < 0.35) continue;

      const m = cv.moments(contour);
      if (m.m00 > 0) {
        blobs.push({
          cx: m.m10 / m.m00,
          cy: m.m01 / m.m00,
          area,
        });
      }
    }

    if (blobs.length < 5) return null;

    // Try to find a 3×3 grid among the blobs
    const gridResult = findBlobGrid(blobs, sCols, sRows);
    if (!gridResult) return null;

    // Scale corners back to original frame coordinates
    const corners = gridResult.corners.map(c => ({
      x: c.x / scale,
      y: c.y / scale,
    }));
    const area = gridResult.area / (scale * scale);

    return { corners, area };

  } catch {
    return null;
  } finally {
    small.delete();
    hsv.delete();
    mask.delete();
    morphed.delete();
    contoursMat.delete();
    hierarchyMat.delete();
  }
}

/**
 * Find 9 blobs forming a 3×3 grid.
 * Strategy: sort blobs by area similarity, then for each candidate center blob,
 * look at nearby blobs and try to fit two perpendicular axes.
 */
function findBlobGrid(
  blobs: Blob[],
  frameW: number,
  frameH: number
): { corners: { x: number; y: number }[]; area: number } | null {
  if (blobs.length < 5) return null;

  const frameCx = frameW / 2;
  const frameCy = frameH / 2;
  const maxFrameDist = Math.sqrt(frameCx ** 2 + frameCy ** 2);

  let bestResult: { corners: { x: number; y: number }[]; area: number; score: number } | null = null;

  // Try each blob as potential grid center
  for (let ci = 0; ci < blobs.length; ci++) {
    const center = blobs[ci];
    const avgSize = Math.sqrt(center.area);

    // Gather nearby blobs within reasonable distance
    const maxDist = avgSize * 7;
    const minDist = avgSize * 0.4;

    const nearby: { blob: Blob; dx: number; dy: number; dist: number; angle: number }[] = [];
    for (let i = 0; i < blobs.length; i++) {
      if (i === ci) continue;
      const dx = blobs[i].cx - center.cx;
      const dy = blobs[i].cy - center.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= minDist && d <= maxDist) {
        // Size compatibility: blob area should be in similar range (0.2x to 5x)
        const areaRatio = blobs[i].area / center.area;
        if (areaRatio > 0.2 && areaRatio < 5) {
          nearby.push({ blob: blobs[i], dx, dy, dist: d, angle: Math.atan2(dy, dx) });
        }
      }
    }

    if (nearby.length < 4) continue;

    // Sort by distance — closest are likely adjacent cells
    nearby.sort((a, b) => a.dist - b.dist);
    const closest = nearby.slice(0, Math.min(12, nearby.length));

    // Try pairs of closest neighbors as axis vectors
    for (let i = 0; i < closest.length; i++) {
      for (let j = i + 1; j < closest.length; j++) {
        const v1 = closest[i];
        const v2 = closest[j];

        // Angle between axes should be 60-120° (ideally ~90°)
        let angleDiff = Math.abs(v1.angle - v2.angle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        if (angleDiff < Math.PI / 3 || angleDiff > 2 * Math.PI / 3) continue;

        // Similar magnitude (grid is roughly square)
        const distRatio = Math.min(v1.dist, v2.dist) / Math.max(v1.dist, v2.dist);
        if (distRatio < 0.35) continue;

        // Try to assign blobs to grid positions using these axes
        const ax1 = { dx: v1.dx, dy: v1.dy };
        const ax2 = { dx: v2.dx, dy: v2.dy };
        const det = ax1.dx * ax2.dy - ax1.dy * ax2.dx;
        if (Math.abs(det) < 0.001) continue;

        const allCandidates = [center, ...nearby.map(n => n.blob)];
        const filled = new Set<string>();
        filled.add('1,1'); // center
        let filledCount = 1;
        const tolerance = Math.max(v1.dist, v2.dist) * 0.45;

        for (const blob of allCandidates) {
          if (blob === center) continue;

          const dx = blob.cx - center.cx;
          const dy = blob.cy - center.cy;

          const r = (dx * ax2.dy - dy * ax2.dx) / det;
          const c = (ax1.dx * dy - ax1.dy * dx) / det;

          const ri = Math.round(r);
          const ci2 = Math.round(c);
          const gridRow = 1 + ri;
          const gridCol = 1 + ci2;

          if (gridRow < 0 || gridRow > 2 || gridCol < 0 || gridCol > 2) continue;

          const key = `${gridRow},${gridCol}`;
          if (filled.has(key)) continue;

          // Check position error
          const expectedX = center.cx + ri * ax1.dx + ci2 * ax2.dx;
          const expectedY = center.cy + ri * ax1.dy + ci2 * ax2.dy;
          const error = Math.sqrt((blob.cx - expectedX) ** 2 + (blob.cy - expectedY) ** 2);

          if (error <= tolerance) {
            filled.add(key);
            filledCount++;
          }
        }

        // Need at least 6 of 9 cells for a confident detection
        if (filledCount < 6) continue;

        // Compute grid bounding corners (with half-sticker margin)
        const half = 0.6;
        const corners = [
          { // top-left
            x: center.cx + (-1 - half) * ax1.dx + (-1 - half) * ax2.dx,
            y: center.cy + (-1 - half) * ax1.dy + (-1 - half) * ax2.dy,
          },
          { // top-right
            x: center.cx + (-1 - half) * ax1.dx + (1 + half) * ax2.dx,
            y: center.cy + (-1 - half) * ax1.dy + (1 + half) * ax2.dy,
          },
          { // bottom-right
            x: center.cx + (1 + half) * ax1.dx + (1 + half) * ax2.dx,
            y: center.cy + (1 + half) * ax1.dy + (1 + half) * ax2.dy,
          },
          { // bottom-left
            x: center.cx + (1 + half) * ax1.dx + (-1 - half) * ax2.dx,
            y: center.cy + (1 + half) * ax1.dy + (-1 - half) * ax2.dy,
          },
        ];

        const area = quadArea(corners);
        const centerDist = Math.sqrt((center.cx - frameCx) ** 2 + (center.cy - frameCy) ** 2);
        const centerScore = 1 - (centerDist / maxFrameDist);
        const score = (filledCount / 9) * 0.6 + centerScore * 0.4;

        if (!bestResult || score > bestResult.score) {
          bestResult = { corners, area, score };
        }
      }
    }
  }

  return bestResult;
}

// ── Strategy 2: Edge-Based Grid Detection ────────────────────────────

function detectByEdgeGrid(
  frame: any,
  cv: any
): { corners: { x: number; y: number }[]; area: number } | null {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, dilated, kernel);
    kernel.delete();

    cv.findContours(dilated, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = frame.rows * frame.cols;
    const squares: SquareInfo[] = [];
    const minStickerArea = frameArea * 0.001;
    const maxStickerArea = frameArea * 0.04;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < minStickerArea || area > maxStickerArea) continue;

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.04 * peri, true);

      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const corners = getCorners(approx);
        if (isRoughlySquare(corners, 0.55)) {
          const m = cv.moments(contour);
          if (m.m00 > 0) {
            squares.push({
              cx: m.m10 / m.m00,
              cy: m.m01 / m.m00,
              area,
              contourIdx: i,
            });
          }
        }
      }
      approx.delete();
    }

    const gridResult = findGridCluster(squares);
    if (gridResult) return gridResult;

    // Fallback: largest quad containing some sticker squares
    let bestArea = 0;
    let bestCorners: { x: number; y: number }[] | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < frameArea * 0.03 || area <= bestArea) continue;

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.04 * peri, true);

      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const corners = getCorners(approx);
        if (isRoughlySquare(corners, 0.5)) {
          const innerCount = squares.filter((sq) =>
            isPointInsideQuad(sq.cx, sq.cy, corners)
          ).length;
          if (innerCount >= 3) {
            bestArea = area;
            bestCorners = corners;
          }
        }
      }
      approx.delete();
    }

    if (bestCorners) {
      return { corners: bestCorners, area: bestArea };
    }

    return null;
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
  }
}

// ── Sticker Color Extraction ─────────────────────────────────────────

export function extractFaceColors(
  frame: any,
  corners: { x: number; y: number }[]
): StickerColor[] | null {
  const cv = window.cv;
  if (!cv || corners.length !== 4) return null;

  const ordered = orderCorners(corners);
  const warped = new cv.Mat();

  try {
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0].x, ordered[0].y,
      ordered[1].x, ordered[1].y,
      ordered[2].x, ordered[2].y,
      ordered[3].x, ordered[3].y,
    ]);
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, WARP_SIZE, 0, WARP_SIZE, WARP_SIZE, 0, WARP_SIZE,
    ]);

    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.warpPerspective(frame, warped, M, new cv.Size(WARP_SIZE, WARP_SIZE));
    srcPts.delete();
    dstPts.delete();
    M.delete();

    const imageData = new ImageData(
      new Uint8ClampedArray(warped.data),
      WARP_SIZE,
      WARP_SIZE
    );

    return extractStickersFromWarped(imageData, WARP_SIZE);
  } catch (e) {
    console.warn('extractFaceColors error:', e);
    return null;
  } finally {
    warped.delete();
  }
}

// ── Grid Cluster Detection (for edge-based strategy) ─────────────────

interface SquareInfo {
  cx: number;
  cy: number;
  area: number;
  contourIdx: number;
}

function findGridCluster(
  squares: SquareInfo[]
): { corners: { x: number; y: number }[]; area: number } | null {
  if (squares.length < 7) return null;

  const sorted = [...squares].sort((a, b) => a.area - b.area);

  for (let start = 0; start <= sorted.length - 7; start++) {
    const candidates: SquareInfo[] = [];
    const refArea = sorted[start].area;

    for (let j = start; j < sorted.length; j++) {
      if (sorted[j].area <= refArea * 4) {
        candidates.push(sorted[j]);
      }
    }

    if (candidates.length < 7) continue;

    const clusters = clusterByProximity(candidates);

    for (const cluster of clusters) {
      if (cluster.length < 7) continue;

      const gridCorners = checkGridPattern(cluster);
      if (gridCorners) {
        const area = quadArea(gridCorners);
        return { corners: gridCorners, area };
      }
    }
  }

  return null;
}

function clusterByProximity(squares: SquareInfo[]): SquareInfo[][] {
  const avgSize = Math.sqrt(squares.reduce((s, sq) => s + sq.area, 0) / squares.length);
  const threshold = avgSize * 3.5;

  const visited = new Set<number>();
  const clusters: SquareInfo[][] = [];

  for (let i = 0; i < squares.length; i++) {
    if (visited.has(i)) continue;

    const cluster: SquareInfo[] = [];
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const idx = queue.shift()!;
      cluster.push(squares[idx]);

      for (let j = 0; j < squares.length; j++) {
        if (visited.has(j)) continue;
        const dx = squares[idx].cx - squares[j].cx;
        const dy = squares[idx].cy - squares[j].cy;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          visited.add(j);
          queue.push(j);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function checkGridPattern(
  cluster: SquareInfo[]
): { x: number; y: number }[] | null {
  const sorted = [...cluster].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  const xCoords = sorted.map((s) => s.cx);
  const yCoords = sorted.map((s) => s.cy);

  const xMin = Math.min(...xCoords);
  const xMax = Math.max(...xCoords);
  const yMin = Math.min(...yCoords);
  const yMax = Math.max(...yCoords);

  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  if (xSpan === 0 || ySpan === 0) return null;
  const ratio = Math.min(xSpan, ySpan) / Math.max(xSpan, ySpan);
  if (ratio < 0.45) return null;

  const cellW = xSpan / 2;
  const cellH = ySpan / 2;

  const grid: (SquareInfo | null)[][] = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];

  let assigned = 0;
  for (const sq of sorted) {
    const col = Math.round((sq.cx - xMin) / (cellW || 1));
    const row = Math.round((sq.cy - yMin) / (cellH || 1));

    if (row >= 0 && row <= 2 && col >= 0 && col <= 2 && !grid[row][col]) {
      grid[row][col] = sq;
      assigned++;
    }
  }

  if (assigned < 7) return null;

  const margin = cellW * 0.85;
  return [
    { x: xMin - margin, y: yMin - margin },
    { x: xMax + margin, y: yMin - margin },
    { x: xMax + margin, y: yMax + margin },
    { x: xMin - margin, y: yMax + margin },
  ];
}

// ── Geometry Helpers ─────────────────────────────────────────────────

function getCorners(approx: any): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let j = 0; j < 4; j++) {
    corners.push({
      x: approx.data32S[j * 2],
      y: approx.data32S[j * 2 + 1],
    });
  }
  return corners;
}

/** Order corners: top-left, top-right, bottom-right, bottom-left */
export function orderCorners(corners: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = [...corners];
  sorted.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const topLeft = sorted[0];
  const bottomRight = sorted[3];

  const remaining = [sorted[1], sorted[2]];
  remaining.sort((a, b) => (a.x - a.y) - (b.x - b.y));
  const bottomLeft = remaining[0];
  const topRight = remaining[1];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function isRoughlySquare(corners: { x: number; y: number }[], threshold = 0.6): boolean {
  const ordered = orderCorners(corners);
  const sides = [
    dist(ordered[0], ordered[1]),
    dist(ordered[1], ordered[2]),
    dist(ordered[2], ordered[3]),
    dist(ordered[3], ordered[0]),
  ];
  const maxSide = Math.max(...sides);
  const minSide = Math.min(...sides);
  return minSide / maxSide > threshold;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function quadArea(corners: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    area += corners[i].x * corners[j].y;
    area -= corners[j].x * corners[i].y;
  }
  return Math.abs(area) / 2;
}

function isPointInsideQuad(
  px: number,
  py: number,
  quad: { x: number; y: number }[]
): boolean {
  const ordered = orderCorners(quad);
  for (let i = 0; i < 4; i++) {
    const a = ordered[i];
    const b = ordered[(i + 1) % 4];
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cross < 0) return false;
  }
  return true;
}
