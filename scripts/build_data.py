#!/usr/bin/env python3
"""
Build the compact crash dataset for the Highway to Hell map.

Reads NHTSA FARS "National CSV" archives (accident.csv) for the requested
years and writes a single column-oriented JSON file the frontend can load
in one request.

Usage:
    python3 scripts/build_data.py --years 2022 2023 2024
    python3 scripts/build_data.py --years 2022 2023 2024 --cache /path/to/zips

Archives are looked up in the cache directory as FARS<year>.zip and
downloaded from NHTSA if missing:
    https://static.nhtsa.gov/nhtsa/downloads/FARS/<year>/National/FARS<year>NationalCSV.zip

Output schema (data/fars.json), all arrays are parallel per-crash columns:
    meta   : years, totals, generated date, source
    states : state display names            (indexed by `s`)
    roads  : trafficway display names       (indexed by `r`, 0 = unknown)
    lat/lon: WGS84 * 1e5, rounded to int    (~1 m precision)
    f      : deaths in the crash (FATALS)
    y      : index into meta.years
    m      : month 1-12 (0 = unknown)
    r      : road index into `roads`
    s      : state index into `states`

Rows with unknown coordinates (FARS sentinel values 77.7777 / 88.8888 /
99.9999 etc.) are dropped and counted in meta.dropped.
"""
import argparse
import csv
import datetime
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

NHTSA_URL = "https://static.nhtsa.gov/nhtsa/downloads/FARS/{y}/National/FARS{y}NationalCSV.zip"

# TWAY_ID values that mean "no usable road name"
NULLISH = {
    "", "0", "-", "--", "UNKNOWN", "UNK", "NOT REPORTED", "NONE", "NULL",
    "N/A", "NA", "NO NAME", "NO STREET NAME", "UNNAMED", "UNNAMED ST",
    "NOT APPLICABLE", "UNKNOWN ROAD",
}

WS = re.compile(r"\s+")

# State roadway-inventory codes glued onto street names, e.g.
# "MU-6733 16TH ST NW", "CS-200003/HARRIS ST", "CR-0130500 JIM CARTER BLVD".
# Values >= 1000 are inventory codes (signed route numbers are 1-3 digits,
# possibly zero-padded); drop the code when an actual name follows it.
INV_CODE = re.compile(r"^([A-Z]{1,3})-?(\d{4,7})[/\s]+(\S.*)$")
# Zero-padded lone designations: "SR-000300" -> "SR-300", "CR-0645" -> "CR-645"
ZERO_PAD = re.compile(r"^([A-Z]{1,3})-0+(\d+)$")


def clean_road_name(name: str) -> str:
    name = WS.sub(" ", name.strip())
    m = INV_CODE.match(name)
    if m and int(m.group(2)) >= 1000 and any(c.isalpha() for c in m.group(3)):
        name = m.group(3).strip()
    m = ZERO_PAD.match(name)
    if m:
        name = f"{m.group(1)}-{int(m.group(2))}"
    return name


def coord_ok(lat: float, lon: float) -> bool:
    """True for plausible US coordinates; FARS unknown codes fail this."""
    if not (15.0 <= lat <= 72.0):
        return False
    # Continental US / AK / HI / PR, plus far Aleutians east of the antimeridian
    return (-180.0 <= lon <= -60.0) or (165.0 <= lon <= 180.0)


def fetch_zip(year: int, cache: str) -> str:
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, f"FARS{year}.zip")
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    url = NHTSA_URL.format(y=year)
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=300) as resp, open(path + ".part", "wb") as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    os.replace(path + ".part", path)
    return path


def read_accident_rows(zip_path: str):
    with zipfile.ZipFile(zip_path) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith("accident.csv"))
        with zf.open(name) as raw:
            text = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            reader = csv.DictReader(text)
            for row in reader:
                yield {k.upper().strip(): v for k, v in row.items()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="+", type=int, default=[2022, 2023, 2024])
    ap.add_argument("--cache", default=".cache/fars")
    ap.add_argument("--out", default="data/fars.json")
    args = ap.parse_args()

    years = sorted(args.years)
    year_idx = {y: i for i, y in enumerate(years)}

    states, state_idx = [], {}
    roads, road_idx = [""], {}  # index 0 is the "unknown road" sentinel
    rows = []                   # (state_i, road_key, year, lat, lon, f, yi, m, r, s)
    dropped = 0
    per_year = {y: {"crashes": 0, "deaths": 0} for y in years}

    for y in years:
        zp = fetch_zip(y, args.cache)
        n = 0
        for row in read_accident_rows(zp):
            n += 1
            try:
                lat = float(row.get("LATITUDE") or "nan")
                lon = float(row.get("LONGITUD") or "nan")
                fatals = int(row.get("FATALS") or 0)
            except ValueError:
                dropped += 1
                continue
            if fatals < 1 or not coord_ok(lat, lon):
                dropped += 1
                continue

            name = clean_road_name(row.get("TWAY_ID") or "")
            key = name.upper()
            if key in NULLISH:
                ri = 0
            else:
                ri = road_idx.get(key)
                if ri is None:
                    ri = len(roads)
                    roads.append(name)
                    road_idx[key] = ri

            st = (row.get("STATENAME") or "").strip() or "Unknown"
            si = state_idx.get(st)
            if si is None:
                si = len(states)
                states.append(st)
                state_idx[st] = si

            try:
                month = int(row.get("MONTH") or 0)
            except ValueError:
                month = 0
            if not 1 <= month <= 12:
                month = 0

            rows.append((si, key, y, round(lat * 1e5), round(lon * 1e5),
                         fatals, year_idx[y], month, ri, si))
            per_year[y]["crashes"] += 1
            per_year[y]["deaths"] += fatals
        print(f"{y}: {n} rows read, kept {per_year[y]['crashes']}, "
              f"deaths {per_year[y]['deaths']}")

    # Sorting by state/road/year groups repeated indices into runs → smaller gzip
    rows.sort(key=lambda t: (t[0], t[1], t[2]))

    data = {
        "meta": {
            "years": years,
            "generated": datetime.date.today().isoformat(),
            "source": "NHTSA Fatality Analysis Reporting System (FARS), National CSV files",
            "sourceUrl": "https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars",
            "crashes": sum(v["crashes"] for v in per_year.values()),
            "deaths": sum(v["deaths"] for v in per_year.values()),
            "perYear": {str(y): per_year[y] for y in years},
            "dropped": dropped,
        },
        "states": states,
        "roads": roads,
        "lat": [t[3] for t in rows],
        "lon": [t[4] for t in rows],
        "f":   [t[5] for t in rows],
        "y":   [t[6] for t in rows],
        "m":   [t[7] for t in rows],
        "r":   [t[8] for t in rows],
        "s":   [t[9] for t in rows],
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out)
    print(f"\nwrote {args.out}  ({size/1e6:.1f} MB, {len(rows)} crashes, "
          f"{data['meta']['deaths']} deaths, {len(roads)-1} unique roads, dropped {dropped})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
