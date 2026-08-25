'use strict';

const QS = new URLSearchParams(location.search);
const BOOT_URL = 'data/boot.json?v=3';
const ROADS_URL = 'data/roads.json?v=3';
const STATES_URL = 'data/us-states.json?v=1';
const packUrl = (fips) => 'data/s/' + fips + '.json?v=3';
const STYLE_URLS = {
  dark: 'assets/vendor/dark-matter-style.json',
  light: 'assets/vendor/liberty-style.json',
};
const GLYPHS = new URL('assets/glyphs/', location.href).href + '{fontstack}/{range}.pbf';
const GEO_BASE = QS.get('geo') || 'https://photon.komoot.io';
const US_BOUNDS = [[-125.6, 23.6], [-66.0, 49.8]];
const STATE_ZOOM = 5.4;
const PACK_ZOOM = 5.0;
const PACK_CACHE = matchMedia('(pointer: coarse)').matches ? 3 : 6;
const BS = String.fromCharCode(92);
const DC = 'deaths' + BS + 'crashes';
const MI_PER_DEG = 69.172;
const RADII = [1, 3, 5, 10];
const DEFAULT_RADIUS = 5;
const LS_PIN = 'h2h.pin';
const LS_BASE = 'h2h.base';
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PTS_OPACITY = ['interpolate', ['linear'], ['zoom'], 6.8, 0, 8.8, 0.92];
const PTS_STROKE_OPACITY = ['interpolate', ['linear'], ['zoom'], 6.8, 0, 8.8, 1];

const THEMES = {
  dark: {
    labelText: '#d9d3cb',
    labelHalo: 'rgba(7,7,9,0.92)',
    numText: '#ffe9d4',
    numHalo: 'rgba(20,4,2,0.75)',
    stateLine: 'rgba(233,228,221,0.16)',
    ptStroke: 'rgba(8,8,10,0.8)',
  },
  light: {
    labelText: '#221f1b',
    labelHalo: 'rgba(255,255,255,0.94)',
    numText: '#ffe9d4',
    numHalo: 'rgba(60,10,4,0.85)',
    stateLine: 'rgba(40,40,55,0.3)',
    ptStroke: 'rgba(255,255,255,0.9)',
  },
};

const REST_SHORT = {
  'None Used/Not Applicable': 'No restraint',
  'None Used': 'No restraint',
  'None Used / Not Applicable': 'No restraint',
  'Shoulder and Lap Belt Used': 'Belted',
  'Lap Belt Only Used': 'Lap belt only',
  'Shoulder Belt Only Used': 'Shoulder belt only',
  'Restraint Used - Type Unknown': 'Restrained',
  'DOT-Compliant Motorcycle Helmet': 'Helmet',
  'Helmet, Other than DOT-Compliant Motorcycle Helmet': 'Non-DOT helmet',
  'No Helmet': 'No helmet',
  'Not a Motor Vehicle Occupant': null,
  'Not Applicable': null,
  'Reported as Unknown if Used': null,
};

const A = {
  MO: 0, DY: 1, HR: 2, MIN: 3, DOW: 4, FATALS: 5, VEH: 6, PEOPLE: 7,
  COUNTY: 8, CITY: 9, TWAY2: 10, ROUTE: 11, RURURB: 12, FUNC: 13,
  HARM: 14, MANCOLL: 15, RELJCT: 16, TYPINT: 17, RELROAD: 18,
  WRK: 19, SCHBUS: 20, RAIL: 21, LGT: 22, WEATHER: 23, DRUNK: 24,
};
const V = {
  MODYEAR: 0, MAKMOD: 1, BODY: 2, DEATHS: 3, DRINK: 4, HITRUN: 5,
  ROLL: 6, FIRE: 7, TRAVSP: 8, SPDLIM: 9, SPDREL: 10,
};
const P = { VEHNO: 0, PTYPE: 1, AGE: 2, SEX: 3, INJ: 4, REST: 5, EJECT: 6, DOA: 7 };

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

const S = window.__S = {
  d: null,
  grid: null,
  gridW: null,
  gridN: null,
  gridFC: null,
  packs: new Map(),
  modeFeats: [],
  dotsKey: 'none',
  yearLo: 0,
  yearHi: 0,
  roadSel: null,
  roadsIdx: null,
  roadsLoading: null,
  pin: null,
  pinPoly: null,
  marker: null,
  map: null,
  layersReady: false,
  stateShapes: [],
  statesGeo: null,
  base: 'dark',
  styleCache: {},
  shardCache: new Map(),
  selFeature: null,
};

try { S.base = localStorage.getItem(LS_BASE) === 'light' ? 'light' : 'dark'; } catch (e) { }

Promise.all([
  fetch(BOOT_URL).then((r) => {
    if (!r.ok) throw new Error('data ' + r.status);
    setLoader('unpacking the national picture…');
    return r.json();
  }),
  fetch(STATES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  loadStyle(S.base).catch(() => null),
]).then(([boot, statesGeo, baseStyle]) => {
  S.d = boot;
  S.statesGeo = statesGeo;
  buildStateShapes(statesGeo);
  S.yearHi = boot.meta.years.length - 1;
  setLoader(fmt(boot.meta.deaths) + ' deaths · ' + fmt(boot.meta.crashes) + ' crashes · rendering…');
  buildGrid();
  computeGrid();
  initUI();
  initMap(baseStyle);
}).catch((err) => {
  const el = $('loader-status');
  el.textContent = 'Could not load crash data (' + err.message + '). Refresh to retry.';
  el.classList.add('err');
});

function setLoader(msg) {
  const el = $('loader-status');
  if (el && !el.classList.contains('err')) el.textContent = msg;
}

function loadStyle(base) {
  if (S.styleCache[base]) return Promise.resolve(S.styleCache[base]);
  return fetch(STYLE_URLS[base]).then((r) => {
    if (!r.ok) throw new Error('style ' + r.status);
    return r.json();
  }).then((j) => {
    j.glyphs = GLYPHS;
    S.styleCache[base] = j;
    return j;
  });
}

function buildGrid() {
  const g = S.d.grid;
  const res = g.res;
  const nb = g.bx.length;
  const lonC = new Float64Array(nb);
  const latC = new Float64Array(nb);
  for (let i = 0; i < nb; i++) {
    lonC[i] = (g.bx[i] + 0.5) * res;
    latC[i] = (g.by[i] + 0.5) * res;
  }
  S.grid = {
    nb,
    lonC,
    latC,
    ci: Int32Array.from(g.ci),
    cy: Int32Array.from(g.cy),
    cw: Int32Array.from(g.cw),
    cn: Int32Array.from(g.cn),
  };
  S.gridW = new Float64Array(nb);
  S.gridN = new Float64Array(nb);
  S.d.grid = null;
}

function computeGrid() {
  const g = S.grid;
  const w = S.gridW;
  const n = S.gridN;
  w.fill(0);
  n.fill(0);
  const nc = g.ci.length;
  for (let i = 0; i < nc; i++) {
    const yi = g.cy[i];
    if (yi < S.yearLo || yi > S.yearHi) continue;
    w[g.ci[i]] += g.cw[i];
    n[g.ci[i]] += g.cn[i];
  }
  const feats = [];
  for (let b = 0; b < g.nb; b++) {
    if (!w[b]) continue;
    feats.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [g.lonC[b], g.latC[b]] },
      properties: { w: w[b] },
    });
  }
  S.gridFC = { type: 'FeatureCollection', features: feats };
  return S.gridFC;
}

