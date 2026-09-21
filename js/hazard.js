// Official map tiles, sampled at z=10 for a consistent 150 m route grid.
export const HAZARD_SOURCES = {
  flood: [
    'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    'https://disaportaldata.gsi.go.jp/raster/02_naisui_data/{z}/{x}/{y}.png'
  ],
  landslide: [
    'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    'https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',
    'https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png'
  ],
  stormSurge: ['https://disaportaldata.gsi.go.jp/raster/03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png'],
  tsunami: ['https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png']
};

export const SAMPLE_ZOOM = 10;
const SIZE = 256;

export function tilePixel(lon, lat, zoom = SAMPLE_ZOOM) {
  const n = 2 ** zoom;
  const x = (lon + 180) / 360 * n;
  const rad = lat * Math.PI / 180;
  const y = (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n;
  return { x: Math.floor(x), y: Math.floor(y), px: Math.min(255, Math.floor((x % 1) * SIZE)), py: Math.min(255, Math.floor((y % 1) * SIZE)) };
}

export function decodeElevation(red, green, blue) {
  const value = red * 65536 + green * 256 + blue;
  if (value === 2 ** 23) return null;
  return (value < 2 ** 23 ? value : value - 2 ** 24) * 0.01;
}

function segmentKm(a, b) {
  return Math.hypot((b[1] - a[1]) * 111, (b[0] - a[0]) * 91);
}

function tileId({ x, y }) { return `${x}/${y}`; }

function requiredTiles(edges, elevation) {
  const keys = new Set();
  for (const edge of edges) {
    const path = edge.path;
    if (elevation) for (const [lon, lat] of path) keys.add(tileId(tilePixel(lon, lat)));
    else for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      keys.add(tileId(tilePixel((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)));
    }
  }
  return [...keys];
}

async function loadTile(url) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, SIZE, SIZE).data;
}

async function loadSource(template, ids, onProgress) {
  const tiles = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(12, ids.length) }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      const [x, y] = id.split('/');
      const url = template.replace('{z}', SAMPLE_ZOOM).replace('{x}', x).replace('{y}', y);
      tiles.set(id, await loadTile(url));
      onProgress?.();
    }
  }));
  return tiles;
}

function pixelAt(tiles, lon, lat) {
  const point = tilePixel(lon, lat);
  const data = tiles.get(tileId(point));
  if (!data) return null;
  const offset = (point.py * SIZE + point.px) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

export function exposureFraction(path, sourceTiles) {
  let exposed = 0, total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = segmentKm(a, b);
    const lon = (a[0] + b[0]) / 2, lat = (a[1] + b[1]) / 2;
    total += length;
    if (sourceTiles.some(tiles => (pixelAt(tiles, lon, lat)?.[3] || 0) >= 128)) exposed += length;
  }
  return total ? exposed / total : 0;
}

export function elevationFraction(path, tiles) {
  let vertical = 0, horizontal = 0;
  let previous = null;
  for (const point of path) {
    const rgba = pixelAt(tiles, point[0], point[1]);
    const height = rgba ? decodeElevation(...rgba) : null;
    if (previous && height !== null && previous.height !== null) {
      vertical += Math.abs(height - previous.height);
      horizontal += segmentKm(previous.point, point);
    }
    previous = { point, height };
  }
  // 10% cumulative grade maps to one full base-time penalty; symmetric in direction.
  return horizontal ? Math.min(1, vertical / (horizontal * 100)) : 0;
}

export function createHazardEngine(edges) {
  const promises = new Map();
  async function load(key, onProgress) {
    if (!HAZARD_SOURCES[key]) throw new Error(`Unknown hazard: ${key}`);
    if (!promises.has(key)) promises.set(key, (async () => {
      const ids = requiredTiles(edges, false);
      let done = 0;
      const total = ids.length * HAZARD_SOURCES[key].length;
      const sources = await Promise.all(HAZARD_SOURCES[key].map(template => loadSource(template, ids, () => onProgress?.(++done, total))));
      let affected = 0;
      for (const edge of edges) {
        const fraction = exposureFraction(edge.path, sources);
        edge.hazardRisks ||= {};
        edge.hazardRisks[key] = fraction;
        edge.hazardCoverage ||= {};
        edge.hazardCoverage[key] = sources.some(source => edge.path.some(point => pixelAt(source, ...point))) ? 'evaluated' : 'unknown';
        if (fraction > 0) affected++;
      }
      const unknown = edges.filter(edge => edge.hazardCoverage[key] === 'unknown').length;
      return { affected, unknown, total: edges.length, tiles: ids.length };
    })().catch(error => { promises.delete(key); throw error; }));
    return promises.get(key);
  }
  return { load };
}
