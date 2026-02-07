/* Rubik's Cube solver worker — runs cubejs off the main thread */
importScripts('https://cdn.jsdelivr.net/npm/cubejs@1.0.0/lib/cube.js');

self.onmessage = function(e) {
  try {
    Cube.initSolver();
    var cube = Cube.fromString(e.data);

    // Phase 1: Get a fast solution (default Kociemba, ~18-20 moves)
    self.postMessage({ type: 'status', status: 'Finding initial solution...' });
    var solution = cube.solve();
    if (solution === null || solution === undefined) {
      self.postMessage({ type: 'error', error: 'No solution found' });
      return;
    }
    var bestLen = solution.trim().split(/\s+/).length;

    // Send the initial solution immediately so the user can start
    self.postMessage({ type: 'solution', solution: solution, final: false });

    // Phase 2: Optimize — try ascending depths up to 10 max
    var maxDepth = Math.min(10, bestLen - 1);
    for (var depth = 1; depth <= maxDepth; depth++) {
      self.postMessage({
        type: 'status',
        status: 'Optimizing: trying ' + depth + ' moves (best: ' + bestLen + ')...'
      });
      try {
        var sol = cube.solve(depth);
        if (sol !== null && sol !== undefined) {
          var solLen = sol.trim().split(/\s+/).length;
          if (solLen < bestLen) {
            solution = sol;
            bestLen = solLen;
            // Send the improved solution
            self.postMessage({ type: 'solution', solution: solution, final: false });
          }
          // Found a solution at this depth — this is optimal, stop
          break;
        }
      } catch(ex) {
        // No solution at this depth, continue to next
        continue;
      }
    }

    // Done optimizing
    self.postMessage({ type: 'solution', solution: solution, final: true });
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message || 'Solve failed' });
  }
};