function yearOn(yi) { return yi >= S.yearLo && yi <= S.yearHi; }

function packFeatures(pack) {
  const { lat, lon, f, y, r, c, si, roads } = pack;
  const n = lat.length;
  const feats = new Array(n);
  for (let i = 0; i < n; i++) {
    feats[i] = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon[i] / 1e5, lat[i] / 1e5] },
      properties: { f: f[i], y: y[i], s: si, c: c[i], rn: roads[r[i]] },
    };
  }
  return feats;
}

function ensurePack(fips) {
  let e = S.packs.get(fips);
  if (e) {
    S.packs.delete(fips);
    S.packs.set(fips, e);
    return e.p;
  }
  e = { p: null, pack: null };
  e.p = fetch(packUrl(fips)).then((r) => {
    if (!r.ok) throw new Error('pack ' + r.status);
    return r.json();
  }).then((j) => {
    j.feats = packFeatures(j);
    e.pack = j;
    return j;
  }).catch((err) => {
    if (S.packs.get(fips) === e) S.packs.delete(fips);
    throw err;
  });
  S.packs.set(fips, e);
  return e.p;
}

function loadedPack(fips) {
  const e = S.packs.get(fips);
  return e ? e.pack : null;
}

function keepFips() {
  const keep = new Set();
  if (S.pin) for (const fp of ringFips(S.pin)) keep.add(fp);
  if (S.dotsKey.startsWith('state:')) keep.add(S.d.stfips[Number(S.dotsKey.slice(6))]);
  return keep;
}

function roadFeatsFrom(pack, name) {
  if (pack.feats) {
    const out = [];
    for (const ft of pack.feats) {
      if (ft.properties.rn === name) out.push(ft);
    }
    return out;
  }
  const ri = pack.roads.indexOf(name);
  if (ri < 0) return [];
  const { lat, lon, f, y, r, c, si } = pack;
  const out = [];
  for (let i = 0; i < lat.length; i++) {
    if (r[i] !== ri) continue;
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon[i] / 1e5, lat[i] / 1e5] },
      properties: { f: f[i], y: y[i], s: si, c: c[i], rn: name },
    });
  }
  return out;
}

function fetchPackLean(fips) {
  const cached = loadedPack(fips);
  if (cached) return Promise.resolve(cached);
  return fetch(packUrl(fips)).then((r) => {
    if (!r.ok) throw new Error('pack ' + r.status);
    return r.json();
  });
}

function prunePacks() {
  const keep = keepFips();
  for (const [fips, e] of S.packs) {
    if (S.packs.size <= PACK_CACHE) break;
    if (keep.has(fips) || !e.pack) continue;
    S.packs.delete(fips);
  }
}

