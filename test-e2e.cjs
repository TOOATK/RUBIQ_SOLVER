/**
 * End-to-end test for RUBIQ cube logic.
 * Tests rotateFace, assignColorsFromFaces, buildKociembaString, generateCubies
 * against cubejs solver.
 */

const Cube = require('cubejs');

// ── Constants ───────────────────────────────────────────────────────

const KOCIEMBA_FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

const DEFAULT_CENTER_MAP = {
  W: 'U',
  Y: 'D',
  R: 'F',
  O: 'B',
  B: 'R',
  G: 'L',
};

// Reverse: face -> color
const FACE_TO_COLOR = {};
for (const [color, face] of Object.entries(DEFAULT_CENTER_MAP)) {
  FACE_TO_COLOR[face] = color;
}

// ── generateCubies ──────────────────────────────────────────────────

function generateCubies() {
  const cubies = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        cubies.push({
          id: `${x},${y},${z}`,
          position: { x, y, z },
          colors: {},
        });
      }
    }
  }
  return cubies;
}

// ── assignColorsFromFaces ───────────────────────────────────────────

function assignColorsFromFaces(cubies, faces) {
  const result = cubies.map((c) => ({
    ...c,
    colors: { ...c.colors },
  }));

  const findCubie = (x, y, z) =>
    result.find((c) => c.position.x === x && c.position.y === y && c.position.z === z);

  if (faces.U) {
    const s = faces.U.stickers;
    const positions = [
      [-1,1,-1],[0,1,-1],[1,1,-1],
      [-1,1,0],[0,1,0],[1,1,0],
      [-1,1,1],[0,1,1],[1,1,1],
    ];
    positions.forEach(([x,y,z], i) => {
      const cubie = findCubie(x,y,z);
      if (cubie && s[i]) cubie.colors.top = s[i].color;
    });
  }

  if (faces.D) {
    const s = faces.D.stickers;
    const positions = [
      [-1,-1,1],[0,-1,1],[1,-1,1],
      [-1,-1,0],[0,-1,0],[1,-1,0],
      [-1,-1,-1],[0,-1,-1],[1,-1,-1],
    ];
    positions.forEach(([x,y,z], i) => {
      const cubie = findCubie(x,y,z);
      if (cubie && s[i]) cubie.colors.bottom = s[i].color;
    });
  }

  if (faces.F) {
    const s = faces.F.stickers;
    const positions = [
      [-1,1,1],[0,1,1],[1,1,1],
      [-1,0,1],[0,0,1],[1,0,1],
      [-1,-1,1],[0,-1,1],[1,-1,1],
    ];
    positions.forEach(([x,y,z], i) => {
      const cubie = findCubie(x,y,z);
      if (cubie && s[i]) cubie.colors.front = s[i].color;
    });
  }

  if (faces.B) {
    const s = faces.B.stickers;
    const positions = [
      [1,1,-1],[0,1,-1],[-1,1,-1],
      [1,0,-1],[0,0,-1],[-1,0,-1],
      [1,-1,-1],[0,-1,-1],[-1,-1,-1],
    ];
    positions.forEach(([x,y,z], i) => {
      const cubie = findCubie(x,y,z);
      if (cubie && s[i]) cubie.colors.back = s[i].color;
    });
  }

  if (faces.R) {
    const s = faces.R.stickers;
    const positions = [
      [1,1,1],[1,1,0],[1,1,-1],
      [1,0,1],[1,0,0],[1,0,-1],
      [1,-1,1],[1,-1,0],[1,-1,-1],
    ];
    positions.forEach(([x,y,z], i) => {
      const cubie = findCubie(x,y,z);
      if (cubie && s[i]) cubie.colors.right = s[i].color;
    });
  }

  if (faces.L) {
    const s = faces.L.stickers;
    const positions = [
      [-1,1,-1],[-1,1,0],[-1,1,1],
      [-1,0,-1],[-1,0,0],[-1,0,1],
      [-1,-1,-1],[-1,-1,0],[-1,-1,1],
    ];
    positions.forEach(([x,y,z], i) => {
      const cubie = findCubie(x,y,z);
      if (cubie && s[i]) cubie.colors.left = s[i].color;
    });
  }

  return result;
}

