/* Highway to Hell — FARS fatal-crash map */
'use strict';

const DATA_URL = 'data/fars.json?v=1';
const STATES_URL = 'data/us-states.json?v=1';
// vendored CARTO dark-matter style; tiles stay remote, glyphs are served locally
// (?style=<url> overrides, for local development against a tile mirror)
const STYLE_URL = new URLSearchParams(location.search).get('style')
  || 'assets/vendor/dark-matter-style.json';
const GLYPHS = new URL('assets/glyphs/', location.href).href + '{fontstack}/{range}.pbf';
// single-font stacks: glyph requests hit our mirrored files exactly
const FONT_TEXT = ['Montserrat Medium'];
const FONT_NUM = ['Open Sans Bold'];
const US_BOUNDS = [[-125.6, 23.6], [-66.0, 49.8]];
const ROAD_LABEL_MINZOOM = 6.6;
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

const S = window.__S = {
  d: null,             // raw dataset
  features: [],        // one GeoJSON feature per crash, built once
  activeYears: null,   // Set of year indexes
  road: -1,            // selected road index, -1 = none
  roadTotals: null,    // Map roadIdx -> [deaths, crashes] for active years
  suggestPool: [],     // [roadIdx, deaths, crashes] sorted by deaths desc
  map: null,
  layersReady: false,
};

/* ── boot ────────────────────────────────────────────────────────── */

Promise.all([
  fetch(DATA_URL).then((r) => {
    if (!r.ok) throw new Error('data ' + r.status);
    return r.json();
  }),
  fetch(STATES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  fetch(STYLE_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
]).then(([data, statesGeo, baseStyle]) => {
  S.d = data;
  buildFeatures();
  initUI();
  initMap(baseStyle, statesGeo);
}).catch((err) => {
  const el = $('loader-status');
  el.textContent = 'Could not load crash data (' + err.message + '). Refresh to retry.';
  el.classList.add('err');
});

function buildFeatures() {
  const { lat, lon, f, y, m, r, s } = S.d;
  const n = lat.length;
  const feats = new Array(n);
  for (let i = 0; i < n; i++) {
    feats[i] = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon[i] / 1e5, lat[i] / 1e5] },
      properties: { f: f[i], y: y[i], m: m[i], r: r[i], s: s[i] },
    };
  }
  S.features = feats;
  S.activeYears = new Set(S.d.meta.years.map((_, i) => i));
  rebuildRoadTotals();
}

function activeFeatures() {
  const out = [];
  for (const ft of S.features) {
    const p = ft.properties;
    if (!S.activeYears.has(p.y)) continue;
    if (S.road >= 0 && p.r !== S.road) continue;
    out.push(ft);
  }
  return out;
}

function rebuildRoadTotals() {
  const { f, y, r } = S.d;
  const totals = new Map();
  for (let i = 0; i < f.length; i++) {
    if (!S.activeYears.has(y[i]) || r[i] === 0) continue;
    let t = totals.get(r[i]);
    if (!t) { t = [0, 0]; totals.set(r[i], t); }
    t[0] += f[i];
    t[1] += 1;
  }
  S.roadTotals = totals;
  S.suggestPool = [...totals.entries()]
    .map(([ri, t]) => [ri, t[0], t[1]])
    .sort((a, b) => b[1] - a[1]);
}

/* ── map ─────────────────────────────────────────────────────────── */

function initMap(baseStyle, statesGeo) {
  const style = baseStyle || {
    version: 8,
    name: 'blackout',
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0c' } }],
  };
  style.glyphs = GLYPHS; // self-hosted glyphs: labels work even if the tile CDN doesn't

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: [-96.8, 38.5],
    zoom: 3.4,
    minZoom: 2,
    maxZoom: 17,
    hash: true,
    attributionControl: false, // credits live in the stats card, always visible
    fadeDuration: 120,
  });
  S.map = map;

  if (!location.hash || location.hash.length < 4) {
    map.fitBounds(US_BOUNDS, {
      padding: { top: 96, bottom: 40, left: 30, right: 30 },
      duration: 0,
    });
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('error', (e) => console.warn('map:', e && e.error && e.error.message));

  // style.load, not load: our layers must not wait on basemap tile downloads
  map.once('style.load', () => {
    addLayers(statesGeo);
    S.layersReady = true;
    refreshViewport();
    map.once('idle', dismissLoader);
    setTimeout(dismissLoader, 8000); // never trap the user on the loader
  });

  map.on('moveend', refreshViewport);
}

