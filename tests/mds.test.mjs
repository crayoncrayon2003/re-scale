import assert from 'node:assert/strict';
import test from 'node:test';
import { alignRigid2D, classicalMds, classicalMdsDetails, mdsFitStats, selectMdsStations, symmetrizeDirectedDistances, validateDistanceMatrix } from '../js/mds.js';

test('MDS cohort follows the selected station', () => {
  const stations = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  const fromA = new Map([['a', 0], ['b', 20], ['c', 50], ['d', 80]]);
  const fromD = new Map([['a', 80], ['b', 50], ['c', 20], ['d', 0]]);
  assert.deepEqual(selectMdsStations(stations, fromA, 2, 60).map(station => station.id), ['a', 'b']);
  assert.deepEqual(selectMdsStations(stations, fromD, 2, 60).map(station => station.id), ['d', 'c']);
});

test('MDS input rejects unreachable, asymmetric and invalid distances', () => {
  validateDistanceMatrix([[0, 5], [5, 0]]);
  assert.throws(() => validateDistanceMatrix([[0, Infinity], [Infinity, 0]]));
  assert.throws(() => validateDistanceMatrix([[0, 5], [6, 0]]));
  assert.throws(() => validateDistanceMatrix([[0, -1], [-1, 0]]));
});

test('directed distances are symmetrized only for mutually reachable stations', () => {
  assert.deepEqual(symmetrizeDirectedDistances([[0, 4], [6, 0]]), [[0, 5], [5, 0]]);
  assert.throws(() => symmetrizeDirectedDistances([[0, 4], [Infinity, 0]]));
  const stations = ['a', 'b', 'c'].map(id => ({ id }));
  assert.deepEqual(selectMdsStations(stations, new Map([['a', 0], ['b', 4], ['c', 5]]), 120, 60,
    new Map([['a', 0], ['b', 6]])).map(station => station.id), ['a', 'b']);
});

test('rigid alignment removes rotation and reflection without changing scale', () => {
  const reference = [[0, 0], [2, 0], [0, 1], [2, 1]];
  const rotated = reference.map(([x, y]) => [10 - y, 20 + x]);
  const reflected = reference.map(([x, y]) => [10 + y, 20 + x]);
  for (const source of [rotated, reflected]) {
    const aligned = alignRigid2D(source, reference);
    for (let i = 0; i < source.length; i++) {
      assert.ok(Math.hypot(aligned[i][0] - reference[i][0], aligned[i][1] - reference[i][1]) < 1e-9);
    }
  }
  const expanded = reference.map(([x, y]) => [2 * x + 10, 2 * y - 4]);
  const aligned = alignRigid2D(expanded, reference);
  assert.ok(Math.abs(Math.hypot(aligned[0][0] - aligned[1][0], aligned[0][1] - aligned[1][1]) - 4) < 1e-9);
});

test('classical MDS recovers two-dimensional Euclidean distances', () => {
  const points = [[0, 0], [3, 0], [0, 4], [3, 4]];
  const matrix = points.map(a => points.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])));
  const coordinates = classicalMds(matrix);
  assert.ok(mdsFitStats(matrix, coordinates).stress < 1e-9);
  assert.ok(mdsFitStats(matrix, coordinates).correlation > 0.999);
  assert.equal(classicalMdsDetails(matrix).negativeEigenvalues.count, 0);
  assert.deepEqual(classicalMds([[0]]), [[0, 0]]);
});
