/**
 * Test: THREE.js visual rotation (getAngle) vs logical rotateFace
 * Verifies that the visual rotation matrix produces the same cubie position
 * as the logical rotateFace transform for all 6 faces with CW direction.
 */

const PI_2 = Math.PI / 2;

// Round to avoid floating point noise
function round(v) {
  return Math.round(v * 1000) / 1000;
}

function applyRotX(x, y, z, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [round(x), round(y * c - z * s), round(y * s + z * c)];
}

function applyRotY(x, y, z, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [round(x * c + z * s), round(y), round(-x * s + z * c)];
}

function applyRotZ(x, y, z, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [round(x * c - y * s), round(x * s + y * c), round(z)];
}

// getAngle: sign = (R/U/F) ? -1 : 1; angle = sign * direction * PI/2
// direction = 1 for CW
const faces = {
  U: {
    // y-axis, sign=-1, angle = -PI/2
    axis: 'y',
    angle: -PI_2,
    testCubie: [1, 1, -1],   // corner on U face
    // rotateFace U CW: (x,z) -> (-z, x), y stays
    logical: ([x, y, z]) => [round(-z), round(y), round(x)],
  },
  D: {
    // y-axis, sign=+1, angle = +PI/2
    axis: 'y',
    angle: PI_2,
    testCubie: [1, -1, -1],  // corner on D face
    // rotateFace D CW: (x,z) -> (z, -x), y stays
    logical: ([x, y, z]) => [round(z), round(y), round(-x)],
  },
  R: {
    // x-axis, sign=-1, angle = -PI/2
    axis: 'x',
    angle: -PI_2,
    testCubie: [1, 1, -1],   // corner on R face
    // rotateFace R CW: (y,z) -> (z, -y), x stays
    logical: ([x, y, z]) => [round(x), round(z), round(-y)],
  },
  L: {
    // x-axis, sign=+1, angle = +PI/2
    axis: 'x',
    angle: PI_2,
    testCubie: [-1, 1, -1],  // corner on L face
    // rotateFace L CW: (y,z) -> (-z, y), x stays
    logical: ([x, y, z]) => [round(x), round(-z), round(y)],
  },
  F: {
    // z-axis, sign=-1, angle = -PI/2
    axis: 'z',
    angle: -PI_2,
    testCubie: [1, 1, 1],    // corner on F face
    // rotateFace F CW: (x,y) -> (y, -x), z stays
    logical: ([x, y, z]) => [round(y), round(-x), round(z)],
  },
  B: {
    // z-axis, sign=+1, angle = +PI/2
    axis: 'z',
    angle: PI_2,
    testCubie: [1, 1, -1],   // corner on B face
    // rotateFace B CW: (x,y) -> (-y, x), z stays
    logical: ([x, y, z]) => [round(-y), round(x), round(z)],
  },
};

const rotFns = { x: applyRotX, y: applyRotY, z: applyRotZ };

console.log('=== THREE.js getAngle vs rotateFace Match Test ===');
console.log('Direction: CW (1) for all faces\n');

let allPass = true;

for (const [face, cfg] of Object.entries(faces)) {
  const [x, y, z] = cfg.testCubie;
  const visual = rotFns[cfg.axis](x, y, z, cfg.angle);
  const logical = cfg.logical(cfg.testCubie);
  const match = visual[0] === logical[0] && visual[1] === logical[1] && visual[2] === logical[2];

  if (!match) allPass = false;

  console.log(`Face ${face}  |  axis=${cfg.axis}  angle=${cfg.angle > 0 ? '+' : ''}${(cfg.angle / Math.PI).toFixed(2)}pi`);
  console.log(`  Start:     [${x}, ${y}, ${z}]`);
  console.log(`  THREE.js:  [${visual.join(', ')}]`);
  console.log(`  Logical:   [${logical.join(', ')}]`);
  console.log(`  Result:    ${match ? 'MATCH' : '*** MISMATCH ***'}\n`);
}

console.log('================================================');
console.log(allPass ? 'ALL 6 FACES MATCH -- PASS' : 'SOME FACES MISMATCH -- FAIL');
console.log('================================================');

process.exit(allPass ? 0 : 1);