function buildStateShapes(geo) {
  if (!geo) return;
  const idx = new Map(S.d.states.map((n, i) => [n, i]));
  const shapes = [];
  for (const ft of geo.features) {
    const si = idx.get(ft.properties && ft.properties.name);
    if (si === undefined) continue;
    const polys = ft.geometry.type === 'Polygon'
      ? [ft.geometry.coordinates]
      : ft.geometry.coordinates;
    let minX = 180; let maxX = -180; let minY = 90; let maxY = -90;
    for (const poly of polys) {
      for (const [x, y] of poly[0]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    shapes.push({ si, polys, minX, maxX, minY, maxY });
  }
  S.stateShapes = shapes;
}

function ringHas(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; const yi = ring[i][1];
    const xj = ring[j][0]; const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function stateAt(lng, lat) {
  for (const sh of S.stateShapes) {
    if (lng < sh.minX || lng > sh.maxX || lat < sh.minY || lat > sh.maxY) continue;
    for (const poly of sh.polys) {
      if (!ringHas(poly[0], lng, lat)) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (ringHas(poly[h], lng, lat)) { inHole = true; break; }
      }
      if (!inHole) return sh.si;
    }
  }
  return -1;
}

function ringFips(pin) {
  const [[minX, minY], [maxX, maxY]] = ringBounds(pin);
  const out = [];
  for (const sh of S.stateShapes) {
    if (sh.maxX < minX || sh.minX > maxX || sh.maxY < minY || sh.minY > maxY) continue;
    out.push(S.d.stfips[sh.si]);
  }
  return out;
}

function pinKey() {
  const p = S.pin;
  return 'pin:' + p.lat.toFixed(5) + ',' + p.lng.toFixed(5) + ',' + p.mi;
}

function desiredDotsKey() {
  if (S.pin) return pinKey();
  const map = S.map;
  if (map.getZoom() >= PACK_ZOOM) {
    const c = map.getCenter();
    const si = stateAt(c.lng, c.lat);
    if (si >= 0) return 'state:' + si;
  }
  return 'none';
}

function setDots(feats, key) {
  S.modeFeats = feats;
  S.dotsKey = key;
  const src = S.map.getSource('dots');
  if (src) src.setData({ type: 'FeatureCollection', features: feats });
  prunePacks();
  refreshViewport();
}

function syncData() {
  if (!S.layersReady || S.roadSel) return;
  const key = desiredDotsKey();
  if (key === S.dotsKey) return;
  if (key === 'none') {
    setDots([], 'none');
    return;
  }
  if (key.indexOf('state:') === 0) {
    const si = Number(key.slice(6));
    ensurePack(S.d.stfips[si]).then((pk) => {
      if (S.roadSel || desiredDotsKey() !== key || S.dotsKey === key) return;
      setDots(pk.feats, key);
    }).catch(() => { });
    refreshViewport();
    return;
  }
  const fipsList = ringFips(S.pin);
  Promise.all(fipsList.map(ensurePack)).then((pks) => {
    if (S.roadSel || desiredDotsKey() !== key || S.dotsKey === key) return;
    let feats = [];
    for (const pk of pks) feats = feats.concat(pk.feats);
    setDots(feats, key);
  }).catch(() => { });
  refreshViewport();
}

function yearClauses() {
  if (S.yearLo === 0 && S.yearHi === S.d.meta.years.length - 1) return [];
  return [['>=', ['get', 'y'], S.yearLo], ['<=', ['get', 'y'], S.yearHi]];
}

function applyFilters() {
  if (!S.layersReady) return;
  const map = S.map;
  const yf = yearClauses();
  let pts = null;
  let out = ['boolean', false];
  if (S.pin && S.pinPoly) {
    const within = ['within', S.pinPoly];
    pts = ['all', ...yf, within];
    out = ['all', ...yf, ['!', within]];
  } else if (yf.length) {
    pts = ['all', ...yf];
  }
  if (map.getLayer('pts')) map.setFilter('pts', pts);
  if (map.getLayer('pts-out')) map.setFilter('pts-out', out);
}

function roadDisplay(on) {
  const map = S.map;
  if (!map.getLayer('pts')) return;
  if (map.getLayer('heat')) {
    map.setLayoutProperty('heat', 'visibility', on ? 'none' : 'visible');
  }
  if (on) {
    map.setLayerZoomRange('pts', 2, 24);
    map.setPaintProperty('pts', 'circle-opacity', 0.92);
    map.setPaintProperty('pts', 'circle-stroke-opacity', 1);
  } else {
    map.setLayerZoomRange('pts', 6.6, 24);
    map.setPaintProperty('pts', 'circle-opacity', PTS_OPACITY);
    map.setPaintProperty('pts', 'circle-stroke-opacity', PTS_STROKE_OPACITY);
  }
}

function ringPolygon(pin) {
  const mpdLon = MI_PER_DEG * Math.cos(pin.lat * Math.PI / 180);
  const coords = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    coords.push([
      pin.lng + (pin.mi * Math.cos(a)) / mpdLon,
      pin.lat + (pin.mi * Math.sin(a)) / MI_PER_DEG,
    ]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

function ringBounds(pin) {
  const dLat = pin.mi / MI_PER_DEG;
  const dLon = pin.mi / (MI_PER_DEG * Math.cos(pin.lat * Math.PI / 180));
  return [[pin.lng - dLon, pin.lat - dLat], [pin.lng + dLon, pin.lat + dLat]];
}

function makeInRing(pin) {
  const mpdLon = MI_PER_DEG * Math.cos(pin.lat * Math.PI / 180);
  const r2 = pin.mi * pin.mi;
  return (lng, lat) => {
    const dx = (lng - pin.lng) * mpdLon;
    const dy = (lat - pin.lat) * MI_PER_DEG;
    return dx * dx + dy * dy <= r2;
  };
}

function initMap(baseStyle) {
  const style = baseStyle || {
    version: 8,
    name: 'blackout',
    sources: {},
    glyphs: GLYPHS,
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0c' } }],
  };

  const hasHash = location.hash && location.hash.length >= 4;
  const pin0 = readPinFromURL() || (!hasHash ? readPinFromStorage() : null);

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: [-96.8, 38.5],
    zoom: 3.4,
    minZoom: 2,
    maxZoom: 17,
    hash: true,
    attributionControl: false,
    fadeDuration: 120,
  });
  S.map = map;

  if (!hasHash) {
    if (pin0) {
      map.fitBounds(ringBounds(pin0), { padding: 90, duration: 0 });
    } else {
      fitUS(0);
    }
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('error', (e) => console.warn('map:', e && e.error && e.error.message));

  map.once('style.load', () => {
    addLayers();
    initInteractions();
    S.layersReady = true;
    applyFilters();
    if (pin0) {
      applyPin(pin0, { fly: false });
    } else {
      syncData();
      refreshViewport();
    }
    map.once('idle', dismissLoader);
    setTimeout(dismissLoader, 9000);
  });

  map.on('moveend', () => {
    syncData();
    refreshViewport();
  });
}

function fitUS(duration) {
  S.map.fitBounds(US_BOUNDS, {
    padding: { top: 110, bottom: 40, left: 30, right: 30 },
    duration: duration == null ? 900 : duration,
  });
}

function addLayers() {
  const map = S.map;
  const T = THEMES[S.base];

  const styleLayers = map.getStyle().layers || [];
  const firstSymbol = styleLayers.find((l) => l.type === 'symbol');
  const under = firstSymbol ? firstSymbol.id : undefined;

  if (S.statesGeo && !map.getSource('states')) {
    map.addSource('states', { type: 'geojson', data: S.statesGeo });
    map.addLayer({
      id: 'state-lines',
      type: 'line',
      source: 'states',
      paint: {
        'line-color': T.stateLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.1],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 1, 8, 0],
      },
    }, under);
  }

  map.addSource('grid', { type: 'geojson', data: S.gridFC });

  map.addSource('dots', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: S.modeFeats },
  });

  map.addSource('pin-ring', {
    type: 'geojson',
    data: S.pinPoly
      ? { type: 'Feature', geometry: S.pinPoly, properties: {} }
      : { type: 'FeatureCollection', features: [] },
  });

  map.addSource('sel', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: S.selFeature ? [S.selFeature] : [] },
  });

  map.addLayer({
    id: 'ring-fill',
    type: 'fill',
    source: 'pin-ring',
    paint: { 'fill-color': 'rgba(255,90,31,0.045)' },
  }, under);
  map.addLayer({
    id: 'ring-line',
    type: 'line',
    source: 'pin-ring',
    paint: {
      'line-color': 'rgba(255,122,51,0.85)',
      'line-width': 1.6,
      'line-dasharray': [2.4, 1.8],
    },
  });

  map.addLayer({
    id: 'heat',
    type: 'heatmap',
    source: 'grid',
    maxzoom: 9,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'],
        1, 0.006, 10, 0.05, 100, 0.5, 1000, 5],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'],
        2, 0.22, 3, 0.36, 4, 0.7, 6, 1.0, 8, 1.4],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'],
        2, 4, 3, 8, 4, 17, 6, 26, 8, 36, 9, 44],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'],
        6.5, 0.95, 8.6, 0],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.1, 'rgba(58,5,5,0.5)',
        0.3, '#7a0e0e',
        0.55, '#c22815',
        0.78, '#ff5a1f',
        0.93, '#ffa542',
        1, '#ffe0a3'],
    },
  }, under);

  map.addLayer({
    id: 'pts-out',
    type: 'circle',
    source: 'dots',
    filter: ['boolean', false],
    minzoom: 6.8,
    paint: {
      'circle-color': '#7c2013',
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        7, ['+', 1.4, ['*', 0.9, ['get', 'f']]],
        11, ['+', 2.6, ['*', 1.2, ['get', 'f']]],
        15, ['+', 4, ['*', 1.6, ['get', 'f']]]],
      'circle-opacity': 0.28,
    },
  }, under);

  map.addLayer({
    id: 'pts',
    type: 'circle',
    source: 'dots',
    minzoom: 6.6,
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'f'],
        1, '#b3220f', 2, '#e0401a', 4, '#ff702a', 8, '#ffa542'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4, ['+', 1.2, ['*', 0.7, ['get', 'f']]],
        7, ['+', 1.8, ['*', 1.1, ['get', 'f']]],
        11, ['+', 3.2, ['*', 1.5, ['get', 'f']]],
        15, ['+', 5, ['*', 2, ['get', 'f']]]],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 11, 1.4],
      'circle-stroke-color': T.ptStroke,
      'circle-opacity': PTS_OPACITY,
      'circle-stroke-opacity': PTS_STROKE_OPACITY,
    },
  }, under);

  map.addLayer({
    id: 'sel-ring',
    type: 'circle',
    source: 'sel',
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 9, 12, 13, 16, 18],
      'circle-stroke-width': 2.2,
      'circle-stroke-color': '#ffc46b',
    },
  });

}

