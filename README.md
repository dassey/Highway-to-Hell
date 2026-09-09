# Highway to Hell

Every fatal crash on American roads with a known location, 2001–2024.
898,888 people killed in 821,145 crashes.

## What it does

A single-page map. No backend, no build step, no API keys — GitHub Pages serves it.

- **Zoomed out** — a heat field of deaths, filterable by year range with the
  histogram slider. Cells are half a degree (~35 miles), so it fades out by zoom 8.
- **Zoomed in** — from zoom 8 every crash is a dot, and every named road shows
  `deaths\crashes` for the current view. Tap a dot for the FARS case file: date,
  time, conditions, harmful event, each vehicle (year/make/model, speed, rollover,
  fire, hit-and-run), each person (age, role, restraint, ejection, outcome).
- **A pin** — search a place or hit the crosshair for a draggable pin with a
  1/3/5/10-mile ring that scopes every count to it. Lives in the URL and
  localStorage.
- **A road** — search a road name to isolate its crashes coast to coast
  (`I-40` → its whole 24-year toll).
- **A drive** — give it A → B and it counts every death within a quarter mile of
  the route, colors the route by how deadly each stretch has been, and lists the
  worst stretches.
- **Two basemaps** — CARTO Dark Matter by default, an OpenFreeMap street style
  when you need names and buildings.
- **AI agents** — where the browser exposes WebMCP (`document.modelContext`, or
  `navigator.modelContext` before Chrome 150), the page registers 13 tools in
  `assets/js/webmcp.js`: read the view, move the map, set the year range, search
  places and roads, drop the pin, check a route, list plotted crashes, pull one
  case file, screenshot the map, switch basemaps. Browsers without WebMCP run
  none of it.

## Where the data comes from

NHTSA's [Fatality Analysis Reporting System](https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars)
(FARS) National CSV files, `accident` + `vehicle` + `person`, 2001–2024. US
Government work, public domain.

FARS counts deaths within 30 days of a public-road crash. Coordinates exist from
2001 (81.6% coverage that year, ≥92% from 2002, ≈99.5% recently); 1999–2000 have
none, which is why the map starts at 2001. 22,385 crashes (2.7%) have unusable
coordinates and are excluded. Road names are whatever each state reported, so one
highway can appear under several names, and a road crossing state lines counts
each state's stretch separately.

The scripts in `scripts/` turn those CSVs into static files:

| file | contents | size |
| --- | --- | --- |
| `data/boot.json` | national heat grid + metadata | 792 KB (130 KB gzipped) |
| `data/us-states.json` | state outlines | 76 KB |
| `data/t/<z>/<x>/<y>.pbf` | crash dot tiles, zoom 8–9 | 65 MB, 3,256 tiles |
| `data/s/<fips>.json` | per-state crash packs, lazy-loaded | 30 MB total |
| `data/roads.json` | road search index, lazy-loaded | 4.7 MB (1.0 MB gzipped) |
| `data/d/<year>_<fips>.json` | per-crash case files, loaded per tap | 173 MB total |

At runtime the only outside calls are basemap tiles (CARTO, OpenFreeMap), place
search ([Photon](https://photon.komoot.io)), and routing
([OSRM](http://project-osrm.org)). Fonts, glyphs, basemap styles and the renderer
are self-hosted.

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
