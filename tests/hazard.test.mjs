import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeElevation, elevationFraction, splitPath, tilePixel } from '../js/hazard.js';

test('physical paths are split into ordered sections no longer than 150 metres', () => {
  const segments = splitPath([[139.7, 35.6], [139.7, 35.606]], 0.15);
  assert.ok(segments.length > 1);
  assert.ok(segments.every(segment => segment.length <= 0.150001));
  assert.deepEqual(segments[0].geometry[0], [139.7, 35.6]);
  assert.deepEqual(segments.at(-1).geometry[1], [139.7, 35.606]);
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
