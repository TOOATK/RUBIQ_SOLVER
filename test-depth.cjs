const Cube = require('cubejs');
Cube.initSolver();

// Scramble with 3 moves
const cube = new Cube();
cube.move("R U F");
console.log("State:", cube.asString());

// Try solve with depth limit
try {
  const sol1 = cube.solve(5);
  console.log("solve(5):", JSON.stringify(sol1));
} catch(e) {
  console.log("solve(5) error:", e.message);
}

const sol2 = cube.solve();
console.log("solve():", JSON.stringify(sol2));
