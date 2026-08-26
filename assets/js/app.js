'use strict';

const QS = new URLSearchParams(location.search);

const DEFAULTS = {
  basemap: { start: 'dark', rememberChoice: true,
    darkStyle: 'assets/vendor/dark-matter-style.json',
    lightStyle: 'assets/vendor/liberty-style.json' },
  camera: { startCenter: [-96.8, 38.5], startZoom: 3.4, minZoom: 2, maxZoom: 17,
    homeBounds: [[-125.6, 23.6], [-66.0, 49.8]], fadeDuration: 120, tapToDiveZoom: 8.4 },
  dots: { appearAtZoom: 8, tileDetailZoom: 9,
    colorByDeaths: { 1: '#b3220f', 2: '#e0401a', 4: '#ff702a', 8: '#ffa542' },
    sizeByZoom: { 8: { base: 1.1, perDeath: 0.5 }, 11: { base: 3.2, perDeath: 1.5 },
      15: { base: 5, perDeath: 2 } },
    fadeInFrom: 8, fadeInTo: 8.6, minOpacity: 0.35, maxOpacity: 0.92,
    outlineWidthByZoom: { 8.6: 0.4, 11: 1.4 },
    outlineColor: { dark: 'rgba(8,8,10,0.8)', light: 'rgba(255,255,255,0.9)' },
    outsideRingColor: '#7c2013', outsideRingOpacity: 0.22 },
  selection: { ringColor: '#ffc46b', ringWidth: 2.2,
    ringSizeByZoom: { 7: 9, 12: 13, 16: 18 } },
  stateLines: { color: { dark: 'rgba(233,228,221,0.16)', light: 'rgba(40,40,55,0.3)' },
    widthByZoom: { 3: 0.6, 7: 1.1 }, fadeOutFrom: 6, fadeOutTo: 8 },
  pin: { radiiMiles: [1, 3, 5, 10], defaultMiles: 5,
    fillColor: 'rgba(255,90,31,0.045)', lineColor: 'rgba(255,122,51,0.85)',
    lineWidth: 1.6, lineDash: [2.4, 1.8] },
  lens: { enabled: true, hideOnTouchDevices: true, radiiMiles: [5, 10, 25, 50],
    defaultMiles: 25, followDelayMs: 90 },
  route: { corridorHalfWidthMiles: 0.25, casingColor: 'rgba(8,8,10,0.85)', casingWidth: 7,
    lineWidth: 3.5, baseColor: '#5a626e',
    tollColors: { none: '#4a5058', low: '#7a1c10', medium: '#c22815',
      high: '#ff5a1f', worst: '#ffb46b' }, hotspotCount: 5 },
  services: { geocoder: 'https://photon.komoot.io',
    router: 'https://router.project-osrm.org' },
  performance: { statePacksCached: { desktop: 6, phone: 3 }, caseFilesCached: 12,
    statsRefreshDelayMs: 120, yearSliderDelayMs: 250 },
  interface: { toastSeconds: 3.6, loaderTimeoutSeconds: 9, searchDelayMs: 160 },
};

const SET = (() => {
  const user = window.H2H_SETTINGS;
  const merge = (base, over) => {
    if (!over || typeof over !== 'object' || Array.isArray(over)) {
      return over === undefined ? base : over;
    }
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = merge(base ? base[k] : undefined, over[k]);
    return out;
  };
  try { return merge(DEFAULTS, user); } catch (e) { return DEFAULTS; }
})();

const rampPairs = (obj) => Object.keys(obj)
  .map(Number).sort((a, b) => a - b)
  .reduce((acc, k) => acc.concat([k, obj[k]]), []);

const DATA_V = '?v=6';
const BOOT_URL = 'data/boot.json' + DATA_V;
const ROADS_URL = 'data/roads.json' + DATA_V;
const STATES_URL = 'data/us-states.json?v=1';
const packUrl = (fips) => 'data/s/' + fips + '.json' + DATA_V;
const TILE_URL = new URL('data/t/', location.href).href + '{z}/{x}/{y}.pbf' + DATA_V;
const TILE_MIN = SET.dots.appearAtZoom;
const TILE_MAX = SET.dots.tileDetailZoom;
const STYLE_URLS = {
  dark: QS.get('style') || SET.basemap.darkStyle,
  light: QS.get('styleLight') || SET.basemap.lightStyle,
};
const GLYPHS = new URL('assets/glyphs/', location.href).href + '{fontstack}/{range}.pbf';
const GEO_BASE = QS.get('geo') || SET.services.geocoder;
const OSRM_BASE = QS.get('osrm') || SET.services.router;
const ROUTE_BUF_MI = SET.route.corridorHalfWidthMiles;
const ROUTE_CELL = 0.08;
const US_BOUNDS = SET.camera.homeBounds;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const PACK_CACHE = IS_TOUCH
  ? SET.performance.statePacksCached.phone
  : SET.performance.statePacksCached.desktop;
