export function classicalMds(distanceMatrix) {
  return classicalMdsDetails(distanceMatrix).coordinates;
}

export function classicalMdsDetails(distanceMatrix) {
  validateDistanceMatrix(distanceMatrix);
  const size = distanceMatrix.length;
  const squared = distanceMatrix.map(row => row.map(value => value * value));
  const rowMean = squared.map(row => row.reduce((sum, value) => sum + value, 0) / size);
  const totalMean = rowMean.reduce((sum, value) => sum + value, 0) / size;
  const matrix = squared.map((row, i) => row.map((value, j) => -.5 * (value - rowMean[i] - rowMean[j] + totalMean)));

  // Jacobi rotations diagonalize the symmetric double-centered Gram matrix.
  const eigenvectors = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => Number(i === j)));
  const scale = Math.max(1, ...matrix.map((row, i) => Math.abs(row[i])));
  for (let sweep = 0; sweep < 50; sweep++) {
    let largest = 0;
    for (let p = 0; p < size; p++) for (let q = p + 1; q < size; q++) {
      const value = matrix[p][q];
      largest = Math.max(largest, Math.abs(value));
      if (Math.abs(value) <= scale * 1e-12) continue;
      const tau = (matrix[q][q] - matrix[p][p]) / (2 * value);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t);
      const sine = t * c;
      matrix[p][p] -= t * value;
      matrix[q][q] += t * value;
      matrix[p][q] = matrix[q][p] = 0;
      for (let k = 0; k < size; k++) {
        if (k !== p && k !== q) {
          const kp = matrix[k][p], kq = matrix[k][q];
          matrix[k][p] = matrix[p][k] = c * kp - sine * kq;
          matrix[k][q] = matrix[q][k] = sine * kp + c * kq;
        }
        const vp = eigenvectors[k][p], vq = eigenvectors[k][q];
        eigenvectors[k][p] = c * vp - sine * vq;
        eigenvectors[k][q] = sine * vp + c * vq;
      }
    }
    if (largest <= scale * 1e-12) break;
  }
  const eigenvalues = Array.from({ length: size }, (_, index) => matrix[index][index]);
  const negative = eigenvalues.filter(value => value < -scale * 1e-10);
  const positiveSum = eigenvalues.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const negativeSum = negative.reduce((sum, value) => sum - value, 0);
  const components = Array.from({ length: size }, (_, index) => index)
    .filter(index => eigenvalues[index] > 0)
    .sort((a, b) => eigenvalues[b] - eigenvalues[a]).slice(0, 2);
  return {
    coordinates: eigenvectors.map(row => components.map(index =>
      row[index] * Math.sqrt(eigenvalues[index])).concat(Array(2 - components.length).fill(0))),
    negativeEigenvalues: { count: negative.length, absoluteSum: negativeSum,
      ratioToPositive: positiveSum ? negativeSum / positiveSum : 0 }
  };
}

