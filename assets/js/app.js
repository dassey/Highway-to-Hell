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
  theme: {
    '--bg': '#0a0a0c',
    '--panel': 'rgba(14,13,16,0.88)',
    '--line': 'rgba(255,255,255,0.09)',
    '--txt': '#e9e4dd',
    '--dim': '#9a9186',
    '--faint': '#6b645c',
    '--ember': '#ff5a1f',
    '--ember-hi': '#ff8a3d',
    '--amber': '#f5a300',
    '--blood': '#b81d1d',
  },
};

const LS_SET = 'h2h.settings';

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) {
    return over === undefined ? base : over;
  }
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(over)) out[k] = deepMerge(base ? base[k] : undefined, over[k]);
  return out;
}

function readOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_SET) || 'null') || {}; } catch (e) { return {}; }
}

const FILE_SET = (() => {
  try { return deepMerge(DEFAULTS, window.H2H_SETTINGS); } catch (e) { return DEFAULTS; }
})();

let OVERRIDES = readOverrides();
let SET = deepMerge(FILE_SET, OVERRIDES);

const rampPairs = (obj) => Object.keys(obj)
  .map(Number).sort((a, b) => a - b)
  .reduce((acc, k) => acc.concat([k, obj[k]]), []);

const DATA_V = '?v=7';
const BOOT_URL = 'data/boot.json' + DATA_V;
const ROADS_URL = 'data/roads.json' + DATA_V;
const STATES_URL = 'data/us-states.json?v=1';
const packUrl = (fips) => 'data/s/' + fips + '.json' + DATA_V;
const factorUrl = (fips) => 'data/f/' + fips + '.json' + DATA_V;
const whyGridUrl = (l) => 'data/g/' + l + '.json' + DATA_V;
const WHY_URL = 'data/why.json' + DATA_V;
const TILE_URL = new URL('data/t/', location.href).href + '{z}/{x}/{y}.pbf' + DATA_V;
const TILE_MIN = FILE_SET.dots.tileDetailZoom - 1;
const TILE_MAX = FILE_SET.dots.tileDetailZoom;
const dotZoom = () => Math.max(TILE_MIN, SET.dots.appearAtZoom);
const STYLE_URLS = {
  dark: QS.get('style') || SET.basemap.darkStyle,
  light: QS.get('styleLight') || SET.basemap.lightStyle,
};
const GLYPHS = new URL('assets/glyphs/', location.href).href + '{fontstack}/{range}.pbf';
const GEO_BASE = QS.get('geo') || FILE_SET.services.geocoder;
const OSRM_BASE = QS.get('osrm') || FILE_SET.services.router;
const ROUTE_BUF_MI = FILE_SET.route.corridorHalfWidthMiles;
const ROUTE_CELL = 0.08;
const US_BOUNDS = FILE_SET.camera.homeBounds;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const MCP_HOST = document.modelContext || navigator.modelContext || null;
const PACK_CACHE = IS_TOUCH
  ? FILE_SET.performance.statePacksCached.phone
  : FILE_SET.performance.statePacksCached.desktop;
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

const FACTORS = [
  { l: 'P', key: 'ped', g: 0, label: 'Pedestrians', only: 'a pedestrian was killed' },
  { l: 'B', key: 'bike', g: 0, label: 'Cyclists', only: 'a cyclist was killed' },
  { l: 'M', key: 'moto', g: 0, label: 'Motorcyclists', only: 'a motorcyclist was killed' },
  { l: 'K', key: 'child', g: 0, label: 'Children under 15', only: 'a child under 15 was killed' },
  { l: 'D', key: 'drink', g: 1, label: 'Drinking driver', only: 'a driver had been drinking' },
  { l: 'S', key: 'speed', g: 1, label: 'Speeding', only: 'speeding was involved' },
  { l: 'U', key: 'nobelt', g: 1, label: 'No seat belt', only: 'someone killed wore no seat belt' },
  { l: 'H', key: 'hitrun', g: 1, label: 'Hit-and-run', only: 'a driver fled the scene' },
  { l: 'T', key: 'truck', g: 1, label: 'Large truck', only: 'a large truck was involved' },
  { l: 'Y', key: 'teen', g: 1, label: 'Driver aged 15–20', only: 'a driver was 15 to 20' },
  { l: 'O', key: 'older', g: 1, label: 'Driver 65 or older', only: 'a driver was 65 or older' },
  { l: 'N', key: 'dark', g: 2, label: 'After dark', only: 'it happened after dark' },
  { l: 'R', key: 'rural', g: 2, label: 'Rural road', only: 'the road was rural' },
  { l: 'F', key: 'offroad', g: 2, label: 'Ran off the road', only: 'a lone vehicle ran off the road' },
  { l: 'X', key: 'headon', g: 2, label: 'Head-on', only: 'it was a head-on collision' },
  { l: 'I', key: 'junction', g: 2, label: 'At an intersection', only: 'it happened at an intersection' },
];
const FACTOR_BY = new Map(FACTORS.map((x) => [x.l, x]));
const WHY_GROUPS = ['Who was killed', 'What was involved', 'Where and how'];
const WHY_MIN_DEATHS = 25;
const LS_WHY = 'h2h.why';
const DAY_ROWS = [2, 3, 4, 5, 6, 7, 1];
const DAY_SHORT = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ptsOpacity = () => ['interpolate', ['linear'], ['zoom'],
  SET.dots.fadeInFrom, SET.dots.minOpacity, SET.dots.fadeInTo, SET.dots.maxOpacity];
const ptsStrokeOpacity = () => ['interpolate', ['linear'], ['zoom'],
  SET.dots.fadeInFrom, 0, SET.dots.fadeInTo + 0.6, 1];
const ptsRadius = () => ['interpolate', ['linear'], ['zoom']].concat(
  Object.keys(SET.dots.sizeByZoom).map(Number).sort((a, b) => a - b)
    .reduce((acc, z) => acc.concat([z,
      ['+', SET.dots.sizeByZoom[z].base,
        ['*', SET.dots.sizeByZoom[z].perDeath, ['get', 'f']]]]), []));
const ptsColor = () => ['interpolate', ['linear'], ['get', 'f']]
  .concat(rampPairs(SET.dots.colorByDeaths));
const ptsStrokeW = () => ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.dots.outlineWidthByZoom));
const heatWeight = () => ['interpolate', ['linear'], ['get', 'w']]
  .concat(rampPairs(SET.heat.weightByDeaths));
const heatIntensity = () => ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.heat.intensityByZoom).map((v, i) => (i % 2 ? v * S.heatGain : v)));
const heatRadius = () => ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.heat.radiusByZoom));
const heatOpacity = () => ['interpolate', ['linear'], ['zoom'],
  SET.heat.fadeOutFrom, SET.heat.maxOpacity, SET.heat.fadeOutTo, 0];
const heatColor = () => ['interpolate', ['linear'], ['heatmap-density']]
  .concat(rampPairs(SET.heat.colorByDensityPct).map((v, i) => (i % 2 ? v : v / 100)));