const BS = String.fromCharCode(92);
const DC = 'deaths' + BS + 'crashes';
const MI_PER_DEG = 69.172;
const RADII = SET.pin.radiiMiles;
const DEFAULT_RADIUS = SET.pin.defaultMiles;
const LS_PIN = 'h2h.pin';
const LS_BASE = 'h2h.base';
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PTS_OPACITY = ['interpolate', ['linear'], ['zoom'],
  SET.dots.fadeInFrom, SET.dots.minOpacity, SET.dots.fadeInTo, SET.dots.maxOpacity];
const PTS_STROKE_OPACITY = ['interpolate', ['linear'], ['zoom'],
  SET.dots.fadeInFrom, 0, SET.dots.fadeInTo + 0.6, 1];
const PTS_RADIUS = ['interpolate', ['linear'], ['zoom']].concat(
  Object.keys(SET.dots.sizeByZoom).map(Number).sort((a, b) => a - b)
    .reduce((acc, z) => acc.concat([z,
      ['+', SET.dots.sizeByZoom[z].base,
        ['*', SET.dots.sizeByZoom[z].perDeath, ['get', 'f']]]]), []));
const PTS_COLOR = ['interpolate', ['linear'], ['get', 'f']]
  .concat(rampPairs(SET.dots.colorByDeaths));
const PTS_STROKE_W = ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.dots.outlineWidthByZoom));
const SEL_RADIUS = ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.selection.ringSizeByZoom));
const STATE_WIDTH = ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.stateLines.widthByZoom));
const FEAT_CHUNK = 12000;
const LENS_RADII = SET.lens.radiiMiles;
const LENS_DEFAULT = SET.lens.defaultMiles;
const LENS_MIN_ZOOM = TILE_MIN;

const THEMES = {
  dark: {
    stateLine: SET.stateLines.color.dark,
    ptStroke: SET.dots.outlineColor.dark,
  },
  light: {
    stateLine: SET.stateLines.color.light,
    ptStroke: SET.dots.outlineColor.light,
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
  lens: null,
  route: null,
  routeMarkers: [],
  map: null,
  layersReady: false,
  stateShapes: [],
  statesGeo: null,
  base: 'dark',
  styleCache: {},
  shardCache: new Map(),
  selFeature: null,
};

S.base = SET.basemap.start === 'light' ? 'light' : 'dark';
if (SET.basemap.rememberChoice) {
  try {
    const saved = localStorage.getItem(LS_BASE);
    if (saved === 'light' || saved === 'dark') S.base = saved;
  } catch (e) { }
}

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
}

function yearOn(yi) { return yi >= S.yearLo && yi <= S.yearHi; }

