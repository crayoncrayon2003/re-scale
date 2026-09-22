// Return the portion reachable while travelling in this edge's direction.
export function reachableEdgePaths(edge, distances, limit, segmentCosts) {
  if (!edge.path || edge.path.length < 2 || !Array.isArray(segmentCosts)) return [];
  let remaining = limit - (distances.get(edge.from) ?? Infinity);
  if (!(remaining > 0)) return [];
  const path = [segmentCosts[0]?.geometry?.[0]].filter(Boolean);
  for (const segment of segmentCosts) {
    if (!(segment.cost > 0)) continue;
    const [start, end] = segment.geometry;
    if (remaining >= segment.cost) {
      path.push(end); remaining -= segment.cost;
    } else {
      const ratio = Math.max(0, remaining / segment.cost);
      path.push(start.map((value, axis) => value + (end[axis] - value) * ratio));
      break;
    }
  }
  return path.length > 1 ? [path] : [];
}
