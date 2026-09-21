// Place each visible station at its own geographic bearing and shortest-path radius.
// Draw each visible edge of the shortest-path tree once.
export function radialLayout(stations, origin, distances, previous, maxMinutes) {
  const originLat = origin.map_lat ?? origin.lat;
  const originLon = origin.map_lon ?? origin.lon;
  const visible = stations.filter(station => (distances.get(station.id) ?? Infinity) <= maxMinutes);
  const positions = new Map([[origin.id, { x: 300, y: 280 }]]);
  const nodes = [];
  for (const station of visible) {
    if (station.id === origin.id) continue;
    const north = (station.map_lat ?? station.lat) - originLat;
    const east = ((station.map_lon ?? station.lon) - originLon) * Math.cos(originLat * Math.PI / 180);
    const angle = Math.atan2(-north, east);
    const radius = distances.get(station.id) / maxMinutes * 245;
    const x = 300 + Math.cos(angle) * radius;
    const y = 280 + Math.sin(angle) * radius;
    positions.set(station.id, { x, y });
    nodes.push({ station, distance: distances.get(station.id), x, y });
  }
  const lines = nodes.flatMap(({ station }) => {
    const parentId = previous.get(station.id);
    const from = positions.get(parentId);
    const to = positions.get(station.id);
    return from && to ? [{ parentId, childId: station.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y }] : [];
  });
  return { lines, nodes };
}