function packFeatures(pack) {
  const { lat, lon, f, y, r, c, si, roads } = pack;
  const n = lat.length;
  const feats = new Array(n);
  let i = 0;
  return new Promise((resolve) => {
    function slice() {
      const end = Math.min(i + FEAT_CHUNK, n);
      for (; i < end; i++) {
        feats[i] = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon[i] / 1e5, lat[i] / 1e5] },
          properties: { f: f[i], y: y[i], s: si, c: c[i], rn: roads[r[i]] },
        };
      }
      if (i < n) setTimeout(slice, 0);
      else resolve(feats);
    }
    slice();
  });
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
  }).then((j) => packFeatures(j).then((feats) => {
    j.feats = feats;
    e.pack = j;
    return j;
  })).catch((err) => {
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
  if (S.lens && S.lens.over && S.lens.lng != null) {
    for (const fp of ringFips(S.lens)) keep.add(fp);
  }
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

function ringFips(pin) {
  const [[minX, minY], [maxX, maxY]] = ringBounds(pin);
  const out = [];
  for (const sh of S.stateShapes) {
    if (sh.maxX < minX || sh.minX > maxX || sh.maxY < minY || sh.minY > maxY) continue;
    out.push(S.d.stfips[sh.si]);
  }
  return out;
}

function desiredDotsKey() {
  return S.roadSel ? 'road' : (S.route ? 'route' : 'none');
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
  if (!S.layersReady || S.roadSel || S.route) return;
  if (S.dotsKey !== 'none') setDots([], 'none');
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
  if (S.lens) {
    if (S.lens.over && S.lens.lng != null && map.getZoom() >= LENS_MIN_ZOOM) {
      pts = ['all', ...yf, ['within', ringPolygon(S.lens)]];
    } else {
      pts = ['boolean', false];
    }
  } else if (S.pin && S.pinPoly) {
    const within = ['within', S.pinPoly];
    pts = ['all', ...yf, within];
    out = ['all', ...yf, ['!', within]];
  } else if (yf.length) {
    pts = ['all', ...yf];
  }
  const mode = !!(S.roadSel || S.route);
  if (map.getLayer('pts')) {
    map.setFilter('pts', pts);
    map.setLayoutProperty('pts', 'visibility', mode ? 'none' : 'visible');
  }
  if (map.getLayer('pts-out')) {
    map.setFilter('pts-out', mode ? ['boolean', false] : out);
  }
  if (map.getLayer('mpts')) {
    map.setFilter('mpts', mode && yf.length ? ['all', ...yf] : (mode ? null : ['boolean', false]));
    map.setLayoutProperty('mpts', 'visibility', mode ? 'visible' : 'none');
  }
}

function roadDisplay() {
  applyFilters();
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
    center: SET.camera.startCenter,
    zoom: SET.camera.startZoom,
    minZoom: SET.camera.minZoom,
    maxZoom: SET.camera.maxZoom,
    hash: true,
    attributionControl: false,
    fadeDuration: SET.camera.fadeDuration,
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
    setTimeout(dismissLoader, SET.interface.loaderTimeoutSeconds * 1000);
  });

  map.on('moveend', () => {
    syncData();
    scheduleRefresh();
  });

  map.on('sourcedata', (e) => {
    if (e.sourceId === 'tiles' && e.isSourceLoaded) scheduleRefresh();
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
        'line-width': STATE_WIDTH,
        'line-opacity': ['interpolate', ['linear'], ['zoom'],
          SET.stateLines.fadeOutFrom, 1, SET.stateLines.fadeOutTo, 0],
      },
    }, under);
  }

  map.addSource('tiles', {
    type: 'vector',
    tiles: [TILE_URL],
    minzoom: TILE_MIN,
    maxzoom: TILE_MAX,
  });

  map.addSource('route', {
    type: 'geojson',
    lineMetrics: true,
    data: { type: 'FeatureCollection', features: [] },
  });

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
    paint: { 'fill-color': SET.pin.fillColor },
  }, under);
  map.addLayer({
    id: 'ring-line',
    type: 'line',
    source: 'pin-ring',
    paint: {
      'line-color': SET.pin.lineColor,
      'line-width': SET.pin.lineWidth,
      'line-dasharray': SET.pin.lineDash,
    },
  });

  map.addLayer({
    id: 'route-case',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': SET.route.casingColor, 'line-width': SET.route.casingWidth },
  }, under);
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': SET.route.baseColor, 'line-width': SET.route.lineWidth },
  }, under);
  if (S.route) {
    map.getSource('route').setData(S.route.lineFC);
    if (S.route.gradient) map.setPaintProperty('route-line', 'line-gradient', S.route.gradient);
  }

  map.addLayer({
    id: 'pts-out',
    type: 'circle',
    source: 'tiles',
    'source-layer': 'crashes',
    filter: ['boolean', false],
    minzoom: TILE_MIN,
    paint: {
      'circle-color': SET.dots.outsideRingColor,
      'circle-radius': PTS_RADIUS,
      'circle-opacity': SET.dots.outsideRingOpacity,
    },
  }, under);

  map.addLayer({
    id: 'pts',
    type: 'circle',
    source: 'tiles',
    'source-layer': 'crashes',
    minzoom: TILE_MIN,
    paint: {
      'circle-color': PTS_COLOR,
      'circle-radius': PTS_RADIUS,
      'circle-stroke-width': PTS_STROKE_W,
      'circle-stroke-color': T.ptStroke,
      'circle-opacity': PTS_OPACITY,
      'circle-stroke-opacity': PTS_STROKE_OPACITY,
    },
  }, under);

  map.addLayer({
    id: 'mpts',
    type: 'circle',
    source: 'dots',
    paint: {
      'circle-color': PTS_COLOR,
      'circle-radius': PTS_RADIUS,
      'circle-stroke-width': PTS_STROKE_W,
      'circle-stroke-color': T.ptStroke,
      'circle-opacity': SET.dots.maxOpacity,
    },
  }, under);

  map.addLayer({
    id: 'sel-ring',
    type: 'circle',
    source: 'sel',
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': SEL_RADIUS,
      'circle-stroke-width': SET.selection.ringWidth,
      'circle-stroke-color': SET.selection.ringColor,
    },
  });

}

