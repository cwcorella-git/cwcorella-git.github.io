#!/usr/bin/env python3
"""Bake a mountain panorama from real elevation into a lit-able atlas.

Writes static/garden/terrain.png and terrain.json for Garden.svelte
(src/lib/garden/terrain.ts re-lights it live).

The view is any place on earth: a camera at (lat, lng), some height above the
ground, looking across azimuths az0..az1. Each panorama column is one azimuth,
each row one elevation angle. Along each column a ray is marched outward over
elevation (earth curvature and refraction included); every row gets the first
point the ray meets at or above that angle, and from it:

  - surface normal (true, from the elevation grid),
  - distance (haze, and the step between ridge layers) and elevation (bands),
  - horizon angle in 8 compass directions within 8 km, so the browser can
    cast terrain shadows for any sun without the elevation grid.

The garden does not have to show Reno (operator, 2026-10-22: "it could be
fiction. idc."), so `--score` ranks candidate viewpoints by how layered and
full-width their skyline is, at low resolution, without writing anything.

Elevation: AWS Terrain Tiles (Terrarium encoding, ~76 m/px at z11), public,
no key, cached in --cache.

    python3 scripts/bake-terrain.py --score [--cache DIR]
    python3 scripts/bake-terrain.py --site rigi [--cache DIR] [--out DIR]

Atlas layout (RGB, alpha 255 so canvas premultiplication cannot alter it),
blocks of NCOL x NROW stacked vertically, row 0 = highest angle:
  block 0: normal (east, north, up) * 127.5 + 127.5
  block 1: R = distance (0 = sky; 1..255 log over d0..d1), G = elevation
           (emin..emax over 0..255), B = 255 terrain / 128..223 meadow
           (its dry-patch amount) / 0 sky
  block 2..4: horizon angle (0..32 deg over 0..255), directions
           N, NE, E, SE, S, SW, W, NW in channel order, last channel unused
terrain.json carries ang0/ang1, d0/d1, emin/emax and the region's bands.
"""
import argparse, json, math, os, sys, tempfile, urllib.request
import numpy as np
from PIL import Image

# name: lat, lng, eye metres above ground, centre azimuth, span, bands
#   bands: treeline low/high edge and winter/spring snow line, metres
SITES = {
    'reno-raised': dict(lat=39.5296, lng=-119.8138, eye=800, az=260, span=150,
                        forest=(1750, 2750), snow=(2100, 2500), label='Reno, raised 800 m'),
    'rigi':        dict(lat=47.0566, lng=8.4851, eye=60, az=170, span=150,
                        forest=(600, 1900), snow=(1200, 2200), label='Alps from Rigi'),
    'niederhorn':  dict(lat=46.7104, lng=7.7740, eye=40, az=150, span=140,
                        forest=(700, 1950), snow=(1300, 2300), label='Bernese Alps from Niederhorn'),
    'seceda':      dict(lat=46.6003, lng=11.7240, eye=40, az=150, span=150,
                        forest=(1100, 2150), snow=(1500, 2400), label='Dolomites from Seceda'),
    'sauk':        dict(lat=48.5215, lng=-121.6066, eye=40, az=80, span=150,
                        forest=(300, 1700), snow=(900, 1600), label='North Cascades from Sauk Mtn'),
    'mitchell':    dict(lat=35.7650, lng=-82.2652, eye=40, az=250, span=150,
                        forest=(0, 2100), snow=(1700, 2100), label='Blue Ridge from Mt Mitchell'),
    'shadow':      dict(lat=43.7003, lng=-110.6200, eye=60, az=280, span=140,
                        forest=(2000, 3050), snow=(2300, 2900), label='Tetons from Shadow Mtn'),
    'sierra-east': dict(lat=37.4700, lng=-118.2800, eye=600, az=250, span=150,
                        forest=(2400, 3400), snow=(2700, 3200), label='Sierra from the White Mtns'),
    'pinedale':    dict(lat=42.9000, lng=-109.7600, eye=300, az=60, span=150,
                        forest=(2400, 3300), snow=(2600, 3100), label='Wind Rivers from Pinedale'),
}

D0, D1 = 3.0, 120000.0
R_EARTH, K_REFR = 6371000.0, 0.13
HDIRS, HRANGE = 8, 8000.0
NEAR = 28000.0          # z12 tiles inside this, z11 beyond
EYE = 1.7               # standing on the meadow
MEADOW_R0, MEADOW_R1 = 1400.0, 2400.0
OUTDIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'garden')


