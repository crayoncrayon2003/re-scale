export function createTransitModel(data, hazardWeights = {}) {
  let transferExtra = Number(data.transferExtra || 0);
  const nodes = data.nodes;
  const outgoing = new Map();
  const departures = new Map();
  const arrivals = new Map();
  const add = (from, edge) => {
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(edge);
  };
  for (const edge of data.runningEdges) {
    edge.kind = 'running';
    edge.minutes = edge.baseTime;
    edge.path = data.physicalPaths[edge.path];
    add(edge.from, edge);
  }
  for (const edge of data.continuationEdges) add(edge.from, { ...edge, kind: 'continuation' });
  nodes.forEach((node, id) => {
    const map = node.state === 'departure' ? departures : arrivals;
    if (!map.has(node.station)) map.set(node.station, []);
    map.get(node.station).push(id);
  });

  function eligible(node, condition) {
    return node.day === condition.day && node.category === condition.category;
  }

  function runningCost(edge, hazards) {
    return runningSegmentCosts(edge, hazards).reduce((sum, segment) => sum + segment.cost, 0);
  }

  function runningSegmentCosts(edge, hazards = { keys: [], cap: Infinity }) {
    const segments = edge.segments || [];
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    if (!segments.length || !(totalLength > 0)) return [{ geometry: edge.path, cost: edge.baseTime }];
    return segments.map(segment => {
      const impact = Math.min(hazards.cap, hazards.keys.reduce((sum, key) =>
        sum + (hazardWeights[key] ?? 1) * Number(segment.hazards?.[key] || 0), 0));
      return { geometry: segment.geometry, cost: edge.baseTime * segment.length / totalLength * (1 + impact) };
    });
  }

  function shortestPaths(originStation, condition, hazards = { keys: [], cap: Infinity }) {
    const distance = new Map();
    const previous = new Map();
    const pending = [];
    const push = item => {
      pending.push(item);
      for (let index = pending.length - 1; index > 0;) {
        const parent = (index - 1) >> 1;
        if (pending[parent][0] <= item[0]) break;
        pending[index] = pending[parent]; index = parent; pending[index] = item;
      }
    };
    const pop = () => {
      const first = pending[0], last = pending.pop();
      if (pending.length) {
        pending[0] = last;
        for (let index = 0;;) {
          let child = index * 2 + 1;
          if (child >= pending.length) break;
          if (child + 1 < pending.length && pending[child + 1][0] < pending[child][0]) child++;
          if (pending[index][0] <= pending[child][0]) break;
          [pending[index], pending[child]] = [pending[child], pending[index]]; index = child;
        }
      }
      return first;
    };
    let sourceCount = 0;
    for (const id of departures.get(originStation) || []) if (eligible(nodes[id], condition)) {
      sourceCount++;
      distance.set(id, 0); push([0, id]);
    }
    while (pending.length) {
      const [currentDistance, current] = pop();
      if (currentDistance !== distance.get(current)) continue;
      const currentNode = nodes[current];
      const candidates = [...(outgoing.get(current) || [])];
      if (currentNode.state === 'arrival') {
        const dwell = data.stationDwell[currentNode.station] ?? data.defaultDwell;
        for (const target of departures.get(currentNode.station) || []) {
          if (!eligible(nodes[target], condition)) continue;
          if (target === current || candidates.some(edge => edge.to === target)) continue;
          candidates.push({ to: target, kind: 'transfer', cost: dwell + transferExtra });
        }
      }
      for (const edge of candidates) {
        const targetNode = nodes[edge.to];
        if (!eligible(targetNode, condition)) continue;
        const cost = edge.kind === 'running' ? runningCost(edge, hazards) : edge.cost;
        if (!(cost >= 0) || !Number.isFinite(cost)) continue;
        const candidate = currentDistance + cost;
        if (candidate < (distance.get(edge.to) ?? Infinity)) {
          distance.set(edge.to, candidate);
          previous.set(edge.to, { node: current, edge });
          push([candidate, edge.to]);
        }
      }
    }
    const stationDistances = new Map([[originStation, 0]]);
    for (const [station, ids] of arrivals) for (const id of ids) {
      const value = distance.get(id);
      if (value < (stationDistances.get(station) ?? Infinity)) stationDistances.set(station, value);
    }
    return { nodeDistances: distance, stationDistances, previous, sourceCount };
  }

  return {
    shortestPaths, runningEdges: data.runningEdges, nodes, runningSegmentCosts,
    setTransferExtra(value) { transferExtra = Math.max(0, Number(value) || 0); }
  };
}