function initInteractions() {
  const map = S.map;

  map.on('click', (e) => {
    if (!S.layersReady || !map.getLayer('pts')) return;
    const hit = ['pts', 'mpts'].filter((id) => map.getLayer(id)
      && map.getLayoutProperty(id, 'visibility') !== 'none');
    const fs = hit.length ? map.queryRenderedFeatures(e.point, { layers: hit }) : [];
    if (fs.length) {
      openDetail(fs[0].properties, fs[0].geometry.coordinates);
      return;
    }
    if (map.getZoom() < TILE_MIN && !S.roadSel && !S.pin && !S.lens && !S.route) {
      map.easeTo({ center: e.lngLat, zoom: SET.camera.tapToDiveZoom, duration: 900 });
    }
  });

  map.on('mousemove', (e) => {
    if (!S.lens) return;
    S.lens.lng = e.lngLat.lng;
    S.lens.lat = e.lngLat.lat;
    S.lens.over = true;
    lensTick();
  });
  map.on('mouseout', () => {
    if (!S.lens) return;
    S.lens.over = false;
    lensTick();
  });

  map.on('mouseenter', 'pts', () => { if (!S.lens) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'pts', () => { if (!S.lens) map.getCanvas().style.cursor = ''; });
}

let refreshTimer = 0;

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    refreshViewport();
  }, SET.performance.statsRefreshDelayMs);
}

function countRendered(test) {
  const map = S.map;
  const layers = [];
  if (map.getLayer('pts') && map.getLayoutProperty('pts', 'visibility') !== 'none') {
    layers.push('pts');
  }
  if (map.getLayer('mpts') && map.getLayoutProperty('mpts', 'visibility') !== 'none') {
    layers.push('mpts');
  }
  if (!layers.length) return [0, 0];
  const fs = map.queryRenderedFeatures({ layers });
  const seen = new Set();
  let d = 0; let c = 0;
  for (const ft of fs) {
    const p = ft.properties;
    const k = p.s + ':' + p.y + ':' + p.c;
    if (seen.has(k)) continue;
    seen.add(k);
    if (test) {
      const g = ft.geometry.coordinates;
      if (!test(g[0], g[1])) continue;
    }
    d += p.f;
    c += 1;
  }
  return [d, c];
}

function gridCount(inView) {
  const g = S.grid;
  let d = 0; let c = 0;
  for (let i = 0; i < g.nb; i++) {
    if (!S.gridN[i]) continue;
    if (!inView(g.latC[i], g.lonC[i])) continue;
    d += S.gridW[i];
    c += S.gridN[i];
  }
  return [d, c];
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

  const setNums = (d, c) => {
    $('stat-d').textContent = fmt(d);
    $('stat-c').textContent = fmt(c);
  };

  if (S.lens) {
    $('stats-kicker').textContent = 'WITHIN ' + S.lens.mi + ' MI OF THE CURSOR';
    if (!S.lens.over || S.lens.lng == null || z < LENS_MIN_ZOOM) {
      $('stat-d').textContent = '—';
      $('stat-c').textContent = '—';
      $('stats-sub').textContent = z < LENS_MIN_ZOOM
        ? 'zoom in to level ' + TILE_MIN + ' to use the lens'
        : 'move the cursor over the map';
      return;
    }
    const [d, c] = countRendered(makeInRing(S.lens));
    setNums(d, c);
    $('stats-sub').textContent = DC + ' under the lens · esc to exit';
    return;
  }

  if (S.route) {
    let d = 0; let c = 0;
    const pending = S.dotsKey !== 'route' || !S.route.hits;
    if (!pending) {
      for (const ft of S.modeFeats) {
        if (!yearOn(ft.properties.y)) continue;
        d += ft.properties.f;
        c += 1;
      }
    }
    $('stat-d').textContent = pending ? '…' : fmt(d);
    $('stat-c').textContent = pending ? '…' : fmt(c);
    $('stats-kicker').textContent = 'ALONG THIS ROUTE';
    $('stats-sub').textContent = pending
      ? 'tracing the corridor…'
      : DC + ' within ¼ mi of the drive';
    return;
  }

  if (S.roadSel) {
    let d = 0; let c = 0;
    const pending = S.dotsKey !== 'road';
    if (!pending) {
      for (const ft of S.modeFeats) {
        if (!yearOn(ft.properties.y)) continue;
        const g = ft.geometry.coordinates;
        if (!inView(g[1], g[0])) continue;
        d += ft.properties.f;
        c += 1;
      }
    }
    $('stat-d').textContent = pending ? '…' : fmt(d);
    $('stat-c').textContent = pending ? '…' : fmt(c);
    $('stats-kicker').textContent = 'IN THIS VIEW';
    $('stats-sub').textContent = pending
      ? 'pulling this road…'
      : DC + ' of this road on screen';
    return;
  }

  if (S.pin) {
    const [d, c] = countRendered(makeInRing(S.pin));
    setNums(d, c);
    $('stats-kicker').textContent = 'WITHIN ' + S.pin.mi + ' MI · '
      + (S.pin.name || 'PINNED SPOT').toUpperCase();
    $('stats-sub').textContent = z < TILE_MIN
      ? 'zoom in to level ' + TILE_MIN + ' to count the ring'
      : DC + ' in the ring · drag the pin to move it';
    return;
  }

  if (z >= TILE_MIN) {
    const [d, c] = countRendered((lo, la) => inView(la, lo));
    setNums(d, c);
    $('stats-kicker').textContent = 'IN THIS VIEW';
    $('stats-sub').textContent = DC + ' · tap a dot for the full record';
  } else {
    const [d, c] = gridCount(inView);
    setNums(d, c);
    $('stats-kicker').textContent = 'IN THIS VIEW';
    $('stats-sub').textContent = DC + ' · zoom in to level ' + TILE_MIN
      + ' to see every crash';
  }
}