def tile_xy(lat, lng, z):
    n = 2 ** z
    return (lng + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


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


class Grid:
    """Elevation mosaic around a viewpoint, sampled in metres east/north of it."""

    def __init__(self, lat, lng, reach, z, cache):
        dlat = reach / 111320.0
        dlng = reach / (111320.0 * math.cos(math.radians(lat)))
        x0, y0 = tile_xy(lat + dlat, lng - dlng, z)
        x1, y1 = tile_xy(lat - dlat, lng + dlng, z)
        self.tx0, self.ty0 = int(x0), int(y0)
        rows = [np.concatenate([fetch(z, tx, ty, cache) for tx in range(int(x0), int(x1) + 1)], axis=1)
                for ty in range(int(y0), int(y1) + 1)]
        self.H = np.concatenate(rows, axis=0)
        self.mpp = 156543.03392 * math.cos(math.radians(lat)) / 2 ** z
        vx, vy = tile_xy(lat, lng, z)
        self.vx, self.vy = (vx - self.tx0) * 256, (vy - self.ty0) * 256

    def at(self, east, north):
        px = np.clip(self.vx + east / self.mpp, 0, self.H.shape[1] - 2.001)
        py = np.clip(self.vy - north / self.mpp, 0, self.H.shape[0] - 2.001)
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - ix, py - iy
        H = self.H
        a = H[iy, ix] * (1 - fx) + H[iy, ix + 1] * fx
        b = H[iy + 1, ix] * (1 - fx) + H[iy + 1, ix + 1] * fx
        return a * (1 - fy) + b * fy


# ── procedural detail below the tiles' resolution ─────────────────────────
def vnoise(x, y):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    ix, iy = ix.astype(np.int64), iy.astype(np.int64)

    def h(a, b):
        v = (a * 374761393 + b * 668265263) & 0xFFFFFFFF
        v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
        return ((v ^ (v >> 16)) & 0xFFFFFF) / 16777216.0
    u, v = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = h(ix, iy), h(ix + 1, iy), h(ix, iy + 1), h(ix + 1, iy + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def octaves(E, N, waves, foot, ridged):
    """Sum of noise octaves (wavelength, amplitude), each faded out as its
    wavelength nears the pixel footprint so distant slopes do not shimmer."""
    s = np.zeros_like(E)
    for i, (lam, amp) in enumerate(waves):
        w = np.clip((lam / np.maximum(foot, 1e-3) - 2) / 2, 0, 1)
        n = vnoise(E / lam + i * 17.3, N / lam - i * 9.1)
        if ridged:
            n = 1 - np.abs(2 * n - 1)
        s += amp * w * (n - 0.5)
    return s


ROCK_WAVES = [(420, 26), (210, 14), (105, 7), (52, 3.5), (26, 1.6)]
MEADOW_WAVES = [(260, 14), (70, 4), (18, 0.3), (5, 0.08), (1.4, 0.025)]


class Land:
    """The heightfield the camera sees: real tiles (z12 near, z11 far), with
    the camera's own ground replaced by a meadow that falls away from it at
    `slope` degrees, so the valleys and the ridges below the viewpoint still
    show over its edge."""

    def __init__(self, site, cache):
        self.near = Grid(site['lat'], site['lng'], NEAR + 1000, 12, cache)
        self.far = Grid(site['lat'], site['lng'], D1 + HRANGE, 11, cache)
        self.g0 = float(self.near.at(np.array([0.0]), np.array([0.0]))[0])
        self.tan = math.tan(math.radians(site.get('slope', 6)))

    def real(self, E, N):
        r = np.hypot(E, N)
        w = np.clip((r - (NEAR - 2000)) / 2000, 0, 1)
        out = self.far.at(E, N)
        nm = w < 1
        if np.any(nm):
            out = np.where(nm, self.near.at(E, N) * (1 - w) + out * w, out)
        return out

    def meadow_w(self, E, N):
        t = np.clip((np.hypot(E, N) - MEADOW_R0) / (MEADOW_R1 - MEADOW_R0), 0, 1)
        return 1 - t * t * (3 - 2 * t)

    def height(self, E, N, foot=None):
        """foot=None: smooth (marching, shadows); else with detail for normals."""
        w = self.meadow_w(E, N)
        r = np.hypot(E, N)
        cone = self.g0 - r * self.tan
        if foot is None:
            cone = cone + octaves(E, N, MEADOW_WAVES[:2], np.full_like(E, 1.0), False)
            return w * cone + (1 - w) * self.real(E, N)
        cone = cone + octaves(E, N, MEADOW_WAVES, foot, False)
        return w * cone + (1 - w) * self.real(E, N)


def march(site, land, ncol, nrow_top, nrow_bot):
    """Per-row visible points for every column. The top rows are linear in
    angle, from the meadow's vanishing line up to the skyline: the mountains,
    drawn above the garden's horizon. The bottom rows are linear in the
    tangent of the angle, from that line down to the meadow 6 m away: a true
    perspective ground plane for the garden's ground band."""
    eye = land.g0 + EYE
    ds = [D0]
    while ds[-1] < D1:
        ds.append(ds[-1] + max(0.4, ds[-1] * 0.0025))
    ds = np.array(ds)
    drop = ds * ds / (2 * R_EARTH) * (1 - K_REFR)
    azs = np.radians(site['az'] - site['span'] / 2 + (np.arange(ncol) + 0.5) / ncol * site['span'])
    E = np.sin(azs)[:, None] * ds[None, :]
    N = np.cos(azs)[:, None] * ds[None, :]
    h = land.height(E, N)
    ang = np.degrees(np.arctan2(h - eye - drop[None, :], ds[None, :]))
    cm = np.maximum.accumulate(ang, axis=1)                  # running skyline per column
    sky = cm[:, -1]
    ang1 = float(np.percentile(sky, 98)) + 0.25
    tan0 = -land.tan                                         # the meadow's vanishing line
    ang0 = math.degrees(math.atan(tan0))
    tan1 = -(land.tan + EYE / 6.0)                           # the meadow 6 m out
    top = ang1 - (np.arange(nrow_top) + 0.5) / nrow_top * (ang1 - ang0)
    bot = np.degrees(np.arctan(tan0 + (np.arange(nrow_bot) + 0.5) / nrow_bot * (tan1 - tan0)))
    row_ang = np.concatenate([top, bot])
    nrow = nrow_top + nrow_bot
    idx = np.empty((nrow, ncol), dtype=int)
    for c in range(ncol):
        idx[:, c] = np.searchsorted(cm[c], row_ang)          # first sample at/above the row's angle
    mask = idx < len(ds)
    ii = np.minimum(idx, len(ds) - 1)
    cols = np.broadcast_to(np.arange(ncol), (nrow, ncol))
    return dict(eye=eye, ang0=ang0, ang1=ang1, tan0=tan0, tan1=tan1, sky=sky, mask=mask,
                dist=ds[ii], east=E[cols, ii], north=N[cols, ii], elev=h[cols, ii])


def score(m):
    mask, dist = m['mask'], np.where(m['mask'], m['dist'], np.nan)
    jumps = np.nansum(np.abs(np.diff(dist, axis=0)) > 3000, axis=0)
    layers = float(np.mean(jumps))
    frame = m['ang1'] - m['ang0']
    fill = float(np.mean(m['sky'] > m['ang0'] + 0.45 * frame))
    relief = float(np.ptp(m['sky']))
    far = float(np.nanmean(np.where(mask, dist, np.nan)) / 1000)
    return layers, fill, relief, far


def bake(name, site, cache, outdir, ncol=1600, nrow_top=280, nrow_bot=160):
    land = Land(site, cache)
    m = march(site, land, ncol, nrow_top, nrow_bot)
    mask = m['mask']
    E, Nn = m['east'], m['north']
    foot = m['dist'] * math.radians(site['span']) / ncol     # metres one column covers there
    e = np.maximum(0.15, foot * 0.6)
    gx = (land.height(E + e, Nn, foot) - land.height(E - e, Nn, foot)) / (2 * e)
    gy = (land.height(E, Nn + e, foot) - land.height(E, Nn - e, foot)) / (2 * e)
    # Gullies and spurs on the rock and forest: ridged noise, strongest on steep
    # ground, so valley floors stay smooth and faces break up.
    steep = np.clip(np.hypot(gx, gy) * 1.6, 0.2, 1.4) * (1 - land.meadow_w(E, Nn))
    ed = np.maximum(e, 6.0)
    gx += steep * (octaves(E + ed, Nn, ROCK_WAVES, foot, True) - octaves(E - ed, Nn, ROCK_WAVES, foot, True)) / (2 * ed)
    gy += steep * (octaves(E, Nn + ed, ROCK_WAVES, foot, True) - octaves(E, Nn - ed, ROCK_WAVES, foot, True)) / (2 * ed)
    n = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    hz = np.zeros(mask.shape + (HDIRS,))
    # The near steps let a meadow swell shade the ground just behind it.
    steps = np.concatenate([[6, 12, 24, 40], np.arange(60, 1000, 60), np.arange(1000, HRANGE + 1, 250)])
    for k in range(HDIRS):
        a = math.radians(k * 45)
        best = np.zeros(mask.shape)
        for s in steps:
            hh = land.height(E + math.sin(a) * s, Nn + math.cos(a) * s)
            best = np.maximum(best, np.degrees(np.arctan2(hh - m['elev'], s)))
        hz[..., k] = np.where(mask, best, 0)
    meadow = land.meadow_w(E, Nn) > 0.5
    emin = float(np.floor(m['elev'][mask].min() / 50) * 50)
    emax = float(np.ceil(m['elev'][mask].max() / 50) * 50)

    def u8(v):
        return np.clip(np.round(v), 0, 255).astype(np.uint8)

    b0 = u8(n * 127.5 + 127.5)
    b0[~mask] = 0
    dcode = np.where(mask, 1 + np.log(np.maximum(m['dist'], D0) / D0) / math.log(D1 / D0) * 254, 0)
    # Meadow colour patches (dry grass vs green), slow noise in ground metres,
    # carried in the meadow's B code: 128..223 = patch 0..1.
    patch = np.clip((0.65 * vnoise(E / 150 + 3.3, Nn / 150 - 1.7) + 0.35 * vnoise(E / 40 - 8.1, Nn / 40 + 2.9) - 0.25) * 2, 0, 1)
    kind = np.where(mask, np.where(meadow, 128 + patch * 95, 255), 0)   # B: 255 terrain, 128..223 meadow, 0 sky
    b1 = np.stack([u8(dcode), u8((m['elev'] - emin) / (emax - emin) * 255) * mask, u8(kind)], axis=-1)
    hb = u8(hz / 32 * 255)
    b4 = np.concatenate([hb[..., 6:8], np.zeros(mask.shape + (1,), np.uint8)], axis=-1)
    atlas = np.concatenate([b0, b1, hb[..., 0:3], hb[..., 3:6], b4], axis=0)
    os.makedirs(outdir, exist_ok=True)
    png = os.path.join(outdir, 'terrain.png')
    Image.fromarray(atlas, 'RGB').save(png, optimize=True)
    meta = dict(site=name, label=site['label'], lat=site['lat'], lng=site['lng'],
                az0=site['az'] - site['span'] / 2, az1=site['az'] + site['span'] / 2,
                ncol=ncol, nrow=nrow_top + nrow_bot, nrowTop=nrow_top,
                ang0=round(m['ang0'], 4), ang1=round(m['ang1'], 4),
                tan0=round(m['tan0'], 5), tan1=round(m['tan1'], 5),
                d0=D0 / 1000, d1=D1 / 1000, emin=emin, emax=emax,
                forest=list(site['forest']), snow=list(site['snow']))
    with open(os.path.join(outdir, 'terrain.json'), 'w') as f:
        json.dump(meta, f, indent='\t')
        f.write('\n')
    print(f'wrote {os.path.normpath(png)} {atlas.shape[1]}x{atlas.shape[0]} '
          f'{os.path.getsize(png) // 1024} KB, frame {m["ang0"]:.2f}..{m["ang1"]:.2f} deg', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--score', action='store_true')
    ap.add_argument('--site', choices=sorted(SITES))
    ap.add_argument('--cache', default=None)
    ap.add_argument('--out', default=OUTDIR)
    args = ap.parse_args()
    cache = args.cache or tempfile.mkdtemp(prefix='terrain-')
    os.makedirs(cache, exist_ok=True)
    if args.score:
        print(f'{"site":12s} {"layers":>6s} {"fill":>5s} {"relief":>6s} {"far km":>6s}')
        for name, site in SITES.items():
            m = march(site, Land(site, cache), 300, 90, 30)
            l, f, r, far = score(m)
            print(f'{name:12s} {l:6.2f} {f:5.2f} {r:6.2f} {far:6.1f}', flush=True)
    elif args.site:
        bake(args.site, SITES[args.site], cache, args.out)
    else:
        ap.error('--score or --site')


if __name__ == '__main__':
    main()