function initInteractions() {
  const map = S.map;

  map.on('click', (e) => {
    if (!S.layersReady || !map.getLayer('pts')) return;
    const fs = map.queryRenderedFeatures(e.point, { layers: ['pts'] });
    if (fs.length) {
      openDetail(fs[0].properties, fs[0].geometry.coordinates);
      return;
    }
    if (map.getZoom() < STATE_ZOOM && !S.roadSel && !S.pin) {
      map.easeTo({ center: e.lngLat, zoom: 6.4, duration: 900 });
    }
  });

  map.on('mouseenter', 'pts', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'pts', () => { map.getCanvas().style.cursor = ''; });
}

function refreshViewport() {
  if (!S.layersReady) return;
  const map = S.map;
  const z = map.getZoom();
  const b = map.getBounds();
  const w = b.getWest(); const e = b.getEast();
  const so = b.getSouth(); const n = b.getNorth();
  const wrap = e < w;

  const inView = (la, lo) => {
    if (la < so || la > n) return false;
    return wrap ? !(lo < w && lo > e) : !(lo < w || lo > e);
  };
  const inRing = S.pin ? makeInRing(S.pin) : null;
  const test = (la, lo) => (inRing ? inRing(lo, la) : inView(la, lo));

  const centerSi = z >= STATE_ZOOM && !S.pin
    ? stateAt(map.getCenter().lng, map.getCenter().lat)
    : -1;

  let totD = 0; let totC = 0; let pending = false;

  if (S.roadSel || S.pin) {
    const want = S.roadSel ? 'road' : pinKey();
    if (S.dotsKey !== want) {
      pending = true;
    } else {
      for (const ft of S.modeFeats) {
        const p = ft.properties;
        if (!yearOn(p.y)) continue;
        const g = ft.geometry.coordinates;
        if (!test(g[1], g[0])) continue;
        totD += p.f;
        totC += 1;
      }
    }
  } else if (centerSi >= 0) {
    const pk = loadedPack(S.d.stfips[centerSi]);
    if (!pk) {
      pending = true;
    } else {
      const { lat, lon, f, y } = pk;
      for (let i = 0; i < lat.length; i++) {
        if (!yearOn(y[i])) continue;
        if (!inView(lat[i] / 1e5, lon[i] / 1e5)) continue;
        totD += f[i];
        totC += 1;
      }
    }
  } else {
    const g = S.grid;
    for (let i = 0; i < g.nb; i++) {
      if (!S.gridN[i]) continue;
      if (!inView(g.latC[i], g.lonC[i])) continue;
      totD += S.gridW[i];
      totC += S.gridN[i];
    }
  }

  $('stat-d').textContent = pending ? '…' : fmt(totD);
  $('stat-c').textContent = pending ? '…' : fmt(totC);
  if (S.pin) {
    $('stats-kicker').textContent = 'WITHIN ' + S.pin.mi + ' MI · ' + (S.pin.name || 'PINNED SPOT').toUpperCase();
    $('stats-sub').textContent = pending
      ? 'pulling this area…'
      : DC + ' in the ring · drag the pin to move it';
  } else if (centerSi >= 0) {
    $('stats-kicker').textContent = S.d.states[centerSi].toUpperCase();
    $('stats-sub').textContent = pending
      ? 'pulling this state…'
      : DC + (z >= 9
        ? ' in view · tap a dot for the full record'
        : ' in view · keep zooming for single crashes');
  } else {
    $('stats-kicker').textContent = 'IN THIS VIEW';
    $('stats-sub').textContent = DC + ' · zoom into a state to narrow it down';
  }
}

function applyPin(pin, { fly = true } = {}) {
  S.pin = pin;
  S.pinPoly = ringPolygon(pin);
  const src = S.map.getSource('pin-ring');
  if (src) src.setData({ type: 'Feature', geometry: S.pinPoly, properties: {} });

  applyFilters();

  if (!S.marker) {
    const el = document.createElement('div');
    el.className = 'pin';
    S.marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([pin.lng, pin.lat])
      .addTo(S.map);
    S.marker.on('dragend', () => {
      const ll = S.marker.getLngLat();
      applyPin({ ...S.pin, lng: ll.lng, lat: ll.lat, name: 'Dropped pin' }, { fly: false });
      reverseName(ll.lng, ll.lat);
    });
  } else {
    S.marker.setLngLat([pin.lng, pin.lat]);
  }

  $('stats').classList.add('pinned');
  $('pin-clear').hidden = false;
  $('radius-row').hidden = false;
  for (const chip of document.querySelectorAll('.rchip')) {
    chip.classList.toggle('on', Number(chip.dataset.mi) === pin.mi);
  }
  $('locate-btn').classList.toggle('live', pin.name === 'Your location');

  writePinToURL(pin);
  try { localStorage.setItem(LS_PIN, JSON.stringify(pin)); } catch (e) { }

  if (fly) {
    S.map.fitBounds(ringBounds(pin), { padding: 90, maxZoom: 15, duration: 900 });
  }
  if (S.roadSel) {
    updateRoadBanner(false);
  } else {
    syncData();
  }
  refreshViewport();
}

