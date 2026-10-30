#!/usr/bin/env python3
import argparse
import json
import math
import os
import sys

A_HR, A_DOW, A_VEH, A_RURURB, A_HARM, A_MANCOLL, A_RELJCT, A_LGT, A_DRUNK = 2, 4, 6, 12, 14, 15, 16, 22, 24
V_BODY, V_DEATHS, V_HITRUN, V_SPDREL = 2, 3, 5, 10
P_VEHNO, P_PTYPE, P_AGE, P_INJ, P_REST = 0, 1, 2, 4, 5

FACTORS = [
    ("P", 2001), ("B", 2001), ("M", 2001), ("K", 2001),
    ("D", 2001), ("S", 2009), ("U", 2015), ("H", 2001), ("T", 2001), ("Y", 2001), ("O", 2001),
    ("N", 2001), ("R", 2001), ("F", 2001), ("X", 2010), ("I", 2010),
]
LETTERS = "".join(L for L, _ in FACTORS)
BIT = {L: 1 << i for i, L in enumerate(LETTERS)}

CYCLISTS = {"Bicyclist", "Other Pedalcyclist", "Other Cyclist"}
UNBELTED = {"None Used/Not Applicable", "None Used / Not Applicable", "None Used"}
OCCUPANTS = {"Driver", "Passenger"}
DARK = {"Dark - Not Lighted", "Dark - Lighted", "Dark - Unknown Lighting"}
INTERSECTION = {"Intersection", "Intersection-Related"}
LARGE_TRUCK_PREFIX = (
    "Truck-tractor", "Single-unit straight truck", "Medium/heavy Pickup",
    "Step van (GVWR greater than 10,000", "Unknown medium/heavy truck type",
    "Unknown if single unit or combination unit Heavy Truck",
)
NO_BELTS = ("ATV", "Snowmobile", "Golf Cart", "Recreational Off-Highway", "Multipurpose Off-Highway",
            "Farm equipment", "Construction equipment")
OFF_ROAD = {
    "Rollover/Overturn", "Tree (Standing Only)", "Ditch", "Curb", "Embankment", "Guardrail Face",
    "Utility Pole/Light Support", "Culvert", "Fence", "Other Fixed Object", "Mail Box",
    "Traffic Sign Support", "Concrete Traffic Barrier", "Post, Pole or Other Supports",
    "Bridge Pier or Support", "Guardrail End", "Bridge Rail (Includes parapet)", "Wall", "Building",
    "Immersion or Partial Immersion", "Cable Barrier", "Boulder", "Shrubbery", "Other Traffic Barrier",
    "Ground", "Impact Attenuator/Crash Cushion", "Fire Hydrant", "Traffic Signal Support",
    "Snow Bank", "Other Post, Other Pole or Other Supports", "Bridge Overhead Structure",
    "Unknown Fixed Object", "Bridge Parapet End",
}


def is_moto(body):
    return bool(body) and ("otorcycle" in body or "Moped" in body or "Motor Scooter" in body
                           or "motored cycle" in body)


def is_belted_kind(body):
    return not is_moto(body) and not (body or "").startswith(NO_BELTS)


def is_large_truck(body):
    return bool(body) and body.startswith(LARGE_TRUCK_PREFIX)


