import assert from 'node:assert/strict';
import test from 'node:test';
import { createDistanceModel } from '../js/distance.js';
import { decodeElevation, elevationFraction, exposureFraction, tilePixel } from '../js/hazard.js';

test('hazard fractions scale with the selected timetable time', () => {
  const edge = { from: 'a', to: 'b', minutes: 10,
    minutesByMode: { ordinary_weekday: 10, ordinary_holiday: 12 },
    hazardCosts: { flood: 5 } };
  const model = createDistanceModel({ edges: [edge], hazardWeights: { flood: 0.5 } });
  assert.equal(model.cost(edge, ['flood'], 'ordinary_weekday'), 12.5);
  assert.equal(model.cost(edge, ['flood'], 'ordinary_holiday'), 15);
  assert.equal(model.cost(edge, ['flood'], 'limited_express_weekday'), Infinity);
});

function tilesFor(points, rgba) {
  const tiles = new Map();
  for (const [lon, lat] of points) {
    const { x, y, px, py } = tilePixel(lon, lat);
    const key = `${x}/${y}`;
    if (!tiles.has(key)) tiles.set(key, new Uint8ClampedArray(256 * 256 * 4));
    tiles.get(key).set(rgba, (py * 256 + px) * 4);
  }
  return tiles;
}

test('route exposure adds a nonnegative cost and changes shortest paths', () => {
  const path = [[135.5, 34.7], [135.501, 34.7], [135.502, 34.7]];
  const midpoints = [[135.5005, 34.7], [135.5015, 34.7]];
  const raster = tilesFor([midpoints[0]], [255, 100, 100, 255]);
  assert.ok(Math.abs(exposureFraction(path, [raster]) - 0.5) < 1e-6);
  const edges = [
    { from: 'a', to: 'b', minutes: 10, hazardCosts: { flood: 10 * exposureFraction(path, [raster]) } },
    { from: 'a', to: 'c', minutes: 6 },
    { from: 'c', to: 'b', minutes: 6 }
  ];
  const model = createDistanceModel({ edges });
  assert.equal(model.shortestPaths('a').distances.get('b'), 10);
  assert.equal(model.shortestPaths('a', ['flood']).distances.get('b'), 12);
  assert.equal(model.shortestPaths('b', ['flood']).distances.get('a'), undefined);
  assert.equal(createDistanceModel({ edges, hazardWeights: { flood: 0.2 } }).shortestPaths('a', ['flood']).distances.get('b'), 11);
  assert.equal(createDistanceModel({ edges, hazardWeights: { flood: 0 } }).shortestPaths('a', ['flood']).distances.get('b'), 10);
});

test('official DEM encoding decodes signed heights and missing values', () => {
  assert.equal(decodeElevation(0, 39, 16), 100);
  assert.equal(decodeElevation(128, 0, 0), null);
  assert.equal(decodeElevation(255, 216, 240), -100);
  const path = [[135.5, 34.7], [135.51, 34.7]];
  const tiles = tilesFor([path[0]], [0, 39, 16, 255]);
  const second = tilesFor([path[1]], [0, 78, 32, 255]);
  for (const [key, value] of second) {
    if (!tiles.has(key)) tiles.set(key, value);
    else {
      const p = tilePixel(...path[1]);
      tiles.get(key).set([0, 78, 32, 255], (p.py * 256 + p.px) * 4);
    }
  }
  assert.ok(elevationFraction(path, tiles) > 0);
  assert.equal(elevationFraction([...path].reverse(), tiles), elevationFraction(path, tiles));
});