function clearPin() {
  if (!S.pin) return;
  S.pin = null;
  S.pinPoly = null;
  if (S.marker) { S.marker.remove(); S.marker = null; }
  const src = S.map.getSource('pin-ring');
  if (src) src.setData({ type: 'FeatureCollection', features: [] });
  applyFilters();
  $('stats').classList.remove('pinned');
  $('pin-clear').hidden = true;
  $('radius-row').hidden = true;
  $('locate-btn').classList.remove('live');
  writePinToURL(null);
  try { localStorage.removeItem(LS_PIN); } catch (e) { }
  if (S.roadSel) {
    updateRoadBanner(true);
  } else {
    syncData();
  }
  refreshViewport();
}

function reverseName(lng, lat) {
  fetch(GEO_BASE + '/reverse?lon=' + lng.toFixed(5) + '&lat=' + lat.toFixed(5) + '&lang=en')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const p = j && j.features && j.features[0] && j.features[0].properties;
      if (!p || !S.pin) return;
      const name = placeLabel(p, true);
      if (name) {
        S.pin.name = name;
        writePinToURL(S.pin);
        try { localStorage.setItem(LS_PIN, JSON.stringify(S.pin)); } catch (e) { }
        refreshViewport();
      }
    })
    .catch(() => { });
}

function readPinFromURL() {
  const p = QS.get('p');
  if (!p) return null;
  const m = p.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  if (!(lat >= 15 && lat <= 72) || !(lng >= -180 && lng <= 180)) return null;
  const mi = RADII.includes(Number(QS.get('r'))) ? Number(QS.get('r')) : DEFAULT_RADIUS;
  const name = (QS.get('n') || '').slice(0, 60) || 'Pinned spot';
  return { lat, lng, mi, name };
}

function readPinFromStorage() {
  try {
    const pin = JSON.parse(localStorage.getItem(LS_PIN) || 'null');
    if (pin && typeof pin.lat === 'number' && typeof pin.lng === 'number'
      && RADII.includes(pin.mi)) return pin;
  } catch (e) { }
  return null;
}

function writePinToURL(pin) {
  const qs = new URLSearchParams(location.search);
  if (pin) {
    qs.set('p', pin.lat.toFixed(5) + ',' + pin.lng.toFixed(5));
    qs.set('r', String(pin.mi));
    qs.set('n', (pin.name || '').slice(0, 60));
  } else {
    qs.delete('p'); qs.delete('r'); qs.delete('n');
  }
  const q = qs.toString();
  history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
}

function locateMe() {
  if (!navigator.geolocation) {
    toast('This browser has no location support.');
    return;
  }
  const btn = $('locate-btn');
  btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove('busy');
      const { latitude, longitude } = pos.coords;
      if (!(latitude >= 15 && latitude <= 72 && longitude >= -180 && longitude <= -60)
        && !(longitude >= 165)) {
        toast('You seem to be outside FARS coverage (US roads only) — pinning anyway.');
      }
      applyPin({
        lng: longitude, lat: latitude,
        mi: (S.pin && S.pin.mi) || DEFAULT_RADIUS,
        name: 'Your location',
      });
      reverseName(longitude, latitude);
    },
    () => {
      btn.classList.remove('busy');
      toast('Could not get your location — check permissions and try again.');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
  );
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

function ensureRoadsIdx() {
  if (S.roadsIdx) return Promise.resolve(S.roadsIdx);
  if (S.roadsLoading) return S.roadsLoading;
  S.roadsLoading = fetch(ROADS_URL).then((r) => {
    if (!r.ok) throw new Error('roads ' + r.status);
    return r.json();
  }).then((j) => {
    j.U = j.roads.map((nm) => nm.toUpperCase());
    S.roadsIdx = j;
    return j;
  }).catch((err) => {
    S.roadsLoading = null;
    throw err;
  });
  return S.roadsLoading;
}

function selectRoad(i) {
  const R = S.roadsIdx;
  if (!R) return;
  const name = R.roads[i];
  S.roadSel = { i, name };
  $('rb-name').textContent = name;
  $('rb-nums').innerHTML = '…';
  $('rb-sub').textContent = 'pulling this road…';
  $('road-banner').hidden = false;

  const fipsList = R.st[i].map((si) => S.d.stfips[si]);
  Promise.all(fipsList.map(fetchPackLean)).then((pks) => {
    if (!S.roadSel || S.roadSel.i !== i) return;
    let feats = [];
    for (const pk of pks) feats = feats.concat(roadFeatsFrom(pk, name));
    setDots(feats, 'road');
    roadDisplay(true);
    applyFilters();
    updateRoadBanner(true);
  }).catch(() => {
    if (!S.roadSel || S.roadSel.i !== i) return;
    $('rb-sub').textContent = 'could not load this road — check the connection';
  });
}

function updateRoadBanner(refit) {
  if (!S.roadSel || S.dotsKey !== 'road') return;
  const inRing = S.pin ? makeInRing(S.pin) : null;
  let d = 0; let c = 0; let minX = 180; let maxX = -180; let minY = 90; let maxY = -90;
  const statesSeen = new Set();
  for (const ft of S.modeFeats) {
    const p = ft.properties;
    if (!yearOn(p.y)) continue;
    const [x, yy] = ft.geometry.coordinates;
    if (inRing && !inRing(x, yy)) continue;
    d += p.f;
    c += 1;
    statesSeen.add(p.s);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (yy < minY) minY = yy;
    if (yy > maxY) maxY = yy;
  }

  $('rb-name').textContent = S.roadSel.name;
  $('rb-nums').innerHTML = fmt(d) + '<i>' + BS + '</i><em>' + fmt(c) + '</em>';
  $('rb-sub').textContent = S.pin
    ? 'within ' + S.pin.mi + ' mi'
    : (statesSeen.size > 1
      ? 'in ' + statesSeen.size + ' states'
      : (statesSeen.size ? S.d.states[[...statesSeen][0]] : 'no crashes in this year range'));

  if (refit) {
    if (S.pin) {
      S.map.fitBounds(ringBounds(S.pin), { padding: 90, maxZoom: 15, duration: 700 });
    } else if (c > 0) {
      S.map.fitBounds([[minX, minY], [maxX, maxY]], {
        padding: { top: 130, bottom: 90, left: 60, right: 60 },
        maxZoom: 12,
        duration: 900,
      });
    }
  }
  refreshViewport();
}

