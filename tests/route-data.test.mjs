import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTransitModel } from '../js/transit.js';

const railway = JSON.parse(readFileSync(new URL('../data/railway.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('../data/transit-network.json', import.meta.url)));
const edges = data.runningEdges;
const stations = new Map(railway.stations.map(station => [station.id, station]));

test('operation edges reference existing physical stations and paths', () => {
  assert.match(railway.source, /公共交通オープンデータ/);
  assert.ok(railway.lines.features.length > 0);
  assert.ok(railway.stations.some(station => station.name === '東京'));
  for (const edge of edges) {
    const from = stations.get(edge.fromStation), to = stations.get(edge.toStation);
    assert.ok(from && to);
    const path = data.physicalPaths[edge.path];
    assert.ok(path?.length >= 2);
    assert.deepEqual(path[0], [from.lon, from.lat]);
    assert.deepEqual(path.at(-1), [to.lon, to.lat]);
  }
});
test('browser graph keeps directions and timetable categories separate', () => {
  assert.deepEqual(data.categories.local, ['Local']);
  assert.deepEqual(data.categories.rapid, ['CommuterRapid', 'CommuterSpecialRapid', 'OmeSpecialRapid', 'Rapid', 'SpecialRapid']);
  assert.ok(data.nodes.some(node => node.category === 'local'));
  assert.ok(data.nodes.some(node => node.category === 'rapid'));
  assert.ok(!data.nodes.some(node => node.trainType === 'LimitedExpress' || node.trainType === 'ChuoSpecialRapid'));
  assert.ok(edges.some(edge => edges.some(reverse => reverse.fromStation === edge.toStation && reverse.toStation === edge.fromStation && reverse.baseTime !== edge.baseTime)));
});

test('local and rapid categories both produce radial and MDS station cohorts from Tokyo', () => {
  const tokyo = railway.stations.find(station => station.name === '東京');
  for (const category of ['local', 'rapid']) {
    const model = createTransitModel(structuredClone(data));
    const condition = { category, day: 'weekday' };
    const outbound = model.shortestPaths(tokyo.id, condition, { keys: [], cap: 4 });
    const within60 = railway.stations.filter(station => (outbound.stationDistances.get(station.id) ?? Infinity) <= 60);
    const mutual = within60.filter(station => Number.isFinite(
      model.shortestPaths(station.id, condition, { keys: [], cap: 4 }).stationDistances.get(tokyo.id)
    ));
    assert.ok(outbound.sourceCount > 0);
    assert.ok(within60.length > 1, `路線図の距離に${category}の到達駅が必要`);
    assert.ok(mutual.length > 1, `MDSに双方向到達可能な${category}停車駅が必要`);
  }
});