let lensTimer = 0;
let lensLast = 0;

function lensTick() {
  if (lensTimer) return;
  const wait = Math.max(0, SET.lens.followDelayMs - (performance.now() - lensLast));
  lensTimer = setTimeout(() => {
    lensTimer = 0;
    lensLast = performance.now();
    lensApply();
  }, wait);
}

function lensApply() {
  if (!S.lens || !S.layersReady) return;
  const live = S.lens.over && S.lens.lng != null
    && S.map.getZoom() >= LENS_MIN_ZOOM;
  const src = S.map.getSource('pin-ring');
  if (src) {
    src.setData(live
      ? { type: 'Feature', geometry: ringPolygon(S.lens), properties: {} }
      : { type: 'FeatureCollection', features: [] });
  }
  applyFilters();
  syncData();
  refreshViewport();
}

function lensDisplay(on) {
  const map = S.map;
  if (!map.getLayer('pts')) return;
  map.setPaintProperty('pts', 'circle-opacity', on ? SET.dots.maxOpacity : PTS_OPACITY);
  map.setPaintProperty('pts', 'circle-stroke-opacity', on ? 1 : PTS_STROKE_OPACITY);
}

function setLens(on) {
  if (!!S.lens === on || !S.layersReady) return;
  if (on) {
    clearRoute();
    clearRoad();
    clearPin();
    S.lens = { mi: LENS_DEFAULT, lng: null, lat: null, over: false };
    $('lens-btn').classList.add('lit');
    $('radius-row').hidden = false;
    renderRadiusChips();
    S.map.getCanvas().style.cursor = 'crosshair';
    lensDisplay(true);
    lensApply();
  } else {
    S.lens = null;
    $('lens-btn').classList.remove('lit');
    $('radius-row').hidden = true;
    renderRadiusChips();
    const src = S.map.getSource('pin-ring');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    S.map.getCanvas().style.cursor = '';
    lensDisplay(false);
    applyFilters();
    S.dotsKey = 'cleared';
    syncData();
    if (S.dotsKey === 'cleared') setDots([], 'none');
    refreshViewport();
  }
}

function renderRadiusChips() {
  const radii = S.lens ? LENS_RADII : RADII;
  const cur = S.lens ? S.lens.mi : (S.pin ? S.pin.mi : DEFAULT_RADIUS);
  document.querySelectorAll('.rchip').forEach((chip, i) => {
    chip.dataset.mi = String(radii[i]);
    chip.textContent = radii[i] + ' mi';
    chip.classList.toggle('on', radii[i] === cur);
  });
}

function applyPin(pin, { fly = true } = {}) {
  if (S.lens) setLens(false);
  clearRoute();
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
  toastTimer = setTimeout(() => el.classList.remove('show'), SET.interface.toastSeconds * 1000);
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
  if (S.lens) setLens(false);
  clearRoute();
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
    roadDisplay();
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
  roadDisplay();
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
    if (S.shardCache.size >= SET.performance.caseFilesCached) {
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
    if (SET.basemap.rememberChoice) {
      try { localStorage.setItem(LS_BASE, base); } catch (e) { }
    }
    $('base-btn').classList.toggle('lit', base === 'light');
    S.layersReady = false;
    S.map.setStyle(style, { diff: false });
    S.map.once('style.load', () => {
      addLayers();
      S.layersReady = true;
      applyFilters();
      if (S.roadSel && S.dotsKey === 'road') roadDisplay();
      if (S.route && S.dotsKey === 'route') roadDisplay();
      if (S.lens) {
        lensDisplay(true);
        S.map.getCanvas().style.cursor = 'crosshair';
        lensApply();
      }
      refreshViewport();
    });
  }).catch(() => toast('Could not load that basemap — staying on this one.'));
}