export function selectMdsStations(stations, baselineDistances, limit = 120, maxMinutes = 60, reverseDistances = baselineDistances) {
  return stations.filter(station => (baselineDistances.get(station.id) ?? Infinity) <= maxMinutes &&
      Number.isFinite(reverseDistances.get(station.id) ?? Infinity))
    .sort((a, b) => baselineDistances.get(a.id) - baselineDistances.get(b.id) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function symmetrizeDirectedDistances(directed) {
  const size = directed.length;
  const symmetric = directed.map(row => row.slice());
  for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) {
    const a = directed[i][j], b = directed[j][i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('MDS 対象駅間に双方向の経路がありません');
    symmetric[i][j] = symmetric[j][i] = (a + b) / 2;
  }
  validateDistanceMatrix(symmetric);
  return symmetric;
}

export function validateDistanceMatrix(matrix) {
  const size = matrix.length;
  if (!size || matrix.some(row => row.length !== size)) throw new Error('MDS 距離行列の形が不正です');
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    const value = matrix[i][j];
    if (!Number.isFinite(value) || value < 0 || (i === j && value !== 0) || Math.abs(value - matrix[j][i]) > 1e-8) {
      throw new Error('MDS 距離行列が不正です');
    }
  }
}

// Orthogonal Procrustes in 2D: translation, rotation and optional reflection only.
export function alignRigid2D(coordinates, reference) {
  if (coordinates.length !== reference.length || !coordinates.length) throw new Error('MDS 配置の駅集合が一致しません');
  const mean = (points, axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length;
  const sourceCenter = [mean(coordinates, 0), mean(coordinates, 1)];
  const targetCenter = [mean(reference, 0), mean(reference, 1)];
  let best = null;
  for (const reflection of [1, -1]) {
    let dot = 0, cross = 0;
    for (let i = 0; i < coordinates.length; i++) {
      const x = (coordinates[i][0] - sourceCenter[0]) * reflection;
      const y = coordinates[i][1] - sourceCenter[1];
      const u = reference[i][0] - targetCenter[0];
      const v = reference[i][1] - targetCenter[1];
      dot += x * u + y * v;
      cross += x * v - y * u;
    }
    const angle = Math.atan2(cross, dot);
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const aligned = coordinates.map(([sourceX, sourceY]) => {
      const x = (sourceX - sourceCenter[0]) * reflection;
      const y = sourceY - sourceCenter[1];
      return [targetCenter[0] + cosine * x - sine * y, targetCenter[1] + sine * x + cosine * y];
    });
    const error = aligned.reduce((sum, [x, y], i) => sum + (x - reference[i][0]) ** 2 + (y - reference[i][1]) ** 2, 0);
    if (!best || error < best.error) best = { aligned, error };
  }
  return best.aligned;
}

export function mdsFitStats(distanceMatrix, coordinates) {
  const original = [];
  const embedded = [];
  for (let i = 0; i < distanceMatrix.length; i += 1) for (let j = i + 1; j < distanceMatrix.length; j += 1) {
    original.push(distanceMatrix[i][j]);
    embedded.push(Math.hypot(coordinates[i][0] - coordinates[j][0], coordinates[i][1] - coordinates[j][1]));
  }
  if (!original.length) return { stress: 0, correlation: 0 };
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const originalMean = mean(original); const embeddedMean = mean(embedded);
  const covariance = original.reduce((sum, value, index) => sum + (value - originalMean) * (embedded[index] - embeddedMean), 0);
  const originalDeviation = Math.sqrt(original.reduce((sum, value) => sum + (value - originalMean) ** 2, 0));
  const embeddedDeviation = Math.sqrt(embedded.reduce((sum, value) => sum + (value - embeddedMean) ** 2, 0));
  return {
    stress: Math.sqrt(original.reduce((sum, value, index) => sum + (value - embedded[index]) ** 2, 0) / original.reduce((sum, value) => sum + value ** 2, 0)),
    correlation: originalDeviation && embeddedDeviation ? covariance / (originalDeviation * embeddedDeviation) : 0
  };
}

export function metricSmacof(distanceMatrix, initial, maxIterations = 80, tolerance = 1e-7) {
  validateDistanceMatrix(distanceMatrix);
  const size = distanceMatrix.length;
  if (size < 2) return initial.map(point => point.slice());
  let points = initial.map(point => point.slice());
  let previousStress = Infinity;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const b = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) {
      const distance = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      const value = distance > 1e-12 ? -distanceMatrix[i][j] / distance : 0;
      b[i][j] = b[j][i] = value;
      b[i][i] -= value;
      b[j][j] -= value;
    }
    const next = Array.from({ length: size }, (_, i) => [0, 1].map(axis =>
      b[i].reduce((sum, value, j) => sum + value * points[j][axis], 0) / size));
    const center = [0, 1].map(axis => next.reduce((sum, point) => sum + point[axis], 0) / size);
    next.forEach(point => { point[0] -= center[0]; point[1] -= center[1]; });
    const stress = mdsFitStats(distanceMatrix, next).stress;
    points = next;
    if (Math.abs(previousStress - stress) <= tolerance * Math.max(1, previousStress)) break;
    previousStress = stress;
  }
  return points;
}
