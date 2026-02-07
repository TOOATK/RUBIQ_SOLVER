import type { DetectionResult, StickerColor } from '../types/cube.ts';
import { MIN_CONTOUR_AREA, WARP_SIZE } from './constants.ts';
import { extractStickersFromWarped } from './colorClassifier.ts';

/**
 * Detect a Rubik's cube face using multiple strategies:
 *
 * Strategy 1: Grid clustering — find 9 small square contours in a 3x3 pattern
 *             (works for cubes with black edge borders between stickers)
 *
 * Strategy 2: Color region grid — detect colored regions and look for
 *             a 3x3 arrangement of uniform color patches
 *             (works for edgeless/stickerless cubes)
 *
 * Strategy 3: Largest quad fallback — biggest square-ish contour containing
 *             at least some inner squares
 */
export function detectFace(frame: any): DetectionResult {
  const cv = window.cv;
  if (!cv) return { detected: false, corners: null, boundingArea: 0 };

  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    // Preprocess
    cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, dilated, kernel);
    kernel.delete();

    cv.findContours(dilated, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = frame.rows * frame.cols;

    // --- Strategy 1: Find individual sticker squares and cluster into a face ---
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

    // Try grid cluster detection (works for bordered cubes)
    const gridResult = findGridCluster(squares);
    if (gridResult) {
      return {
        detected: true,
        corners: gridResult.corners,
        boundingArea: gridResult.area,
      };
    }

    // --- Strategy 2: Color-region grid detection (for edgeless cubes) ---
    const colorGridResult = detectColorGrid(frame, cv);
    if (colorGridResult) {
      return {
        detected: true,
        corners: colorGridResult.corners,
        boundingArea: colorGridResult.area,
      };
    }

    // --- Strategy 3: Largest outer quad fallback ---
    let bestArea = MIN_CONTOUR_AREA;
    let bestCorners: { x: number; y: number }[] | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < frameArea * 0.03 || area < bestArea) continue;

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.03 * peri, true);

      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const corners = getCorners(approx);
        if (isRoughlySquare(corners, 0.6)) {
          const innerCount = squares.filter((sq) =>
            isPointInsideQuad(sq.cx, sq.cy, corners)
          ).length;

          // Lower threshold: accept if it contains some inner regions
          if (innerCount >= 3) {
            bestArea = area;
            bestCorners = corners;
          }
        }
      }
      approx.delete();
    }

    return {
      detected: bestCorners !== null,
      corners: bestCorners,
      boundingArea: bestArea,
    };
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
  }
}

// ── Strategy 2: Color-based Grid Detection ──────────────────────────
// For edgeless/stickerless cubes where stickers have no black borders.
// Uses color segmentation to find uniform color regions, then checks
// if they form a 3x3 grid pattern.

function detectColorGrid(
  frame: any,
  cv: any
): { corners: { x: number; y: number }[]; area: number } | null {
  const hsv = new cv.Mat();
  const mask = new cv.Mat();
  const morphed = new cv.Mat();
  const contoursMat = new cv.MatVector();
  const hierarchyMat = new cv.Mat();

  try {
    cv.cvtColor(frame, hsv, cv.COLOR_RGBA2RGB);
    const rgb = new cv.Mat();
    hsv.copyTo(rgb);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    rgb.delete();

    const frameArea = frame.rows * frame.cols;
    const minPatchArea = frameArea * 0.005;  // min colored patch
    const maxPatchArea = frameArea * 0.06;   // max colored patch

    const allPatches: SquareInfo[] = [];

    // Detect saturated colored regions (non-white, non-gray)
    // Saturated pixels: S > 60
    cv.inRange(
      hsv,
      new cv.Mat(frame.rows, frame.cols, cv.CV_8UC3, new cv.Scalar(0, 60, 40)),
      new cv.Mat(frame.rows, frame.cols, cv.CV_8UC3, new cv.Scalar(180, 255, 255)),
      mask
    );

    // Also detect white regions (low S, high V)
    const whiteMask = new cv.Mat();
    cv.inRange(
      hsv,
      new cv.Mat(frame.rows, frame.cols, cv.CV_8UC3, new cv.Scalar(0, 0, 160)),
      new cv.Mat(frame.rows, frame.cols, cv.CV_8UC3, new cv.Scalar(180, 50, 255)),
      whiteMask
    );
    cv.bitwise_or(mask, whiteMask, mask);
    whiteMask.delete();

    // Morphological close to fill small gaps within stickers
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.morphologyEx(mask, morphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernel);
    kernel.delete();

    cv.findContours(morphed, contoursMat, hierarchyMat, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contoursMat.size(); i++) {
      const contour = contoursMat.get(i);
      const area = cv.contourArea(contour);

      if (area < minPatchArea || area > maxPatchArea) continue;

      // Check if roughly convex and square-ish
      const peri = cv.arcLength(contour, true);
      const circularity = (4 * Math.PI * area) / (peri * peri);

      // Circularity > 0.5 means roughly square/circular (not elongated)
      if (circularity > 0.45) {
        const m = cv.moments(contour);
        if (m.m00 > 0) {
          allPatches.push({
            cx: m.m10 / m.m00,
            cy: m.m01 / m.m00,
            area,
            contourIdx: i,
          });
        }
      }
    }

    // Try to find a 3x3 grid from color patches
    if (allPatches.length >= 7) {
      const gridResult = findGridCluster(allPatches);
      if (gridResult) {
        return gridResult;
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    hsv.delete();
    mask.delete();
    morphed.delete();
    contoursMat.delete();
    hierarchyMat.delete();
  }
}

/**
 * Perspective-warp the detected face into a WARP_SIZE square
 * and extract 9 sticker colors.
 */
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
      0, 0,
      WARP_SIZE, 0,
      WARP_SIZE, WARP_SIZE,
      0, WARP_SIZE,
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

// ── Grid Cluster Detection ──────────────────────────────────────────

interface SquareInfo {
  cx: number;
  cy: number;
  area: number;
  contourIdx: number;
}

/**
 * Try to find 9 squares arranged in a 3x3 grid pattern.
 * Returns the bounding quad of the grid if found.
 */
function findGridCluster(
  squares: SquareInfo[]
): { corners: { x: number; y: number }[]; area: number } | null {
  if (squares.length < 7) return null; // Allow 7+ (some may be missed)

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

/**
 * Group squares into clusters based on proximity.
 */
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

/**
 * Check if a cluster of squares forms a 3x3 grid pattern.
 * Returns the 4 bounding corners if it does.
 */
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

  // Need at least 7 out of 9 cells filled
  if (assigned < 7) return null;

  // Compute bounding quad with margin
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
