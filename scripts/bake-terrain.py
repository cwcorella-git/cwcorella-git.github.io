#!/usr/bin/env python3
"""Bake the real western skyline from downtown Reno into a lit-able panorama.

Writes static/garden/terrain.png for Garden.svelte (src/lib/garden/terrain.ts).

The view is the one ee7cd4a's trace-ridge.mjs traced: azimuth 180° (south, on
the left) to 340° (north-northwest, on the right), looking west at the Carson
Range (Slide Mountain, Mt Rose) running into Peavine Peak. Each panorama column
is one azimuth; each row is one elevation angle. For every column a ray is
marched outward over SRTM-derived elevation, with earth curvature and
refraction, and every pixel row the ray rises past gets that point's:

  - surface normal (true, from the elevation grid),
  - distance (for haze) and elevation (for vegetation and snow bands),
  - horizon angle in 8 compass directions within 8 km, so the browser can
    cast real terrain shadows for any sun position without the elevation grid.

Elevation: AWS Terrain Tiles (Terrarium encoding, zoom 11, ~60 m/px), public,
no key. Downloads are cached in --cache (default: a temp dir). Run it only to
change the view or resolution; the output is committed.

    python3 scripts/bake-terrain.py [--cache DIR]

Atlas layout (all RGB, alpha 255, so canvas premultiplication cannot alter it),
stacked vertically, each block NCOL × NROW, row 0 = highest angle:
  block 0: normal (east, north, up) * 127.5 + 127.5
  block 1: R = distance (0 = sky; 1..255 log over D0..D1), G = elevation
           (1100..3500 m over 0..255), B = 255 where terrain, 0 where sky
  block 2..4: horizon angle (0..32° over 0..255) for directions
           N, NE, E, SE, S, SW, W, NW in channel order, last channel unused
"""
import argparse, io, math, os, sys, tempfile, urllib.request
import numpy as np
from PIL import Image

VIEW_LAT, VIEW_LNG = 39.5296, -119.8138   # Virginia St & 1st St
EYE = 30.0                                # metres above ground: a little over the town
AZ0, AZ1 = 180.0, 340.0
NCOL, NROW = 1200, 180
ANG0, ANG1 = -0.35, 6.2                   # elevation angle range, degrees (bottom, top)
D0, D1 = 4000.0, 70000.0                  # march from 4 km (past the town) to 70 km
R_EARTH, K_REFR = 6371000.0, 0.13
Z = 11
HDIRS = 8
HRANGE = 8000.0
OUT = os.path.join(os.path.dirname(__file__), '..', 'static', 'garden', 'terrain.png')


