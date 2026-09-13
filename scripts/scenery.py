"""Deterministic visual detail. Geometry/height evidence is separate from inferred styling."""
import hashlib
import math
import random

import shapely
from shapely import affinity
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import split, unary_union


def stable_seed(text):
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], 'big')


def building_details(building, footprint, tags):
    rng = random.Random(stable_seed(building['id']))
    tagged = tags.get('roof:shape')
    roof_shape = tagged or ('hipped' if building['height'] <= 14 and footprint.area < 400 and not footprint.interiors and rng.random() < .65 else 'flat')
    detail = {'shape': roof_shape, 'source': 'OSM roof:shape' if tagged else 'procedural', 'heightSource': 'inferred'}
    building['roof'] = detail
    for key, target in [('roof:colour', 'color'), ('roof:material', 'material')]:
        if tags.get(key): detail[target] = tags[key]
    for key, target in [('building:colour', 'facadeColor'), ('building:material', 'facadeMaterial')]:
        if tags.get(key): building[target] = tags[key]
    if roof_shape not in ['gabled', 'hipped', 'skillion']:
        detail['renderedShape'] = 'flat'
        building['wallHeight'] = building['height']
        center=Point(building['center'])
        if footprint.buffer(-2.5).contains(center) and building['height'] > 10:
            building['roofEquipment'] = building['center']
        return
    rect = list(footprint.minimum_rotated_rectangle.exterior.coords)
    edges = [(math.dist(rect[i], rect[i+1]), rect[i], rect[i+1]) for i in range(4)]
    length, a, b = max(edges)
    angle = math.degrees(math.atan2(b[1]-a[1], b[0]-a[0]))
    origin = (footprint.centroid.x, footprint.centroid.y)
    local = affinity.rotate(footprint, -angle, origin=origin)
    xmin, ymin, xmax, ymax = local.bounds
    width = ymax-ymin
    rise = min(4.5, width*.3, building['height']*.35)
    building['wallHeight'] = round(building['height']-rise, 2)
    detail.update({'renderedShape': roof_shape, 'rise': round(rise, 2)})
    # Split the footprint at each change in roof slope before constrained triangulation.
    # This preserves courtyards and concave outlines rather than filling their convex hull.
    cx, cy = (xmin+xmax)/2, (ymin+ymax)/2
    cutters = [LineString([(xmin-100, cy), (xmax+100, cy)])]
    if roof_shape == 'hipped':
        cutters += [LineString([(xmin, ymin), (xmin+width/2, cy), (xmin, ymax)]),
                    LineString([(xmax, ymin), (xmax-width/2, cy), (xmax, ymax)])]
    pieces = [local]
    for cutter in cutters:
        pieces = [part for piece in pieces for part in split(piece, cutter).geoms if part.area > .001]
    def roof_y(x, z):
        if roof_shape == 'skillion': f = (z-ymin)/width
        else:
            f = min(z-ymin, ymax-z)/(width/2)
            if roof_shape == 'hipped': f = min(f, (x-xmin)/(width/2), (xmax-x)/(width/2))
        return building['wallHeight'] + rise*max(0, min(1, f))
    vertices = []
    for piece in pieces:
        for triangle in shapely.constrained_delaunay_triangles(piece).geoms:
            original = affinity.rotate(triangle, angle, origin=origin)
            for (x, z), (ox, oz) in zip(list(triangle.exterior.coords)[:3], list(original.exterior.coords)[:3]):
                vertices.append([round(ox, 3), round(roof_y(x,z),3), round(oz,3)])
    detail['vertices'] = vertices
    # Vertical infill between eaves and the roof (gables / the high side of a shed roof).
    infill = []
    for ring in [local.exterior, *local.interiors]:
        for start, end in zip(ring.coords, list(ring.coords)[1:]):
            cuts = [0,1]
            if (start[1]-cy)*(end[1]-cy) < 0: cuts.append((cy-start[1])/(end[1]-start[1]))
            cuts.sort()
            for t0,t1 in zip(cuts,cuts[1:]):
                points = [(start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t) for t in [t0,t1]]
                a,b = [affinity.rotate(Point(p), angle, origin=origin) for p in points]
                lo=building['wallHeight']; ha,hb=[roof_y(*p) for p in points]
                infill.extend([[a.x,lo,a.y],[b.x,lo,b.y],[b.x,hb,b.y],[a.x,lo,a.y],[b.x,hb,b.y],[a.x,ha,a.y]])
    detail['infill'] = [[round(v,3) for v in p] for p in infill]


def decorative_trees(map_id, areas, buildings, roads, mapped_trees, clip):
    greens = [Polygon(a['rings'][0], a['rings'][1:]) for a in areas if a.get('landcover') in ['park','garden','forest','wood']]
    if not greens: return []
    green = unary_union(greens).buffer(-5).intersection(clip.buffer(-5))
    # Dense surveyed tree coverage needs no generated planting.
    mapped = [Point(t['point']) for t in mapped_trees]
    if sum(green.contains(p) for p in mapped) > green.area/500: return []
    exclusions = [g.buffer(5) for g in buildings]
    exclusions += [LineString(r['points']).buffer(r['width']/2+5) for r in roads]
    exclusions += [p.buffer(6) for p in mapped]
    exclusions += [Polygon(a['rings'][0],a['rings'][1:]).buffer(4) for a in areas if a['kind'] in ['water','playground']]
    safe = green.difference(unary_union(exclusions))
    rng = random.Random(stable_seed(map_id))
    result=[]
    # Jittered planting avoids a regular orchard appearance; locations are synthetic.
    for x in range(-290,291,11):
        for z in range(-290,291,11):
            p=Point(x+rng.uniform(-3.4,3.4),z+rng.uniform(-3.4,3.4))
            if safe.contains(p) and rng.random() < .85:
                result.append({'point':[round(p.x,2),round(p.y,2)],'height':round(rng.uniform(6,12),1),'source':'procedural'})
    return result