function geocodeOne(q) {
  return fetch(GEO_BASE + '/api/?q=' + encodeURIComponent(q) + '&limit=5&lang=en')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('geocoder'))))
    .then((j) => {
      for (const ft of (j && j.features) || []) {
        const p = ft.properties || {};
        if (p.countrycode && !['US', 'PR', 'VI', 'GU'].includes(p.countrycode)) continue;
        return {
          lng: ft.geometry.coordinates[0],
          lat: ft.geometry.coordinates[1],
          label: placeLabel(p, true) || q,
        };
      }
      throw new Error('no US match for "' + q + '"');
    });
}

function segDistMi(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx; const qy = ay + t * dy;
  return [Math.hypot(px - qx, py - qy), t];
}

function toggleRoutebar(show) {
  const bar = $('routebar');
  bar.hidden = show === undefined ? !bar.hidden : !show;
  if (!bar.hidden) $('route-a').focus();
}

function runRoute() {
  const aq = $('route-a').value.trim();
  const bq = $('route-b').value.trim();
  if (!aq || !bq) { toast('Give me both ends of the drive.'); return; }
  const goBtn = $('route-go');
  goBtn.disabled = true;
  goBtn.textContent = '…';
  Promise.all([geocodeOne(aq), geocodeOne(bq)]).then(([a, b]) => fetch(
    OSRM_BASE + '/route/v1/driving/' + a.lng.toFixed(5) + ',' + a.lat.toFixed(5)
    + ';' + b.lng.toFixed(5) + ',' + b.lat.toFixed(5)
    + '?overview=full&geometries=geojson&alternatives=false',
  ).then((r) => (r.ok ? r.json() : Promise.reject(new Error('router'))))
    .then((j) => {
      if (!j.routes || !j.routes.length) throw new Error('no route found');
      buildRoute(a, b, j.routes[0].geometry.coordinates);
    }))
    .catch((e) => toast('Route check failed: ' + e.message))
    .finally(() => { goBtn.disabled = false; goBtn.textContent = 'CHECK'; });
}

function buildRoute(a, b, coords) {
  if (S.lens) setLens(false);
  clearRoad();
  clearPin();
  toggleRoutebar(false);

  const nV = coords.length;
  const cum = new Float64Array(nV);
  for (let i = 1; i < nV; i++) {
    const mLat = (coords[i][1] + coords[i - 1][1]) / 2;
    const mpd = MI_PER_DEG * Math.cos(mLat * Math.PI / 180);
    const dx = (coords[i][0] - coords[i - 1][0]) * mpd;
    const dy = (coords[i][1] - coords[i - 1][1]) * MI_PER_DEG;
    cum[i] = cum[i - 1] + Math.hypot(dx, dy);
  }
  const totalMi = cum[nV - 1];

  const cells = new Map();
  const pad = 0.012;
  let minX = 180; let maxX = -180; let minY = 90; let maxY = -90;
  const cellKey = (cx, cy) => cx + ':' + cy;
  for (let i = 0; i < nV - 1; i++) {
    const x0 = Math.min(coords[i][0], coords[i + 1][0]) - pad;
    const x1 = Math.max(coords[i][0], coords[i + 1][0]) + pad;
    const y0 = Math.min(coords[i][1], coords[i + 1][1]) - pad;
    const y1 = Math.max(coords[i][1], coords[i + 1][1]) + pad;
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
    if (y0 < minY) minY = y0;
    if (y1 > maxY) maxY = y1;
    for (let cx = Math.floor(x0 / ROUTE_CELL); cx <= Math.floor(x1 / ROUTE_CELL); cx++) {
      for (let cy = Math.floor(y0 / ROUTE_CELL); cy <= Math.floor(y1 / ROUTE_CELL); cy++) {
        const k = cellKey(cx, cy);
        let arr = cells.get(k);
        if (!arr) { arr = []; cells.set(k, arr); }
        arr.push(i);
      }
    }
  }

  const fipsList = [];
  for (const sh of S.stateShapes) {
    if (sh.maxX < minX || sh.minX > maxX || sh.maxY < minY || sh.minY > maxY) continue;
    fipsList.push(S.d.stfips[sh.si]);
  }

  const token = { a, b, coords, cum, totalMi };
  S.route = token;
  $('rt-name').textContent = a.label + ' → ' + b.label;
  $('rt-nums').innerHTML = '…';
  $('rt-sub').textContent = Math.round(totalMi) + ' mi · pulling crash data…';
  $('route-banner').hidden = false;
  setRouteMarkers(a, b);

  const lineFC = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };
  token.lineFC = lineFC;
  S.map.getSource('route').setData(lineFC);
  S.map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 70, duration: 900 });

  Promise.all(fipsList.map(ensurePack)).then((pks) => {
    if (S.route !== token) return;
    scanCorridor(token, pks, cells);
  }).catch(() => {
    if (S.route === token) $('rt-sub').textContent = 'could not load crash data — check the connection';
  });
}