// ── rotateFace ──────────────────────────────────────────────────────

function rotateFace(cubies, face, dir) {
  const axis = face === 'U' || face === 'D' ? 'y'
             : face === 'R' || face === 'L' ? 'x'
             : 'z';
  const layer = face === 'U' || face === 'R' || face === 'F' ? 1 : -1;

  const times = dir === 2 ? 2 : dir === -1 ? 3 : 1;

  return cubies.map((cubie) => {
    if (cubie.position[axis] !== layer) return cubie;

    let { x, y, z } = cubie.position;
    let colors = { ...cubie.colors };

    for (let t = 0; t < times; t++) {
      if (axis === 'y') {
        if (layer === 1) {
          const newX = -z;
          const newZ = x;
          x = newX; z = newZ;
          const { front: f1, right: r1, back: b1, left: l1 } = colors;
          colors = { ...colors, right: b1, front: r1, left: f1, back: l1 };
        } else {
          const newX = z;
          const newZ = -x;
          x = newX; z = newZ;
          const { front: f1, right: r1, back: b1, left: l1 } = colors;
          colors = { ...colors, right: f1, back: r1, left: b1, front: l1 };
        }
      } else if (axis === 'x') {
        if (layer === 1) {
          const newY = z;
          const newZ = -y;
          y = newY; z = newZ;
          const { top: t1, front: f1, bottom: b1, back: k1 } = colors;
          colors = { ...colors, top: f1, back: t1, bottom: k1, front: b1 };
        } else {
          const newY = -z;
          const newZ = y;
          y = newY; z = newZ;
          const { top: t1, front: f1, bottom: b1, back: k1 } = colors;
          colors = { ...colors, top: k1, front: t1, bottom: f1, back: b1 };
        }
      } else {
        if (layer === 1) {
          const newX = y;
          const newY = -x;
          x = newX; y = newY;
          const { top: t1, right: r1, bottom: b1, left: l1 } = colors;
          colors = { ...colors, right: t1, bottom: r1, left: b1, top: l1 };
        } else {
          const newX = -y;
          const newY = x;
          x = newX; y = newY;
          const { top: t1, right: r1, bottom: b1, left: l1 } = colors;
          colors = { ...colors, left: t1, bottom: l1, right: b1, top: r1 };
        }
      }
    }

    return {
      ...cubie,
      position: { x, y, z },
      colors,
    };
  });
}

// ── buildKociembaString from cubies ─────────────────────────────────
// Reads cubies and produces the 54-char Kociemba string