function addLayers(statesGeo) {
  const map = S.map;

  // slot our data below the basemap's place labels so city names stay on top
  const styleLayers = map.getStyle().layers || [];
  const firstSymbol = styleLayers.find((l) => l.type === 'symbol');
  const under = firstSymbol ? firstSymbol.id : undefined;

  if (statesGeo) {
    map.addSource('states', { type: 'geojson', data: statesGeo });
    map.addLayer({
      id: 'state-lines',
      type: 'line',
      source: 'states',
      paint: {
        'line-color': 'rgba(233,228,221,0.16)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.1],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 1, 8, 0],
      },
    }, under);
  }

  const initial = { type: 'FeatureCollection', features: activeFeatures() };

  map.addSource('crashes', {
    type: 'geojson',
    data: initial,
    cluster: true,
    clusterRadius: 46,
    clusterMaxZoom: 8,
    clusterProperties: { deaths: ['+', ['get', 'f']] },
  });

  // unclustered twin feeding the heat field, so density is real, not centroid dots
  map.addSource('crashes-raw', { type: 'geojson', data: initial });

  map.addSource('roadlabels', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // heat field, zoomed out
  map.addLayer({
    id: 'heat',
    type: 'heatmap',
    source: 'crashes-raw',
    maxzoom: 7.5,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'f'], 1, 0.05, 4, 0.16, 10, 0.4],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.9, 5, 1.6, 7, 2.6],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 5, 9, 7.5, 24],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5.6, 0.95, 7.5, 0],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.12, 'rgba(64,6,6,0.55)',
        0.35, '#7a0e0e',
        0.6, '#c22815',
        0.82, '#ff5a1f',
        1, '#ffc46b'],
    },
  }, under);

  // clusters: number = summed deaths inside
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'crashes',
    filter: ['has', 'point_count'],
    minzoom: 5.4,
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'deaths'],
        4, '#6e1310', 30, '#a11a12', 120, '#d43413', 400, '#ff5a1f', 1200, '#ff9430'],
      'circle-radius': ['interpolate', ['linear'], ['get', 'deaths'],
        2, 12, 25, 16, 100, 21, 400, 27, 1500, 34],
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(8,8,10,0.85)',
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5.4, 0, 6.1, 0.92],
    },
  }, under);

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'crashes',
    filter: ['has', 'point_count'],
    minzoom: 5.7,
    layout: {
      'text-field': ['number-format', ['get', 'deaths'], {}],
      'text-font': FONT_NUM,
      'text-size': ['interpolate', ['linear'], ['get', 'deaths'], 5, 11.5, 400, 14.5, 1500, 16],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffe9d4',
      'text-halo-color': 'rgba(20,4,2,0.75)',
      'text-halo-width': 1,
    },
  });

  // individual crashes
  map.addLayer({
    id: 'pts',
    type: 'circle',
    source: 'crashes',
    filter: ['!', ['has', 'point_count']],
    minzoom: 6.8,
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'f'],
        1, '#b3220f', 2, '#e0401a', 4, '#ff702a', 8, '#ffa542'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        7, ['+', 1.6, ['*', 1.1, ['get', 'f']]],
        11, ['+', 3.2, ['*', 1.5, ['get', 'f']]],
        15, ['+', 5, ['*', 2, ['get', 'f']]]],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 11, 1.4],
      'circle-stroke-color': 'rgba(8,8,10,0.8)',
      'circle-opacity': 0.92,
    },
  }, under);

  // per-crash death count at close zoom
  map.addLayer({
    id: 'pt-count',
    type: 'symbol',
    source: 'crashes',
    filter: ['all', ['!', ['has', 'point_count']],
      ['any', ['>=', ['get', 'f'], 2], ['>=', ['zoom'], 13.5]]],
    minzoom: 10.5,
    layout: {
      'text-field': ['to-string', ['get', 'f']],
      'text-font': FONT_NUM,
      'text-size': 10.5,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffe9d4',
      'text-halo-color': 'rgba(20,4,2,0.8)',
      'text-halo-width': 1,
    },
  });

  // road labels: NAME over deaths\crashes
  map.addLayer({
    id: 'roads',
    type: 'symbol',
    source: 'roadlabels',
    minzoom: ROAD_LABEL_MINZOOM,
    layout: {
      'text-field': ['format',
        ['get', 'name'], { 'text-font': ['literal', FONT_TEXT], 'font-scale': 0.78, 'text-color': '#d9d3cb' },
        '\n', {},
        ['get', 'label'], { 'text-font': ['literal', FONT_NUM], 'font-scale': 1.06, 'text-color': '#ff8a3d' },
      ],
      'text-font': FONT_NUM,
      'text-size': ['interpolate', ['linear'], ['zoom'], 6.6, 12.5, 10, 14, 14, 16],
      'text-line-height': 1.15,
      'symbol-sort-key': ['get', 'order'],
      'text-padding': 6,
      'text-offset': [0, -1.9],
    },
    paint: {
      'text-halo-color': 'rgba(7,7,9,0.92)',
      'text-halo-width': 1.5,
    },
  });

  // interactions
  map.on('click', 'clusters', (e) => {
    const f = e.features[0];
    map.getSource('crashes').getClusterExpansionZoom(f.properties.cluster_id).then((z) => {
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.3, 14) });
    });
  });

  map.on('click', 'pts', (e) => {
    const p = e.features[0].properties;
    const name = p.r > 0 ? S.d.roads[p.r] : 'Unnamed road';
    const when = (p.m ? MONTHS[p.m] + ' ' : '') + S.d.meta.years[p.y];
    new maplibregl.Popup({ maxWidth: '300px' })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(
        '<div class="pop-road">' + esc(name) + '</div>' +
        '<div class="pop-toll">' + p.f + (p.f === 1 ? ' death' : ' deaths') + '</div>' +
        '<div class="pop-meta">' + when + ' · ' + esc(S.d.states[p.s]) + '</div>'
      )
      .addTo(map);
  });

  map.on('click', 'roads', (e) => {
    const rid = e.features[0].properties.rid;
    if (rid > 0) selectRoad(rid);
  });

  for (const layer of ['clusters', 'pts', 'roads']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
}