function clearRoad() {
  if (!S.roadSel) return;
  S.roadSel = null;
  $('road-banner').hidden = true;
  roadDisplay(false);
  applyFilters();
  S.dotsKey = 'cleared';
  syncData();
  if (S.dotsKey === 'cleared') setDots([], 'none');
  refreshViewport();
}

function getShard(year, fips) {
  const key = year + '_' + fips;
  const hit = S.shardCache.get(key);
  if (hit) return Promise.resolve(hit);
  return fetch('data/d/' + key + '.json').then((r) => {
    if (!r.ok) throw new Error('detail ' + r.status);
    return r.json();
  }).then((j) => {
    if (S.shardCache.size >= 12) {
      S.shardCache.delete(S.shardCache.keys().next().value);
    }
    S.shardCache.set(key, j);
    return j;
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function selectDot(props, lngLat) {
  S.selFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: lngLat },
    properties: {},
  };
  const src = S.map.getSource('sel');
  if (src) src.setData({ type: 'FeatureCollection', features: [S.selFeature] });
}

function clearSel() {
  S.selFeature = null;
  const src = S.map.getSource('sel');
  if (src) src.setData({ type: 'FeatureCollection', features: [] });
}

function closePanel() {
  $('panel').hidden = true;
  clearSel();
}

function hourText(hr, min) {
  if (hr < 0) return null;
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  const mm = min >= 0 ? ':' + String(min).padStart(2, '0') : '';
  return h12 + mm + (hr < 12 ? ' AM' : ' PM');
}

function openDetail(props, lngLat) {
  selectDot(props, lngLat);
  const year = S.d.meta.years[props.y];
  const fips = S.d.stfips[props.s];
  const roadName = props.rn || 'Unnamed road';
  const panel = $('panel');
  panel.hidden = false;
  $('panel-body').innerHTML = '<div class="p-kicker">' + year + ' · ' + esc(S.d.states[props.s]).toUpperCase() + '</div>'
    + '<h2 class="p-road">' + esc(roadName) + '</h2>'
    + '<div class="p-loading">pulling the case file…</div>';

  getShard(year, fips).then((shard) => {
    const rec = shard.c[String(props.c)];
    if (!rec) throw new Error('missing');
    renderPanel(props, rec, shard.s, year, roadName);
  }).catch(() => {
    $('panel-body').innerHTML = '<div class="p-kicker">' + year + '</div>'
      + '<h2 class="p-road">' + esc(roadName) + '</h2>'
      + '<div class="p-loading">Could not load the full record — check the connection and tap the dot again.</div>';
  });
}

function renderPanel(props, rec, strings, year, roadName) {
  const st = (i) => (i >= 0 && i < strings.length ? strings[i] : null);
  const a = rec[0]; const vehs = rec[1]; const pers = rec[2];

  const parts = [];
  const dateBits = [];
  if (a[A.DOW] > 0) dateBits.push(DOW[a[A.DOW]]);
  if (a[A.MO] > 0) dateBits.push(MONTHS[a[A.MO]] + (a[A.DY] > 0 ? ' ' + a[A.DY] : '') + ', ' + year);
  else dateBits.push(String(year));
  const t = hourText(a[A.HR], a[A.MIN]);
  if (t) dateBits.push(t);
  parts.push('<div class="p-kicker">' + esc(dateBits.join(' · ')).toUpperCase() + '</div>');

  parts.push('<h2 class="p-road">' + esc(roadName) + '</h2>');
  const tway2 = st(a[A.TWAY2]);
  if (tway2) parts.push('<div class="p-x">at ' + esc(tway2) + '</div>');

  const f = a[A.FATALS];
  parts.push('<div class="p-toll"><b>' + f + '</b> killed'
    + '<span> · ' + a[A.VEH] + (a[A.VEH] === 1 ? ' vehicle' : ' vehicles')
    + ' · ' + a[A.PEOPLE] + (a[A.PEOPLE] === 1 ? ' person' : ' people') + ' involved</span></div>');

  const whereBits = [];
  const city = st(a[A.CITY]);
  const county = st(a[A.COUNTY]);
  if (city) whereBits.push(esc(city));
  if (county) whereBits.push(esc(county) + ' County');
  whereBits.push(esc(S.d.states[props.s]));
  parts.push('<div class="p-where">' + whereBits.join(' · ') + '</div>');

  const kv = [];
  const add = (k, v) => { if (v) kv.push('<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>'); };
  add('Weather', st(a[A.WEATHER]));
  add('Light', st(a[A.LGT]));
  const rural = st(a[A.RURURB]);
  const func = st(a[A.FUNC]);
  add('Road', rural && func ? rural + ' · ' + func : (rural || func));
  add('Route type', st(a[A.ROUTE]));
  add('First harmful event', st(a[A.HARM]));
  add('Collision manner', st(a[A.MANCOLL]));
  add('Junction', st(a[A.RELJCT]));
  const typint = st(a[A.TYPINT]);
  if (typint && !/not an intersection/i.test(typint)) add('Intersection', typint);
  add('Position', st(a[A.RELROAD]));
  add('Work zone', st(a[A.WRK]));
  if (a[A.SCHBUS]) add('School bus', 'School bus involved');
  if (a[A.RAIL]) add('Rail', 'At a rail crossing');
  if (a[A.DRUNK] > 0) add('Alcohol', a[A.DRUNK] + (a[A.DRUNK] === 1 ? ' drinking driver' : ' drinking drivers'));
  if (vehs.some((v) => v[V.HITRUN])) add('Hit & run', 'Yes');
  if (kv.length) {
    parts.push('<h3 class="p-h">Conditions</h3><dl class="p-kv">' + kv.join('') + '</dl>');
  }

  if (vehs.length) {
    parts.push('<h3 class="p-h">Vehicles</h3>');
    vehs.forEach((v, vi) => {
      const my = v[V.MODYEAR];
      const mm = st(v[V.MAKMOD]);
      const title = (my > 0 ? my + ' ' : '') + (mm || 'Vehicle ' + (vi + 1));
      const body = st(v[V.BODY]);
      const chips = [];
      if (v[V.DEATHS] > 0) chips.push('<span class="vc bad">' + v[V.DEATHS] + (v[V.DEATHS] === 1 ? ' death' : ' deaths') + '</span>');
      if (v[V.DRINK]) chips.push('<span class="vc bad">Drinking driver</span>');
      if (v[V.HITRUN]) chips.push('<span class="vc bad">Hit &amp; run</span>');
      const roll = st(v[V.ROLL]);
      if (roll) chips.push('<span class="vc">' + esc(roll) + '</span>');
      if (v[V.FIRE]) chips.push('<span class="vc bad">Fire</span>');
      const spdrel = st(v[V.SPDREL]);
      if (spdrel) chips.push('<span class="vc bad">' + esc(spdrel) + '</span>');
      const sp = [];
      if (v[V.TRAVSP] === 997) sp.push('stopped');
      else if (v[V.TRAVSP] >= 0) sp.push('~' + v[V.TRAVSP] + ' mph');
      if (v[V.SPDLIM] > 0) sp.push('limit ' + v[V.SPDLIM]);
      if (sp.length) chips.push('<span class="vc">' + sp.join(' · ') + '</span>');
      parts.push('<div class="p-veh"><div class="pv-title">' + esc(title) + '</div>'
        + (body ? '<div class="pv-sub">' + esc(body) + '</div>' : '')
        + (chips.length ? '<div class="pv-chips">' + chips.join('') + '</div>' : '')
        + '</div>');
    });
  }

  if (pers.length) {
    parts.push('<h3 class="p-h">People</h3>');
    const groups = new Map();
    for (const p of pers) {
      const k = p[P.VEHNO];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const keys = [...groups.keys()].sort((x, z) => (x === 0 ? 1 : z === 0 ? -1 : x - z));
    const many = keys.length > 1;
    for (const k of keys) {
      if (many) {
        parts.push('<div class="pp-head">' + (k === 0 ? 'NOT IN A VEHICLE' : 'VEHICLE ' + k) + '</div>');
      }
      for (const p of groups.get(k)) {
        const who = [];
        who.push(st(p[P.PTYPE]) || 'Person');
        const agesex = (p[P.AGE] >= 0 ? p[P.AGE] : '') + (st(p[P.SEX]) || '');
        if (agesex) who.push(agesex);
        const tags = [];
        const inj = st(p[P.INJ]);
        const fatal = inj === 'Killed';
        if (inj) tags.push(inj);
        const doa = st(p[P.DOA]);
        if (doa) tags.push(doa.toLowerCase());
        let rest = st(p[P.REST]);
        if (rest !== null && rest !== undefined) {
          if (rest in REST_SHORT) rest = REST_SHORT[rest];
          if (rest) tags.push(rest.toLowerCase());
        }
        const ej = st(p[P.EJECT]);
        if (ej) tags.push(ej.toLowerCase());
        parts.push('<div class="pp-row' + (fatal ? ' fatal' : '') + '">'
          + '<span class="pp-who">' + esc(who.join(' · ')) + '</span>'
          + '<span class="pp-tags">' + esc(tags.join(' · ')) + '</span></div>');
      }
    }
  }

  parts.push('<div class="p-foot">NHTSA FARS ' + year + ' · case ' + props.c + '</div>');
  $('panel-body').innerHTML = parts.join('');
  $('panel-body').scrollTop = 0;
}

function setBase(base) {
  if (base === S.base) return;
  loadStyle(base).then((style) => {
    S.base = base;
    try { localStorage.setItem(LS_BASE, base); } catch (e) { }
    $('base-btn').classList.toggle('lit', base === 'light');
    S.layersReady = false;
    S.map.setStyle(style, { diff: false });
    S.map.once('style.load', () => {
      addLayers();
      S.layersReady = true;
      applyFilters();
      if (S.roadSel && S.dotsKey === 'road') roadDisplay(true);
      refreshViewport();
    });
  }).catch(() => toast('Could not load that basemap — staying on this one.'));
}

function initYearSlider() {
  const meta = S.d.meta;
  const years = meta.years;
  const n = years.length;
  const hist = $('yr-hist');
  const deaths = years.map((yr) => meta.perYear[String(yr)].deaths);
  const maxD = Math.max(...deaths);
  const bars = [];
  years.forEach((yr, i) => {
    const bar = document.createElement('div');
    bar.className = 'yb on';
    bar.style.height = Math.max(14, Math.round((deaths[i] / maxD) * 100)) + '%';
    bar.title = yr + ' — ' + fmt(deaths[i]) + ' deaths';
    hist.appendChild(bar);
    bars.push(bar);
  });

  const lo = $('yr-lo');
  const hi = $('yr-hi');
  lo.max = hi.max = String(n - 1);
  lo.value = '0';
  hi.value = String(n - 1);

  const label = $('yr-label');
  const paint = () => {
    let a = Number(lo.value); let b = Number(hi.value);
    if (a > b) { const t = a; a = b; b = t; }
    bars.forEach((bar, i) => bar.classList.toggle('on', i >= a && i <= b));
    label.textContent = a === b ? String(years[a]) : years[a] + '–' + years[b];
    return [a, b];
  };

  let applyTimer = 0;
  const apply = () => {
    const [a, b] = paint();
    if (a === S.yearLo && b === S.yearHi) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      S.yearLo = a;
      S.yearHi = b;
      computeGrid();
      if (S.layersReady) {
        const src = S.map.getSource('grid');
        if (src) src.setData(S.gridFC);
        applyFilters();
        updateRoadBanner(true);
        refreshViewport();
      }
    }, 250);
  };

  lo.addEventListener('input', paint);
  hi.addEventListener('input', paint);
  lo.addEventListener('change', apply);
  hi.addEventListener('change', apply);
  paint();
}

