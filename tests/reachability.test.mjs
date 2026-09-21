import assert from 'node:assert/strict';
import test from 'node:test';
import { reachableEdgePaths } from '../js/reachability.js';

const edge = { from: 'a', to: 'b', path: [[135, 35], [135.01, 35]] };

test('reachable rail ends at the time boundary inside an edge', () => {
  const paths = reachableEdgePaths(edge, new Map([['a', 0], ['b', 8]]), 3, 8);
  assert.equal(paths.length, 1);
  assert.equal(paths[0][0][0], 135);
  assert.ok(Math.abs(paths[0].at(-1)[0] - 135.00375) < 1e-8);
});

test('a directed edge is colored only from its departure side', () => {
  const paths = reachableEdgePaths(edge, new Map([['a', 2], ['b', 2]]), 3, 8);
  assert.equal(paths.length, 1);
  assert.ok(Math.abs(paths[0].at(-1)[0] - 135.00125) < 1e-8);
});

test('an increased hazard cost shortens the colored portion', () => {
  const distances = new Map([['a', 0], ['b', 12]]);
  const normal = reachableEdgePaths(edge, distances, 3, 8)[0].at(-1)[0];
  const hazard = reachableEdgePaths(edge, distances, 3, 12)[0].at(-1)[0];
  assert.ok(hazard < normal);
});