def tile_xy(lat, lng, z):
    n = 2 ** z
    x = (lng + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def fetch(z, x, y, cache):
    p = os.path.join(cache, f'{z}-{x}-{y}.png')
    if not os.path.exists(p):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        with open(p, 'wb') as f:
            f.write(data)
    a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=None)
    args = ap.parse_args()
    cache = args.cache or tempfile.mkdtemp(prefix='terrain-')
    os.makedirs(cache, exist_ok=True)

    # Mosaic covering everything within D1 + HRANGE of the viewpoint.
    reach = D1 + HRANGE
    dlat = reach / 111320.0
    dlng = reach / (111320.0 * math.cos(math.radians(VIEW_LAT)))
    x0, y0 = tile_xy(VIEW_LAT + dlat, VIEW_LNG - dlng, Z)
    x1, y1 = tile_xy(VIEW_LAT - dlat, VIEW_LNG + 0.05, Z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    rows = []
    for ty in range(ty0, ty1 + 1):
        rows.append(np.concatenate([fetch(Z, tx, ty, cache) for tx in range(tx0, tx1 + 1)], axis=1))
        print(f'tiles row {ty - ty0 + 1}/{ty1 - ty0 + 1}', file=sys.stderr)
    H = np.concatenate(rows, axis=0)
    # metres per mosaic pixel at the viewpoint's latitude
    mpp = 156543.03392 * math.cos(math.radians(VIEW_LAT)) / 2 ** Z
    vx, vy = tile_xy(VIEW_LAT, VIEW_LNG, Z)
    vx = (vx - tx0) * 256
    vy = (vy - ty0) * 256

    def sample(px, py):
        """Bilinear elevation at fractional mosaic pixel coords (arrays)."""
        px = np.clip(px, 0, H.shape[1] - 2.001)
        py = np.clip(py, 0, H.shape[0] - 2.001)
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - ix, py - iy
        a = H[iy, ix] * (1 - fx) + H[iy, ix + 1] * fx
        b = H[iy + 1, ix] * (1 - fx) + H[iy + 1, ix + 1] * fx
        return a * (1 - fy) + b * fy

    eye = sample(np.array([vx]), np.array([vy]))[0] + EYE
    print(f'eye elevation {eye:.0f} m', file=sys.stderr)

    # Distances along each ray: fine near, coarser far.
    ds = [D0]
    while ds[-1] < D1:
        ds.append(ds[-1] + max(8.0, ds[-1] * 0.0008))
    ds = np.array(ds)

    normal = np.zeros((NROW, NCOL, 3))
    dist = np.zeros((NROW, NCOL))
    elev = np.zeros((NROW, NCOL))
    mask = np.zeros((NROW, NCOL), dtype=bool)
    hpx = np.zeros((NROW, NCOL))
    hpy = np.zeros((NROW, NCOL))

    row_ang = ANG1 - (np.arange(NROW) + 0.5) / NROW * (ANG1 - ANG0)    # row 0 = top
    for c in range(NCOL):
        az = math.radians(AZ0 + (c + 0.5) / NCOL * (AZ1 - AZ0))
        # mosaic: x east, y south
        px = vx + np.sin(az) * ds / mpp
        py = vy - np.cos(az) * ds / mpp
        h = sample(px, py)
        drop = ds * ds / (2 * R_EARTH) * (1 - K_REFR)
        ang = np.degrees(np.arctan2(h - eye - drop, ds))
        best = -90.0
        for i in range(len(ds)):
            if ang[i] <= best:
                continue
            # rows whose angle lies in (best, ang[i]] see this sample
            sel = (row_ang > best) & (row_ang <= ang[i])
            if sel.any():
                dist[sel, c] = ds[i]
                elev[sel, c] = h[i]
                mask[sel, c] = True
                hpx[sel, c] = px[i]
                hpy[sel, c] = py[i]
            best = ang[i]
        if c % 200 == 0:
            print(f'columns {c}/{NCOL}', file=sys.stderr)

    # Normals from the elevation grid at each visible point (east, north, up).
    e = 1.0
    gx = (sample(hpx + e, hpy) - sample(hpx - e, hpy)) / (2 * e * mpp)
    gy = (sample(hpx, hpy - e) - sample(hpx, hpy + e)) / (2 * e * mpp)   # north is -y
    n = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal[mask] = n[mask]

    # Horizon angle in 8 directions within HRANGE, for cast shadows.
    hz = np.zeros((NROW, NCOL, HDIRS))
    steps = np.concatenate([np.arange(60, 1000, 60), np.arange(1000, HRANGE + 1, 200)])
    base = elev
    for k in range(HDIRS):
        a = math.radians(k * 45)
        best = np.zeros((NROW, NCOL))
        for s in steps:
            hh = sample(hpx + math.sin(a) * s / mpp, hpy - math.cos(a) * s / mpp)
            best = np.maximum(best, np.degrees(np.arctan2(hh - base, s)))
        hz[..., k] = np.where(mask, best, 0)
        print(f'horizon dir {k + 1}/{HDIRS}', file=sys.stderr)

    def u8(v):
        return np.clip(np.round(v), 0, 255).astype(np.uint8)

    b0 = u8(normal * 127.5 + 127.5)
    b0[~mask] = 0
    dcode = np.where(mask, 1 + np.log(np.maximum(dist, D0) / D0) / math.log(D1 / D0) * 254, 0)
    b1 = np.stack([u8(dcode), u8((elev - 1100) / 2400 * 255) * mask, u8(mask * 255)], axis=-1)
    hb = u8(hz / 32 * 255)
    b2 = hb[..., 0:3]
    b3 = hb[..., 3:6]
    b4 = np.concatenate([hb[..., 6:8], np.zeros((NROW, NCOL, 1), np.uint8)], axis=-1)
    atlas = np.concatenate([b0, b1, b2, b3, b4], axis=0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(atlas, 'RGB').save(OUT, optimize=True)
    print(f'wrote {os.path.normpath(OUT)} {atlas.shape[1]}x{atlas.shape[0]}, '
          f'{os.path.getsize(OUT) // 1024} KB; terrain covers {mask.mean() * 100:.0f}% of the panorama',
          file=sys.stderr)


if __name__ == '__main__':
    main()
