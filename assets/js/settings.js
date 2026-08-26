window.H2H_SETTINGS = {
  basemap: {
    start: 'dark',
    rememberChoice: true,
    darkStyle: 'assets/vendor/dark-matter-style.json',
    lightStyle: 'assets/vendor/liberty-style.json',
  },

  camera: {
    startCenter: [-96.8, 38.5],
    startZoom: 3.4,
    minZoom: 2,
    maxZoom: 17,
    homeBounds: [[-125.6, 23.6], [-66.0, 49.8]],
    fadeDuration: 120,
    tapToDiveZoom: 8.4,
  },

  dots: {
    appearAtZoom: 8,
    tileDetailZoom: 9,
    colorByDeaths: {
      1: '#b3220f',
      2: '#e0401a',
      4: '#ff702a',
      8: '#ffa542',
    },
    sizeByZoom: {
      8: { base: 1.1, perDeath: 0.5 },
      11: { base: 3.2, perDeath: 1.5 },
      15: { base: 5.0, perDeath: 2.0 },
    },
    fadeInFrom: 8,
    fadeInTo: 8.6,
    minOpacity: 0.35,
    maxOpacity: 0.92,
    outlineWidthByZoom: { 8.6: 0.4, 11: 1.4 },
    outlineColor: { dark: 'rgba(8,8,10,0.8)', light: 'rgba(255,255,255,0.9)' },
    outsideRingColor: '#7c2013',
    outsideRingOpacity: 0.22,
  },

  selection: {
    ringColor: '#ffc46b',
    ringWidth: 2.2,
    ringSizeByZoom: { 7: 9, 12: 13, 16: 18 },
  },

  stateLines: {
    color: { dark: 'rgba(233,228,221,0.16)', light: 'rgba(40,40,55,0.3)' },
    widthByZoom: { 3: 0.6, 7: 1.1 },
    fadeOutFrom: 6,
    fadeOutTo: 8,
  },

  pin: {
    radiiMiles: [1, 3, 5, 10],
    defaultMiles: 5,
    fillColor: 'rgba(255,90,31,0.045)',
    lineColor: 'rgba(255,122,51,0.85)',
    lineWidth: 1.6,
    lineDash: [2.4, 1.8],
  },

  lens: {
    enabled: true,
    hideOnTouchDevices: true,
    radiiMiles: [5, 10, 25, 50],
    defaultMiles: 25,
    followDelayMs: 90,
  },

  route: {
    corridorHalfWidthMiles: 0.25,
    casingColor: 'rgba(8,8,10,0.85)',
    casingWidth: 7,
    lineWidth: 3.5,
    baseColor: '#5a626e',
    tollColors: {
      none: '#4a5058',
      low: '#7a1c10',
      medium: '#c22815',
      high: '#ff5a1f',
      worst: '#ffb46b',
    },
    hotspotCount: 5,
  },

  services: {
    geocoder: 'https://photon.komoot.io',
    router: 'https://router.project-osrm.org',
  },

  performance: {
    statePacksCached: { desktop: 6, phone: 3 },
    caseFilesCached: 12,
    statsRefreshDelayMs: 120,
    yearSliderDelayMs: 250,
  },

  interface: {
    toastSeconds: 3.6,
    loaderTimeoutSeconds: 9,
    searchDelayMs: 160,
  },
};
