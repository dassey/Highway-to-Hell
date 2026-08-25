#!/usr/bin/env python3
import argparse
import csv
import datetime
import io
import json
import math
import os
import re
import sys
import urllib.request
import zipfile

NHTSA_URL = "https://static.nhtsa.gov/nhtsa/downloads/FARS/{y}/National/FARS{y}NationalCSV.zip"

NULLISH = {
    "", "0", "-", "--", "UNKNOWN", "UNK", "NOT REPORTED", "NONE", "NULL",
    "N/A", "NA", "NO NAME", "NO STREET NAME", "UNNAMED", "UNNAMED ST",
    "NOT APPLICABLE", "UNKNOWN ROAD",
}

WS = re.compile(r"\s+")
INV_CODE = re.compile(r"^([A-Z]{1,3})-?(\d{4,7})[/\s]+(\S.*)$")
ZERO_PAD = re.compile(r"^([A-Z]{1,3})-0+(\d+)$")
COUNTY_SUFFIX = re.compile(r"\s*\(\d+\)\s*$")

BAD_NAME = {"", "UNKNOWN", "NOT REPORTED", "NOT APPLICABLE", "NONE", "NO",
            "TRAFFICWAY NOT IN STATE INVENTORY", "REPORTED AS UNKNOWN",
            "UNKNOWN/NOT REPORTED", "NOT REPORTED NOT REPORTED",
            "UNKNOWN MAKE UNKNOWN (AS TO AUTOMOBILE, MOTORED CYCLE, LIGHT TRUCK OR TRUCK)"}

ROAD_FNC_2010 = {
    1: ("Rural", "Principal Arterial - Interstate"),
    2: ("Rural", "Principal Arterial - Other"),
    3: ("Rural", "Minor Arterial"),
    4: ("Rural", "Major Collector"),
    5: ("Rural", "Minor Collector"),
    6: ("Rural", "Local Road or Street"),
    9: ("Rural", None),
    11: ("Urban", "Principal Arterial - Interstate"),
    12: ("Urban", "Principal Arterial - Other Freeways or Expressways"),
    13: ("Urban", "Other Principal Arterial"),
    14: ("Urban", "Minor Arterial"),
    15: ("Urban", "Collector"),
    16: ("Urban", "Local Road or Street"),
    19: ("Urban", None),
}

INJ_SHORT = {
    "Fatal Injury (K)": "Killed",
    "Suspected Serious Injury (A)": "Serious injury",
    "Suspected Serious Injury(A)": "Serious injury",
    "Suspected Minor Injury (B)": "Minor injury",
    "Suspected Minor Injury(B)": "Minor injury",
    "Possible Injury (C)": "Possible injury",
    "No Apparent Injury (O)": "Uninjured",
    "Injured, Severity Unknown": "Injured",
    "Died Prior to Crash*": "Died prior to crash",
}

PTYPE_SHORT = {
    "Driver of a Motor Vehicle In-Transport": "Driver",
    "Passenger of a Motor Vehicle In-Transport": "Passenger",
    "Occupant of a Motor Vehicle Not In-Transport": "Occupant of parked vehicle",
    "Occupant of a Non-Motor Vehicle Transport Device": "Occupant of non-motor transport",
    "Person on a Personal Conveyance": "Person on personal conveyance",
    "Person In/On a Building": "Person in/on a building",
}

DOA_SHORT = {
    "Died at Scene": "Died at scene",
    "Died En Route": "Died en route",
}


def clean_road_name(name):
    name = WS.sub(" ", name.strip())
    m = INV_CODE.match(name)
    if m and int(m.group(2)) >= 1000 and any(c.isalpha() for c in m.group(3)):
        name = m.group(3).strip()
    m = ZERO_PAD.match(name)
    if m:
        name = f"{m.group(1)}-{int(m.group(2))}"
    return name


def coord_ok(lat, lon):
    if not (15.0 <= lat <= 72.0):
        return False
    return (-180.0 <= lon <= -60.0) or (165.0 <= lon <= 180.0)