/* ── viewport aggregation: stats + per-road labels ───────────────── */

function refreshViewport() {
  if (!S.layersReady) return;
  const map = S.map;
  const b = map.getBounds();
  const w = b.getWest(); const e = b.getEast();
  const s = b.getSouth(); const n = b.getNorth();
  const wrap = e < w; // antimeridian crossing

  const { lat, lon, f, y, r } = S.d;
  const N = lat.length;
  const doRoads = map.getZoom() >= ROAD_LABEL_MINZOOM - 0.2;

  let totD = 0; let totC = 0;
  const agg = doRoads ? new Map() : null; // roadIdx -> [d, c]

  for (let i = 0; i < N; i++) {
    if (!S.activeYears.has(y[i])) continue;
    if (S.road >= 0 && r[i] !== S.road) continue;
    const la = lat[i] / 1e5;
    if (la < s || la > n) continue;
    const lo = lon[i] / 1e5;
    if (wrap ? (lo < w && lo > e) : (lo < w || lo > e)) continue;
    totD += f[i];
    totC += 1;
    if (agg && r[i] > 0) {
      let t = agg.get(r[i]);
      if (!t) { t = [0, 0]; agg.set(r[i], t); }
      t[0] += f[i];
      t[1] += 1;
    }
  }

  $('stat-d').textContent = fmt(totD);
  $('stat-c').textContent = fmt(totC);
  $('stats-sub').textContent = doRoads
    ? 'deaths\\crashes · tap a road label to isolate it'
    : 'deaths\\crashes · zoom in for per-road counts';

  if (!agg) {
    setRoadLabels([]);
    return;
  }

  const zoom = map.getZoom();
  const topN = zoom < 8 ? 14 : zoom < 10 ? 42 : 90;
  const top = [...agg.entries()].sort((a, b2) => b2[1][0] - a[1][0]).slice(0, topN);
  const wanted = new Map(top.map(([ri], rank) => [ri, rank]));

  // gather member positions for the top roads only
  const pos = new Map(); // roadIdx -> {sx, sy, pts: [ [lo,la], ... ]}
  for (let i = 0; i < N; i++) {
    const ri = r[i];
    if (!wanted.has(ri)) continue;
    if (!S.activeYears.has(y[i])) continue;
    if (S.road >= 0 && ri !== S.road) continue;
    const la = lat[i] / 1e5;
    if (la < s || la > n) continue;
    const lo = lon[i] / 1e5;
    if (wrap ? (lo < w && lo > e) : (lo < w || lo > e)) continue;
    let p = pos.get(ri);
    if (!p) { p = { sx: 0, sy: 0, pts: [] }; pos.set(ri, p); }
    p.sx += lo;
    p.sy += la;
    p.pts.push([lo, la]);
  }

  const feats = [];
  for (const [ri, rank] of wanted) {
    const p = pos.get(ri);
    if (!p) continue;
    // medoid-ish: the member crash nearest the centroid keeps the label on the road
    const cx = p.sx / p.pts.length;
    const cy = p.sy / p.pts.length;
    let best = p.pts[0]; let bd = Infinity;
    for (const pt of p.pts) {
      const dx = pt[0] - cx; const dy = pt[1] - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = pt; }
    }
    const t = agg.get(ri);
    feats.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: best },
      properties: {
        rid: ri,
        name: S.d.roads[ri],
        label: fmt(t[0]) + '\\' + fmt(t[1]),
        order: rank,
      },
    });
  }
  setRoadLabels(feats);
}