function scanCorridor(token, pks, cells) {
  const { coords, cum } = token;
  const hits = { mi: [], d: [], y: [], rn: [], fi: [] };
  let pki = 0; let row = 0;

  function slice() {
    if (S.route !== token) return;
    const t0 = Date.now();
    while (pki < pks.length) {
      const pk = pks[pki];
      const { lat, lon, f, y, r } = pk;
      for (; row < lat.length; row++) {
        if ((row & 4095) === 0 && Date.now() - t0 > 24) { setTimeout(slice, 0); return; }
        const lo = lon[row] / 1e5;
        const la = lat[row] / 1e5;
        const segs = cells.get(Math.floor(lo / ROUTE_CELL) + ':' + Math.floor(la / ROUTE_CELL));
        if (!segs) continue;
        const mpd = MI_PER_DEG * Math.cos(la * Math.PI / 180);
        const px = lo * mpd; const py = la * MI_PER_DEG;
        let bestD = Infinity; let bestMi = 0;
        for (const si of segs) {
          const [dd, t] = segDistMi(px, py,
            coords[si][0] * mpd, coords[si][1] * MI_PER_DEG,
            coords[si + 1][0] * mpd, coords[si + 1][1] * MI_PER_DEG);
          if (dd < bestD) {
            bestD = dd;
            bestMi = cum[si] + t * (cum[si + 1] - cum[si]);
          }
        }
        if (bestD > ROUTE_BUF_MI) continue;
        hits.mi.push(bestMi);
        hits.d.push(f[row]);
        hits.y.push(y[row]);
        hits.rn.push(pk.roads[r[row]]);
        hits.fi.push(pk.feats[row]);
      }
      pki++;
      row = 0;
    }
    token.hits = hits;
    applyRouteYears(true);
  }
  slice();
}

function applyRouteYears(first) {
  const token = S.route;
  if (!token || !token.hits) return;
  const { mi, d, y, rn, fi } = token.hits;
  const totalMi = token.totalMi;
  const stretchLen = Math.min(8, Math.max(1.5, totalMi / 36));
  const nS = Math.max(1, Math.ceil(totalMi / stretchLen));
  const st = Array.from({ length: nS }, () => ({ d: 0, c: 0, roads: new Map() }));
  let totD = 0; let totC = 0;
  const feats = [];
  for (let i = 0; i < mi.length; i++) {
    if (!yearOn(y[i])) continue;
    totD += d[i];
    totC += 1;
    feats.push(fi[i]);
    const k = Math.min(nS - 1, Math.floor(mi[i] / stretchLen));
    st[k].d += d[i];
    st[k].c += 1;
    if (rn[i]) st[k].roads.set(rn[i], (st[k].roads.get(rn[i]) || 0) + d[i]);
  }

  $('rt-nums').innerHTML = fmt(totD) + '<i>' + BS + '</i><em>' + fmt(totC) + '</em>';
  $('rt-sub').textContent = Math.round(totalMi) + ' mi · ' + DC + ' within ¼ mi';

  const maxD = Math.max(1, ...st.map((e) => e.d));
  const TC = SET.route.tollColors;
  const color = (v) => {
    if (v <= 0) return TC.none;
    const x = v / maxD;
    if (x < 0.25) return TC.low;
    if (x < 0.55) return TC.medium;
    if (x < 0.8) return TC.high;
    return TC.worst;
  };
  const stops = [];
  for (let k = 0; k < nS; k++) {
    const p0 = Math.min(0.999, (k * stretchLen) / totalMi);
    stops.push(p0 + 0.0005, color(st[k].d));
  }
  const gradient = ['interpolate', ['linear'], ['line-progress'], 0, color(st[0].d), ...stops.slice(2)];
  token.gradient = gradient;
  if (S.map.getLayer('route-line')) {
    S.map.setPaintProperty('route-line', 'line-gradient', gradient);
  }

  setDots(feats, 'route');
  roadDisplay();

  const spots = st.map((e, k) => ({ k, d: e.d, c: e.c, roads: e.roads }))
    .filter((e) => e.d > 0)
    .sort((x, z) => z.d - x.d)
    .slice(0, SET.route.hotspotCount);
  const rows = spots.map((e) => {
    const m0 = Math.round(e.k * stretchLen);
    const m1 = Math.round(Math.min(totalMi, (e.k + 1) * stretchLen));
    let topRoad = '';
    let best = 0;
    for (const [name, dd] of e.roads) {
      if (dd > best) { best = dd; topRoad = name; }
    }
    const midMi = (m0 + m1) / 2;
    let vi = 0;
    while (vi < token.cum.length - 1 && token.cum[vi] < midMi) vi++;
    const mid = token.coords[vi];
    return '<button class="hs-row" data-lng="' + mid[0] + '" data-lat="' + mid[1] + '">'
      + '<span class="hs-mi">mi ' + m0 + '–' + m1 + '</span>'
      + '<span class="hs-road">' + esc(topRoad || 'local roads') + '</span>'
      + '<span class="hs-nums">' + fmt(e.d) + '<i>' + BS + '</i><em>' + fmt(e.c) + '</em></span>'
      + '</button>';
  });
  const panel = $('panel');
  panel.hidden = false;
  $('panel-body').innerHTML = '<div class="p-kicker">ROUTE CHECK · '
    + esc(token.a.label.toUpperCase()) + ' → ' + esc(token.b.label.toUpperCase()) + '</div>'
    + '<h2 class="p-road">' + fmt(totD) + ' dead along this drive</h2>'
    + '<div class="p-sub">' + Math.round(totalMi) + ' miles · every death within a quarter mile of the road, '
    + S.d.meta.years[S.yearLo] + '–' + S.d.meta.years[S.yearHi] + '.</div>'
    + (rows.length
      ? '<div class="p-h">BE EXTRA CAREFUL HERE</div>' + rows.join('')
      : '<div class="p-sub">No recorded deaths along this route in the chosen years. Drive like it anyway.</div>');
  for (const btn of document.querySelectorAll('.hs-row')) {
    btn.addEventListener('click', () => {
      S.map.easeTo({ center: [Number(btn.dataset.lng), Number(btn.dataset.lat)], zoom: 11, duration: 800 });
    });
  }
  if (first) refreshViewport();
}

