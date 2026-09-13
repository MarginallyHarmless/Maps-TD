"""Build a local metric scene and conservative walking grid from the frozen OSM extract."""
import json, math, re
from pathlib import Path
from collections import Counter
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point, box, shape
from shapely.ops import transform, unary_union, polygonize
from pyproj import Transformer, CRS
from map_config import ROOT, selected_map
from scenery import building_details, decorative_trees

config = selected_map()
RAW = ROOT / config['rawDirectory']
OUT = ROOT / 'public/data'
OUT.mkdir(parents=True, exist_ok=True)
LAT, LON = config['center']['lat'], config['center']['lon']
SIZE, CELL = config['extent'], 3
clip = box(-SIZE/2, -SIZE/2, SIZE/2, SIZE/2)
proj = Transformer.from_crs('EPSG:4326', CRS.from_proj4(f'+proj=aeqd +lat_0={LAT} +lon_0={LON} +datum=WGS84 +units=m'), always_xy=True)
def project(lon, lat, z=None):
    x, y = proj.transform(lon, lat)
    return x, -y
raw = json.loads((RAW / 'osm.json').read_text())
elements = {(e['type'], e['id']): e for e in raw['elements']}
nodes = {e['id']: project(e['lon'], e['lat']) for e in raw['elements'] if e['type']=='node'}
def polygons(g):
    if g.is_empty: return []
    if g.geom_type=='Polygon': return [g]
    return [p for child in getattr(g,'geoms',[]) for p in polygons(child)]
def lines(g):
    if g.is_empty: return []
    if g.geom_type=='LineString': return [g]
    return [p for child in getattr(g,'geoms',[]) for p in lines(child)]
def geometry(e):
    if e['type']=='way':
        pts = [nodes[n] for n in e.get('nodes',[]) if n in nodes]
        return shapely.make_valid(Polygon(pts)) if len(pts)>3 and pts[0]==pts[-1] else None
    if e['type']=='relation':
        rings = {}
        for role in ['outer','inner']:
            segments=[]
            for m in e.get('members',[]):
                if m['type']=='way' and m.get('role','outer')==role:
                    w=elements.get(('way',m['ref']),{})
                    pts=[nodes[n] for n in w.get('nodes',[]) if n in nodes]
                    if len(pts)>1: segments.append(LineString(pts))
            rings[role]=unary_union(list(polygonize(segments)))
        return shapely.make_valid(rings['outer'].difference(rings['inner']))
    return None
def coords(seq): return [[round(x,2),round(y,2)] for x,y in seq]
def rings(p): return [coords(p.exterior.coords)] + [coords(r.coords) for r in p.interiors]
def number(s, default=0):
    m = re.search(r'\d+(?:\.\d+)?', str(s or ''))
    return float(m[0]) if m else default

buildings=[]; building_geoms=[]; roads=[]; road_geoms=[]; areas=[]; water=[]; trees=[]; passages=[]
widths={'primary':12,'secondary':9,'tertiary':8,'residential':6,'service':4,'living_street':5,'footway':2.5,'pedestrian':4}
for e in raw['elements']:
    t=e.get('tags',{}); ident=f"{e['type']}/{e['id']}"
    if 'building' in t:
        # An obsolete land-use import was retagged as one giant building; not physical geometry.
        if 'CLC:details' in t: continue
        g=geometry(e)
        if g is None: continue
        for idx,p in enumerate(polygons(g.intersection(clip))):
            if p.area<8: continue
            floors=number(t.get('building:levels'))
            measured=number(t.get('height'))
            kind=t['building']
            height=measured or (floors*3.1 if floors else (25 if kind=='apartments' else 7))
            c=p.representative_point()
            buildings.append({'id':ident+f'/{idx}','sourceId':ident,'name':t.get('name') or t.get('addr:street','') + (' '+t.get('addr:housenumber','') if t.get('addr:housenumber') else '') or 'Unnamed building',
                'kind':kind,'height':round(height,1),'heightSource':'height tag' if measured else 'floor count' if floors else 'estimated',
                'floors':floors or None,'area':round(p.area),'center':[round(c.x,2),round(c.y,2)],'rings':rings(p)})
            if t.get('building:facade:material') == 'glass':
                buildings[-1]['facadeMaterial'] = 'glass'
            if t.get('addr:street') and t.get('addr:housenumber'):
                buildings[-1]['address'] = f"{t['addr:street']} {t['addr:housenumber']}"
            building_details(buildings[-1], p, t)
            building_geoms.append(p)
    if 'highway' in t and e['type']=='way':
        pts=[nodes[n] for n in e.get('nodes',[]) if n in nodes]
        if len(pts)<2:continue
        line=LineString(pts)
        width=number(t.get('width'), widths.get(t['highway'],3))
        width=max(1.5,min(width,24))
        for part in lines(line.intersection(clip)):
            roads.append({'id':ident,'name':t.get('name',''),'kind':t['highway'],'width':width,'points':coords(part.coords),'passage':t.get('tunnel')=='building_passage'})
            roads[-1].update({key:t[key] for key in ['lanes','surface','sidewalk','oneway','junction'] if key in t})
            road_geoms.append(part.buffer(width/2))
            if t.get('tunnel')=='building_passage': passages.append(part.buffer(width/2))
    if (t.get('landuse') in ['grass','forest','meadow'] or t.get('leisure') in ['park','garden','playground','common'] or t.get('natural') in ['water','wood'] or 'water' in t):
        g=geometry(e)
        if g is not None:
            for p in polygons(g.intersection(clip)):
                iswater=t.get('natural')=='water' or 'water' in t
                areas.append({'kind':'water' if iswater else 'playground' if t.get('leisure')=='playground' else 'green','rings':rings(p),'landcover':t.get('leisure') or t.get('landuse') or t.get('natural')})
                if iswater:water.append(p)
    if t.get('natural')=='tree' and e['type']=='node':
        p=Point(nodes[e['id']])
        if clip.contains(p): trees.append({'point':coords([p.coords[0]])[0],'height':min(14,max(3,number(t.get('height'),6)))})

