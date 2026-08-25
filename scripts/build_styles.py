#!/usr/bin/env python3
import json
import urllib.request

DARK_PATH = "assets/vendor/dark-matter-style.json"
LIGHT_PATH = "assets/vendor/liberty-style.json"
LIBERTY_URL = "https://tiles.openfreemap.org/styles/liberty"

ROAD_COLOR_MAP = {
    "#0b0b0b": "#3a3f4a",
    "#161616": "#333844",
    "rgba(22, 22, 22, 1)": "#333844",
    "rgba(65, 71, 88, 1)": "rgba(92, 100, 122, 1)",
    "rgba(73, 73, 73, 1)": "rgba(102, 105, 116, 1)",
    "rgba(83, 86, 102, 1)": "rgba(110, 115, 134, 1)",
    "#262626": "#3d424c",
}

SYMBOL_TUNE = {
    "roadname_major": {"minzoom": 11, "color": "#cbc5bb", "halo": "#0a0a0c", "halow": 1.4},
    "roadname_pri": {"minzoom": 12.5, "color": "#cbc5bb", "halo": "#0a0a0c", "halow": 1.4},
    "roadname_sec": {"minzoom": 13.5, "color": "#b8b2a8", "halo": "#0a0a0c", "halow": 1.3},
    "roadname_minor": {"minzoom": 14.5, "color": "#b8b2a8", "halo": "#0a0a0c", "halow": 1.3},
    "housenumber": {"minzoom": 17, "color": "#7d766d", "halo": "#0e0e0e"},
    "place_suburbs": {"color": "#aaa49c"},
    "watername_sea": {"color": "#5d6b74"},
    "poi_stadium": {"color": "#6f6a63"},
    "poi_park": {"color": "#6f6a63"},
}


def bump_size(v, add):
    if isinstance(v, (int, float)):
        return v + add
    if isinstance(v, dict) and "stops" in v:
        v["stops"] = [[z, s + add] for z, s in v["stops"]]
        return v
    return v


def tune_dark():
    with open(DARK_PATH, encoding="utf-8") as f:
        style = json.load(f)
    meta = style.setdefault("metadata", {})
    if meta.get("h2h-tuned"):
        print(f"{DARK_PATH} already tuned, skipping")
        return
    meta["h2h-tuned"] = True
    for layer in style["layers"]:
        lid = layer["id"]
        paint = layer.setdefault("paint", {})
        layout = layer.setdefault("layout", {})
        if layer.get("source-layer") == "transportation" and layer["type"] == "line":
            c = paint.get("line-color")
            if isinstance(c, str) and c in ROAD_COLOR_MAP:
                paint["line-color"] = ROAD_COLOR_MAP[c]
            elif isinstance(c, dict) and "stops" in c:
                c["stops"] = [[z, ROAD_COLOR_MAP.get(v, v)] for z, v in c["stops"]]
        if lid == "building":
            paint["fill-color"] = {"base": 1, "stops": [[14, "transparent"], [15, "#1a1c21"]]}
        if lid == "building-top":
            paint["fill-color"] = "rgba(47, 50, 59, 1)"
            paint["fill-outline-color"] = "#3b3f49"
            paint["fill-opacity"] = {"base": 1, "stops": [[13, 0], [14.5, 0.92]]}
        t = SYMBOL_TUNE.get(lid)
        if t:
            if "minzoom" in t:
                layer["minzoom"] = t["minzoom"]
            if "color" in t:
                paint["text-color"] = t["color"]
            if "halo" in t:
                paint["text-halo-color"] = t["halo"]
            if "halow" in t:
                paint["text-halo-width"] = t["halow"]
            if lid.startswith("roadname"):
                if "text-size" in layout:
                    layout["text-size"] = bump_size(layout["text-size"], 1)
                else:
                    layout["text-size"] = 12
    with open(DARK_PATH, "w", encoding="utf-8") as f:
        json.dump(style, f, ensure_ascii=False, separators=(",", ":"))
    print(f"tuned {DARK_PATH}")


def vendor_liberty():
    req = urllib.request.Request(LIBERTY_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        style = json.load(r)
    latin = ["coalesce", ["get", "name:latin"], ["get", "name:en"], ["get", "name"]]
    for layer in style.get("layers", []):
        layout = layer.get("layout")
        if not layout:
            continue
        if "text-font" in layout:
            layout["text-font"] = ["Noto Sans Regular"]
        tf = layout.get("text-field")
        if isinstance(tf, list) and "name:nonlatin" in json.dumps(tf):
            layout["text-field"] = latin
    style["name"] = "Liberty Local"
    with open(LIGHT_PATH, "w", encoding="utf-8") as f:
        json.dump(style, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {LIGHT_PATH}")


if __name__ == "__main__":
    tune_dark()
    vendor_liberty()
