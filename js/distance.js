export const HAZARD_KEYS = ['flood', 'landslide', 'stormSurge', 'tsunami'];

export function edgeKey(from, to) {
  return `${from}|${to}`;
}

export function createDistanceModel({ edges, hazardCosts = {}, hazardWeights = {} }) {
  const adjacency = new Map();
  const reverseAdjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    if (!reverseAdjacency.has(edge.from)) reverseAdjacency.set(edge.from, []);
    if (!reverseAdjacency.has(edge.to)) reverseAdjacency.set(edge.to, []);
    adjacency.get(edge.from).push({ to: edge.to, edge });
    reverseAdjacency.get(edge.to).push({ to: edge.from, edge });
  }

  function cost(edge, enabledHazards = [], serviceMode = 'ordinary_weekday') {
    const costs = { ...(hazardCosts[edgeKey(edge.from, edge.to)] || {}), ...(edge.hazardCosts || {}) };
    const baselineMinutes = Number(edge.minutes);
    if (!Number.isFinite(baselineMinutes) || baselineMinutes <= 0) throw new Error('Invalid edge travel time');
    const minutes = edge.minutesByMode ? Number(edge.minutesByMode[serviceMode]) : baselineMinutes;
    if (edge.minutesByMode && !Number.isFinite(minutes)) return Infinity;
    if (minutes <= 0) throw new Error('Invalid service travel time');
    const hazardCost = enabledHazards.reduce((total, hazard) => {
      const value = Number(costs[hazard] || 0);
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid hazard cost');
      const weight = Number(hazardWeights[hazard] ?? 1);
      if (!Number.isFinite(weight) || weight < 0) throw new Error('Invalid hazard weight');
      return total + weight * value * minutes / baselineMinutes;
    }, 0);
    return minutes + hazardCost;
  }

  function shortestPaths(originId, enabledHazards = [], serviceMode = 'ordinary_weekday', reverse = false) {
    const distances = new Map([[originId, 0]]);
    const previous = new Map();
    const pending = [originId];
    while (pending.length) {
      pending.sort((a, b) => distances.get(a) - distances.get(b));
      const currentId = pending.shift();
      for (const { to, edge } of (reverse ? reverseAdjacency : adjacency).get(currentId) || []) {
        const edgeCost = cost(edge, enabledHazards, serviceMode);
        if (!Number.isFinite(edgeCost)) continue;
        const nextCost = distances.get(currentId) + edgeCost;
        if (nextCost < (distances.get(to) ?? Infinity)) {
          distances.set(to, nextCost);
          previous.set(to, currentId);
          pending.push(to);
        }
      }
    }
    return { distances, previous };
  }

  return { shortestPaths, cost };
}