function initUI() {
  const meta = S.d.meta;
  const y0 = meta.years[0];
  const y1 = meta.years[meta.years.length - 1];

  $('tag-years').textContent = y0 + '–' + y1;
  initYearSlider();

  $('m-deaths').textContent = fmt(meta.deaths);
  $('m-crashes').textContent = fmt(meta.crashes);
  $('m-years').textContent = y0 + ' through ' + y1;
  $('m-dropped').textContent = fmt(meta.dropped);
  $('m-built').textContent = meta.generated;
  $('about-btn').addEventListener('click', () => { $('modal').hidden = false; });
  $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('panel').hidden) { closePanel(); return; }
      $('modal').hidden = true;
      hideSuggest();
    }
  });

  $('rb-clear').addEventListener('click', clearRoad);
  $('pin-clear').addEventListener('click', clearPin);
  $('locate-btn').addEventListener('click', locateMe);
  $('panel-close').addEventListener('click', closePanel);
  $('base-btn').addEventListener('click', () => setBase(S.base === 'dark' ? 'light' : 'dark'));
  $('base-btn').classList.toggle('lit', S.base === 'light');
  for (const chip of document.querySelectorAll('.rchip')) {
    chip.addEventListener('click', () => {
      if (S.pin) applyPin({ ...S.pin, mi: Number(chip.dataset.mi) });
    });
  }
  $('brand').addEventListener('click', () => {
    clearRoad();
    closePanel();
    fitUS();
  });

  const input = $('search');
  let debounce = 0;
  input.addEventListener('input', () => {
    ensureRoadsIdx().catch(() => { });
    clearTimeout(debounce);
    debounce = setTimeout(() => showSuggest(input.value), 160);
  });
  input.addEventListener('focus', () => {
    ensureRoadsIdx().catch(() => { });
    if (input.value) showSuggest(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = $('suggest').querySelector('button[data-ri], button[data-place]');
      if (first) first.click();
    }
  });
  document.addEventListener('click', (e) => {
    if (!$('search-wrap').contains(e.target)) hideSuggest();
  });

  $('stat-d').textContent = fmt(meta.deaths);
  $('stat-c').textContent = fmt(meta.crashes);
}