const heatMaxZoom = () => Math.ceil(SET.heat.fadeOutTo);
const selRadius = () => ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.selection.ringSizeByZoom));
const stateWidth = () => ['interpolate', ['linear'], ['zoom']]
  .concat(rampPairs(SET.stateLines.widthByZoom));
const FEAT_CHUNK = 12000;
const LENS_RADII = FILE_SET.lens.radiiMiles;
const LENS_DEFAULT = FILE_SET.lens.defaultMiles;
const LENS_MIN_ZOOM = TILE_MIN;

const theme = () => ({
  stateLine: S.base === 'light' ? SET.stateLines.color.light : SET.stateLines.color.dark,
  ptStroke: S.base === 'light' ? SET.dots.outlineColor.light : SET.dots.outlineColor.dark,
});

const ROAD_CLS = {
  I: 1, IH: 1,
  US: 2, USH: 2, 'US HWY': 2, 'US HIGHWAY': 2, 'US RT': 2, 'US ROUTE': 2,
  SR: 3, SH: 3, ST: 3, SRT: 3, STATE: 3, 'STATE HWY': 3, 'STATE HIGHWAY': 3,
  'STATE RT': 3, 'STATE ROUTE': 3,
  CR: 4, CO: 4, CORD: 4, 'CO RD': 4, 'COUNTY RD': 4, 'COUNTY ROAD': 4,
  FM: 5, RM: 5,
  HWY: 0, HIGHWAY: 0, RT: 0, RTE: 0, ROUTE: 0,
};
const ROAD_RE = new RegExp('^(?:(' + Object.keys(ROAD_CLS)
  .sort((a, b) => b.length - a.length).join('|').replace(/ /g, '\\s+')
  + '))?[\\s-]*0*(\\d{1,4})$');

function parseRoute(name) {
  const t = name.trim();
  const last = t.charCodeAt(t.length - 1) - 48;
  if (!(last >= 0 && last <= 9)) return null;
  const m = ROAD_RE.exec(t);
  if (!m) return null;
  const key = (m[1] || '').replace(/\s+/g, ' ');
  return { cls: key ? ROAD_CLS[key] : 0, num: Number(m[2]) };
}

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
  gridFC: null,
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
  why: null,
  whyNat: null,
  whyGrids: new Map(),
  heatGain: 1,
};

S.base = SET.basemap.start === 'light' ? 'light' : 'dark';
if (SET.basemap.rememberChoice) {
  try {
    const saved = localStorage.getItem(LS_BASE);
    if (saved === 'light' || saved === 'dark') S.base = saved;
  } catch (e) { }
}

const WHY0 = readWhyFromURL();

Promise.all([
  fetch(BOOT_URL).then((r) => {
    if (!r.ok) throw new Error('data ' + r.status);
    setLoader('unpacking the national picture…');
    return r.json();
  }),
  fetch(STATES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  loadStyle(S.base).catch(() => null),
  getJSON(WHY_URL).catch(() => null),
  WHY0 ? loadWhyGrid(WHY0).catch(() => null) : null,
]).then(([boot, statesGeo, baseStyle, whyNat, whyGrid]) => {
  S.d = boot;
  S.statesGeo = statesGeo;
  S.whyNat = whyNat;
  if (whyNat && whyGrid) S.why = WHY0;
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

function getJSON(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
    return r.json();
  });
}

function loadWhyGrid(l) {
  const hit = S.whyGrids.get(l);
  if (hit) return hit.p;
  const e = { p: null, g: null };
  e.p = getJSON(whyGridUrl(l)).then((j) => {
    e.g = {
      ci: Int32Array.from(j.ci), cy: Int32Array.from(j.cy),
      cw: Int32Array.from(j.cw), cn: Int32Array.from(j.cn), when: j.when,
    };
    return e.g;
  }).catch((err) => {
    S.whyGrids.delete(l);
    throw err;
  });
  S.whyGrids.set(l, e);
  return e.p;
}

function whyGrid(l) {
  const e = S.whyGrids.get(l);
  return e ? e.g : null;
}

const maskMemo = new Map();
function maskLetters(m) {
  let out = maskMemo.get(m);
  if (out === undefined) {
    out = '';
    for (let b = 0; b < FACTORS.length; b++) if (m & (1 << b)) out += FACTORS[b].l;
    maskMemo.set(m, out);
  }
  return out;
}

function attachFactors(pack, fx) {
  const n = pack.lat.length;
  pack.k = new Array(n);
  pack.t = new Int16Array(n).fill(-1);
  if (!fx || !fx.k || fx.k.length !== n) {
    pack.k.fill('');
    return pack;
  }
  for (let i = 0; i < n; i++) {
    pack.k[i] = maskLetters(fx.k[i]);
    pack.t[i] = fx.t[i];
  }
  return pack;
}

function fetchPack(fips) {
  return Promise.all([
    getJSON(packUrl(fips)),
    getJSON(factorUrl(fips)).catch(() => null),
  ]).then(([pack, fx]) => attachFactors(pack, fx));
}

const whyOn = (k) => !S.why || (!!k && k.indexOf(S.why) >= 0);

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
  const src = (S.why && whyGrid(S.why)) || g;
  const w = S.gridW;
  const n = S.gridN;
  w.fill(0);
  n.fill(0);
  const nc = src.ci.length;
  for (let i = 0; i < nc; i++) {
    const yi = src.cy[i];
    if (yi < S.yearLo || yi > S.yearHi) continue;
    w[src.ci[i]] += src.cw[i];
    n[src.ci[i]] += src.cn[i];
  }
  S.heatGain = 1;
  if (S.why && S.whyNat && src !== g) {
    const lo = Math.max(S.yearLo, sinceIndex(S.why));
    let all = 0; let some = 0;
    for (let yi = lo; yi <= S.yearHi; yi++) {
      all += S.d.meta.perYear[String(S.d.meta.years[yi])].deaths;
      some += S.whyNat.d[S.why][yi];
    }
    S.heatGain = some > 0 ? Math.min(12, Math.max(1, all / some)) : 1;
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
}

function yearOn(yi) { return yi >= S.yearLo && yi <= S.yearHi; }

function packFeatures(pack) {
  const { lat, lon, f, y, r, c, si, roads, k, t } = pack;
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
          properties: { f: f[i], y: y[i], s: si, c: c[i], rn: roads[r[i]], k: k[i], t: t[i] },
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
  e.p = fetchPack(fips).then((j) => packFeatures(j).then((feats) => {
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
  const { lat, lon, f, y, r, c, si, k, t } = pack;
  const out = [];
  for (let i = 0; i < lat.length; i++) {
    if (r[i] !== ri) continue;
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon[i] / 1e5, lat[i] / 1e5] },
      properties: { f: f[i], y: y[i], s: si, c: c[i], rn: name, k: k[i], t: t[i] },
    });
  }
  return out;
}