function buildKociembaStringFromCubies(cubies) {
  const findCubie = (x, y, z) =>
    cubies.find((c) => c.position.x === x && c.position.y === y && c.position.z === z);

  // For each Kociemba face, read stickers in correct order
  // and map color -> face name using DEFAULT_CENTER_MAP
  const faceStickers = {};

  // U face: y=1
  faceStickers.U = [
    [-1,1,-1],[0,1,-1],[1,1,-1],
    [-1,1,0],[0,1,0],[1,1,0],
    [-1,1,1],[0,1,1],[1,1,1],
  ].map(([x,y,z]) => findCubie(x,y,z)?.colors.top);

  // R face: x=1
  faceStickers.R = [
    [1,1,1],[1,1,0],[1,1,-1],
    [1,0,1],[1,0,0],[1,0,-1],
    [1,-1,1],[1,-1,0],[1,-1,-1],
  ].map(([x,y,z]) => findCubie(x,y,z)?.colors.right);

  // F face: z=1
  faceStickers.F = [
    [-1,1,1],[0,1,1],[1,1,1],
    [-1,0,1],[0,0,1],[1,0,1],
    [-1,-1,1],[0,-1,1],[1,-1,1],
  ].map(([x,y,z]) => findCubie(x,y,z)?.colors.front);

  // D face: y=-1
  faceStickers.D = [
    [-1,-1,1],[0,-1,1],[1,-1,1],
    [-1,-1,0],[0,-1,0],[1,-1,0],
    [-1,-1,-1],[0,-1,-1],[1,-1,-1],
  ].map(([x,y,z]) => findCubie(x,y,z)?.colors.bottom);

  // L face: x=-1
  faceStickers.L = [
    [-1,1,-1],[-1,1,0],[-1,1,1],
    [-1,0,-1],[-1,0,0],[-1,0,1],
    [-1,-1,-1],[-1,-1,0],[-1,-1,1],
  ].map(([x,y,z]) => findCubie(x,y,z)?.colors.left);

  // B face: z=-1
  faceStickers.B = [
    [1,1,-1],[0,1,-1],[-1,1,-1],
    [1,0,-1],[0,0,-1],[-1,0,-1],
    [1,-1,-1],[0,-1,-1],[-1,-1,-1],
  ].map(([x,y,z]) => findCubie(x,y,z)?.colors.back);

  let result = '';
  for (const faceName of KOCIEMBA_FACE_ORDER) {
    for (const color of faceStickers[faceName]) {
      if (!color) return null;
      const mapped = DEFAULT_CENTER_MAP[color];
      if (!mapped) return null;
      result += mapped;
    }
  }

  return result.length === 54 ? result : null;
}

// ── Build solved cubies ─────────────────────────────────────────────

function buildSolvedCubies() {
  const cubies = generateCubies();

  // Create solved faces: each face has 9 stickers of its color
  const faces = {};
  for (const [color, faceName] of Object.entries(DEFAULT_CENTER_MAP)) {
    faces[faceName] = {
      name: faceName,
      stickers: Array(9).fill(null).map(() => ({
        color,
        rgb: [0, 0, 0],
        hsv: [0, 0, 0],
      })),
      timestamp: Date.now(),
    };
  }

  return assignColorsFromFaces(cubies, faces);
}

// ── Parse move notation ─────────────────────────────────────────────

function parseMove(notation) {
  const face = notation[0];
  const isPrime = notation.includes("'");
  const isDouble = notation.includes("2");
  return {
    notation,
    face,
    direction: isPrime ? -1 : 1,
    double: isDouble,
  };
}

function applyMove(cubies, move) {
  const dir = move.double ? 2 : move.direction;
  return rotateFace(cubies, move.face, dir);
}

// ── Test Runner ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Mismatch'}\n        Expected: ${expected}\n        Actual:   ${actual}`);
  }
}

// ── Initialize cubejs solver ────────────────────────────────────────

console.log('Initializing cubejs solver (this may take a few seconds)...');
Cube.initSolver();
console.log('Solver initialized.\n');

const SOLVED_KOCIEMBA = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

// ── Test A: Solved cube produces correct Kociemba string ────────────

console.log('Test A: Solved cube Kociemba string');
test('Solved cube produces "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"', () => {
  const cubies = buildSolvedCubies();
  const kociemba = buildKociembaStringFromCubies(cubies);
  assertEqual(kociemba, SOLVED_KOCIEMBA, 'Solved Kociemba string mismatch');
});

// ── Test B: Single R move ───────────────────────────────────────────

console.log('\nTest B: Single R move');
test('R move on solved cube matches cubejs R result', () => {
  let cubies = buildSolvedCubies();
  const move = parseMove('R');
  cubies = applyMove(cubies, move);
  const ourKociemba = buildKociembaStringFromCubies(cubies);

  // cubejs: apply R to solved
  const cube = new Cube();
  cube.move('R');
  const cubejsKociemba = cube.asString();

  assertEqual(ourKociemba, cubejsKociemba, 'R move Kociemba mismatch');
});