def flags_for(rec, strings):
    st = lambda i: strings[i] if 0 <= i < len(strings) else None
    a, vehs, pers = rec
    k = 0
    if a[A_DRUNK] > 0:
        k |= BIT["D"]
    if st(a[A_RURURB]) == "Rural":
        k |= BIT["R"]
    if st(a[A_LGT]) in DARK:
        k |= BIT["N"]
    if st(a[A_MANCOLL]) == "Front-to-Front":
        k |= BIT["X"]
    if st(a[A_RELJCT]) in INTERSECTION:
        k |= BIT["I"]
    for v in vehs:
        body = st(v[V_BODY])
        if v[V_SPDREL] >= 0:
            k |= BIT["S"]
        if v[V_HITRUN]:
            k |= BIT["H"]
        if is_large_truck(body):
            k |= BIT["T"]
        if is_moto(body) and v[V_DEATHS] > 0:
            k |= BIT["M"]
    non_motorist = False
    for p in pers:
        ptype = st(p[P_PTYPE])
        killed = st(p[P_INJ]) == "Killed"
        age = p[P_AGE]
        if ptype not in OCCUPANTS and ptype is not None:
            non_motorist = True
        if killed:
            if ptype == "Pedestrian":
                k |= BIT["P"]
            elif ptype in CYCLISTS:
                k |= BIT["B"]
            if 0 <= age <= 14:
                k |= BIT["K"]
            if (ptype in OCCUPANTS and st(p[P_REST]) in UNBELTED
                    and 1 <= p[P_VEHNO] <= len(vehs) and is_belted_kind(st(vehs[p[P_VEHNO] - 1][V_BODY]))):
                k |= BIT["U"]
        if ptype == "Driver":
            if 15 <= age <= 20:
                k |= BIT["Y"]
            elif age >= 65:
                k |= BIT["O"]
    if a[A_VEH] == 1 and not non_motorist and st(a[A_HARM]) in OFF_ROAD:
        k |= BIT["F"]
    hr, dow = a[A_HR], a[A_DOW]
    t = (dow - 1) * 24 + hr if 0 <= hr <= 23 and 1 <= dow <= 7 else -1
    return k, t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    args = ap.parse_args()
    dd = args.data_dir

    boot = json.load(open(os.path.join(dd, "boot.json"), encoding="utf-8"))
    years = boot["meta"]["years"]
    ny = len(years)
    g = boot["grid"]
    res = g["res"]
    cell_of = {(bx, by): i for i, (bx, by) in enumerate(zip(g["bx"], g["by"]))}

    nat_d = {L: [0] * ny for L in LETTERS}
    nat_c = {L: [0] * ny for L in LETTERS}
    when = [[0] * 168 for _ in range(ny)]
    fwhen = {L: [[0] * 168 for _ in range(ny)] for L in LETTERS}
    grids = {L: {} for L in LETTERS}
    shard_cache = {}
    missing = 0

    os.makedirs(os.path.join(dd, "f"), exist_ok=True)
    for fips in boot["stfips"]:
        pack = json.load(open(os.path.join(dd, "s", fips + ".json"), encoding="utf-8"))
        shard_cache.clear()
        ks, ts = [], []
        for i in range(len(pack["lat"])):
            yi = pack["y"][i]
            year = years[yi]
            key = (year, fips)
            shard = shard_cache.get(key)
            if shard is None:
                path = os.path.join(dd, "d", f"{year}_{fips}.json")
                shard = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"s": [], "c": {}}
                shard_cache[key] = shard
            rec = shard["c"].get(str(pack["c"][i]))
            if rec is None:
                missing += 1
                ks.append(0)
                ts.append(-1)
                continue
            k, t = flags_for(rec, shard["s"])
            ks.append(k)
            ts.append(t)
            f = pack["f"][i]
            if t >= 0:
                when[yi][t] += f
            if not k:
                continue
            cell = cell_of[(math.floor(pack["lon"][i] / 1e5 / res), math.floor(pack["lat"][i] / 1e5 / res))]
            for L in LETTERS:
                if k & BIT[L]:
                    nat_d[L][yi] += f
                    nat_c[L][yi] += 1
                    if t >= 0:
                        fwhen[L][yi][t] += f
                    e = grids[L].get((cell, yi))
                    if e is None:
                        grids[L][(cell, yi)] = [f, 1]
                    else:
                        e[0] += f
                        e[1] += 1
        with open(os.path.join(dd, "f", fips + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"k": ks, "t": ts}, fh, separators=(",", ":"))
        print(f"{fips} {pack['state']}: {len(ks)} crashes", flush=True)

    os.makedirs(os.path.join(dd, "g"), exist_ok=True)
    for L in LETTERS:
        rows = sorted((ci, yi, e[0], e[1]) for (ci, yi), e in grids[L].items())
        with open(os.path.join(dd, "g", L + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"ci": [r[0] for r in rows], "cy": [r[1] for r in rows],
                       "cw": [r[2] for r in rows], "cn": [r[3] for r in rows],
                       "when": fwhen[L]}, fh,
                      separators=(",", ":"))

    with open(os.path.join(dd, "why.json"), "w", encoding="utf-8") as fh:
        json.dump({"letters": LETTERS, "since": {L: y for L, y in FACTORS},
                   "d": nat_d, "c": nat_c, "when": when}, fh, separators=(",", ":"))

    total = sum(boot["meta"]["perYear"][str(y)]["deaths"] for y in years)
    print(f"\n{missing} crashes without a case file")
    for L, since in FACTORS:
        lo = years.index(since)
        cov = sum(boot["meta"]["perYear"][str(y)]["deaths"] for y in years[lo:])
        d = sum(nat_d[L][lo:])
        print(f"  {L} since {since}: {d} deaths, {d / cov * 100:.1f}% of {cov}")
    print(f"  all: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