let placeAbort = null;
let searchSeq = 0;

function roadHits(q) {
  const R = S.roadsIdx;
  if (!R) return [];
  const hits = [];
  for (let i = 0; i < R.U.length; i++) {
    if (R.U[i].includes(q)) {
      hits.push([i, R.d[i], R.c[i]]);
      if (hits.length >= 6) break;
    }
  }
  return hits;
}

function placeLabel(p, short = false) {
  const bits = [];
  if (p.name) bits.push(p.name);
  if (p.city && p.city !== p.name) bits.push(p.city);
  else if (p.county && !p.city && p.county !== p.name) bits.push(p.county);
  if (!short && p.state) bits.push(p.state);
  return bits.slice(0, short ? 2 : 3).join(', ');
}

function showSuggest(raw) {
  const q = raw.trim().toUpperCase();
  if (q.length < 2) { hideSuggest(); return; }
  const seq = ++searchSeq;
  if (!S.roadsIdx && S.roadsLoading) {
    S.roadsLoading.then(() => {
      if (seq === searchSeq && $('search').value === raw) showSuggest(raw);
    }).catch(() => { });
  }
  const roads = roadHits(q);
  const roadsFirst = /^(I|US|SR|CR|SH|ST|FM|RT|CO|HWY)[-\s]?\d/i.test(raw.trim());
  renderSuggest(roads, [], roadsFirst, q.length >= 3 ? 'searching places…' : null);

  if (q.length < 3) return;
  if (placeAbort) placeAbort.abort();
  placeAbort = new AbortController();
  const c = S.map ? S.map.getCenter() : { lng: -96.8, lat: 38.5 };
  fetch(GEO_BASE + '/api/?q=' + encodeURIComponent(raw.trim()) + '&limit=5&lang=en'
    + '&lat=' + c.lat.toFixed(3) + '&lon=' + c.lng.toFixed(3),
  { signal: placeAbort.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (seq !== searchSeq) return;
      const places = [];
      const seen = new Set();
      for (const ft of (j && j.features) || []) {
        const p = ft.properties || {};
        if (p.countrycode && !['US', 'PR', 'VI', 'GU'].includes(p.countrycode)) continue;
        const label = placeLabel(p);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        places.push({ label, short: placeLabel(p, true), lng: ft.geometry.coordinates[0], lat: ft.geometry.coordinates[1] });
        if (places.length >= 5) break;
      }
      renderSuggest(roadHits(q), places, roadsFirst, null);
    })
    .catch(() => {
      if (seq === searchSeq) renderSuggest(roadHits(q), [], roadsFirst, null);
    });
}

function renderSuggest(roads, places, roadsFirst, pendingNote) {
  const box = $('suggest');
  box.innerHTML = '';

  const addHead = (t) => {
    const h = document.createElement('div');
    h.className = 's-head';
    h.textContent = t;
    box.appendChild(h);
  };

  const addPlaces = () => {
    if (!places.length) return;
    addHead('PLACES');
    for (const pl of places) {
      const btn = document.createElement('button');
      btn.className = 's-place';
      btn.dataset.place = '1';
      btn.innerHTML = '<span class="s-name">' + esc(pl.label) + '</span><span class="s-nums">go</span>';
      btn.addEventListener('click', () => {
        hideSuggest();
        $('search').value = '';
        $('search').blur();
        clearRoad();
        applyPin({ lng: pl.lng, lat: pl.lat, mi: (S.pin && S.pin.mi) || DEFAULT_RADIUS, name: pl.short });
      });
      box.appendChild(btn);
    }
  };

  const addRoads = () => {
    if (!roads.length) return;
    addHead('ROADS');
    for (const [ri, d, c] of roads) {
      const btn = document.createElement('button');
      btn.dataset.ri = ri;
      btn.innerHTML = '<span class="s-name">' + esc(S.roadsIdx.roads[ri]) + '</span>' +
        '<span class="s-nums">' + fmt(d) + '<i>' + BS + '</i><em>' + fmt(c) + '</em></span>';
      btn.addEventListener('click', () => {
        hideSuggest();
        $('search').value = '';
        $('search').blur();
        selectRoad(ri);
      });
      box.appendChild(btn);
    }
  };

  if (roadsFirst) { addRoads(); addPlaces(); } else { addPlaces(); addRoads(); }

  if (!roads.length && !places.length) {
    box.innerHTML = '<div class="s-none">' + (pendingNote || 'nothing matches that') + '</div>';
  } else if (pendingNote && !places.length) {
    const n = document.createElement('div');
    n.className = 's-none';
    n.textContent = pendingNote;
    box.appendChild(n);
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
