import assert from 'node:assert/strict';
import test from 'node:test';
import { radialLayout } from '../js/radial.js';

const stations = [
  { id: 'origin', lat: 0, lon: 0 },
  { id: 'shared', lat: 0, lon: 1 },
  { id: 'east', lat: 0, lon: 2 },
  { id: 'north', lat: 2, lon: 1 },
  { id: 'outside', lat: 3, lon: 1 }
];
const distances = new Map([['origin', 0], ['shared', 4], ['east', 8], ['north', 10], ['outside', 40]]);
const previous = new Map([['shared', 'origin'], ['east', 'shared'], ['north', 'shared'], ['outside', 'north']]);

test('each visible station keeps its own bearing and shortest-path radius', () => {
  const { lines, nodes } = radialLayout(stations, stations[0], distances, previous, 30);
  assert.equal(nodes.length, 3);
  assert.equal(lines.length, 3);
  assert.deepEqual(new Set(lines.map(line => line.childId)), new Set(['shared', 'east', 'north']));
  assert.ok(!nodes.some(node => node.station.id === 'outside'));
  const shared = nodes.find(node => node.station.id === 'shared');
  const north = nodes.find(node => node.station.id === 'north');
  assert.ok(Math.abs(shared.y - 280) < 1e-9);
  assert.ok(north.x > 300 && north.y < 280);
  assert.ok(Math.abs(Math.hypot(north.x - 300, north.y - 280) - 10 / 30 * 245) < 1e-9);
  const northLine = lines.find(line => line.childId === 'north');
  assert.deepEqual([northLine.x1, northLine.y1], [shared.x, shared.y]);
});

test('a displayed geographic position determines the radial bearing', () => {
  const origin = { id: 'a', lat: 0, lon: 0 };
  const relocated = { id: 'b', lat: 0, lon: 1, map_lat: 1, map_lon: 0 };
  const { nodes } = radialLayout([origin, relocated], origin, new Map([['a', 0], ['b', 5]]), new Map([['b', 'a']]), 10);
  assert.ok(Math.abs(nodes[0].x - 300) < 1e-9);
  assert.ok(nodes[0].y < 280);
});