// ── Test C: 5 random moves, solve, verify ───────────────────────────

console.log('\nTest C: 5 random moves scramble + solve');
test('Scramble with 5 random moves, solve with cubejs, verify solved state', () => {
  const faces = ['U', 'D', 'F', 'B', 'L', 'R'];
  const suffixes = ['', "'", '2'];

  // Generate 5 random moves
  const scrambleMoves = [];
  for (let i = 0; i < 5; i++) {
    const face = faces[Math.floor(Math.random() * faces.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    scrambleMoves.push(face + suffix);
  }

  const scrambleStr = scrambleMoves.join(' ');
  console.log(`        Scramble: ${scrambleStr}`);

  // Apply scramble to our cubies
  let cubies = buildSolvedCubies();
  for (const notation of scrambleMoves) {
    cubies = applyMove(cubies, parseMove(notation));
  }

  // Get Kociemba string and solve with cubejs
  const scrambledKociemba = buildKociembaStringFromCubies(cubies);
  assert(scrambledKociemba, 'Failed to build Kociemba string from scrambled cubies');

  const cube = Cube.fromString(scrambledKociemba);
  const solution = cube.solve();
  console.log(`        Solution: ${solution}`);

  // Apply solution moves to our cubies
  if (solution.trim()) {
    const solutionMoves = solution.trim().split(/\s+/);
    for (const notation of solutionMoves) {
      cubies = applyMove(cubies, parseMove(notation));
    }
  }

  // Verify solved
  const finalKociemba = buildKociembaStringFromCubies(cubies);
  assertEqual(finalKociemba, SOLVED_KOCIEMBA, 'Cube not solved after applying solution');
});

// ── Test D: 3 random scramble+solve tests ───────────────────────────

console.log('\nTest D: 3 random scramble+solve tests');
for (let t = 1; t <= 3; t++) {
  test(`Random scramble+solve #${t}`, () => {
    const faces = ['U', 'D', 'F', 'B', 'L', 'R'];
    const suffixes = ['', "'", '2'];

    // Generate 8-15 random moves
    const numMoves = 8 + Math.floor(Math.random() * 8);
    const scrambleMoves = [];
    for (let i = 0; i < numMoves; i++) {
      const face = faces[Math.floor(Math.random() * faces.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      scrambleMoves.push(face + suffix);
    }

    const scrambleStr = scrambleMoves.join(' ');
    console.log(`        Scramble (${numMoves} moves): ${scrambleStr}`);

    // Apply scramble
    let cubies = buildSolvedCubies();
    for (const notation of scrambleMoves) {
      cubies = applyMove(cubies, parseMove(notation));
    }

    // Get Kociemba string
    const scrambledKociemba = buildKociembaStringFromCubies(cubies);
    assert(scrambledKociemba, 'Failed to build Kociemba string from scrambled cubies');

    // Cross-validate: our Kociemba should match cubejs for same moves
    const cubejsCube = new Cube();
    cubejsCube.move(scrambleStr);
    const cubejsScrambled = cubejsCube.asString();
    assertEqual(scrambledKociemba, cubejsScrambled, 'Scrambled Kociemba mismatch with cubejs');

    // Solve
    const solveCube = Cube.fromString(scrambledKociemba);
    const solution = solveCube.solve();
    console.log(`        Solution: ${solution}`);

    // Apply solution
    if (solution.trim()) {
      const solutionMoves = solution.trim().split(/\s+/);
      for (const notation of solutionMoves) {
        cubies = applyMove(cubies, parseMove(notation));
      }
    }

    // Verify solved
    const finalKociemba = buildKociembaStringFromCubies(cubies);
    assertEqual(finalKociemba, SOLVED_KOCIEMBA, 'Cube not solved after applying solution');
  });
}

// ── Summary ─────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(failed > 0 ? 1 : 0);
