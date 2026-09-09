(function () {
  const HOST = (typeof document !== 'undefined' && document.modelContext)
    || (typeof navigator !== 'undefined' && navigator.modelContext)
    || null;
  if (!HOST) return;

  const READY_MS = 30000;
  const SETTLE_MS = 4000;
  const SHOT_W = 1280;
  const SEP = String.fromCharCode(92);

  function waitFor(test, ms, msg) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        if (test()) return resolve();
        if (Date.now() - t0 > ms) return reject(new Error(msg));
        setTimeout(poll, 100);
      }());
    });
  }

  function ready() {
    return waitFor(
      () => !!(S && S.d && S.layersReady),
      READY_MS,
      'The map is still loading its data — try again in a few seconds.',
    );
  }

  function settle() {
    const pad = (SET.performance.statsRefreshDelayMs || 120) + 80;
    return new Promise((resolve) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        setTimeout(resolve, pad);
      };
      S.map.once('idle', fin);
      S.map.triggerRepaint();
      setTimeout(fin, SETTLE_MS);
    });
  }

  const years = () => S.d.meta.years;
  const yearIndex = (yr) => years().indexOf(Number(yr));
  const num = (s) => Number(String(s).replace(/[^0-9]/g, '')) || 0;

  function splitDC(el) {
    if (!el || el.hidden) return null;
    const parts = el.textContent.split(SEP);
    if (parts.length < 2) return null;
    return { deaths: num(parts[0]), crashes: num(parts[1]) };
  }

  function fipsFor(state) {
    const q = String(state).trim();
    const byFips = S.d.stfips.indexOf(q.padStart(2, '0'));
    if (byFips >= 0) return { si: byFips, fips: S.d.stfips[byFips], name: S.d.states[byFips] };
    const i = S.d.states.findIndex((n) => n.toLowerCase() === q.toLowerCase());
    if (i < 0) throw new Error('Unknown state "' + state + '".');
    return { si: i, fips: S.d.stfips[i], name: S.d.states[i] };
  }

  function viewCounts() {
    const b = S.map.getBounds();
    const w = b.getWest(); const e = b.getEast();
    const so = b.getSouth(); const n = b.getNorth();
    const wrap = e < w;
    const [d, c] = gridCount((la, lo) => {
      if (la < so || la > n) return false;
      return wrap ? !(lo < w && lo > e) : !(lo < w || lo > e);
    });
    return { deaths: d, crashes: c };
  }

  function viewState() {
    const map = S.map;
    const c = map.getCenter();
    const b = map.getBounds();
    const counts = viewCounts();
    return {
      center: { lat: Number(c.lat.toFixed(5)), lng: Number(c.lng.toFixed(5)) },
      zoom: Number(map.getZoom().toFixed(2)),
      bounds: {
        west: Number(b.getWest().toFixed(5)),
        south: Number(b.getSouth().toFixed(5)),
        east: Number(b.getEast().toFixed(5)),
        north: Number(b.getNorth().toFixed(5)),
      },
      yearRange: { from: years()[S.yearLo], to: years()[S.yearHi] },
      inView: counts,
      individualCrashesVisible: dotsVisible(),
      zoomForIndividualCrashes: TILE_MIN,
      basemap: S.base === 'light' ? 'street' : 'dark',
      pin: S.pin ? { lat: S.pin.lat, lng: S.pin.lng, radiusMiles: S.pin.mi, name: S.pin.name } : null,
      road: S.roadSel ? { name: S.roadSel.name, toll: splitDC($('rb-nums')) } : null,
      route: S.route
        ? {
          from: S.route.a.label,
          to: S.route.b.label,
          miles: Math.round(S.route.totalMi),
          toll: splitDC($('rt-nums')),
        }
        : null,
      url: location.href,
    };
  }

  function netError(service) {
    return (err) => {
      const msg = (err && err.message) || String(err);
      if (/failed to fetch|networkerror|load failed|^geocoder$|^router$/i.test(msg)) {
        throw new Error('Could not reach the ' + service
          + '. It is an outside service this map calls at runtime — it may be down or blocked here.');
      }
      throw err;
    };
  }

  const findPlace = (q) => geocodeOne(q).catch(netError('place search service'));

  function geoSearch(query, limit) {
    return fetch(GEO_BASE + '/api/?q=' + encodeURIComponent(query)
      + '&limit=' + Math.min(10, Math.max(1, limit || 5)) + '&lang=en')
      .catch(netError('place search service'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('The place search service did not answer.'))))
      .then((j) => ((j && j.features) || [])
        .filter((ft) => {
          const cc = (ft.properties || {}).countrycode;
          return !cc || ['US', 'PR', 'VI', 'GU'].includes(cc);
        })
        .map((ft) => ({
          label: placeLabel(ft.properties || {}) || query,
          lat: Number(ft.geometry.coordinates[1].toFixed(5)),
          lng: Number(ft.geometry.coordinates[0].toFixed(5)),
          state: (ft.properties || {}).state || null,
        })));
  }

  function dotsVisible() {
    const map = S.map;
    const z = map.getZoom();
    return ['pts', 'mpts'].some((id) => {
      const layer = map.getLayer(id);
      return layer && map.getLayoutProperty(id, 'visibility') !== 'none'
        && z >= (layer.minzoom || 0);
    });
  }

  function renderedCrashes(limit) {
    const map = S.map;
    const layers = ['pts', 'mpts'].filter((id) => map.getLayer(id)
      && map.getLayoutProperty(id, 'visibility') !== 'none');
    if (!layers.length) return [];
    const inRing = S.pin ? makeInRing(S.pin) : null;
    const seen = new Set();
    const out = [];
    for (const ft of map.queryRenderedFeatures({ layers })) {
      const p = ft.properties;
      const key = p.s + ':' + p.y + ':' + p.c;
      if (seen.has(key)) continue;
      seen.add(key);
      const g = ft.geometry.coordinates;
      if (inRing && !inRing(g[0], g[1])) continue;
      out.push({
        state: S.d.states[p.s],
        stateFips: S.d.stfips[p.s],
        year: years()[p.y],
        caseId: p.c,
        deaths: p.f,
        road: p.rn || null,
        lat: Number(g[1].toFixed(5)),
        lng: Number(g[0].toFixed(5)),
      });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => b.deaths - a.deaths);
  }

  function decodeCrash(rec, strings, year, caseId, stateName, road) {
    const st = (i) => (i >= 0 && i < strings.length ? strings[i] : null);
    const a = rec[0]; const vehs = rec[1]; const pers = rec[2];
    const speed = (v) => {
      if (v[V.TRAVSP] === 997) return 'stopped';
      return v[V.TRAVSP] >= 0 ? v[V.TRAVSP] : null;
    };
    return {
      caseId,
      year,
      state: stateName,
      road: road || null,
      when: {
        month: a[A.MO] > 0 ? MONTHS[a[A.MO]] : null,
        day: a[A.DY] > 0 ? a[A.DY] : null,
        dayOfWeek: a[A.DOW] > 0 ? DOW[a[A.DOW]] : null,
        time: hourText(a[A.HR], a[A.MIN]),
      },
      deaths: a[A.FATALS],
      vehicleCount: a[A.VEH],
      peopleInvolved: a[A.PEOPLE],
      where: {
        city: st(a[A.CITY]),
        county: st(a[A.COUNTY]),
        crossStreet: st(a[A.TWAY2]),
        routeType: st(a[A.ROUTE]),
        landUse: st(a[A.RURURB]),
        functionalClass: st(a[A.FUNC]),
      },
      conditions: {
        weather: st(a[A.WEATHER]),
        light: st(a[A.LGT]),
        firstHarmfulEvent: st(a[A.HARM]),
        collisionManner: st(a[A.MANCOLL]),
        junction: st(a[A.RELJCT]),
        intersectionType: st(a[A.TYPINT]),
        positionOnRoad: st(a[A.RELROAD]),
        workZone: st(a[A.WRK]),
        schoolBusInvolved: !!a[A.SCHBUS],
        railCrossing: !!a[A.RAIL],
        drinkingDrivers: a[A.DRUNK] > 0 ? a[A.DRUNK] : 0,
      },
      vehicles: vehs.map((v, i) => ({
        number: i + 1,
        modelYear: v[V.MODYEAR] > 0 ? v[V.MODYEAR] : null,
        makeModel: st(v[V.MAKMOD]),
        bodyType: st(v[V.BODY]),
        deaths: v[V.DEATHS],
        drinkingDriver: !!v[V.DRINK],
        hitAndRun: !!v[V.HITRUN],
        rollover: st(v[V.ROLL]),
        fire: !!v[V.FIRE],
        travelSpeedMph: speed(v),
        speedLimitMph: v[V.SPDLIM] > 0 ? v[V.SPDLIM] : null,
        speedingRelated: st(v[V.SPDREL]),
      })),
      people: pers.map((p) => ({
        vehicleNumber: p[P.VEHNO] || null,
        role: st(p[P.PTYPE]),
        age: p[P.AGE] >= 0 ? p[P.AGE] : null,
        sex: st(p[P.SEX]),
        injury: st(p[P.INJ]),
        restraint: st(p[P.REST]),
        ejection: st(p[P.EJECT]),
        died: st(p[P.DOA]),
      })),
      source: 'NHTSA FARS ' + year,
    };
  }

  function snapshot(maxWidth) {
    const src = S.map.getCanvas();
    const cap = Math.min(3000, Math.max(320, maxWidth || SHOT_W));
    const scale = Math.min(1, cap / src.width);
    let url;
    if (scale >= 1) {
      url = src.toDataURL('image/png');
    } else {
      const out = document.createElement('canvas');
      out.width = Math.round(src.width * scale);
      out.height = Math.round(src.height * scale);
      const ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, out.width, out.height);
      url = out.toDataURL('image/png');
    }
    if (url.length < 512) {
      throw new Error('The map canvas came back empty — reload the page so it is created with a readable drawing buffer.');
    }
    return url;
  }

  const ok = (text, data) => ({
    content: [{ type: 'text', text }],
    structuredContent: data === undefined ? undefined : data,
  });

  const withShot = (text, data, dataUrl) => ({
    content: [
      { type: 'text', text },
      { type: 'image', data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/png' },
    ],
    structuredContent: data,
  });

  const tollLine = (t) => (t ? fmt(t.deaths) + ' deaths in ' + fmt(t.crashes) + ' crashes' : 'no toll available');

  const yearSpan = () => years()[S.yearLo] + '–' + years()[S.yearHi];

  const TOOLS = [
    {
      name: 'get_map_view',
      description: 'Read the current state of the crash map: where it is centred, the zoom, the active year range, the fatal-crash toll inside the current view, and any pin, isolated road or checked route. Call this first to know what the user is looking at.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ready().then(() => {
        const v = viewState();
        return ok('Showing ' + fmt(v.inView.deaths) + ' deaths in ' + fmt(v.inView.crashes)
          + ' crashes for ' + yearSpan() + ' at zoom ' + v.zoom
          + (v.individualCrashesVisible ? ' (individual crashes visible).' : ' (zoomed out — heat field only).'), v);
      }),
    },
    {
      name: 'set_year_range',
      description: 'Limit the map to a range of crash years. FARS coverage on this map runs 2001 to 2024. Everything else — the heat field, the road toll, the route check — re-counts for the chosen years.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'integer', description: 'First year to include, 2001-2024.' },
          to: { type: 'integer', description: 'Last year to include, 2001-2024.' },
        },
        required: ['from', 'to'],
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        let a = yearIndex(args.from);
        let b = yearIndex(args.to);
        const span = years()[0] + '–' + years()[years().length - 1];
        if (a < 0 || b < 0) throw new Error('This map only covers ' + span + '.');
        if (a > b) { const t = a; a = b; b = t; }
        const lo = $('yr-lo'); const hi = $('yr-hi');
        lo.value = String(a);
        hi.value = String(b);
        lo.dispatchEvent(new Event('input'));
        hi.dispatchEvent(new Event('input'));
        hi.dispatchEvent(new Event('change'));
        return waitFor(() => S.yearLo === a && S.yearHi === b,
          SETTLE_MS, 'The year range did not apply.')
          .then(settle)
          .then(() => {
            const v = viewState();
            return ok('Years set to ' + yearSpan() + '. In this view: '
              + fmt(v.inView.deaths) + ' deaths in ' + fmt(v.inView.crashes) + ' crashes.', v);
          });
      }),
    },
    {
      name: 'set_map_view',
      description: 'Move the map to a place, or to explicit coordinates and zoom. Zoom past level 9 to make individual crashes appear; the whole lower 48 sits near zoom 4.',
      inputSchema: {
        type: 'object',
        properties: {
          place: { type: 'string', description: 'A US place to centre on, e.g. "Flagstaff, AZ". Ignored if lat and lng are given.' },
          lat: { type: 'number', description: 'Latitude to centre on.' },
          lng: { type: 'number', description: 'Longitude to centre on.' },
          zoom: { type: 'number', description: 'Zoom level, 3 (national) to 18 (street). Defaults to 11 for a place.' },
        },
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        const go = (lat, lng, label) => {
          const zoom = args.zoom == null ? (label ? 11 : S.map.getZoom()) : args.zoom;
          S.map.jumpTo({ center: [lng, lat], zoom });
          return settle().then(() => {
            const v = viewState();
            return ok('Moved to ' + (label || lat.toFixed(4) + ', ' + lng.toFixed(4))
              + ' at zoom ' + v.zoom + ' — ' + fmt(v.inView.deaths) + ' deaths in '
              + fmt(v.inView.crashes) + ' crashes here for ' + yearSpan() + '.', v);
          });
        };
        if (args.lat != null && args.lng != null) return go(args.lat, args.lng, null);
        if (!args.place) throw new Error('Give me a place, or both lat and lng.');
        return findPlace(args.place).then((p) => go(p.lat, p.lng, p.label));
      }),
    },
    {
      name: 'find_place',
      description: 'Look up candidate US places for a search string without touching the map. Use it to disambiguate before dropping a pin or checking a route.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Place name, address or landmark.' },
          limit: { type: 'integer', description: 'How many candidates to return, 1-10. Default 5.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (args) => ready()
        .then(() => geoSearch(args.query, args.limit))
        .then((places) => {
          if (!places.length) throw new Error('No US match for "' + args.query + '".');
          return ok(places.map((p) => p.label + ' (' + p.lat + ', ' + p.lng + ')').join('\n'),
            { places });
        }),
    },
    {
      name: 'set_pin',
      description: 'Drop the pin on a place or coordinate and scope the map to a radius around it, so every count becomes "within N miles of here". This is the tool for "how bad is it around me / around this address".',
      inputSchema: {
        type: 'object',
        properties: {
          place: { type: 'string', description: 'A US place to pin. Ignored if lat and lng are given.' },
          lat: { type: 'number', description: 'Latitude to pin.' },
          lng: { type: 'number', description: 'Longitude to pin.' },
          radiusMiles: { type: 'number', description: 'Ring radius in miles; snapped to the nearest offered value (1, 3, 5 or 10).' },
        },
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        const want = args.radiusMiles == null ? DEFAULT_RADIUS : args.radiusMiles;
        const mi = RADII.reduce((best, r) => (Math.abs(r - want) < Math.abs(best - want) ? r : best), RADII[0]);
        const drop = (lat, lng, name) => {
          applyPin({ lat, lng, mi, name: name || 'Dropped pin' });
          return settle().then(() => {
            const v = viewState();
            const near = renderedCrashes(100000).length;
            return ok('Pinned ' + (name || lat.toFixed(4) + ', ' + lng.toFixed(4)) + ' with a '
              + mi + '-mile ring. In view for ' + yearSpan() + ': ' + fmt(v.inView.deaths)
              + ' deaths in ' + fmt(v.inView.crashes) + ' crashes'
              + (v.individualCrashesVisible ? '; ' + fmt(near) + ' crashes plotted inside the ring.' : '.'),
            Object.assign(v, { crashesInsideRing: v.individualCrashesVisible ? near : null }));
          });
        };
        if (args.lat != null && args.lng != null) return drop(args.lat, args.lng, null);
        if (!args.place) throw new Error('Give me a place, or both lat and lng.');
        return findPlace(args.place).then((p) => drop(p.lat, p.lng, p.label));
      }),
    },
    {
      name: 'search_roads',
      description: 'Search the national road index by name and get each road\'s full 2001-2024 toll across every state it runs through. Use it to find the exact road name before isolating one.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Part of a road name, e.g. "I-40" or "US-1".' },
          limit: { type: 'integer', description: 'How many roads to return, 1-25. Default 10.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (args) => ready().then(ensureRoadsIdx).then((R) => {
        const q = String(args.query).trim().toUpperCase();
        if (q.length < 2) throw new Error('Give me at least two characters.');
        const cap = Math.min(25, Math.max(1, args.limit || 10));
        const roads = roadHits(q, cap).map(([i]) => ({
          name: R.roads[i], deaths: R.d[i], crashes: R.c[i], states: R.st[i].length,
        }));
        if (!roads.length) throw new Error('No road matching "' + args.query + '".');
        return ok(roads.map((r) => r.name + ' — ' + fmt(r.deaths) + ' deaths in '
          + fmt(r.crashes) + ' crashes across ' + r.states + ' state(s)').join('\n'), { roads });
      }),
    },
    {
      name: 'select_road',
      description: 'Isolate one road nationally: the map shows only its crashes, coast to coast, and reports its toll for the active year range. Takes a name from search_roads, or a colloquial one like "hwy 6", which resolves to the deadliest road carrying that number.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact road name as returned by search_roads.' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      execute: (args) => ready().then(ensureRoadsIdx).then((R) => {
        const q = String(args.name).trim().toUpperCase();
        const hit = roadHits(q, 1)[0];
        const i = hit ? hit[0] : -1;
        if (i < 0) throw new Error('No road matching "' + args.name + '". Try search_roads first.');
        selectRoad(i);
        return waitFor(() => S.dotsKey === 'road', 20000, 'That road did not finish loading.')
          .then(settle)
          .then(() => {
            const v = viewState();
            return ok(R.roads[i] + ' for ' + yearSpan() + ': ' + tollLine(v.road && v.road.toll)
              + '. ' + ($('rb-sub').textContent || ''), v);
          });
      }),
    },
    {
      name: 'check_route',
      description: 'Check a drive end to end: routes A to B, counts every death within a quarter mile of the road, colours the route by how deadly each stretch has been, and returns the worst stretches. This is the tool for "is this drive dangerous".',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start of the drive, e.g. "Barstow, CA".' },
          to: { type: 'string', description: 'End of the drive, e.g. "Las Vegas, NV".' },
        },
        required: ['from', 'to'],
        additionalProperties: false,
      },
      execute: (args) => ready()
        .then(() => Promise.all([findPlace(args.from), findPlace(args.to)]))
        .then(([a, b]) => fetch(OSRM_BASE + '/route/v1/driving/'
          + a.lng.toFixed(5) + ',' + a.lat.toFixed(5) + ';'
          + b.lng.toFixed(5) + ',' + b.lat.toFixed(5)
          + '?overview=full&geometries=geojson&alternatives=false')
          .catch(netError('routing service'))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('The routing service did not answer.'))))
          .then((j) => {
            if (!j.routes || !j.routes.length) throw new Error('No driveable route between those two points.');
            buildRoute(a, b, j.routes[0].geometry.coordinates);
            return waitFor(() => !!(S.route && S.route.hits), 20000, 'The route check did not finish.');
          }))
        .then(settle)
        .then(() => {
          const toll = splitDC($('rt-nums'));
          const stretches = [...document.querySelectorAll('.hs-row')].map((row) => ({
            miles: (row.querySelector('.hs-mi') || {}).textContent || null,
            road: (row.querySelector('.hs-road') || {}).textContent || null,
            toll: splitDC(row.querySelector('.hs-nums')),
            lat: Number(row.dataset.lat),
            lng: Number(row.dataset.lng),
          }));
          const v = viewState();
          v.route = Object.assign(v.route || {}, { worstStretches: stretches });
          return ok(Math.round(S.route.totalMi) + ' miles, ' + yearSpan() + ': '
            + tollLine(toll) + ' within a quarter mile of this drive.'
            + (stretches.length
              ? '\nWorst stretches:\n' + stretches.map((s) => s.miles + ' · ' + s.road
                + ' · ' + tollLine(s.toll)).join('\n')
              : '\nNo recorded deaths along this route in the chosen years.'), v);
        }),
    },
    {
      name: 'list_crashes_in_view',
      description: 'List the individual fatal crashes currently plotted, deadliest first, with the case id needed by get_crash_record. Needs the map zoomed in far enough for dots to appear; if a pin is set the list is limited to its ring.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'How many crashes to return, 1-200. Default 25.' },
        },
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        const crashes = renderedCrashes(Math.min(200, Math.max(1, args.limit || 25)));
        if (!crashes.length) {
          throw new Error(dotsVisible()
            ? 'No crashes plotted in this view for ' + yearSpan() + '.'
            : 'No individual crashes are plotted at zoom ' + S.map.getZoom().toFixed(1)
              + '. Zoom to level ' + TILE_MIN
              + ' or closer with set_map_view, or isolate a road or route first.');
        }
        return ok(crashes.map((c) => c.year + ' · ' + (c.road || 'unnamed road') + ' · '
          + c.state + ' · ' + c.deaths + ' killed · case ' + c.caseId).join('\n'),
        { crashes, yearRange: { from: years()[S.yearLo], to: years()[S.yearHi] } });
      }),
    },
    {
      name: 'get_crash_record',
      description: 'Pull the full FARS case file for one crash: date and time, conditions, every vehicle with speed and outcome, every person with age, restraint and injury. Use case ids from list_crashes_in_view.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'State name or two-digit FIPS code, e.g. "Arizona" or "04".' },
          year: { type: 'integer', description: 'Crash year, 2001-2024.' },
          caseId: { type: 'integer', description: 'FARS case number from list_crashes_in_view.' },
        },
        required: ['state', 'year', 'caseId'],
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        const state = fipsFor(args.state);
        if (yearIndex(args.year) < 0) throw new Error('This map only covers ' + years()[0] + '–' + years()[years().length - 1] + '.');
        return getShard(args.year, state.fips).then((shard) => {
          const rec = shard.c[String(args.caseId)];
          if (!rec) throw new Error('No case ' + args.caseId + ' in ' + state.name + ' for ' + args.year + '.');
          const road = (renderedCrashes(100000).find((c) => c.caseId === args.caseId
            && c.year === args.year && c.stateFips === state.fips) || {}).road;
          const crash = decodeCrash(rec, shard.s, args.year, args.caseId, state.name, road);
          const who = crash.people
            .filter((p) => p.injury === 'Killed')
            .map((p) => [p.role, p.age == null ? null : p.age + (p.sex || '')].filter(Boolean).join(' '))
            .join(', ');
          return ok(crash.deaths + ' killed on ' + (crash.road || 'an unnamed road') + ', '
            + [crash.when.dayOfWeek, crash.when.month, crash.when.day, crash.year].filter(Boolean).join(' ')
            + (crash.when.time ? ' at ' + crash.when.time : '') + ' — ' + state.name + '. '
            + crash.vehicleCount + ' vehicle(s), ' + crash.peopleInvolved + ' people involved.'
            + (who ? ' Killed: ' + who + '.' : ''), crash);
        });
      }),
    },
    {
      name: 'capture_map_screenshot',
      description: 'Take a PNG of the map exactly as the user sees it, so you can look at the heat field, the plotted crashes or a coloured route yourself. Returns the picture plus the same numbers get_map_view reports. The map canvas only; side panels are HTML and are described in the text instead.',
      inputSchema: {
        type: 'object',
        properties: {
          maxWidth: { type: 'integer', description: 'Longest edge in pixels, 320-3000. Default 1280.' },
        },
        additionalProperties: false,
      },
      execute: (args) => ready().then(settle).then(() => {
        const v = viewState();
        const bits = ['Map at zoom ' + v.zoom + ', ' + yearSpan() + ', '
          + v.basemap + ' basemap — ' + fmt(v.inView.deaths) + ' deaths in '
          + fmt(v.inView.crashes) + ' crashes in view.'];
        if (v.pin) bits.push('Pin: ' + v.pin.name + ', ' + v.pin.radiusMiles + '-mile ring.');
        if (v.road) bits.push('Road isolated: ' + v.road.name + ' — ' + tollLine(v.road.toll) + '.');
        if (v.route) bits.push('Route: ' + v.route.from + ' → ' + v.route.to + ', '
          + v.route.miles + ' mi — ' + tollLine(v.route.toll) + '.');
        if (!v.individualCrashesVisible) bits.push('Zoomed out — heat field, not individual crashes.');
        return withShot(bits.join(' '), v, snapshot(args.maxWidth));
      }),
    },
    {
      name: 'set_basemap',
      description: 'Switch the basemap. "dark" is the default CARTO Dark Matter, best for reading the heat field; "street" shows road names and buildings, better for a screenshot of one neighbourhood.',
      inputSchema: {
        type: 'object',
        properties: {
          style: { type: 'string', enum: ['dark', 'street'], description: 'Which basemap to show.' },
        },
        required: ['style'],
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        const want = args.style === 'street' ? 'light' : 'dark';
        if (want === S.base) return ok('Already on the ' + args.style + ' basemap.', viewState());
        setBase(want);
        return waitFor(() => S.base === want && S.layersReady, 20000, 'That basemap did not load.')
          .then(settle)
          .then(() => ok('Switched to the ' + args.style + ' basemap.', viewState()));
      }),
    },
    {
      name: 'clear_selection',
      description: 'Drop the pin, the isolated road and the route check and go back to the whole country. Use it before starting a different question.',
      inputSchema: {
        type: 'object',
        properties: {
          recenter: { type: 'boolean', description: 'Also fit the map back to the lower 48. Default true.' },
        },
        additionalProperties: false,
      },
      execute: (args) => ready().then(() => {
        clearRoute();
        clearRoad();
        clearPin();
        if (args.recenter !== false) fitUS(0);
        return settle().then(() => ok('Cleared back to the national view for ' + yearSpan() + '.', viewState()));
      }),
    },
  ];

  function wrap(tool) {
    const run = tool.execute;
    return Object.assign({}, tool, {
      execute: (input) => Promise.resolve()
        .then(() => run(input || {}))
        .catch((err) => ({
          content: [{ type: 'text', text: (err && err.message) || String(err) }],
          isError: true,
        })),
    });
  }

  const tools = TOOLS.map(wrap);

  if (typeof HOST.registerTool === 'function') {
    for (const tool of tools) {
      try {
        Promise.resolve(HOST.registerTool(tool)).catch((e) => console.warn('webmcp:', tool.name, e));
      } catch (e) {
        console.warn('webmcp:', tool.name, e);
      }
    }
  } else if (typeof HOST.provideContext === 'function') {
    HOST.provideContext({ tools });
  }
}());
