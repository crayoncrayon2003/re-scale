// GeoJSON mesh layers can be registered when real, sourced mesh data is available.
export function createMeshOverlay(map) {
  const layers = new Map();
  return {
    register(key, geojson, style) {
      const previous = layers.get(key);
      if (previous) map.removeLayer(previous);
      const layer = L.geoJSON(geojson, { pane: 'hazard-mesh', style, interactive: false });
      layers.set(key, layer);
    },
    registerTile(key, url, options = {}) {
      const previous = layers.get(key);
      if (previous) map.removeLayer(previous);
      layers.set(key, L.tileLayer(url, {
        pane: 'hazard-mesh', minZoom: 2, maxNativeZoom: 17,
        maxZoom: 19, opacity: 0.72,
        attribution: '出典：<a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html" target="_blank" rel="noopener noreferrer">ハザードマップポータルサイト</a>',
        ...options
      }));
    },
    show(enabledKeys) {
      for (const [key, layer] of layers) {
        if (enabledKeys.includes(key)) {
          if (!map.hasLayer(layer)) layer.addTo(map);
        } else if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    }
  };
}
