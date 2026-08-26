#!/usr/bin/env python3
"""
Convert the us-atlas states TopoJSON into a small GeoJSON outline used as a
fallback layer when basemap tiles are unavailable.

Usage:
    python3 scripts/build_states.py [path/to/states-10m.json] [--out data/us-states.json]

The input defaults to downloading https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json.
Arcs are simplified with Douglas-Peucker *before* rings are stitched, so
shared state borders stay identical on both sides.
"""
import json
import math
import sys
import urllib.request

URL = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
TOLERANCE = 0.03  # degrees


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    out = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        out.append(pts)
    return out


def simplify(points, tol):
    if len(points) <= 2:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-12
        worst, wi = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dx * (ay - py) - (ax - px) * dy) / norm
            if d > worst:
                worst, wi = d, i
        if worst > tol:
            keep[wi] = True
            stack.append((a, wi))
            stack.append((wi, b))
    return [p for p, k in zip(points, keep) if k]


def ring_coords(arc_indices, arcs):
    pts = []
    for idx in arc_indices:
        seg = arcs[idx] if idx >= 0 else list(reversed(arcs[~idx]))
        if pts:
            seg = seg[1:]  # drop duplicated join point
        pts.extend(seg)
    return [[round(x, 3), round(y, 3)] for x, y in pts]


def geom_to_geojson(geom, arcs):
    t = geom["type"]
    if t == "Polygon":
        return {"type": "Polygon",
                "coordinates": [ring_coords(r, arcs) for r in geom["arcs"]]}
    if t == "MultiPolygon":
        return {"type": "MultiPolygon",
                "coordinates": [[ring_coords(r, arcs) for r in poly]
                                for poly in geom["arcs"]]}
    raise ValueError(f"unsupported geometry {t}")


def main():
    src = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
    out = "data/us-states.json"
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]

    if src:
        with open(src, encoding="utf-8") as f:
            topo = json.load(f)
    else:
        print(f"downloading {URL}")
        with urllib.request.urlopen(URL, timeout=120) as resp:
            topo = json.load(resp)

    arcs = [simplify(a, TOLERANCE) for a in decode_arcs(topo)]
    feats = []
    for g in topo["objects"]["states"]["geometries"]:
        feats.append({
            "type": "Feature",
            "properties": {"name": g.get("properties", {}).get("name", "")},
            "geometry": geom_to_geojson(g, arcs),
        })
    fc = {"type": "FeatureCollection", "features": feats}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(fc, f, separators=(",", ":"))
    import os
    print(f"wrote {out} ({os.path.getsize(out)/1e3:.0f} KB, {len(feats)} states)")


if __name__ == "__main__":
    main()