def fetch_zip(year, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, f"FARS{year}.zip")
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    url = NHTSA_URL.format(y=year)
    print(f"downloading {url}", flush=True)
    with urllib.request.urlopen(url, timeout=300) as resp, open(path + ".part", "wb") as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    os.replace(path + ".part", path)
    return path


def read_rows(zf, base):
    name = next(n for n in zf.namelist() if n.lower().rsplit("/", 1)[-1] == base + ".csv")
    with zf.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", newline="")
        for row in csv.DictReader(text):
            yield {k.upper().strip(): (v or "").strip() for k, v in row.items()}


def to_int(v, default=-1):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def titlecase(s):
    return " ".join(w.capitalize() for w in s.lower().split())


class Harvest:
    def __init__(self):
        self.maps = {}

    def learn(self, field, code, name):
        if code < 0 or not name or name.upper() in BAD_NAME:
            return
        self.maps.setdefault(field, {}).setdefault(code, name)

    def get(self, field, code):
        if code < 0:
            return None
        return self.maps.get(field, {}).get(code)


class Shard:
    def __init__(self, year):
        self.year = year
        self.strings = []
        self.index = {}
        self.crashes = {}

    def intern(self, s):
        if s is None:
            return -1
        s = s.strip()
        if not s or s.upper() in BAD_NAME:
            return -1
        i = self.index.get(s)
        if i is None:
            i = len(self.strings)
            self.strings.append(s)
            self.index[s] = i
        return i


def resolve(shard, harvest, field, row, code_col, code, is_named_year):
    if is_named_year:
        name = row.get(code_col + "NAME", "")
        if name and name.upper() not in BAD_NAME:
            harvest.learn(field, code, name)
            return shard.intern(name)
    return shard.intern(harvest.get(field, code))


