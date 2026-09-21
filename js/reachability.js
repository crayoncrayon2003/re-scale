function pointAt(path, lengths, distance) {
  for (let i = 1; i < path.length; i++) {
    if (distance <= lengths[i] || i === path.length - 1) {
      const span = lengths[i] - lengths[i - 1];
      const ratio = span ? Math.max(0, Math.min(1, (distance - lengths[i - 1]) / span)) : 0;
      return path[i - 1].map((value, axis) => value + (path[i][axis] - value) * ratio);
    }
  }
  return path[0];
}

function slicePath(path, lengths, start, end) {
  if (end <= start) return null;
  const points = [pointAt(path, lengths, start)];
  for (let i = 1; i < path.length - 1; i++) {
    if (lengths[i] > start && lengths[i] < end) points.push(path[i]);
  }
  points.push(pointAt(path, lengths, end));
  return points;
}

// Return the portion reachable while travelling in this edge's direction.
export function reachableEdgePaths(edge, distances, limit, cost) {
  if (!edge.path || edge.path.length < 2 || !(cost > 0)) return [];
  const lengths = [0];
  for (let i = 1; i < edge.path.length; i++) {
    const [ax, ay] = edge.path[i - 1], [bx, by] = edge.path[i];
    lengths.push(lengths[i - 1] + Math.hypot((bx - ax) * Math.cos(ay * Math.PI / 180), by - ay));
  }
  const total = lengths.at(-1);
  if (!(total > 0)) return [];
  const from = Math.max(0, Math.min(1, (limit - (distances.get(edge.from) ?? Infinity)) / cost));
  const reachable = slicePath(edge.path, lengths, 0, from * total);
  return reachable ? [reachable] : [];
}
