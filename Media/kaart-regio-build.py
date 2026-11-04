import json, math, sys
t = json.load(open(sys.argv[1]))
sx, sy = t['transform']['scale']; tx, ty = t['transform']['translate']
arcs = []
for a in t['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy
        pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)

# projectie + uitsnede (moet gelijk zijn aan MAP_VIEW in app.js)
LON0, LON1, LAT0, LAT1 = 2.95, 4.75, 50.66, 51.42
K = 1000 / ((LON1 - LON0) * math.cos(math.radians(51)))
W = 1000; H = round((LAT1 - LAT0) * K)
def P(lon, lat): return ((lon - LON0) * math.cos(math.radians(51)) * K, (LAT1 - lat) * K)

def simplify(pts, tol=0.6):
    # Douglas-Peucker op geprojecteerde punten
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        if a == b: d = math.hypot(px - a[0], py - a[1])
        else:
            d = abs((b[0]-a[0])*(a[1]-py) - (a[0]-px)*(b[1]-a[1])) / math.hypot(b[0]-a[0], b[1]-a[1])
        if d > dmax: dmax, idx = d, i
    if dmax > tol:
        return simplify(pts[:idx+1], tol)[:-1] + simplify(pts[idx:], tol)
    return [a, b]

proj = [simplify([P(*p) for p in a]) for a in arcs]
def visible(pts): return any(-60 < x < W + 60 and -60 < y < H + 60 for x, y in pts)
def line(pts): return 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)

def ring(idx_list):
    out = []
    for i in idx_list:
        pts = proj[i] if i >= 0 else proj[~i][::-1]
        out.extend(pts if not out else pts[1:])
    return out

def geom_rings(g):
    if g['type'] == 'Polygon': return g['arcs']
    if g['type'] == 'MultiPolygon': return [r for poly in g['arcs'] for r in poly]
    return []

def used_arcs(obj):
    s = set()
    for g in obj['geometries']:
        for r in geom_rings(g):
            for i in r: s.add(i if i >= 0 else ~i)
    return s

# land: provincies (en Brussel) als vlakken
land, ov = [], []
for g in t['objects']['provinces']['geometries']:
    d = ''.join(line(ring(r)) + 'Z' for r in geom_rings(g))
    (ov if g['properties'].get('nis') == '40000' else land).append(d)
bru = [g for g in t['objects']['municipalities']['geometries'] if g['properties'].get('reg_nis') == '04000']
for g in bru: land.append(''.join(line(ring(r)) + 'Z' for r in geom_rings(g)))

# grenzen: gemeentes (dun), provincies (dikker)
prov_arcs = used_arcs(t['objects']['provinces'])
# buitengrens = arcs die slechts één keer voorkomen in provincies
count = {}
for g in t['objects']['provinces']['geometries']:
    for r in geom_rings(g):
        for i in r: count[i if i >= 0 else ~i] = count.get(i if i >= 0 else ~i, 0) + 1
muni = [i for i in used_arcs(t['objects']['municipalities']) if i not in prov_arcs and visible(proj[i])]
prov = [i for i in prov_arcs if count[i] > 1 and visible(proj[i])]
outer = [i for i in prov_arcs if count[i] == 1 and visible(proj[i])]

labels = [('GENT', 3.725, 51.0538), ('AALST', 4.0392, 50.9383), ('ANTWERPEN', 4.3997, 51.2211),
          ('BRUSSEL', 4.3525, 50.8467), ('BRUGGE', 3.2268, 51.2086), ('DENDERMONDE', 4.10, 51.028)]
lab = ''.join(f'<text x="{P(lo,la)[0]+10:.0f}" y="{P(lo,la)[1]-10:.0f}">{n}</text>' for n, lo, la in labels)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<!-- Grenzen: Statbel via github.com/bmesuere/belgium-topojson (CC0), toestand 01/01/2025 -->
<rect width="{W}" height="{H}" fill="#0b0c10"/>
<path d="{''.join(land)}" fill="#121318"/>
<path d="{''.join(ov)}" fill="#151a26"/>
<path d="{''.join(line(proj[i]) for i in muni)}" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="0.7"/>
<path d="{''.join(line(proj[i]) for i in prov)}" fill="none" stroke="#2873f2" stroke-opacity="0.35" stroke-width="1.2"/>
<path d="{''.join(line(proj[i]) for i in outer)}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.2"/>
<g font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="13" letter-spacing="2" fill="#ffffff" fill-opacity="0.28">{lab}</g>
</svg>'''
open(sys.argv[2], 'w').write(svg)
print(W, H, round(K, 3), len(svg) // 1024, 'KB')