# Clearance includes the cell's circumradius, so straight segments between adjacent
# cell centers cannot graze a footprint. Mapped passages cut actual openings.
solid=unary_union(building_geoms)
passage_union=unary_union(passages)
solid=solid.difference(passage_union)
obstacles=unary_union([solid,*water]).buffer(CELL*math.sqrt(2)/2+0.35)
n=SIZE//CELL
axis=np.arange(n)*CELL-SIZE/2+CELL/2
xx,yy=np.meshgrid(axis,axis)
points=shapely.points(xx.ravel(),yy.ravel())
blocked=shapely.intersects(obstacles,points)
onroad=shapely.intersects(unary_union(road_geoms),points)
cost=np.where(blocked,0,np.where(onroad,1,5)).astype(int)
grid={'size':n,'cell':CELL,'origin':[-SIZE/2,-SIZE/2],'cost':cost.tolist()}

# Adjacent exterior cells are possible inferred entrances, never a building centroid.
for b,g in zip(buildings,building_geoms):
    candidates=[]
    outer=g.buffer(CELL*2.0).exterior if g.buffer(CELL*2.0).geom_type=='Polygon' else g.exterior
    for d in np.linspace(0,outer.length,48,endpoint=False):
        p=outer.interpolate(d)
        x=int((p.x+SIZE/2)//CELL);y=int((p.y+SIZE/2)//CELL)
        if 0<=x<n and 0<=y<n and cost[y*n+x]>0:
            candidates.append(y*n+x)
    b['entrances']=list(dict.fromkeys(candidates))

# Spawn at road cells just inside the extract boundary, spread across four sides.
spawns=[]
for side in ['west','north','east','south']:
    cells=[]
    for i in range(3,n-3):
        x,y={'west':(2,i),'east':(n-3,i),'north':(i,2),'south':(i,n-3)}[side]
        if cost[y*n+x]==1: cells.append(y*n+x)
    if cells:
        chosen=min(cells,key=lambda idx:abs((idx//n if side in ['west','east'] else idx%n)-n/2))
        cx, cy = chosen % n, chosen // n
        spawn_point = Point(axis[cx], axis[cy])
        nearby = min(roads, key=lambda road: LineString(road['points']).distance(spawn_point))
        spawns.append({'side':side,'cell':chosen,'roadName':nearby['name'] or ('Park paths' if nearby['kind']=='footway' else 'Neighborhood streets')})

generated_trees=decorative_trees(config['id'],areas,building_geoms,roads,trees,clip)
stats={'buildings':len(buildings),'roads':len(roads),'trees':len(trees),'heightSources':dict(Counter(b['heightSource'] for b in buildings)),
    'decorativeTrees':len(generated_trees),'pitchedRoofs':sum(bool(b['roof'].get('vertices')) for b in buildings),
    'mappedPassages':len(passages),'navigableCells':int(np.count_nonzero(cost))}
comparison={'osm':stats,'overture':None}
ovpath=RAW/'overture.geojson'
if ovpath.exists() and ovpath.stat().st_size>0:
    ov=json.loads(ovpath.read_text()); ovs=[]
    for f in ov['features']:
        g=shapely.make_valid(transform(project,shape(f['geometry']))).intersection(clip)
        if not g.is_empty and g.area>=8: ovs.append((f,g))
    comparison['overture']={'buildings':len(ovs),'withHeight':sum(bool(f['properties'].get('height')) for f,g in ovs),
      'withFloors':sum(bool(f['properties'].get('num_floors')) for f,g in ovs),
      'mostlyUnmatched':sum(g.intersection(unary_union(building_geoms)).area/g.area<0.2 for f,g in ovs),
      'sourceDatasets':dict(Counter(s.get('dataset','unknown') for f,g in ovs for s in (f['properties'].get('sources') or [])))}
level={'id':config['id'],'name':config['name'],'city':config['city'],'center':{'lat':LAT,'lon':LON},'extent':SIZE,
  'version':2,'timestamp':raw['osm3s']['timestamp_osm_base'],'buildings':buildings,'roads':roads,'areas':areas,'trees':trees,'decorativeTrees':generated_trees,
  'grid':grid,'spawns':spawns,'stats':stats,'attribution':'© OpenStreetMap contributors · ODbL 1.0',
  'assumptions':['Flat terrain','Height from tagged floors at 3.1 m per floor, otherwise a type default','Road widths use defaults where missing','Entrance positions inferred; open ground walkable','Pedestrian movement ignores vehicle one-way rules','Roof rise, facade detail, rooftop equipment and park infill trees are procedural unless explicitly sourced','Decorative trees are hidden beside the active route and towers; navigation is unchanged']}
(OUT/f"{config['id']}.json").write_text(json.dumps(level,separators=(',',':'),ensure_ascii=False))
(ROOT/config['comparisonFile']).write_text(json.dumps(comparison,indent=2))
print(json.dumps(comparison,indent=2))
print('Spawns:',spawns)
