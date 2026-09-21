let stations = [];
let routeData = [];
const $ = selector => document.querySelector(selector);
let originId = '';
let maxMinutes = 30;
let serviceMode = 'local_weekday';
import { alignRigid2D, classicalMdsDetails, mdsFitStats, metricSmacof, symmetrizeDirectedDistances } from './mds.js';
let routeEdges = [];
let distanceModel;
let hazardEngine;
const hazardLoaded = new Set();
const hazardAffected = new Map();
let enabledHazards = [];
let displayMode = 'radial';
let mdsStations = [];
let mdsDistanceMatrix = [];
let mdsCoordinates = [];
let mdsStats = null;
let mdsEigenDiagnostics = null;
let mdsBaselineMatrix = [];
let mdsBaselineCoordinates = [];
let mdsScreenScale = 1;
let mdsDisconnectedCount = 0;
let mdsOriginId = null;
let mdsServiceAvailable = true;
import { HAZARD_KEYS } from './distance.js';
import { createTransitModel } from './transit.js';
const HAZARD_WEIGHTS = Object.fromEntries(HAZARD_KEYS.map(key => [key, 1]));
let hazardCap = 4;
import { reachableEdgePaths } from './reachability.js';
import { createMeshOverlay } from './mesh.js';
import { createHazardEngine, HAZARD_SOURCES } from './hazard.js';
const fieldTransform = { scale: 1, x: 0, y: 0 };
let fieldPanStart = null;
function defaultOriginId() { return stations.find(station => station.name === '東京')?.id || stations[0]?.id; }
const map = L.map('normal-map', { zoomControl: false }).setView([35.681, 139.767], 10);
const reachMap = L.map('reach-map', { zoomControl: false }).setView([35.681, 139.767], 10);
new ResizeObserver(() => {
  if (displayMode !== 'mds') reachMap.invalidateSize({ pan: false });
}).observe($('#reach-map'));
map.attributionControl.setPrefix('');
reachMap.attributionControl.setPrefix('');
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(reachMap);
reachMap.createPane('hazard-mesh').style.zIndex = 590;
reachMap.createPane('reach-muted').style.zIndex = 600;
reachMap.createPane('reach-colored').style.zIndex = 620;
reachMap.createPane('reach-stations').style.zIndex = 630;
map.createPane('rail-casing').style.zIndex = 610;
map.createPane('rail-lines').style.zIndex = 620;
map.createPane('rail-stations').style.zIndex = 630;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(reachMap);
const meshOverlay = createMeshOverlay(reachMap);
const hazardLayerKeys = {};
for (const [hazard, urls] of Object.entries(HAZARD_SOURCES)) {
  hazardLayerKeys[hazard] = [];
  for (const [index, url] of urls.entries()) {
    const layerKey = `${hazard}-${index}`;
    hazardLayerKeys[hazard].push(layerKey);
    meshOverlay.registerTile(layerKey, url, {});
  }
}
function visibleMeshKeys() { return enabledHazards.flatMap(key => hazardLayerKeys[key] || []); }
const railLayer = L.layerGroup().addTo(map);
const stationLayer = L.layerGroup().addTo(map);
const mutedReachLayer = L.layerGroup().addTo(reachMap);
const coloredReachLayer = L.layerGroup().addTo(reachMap);
const comparisonReachLayer = L.layerGroup().addTo(reachMap);
const reachStationLayer = L.layerGroup().addTo(reachMap);
let syncingMaps = false;
function synchronizeMap(source, destination) {
  source.on('moveend', () => {
    if (syncingMaps || displayMode === 'mds') return;
    syncingMaps = true;
    destination.setView(source.getCenter(), source.getZoom(), { animate: false });
    syncingMaps = false;
  });
}
synchronizeMap(map, reachMap);
synchronizeMap(reachMap, map);
const operatorColors = new Map();
function currentOrigin() { return stations.find(station => station.id === originId) || stations[2]; }
function hazardSummary() { return enabledHazards.map(key => { const value = hazardAffected.get(key) || {}; return `${document.querySelector(`[data-hazard="${key}"]`).closest('label').querySelector('strong').textContent}: 曝露${value.affected ?? 0}辺・未評価${value.unknown ?? 0}辺`; }).join(' · '); }
function serviceCondition() {
  return { category: $('#service-type').value, day: $('#service-day').value };
}
function hazardOptions(keys = enabledHazards) { return { keys, cap: hazardCap }; }
function selectOrigin(id) { originId = id; drawStations(); renderField(); }
function colorFor(feature) {
  const operator = feature.properties.operator || feature.properties.name || feature.properties.id;
  if (!operatorColors.has(operator)) operatorColors.set(operator, feature.properties.color || '#5d8eae');
  return operatorColors.get(operator);
}
function drawRoutes() {
  // Draw every casing before the colored lines, as in reach-map.
  for (const route of routeData) {
    L.geoJSON(route, { pane: 'rail-casing', smoothFactor: 0, style: { color: '#fff', weight: 9, opacity: .9 }, interactive: false }).addTo(railLayer);
  }
  for (const route of routeData) {
    const color = colorFor(route);
    L.geoJSON(route, { pane: 'rail-lines', smoothFactor: 0, style: { color, weight: 5, opacity: .95 }, onEachFeature: (feature, layer) => layer.bindTooltip(`${feature.properties.operator || ''} / ${feature.properties.name || ''}`) }).addTo(railLayer);
    L.geoJSON(route, { pane: 'reach-muted', smoothFactor: 0, style: { color: '#909b98', weight: 4, opacity: .52 }, interactive: false }).addTo(mutedReachLayer);
  }
}
function renderReachMap() {
  const origin = currentOrigin();
  const active = distanceModel.shortestPaths(origin.id, serviceCondition(), hazardOptions());
  const baseline = distanceModel.shortestPaths(origin.id, serviceCondition(), hazardOptions([]));
  const distances = active.stationDistances;
  coloredReachLayer.clearLayers();
  comparisonReachLayer.clearLayers();
  reachStationLayer.clearLayers();
  if (enabledHazards.length) for (const edge of routeEdges) {
    const cost = edge.baseTime;
    for (const path of reachableEdgePaths(edge, baseline.nodeDistances, maxMinutes, cost)) {
      L.polyline(path.map(([lon, lat]) => [lat, lon]), { pane: 'reach-colored', color: '#e2a04e', weight: 6, opacity: .9, interactive: false, smoothFactor: 0 }).addTo(comparisonReachLayer);
    }
  }
  for (const edge of routeEdges) {
    const impact = Math.min(hazardCap, enabledHazards.reduce((sum, key) => sum + HAZARD_WEIGHTS[key] * Number(edge.hazardRisks?.[key] || 0), 0));
    const cost = edge.baseTime * (1 + impact);
    for (const path of reachableEdgePaths(edge, active.nodeDistances, maxMinutes, cost)) {
      L.polyline(path.map(([lon, lat]) => [lat, lon]), { pane: 'reach-colored', color: '#168778', weight: 5, opacity: .92, interactive: false, smoothFactor: 0 }).addTo(coloredReachLayer);
    }
  }
  let visibleCount = 0;
  for (const station of stations) {
    const minutes = distances.get(station.id) ?? Infinity;
    const reachable = minutes <= maxMinutes;
    if (reachable) visibleCount++;
    const selected = station.id === origin.id;
    L.circleMarker([station.map_lat ?? station.lat, station.map_lon ?? station.lon], {
      pane: 'reach-stations', radius: selected ? 8 : reachable ? 5 : 3,
      color: selected ? '#fff7ed' : reachable ? '#176b62' : '#a4ada9',
      fillColor: selected ? '#e77d48' : reachable ? '#fbfaf5' : '#c2c8c5',
      fillOpacity: 1, weight: selected ? 3 : 1.5, opacity: reachable ? 1 : .65
    }).bindTooltip(`${station.name}駅${reachable ? ` · 実効時間 ${minutes.toFixed(1)}分` : ' · 実効時間の範囲外'}`)
      .on('mouseover', () => { $('#field-station-info').textContent = `${station.name}駅${reachable ? ` · 実効時間 ${minutes.toFixed(1)}分` : ' · 実効時間の範囲外'}`; })
      .addTo(reachStationLayer);
  }
  $('#field-note-text').textContent = `${visibleCount}駅 · 実効時間${maxMinutes}分以内 · 色の路線が到達範囲`;
  $('#origin-name').textContent = `${origin.name}駅`;
  $('#distance-value').textContent = `${maxMinutes}分`;
  $('#status').textContent = active.sourceCount === 0
    ? `${origin.name}駅には、選択した${serviceModeLabel()}の出発データがありません。別の基準駅または条件を選択してください。`
    : `${origin.name}駅基準 · ${serviceModeLabel()} · ${enabledHazards.length ? `追加コストがある区間 ${hazardSummary()}` : '時刻表の区間時間中央値'}`;
}
function drawStations() {
  stationLayer.clearLayers();
  stations.forEach(station => {
    const selected = station.id === originId;
    const size = selected ? 24 : 14;
    const marker = L.marker([station.map_lat ?? station.lat, station.map_lon ?? station.lon], { pane: 'rail-stations', icon: L.divIcon({ className: `station-pin${selected ? ' is-origin' : ''}`, html: `<span>${selected ? station.name : ''}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), title: `${station.name}駅を基準駅にする` });
    marker.bindTooltip(`${station.name}駅`, { direction: 'top', offset: [0, -12] });
    marker.on('click', () => selectOrigin(station.id));
    marker.addTo(stationLayer);
  });
}
function renderField() {
  $('#reach-map').hidden = displayMode === 'mds';
  $('#field-map').hidden = displayMode !== 'mds';
  $('#mesh-info').hidden = displayMode === 'mds' || enabledHazards.length === 0;
  $('#field-map').classList.toggle('is-mds', displayMode === 'mds');
  $('#mds-quality').hidden = displayMode !== 'mds';
  $('#distance-range').disabled = displayMode === 'mds';
  $('#mode-help').textContent = displayMode === 'mds' ? '選択駅周辺の駅間関係を見る' : 'この駅から街を見る';
  $('#field-title').textContent = '駅間移動時間の MDS 配置';
  $('#field-desc').textContent = '選択駅から実効時間60分以内の最大120駅について、双方向の最短コストを平均した距離を古典的MDSで配置します。';
  $('#field-station-info').textContent = displayMode === 'mds' ? '点に触れるかクリックすると駅名を表示します' : '駅に触れると駅名と実効時間を表示します';
  if (displayMode === 'mds') {
    if (mdsOriginId !== originId) initializeMds();
    return renderMds();
  }
  requestAnimationFrame(() => reachMap.invalidateSize({ pan: false }));
  renderReachMap();
}
function renderMds() {
  const origin = currentOrigin();
  const coordinates = mdsCoordinates;
  const scale = mdsScreenScale; // Fixed from the baseline, even when hazard distances grow.
  const originIndex = Math.max(0, mdsStations.findIndex(station => station.id === origin.id));
  const [originX, originY] = coordinates[originIndex] || [0, 0];
  const [baselineOriginX, baselineOriginY] = mdsBaselineCoordinates[originIndex] || [0, 0];
  $('#field-rings').innerHTML = '';
  $('#field-axis').innerHTML = '';
  const vectors = enabledHazards.length ? coordinates.map(([x, y], index) => {
    const [bx, by] = mdsBaselineCoordinates[index];
    const x1 = 300 + (bx - baselineOriginX) * scale;
    const y1 = 280 + (by - baselineOriginY) * scale;
    const x2 = 300 + (x - originX) * scale;
    const y2 = 280 + (y - originY) * scale;
    const arrow = Math.hypot(x2 - x1, y2 - y1) >= 1
      ? `<line class="mds-displacement" data-station-index="${index}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#mds-arrowhead)"></line>` : '';
    return `<circle class="mds-baseline-point" data-station-index="${index}" cx="${x1}" cy="${y1}" r="4"></circle>${arrow}`;
  }).join('') : '';
  const spokes = coordinates.map(([x, y], index) => index === originIndex ? '' :
    `<line class="mds-origin-link" data-station-index="${index}" x1="300" y1="280" x2="${300 + (x - originX) * scale}" y2="${280 + (y - originY) * scale}"></line>`).join('');
  $('#field-routes').innerHTML = spokes + vectors + coordinates.map(([x, y], index) => {
    const station = mdsStations[index];
    const px = 300 + (x - originX) * scale;
    const py = 280 + (y - originY) * scale;
    const isOrigin = station.id === origin.id;
    const major = isOrigin || isMajorStation(station);
    return `<g class="mds-station${isOrigin ? ' mds-origin' : ''}${major ? ' major' : ''}" tabindex="0" data-station-index="${index}" data-station-name="${escapeHtml(station.name)}" aria-label="${escapeHtml(station.name)}駅"><title>${escapeHtml(station.name)}駅</title><circle cx="${px}" cy="${py}" r="${isOrigin ? 9 : 5.5}"></circle><text x="${px + 9}" y="${py - 7}">${escapeHtml(station.name)}</text></g>`;
  }).join('');
  $('#field-origin').innerHTML = '';
  $('#field-note-text').textContent = `MDS: ${mdsStations.length}駅 · Stress ${mdsStats.stress.toFixed(3)} · 距離相関 ${mdsStats.correlation.toFixed(3)}`;
  $('#field-station-info').textContent = enabledHazards.length
    ? '灰色の○が通常時、赤い矢印が条件適用後への変位です。駅を選ぶと中心からの線を強調します'
    : '点に触れるかクリックすると駅名と中心からの線を表示します';
  $('#mds-quality-text').textContent = `対象駅 ${mdsStations.length} · Stress ${mdsStats.stress.toFixed(3)} · 距離相関 ${mdsStats.correlation.toFixed(3)} · 負の固有値 ${mdsEigenDiagnostics.count}個 · 絶対値合計 ${mdsEigenDiagnostics.absoluteSum.toFixed(2)} · 正の固有値との比 ${mdsEigenDiagnostics.ratioToPositive.toFixed(3)}`;
  $('#origin-name').textContent = `${origin.name}駅`;
  $('#distance-value').textContent = '—';
  $('#status').textContent = !mdsServiceAvailable
    ? `${origin.name}駅には、選択した${serviceModeLabel()}の出発データがないため、MDSを作成できません。`
    : `${origin.name}駅基準 · ${serviceModeLabel()} · MDS ${mdsStations.length}駅 · ${enabledHazards.length ? `追加コストがある区間 ${hazardSummary()}` : '時刻表の区間時間中央値'}`;
  applyFieldTransform();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function isMajorStation(station) {
  return /^(東京|新宿|渋谷|池袋|品川|上野|横浜|大宮|千葉)$/.test(station.name);
}
function buildMdsMatrix(hazards = []) {
  const directed = mdsStations.map(from => {
    const distances = distanceModel.shortestPaths(from.id, serviceCondition(), hazardOptions(hazards)).stationDistances;
    return mdsStations.map(to => distances.get(to.id) ?? Infinity);
  });
  return symmetrizeDirectedDistances(directed);
}
function initializeMds() {
  const anchor = currentOrigin();
  const baselineResult = distanceModel.shortestPaths(anchor.id, serviceCondition(), hazardOptions([]));
  const baselineDistances = baselineResult.stationDistances;
  mdsServiceAvailable = baselineResult.sourceCount > 0;
  if (!mdsServiceAvailable) {
    mdsStations = [anchor];
    mdsDisconnectedCount = stations.length - 1;
    mdsBaselineMatrix = [[0]];
    mdsBaselineCoordinates = [[0, 0]];
    mdsScreenScale = 1;
    mdsOriginId = anchor.id;
    updateMds();
    return;
  }
  const candidates = stations.filter(station => (baselineDistances.get(station.id) ?? Infinity) <= 60)
    .sort((a, b) => baselineDistances.get(a.id) - baselineDistances.get(b.id)).slice(0, 180);
  const mutuallyReachable = candidates.filter(station =>
    Number.isFinite(distanceModel.shortestPaths(station.id, serviceCondition(), hazardOptions([])).stationDistances.get(anchor.id)));
  mdsDisconnectedCount = stations.length - mutuallyReachable.length;
  mdsStations = mutuallyReachable.slice(0, 120);
  if (!mdsStations.length) {
    mdsStations = [anchor];
    mdsBaselineMatrix = [[0]];
    mdsBaselineCoordinates = [[0, 0]];
    mdsScreenScale = 1;
    mdsOriginId = anchor.id;
    updateMds();
    return;
  }
  mdsBaselineMatrix = buildMdsMatrix();
  const baselineInitial = classicalMdsDetails(mdsBaselineMatrix).coordinates;
  mdsBaselineCoordinates = metricSmacof(mdsBaselineMatrix, baselineInitial);
  const originIndex = Math.max(0, mdsStations.findIndex(station => station.id === anchor.id));
  const [originX, originY] = mdsBaselineCoordinates[originIndex] || [0, 0];
  const extent = Math.max(1, ...mdsBaselineCoordinates.flatMap(([x, y]) => [Math.abs(x - originX), Math.abs(y - originY)]));
  mdsScreenScale = 245 / extent;
  mdsOriginId = anchor.id;
  updateMds();
}
function updateMds() {
  mdsDistanceMatrix = enabledHazards.length ? buildMdsMatrix(enabledHazards) : mdsBaselineMatrix;
  const result = classicalMdsDetails(mdsDistanceMatrix);
  const coordinates = enabledHazards.length ? metricSmacof(mdsDistanceMatrix, mdsBaselineCoordinates) : mdsBaselineCoordinates;
  mdsCoordinates = enabledHazards.length ? alignRigid2D(coordinates, mdsBaselineCoordinates) : mdsBaselineCoordinates;
  mdsStats = mdsFitStats(mdsDistanceMatrix, mdsCoordinates);
  mdsEigenDiagnostics = result.negativeEigenvalues;
}
function applyFieldTransform() { $('#field-zoom-layer').setAttribute('transform', `translate(${fieldTransform.x} ${fieldTransform.y}) scale(${fieldTransform.scale})`); }
$('#distance-range').addEventListener('input', event => { maxMinutes = Number(event.target.value); renderField(); });
function serviceModeLabel() { return `${serviceMode.startsWith('local') ? '普通' : '快速系'}・${serviceMode.endsWith('weekday') ? '平日' : '休日'}`; }
function changeServiceMode() {
  serviceMode = `${$('#service-type').value}_${$('#service-day').value}`;
  initializeMds();
  renderField();
}
$('#service-type').addEventListener('change', changeServiceMode);
$('#service-day').addEventListener('change', changeServiceMode);
document.querySelectorAll('[data-display-mode]').forEach(button => button.addEventListener('click', () => { displayMode = button.dataset.displayMode; document.querySelectorAll('[data-display-mode]').forEach(item => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); renderField(); }));
document.querySelectorAll('.hazard-toggle').forEach(input => input.addEventListener('change', async () => {
  enabledHazards = [...document.querySelectorAll('.hazard-toggle:checked')].map(item => item.dataset.hazard);
  meshOverlay.show(visibleMeshKeys());
  $('#mesh-info').hidden = displayMode === 'mds' || enabledHazards.length === 0;
  $('#mesh-info-title').textContent = enabledHazards.map(key => document.querySelector(`[data-hazard="${key}"]`).closest('label').querySelector('strong').textContent).join('・');
  if (input.checked && !hazardLoaded.has(input.dataset.hazard)) {
    const key = input.dataset.hazard;
    input.disabled = true;
    $('#status').textContent = `${input.closest('label').querySelector('strong').textContent}の経路データを読み込み中…`;
    try {
      const result = await hazardEngine.load(key, (done, total) => {
        if (done % 10 === 0 || done === total) $('#status').textContent = `${key}: ${done}/${total} タイルを読み込み中…`;
      });
      hazardLoaded.add(key);
      hazardAffected.set(key, result);
    } catch (error) {
      input.checked = false;
      enabledHazards = [...document.querySelectorAll('.hazard-toggle:checked')].map(item => item.dataset.hazard);
      meshOverlay.show(visibleMeshKeys());
      $('#mesh-info').hidden = displayMode === 'mds' || enabledHazards.length === 0;
      $('#status').textContent = `${key} の距離データを取得できません: ${error.message}`;
      input.disabled = false;
      return;
    }
    input.disabled = false;
  }
  updateMds();
  renderField();
}));
document.querySelectorAll('.hazard-weight').forEach(input => input.addEventListener('change', () => {
  const key = input.dataset.hazardWeight;
  HAZARD_WEIGHTS[key] = Number(input.value);
  document.querySelector(`[data-hazard-weight-output="${key}"]`).textContent = Number(input.value).toFixed(2);
  updateMds();
  renderField();
}));
$('#hazard-cap').addEventListener('change', event => {
  hazardCap = Number(event.target.value);
  $('#hazard-cap-output').textContent = hazardCap.toFixed(1);
  updateMds();
  renderField();
});
$('#transfer-extra').addEventListener('change', event => {
  const value = Number(event.target.value);
  $('#transfer-extra-output').textContent = value.toFixed(1);
  distanceModel?.setTransferExtra(value);
  initializeMds();
  renderField();
});
function showFieldStationInfo(station) {
  if (!station) return;
  $('#field-station-info').textContent = `${station.dataset.stationName}駅${station.dataset.distance ? ` · ${station.dataset.distance}分` : ''}`;
  $('#field-map').querySelectorAll('.mds-origin-link').forEach(line => line.classList.toggle('is-active', line.dataset.stationIndex === station.dataset.stationIndex));
  $('#field-map').querySelectorAll('.mds-displacement,.mds-baseline-point').forEach(item => item.classList.toggle('is-active', item.dataset.stationIndex === station.dataset.stationIndex));
}
$('#field-map').addEventListener('pointerover', event => {
  showFieldStationInfo(event.target.closest('.field-station, .mds-station'));
});
$('#field-map').addEventListener('pointerout', event => {
  const from = event.target.closest('.field-station, .mds-station');
  const to = event.relatedTarget?.closest?.('.field-station, .mds-station');
  if (from && from !== to) {
    const selected = $('#field-map').querySelector('.is-selected');
    if (selected) showFieldStationInfo(selected);
    else {
      $('#field-station-info').textContent = displayMode === 'mds' ? '点に触れるかクリックすると駅名を表示します' : '点に触れるかクリックすると駅名と実効時間を表示します';
      $('#field-map').querySelectorAll('.field-route-line').forEach(line => line.classList.remove('is-active'));
      $('#field-map').querySelectorAll('.mds-origin-link').forEach(line => line.classList.remove('is-active'));
      $('#field-map').querySelectorAll('.mds-displacement,.mds-baseline-point').forEach(item => item.classList.remove('is-active'));
    }
  }
});
$('#field-map').addEventListener('focusin', event => showFieldStationInfo(event.target.closest('.field-station, .mds-station')));
$('#field-map').addEventListener('click', event => {
  const station = event.target.closest('.field-station, .mds-station');
  $('#field-map').querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));
  if (station) {
    station.classList.add('is-selected');
    showFieldStationInfo(station);
  } else {
    $('#field-station-info').textContent = displayMode === 'mds' ? '点に触れるかクリックすると駅名を表示します' : '点に触れるかクリックすると駅名と実効時間を表示します';
    $('#field-map').querySelectorAll('.field-route-line').forEach(line => line.classList.remove('is-active'));
    $('#field-map').querySelectorAll('.mds-origin-link').forEach(line => line.classList.remove('is-active'));
    $('#field-map').querySelectorAll('.mds-displacement,.mds-baseline-point').forEach(item => item.classList.remove('is-active'));
  }
});
$('#field-map').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.field-station, .mds-station')) {
    event.preventDefault();
    event.target.click();
  }
});
$('#field-map').addEventListener('wheel', event => {
  event.preventDefault();
  const rect = $('#field-map').getBoundingClientRect();
  const cursorX = (event.clientX - rect.left) / rect.width * 600;
  const cursorY = (event.clientY - rect.top) / rect.height * 560;
  const oldScale = fieldTransform.scale;
  const nextScale = Math.max(.65, Math.min(2.8, oldScale * (event.deltaY < 0 ? 1.15 : .87)));
  const ratio = nextScale / oldScale;
  fieldTransform.x = cursorX - (cursorX - fieldTransform.x) * ratio;
  fieldTransform.y = cursorY - (cursorY - fieldTransform.y) * ratio;
  fieldTransform.scale = nextScale;
  applyFieldTransform();
}, { passive: false });
$('#field-map').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  if (event.target.closest('.field-station, .mds-station')) return;
  const rect = $('#field-map').getBoundingClientRect();
  fieldPanStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, tx: fieldTransform.x, ty: fieldTransform.y, width: rect.width, height: rect.height };
  $('#field-map').setPointerCapture(event.pointerId);
  $('#field-map').classList.add('is-panning');
});
$('#field-map').addEventListener('pointermove', event => {
  if (!fieldPanStart || event.pointerId !== fieldPanStart.pointerId) return;
  fieldTransform.x = fieldPanStart.tx + (event.clientX - fieldPanStart.x) / fieldPanStart.width * 600;
  fieldTransform.y = fieldPanStart.ty + (event.clientY - fieldPanStart.y) / fieldPanStart.height * 560;
  applyFieldTransform();
});
function stopFieldPan(event) {
  if (!fieldPanStart || event.pointerId !== fieldPanStart.pointerId) return;
  fieldPanStart = null;
  $('#field-map').classList.remove('is-panning');
  if ($('#field-map').hasPointerCapture(event.pointerId)) $('#field-map').releasePointerCapture(event.pointerId);
}
$('#field-map').addEventListener('pointerup', stopFieldPan);
$('#field-map').addEventListener('pointercancel', stopFieldPan);
async function loadMeshLayers() {
  const response = await fetch('./data/mesh-manifest.json');
  if (!response.ok) throw new Error(`mesh-manifest.json: HTTP ${response.status}`);
  const manifest = await response.json();
  for (const entry of manifest.layers) {
    const layerResponse = await fetch(entry.url);
    if (!layerResponse.ok) throw new Error(`${entry.url}: HTTP ${layerResponse.status}`);
    meshOverlay.register(entry.key, await layerResponse.json(), entry.style || { color: '#277b89', weight: 0.5, fillOpacity: 0.35 });
  }
  meshOverlay.show(visibleMeshKeys());
}
async function init() {
  const response = await fetch('./data/railway.json');
  if (!response.ok) throw new Error(`railway.json: HTTP ${response.status}`);
  const railway = await response.json();
  routeData = railway.lines.features.filter(feature => feature.properties.transport_type !== 'shinkansen');
  const regularStationIds = new Set(routeData.flatMap(feature => feature.properties.stations || []));
  stations = railway.stations.filter(station => regularStationIds.has(station.id));
  const edgeResponse = await fetch('./data/transit-network.json');
  if (!edgeResponse.ok) throw new Error(`transit-network.json: HTTP ${edgeResponse.status}`);
  const transitData = await edgeResponse.json();
  routeEdges = transitData.runningEdges;
  distanceModel = createTransitModel(transitData, HAZARD_WEIGHTS);
  hazardEngine = createHazardEngine(routeEdges);
  originId = defaultOriginId();
  initializeMds();
  drawRoutes();
  drawStations();
  await loadMeshLayers();
  map.setView([35.681, 139.767], 12);
  document.querySelectorAll('.hazard-toggle').forEach(input => { input.disabled = false; });
  renderField();
}
init().catch(error => { $('#status').textContent = `鉄道データを読み込めませんでした: ${error.message}`; });