function fetchPackLean(fips) {
  const cached = loadedPack(fips);
  if (cached) return Promise.resolve(cached);
  return fetchPack(fips);
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
  const out = S.why ? [['in', S.why, ['to-string', ['get', 'k']]]] : [];
  if (S.yearLo === 0 && S.yearHi === S.d.meta.years.length - 1) return out;
  return out.concat([['>=', ['get', 'y'], S.yearLo], ['<=', ['get', 'y'], S.yearHi]]);
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
  if (map.getLayer('heat')) {
    map.setLayoutProperty('heat', 'visibility', mode ? 'none' : 'visible');
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

function makeInRingPoly(pin) {
  const mpdLon = MI_PER_DEG * Math.cos(pin.lat * Math.PI / 180);
  const step = (Math.PI * 2) / 72;
  const apothem = pin.mi * Math.cos(step / 2);
  return (lng, lat) => {
    const dx = (lng - pin.lng) * mpdLon;
    const dy = (lat - pin.lat) * MI_PER_DEG;
    const r = Math.hypot(dx, dy);
    if (r > pin.mi) return false;
    if (r <= apothem) return true;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    const phi = (a % step) - step / 2;
    return r <= apothem / Math.cos(phi);
  };
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
    canvasContextAttributes: { preserveDrawingBuffer: !!MCP_HOST },
  });
  S.map = map;

  if (!hasHash) {
    if (pin0) {
      map.fitBounds(ringBounds(pin0), { padding: sidePad(90), duration: 0 });
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
    applyLiveSettings();
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

function sidePad(p) {
  const pad = typeof p === 'number' ? { top: p, bottom: p, left: p, right: p } : Object.assign({}, p);
  if (S.whyOpen && !isPhone()) {
    pad.left = Math.max(pad.left, $('why').getBoundingClientRect().right + 16);
  }
  const spare = innerWidth - pad.left - pad.right - 240;
  if (spare < 0) {
    pad.right = Math.max(20, pad.right + spare);
    pad.left = Math.max(20, innerWidth - pad.right - 240);
  }
  return pad;
}

function fitUS(duration) {
  S.map.fitBounds(US_BOUNDS, {
    padding: sidePad({ top: 110, bottom: 40, left: 30, right: 30 }),
    duration: duration == null ? 900 : duration,
  });
}

function addLayers() {
  const map = S.map;
  const T = theme();

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
        'line-width': stateWidth(),
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

  map.addSource('grid', { type: 'geojson', data: S.gridFC });

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
    id: 'heat',
    type: 'heatmap',
    source: 'grid',
    maxzoom: heatMaxZoom(),
    paint: {
      'heatmap-weight': heatWeight(),
      'heatmap-intensity': heatIntensity(),
      'heatmap-radius': heatRadius(),
      'heatmap-opacity': heatOpacity(),
      'heatmap-color': heatColor(),
    },
  }, under);

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
    minzoom: dotZoom(),
    paint: {
      'circle-color': SET.dots.outsideRingColor,
      'circle-radius': ptsRadius(),
      'circle-opacity': SET.dots.outsideRingOpacity,
    },
  }, under);

  map.addLayer({
    id: 'pts',
    type: 'circle',
    source: 'tiles',
    'source-layer': 'crashes',
    minzoom: dotZoom(),
    paint: {
      'circle-color': ptsColor(),
      'circle-radius': ptsRadius(),
      'circle-stroke-width': ptsStrokeW(),
      'circle-stroke-color': T.ptStroke,
      'circle-opacity': ptsOpacity(),
      'circle-stroke-opacity': ptsStrokeOpacity(),
    },
  }, under);

  map.addLayer({
    id: 'mpts',
    type: 'circle',
    source: 'dots',
    paint: {
      'circle-color': ptsColor(),
      'circle-radius': ptsRadius(),
      'circle-stroke-width': ptsStrokeW(),
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
      'circle-radius': selRadius(),
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
    if (test) {
      const g = ft.geometry.coordinates;
      if (!test(g[0], g[1])) continue;
    }
    seen.add(k);
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
  refreshCounts();
  scheduleWhy();
}

function viewTest() {
  const b = S.map.getBounds();
  const w = b.getWest(); const e = b.getEast();
  const so = b.getSouth(); const n = b.getNorth();
  const wrap = e < w;
  return (lo, la) => {
    if (la < so || la > n) return false;
    return wrap ? !(lo < w && lo > e) : !(lo < w || lo > e);
  };
}

function refreshCounts() {
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
        if (!yearOn(ft.properties.y) || !whyOn(ft.properties.k)) continue;
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
        if (!yearOn(ft.properties.y) || !whyOn(ft.properties.k)) continue;
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
  map.setPaintProperty('pts', 'circle-opacity', on ? SET.dots.maxOpacity : ptsOpacity());
  map.setPaintProperty('pts', 'circle-stroke-opacity', on ? 1 : ptsStrokeOpacity());
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
    S.map.fitBounds(ringBounds(pin), { padding: sidePad(90), maxZoom: 15, duration: 900 });
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
    j.PFX = new Uint8Array(j.U.length);
    j.NUM = new Int32Array(j.U.length).fill(-1);
    for (let i = 0; i < j.U.length; i++) {
      const r = parseRoute(j.U[i]);
      if (r) { j.PFX[i] = r.cls; j.NUM[i] = r.num; }
    }
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
    if (!yearOn(p.y) || !whyOn(p.k)) continue;
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
      : (statesSeen.size ? S.d.states[[...statesSeen][0]]
        : (S.why ? 'none where ' + FACTOR_BY.get(S.why).only : 'no crashes in this year range')));

  if (refit) {
    if (S.pin) {
      S.map.fitBounds(ringBounds(S.pin), { padding: sidePad(90), maxZoom: 15, duration: 700 });
    } else if (c > 0) {
      S.map.fitBounds([[minX, minY], [maxX, maxY]], {
        padding: sidePad({ top: 130, bottom: 90, left: 60, right: 60 }),
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
  if (S.whyOpen && isPhone()) setWhyOpen(false);
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
  S.map.fitBounds([[minX, minY], [maxX, maxY]], {
    padding: sidePad(isPhone() ? 70 : { top: 120, bottom: 70, left: 70, right: 390 }),
    duration: 900,
  });

  Promise.all(fipsList.map(ensurePack)).then((pks) => {
    if (S.route !== token) return;
    scanCorridor(token, pks, cells);
  }).catch(() => {
    if (S.route === token) $('rt-sub').textContent = 'could not load crash data — check the connection';
  });
}

function scanCorridor(token, pks, cells) {
  const { coords, cum } = token;
  const hits = { mi: [], d: [], y: [], rn: [], fi: [], k: [] };
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
        hits.k.push(pk.k[row]);
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
  const hk = token.hits.k;
  const totalMi = token.totalMi;
  const stretchLen = Math.min(8, Math.max(1.5, totalMi / 36));
  const nS = Math.max(1, Math.ceil(totalMi / stretchLen));
  const st = Array.from({ length: nS }, () => ({ d: 0, c: 0, roads: new Map() }));
  let totD = 0; let totC = 0;
  const feats = [];
  for (let i = 0; i < mi.length; i++) {
    if (!yearOn(y[i])) continue;
    feats.push(fi[i]);
    if (!whyOn(hk[i])) continue;
    totD += d[i];
    totC += 1;
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
  const why = S.why ? FACTOR_BY.get(S.why) : null;
  $('panel-body').innerHTML = '<div class="p-kicker">ROUTE CHECK · '
    + esc(token.a.label.toUpperCase()) + ' → ' + esc(token.b.label.toUpperCase()) + '</div>'
    + '<h2 class="p-road">' + fmt(totD) + ' dead along this drive</h2>'
    + '<div class="p-sub">' + Math.round(totalMi) + ' miles · every death within a quarter mile of the road, '
    + S.d.meta.years[S.yearLo] + '–' + S.d.meta.years[S.yearHi]
    + (why ? ', only crashes where ' + esc(why.only) : '') + '.</div>'
    + (rows.length
      ? '<div class="p-h">BE EXTRA CAREFUL HERE</div>' + rows.join('')
      : '<div class="p-sub">No recorded deaths along this route'
        + (why ? ' where ' + esc(why.only) : '') + ' in the chosen years. Drive like it anyway.</div>');
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
  const bars = [];
  years.forEach(() => {
    const bar = document.createElement('div');
    bar.className = 'yb on';
    hist.appendChild(bar);
    bars.push(bar);
  });
  S.histBars = bars;
  paintHist();

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
        pushGrid();
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

function paintHist() {
  const bars = S.histBars;
  if (!bars) return;
  const meta = S.d.meta;
  const years = meta.years;
  const x = S.why && S.whyNat ? FACTOR_BY.get(S.why) : null;
  const vals = years.map((yr, i) => (x ? S.whyNat.d[x.l][i] : meta.perYear[String(yr)].deaths));
  const maxD = Math.max(1, ...vals);
  const lo = x ? sinceIndex(x.l) : 0;
  bars.forEach((bar, i) => {
    bar.style.height = (i < lo ? 8 : Math.max(14, Math.round((vals[i] / maxD) * 100))) + '%';
    bar.classList.toggle('na', i < lo);
    bar.title = years[i] + ' — ' + (i < lo
      ? 'not recorded before ' + years[lo]
      : fmt(vals[i]) + ' deaths' + (x ? ' where ' + x.only : ''));
  });
}

function initUI() {
  const meta = S.d.meta;
  const y0 = meta.years[0];
  const y1 = meta.years[meta.years.length - 1];

  $('tag-years').textContent = y0 + '–' + y1;
  initYearSlider();
  initWhy();

  $('m-deaths').textContent = fmt(meta.deaths);
  $('m-crashes').textContent = fmt(meta.crashes);
  $('m-years').textContent = y0 + ' through ' + y1;
  $('m-dropped').textContent = fmt(meta.dropped);
  $('m-built').textContent = meta.generated;
  $('about-btn').addEventListener('click', () => { $('modal').hidden = false; });
  $('set-btn').addEventListener('click', () => {
    buildSettings();
    $('set-modal').hidden = false;
  });
  $('set-close').addEventListener('click', () => { $('set-modal').hidden = true; });
  $('set-modal').addEventListener('click', (e) => {
    if (e.target === $('set-modal')) $('set-modal').hidden = true;
  });
  $('set-copy').addEventListener('click', copySettings);
  $('set-reset').addEventListener('click', resetSettings);
  $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('set-modal').hidden) { $('set-modal').hidden = true; return; }
      if (!$('panel').hidden) { closePanel(); return; }
      if (S.whyOpen && isPhone()) { setWhyOpen(false); return; }
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
  applyTheme();
}

let placeAbort = null;
let searchSeq = 0;

function roadHits(q, limit) {
  const R = S.roadsIdx;
  if (!R) return [];
  const cap = limit || 6;
  const rq = parseRoute(q);
  const named = [];
  const sameNum = [];
  const subs = [];
  for (let i = 0; i < R.U.length; i++) {
    if (rq && R.NUM[i] === rq.num) {
      if (rq.cls === 0 || R.PFX[i] === rq.cls) named.push(i);
      else sameNum.push(i);
    } else if (R.U[i].includes(q)) {
      subs.push(i);
    }
  }
  const byDeaths = (a, b) => R.d[b] - R.d[a];
  named.sort(byDeaths);
  sameNum.sort(byDeaths);
  subs.sort(byDeaths);
  const hits = [];
  for (const list of [named, sameNum, subs]) {
    for (const i of list) {
      hits.push([i, R.d[i], R.c[i]]);
      if (hits.length >= cap) return hits;
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

function sinceIndex(l) {
  const yr = S.whyNat && S.whyNat.since[l];
  const i = yr ? S.d.meta.years.indexOf(yr) : 0;
  return i < 0 ? 0 : i;
}

function readWhyFromURL() {
  const key = QS.get('why');
  const x = key && FACTORS.find((f) => f.key === key);
  return x ? x.l : null;
}

function writeWhyToURL() {
  const qs = new URLSearchParams(location.search);
  if (S.why) qs.set('why', FACTOR_BY.get(S.why).key);
  else qs.delete('why');
  const q = qs.toString();
  history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
}

const isPhone = () => matchMedia('(max-width: 900px)').matches;

function pushGrid() {
  if (!S.map || !S.layersReady) return;
  const src = S.map.getSource('grid');
  if (src) src.setData(S.gridFC);
  if (S.map.getLayer('heat')) S.map.setPaintProperty('heat', 'heatmap-intensity', heatIntensity());
}

function setWhy(l) {
  const want = l && FACTOR_BY.has(l) && S.whyNat ? l : null;
  S.whyWant = want;
  if (want === S.why) {
    renderWhyRows();
    return Promise.resolve(true);
  }
  const row = want && document.querySelector('.wr[data-l="' + want + '"]');
  if (row) row.classList.add('busy');
  return (want ? loadWhyGrid(want) : Promise.resolve()).then(() => {
    if (S.whyWant !== want) return false;
    S.why = want;
    writeWhyToURL();
    computeGrid();
    pushGrid();
    applyFilters();
    paintHist();
    if (S.route) applyRouteYears();
    if (S.roadSel) updateRoadBanner(false);
    refreshViewport();
    if (S.whyOpen) renderWhy();
    return true;
  }).catch(() => {
    if (row) row.classList.remove('busy');
    toast('Could not load that breakdown — check the connection.');
    return false;
  });
}

function newTally() {
  const ny = S.d.meta.years.length;
  const f = {};
  for (const x of FACTORS) f[x.l] = new Float64Array(ny);
  return { d: new Float64Array(ny), c: new Float64Array(ny), f, sel: new Float64Array(ny), when: new Float64Array(168) };
}

function tallyAdd(T, p) {
  const y = p.y;
  const n = p.f;
  const k = p.k || '';
  T.d[y] += n;
  T.c[y] += 1;
  for (let j = 0; j < k.length; j++) {
    const a = T.f[k[j]];
    if (a) a[y] += n;
  }
  if (!whyOn(k)) return;
  T.sel[y] += n;
  const t = p.t;
  if (t != null && t >= 0 && y >= S.yearLo && y <= S.yearHi) T.when[t] += n;
}

function nationTally() {
  const W = S.whyNat;
  const T = newTally();
  S.d.meta.years.forEach((yr, yi) => {
    const py = S.d.meta.perYear[String(yr)];
    T.d[yi] = py.deaths;
    T.c[yi] = py.crashes;
  });
  for (const x of FACTORS) T.f[x.l].set(W.d[x.l]);
  T.sel.set(S.why ? W.d[S.why] : T.d);
  const fg = S.why ? whyGrid(S.why) : null;
  const rows = S.why ? (fg && fg.when) : W.when;
  if (rows) {
    for (let yi = S.yearLo; yi <= S.yearHi; yi++) {
      const r = rows[yi];
      for (let t = 0; t < 168; t++) T.when[t] += r[t];
    }
  }
  return T;
}

function whyScope() {
  if (!S.d || !S.whyNat || !S.layersReady) return null;
  if (S.route) {
    const name = 'Along this route';
    if (!S.route.hits) return { name, sub: 'tracing the corridor…', pending: true };
    const T = newTally();
    for (const ft of S.route.hits.fi) tallyAdd(T, ft.properties);
    return { name, sub: S.route.a.label + ' → ' + S.route.b.label, T };
  }
  if (S.roadSel) {
    if (S.dotsKey !== 'road') return { name: S.roadSel.name, sub: 'pulling this road…', pending: true };
    const inRing = S.pin ? makeInRing(S.pin) : null;
    const T = newTally();
    for (const ft of S.modeFeats) {
      if (inRing) {
        const g = ft.geometry.coordinates;
        if (!inRing(g[0], g[1])) continue;
      }
      tallyAdd(T, ft.properties);
    }
    return { name: S.roadSel.name, sub: S.pin ? 'within ' + S.pin.mi + ' mi of ' + S.pin.name : 'the whole road', T };
  }
  const ring = S.lens ? (S.lens.over && S.lens.lng != null ? S.lens : null) : S.pin;
  if (S.map.getZoom() < TILE_MIN || (S.lens && !ring)) {
    let sub = 'zoom in to break down just this area';
    if (S.lens) sub = 'point the lens at the map';
    else if (S.pin) sub = 'zoom in to break down the ring';
    return { name: 'Nationwide', sub, T: nationTally(), nation: true };
  }
  const test = ring ? makeInRingPoly(ring) : viewTest();
  const T = newTally();
  const seen = new Set();
  for (const ft of S.map.querySourceFeatures('tiles', { sourceLayer: 'crashes' })) {
    const p = ft.properties;
    const key = p.s + ':' + p.y + ':' + p.c;
    if (seen.has(key)) continue;
    const g = ft.geometry.coordinates;
    if (!test(g[0], g[1])) continue;
    seen.add(key);
    tallyAdd(T, p);
  }
  if (ring) {
    return { name: 'Within ' + ring.mi + ' mi', sub: S.lens ? 'of the cursor' : (ring.name || 'the pin'), T };
  }
  return { name: 'In this view', sub: null, T };
}

const sumRange = (arr, lo, hi) => {
  let s = 0;
  for (let i = lo; i <= hi; i++) s += arr[i];
  return s;
};

function hourName(h) {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return (h % 12) + (h < 12 ? ' AM' : ' PM');
}

function whyReport() {
  const sc = whyScope();
  if (!sc) return null;
  const years = S.d.meta.years;
  const lo = S.yearLo; const hi = S.yearHi;
  const out = {
    scope: sc.name,
    detail: sc.sub || null,
    nationwide: !!sc.nation,
    years: { from: years[lo], to: years[hi] },
    factor: S.why ? FACTOR_BY.get(S.why).key : null,
    pending: !!sc.pending,
  };
  if (sc.pending) return out;
  const T = sc.T;
  const N = sc.nation ? T : nationTally();
  out.deaths = sumRange(T.d, lo, hi);
  out.crashes = sumRange(T.c, lo, hi);
  out.matching = S.why ? sumRange(T.sel, lo, hi) : out.deaths;
  out.perYear = Array.from(T.sel);
  out.rows = FACTORS.map((x) => {
    const since = years[sinceIndex(x.l)];
    const a = Math.max(lo, sinceIndex(x.l));
    const row = { l: x.l, key: x.key, label: x.label, group: WHY_GROUPS[x.g], since, available: a <= hi };
    if (!row.available) return row;
    const td = sumRange(T.d, a, hi);
    const fd = sumRange(T.f[x.l], a, hi);
    const nd = sumRange(N.d, a, hi);
    const nf = sumRange(N.f[x.l], a, hi);
    row.deaths = fd;
    row.of = td;
    row.share = td ? fd / td : 0;
    row.nationalShare = nd ? nf / nd : 0;
    row.partial = a > lo;
    row.ratio = !sc.nation && td >= WHY_MIN_DEATHS && row.nationalShare > 0
      ? row.share / row.nationalShare : null;
    return row;
  });
  const byDay = new Array(8).fill(0);
  const byHour = new Array(24).fill(0);
  let whenTotal = 0;
  for (let t = 0; t < 168; t++) {
    const v = T.when[t];
    byDay[Math.floor(t / 24) + 1] += v;
    byHour[t % 24] += v;
    whenTotal += v;
  }
  out.when = { grid: Array.from(T.when), total: whenTotal, byHour };
  if (whenTotal >= 12) {
    let bd = 1;
    for (let d = 2; d <= 7; d++) if (byDay[d] > byDay[bd]) bd = d;
    let bh = 0;
    for (let h = 1; h < 24; h++) if (byHour[h] > byHour[bh]) bh = h;
    let dark = 0;
    for (let h = 0; h < 24; h++) if (h >= 20 || h < 5) dark += byHour[h];
    out.when.worstDay = DOW[bd];
    out.when.worstHour = hourName(bh);
    out.when.lateNightShare = dark / whenTotal;
  }
  return out;
}

let whyTimer = 0;

function scheduleWhy() {
  updateWhyChip();
  if (!S.whyOpen) return;
  clearTimeout(whyTimer);
  whyTimer = setTimeout(renderWhy, 140);
}

function updateWhyChip() {
  const x = S.why ? FACTOR_BY.get(S.why) : null;
  $('stats-why').hidden = !x;
  if (x) $('stats-why-label').textContent = 'ONLY · ' + x.label.toUpperCase();
}

const pctText = (v) => (v > 0 && v < 0.01 ? '<1%' : Math.round(v * 100) + '%');

function renderWhy() {
  if (!S.d) return;
  if (!S.whyNat) {
    $('why-kicker').textContent = 'BREAKDOWN UNAVAILABLE';
    $('why-total').textContent = 'Could not load the breakdown. Refresh to retry.';
    return;
  }
  const R = whyReport();
  if (!R) return;
  S.whyLast = R;
  const span = R.years.from + (R.years.from === R.years.to ? '' : '–' + R.years.to);
  $('why-kicker').textContent = R.scope.toUpperCase() + ' · ' + span;
  $('why-sub').textContent = R.detail || '';
  $('why-sub').hidden = !R.detail;
  const x = S.why ? FACTOR_BY.get(S.why) : null;
  if (R.pending) {
    $('why-total').innerHTML = '<b>…</b>';
    $('why-active').hidden = true;
    return;
  }
  $('why-total').innerHTML = '<b>' + fmt(R.deaths) + '</b> killed in ' + fmt(R.crashes)
    + (R.crashes === 1 ? ' crash' : ' crashes');
  $('why-active').hidden = !x;
  if (x) {
    const since = S.d.meta.years[sinceIndex(x.l)];
    const row = R.rows.find((r) => r.l === x.l);
    $('why-active-text').innerHTML = since > R.years.to
      ? 'Mapping only crashes where ' + esc(x.only) + ' — but FARS does not record that before '
        + since + '. Widen the years to see them.'
      : 'Mapping only crashes where ' + esc(x.only) + ': <b>' + fmt(R.matching) + '</b> killed'
        + (row && row.of ? ' (' + pctText(row.share) + ')' : '')
        + (since > R.years.from ? ', ' + since + ' on' : '');
  }
  renderTrend(R);
  renderWhyRows(R);
  renderWhen(R, x);
}

function renderTrend(R) {
  const box = $('why-trend');
  const years = S.d.meta.years;
  if (box.childElementCount !== years.length) {
    box.innerHTML = '';
    for (let i = 0; i < years.length; i++) box.appendChild(document.createElement('i'));
    $('why-y0').textContent = years[0];
    $('why-y1').textContent = years[years.length - 1];
  }
  const vals = R.perYear;
  const max = Math.max(1, ...vals);
  const x = S.why ? FACTOR_BY.get(S.why) : null;
  const lo = x ? sinceIndex(x.l) : 0;
  Array.from(box.children).forEach((bar, i) => {
    bar.style.height = (vals[i] ? Math.max(6, Math.round((vals[i] / max) * 100)) : 0) + '%';
    bar.classList.toggle('off', i < S.yearLo || i > S.yearHi);
    bar.classList.toggle('na', i < lo);
    bar.title = years[i] + ' — ' + (i < lo ? 'not recorded before ' + years[lo] : fmt(vals[i]) + ' killed');
  });
  $('why-trend-label').textContent = 'killed per year' + (x ? ' · ' + x.label.toLowerCase() : '');
}

function renderWhyRows(R) {
  R = R || S.whyLast;
  const box = $('why-rows');
  if (!R || !R.rows) return;
  const parts = [];
  if (!R.nationwide) {
    parts.push('<div class="why-legend"><span class="lg-bar"></span>here'
      + '<span class="lg-tick"></span>nationwide, same years</div>');
  }
  let g = null;
  for (const row of R.rows) {
    if (row.group !== g) {
      g = row.group;
      parts.push('<h4 class="why-h">' + esc(g) + '</h4>');
    }
    const on = S.why === row.l;
    if (!row.available) {
      parts.push('<button class="wr na' + (on ? ' on' : '') + '" data-l="' + row.l
        + '" disabled title="FARS does not record this before '
        + row.since + '"><span class="wr-label">' + esc(row.label) + '</span>'
        + '<span class="wr-pct">—</span><span class="wr-vs">from ' + row.since + '</span></button>');
      continue;
    }
    let vs = '';
    let vsCls = '';
    if (row.ratio != null) {
      if (row.ratio >= 1.2) { vs = row.ratio.toFixed(row.ratio >= 10 ? 0 : 1) + '× US'; vsCls = ' up'; }
      else if (row.ratio <= 0.83) { vs = (row.ratio < 0.1 ? '<0.1' : row.ratio.toFixed(1)) + '× US'; vsCls = ' down'; }
      else vs = '≈ US';
    }
    const w = Math.min(100, row.share * 100);
    const tick = R.nationwide ? '' : '<b style="left:' + Math.min(100, row.nationalShare * 100).toFixed(1) + '%"></b>';
    const tip = fmt(row.deaths) + ' of ' + fmt(row.of) + ' killed (' + pctText(row.share) + ')'
      + (row.partial ? ', ' + row.since + ' on' : '')
      + (R.nationwide ? '' : ' · nationwide ' + pctText(row.nationalShare))
      + (on ? ' · tap to show every crash again' : ' · tap to map only these');
    parts.push('<button class="wr' + (on ? ' on' : '') + '" data-l="' + row.l + '" aria-pressed="' + on
      + '" title="' + esc(tip) + '">'
      + '<span class="wr-label">' + esc(row.label)
      + (row.partial ? '<small>since ' + row.since + '</small>' : '') + '</span>'
      + '<span class="wr-pct">' + pctText(row.share) + '</span>'
      + '<span class="wr-vs' + vsCls + '">' + vs + '</span>'
      + '<span class="wr-bar"><i style="width:' + w.toFixed(1) + '%"></i>' + tick + '</span>'
      + '</button>');
  }
  box.innerHTML = parts.join('');
  box.classList.toggle('filtering', !!S.why);
  box.classList.toggle('nat', !!R.nationwide);
}

function renderWhen(R, x) {
  const box = $('why-when');
  if (!box.childElementCount) {
    const frag = document.createDocumentFragment();
    for (const dow of DAY_ROWS) {
      const lab = document.createElement('span');
      lab.className = 'ww-day';
      lab.textContent = DAY_SHORT[dow].slice(0, 2);
      frag.appendChild(lab);
      for (let h = 0; h < 24; h++) {
        const c = document.createElement('i');
        c.dataset.t = String((dow - 1) * 24 + h);
        frag.appendChild(c);
      }
    }
    box.appendChild(frag);
  }
  const grid = R.when.grid;
  const max = Math.max(1, ...grid);
  for (const c of box.querySelectorAll('i')) {
    const t = Number(c.dataset.t);
    const v = grid[t];
    c.style.background = v ? 'rgba(255,122,51,' + (0.12 + 0.88 * (v / max)).toFixed(3) + ')' : '';
    c.title = DOW[Math.floor(t / 24) + 1] + ', ' + hourName(t % 24) + ' hour — ' + fmt(v) + ' killed';
  }
  $('why-when-label').textContent = x ? '· ' + x.label.toLowerCase() : '';
  const w = R.when;
  let peak;
  if (!w.worstDay) {
    peak = w.total ? 'Too few deaths here to call a pattern.' : 'No recorded deaths here in these years.';
  } else {
    peak = 'Worst day <b>' + w.worstDay + '</b> · worst hour <b>' + w.worstHour + '</b> · <b>'
      + pctText(w.lateNightShare) + '</b> between 8 PM and 5 AM';
  }
  $('why-peak').innerHTML = peak;
  box.setAttribute('aria-label', w.worstDay
    ? 'Deaths by day and hour. Worst day ' + w.worstDay + ', worst hour ' + w.worstHour + '.'
    : 'Deaths by day and hour.');
}

function setWhyOpen(open, remember) {
  S.whyOpen = !!open;
  $('why').classList.toggle('open', S.whyOpen);
  $('dock').classList.toggle('sheet', S.whyOpen);
  $('why-head').setAttribute('aria-expanded', String(S.whyOpen));
  $('why-open').setAttribute('aria-expanded', String(S.whyOpen));
  if (remember && !isPhone()) {
    try { localStorage.setItem(LS_WHY, S.whyOpen ? 'open' : 'closed'); } catch (e) { }
  }
  if (S.whyOpen) renderWhy();
}

function initWhy() {
  let open = !isPhone() && innerHeight >= 560;
  try {
    const saved = localStorage.getItem(LS_WHY);
    if (saved === 'closed') open = false;
  } catch (e) { }
  if (QS.get('why') && !isPhone()) open = true;
  $('why-head').addEventListener('click', () => setWhyOpen(!S.whyOpen, true));
  $('why-open').addEventListener('click', () => setWhyOpen(!S.whyOpen, true));
  $('why-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('.wr');
    if (!btn || btn.disabled) return;
    setWhy(S.why === btn.dataset.l ? null : btn.dataset.l);
  });
  $('why-clear').addEventListener('click', () => setWhy(null));
  $('stats-why-clear').addEventListener('click', () => setWhy(null));
  setWhyOpen(open, false);
  updateWhyChip();
  if (QS.get('why') && !S.why) writeWhyToURL();
}

const SCHEMA = [
  { group: 'Map', fields: [
    { path: 'basemap.start', label: 'Basemap', type: 'select', options: ['dark', 'light'] },
    { path: 'basemap.rememberChoice', label: 'Remember my basemap choice', type: 'bool' },
    { path: 'camera.tapToDiveZoom', label: 'Tap-to-dive zoom', type: 'num', min: 4, max: 14, step: 0.1 },
    { path: 'camera.maxZoom', label: 'Maximum zoom', type: 'num', min: 10, max: 20, step: 1 },
  ] },
  { group: 'Crash dots', fields: [
    { path: 'dots.appearAtZoom', label: 'Dots appear at zoom', type: 'num', min: 8, max: 13, step: 0.5 },
    { path: 'dots.colorByDeaths.1', label: '1 death', type: 'color' },
    { path: 'dots.colorByDeaths.2', label: '2 deaths', type: 'color' },
    { path: 'dots.colorByDeaths.4', label: '4 deaths', type: 'color' },
    { path: 'dots.colorByDeaths.8', label: '8 or more deaths', type: 'color' },
    { path: 'dots.sizeByZoom.8.base', label: 'Dot size, far out', type: 'num', min: 0.2, max: 6, step: 0.1 },
    { path: 'dots.sizeByZoom.15.base', label: 'Dot size, close in', type: 'num', min: 1, max: 20, step: 0.5 },
    { path: 'dots.sizeByZoom.15.perDeath', label: 'Extra size per death', type: 'num', min: 0, max: 8, step: 0.1 },
    { path: 'dots.maxOpacity', label: 'Dot opacity', type: 'num', min: 0.1, max: 1, step: 0.02 },
    { path: 'dots.outlineColor.dark', label: 'Dot outline on dark map', type: 'color' },
    { path: 'dots.outlineColor.light', label: 'Dot outline on street map', type: 'color' },
    { path: 'dots.outsideRingColor', label: 'Dimmed dots outside a ring', type: 'color' },
  ] },
  { group: 'Heat field', fields: [
    { path: 'heat.maxOpacity', label: 'Heat opacity', type: 'num', min: 0.1, max: 1, step: 0.02 },
    { path: 'heat.fadeOutFrom', label: 'Heat starts fading at zoom', type: 'num', min: 3, max: 9, step: 0.1 },
    { path: 'heat.fadeOutTo', label: 'Heat gone by zoom', type: 'num', min: 4, max: 12, step: 0.1 },
    { path: 'heat.colorByDensityPct.30', label: 'Thin', type: 'color' },
    { path: 'heat.colorByDensityPct.55', label: 'Middling', type: 'color' },
    { path: 'heat.colorByDensityPct.78', label: 'Heavy', type: 'color' },
    { path: 'heat.colorByDensityPct.100', label: 'Worst', type: 'color' },
  ] },
  { group: 'Rings and selection', fields: [
    { path: 'selection.ringColor', label: 'Selected crash ring', type: 'color' },
    { path: 'selection.ringWidth', label: 'Selected ring width', type: 'num', min: 0.5, max: 6, step: 0.1 },
    { path: 'pin.fillColor', label: 'Pin ring fill', type: 'color' },
    { path: 'pin.lineColor', label: 'Pin ring edge', type: 'color' },
    { path: 'pin.lineWidth', label: 'Pin ring width', type: 'num', min: 0.5, max: 6, step: 0.1 },
    { path: 'stateLines.color.dark', label: 'State lines on dark map', type: 'color' },
    { path: 'stateLines.color.light', label: 'State lines on street map', type: 'color' },
  ] },
  { group: 'Lens', fields: [
    { path: 'lens.enabled', label: 'Enable the cursor lens', type: 'bool' },
    { path: 'lens.hideOnTouchDevices', label: 'Hide the lens on phones', type: 'bool' },
    { path: 'lens.followDelayMs', label: 'Lens follow delay in ms', type: 'num', min: 0, max: 400, step: 10 },
  ] },
  { group: 'Route check', fields: [
    { path: 'route.baseColor', label: 'Route line', type: 'color' },
    { path: 'route.tollColors.low', label: 'Least deadly stretch', type: 'color' },
    { path: 'route.tollColors.medium', label: 'Middling stretch', type: 'color' },
    { path: 'route.tollColors.high', label: 'Bad stretch', type: 'color' },
    { path: 'route.tollColors.worst', label: 'Worst stretch', type: 'color' },
    { path: 'route.lineWidth', label: 'Route line width', type: 'num', min: 1, max: 10, step: 0.5 },
  ] },
  { group: 'Interface colours', fields: [
    { path: 'theme.--bg', label: 'Page background', type: 'color' },
    { path: 'theme.--panel', label: 'Panel background', type: 'color' },
    { path: 'theme.--line', label: 'Panel borders', type: 'color' },
    { path: 'theme.--txt', label: 'Main text', type: 'color' },
    { path: 'theme.--dim', label: 'Secondary text', type: 'color' },
    { path: 'theme.--faint', label: 'Faint text', type: 'color' },
    { path: 'theme.--ember', label: 'Accent, ember', type: 'color' },
    { path: 'theme.--ember-hi', label: 'Accent, bright', type: 'color' },
    { path: 'theme.--amber', label: 'Amber highlight', type: 'color' },
    { path: 'theme.--blood', label: 'Blood red', type: 'color' },
  ] },
  { group: 'Timing', fields: [
    { path: 'interface.toastSeconds', label: 'Message duration in seconds', type: 'num', min: 1, max: 12, step: 0.2 },
    { path: 'performance.statsRefreshDelayMs', label: 'Counter refresh in ms', type: 'num', min: 0, max: 600, step: 20 },
    { path: 'performance.yearSliderDelayMs', label: 'Year slider delay in ms', type: 'num', min: 0, max: 1000, step: 50 },
    { path: 'interface.searchDelayMs', label: 'Search delay in ms', type: 'num', min: 0, max: 800, step: 20 },
  ] },
];

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}

function parseColor(v) {
  const str = String(v).trim();
  let m = str.match(/^#([0-9a-f]{6})$/i);
  if (m) return { hex: ('#' + m[1]).toLowerCase(), a: 1 };
  m = str.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const c = m[1];
    return { hex: ('#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2]).toLowerCase(), a: 1 };
  }
  m = str.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    const hx = (n) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, '0');
    return { hex: '#' + hx(p[0]) + hx(p[1]) + hx(p[2]), a: p.length > 3 ? p[3] : 1 };
  }
  return { hex: '#000000', a: 1 };
}

function makeColor(hex, a) {
  if (a >= 0.999) return hex;
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255)
    + ',' + Math.round(a * 1000) / 1000 + ')';
}

function applyTheme() {
  const r = document.documentElement;
  const t = SET.theme || {};
  for (const k of Object.keys(t)) r.style.setProperty(k, t[k]);
}

function applyLiveSettings() {
  applyTheme();
  const map = S.map;
  if (!map || !S.layersReady) return;
  const T = theme();
  const setP = (layer, prop, val) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, val);
  };
  for (const id of ['pts', 'pts-out']) {
    if (map.getLayer(id)) map.setLayerZoomRange(id, dotZoom(), 24);
  }
  setP('pts', 'circle-color', ptsColor());
  setP('pts', 'circle-radius', ptsRadius());
  setP('pts', 'circle-stroke-width', ptsStrokeW());
  setP('pts', 'circle-stroke-color', T.ptStroke);
  setP('pts', 'circle-opacity', S.lens ? SET.dots.maxOpacity : ptsOpacity());
  setP('pts', 'circle-stroke-opacity', S.lens ? 1 : ptsStrokeOpacity());
  setP('pts-out', 'circle-color', SET.dots.outsideRingColor);
  setP('pts-out', 'circle-radius', ptsRadius());
  setP('pts-out', 'circle-opacity', SET.dots.outsideRingOpacity);
  setP('mpts', 'circle-color', ptsColor());
  setP('mpts', 'circle-radius', ptsRadius());
  setP('mpts', 'circle-stroke-width', ptsStrokeW());
  setP('mpts', 'circle-stroke-color', T.ptStroke);
  setP('mpts', 'circle-opacity', SET.dots.maxOpacity);
  if (map.getLayer('heat')) map.setLayerZoomRange('heat', 0, heatMaxZoom());
  setP('heat', 'heatmap-weight', heatWeight());
  setP('heat', 'heatmap-intensity', heatIntensity());
  setP('heat', 'heatmap-radius', heatRadius());
  setP('heat', 'heatmap-opacity', heatOpacity());
  setP('heat', 'heatmap-color', heatColor());
  setP('sel-ring', 'circle-radius', selRadius());
  setP('sel-ring', 'circle-stroke-width', SET.selection.ringWidth);
  setP('sel-ring', 'circle-stroke-color', SET.selection.ringColor);
  setP('state-lines', 'line-color', T.stateLine);
  setP('state-lines', 'line-width', stateWidth());
  setP('ring-fill', 'fill-color', SET.pin.fillColor);
  setP('ring-line', 'line-color', SET.pin.lineColor);
  setP('ring-line', 'line-width', SET.pin.lineWidth);
  setP('route-case', 'line-color', SET.route.casingColor);
  setP('route-case', 'line-width', SET.route.casingWidth);
  setP('route-line', 'line-width', SET.route.lineWidth);
  if (!S.route) setP('route-line', 'line-color', SET.route.baseColor);
  if (!SET.lens.enabled && S.lens) setLens(false);
  $('lens-btn').hidden = !SET.lens.enabled || (SET.lens.hideOnTouchDevices && IS_TOUCH);
  refreshViewport();
}

function saveOverrides() {
  try { localStorage.setItem(LS_SET, JSON.stringify(OVERRIDES)); } catch (e) { }
}

function changeSetting(path, val) {
  setPath(OVERRIDES, path, val);
  setPath(SET, path, val);
  saveOverrides();
  if (path === 'basemap.start' && val !== S.base) setBase(val);
  applyLiveSettings();
}

function buildSettings() {
  const box = $('set-body');
  box.innerHTML = '';
  for (const grp of SCHEMA) {
    const h = document.createElement('h3');
    h.textContent = grp.group;
    box.appendChild(h);
    for (const f of grp.fields) {
      const row = document.createElement('div');
      row.className = 'set-row';
      const lab = document.createElement('label');
      lab.textContent = f.label;
      row.appendChild(lab);
      const val = getPath(SET, f.path);
      if (f.type === 'color') {
        const wrap = document.createElement('div');
        wrap.className = 'set-color';
        const c = parseColor(val);
        const sw = document.createElement('input');
        sw.type = 'color';
        sw.value = c.hex;
        const al = document.createElement('input');
        al.type = 'range';
        al.min = '0';
        al.max = '1';
        al.step = '0.01';
        al.value = String(c.a);
        al.setAttribute('aria-label', f.label + ' opacity');
        const push = () => changeSetting(f.path, makeColor(sw.value, Number(al.value)));
        sw.addEventListener('input', push);
        al.addEventListener('input', push);
        wrap.appendChild(sw);
        wrap.appendChild(al);
        row.appendChild(wrap);
      } else if (f.type === 'bool') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!val;
        cb.addEventListener('change', () => changeSetting(f.path, cb.checked));
        row.appendChild(cb);
      } else if (f.type === 'select') {
        const sel = document.createElement('select');
        for (const o of f.options) {
          const op = document.createElement('option');
          op.value = o;
          op.textContent = o;
          sel.appendChild(op);
        }
        sel.value = String(val);
        sel.addEventListener('change', () => changeSetting(f.path, sel.value));
        row.appendChild(sel);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'set-num';
        const rg = document.createElement('input');
        rg.type = 'range';
        rg.min = String(f.min);
        rg.max = String(f.max);
        rg.step = String(f.step);
        rg.value = String(val);
        rg.setAttribute('aria-label', f.label);
        const out = document.createElement('span');
        out.textContent = String(val);
        rg.addEventListener('input', () => {
          out.textContent = rg.value;
          changeSetting(f.path, Number(rg.value));
        });
        wrap.appendChild(rg);
        wrap.appendChild(out);
        row.appendChild(wrap);
      }
      box.appendChild(row);
    }
  }
}

function resetSettings() {
  OVERRIDES = {};
  SET = deepMerge(FILE_SET, {});
  try { localStorage.removeItem(LS_SET); } catch (e) { }
  applyLiveSettings();
  buildSettings();
  toast('Settings back to their defaults.');
}

function copySettings() {
  const txt = 'window.H2H_SETTINGS = '
    + JSON.stringify(deepMerge(FILE_SET, OVERRIDES), null, 2) + ';';
  const ta = $('set-out');
  ta.value = txt;
  ta.hidden = false;
  ta.focus();
  ta.select();
  const ok = () => toast('Copied. Paste it into assets/js/settings.js to keep it for everyone.');
  const manual = () => toast('Select the text below and copy it yourself.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(ok).catch(manual);
    return;
  }
  try {
    if (document.execCommand('copy')) ok(); else manual();
  } catch (e) { manual(); }
}