function setRoadLabels(feats) {
  const src = S.map.getSource('roadlabels');
  if (src) src.setData({ type: 'FeatureCollection', features: feats });
}

function pushCrashData() {
  const fc = { type: 'FeatureCollection', features: activeFeatures() };
  S.map.getSource('crashes').setData(fc);
  S.map.getSource('crashes-raw').setData(fc);
}

/* ── road selection ──────────────────────────────────────────────── */

function selectRoad(ri) {
  S.road = ri;
  const feats = activeFeatures();
  S.map.getSource('crashes').setData({ type: 'FeatureCollection', features: feats });
  S.map.getSource('crashes-raw').setData({ type: 'FeatureCollection', features: feats });

  let d = 0; let c = 0; let minX = 180; let maxX = -180; let minY = 90; let maxY = -90;
  const statesSeen = new Set();
  for (const ft of feats) {
    d += ft.properties.f;
    c += 1;
    statesSeen.add(ft.properties.s);
    const [x, yy] = ft.geometry.coordinates;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (yy < minY) minY = yy;
    if (yy > maxY) maxY = yy;
  }

  $('rb-name').textContent = S.d.roads[ri];
  $('rb-nums').innerHTML = fmt(d) + '<i>\\</i><em>' + fmt(c) + '</em>';
  $('rb-sub').textContent = statesSeen.size > 1
    ? 'in ' + statesSeen.size + ' states'
    : (statesSeen.size ? S.d.states[[...statesSeen][0]] : '');
  $('road-banner').hidden = false;

  if (c > 0) {
    S.map.fitBounds([[minX, minY], [maxX, maxY]], {
      padding: { top: 130, bottom: 90, left: 60, right: 60 },
      maxZoom: 12,
      duration: 900,
    });
  }
  refreshViewport();
}

