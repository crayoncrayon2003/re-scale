import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransitModel } from '../js/transit.js';

const data = {
  nodes: [
    { station: 'A', state: 'departure', day: 'weekday', category: 'local' },
    { station: 'B', state: 'arrival', day: 'weekday', category: 'local' },
    { station: 'B', state: 'departure', day: 'weekday', category: 'local' },
    { station: 'C', state: 'arrival', day: 'weekday', category: 'local' }
  ],
  runningEdges: [
    { from: 0, to: 1, fromStation: 'A', toStation: 'B', baseTime: 5, path: 'ab' },
    { from: 2, to: 3, fromStation: 'B', toStation: 'C', baseTime: 5, path: 'bc' }
  ],
  continuationEdges: [{ from: 1, to: 2, cost: 1 }], stationDwell: { B: 1 },
  defaultDwell: 1, transferExtra: 0, physicalPaths: { ab: [[0, 0], [1, 0]], bc: [[1, 0], [2, 0]] }
};

test('operation graph includes dwell and remains directed', () => {
  const model = createTransitModel(structuredClone(data));
  const condition = { day: 'weekday', category: 'local' };
  assert.equal(model.shortestPaths('A', condition).stationDistances.get('C'), 11);
  assert.equal(model.shortestPaths('C', condition).stationDistances.get('A'), undefined);
});

test('hazard risk increases only running-edge cost', () => {
  const input = structuredClone(data);
  input.runningEdges[0].hazardRisks = { flood: 0.5 };
  const model = createTransitModel(input, { flood: 1 });
  assert.equal(model.shortestPaths('A', { day: 'weekday', category: 'local' }, { keys: ['flood'], cap: 4 }).stationDistances.get('C'), 13.5);
});

test('zero alpha equals baseline and nonnegative hazard cost is monotone', () => {
  const input = structuredClone(data);
  input.runningEdges[0].hazardRisks = { flood: 1 };
  const condition = { day: 'weekday', category: 'local' };
  const zeroModel = createTransitModel(structuredClone(input), { flood: 0 });
  const hazardModel = createTransitModel(structuredClone(input), { flood: 1 });
  const baseline = zeroModel.shortestPaths('A', condition, { keys: [], cap: 4 }).stationDistances;
  const alphaZero = zeroModel.shortestPaths('A', condition, { keys: ['flood'], cap: 4 }).stationDistances;
  const hazard = hazardModel.shortestPaths('A', condition, { keys: ['flood'], cap: 4 }).stationDistances;
  assert.equal(baseline.get('A'), 0);
  assert.equal(alphaZero.get('C'), baseline.get('C'));
  assert.ok(hazard.get('C') >= baseline.get('C'));
});
