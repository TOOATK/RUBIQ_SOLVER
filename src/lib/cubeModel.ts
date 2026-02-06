import type { Cubie, FaceName, ScannedFace, Position3D } from '../types/cube.ts';

/**
 * Generate 26 cubies for a 3x3 Rubik's Cube.
 * Each cubie has a position {x,y,z} in [-1,0,1]^3 (center excluded)
 * and up to 3 colored faces.
 */
export function generateCubies(): Cubie[] {
  const cubies: Cubie[] = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        cubies.push({
          id: `${x},${y},${z}`,
          position: { x, y, z } as Position3D,
          colors: {},
        });
      }
    }
  }

  return cubies;
}

/**
 * Assign scanned face colors to cubies.
 *
 * Face sticker order is row-major (top-left=0, bottom-right=8)
 * viewed from outside the cube looking at that face.
 *
 * Mapping:
 *   U face (y=1):  stickers [0..8] → positions viewed from above
 *   D face (y=-1): viewed from below
 *   F face (z=1):  viewed from front
 *   B face (z=-1): viewed from back
 *   R face (x=1):  viewed from right
 *   L face (x=-1): viewed from left
 */
export function assignColorsFromFaces(
  cubies: Cubie[],
  faces: Partial<Record<FaceName, ScannedFace>>
): Cubie[] {
  const result = cubies.map((c) => ({
    ...c,
    colors: { ...c.colors },
  }));

  const findCubie = (x: number, y: number, z: number) =>
    result.find((c) => c.position.x === x && c.position.y === y && c.position.z === z);

  // U face: y=1, viewed from top. Row 0 is z=-1, row 2 is z=1. Col 0 is x=-1, col 2 is x=1.
  if (faces.U) {
    const s = faces.U.stickers;
    const positions = [
      [-1, 1, -1], [0, 1, -1], [1, 1, -1],
      [-1, 1, 0],  [0, 1, 0],  [1, 1, 0],
      [-1, 1, 1],  [0, 1, 1],  [1, 1, 1],
    ];
    positions.forEach(([x, y, z], i) => {
      const cubie = findCubie(x, y, z);
      if (cubie && s[i]) cubie.colors.top = s[i].color;
    });
  }

  // D face: y=-1, viewed from bottom. Row 0 is z=1, row 2 is z=-1. Col 0 is x=-1, col 2 is x=1.
  if (faces.D) {
    const s = faces.D.stickers;
    const positions = [
      [-1, -1, 1],  [0, -1, 1],  [1, -1, 1],
      [-1, -1, 0],  [0, -1, 0],  [1, -1, 0],
      [-1, -1, -1], [0, -1, -1], [1, -1, -1],
    ];
    positions.forEach(([x, y, z], i) => {
      const cubie = findCubie(x, y, z);
      if (cubie && s[i]) cubie.colors.bottom = s[i].color;
    });
  }

  // F face: z=1, viewed from front. Row 0 is y=1, row 2 is y=-1. Col 0 is x=-1, col 2 is x=1.
  if (faces.F) {
    const s = faces.F.stickers;
    const positions = [
      [-1, 1, 1],  [0, 1, 1],  [1, 1, 1],
      [-1, 0, 1],  [0, 0, 1],  [1, 0, 1],
      [-1, -1, 1], [0, -1, 1], [1, -1, 1],
    ];
    positions.forEach(([x, y, z], i) => {
      const cubie = findCubie(x, y, z);
      if (cubie && s[i]) cubie.colors.front = s[i].color;
    });
  }

  // B face: z=-1, viewed from back. Row 0 is y=1, row 2 is y=-1. Col 0 is x=1, col 2 is x=-1.
  if (faces.B) {
    const s = faces.B.stickers;
    const positions = [
      [1, 1, -1],  [0, 1, -1],  [-1, 1, -1],
      [1, 0, -1],  [0, 0, -1],  [-1, 0, -1],
      [1, -1, -1], [0, -1, -1], [-1, -1, -1],
    ];
    positions.forEach(([x, y, z], i) => {
      const cubie = findCubie(x, y, z);
      if (cubie && s[i]) cubie.colors.back = s[i].color;
    });
  }

  // R face: x=1, viewed from right. Row 0 is y=1, row 2 is y=-1. Col 0 is z=-1, col 2 is z=1.
  if (faces.R) {
    const s = faces.R.stickers;
    const positions = [
      [1, 1, -1], [1, 1, 0], [1, 1, 1],
      [1, 0, -1], [1, 0, 0], [1, 0, 1],
      [1, -1, -1],[1, -1, 0],[1, -1, 1],
    ];
    positions.forEach(([x, y, z], i) => {
      const cubie = findCubie(x, y, z);
      if (cubie && s[i]) cubie.colors.right = s[i].color;
    });
  }

  // L face: x=-1, viewed from left. Row 0 is y=1, row 2 is y=-1. Col 0 is z=1, col 2 is z=-1.
  if (faces.L) {
    const s = faces.L.stickers;
    const positions = [
      [-1, 1, 1],  [-1, 1, 0],  [-1, 1, -1],
      [-1, 0, 1],  [-1, 0, 0],  [-1, 0, -1],
      [-1, -1, 1], [-1, -1, 0], [-1, -1, -1],
    ];
    positions.forEach(([x, y, z], i) => {
      const cubie = findCubie(x, y, z);
      if (cubie && s[i]) cubie.colors.left = s[i].color;
    });
  }

  return result;
}