def build_year(year, zf, harvest, points, shards_dir, states, state_idx, stfips,
               roads, road_idx, year_i, per_year, dropped):
    vehicles = {}
    persons = {}

    VEH_NAMES = ("MAK_MODNAME", "MAKENAME", "BODY_TYPNAME", "ROLLOVERNAME", "SPEEDRELNAME")
    PER_NAMES = ("PER_TYPNAME", "INJ_SEVNAME", "REST_USENAME", "EJECTIONNAME", "DOANAME")

    for row in read_rows(zf, "vehicle"):
        sc = to_int(row.get("ST_CASE"))
        named = "MAKENAME" in row
        row_slim = {k: row[k] for k in VEH_NAMES if k in row}
        modyear = to_int(row.get("MOD_YEAR"))
        if modyear >= 9000 or modyear < 1900:
            modyear = -1
        travsp = to_int(row.get("TRAV_SP"))
        if not (0 <= travsp <= 200 or travsp == 997):
            travsp = -1
        spdlim = to_int(row.get("VSPD_LIM"))
        if not (5 <= spdlim <= 90):
            spdlim = -1
        hitrun = 1 if 1 <= to_int(row.get("HIT_RUN"), 0) <= 7 else 0
        spdrel_code = to_int(row.get("SPEEDREL"))
        vehicles.setdefault(sc, []).append({
            "row": row_slim, "named": named, "modyear": modyear,
            "makmod": to_int(row.get("MAK_MOD")), "make": to_int(row.get("MAKE")),
            "body": to_int(row.get("BODY_TYP")), "deaths": to_int(row.get("DEATHS"), 0),
            "drink": 1 if to_int(row.get("DR_DRINK"), 0) == 1 else 0,
            "hitrun": hitrun, "rollover": to_int(row.get("ROLLOVER")),
            "fire": 1 if to_int(row.get("FIRE_EXP"), 0) == 1 else 0,
            "travsp": travsp, "spdlim": spdlim, "spdrel": spdrel_code,
        })

    for row in read_rows(zf, "person"):
        sc = to_int(row.get("ST_CASE"))
        named = "PER_TYPNAME" in row
        row_slim = {k: row[k] for k in PER_NAMES if k in row}
        age = to_int(row.get("AGE"))
        if not (0 <= age <= 130):
            age = -1
        sex_code = to_int(row.get("SEX"))
        sex = "M" if sex_code == 1 else "F" if sex_code == 2 else None
        persons.setdefault(sc, []).append({
            "row": row_slim, "named": named, "vehno": to_int(row.get("VEH_NO"), 0),
            "ptype": to_int(row.get("PER_TYP")), "age": age, "sex": sex,
            "inj": to_int(row.get("INJ_SEV")), "rest": to_int(row.get("REST_USE")),
            "eject": to_int(row.get("EJECTION")), "doa": to_int(row.get("DOA")),
        })

    shards = {}
    kept = 0
    for row in read_rows(zf, "accident"):
        named = "WEATHERNAME" in row
        try:
            lat = float(row.get("LATITUDE") or "nan")
            lon = float(row.get("LONGITUD") or "nan")
            fatals = int(row.get("FATALS") or 0)
        except ValueError:
            dropped[0] += 1
            continue
        if fatals < 1 or not coord_ok(lat, lon):
            dropped[0] += 1
            continue

        sc = to_int(row.get("ST_CASE"))
        st_code = to_int(row.get("STATE"))
        fips = f"{st_code:02d}"
        st_name = row.get("STATENAME") or harvest.get("STATE", st_code) or f"State {st_code}"
        if named:
            harvest.learn("STATE", st_code, st_name)
        si = state_idx.get(st_name)
        if si is None:
            si = len(states)
            states.append(st_name)
            stfips.append(fips)
            state_idx[st_name] = si

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

        shard = shards.get(fips)
        if shard is None:
            shard = shards[fips] = Shard(year)

        county_code = to_int(row.get("COUNTY"))
        county = None
        if "COUNTYNAME" in row:
            cn = COUNTY_SUFFIX.sub("", row.get("COUNTYNAME", ""))
            if cn and cn.upper() not in BAD_NAME:
                county = titlecase(cn)
                harvest.learn(f"COUNTY{fips}", county_code, county)
        if county is None:
            county = harvest.get(f"COUNTY{fips}", county_code)

        city_code = to_int(row.get("CITY"))
        city = None
        if city_code > 0:
            if "CITYNAME" in row:
                cn = row.get("CITYNAME", "")
                if cn and cn.upper() not in BAD_NAME:
                    city = titlecase(cn)
                    harvest.learn(f"CITY{fips}", city_code, city)
            if city is None:
                city = harvest.get(f"CITY{fips}", city_code)

        rururb_i = -1
        func_i = -1
        if "RUR_URB" in row:
            rururb_i = resolve(shard, harvest, "RUR_URB", row, "RUR_URB", to_int(row.get("RUR_URB")), named)
            func_i = resolve(shard, harvest, "FUNC_SYS", row, "FUNC_SYS", to_int(row.get("FUNC_SYS")), named)
        elif "ROAD_FNC" in row:
            rf = ROAD_FNC_2010.get(to_int(row.get("ROAD_FNC")))
            if rf:
                rururb_i = shard.intern(rf[0])
                func_i = shard.intern(rf[1])

        drunk = to_int(row.get("DRUNK_DR")) if "DRUNK_DR" in row else -1
        if drunk < 0:
            vs = vehicles.get(sc, [])
            drunk = sum(v["drink"] for v in vs) if vs else -1

        hour = to_int(row.get("HOUR"))
        if not (0 <= hour <= 23):
            hour = -1
        minute = to_int(row.get("MINUTE"))
        if not (0 <= minute <= 59):
            minute = -1
        dow = to_int(row.get("DAY_WEEK"))
        if not (1 <= dow <= 7):
            dow = -1

        tway2 = clean_road_name(row.get("TWAY_ID2") or "")
        if tway2.upper() in NULLISH:
            tway2 = None

        wrk = resolve(shard, harvest, "WRK_ZONE", row, "WRK_ZONE", to_int(row.get("WRK_ZONE")), named)
        if to_int(row.get("WRK_ZONE"), 0) == 0:
            wrk = -1

        rail_raw = (row.get("RAIL") or "").replace("0", "").strip()
        rail = 1 if rail_raw and (row.get("RAIL") or "").upper() not in BAD_NAME else 0

        prs = persons.get(sc, [])
        vhs = vehicles.get(sc, [])

        a = [
            to_int(row.get("MONTH"), 0), to_int(row.get("DAY"), 0), hour, minute, dow,
            fatals, to_int(row.get("VE_TOTAL"), len(vhs)), len(prs),
            shard.intern(county), shard.intern(city),
            shard.intern(tway2),
            resolve(shard, harvest, "ROUTE", row, "ROUTE", to_int(row.get("ROUTE")), named),
            rururb_i, func_i,
            resolve(shard, harvest, "HARM_EV", row, "HARM_EV", to_int(row.get("HARM_EV")), named),
            resolve(shard, harvest, "MAN_COLL", row, "MAN_COLL", to_int(row.get("MAN_COLL")), named),
            resolve(shard, harvest, "RELJCT2", row, "RELJCT2", to_int(row.get("RELJCT2")), named),
            resolve(shard, harvest, "TYP_INT", row, "TYP_INT", to_int(row.get("TYP_INT")), named),
            resolve(shard, harvest, "REL_ROAD", row, "REL_ROAD", to_int(row.get("REL_ROAD")), named),
            wrk, 1 if to_int(row.get("SCH_BUS"), 0) == 1 else 0, rail,
            resolve(shard, harvest, "LGT_COND", row, "LGT_COND", to_int(row.get("LGT_COND")), named),
            resolve(shard, harvest, "WEATHER", row, "WEATHER", to_int(row.get("WEATHER")), named),
            drunk,
        ]

        v_out = []
        for v in vhs:
            vrow, vnamed = v["row"], v["named"]
            mm = -1
            if vnamed:
                mm_name = vrow.get("MAK_MODNAME", "")
                if mm_name and mm_name.upper() not in BAD_NAME:
                    harvest.learn("MAK_MOD", v["makmod"], mm_name)
                    mm = shard.intern(mm_name)
                mk_name = vrow.get("MAKENAME", "")
                if mk_name and mk_name.upper() not in BAD_NAME:
                    harvest.learn("MAKE", v["make"], mk_name)
            if mm < 0:
                mm = shard.intern(harvest.get("MAK_MOD", v["makmod"]) or harvest.get("MAKE", v["make"]))
            roll = resolve(shard, harvest, "ROLLOVER", vrow, "ROLLOVER", v["rollover"], vnamed)
            if v["rollover"] <= 0:
                roll = -1
            spdrel = -1
            if v["spdrel"] in (2, 3, 4, 5):
                spdrel = resolve(shard, harvest, "SPEEDREL", vrow, "SPEEDREL", v["spdrel"], vnamed)
                if spdrel < 0:
                    spdrel = shard.intern("Speeding involved")
            elif v["spdrel"] == 1:
                spdrel = shard.intern("Speeding involved")
            v_out.append([
                v["modyear"], mm,
                resolve(shard, harvest, "BODY_TYP", vrow, "BODY_TYP", v["body"], vnamed),
                v["deaths"], v["drink"], v["hitrun"], roll, v["fire"],
                v["travsp"], v["spdlim"], spdrel,
            ])

        p_out = []
        for p in prs:
            prow, pnamed = p["row"], p["named"]
            rest = -1
            if pnamed:
                rest = resolve(shard, harvest, "", prow, "REST_USE", -1, True)
            eject = -1
            if p["eject"] in (1, 2, 3):
                eject = resolve(shard, harvest, "EJECTION", prow, "EJECTION", p["eject"], pnamed)
                if eject < 0:
                    eject = shard.intern("Ejected")
            doa = -1
            if p["doa"] in (7, 8):
                nm = prow.get("DOANAME", "") if pnamed else None
                nm = DOA_SHORT.get(nm, nm) if nm else ("Died at scene" if p["doa"] == 7 else "Died en route")
                doa = shard.intern(nm)
            ptype_i = -1
            if pnamed:
                nm = prow.get("PER_TYPNAME", "")
                nm = PTYPE_SHORT.get(nm, nm)
                if nm and nm.upper() not in BAD_NAME:
                    harvest.learn("PER_TYP", p["ptype"], nm)
                    ptype_i = shard.intern(nm)
            if ptype_i < 0:
                ptype_i = shard.intern(harvest.get("PER_TYP", p["ptype"]))
            inj_i = -1
            if pnamed:
                nm = prow.get("INJ_SEVNAME", "")
                nm = INJ_SHORT.get(nm, nm)
                if nm and nm.upper() not in BAD_NAME:
                    harvest.learn("INJ_SEV", p["inj"], nm)
                    inj_i = shard.intern(nm)
            if inj_i < 0:
                inj_i = shard.intern(harvest.get("INJ_SEV", p["inj"]))
            p_out.append([
                p["vehno"], ptype_i, p["age"], shard.intern(p["sex"]),
                inj_i, rest, eject, doa,
            ])

        shard.crashes[str(sc)] = [a, v_out, p_out]

        points.append((si, key, year, round(lat * 1e5), round(lon * 1e5),
                       fatals, year_i, ri, si, sc))
        per_year["crashes"] += 1
        per_year["deaths"] += fatals
        kept += 1

    os.makedirs(shards_dir, exist_ok=True)
    total_bytes = 0
    for fips, shard in shards.items():
        out = {"y": year, "s": shard.strings, "c": shard.crashes}
        path = os.path.join(shards_dir, f"{year}_{fips}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        total_bytes += os.path.getsize(path)
    return kept, len(shards), total_bytes


GRID_RES = 0.1


def write_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def write_outputs(data, data_dir):
    meta = data["meta"]
    years = meta["years"]
    lat, lon, f, y, r, s, c = (data[k] for k in ("lat", "lon", "f", "y", "r", "s", "c"))
    roads = data["roads"]
    states = data["states"]
    stfips = data["stfips"]
    n = len(lat)

    bins = {}
    cells = {}
    for i in range(n):
        bx = math.floor(lon[i] / 1e5 / GRID_RES)
        by = math.floor(lat[i] / 1e5 / GRID_RES)
        bi = bins.setdefault((bx, by), len(bins))
        key = (bi, y[i])
        e = cells.get(key)
        if e is None:
            cells[key] = [f[i], 1]
        else:
            e[0] += f[i]
            e[1] += 1

    order = sorted(bins, key=lambda k: (k[0], k[1]))
    remap = {bins[k]: i for i, k in enumerate(order)}
    cell_rows = sorted(((remap[bi], yi, e[0], e[1]) for (bi, yi), e in cells.items()))

    boot = {
        "meta": dict(meta, packPattern="data/s/{fips}.json"),
        "states": states,
        "stfips": stfips,
        "grid": {
            "res": GRID_RES,
            "bx": [k[0] for k in order],
            "by": [k[1] for k in order],
            "ci": [row[0] for row in cell_rows],
            "cy": [row[1] for row in cell_rows],
            "cw": [row[2] for row in cell_rows],
            "cn": [row[3] for row in cell_rows],
        },
    }
    boot_bytes = write_json(os.path.join(data_dir, "boot.json"), boot)
    print(f"wrote data/boot.json ({boot_bytes/1e6:.2f} MB, "
          f"{len(order)} bins, {len(cell_rows)} bin-years)", flush=True)

    packs = {}
    for i in range(n):
        p = packs.get(s[i])
        if p is None:
            p = packs[s[i]] = {
                "si": s[i], "fips": stfips[s[i]], "state": states[s[i]],
                "roads": [""], "ridx": {0: 0},
                "lat": [], "lon": [], "f": [], "y": [], "r": [], "c": [],
            }
        ri = p["ridx"].get(r[i])
        if ri is None:
            ri = len(p["roads"])
            p["roads"].append(roads[r[i]])
            p["ridx"][r[i]] = ri
        p["lat"].append(lat[i])
        p["lon"].append(lon[i])
        p["f"].append(f[i])
        p["y"].append(y[i])
        p["r"].append(ri)
        p["c"].append(c[i])

    pack_bytes = 0
    biggest = ("", 0)
    for p in packs.values():
        del p["ridx"]
        size = write_json(os.path.join(data_dir, "s", p["fips"] + ".json"), p)
        pack_bytes += size
        if size > biggest[1]:
            biggest = (p["state"], size)
    print(f"wrote {len(packs)} state packs ({pack_bytes/1e6:.1f} MB total, "
          f"largest {biggest[0]} {biggest[1]/1e6:.2f} MB)", flush=True)

    agg = {}
    for i in range(n):
        if r[i] == 0:
            continue
        e = agg.get(r[i])
        if e is None:
            agg[r[i]] = [f[i], 1, {s[i]}]
        else:
            e[0] += f[i]
            e[1] += 1
            e[2].add(s[i])
    road_rows = sorted(agg.items(), key=lambda kv: (-kv[1][0], -kv[1][1]))
    roads_out = {
        "roads": [roads[ri] for ri, _ in road_rows],
        "d": [e[0] for _, e in road_rows],
        "c": [e[1] for _, e in road_rows],
        "st": [sorted(e[2]) for _, e in road_rows],
    }
    roads_bytes = write_json(os.path.join(data_dir, "roads.json"), roads_out)
    print(f"wrote data/roads.json ({roads_bytes/1e6:.2f} MB, {len(road_rows)} roads)", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="+", type=int, default=list(range(2010, 2025)))
    ap.add_argument("--cache", default=".cache/fars")
    ap.add_argument("--out", default=".cache/fars.json")
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--shards", default="data/d")
    ap.add_argument("--from-cache", action="store_true")
    args = ap.parse_args()

    if args.from_cache:
        src = args.out if os.path.exists(args.out) else "data/fars.json"
        print(f"loading {src}", flush=True)
        with open(src, encoding="utf-8") as fh:
            data = json.load(fh)
        write_outputs(data, args.data_dir)
        return 0

    years = sorted(args.years)
    year_idx = {y: i for i, y in enumerate(years)}

    harvest = Harvest()
    states, state_idx, stfips = [], {}, []
    roads, road_idx = [""], {}
    points = []
    dropped = [0]
    per_year = {y: {"crashes": 0, "deaths": 0} for y in years}
    shard_bytes = 0

    for y in sorted(years, reverse=True):
        zp = fetch_zip(y, args.cache)
        with zipfile.ZipFile(zp) as zf:
            kept, nshards, nbytes = build_year(
                y, zf, harvest, points, args.shards, states, state_idx, stfips,
                roads, road_idx, year_idx[y], per_year[y], dropped)
        shard_bytes += nbytes
        print(f"{y}: kept {kept} crashes, {per_year[y]['deaths']} deaths, "
              f"{nshards} shards, {nbytes/1e6:.1f} MB", flush=True)

    points.sort(key=lambda t: (t[0], t[1], t[2]))

    data = {
        "meta": {
            "years": years,
            "generated": datetime.date.today().isoformat(),
            "source": "NHTSA Fatality Analysis Reporting System (FARS), National CSV files",
            "sourceUrl": "https://www.nhtsa.gov/research-data/fatality-analysis-reporting-system-fars",
            "crashes": sum(v["crashes"] for v in per_year.values()),
            "deaths": sum(v["deaths"] for v in per_year.values()),
            "perYear": {str(y): per_year[y] for y in years},
            "dropped": dropped[0],
            "shardPattern": "data/d/{year}_{fips}.json",
        },
        "states": states,
        "stfips": stfips,
        "roads": roads,
        "lat": [t[3] for t in points],
        "lon": [t[4] for t in points],
        "f":   [t[5] for t in points],
        "y":   [t[6] for t in points],
        "r":   [t[7] for t in points],
        "s":   [t[8] for t in points],
        "c":   [t[9] for t in points],
    }

    size = write_json(args.out, data)
    write_outputs(data, args.data_dir)

    print(f"\nwrote {args.out} ({size/1e6:.1f} MB) + shards ({shard_bytes/1e6:.1f} MB)")
    print(f"{len(points)} crashes, {data['meta']['deaths']} deaths, "
          f"{len(roads)-1} roads, dropped {dropped[0]}")
    for y in years:
        print(f"  {y}: {per_year[y]['crashes']} crashes / {per_year[y]['deaths']} deaths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