function clearRoad() {
  if (S.road < 0) return;
  S.road = -1;
  $('road-banner').hidden = true;
  pushCrashData();
  refreshViewport();
}

/* ── UI ──────────────────────────────────────────────────────────── */

function initUI() {
  const meta = S.d.meta;

  // year chips
  const yearsBox = $('years');
  meta.years.forEach((yr, i) => {
    const btn = document.createElement('button');
    btn.className = 'chip on';
    btn.textContent = yr;
    btn.setAttribute('aria-pressed', 'true');
    btn.addEventListener('click', () => {
      if (S.activeYears.has(i)) {
        if (S.activeYears.size === 1) return; // keep at least one year lit
        S.activeYears.delete(i);
        btn.classList.remove('on');
        btn.setAttribute('aria-pressed', 'false');
      } else {
        S.activeYears.add(i);
        btn.classList.add('on');
        btn.setAttribute('aria-pressed', 'true');
      }
      rebuildRoadTotals();
      if (S.layersReady) {
        pushCrashData();
        refreshViewport();
      }
      if (S.road >= 0) selectRoad(S.road); // refresh banner numbers
    });
    yearsBox.appendChild(btn);
  });

  // about modal
  $('m-deaths').textContent = fmt(meta.deaths);
  $('m-crashes').textContent = fmt(meta.crashes);
  $('m-years').textContent = meta.years[0] + ' through ' + meta.years[meta.years.length - 1];
  $('m-dropped').textContent = fmt(meta.dropped);
  $('m-built').textContent = meta.generated;
  $('about-btn').addEventListener('click', () => { $('modal').hidden = false; });
  $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('modal').hidden = true; hideSuggest(); }
  });

  $('rb-clear').addEventListener('click', clearRoad);
  $('brand').addEventListener('click', () => {
    clearRoad();
    S.map.fitBounds(US_BOUNDS, { padding: { top: 96, bottom: 40, left: 30, right: 30 }, duration: 900 });
  });

  // search
  const input = $('search');
  let debounce = 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => showSuggest(input.value), 130);
  });
  input.addEventListener('focus', () => { if (input.value) showSuggest(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = $('suggest').querySelector('button[data-ri]');
      if (first) first.click();
    }
  });
  document.addEventListener('click', (e) => {
    if (!$('search-wrap').contains(e.target)) hideSuggest();
  });

  // initial stats: the whole ledger
  $('stat-d').textContent = fmt(meta.deaths);
  $('stat-c').textContent = fmt(meta.crashes);
  $('loader-status').textContent = fmt(meta.deaths) + ' deaths · ' + fmt(meta.crashes) + ' crashes · rendering…';
}

function showSuggest(q) {
  q = q.trim().toUpperCase();
  const box = $('suggest');
  if (q.length < 2) { hideSuggest(); return; }
  const hits = [];
  for (const [ri, d, c] of S.suggestPool) {
    if (S.d.roads[ri].toUpperCase().includes(q)) {
      hits.push([ri, d, c]);
      if (hits.length >= 8) break;
    }
  }
  box.innerHTML = '';
  if (!hits.length) {
    box.innerHTML = '<div class="s-none">no road matches that name</div>';
  } else {
    for (const [ri, d, c] of hits) {
      const btn = document.createElement('button');
      btn.dataset.ri = ri;
      btn.innerHTML = '<span class="s-name">' + esc(S.d.roads[ri]) + '</span>' +
        '<span class="s-nums">' + fmt(d) + '<i>\\</i><em>' + fmt(c) + '</em></span>';
      btn.addEventListener('click', () => {
        hideSuggest();
        $('search').value = '';
        $('search').blur();
        selectRoad(ri);
      });
      box.appendChild(btn);
    }
  }
  box.hidden = false;
}

function hideSuggest() { $('suggest').hidden = true; }

function dismissLoader() {
  const l = $('loader');
  if (l.classList.contains('gone')) return;
  l.classList.add('gone');
  setTimeout(() => { l.style.display = 'none'; }, 800);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
