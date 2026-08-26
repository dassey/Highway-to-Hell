#!/usr/bin/env python3
import argparse
import json
import math
import os
import shutil
import sys

import numpy as np

KEYS = ("f", "y", "s", "c", "rn")


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def tag(field, wire):
    return varint((field << 3) | wire)


def ld(field, payload):
    return tag(field, 2) + varint(len(payload)) + payload


def zigzag(n):
    return (n << 1) ^ (n >> 63)


def value_msg(v):
    if isinstance(v, str):
        return ld(1, v.encode("utf-8"))
    return tag(4, 0) + varint(int(v))


def encode_tile(rows, extent, layer):
    keys_blob = b"".join(ld(3, k.encode("ascii")) for k in KEYS)
    vals = {}
    val_order = []

    def vi(v):
        i = vals.get(v)
        if i is None:
            i = len(val_order)
            vals[v] = i
            val_order.append(v)
        return i

    feats = []
    for px, py, f, y, s, c, rn in rows:
        tags = (varint(0) + varint(vi(int(f)))
                + varint(1) + varint(vi(int(y)))
                + varint(2) + varint(vi(int(s)))
                + varint(3) + varint(vi(int(c)))
                + varint(4) + varint(vi(rn)))
        geom = varint(9) + varint(zigzag(int(px))) + varint(zigzag(int(py)))
        feats.append(ld(2, ld(2, tags) + tag(3, 0) + varint(1) + ld(4, geom)))

    body = (ld(1, layer.encode("ascii"))
            + b"".join(feats)
            + keys_blob
            + b"".join(ld(4, value_msg(v)) for v in val_order)
            + tag(5, 0) + varint(extent)
            + tag(15, 0) + varint(2))
    return ld(3, body)


def load_points(data_dir):
    lon = []
    lat = []
    f = []
    y = []
    s = []
    c = []
    names = []
    name_idx = {}
    rn = []
    for fp in sorted(os.listdir(os.path.join(data_dir, "s"))):
        if not fp.endswith(".json"):
            continue
        p = json.load(open(os.path.join(data_dir, "s", fp), encoding="utf-8"))
        roads = p["roads"]
        gid = []
        for nm in roads:
            i = name_idx.get(nm)
            if i is None:
                i = len(names)
                name_idx[nm] = i
                names.append(nm)
            gid.append(i)
        gid = np.array(gid, dtype=np.int32)
        lon.append(np.array(p["lon"], dtype=np.int64))
        lat.append(np.array(p["lat"], dtype=np.int64))
        f.append(np.array(p["f"], dtype=np.int16))
        y.append(np.array(p["y"], dtype=np.int16))
        s.append(np.full(len(p["lat"]), p["si"], dtype=np.int16))
        c.append(np.array(p["c"], dtype=np.int64))
        rn.append(gid[np.array(p["r"], dtype=np.int32)])
    return (np.concatenate(lon) / 1e5, np.concatenate(lat) / 1e5,
            np.concatenate(f), np.concatenate(y), np.concatenate(s),
            np.concatenate(c), np.concatenate(rn), names)


def build(data_dir, out_dir, zooms, extents, buffer_frac):
    lon, lat, f, y, s, c, rn, names = load_points(data_dir)
    n = len(lon)
    print(f"{n} points, {len(names)} road names", flush=True)

    latr = np.radians(np.clip(lat, -85.0, 85.0))
    wx = (lon + 180.0) / 360.0
    wy = (1.0 - np.arcsinh(np.tan(latr)) / math.pi) / 2.0

    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)

    manifest = {}
    for z in zooms:
        extent = extents[z]
        nt = 1 << z
        fx = wx * nt
        fy = wy * nt
        tx = np.floor(fx).astype(np.int32)
        ty = np.floor(fy).astype(np.int32)
        px = ((fx - tx) * extent).astype(np.int32)
        py = ((fy - ty) * extent).astype(np.int32)
        buf = int(extent * buffer_frac)

        cells = {}
        for i in range(n):
            x0 = tx[i]
            y0 = ty[i]
            a = px[i]
            b = py[i]
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx or dy:
                        ax = a + dx * extent
                        by = b + dy * extent
                        if not (-buf <= ax <= extent + buf and -buf <= by <= extent + buf):
                            continue
                    else:
                        ax, by = a, b
                    key = (x0 - dx, y0 - dy)
                    if key[0] < 0 or key[1] < 0 or key[0] >= nt or key[1] >= nt:
                        continue
                    cells.setdefault(key, []).append(
                        (ax, by, f[i], y[i], s[i], c[i], names[rn[i]]))

        total = 0
        biggest = 0
        for (x0, y0), rows in cells.items():
            blob = encode_tile(rows, extent, "crashes")
            d = os.path.join(out_dir, str(z), str(x0))
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, f"{y0}.pbf"), "wb") as fh:
                fh.write(blob)
            total += len(blob)
            biggest = max(biggest, len(blob))
        manifest[z] = {"tiles": len(cells), "bytes": total, "max": biggest,
                       "extent": extent}
        print(f"z{z}: {len(cells)} tiles, {total/1e6:.1f} MB, largest {biggest/1e6:.2f} MB, "
              f"extent {extent}", flush=True)
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump({"minzoom": min(zooms), "maxzoom": max(zooms),
                   "levels": {str(k): v for k, v in manifest.items()}}, fh,
                  separators=(",", ":"))
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--out", default="data/t")
    ap.add_argument("--zooms", nargs="+", type=int, default=[8, 9])
    ap.add_argument("--extent", nargs="+", type=int, default=[8192, 16384])
    ap.add_argument("--buffer", type=float, default=0.012)
    args = ap.parse_args()
    zooms = sorted(args.zooms)
    ex = args.extent if len(args.extent) == len(zooms) else [args.extent[0]] * len(zooms)
    m = build(args.data_dir, args.out, zooms, dict(zip(zooms, ex)), args.buffer)
    tot = sum(v["bytes"] for v in m.values())
    print(f"\ntotal {tot/1e6:.1f} MB across {sum(v['tiles'] for v in m.values())} tiles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