function setRouteMarkers(a, b) {
  clearRouteMarkers();
  for (const [pt, cls] of [[a, 'rt-dot-a'], [b, 'rt-dot-b']]) {
    const el = document.createElement('div');
    el.className = 'rt-dot ' + cls;
    S.routeMarkers.push(new maplibregl.Marker({ element: el })
      .setLngLat([pt.lng, pt.lat]).addTo(S.map));
  }
}

function clearRouteMarkers() {
  for (const m of S.routeMarkers) m.remove();
  S.routeMarkers = [];
}

function clearRoute() {
  if (!S.route) return;
  S.route = null;
  clearRouteMarkers();
  $('route-banner').hidden = true;
  closePanel();
  const src = S.map.getSource('route');
  if (src) src.setData({ type: 'FeatureCollection', features: [] });
  roadDisplay();
  S.dotsKey = 'cleared';
  syncData();
  if (S.dotsKey === 'cleared') setDots([], 'none');
  refreshViewport();
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
        applyFilters();
        if (S.route) applyRouteYears();
        updateRoadBanner(true);
        refreshViewport();
      }
    }, SET.performance.yearSliderDelayMs);
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
      if (S.lens) { setLens(false); return; }
      $('modal').hidden = true;
      hideSuggest();
    }
  });

  $('rb-clear').addEventListener('click', clearRoad);
  $('pin-clear').addEventListener('click', clearPin);
  $('locate-btn').addEventListener('click', locateMe);
  $('route-btn').addEventListener('click', () => toggleRoutebar());
  $('route-go').addEventListener('click', runRoute);
  $('route-close').addEventListener('click', () => toggleRoutebar(false));
  $('rt-clear').addEventListener('click', clearRoute);
  for (const rid of ['route-a', 'route-b']) {
    $(rid).addEventListener('keydown', (e) => { if (e.key === 'Enter') runRoute(); });
  }
  $('panel-close').addEventListener('click', closePanel);
  $('base-btn').addEventListener('click', () => setBase(S.base === 'dark' ? 'light' : 'dark'));
  $('base-btn').classList.toggle('lit', S.base === 'light');
  if (!SET.lens.enabled || (SET.lens.hideOnTouchDevices && IS_TOUCH)) {
    $('lens-btn').hidden = true;
  } else {
    $('lens-btn').addEventListener('click', () => setLens(!S.lens));
  }
  for (const chip of document.querySelectorAll('.rchip')) {
    chip.addEventListener('click', () => {
      const mi = Number(chip.dataset.mi);
      if (S.lens) {
        S.lens.mi = mi;
        renderRadiusChips();
        lensApply();
      } else if (S.pin) {
        applyPin({ ...S.pin, mi });
      }
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
    debounce = setTimeout(() => showSuggest(input.value), SET.interface.searchDelayMs);
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
