# Highway to Hell

Every fatal crash on American roads with a known location, 2001–2024.
898,888 people killed in 821,145 crashes.

![The national picture](docs/screenshot-national.png)

## What it does

- **Zoom out** for a heat field of the whole country, filterable by year range
  with the histogram slider.
- **Zoom in** and every crash is a dot. Tap one for the FARS case file: date,
  time, conditions, harmful event, each vehicle (year/make/model, speed,
  rollover, fire, hit-and-run), each person (age, role, restraint, ejection,
  outcome).
- **Drop a pin** — search a place or hit the crosshair — and a 1/3/5/10-mile ring
  scopes every count to it.
- **Search a road** to isolate its crashes coast to coast: `I-40` → its whole
  24-year toll.
- **Check a drive** A → B. It counts every death within a quarter mile of the
  route, colors the route by how deadly each stretch has been, and lists the
  worst stretches.
- **Switch basemaps** between CARTO Dark Matter and an OpenFreeMap street style.
- **Drive it from an AI assistant.** Where the browser supports WebMCP, the page
  registers 13 tools (`assets/js/webmcp.js`) — read the view, move the map, set
  years, search places and roads, drop the pin, check a route, list crashes, pull
  a case file, screenshot the map, switch basemaps.

## Where the data comes from

NHTSA's [Fatality Analysis Reporting System](https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars)
(FARS) National CSV files — `accident` + `vehicle` + `person`, 2001–2024. US
Government work, public domain. FARS counts deaths within 30 days of a
public-road crash, and road names are whatever each state reported.

The scripts in `scripts/` turn those CSVs into static files:

| file | contents |
| --- | --- |
| `data/boot.json` | national heat grid + metadata, loaded on boot |
| `data/us-states.json` | state outlines |
| `data/t/<z>/<x>/<y>.pbf` | crash dot tiles |
| `data/s/<fips>.json` | per-state crash packs, lazy-loaded |
| `data/roads.json` | road search index, lazy-loaded |
| `data/d/<year>_<fips>.json` | per-crash case files, loaded per tap |

Basemap tiles come from CARTO and OpenFreeMap, place search from
[Photon](https://photon.komoot.io), routing from [OSRM](http://project-osrm.org).
Everything else is served from this repo.

## Rebuilding

```bash
python3 scripts/build_data.py     # 2001–2024, downloads FARS zips as needed
python3 scripts/build_tiles.py    # crash dot tiles
python3 scripts/build_states.py   # state outlines
```

## Licenses

- Crash data: NHTSA FARS — public domain.
- Basemaps: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
  © [CARTO](https://carto.com/attributions), © [OpenFreeMap](https://openfreemap.org).
- Routing: [OSRM](http://project-osrm.org). Geocoding: [Photon](https://photon.komoot.io).
- Renderer: MapLibre GL JS, BSD-3-Clause (`assets/vendor/MAPLIBRE-LICENSE.txt`).
- Fonts: Anton, Barlow, Barlow Condensed (SIL OFL); glyphs Montserrat, Open Sans,
  Noto Sans (SIL OFL / Apache-2.0).

Not affiliated with NHTSA or USDOT.
