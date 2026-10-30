#!/usr/bin/env python3
import argparse
import json
import math
import os
import struct
import sys

import numpy as np

MAGIC = b"H2H3"
BITS = 14


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    args = ap.parse_args()
    dd = args.data_dir

    boot = json.load(open(os.path.join(dd, "boot.json"), encoding="utf-8"))
    ny = len(boot["meta"]["years"])
    lon, lat, f, y, k = [], [], [], [], []
    for fips in boot["stfips"]:
        p = json.load(open(os.path.join(dd, "s", fips + ".json"), encoding="utf-8"))
        lon += p["lon"]
        lat += p["lat"]
        f += p["f"]
        y += p["y"]
        fpath = os.path.join(dd, "f", fips + ".json")
        k += json.load(open(fpath, encoding="utf-8"))["k"] if os.path.exists(fpath) else [0] * len(p["lat"])

    lon = np.array(lon, dtype=np.float64) / 1e5
    lat = np.clip(np.array(lat, dtype=np.float64) / 1e5, -85, 85)
    mx = (lon + 180.0) / 360.0
    my = (1.0 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2.0
    top = (1 << BITS) - 1
    x0, x1 = mx.min() - 1e-6, mx.max() + 1e-6
    y0, y1 = my.min() - 1e-6, my.max() + 1e-6
    qx = np.round((mx - x0) / (x1 - x0) * top).astype(np.int64)
    qy = np.round((my - y0) / (y1 - y0) * top).astype(np.int64)
    order = np.lexsort((qx, qy))
    n = len(order)
    sx, sy = qx[order], qy[order]
    dy = np.diff(sy, prepend=0)
    dx = np.where(dy != 0, sx, np.diff(sx, prepend=0))

    with open(os.path.join(dd, "heat.bin"), "wb") as fh:
        fh.write(MAGIC + struct.pack("<IHH4d", n, ny, top, x0, x1, y0, y1))
        fh.write(dx.astype(np.uint16).tobytes())
        fh.write(dy.astype(np.uint16).tobytes())
        fh.write(np.array(y, dtype=np.uint8)[order].tobytes())
        fh.write(np.minimum(np.array(f), 255).astype(np.uint8)[order].tobytes())
    with open(os.path.join(dd, "heat-k.bin"), "wb") as fh:
        fh.write(MAGIC + struct.pack("<I", n))
        fh.write(np.array(k, dtype=np.uint16)[order].tobytes())

    print(f"{n} crashes, {ny} years -> data/heat.bin "
          f"({os.path.getsize(os.path.join(dd, 'heat.bin')) / 1e6:.2f} MB), data/heat-k.bin "
          f"({os.path.getsize(os.path.join(dd, 'heat-k.bin')) / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
